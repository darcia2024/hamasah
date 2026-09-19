const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresAccountStore } = require('./postgres-account-store.js');

const CREATED_AT = '2026-09-15T00:00:00.000Z';

async function run() {
  const database = await createTestDatabase();
  try {
    const store = createPostgresAccountStore({ database });
    assert.equal(await store.count(), 0);

    const account = {
      id: crypto.randomUUID(),
      email: 'admin@hamasah.test',
      name: 'Admin Uji',
      role: 'admin',
      active: true,
      passwordHash: 'scrypt$garam-uji$hash-uji',
      resetTokenHash: null,
      resetExpiresAt: null,
      invitationTokenHash: null,
      invitationExpiresAt: null,
      invitedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    };
    const saved = await store.save(account);
    assert.deepEqual(saved, account);
    assert.equal(await store.count(), 1);

    assert.equal((await store.getByEmail('admin@hamasah.test')).id, account.id);
    assert.equal(await store.getByEmail('tidak-ada@hamasah.test'), null);
    assert.equal((await store.getById(account.id)).role, 'admin');
    assert.equal(await store.getById(crypto.randomUUID()), null);

    // Menyimpan ulang akun yang sama memperbarui baris, tidak membuat baris baru.
    const updated = await store.save({
      ...account,
      name: 'Admin Hamasah',
      resetTokenHash: 'hash-reset-uji',
      resetExpiresAt: '2026-09-15T00:30:00.000Z',
      updatedAt: '2026-09-15T00:10:00.000Z'
    });
    assert.equal(updated.name, 'Admin Hamasah');
    assert.equal(updated.resetExpiresAt, '2026-09-15T00:30:00.000Z');
    assert.equal(updated.createdAt, CREATED_AT);
    assert.equal(await store.count(), 1);
    assert.deepEqual((await store.list()).map((entry) => entry.email), ['admin@hamasah.test']);

    console.log('postgres account store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
