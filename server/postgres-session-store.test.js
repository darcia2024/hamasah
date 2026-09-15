const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresAccountStore } = require('./postgres-account-store.js');
const { createPostgresSessionStore } = require('./postgres-session-store.js');

async function run() {
  const database = await createTestDatabase();
  try {
    const accounts = createPostgresAccountStore({ database });
    const sessions = createPostgresSessionStore({ database });
    const accountId = crypto.randomUUID();
    await accounts.save({
      id: accountId,
      email: 'wali@hamasah.test',
      name: 'Wali Uji',
      role: 'parent',
      active: true,
      passwordHash: 'scrypt$garam-uji$hash-uji',
      resetTokenHash: null,
      resetExpiresAt: null,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z'
    });

    assert.equal(await sessions.get('hash-tidak-ada'), null);

    await sessions.save({ tokenHash: 'hash-sesi-uji', accountId, expiresAt: '2026-09-15T12:00:00.000Z' });
    assert.deepEqual(await sessions.get('hash-sesi-uji'), {
      tokenHash: 'hash-sesi-uji',
      accountId,
      expiresAt: '2026-09-15T12:00:00.000Z'
    });

    // Menyimpan ulang token yang sama memperbarui masa berlaku.
    await sessions.save({ tokenHash: 'hash-sesi-uji', accountId, expiresAt: '2026-09-16T00:00:00.000Z' });
    assert.equal((await sessions.get('hash-sesi-uji')).expiresAt, '2026-09-16T00:00:00.000Z');

    await sessions.remove('hash-sesi-uji');
    assert.equal(await sessions.get('hash-sesi-uji'), null);

    console.log('postgres session store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
