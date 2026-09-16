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

    await sessions.save({
      tokenHash: 'hash-sesi-uji', accountId,
      expiresAt: '2026-09-15T12:00:00.000Z', lastSeenAt: '2026-09-15T00:00:00.000Z'
    });
    assert.deepEqual(await sessions.get('hash-sesi-uji'), {
      tokenHash: 'hash-sesi-uji',
      accountId,
      expiresAt: '2026-09-15T12:00:00.000Z',
      lastSeenAt: '2026-09-15T00:00:00.000Z'
    });

    // Menyimpan ulang token yang sama memperbarui masa berlaku.
    await sessions.save({ tokenHash: 'hash-sesi-uji', accountId, expiresAt: '2026-09-16T00:00:00.000Z' });
    assert.equal((await sessions.get('hash-sesi-uji')).expiresAt, '2026-09-16T00:00:00.000Z');

    // touch memperpanjang sesi tanpa menulis ulang seluruh barisnya.
    await sessions.touch('hash-sesi-uji', { expiresAt: '2026-10-16T00:00:00.000Z', lastSeenAt: '2026-09-16T08:00:00.000Z' });
    const diperpanjang = await sessions.get('hash-sesi-uji');
    assert.equal(diperpanjang.expiresAt, '2026-10-16T00:00:00.000Z');
    assert.equal(diperpanjang.lastSeenAt, '2026-09-16T08:00:00.000Z');
    assert.equal(diperpanjang.accountId, accountId, 'touch tidak boleh mengubah pemilik sesi.');

    await sessions.remove('hash-sesi-uji');
    assert.equal(await sessions.get('hash-sesi-uji'), null);

    // Mencabut seluruh sesi satu akun, dipakai saat perangkat hilang dan saat akun
    // dinonaktifkan.
    const akunLain = crypto.randomUUID();
    await accounts.save({
      id: akunLain, email: 'santri@hamasah.test', name: 'Santri Uji', role: 'student', active: true,
      passwordHash: 'scrypt$garam-uji$hash-uji', resetTokenHash: null, resetExpiresAt: null,
      createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z'
    });
    await sessions.save({ tokenHash: 'sesi-hp', accountId, expiresAt: '2026-10-16T00:00:00.000Z' });
    await sessions.save({ tokenHash: 'sesi-laptop', accountId, expiresAt: '2026-10-16T00:00:00.000Z' });
    await sessions.save({ tokenHash: 'sesi-akun-lain', accountId: akunLain, expiresAt: '2026-10-16T00:00:00.000Z' });
    assert.equal(await sessions.removeForAccount(accountId), 2);
    assert.equal(await sessions.get('sesi-hp'), null);
    assert.ok(await sessions.get('sesi-akun-lain'), 'Sesi akun lain tidak boleh ikut tercabut.');

    // Pembersihan sesi kedaluwarsa.
    await sessions.save({ tokenHash: 'sesi-lama', accountId, expiresAt: '2026-01-01T00:00:00.000Z' });
    assert.equal(await sessions.removeExpired('2026-09-16T00:00:00.000Z'), 1);
    assert.equal(await sessions.get('sesi-lama'), null);
    assert.ok(await sessions.get('sesi-akun-lain'), 'Sesi yang masih berlaku tidak ikut dihapus.');

    console.log('postgres session store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
