// Login tidak membocorkan apakah email terdaftar lewat waktu respons.
// Sebelumnya email yang tidak ada (dan akun nonaktif) ditolak tanpa menjalankan scrypt:
// sekitar 0 ms lawan sekitar 225 ms untuk kata sandi salah.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const identity = require('./identity-service.js');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

async function run() {
  const service = identity.createIdentityService();
  const admin = await service.createAccount({ email: 'admin@hamasah.test', name: 'Admin Uji', role: identity.ROLES.ADMIN, password: 'kata-sandi-admin-aman' });
  const wali = await service.createAccount({ email: 'wali@hamasah.test', name: 'Wali Uji', role: identity.ROLES.PARENT, password: 'kata-sandi-wali-aman' });
  assert.equal((await service.setAccountActive(wali.value.id, false, admin.value)).ok, true);

  // Hitung panggilan scrypt per percobaan login.
  const asli = crypto.scrypt;
  let panggilan = 0;
  crypto.scrypt = function hitung(...args) { panggilan += 1; return asli.apply(crypto, args); };
  const ukur = async (email, password) => {
    panggilan = 0;
    const mulai = process.hrtime.bigint();
    const hasil = await service.login(email, password);
    return { hasil, panggilan, ms: Number(process.hrtime.bigint() - mulai) / 1e6 };
  };
  try {
    await ukur('pemanasan@hamasah.test', 'apa-saja-panjang'); // hash tiruan dibuat sekali per proses
    const salah = await ukur('admin@hamasah.test', 'kata-sandi-salah-sekali');
    const tidakAda = await ukur('tidak-ada@hamasah.test', 'kata-sandi-salah-sekali');
    const nonaktif = await ukur('wali@hamasah.test', 'kata-sandi-wali-aman');

    for (const [nama, percobaan] of Object.entries({ salah, tidakAda, nonaktif })) {
      assert.equal(percobaan.hasil.ok, false, nama);
      assert.equal(percobaan.hasil.error, 'Email atau kata sandi tidak tepat.', `${nama}: pesan harus sama`);
      assert.equal(percobaan.panggilan, 1, `${nama}: scrypt harus dijalankan tepat sekali`);
    }
    // Bukti utamanya hitungan scrypt di atas. Waktu hanya dicatat: di bawah beban `npm test`
    // (banyak berkas paralel) satu request bisa melambat detik-an, jadi ambang waktu rapuh.

    // Login sah tetap berhasil.
    assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-admin-aman')).ok, true);
    console.log(`login enumeration tests passed (salah ${salah.ms.toFixed(0)} ms, tidak ada ${tidakAda.ms.toFixed(0)} ms, nonaktif ${nonaktif.ms.toFixed(0)} ms)`);
  } finally {
    crypto.scrypt = asli;
  }

  // Permintaan reset: dulu request untuk email terdaftar menunggu penyedia email di dalam
  // request. Pengirim di sini menggantung sampai dilepas: bila route masih menunggunya,
  // request tidak akan pernah selesai sebelum pengirim dipanggil.
  let dipanggil = 0;
  let lepas = () => {};
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'), database, auditRetention: false,
    rateLimiter: createRelaxedRateLimiter(),
    email: { driver: 'test', appBaseUrl: 'https://app.hamasah.test' },
    emailSender: { provider: 'test', configured: true, async send() { dipanggil += 1; await new Promise((r) => { lepas = r; }); return { id: 'lambat' }; } }
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await app.identityService.createAccount({ email: 'terdaftar@hamasah.test', name: 'Akun Uji', role: identity.ROLES.PARENT, password: 'kata-sandi-akun-aman' });
    const minta = async (email) => {
      const mulai = process.hrtime.bigint();
      // Batas 5 detik: route yang menunggu pengirim (yang menggantung) akan gagal di sini, bukan macet.
      const response = await fetch(`${baseUrl}/api/auth/password-reset-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(5000) })
        .catch((error) => { throw new assert.AssertionError({ message: `request reset untuk ${email} menunggu pengirim email (${error.name})` }); });
      return { status: response.status, body: await response.text(), ms: Number(process.hrtime.bigint() - mulai) / 1e6 };
    };
    await minta('pemanasan@hamasah.test');
    const ada = await minta('terdaftar@hamasah.test');
    const tidak = await minta('tidak-terdaftar@hamasah.test');
    assert.equal(ada.status, 202);
    assert.equal(tidak.status, 202);
    assert.equal(ada.body, tidak.body);
    assert.equal(dipanggil, 0, 'Request tidak boleh memanggil (apalagi menunggu) pengirim email; email diantrekan.');
    const antre = await database.query("SELECT recipient_email FROM notification_outbox WHERE notification_type = 'password-reset' AND status = 'pending'");
    assert.deepEqual(antre.rows.map((row) => row.recipient_email), ['terdaftar@hamasah.test']);
    console.log(`reset request timing passed (terdaftar ${ada.ms.toFixed(0)} ms, tidak terdaftar ${tidak.ms.toFixed(0)} ms)`);
  } finally {
    lepas();
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
