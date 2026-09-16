const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresAuditStore } = require('./postgres-audit-store.js');
const { ACTIONS, createAuditService } = require('./audit-service.js');

async function insertAccount(database, name, email, role) {
  const id = crypto.randomUUID();
  await database.query(
    'INSERT INTO accounts (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)',
    [id, email, name, role, 'hash-uji']
  );
  return id;
}

async function run() {
  const database = await createTestDatabase();
  try {
    const store = createPostgresAuditStore({ database });
    const adminId = await insertAccount(database, 'Admin Uji', 'admin.audit@hamasah.test', 'admin');
    const petugasId = await insertAccount(database, 'Petugas Uji', 'petugas.audit@hamasah.test', 'registration-officer');

    const kosong = await store.list({});
    assert.deepEqual(kosong.items, []);
    assert.equal(kosong.total, 0);

    const audit = createAuditService({ store, ipHashSecret: 'kunci-uji-yang-cukup-panjang-sekali' });
    async function catat(action, actorId, actorRole, occurredAt, extra = {}) {
      await store.insert({
        id: crypto.randomUUID(),
        occurredAt,
        actorAccountId: actorId,
        actorRole,
        action,
        entityType: extra.entityType || null,
        entityId: extra.entityId || null,
        ipHash: 'a'.repeat(64),
        metadata: extra.metadata || {}
      });
    }

    await catat(ACTIONS.LOGIN_SUCCESS, adminId, 'admin', '2026-09-10T08:00:00.000Z');
    await catat(ACTIONS.LOGIN_FAILED, null, null, '2026-09-11T08:00:00.000Z', { metadata: { email: 'salah@contoh.test' } });
    await catat(ACTIONS.REGISTRATION_STATUS_CHANGED, petugasId, 'registration-officer', '2026-09-12T08:00:00.000Z', {
      entityType: 'registration', entityId: 'HI-REG-2026-00001', metadata: { status: 'document-review' }
    });
    await catat(ACTIONS.INVOICE_PAID, adminId, 'admin', '2026-09-13T08:00:00.000Z', {
      entityType: 'invoice', entityId: 'inv-1', metadata: { number: 'INV/HI/2026/00001', amount: 1500000 }
    });

    // Urutan terbaru lebih dulu, dan nama pelaku ikut dibaca dari tabel akun.
    const semua = await store.list({});
    assert.equal(semua.total, 4);
    assert.deepEqual(semua.items.map((event) => event.action), [
      'invoice.paid', 'registration.status-changed', 'auth.login.failed', 'auth.login.success'
    ]);
    assert.equal(semua.items[0].actorName, 'Admin Uji');
    assert.equal(semua.items[1].actorName, 'Petugas Uji');
    assert.equal(semua.items[2].actorName, null, 'Login gagal memang belum punya pelaku.');
    assert.deepEqual(semua.items[0].metadata, { number: 'INV/HI/2026/00001', amount: 1500000 });

    // ip_hash tidak pernah ikut keluar: tidak berguna dibaca manusia, dan hanya
    // menambah risiko kalau layar audit bocor.
    assert.equal('ipHash' in semua.items[0], false);
    assert.equal(JSON.stringify(semua.items).includes('a'.repeat(64)), false);

    // Penyaringan.
    assert.equal((await store.list({ action: 'auth.login.failed' })).total, 1);
    assert.equal((await store.list({ actorAccountId: adminId })).total, 2);
    assert.equal((await store.list({ from: '2026-09-12T00:00:00.000Z' })).total, 2);
    assert.equal((await store.list({ to: '2026-09-11T23:59:59.000Z' })).total, 2);
    assert.equal((await store.list({ from: '2026-09-11T00:00:00.000Z', to: '2026-09-12T23:59:59.000Z' })).total, 2);
    assert.equal((await store.list({ actorAccountId: adminId, action: 'invoice.paid' })).total, 1);

    // Paginasi: total tetap jumlah seluruh baris yang cocok, bukan jumlah di halaman ini.
    const halaman = await store.list({ limit: 2, offset: 0 });
    assert.equal(halaman.items.length, 2);
    assert.equal(halaman.total, 4);
    assert.equal(halaman.limit, 2);
    const halamanKedua = await store.list({ limit: 2, offset: 2 });
    assert.deepEqual(halamanKedua.items.map((event) => event.action), ['auth.login.failed', 'auth.login.success']);
    // Batas atas dijaga supaya satu permintaan tidak bisa menarik seluruh tabel.
    assert.equal((await store.list({ limit: 5000 })).limit, 100);

    // Retensi lewat service.
    assert.equal(await audit.purgeOlderThan(1), 4, 'Seluruh catatan uji lebih tua dari satu hari.');
    assert.equal((await store.list({})).total, 0);

    // Akun pelaku yang dihapus tidak ikut menghapus catatannya.
    await catat(ACTIONS.ACCOUNT_CREATED, petugasId, 'registration-officer', new Date().toISOString());
    await database.query('DELETE FROM accounts WHERE id = $1', [petugasId]);
    const setelahHapus = await store.list({});
    assert.equal(setelahHapus.total, 1, 'Catatan audit bertahan walau akun pelakunya dihapus.');
    assert.equal(setelahHapus.items[0].actorAccountId, null);
    assert.equal(setelahHapus.items[0].actorRole, 'registration-officer', 'Peran pelaku tetap tersimpan sebagai teks.');

    console.log('postgres audit store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
