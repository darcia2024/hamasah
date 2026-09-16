// Durasi sesi per role (keputusan K17), perpanjangan sesi wali dan santri,
// pencabutan sesi, dan pembersihan sesi kedaluwarsa.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const identity = require('./identity-service.js');
const { SESSION_TTL_MS, TOUCH_INTERVAL_MS, sessionTtlFor } = identity;

const JAM = 60 * 60 * 1000;
const HARI = 24 * JAM;
const KATA_SANDI = 'kata-sandi-sesi-uji';

// Sama dengan hashSecret di identity-service: sesi disimpan dengan kunci hash token.
function hashOf(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function layanan(jam) {
  const accountStore = identity.createMemoryAccountStore();
  const sessionStore = identity.createMemorySessionStore();
  const service = identity.createIdentityService({ accountStore, sessionStore, now: () => new Date(jam.sekarang) });
  return { accountStore, sessionStore, service };
}

async function run() {
  // Nilai yang diputuskan pemilik pada 16 Sep 2026.
  assert.equal(SESSION_TTL_MS.admin, 12 * JAM);
  assert.equal(SESSION_TTL_MS['registration-officer'], 12 * JAM);
  assert.equal(SESSION_TTL_MS.supervisor, 12 * JAM);
  assert.equal(SESSION_TTL_MS.teacher, 12 * JAM);
  assert.equal(SESSION_TTL_MS.finance, 12 * JAM);
  assert.equal(SESSION_TTL_MS.parent, 30 * HARI);
  assert.equal(SESSION_TTL_MS.student, 30 * HARI);
  // Role tidak dikenal jatuh ke durasi terpendek, bukan terpanjang.
  assert.equal(sessionTtlFor('role-karangan'), 12 * JAM);

  const jam = { sekarang: Date.parse('2026-09-16T08:00:00.000Z') };
  const { accountStore, sessionStore, service } = layanan(jam);
  const admin = { id: 'admin-1', role: 'admin' };

  async function buatAkun(email, role) {
    const dibuat = await service.createAccount({ name: `Akun ${role}`, email, role, password: KATA_SANDI });
    assert.equal(dibuat.ok, true, JSON.stringify(dibuat));
    return dibuat.value;
  }
  const akunAdmin = await buatAkun('admin@hamasah.test', 'admin');
  const akunWali = await buatAkun('wali@hamasah.test', 'parent');

  // --- Durasi berbeda per role ---
  const sesiAdmin = await service.login('admin@hamasah.test', KATA_SANDI);
  const sesiWali = await service.login('wali@hamasah.test', KATA_SANDI);
  assert.equal(sesiAdmin.ok, true);
  assert.equal(sesiWali.ok, true);

  const hashAdmin = hashOf(sesiAdmin.value.accessToken);
  const sesiAdminTersimpan = sessionStore.get(hashAdmin);
  assert.ok(sesiAdminTersimpan, 'Sesi admin tersimpan.');
  assert.equal(
    Date.parse(sesiAdminTersimpan.expiresAt) - jam.sekarang,
    12 * JAM,
    'Sesi staf berlaku 12 jam.'
  );

  const hashWali = hashOf(sesiWali.value.accessToken);
  assert.equal(Date.parse(sessionStore.get(hashWali).expiresAt) - jam.sekarang, 30 * HARI, 'Sesi wali berlaku 30 hari.');

  // --- Sesi staf tidak diperpanjang ---
  const kedaluwarsaAdminAwal = sesiAdminTersimpan.expiresAt;
  jam.sekarang += 6 * JAM;
  assert.equal((await service.authenticate(sesiAdmin.value.accessToken)).ok, true);
  assert.equal(
    sessionStore.get(hashAdmin).expiresAt,
    kedaluwarsaAdminAwal,
    'Sesi staf sengaja tidak diperpanjang: akun staf memegang data banyak orang.'
  );

  // Setelah 12 jam, sesi staf berakhir.
  jam.sekarang += 7 * JAM;
  const sesiHabis = await service.authenticate(sesiAdmin.value.accessToken);
  assert.equal(sesiHabis.ok, false);
  assert.match(sesiHabis.error, /berakhir/);

  // --- Sesi wali diperpanjang selama masih dipakai ---
  const kedaluwarsaWaliAwal = sessionStore.get(hashWali).expiresAt;
  assert.equal((await service.authenticate(sesiWali.value.accessToken)).ok, true);
  const setelahDipakai = sessionStore.get(hashWali).expiresAt;
  assert.notEqual(setelahDipakai, kedaluwarsaWaliAwal, 'Sesi wali diperpanjang saat dipakai.');
  assert.equal(Date.parse(setelahDipakai) - jam.sekarang, 30 * HARI);

  // Perpanjangan dibatasi sekali per 15 menit, supaya membuka halaman tidak berarti
  // menulis ke database setiap kali.
  jam.sekarang += TOUCH_INTERVAL_MS - 1000;
  await service.authenticate(sesiWali.value.accessToken);
  assert.equal(sessionStore.get(hashWali).expiresAt, setelahDipakai, 'Belum 15 menit, belum ditulis ulang.');
  jam.sekarang += 2000;
  await service.authenticate(sesiWali.value.accessToken);
  assert.notEqual(sessionStore.get(hashWali).expiresAt, setelahDipakai, 'Setelah 15 menit, ditulis ulang.');

  // Sesi wali yang ditinggalkan lebih dari 30 hari tetap berakhir.
  jam.sekarang += 31 * HARI;
  assert.equal((await service.authenticate(sesiWali.value.accessToken)).ok, false);

  // --- Mencabut seluruh sesi satu akun ---
  const hp = await service.login('wali@hamasah.test', KATA_SANDI);
  const laptop = await service.login('wali@hamasah.test', KATA_SANDI);
  assert.equal((await service.authenticate(hp.value.accessToken)).ok, true);
  assert.equal((await service.authenticate(laptop.value.accessToken)).ok, true);
  assert.equal(await service.logoutAll(akunWali.id), 2);
  assert.equal((await service.authenticate(hp.value.accessToken)).ok, false);
  assert.equal((await service.authenticate(laptop.value.accessToken)).ok, false);

  // --- Menonaktifkan akun langsung mencabut sesinya ---
  const sesiSebelumNonaktif = await service.login('wali@hamasah.test', KATA_SANDI);
  assert.equal((await service.authenticate(sesiSebelumNonaktif.value.accessToken)).ok, true);
  const dinonaktifkan = await service.setAccountActive(akunWali.id, false, admin);
  assert.equal(dinonaktifkan.ok, true);
  assert.equal(dinonaktifkan.value.account.active, false);
  assert.equal(dinonaktifkan.value.sessionsRevoked, 1, 'Sesi ikut dicabut, bukan menunggu kedaluwarsa sendiri.');
  assert.equal((await service.authenticate(sesiSebelumNonaktif.value.accessToken)).ok, false);
  assert.equal((await service.login('wali@hamasah.test', KATA_SANDI)).ok, false, 'Akun nonaktif tidak bisa masuk lagi.');

  // Diaktifkan kembali.
  assert.equal((await service.setAccountActive(akunWali.id, true, admin)).ok, true);
  assert.equal((await service.login('wali@hamasah.test', KATA_SANDI)).ok, true);

  // Hanya admin yang boleh menonaktifkan, dan tidak boleh menonaktifkan dirinya sendiri.
  assert.equal((await service.setAccountActive(akunWali.id, false, { id: 'x', role: 'supervisor' })).ok, false);
  assert.equal((await service.setAccountActive(akunAdmin.id, false, { id: akunAdmin.id, role: 'admin' })).ok, false);
  assert.equal((await service.setAccountActive('akun-tidak-ada', false, admin)).ok, false);

  // --- Pembersihan sesi kedaluwarsa ---
  await accountStore.save({ ...(await accountStore.getById(akunWali.id)), active: true });
  const sesiBaru = await service.login('wali@hamasah.test', KATA_SANDI);
  jam.sekarang += 31 * HARI;
  const dibersihkan = await service.purgeExpiredSessions();
  assert.ok(dibersihkan >= 1, 'Sesi kedaluwarsa dihapus dari penyimpanan, bukan hanya ditolak saat dipakai.');
  assert.equal((await service.authenticate(sesiBaru.value.accessToken)).ok, false);

  console.log('session lifetime tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
