// Login tidak membocorkan apakah email terdaftar lewat waktu respons.
// Sebelumnya email yang tidak ada (dan akun nonaktif) ditolak tanpa menjalankan scrypt:
// sekitar 0 ms lawan sekitar 225 ms untuk kata sandi salah.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const identity = require('./identity-service.js');

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
    // Ambang longgar supaya tidak rapuh di mesin CI; yang dicegah adalah selisih ratusan ms.
    assert.ok(tidakAda.ms > salah.ms * 0.5, `tidak ada ${tidakAda.ms.toFixed(0)} ms vs salah ${salah.ms.toFixed(0)} ms`);
    assert.ok(nonaktif.ms > salah.ms * 0.5, `nonaktif ${nonaktif.ms.toFixed(0)} ms vs salah ${salah.ms.toFixed(0)} ms`);

    // Login sah tetap berhasil.
    assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-admin-aman')).ok, true);
    console.log(`login enumeration tests passed (salah ${salah.ms.toFixed(0)} ms, tidak ada ${tidakAda.ms.toFixed(0)} ms, nonaktif ${nonaktif.ms.toFixed(0)} ms)`);
  } finally {
    crypto.scrypt = asli;
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
