// Tombol "Data demo" di dashboard super admin: isi per langkah, lanjutkan setelah
// terputus, kata sandi baru, dan hapus.
const assert = require('node:assert/strict');
const identity = require('./identity-service.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createDemoDataService } = require('./demo-data-service.js');
const { DEMO_ACCOUNTS, DEMO_REGISTRATIONS, DEMO_STUDENTS, LANGKAH_DEMO } = require('./demo-data.js');

async function run() {
  const database = await createTestDatabase();
  const layanan = createDemoDataService({ database });
  try {
    const kosong = await layanan.status();
    assert.equal(kosong.ada, false);
    assert.equal(kosong.langkah.length, LANGKAH_DEMO.length);
    assert.equal(kosong.akunDemo.length, DEMO_ACCOUNTS.length);
    assert.equal(typeof kosong.latensiMs, 'number');

    // Langkah tidak dikenal dan langkah yang belum waktunya ditolak dengan pesan jelas.
    assert.equal((await layanan.jalankanLangkah('tidak-ada')).status, 422);
    const terlalu = await layanan.jalankanLangkah('santri');
    assert.equal(terlalu.ok, false);
    assert.match(terlalu.error, /Jalankan langkah sebelumnya/);

    // Separuh langkah, lalu "terputus".
    let kataSandi = null;
    const kode = new Map();
    const separuh = Math.floor(LANGKAH_DEMO.length / 2);
    for (const langkah of LANGKAH_DEMO.slice(0, separuh)) {
      const hasil = await layanan.jalankanLangkah(langkah.id);
      assert.equal(hasil.ok, true, `${langkah.id}: ${hasil.error}`);
      if (hasil.value.kataSandi) kataSandi = hasil.value.kataSandi;
      (hasil.value.pendaftar || []).forEach((p) => kode.set(p.nomor, p.kode));
    }
    assert.match(kataSandi, /^demo-/);
    const tengah = await layanan.status();
    assert.equal(tengah.ada, true);
    assert.equal(tengah.lengkap, false);

    // Dilanjutkan dari awal: yang sudah ada dilewati, kata sandi tidak berubah.
    for (const langkah of LANGKAH_DEMO) {
      const hasil = await layanan.jalankanLangkah(langkah.id);
      assert.equal(hasil.ok, true, `${langkah.id}: ${hasil.error}`);
      if (langkah.id === 'akun') assert.equal(hasil.value.kataSandi, null, 'Akun yang sudah ada tidak dibuat ulang.');
      (hasil.value.pendaftar || []).forEach((p) => kode.set(p.nomor, p.kode));
    }
    const penuh = await layanan.status();
    assert.equal(penuh.lengkap, true);
    assert.equal(penuh.jumlah.santri, DEMO_STUDENTS.length);
    assert.equal(penuh.jumlah.pendaftar, DEMO_REGISTRATIONS.length);
    assert.equal(kode.size, DEMO_REGISTRATIONS.length, 'Setiap pendaftar mendapat kode akses tepat sekali.');
    assert.equal(await database.query('SELECT count(*)::int AS jumlah FROM students').then((r) => r.rows[0].jumlah), DEMO_STUDENTS.length, 'Tidak ada santri ganda.');
    assert.equal(await database.query('SELECT count(*)::int AS jumlah FROM course_enrollments').then((r) => r.rows[0].jumlah), DEMO_STUDENTS.length + DEMO_STUDENTS.filter((s) => s.bergabung === 38).length, 'Tidak ada pendaftaran maddah ganda.');
    const hash = (await database.query("SELECT password_hash FROM accounts WHERE email LIKE '%@demo.hamasah.test' LIMIT 1")).rows[0].password_hash;
    assert.equal(await identity.verifyPassword(kataSandi, hash), true);

    // Kata sandi baru.
    const baru = await layanan.gantiSandi();
    assert.equal(baru.ok, true);
    assert.notEqual(baru.value.kataSandi, kataSandi);
    assert.equal(baru.value.pendaftar.length, DEMO_REGISTRATIONS.length);

    // Hapus: konfirmasi wajib, lalu semua hilang.
    assert.equal((await layanan.hapus('hapus saja')).status, 422);
    const hapus = await layanan.hapus('HAPUS');
    assert.equal(hapus.ok, true);
    assert.equal(hapus.value.dihapus.santri, DEMO_STUDENTS.length);
    assert.equal((await layanan.status()).ada, false);
    assert.equal((await layanan.gantiSandi()).ok, false, 'Tanpa data demo, tidak ada kata sandi yang diganti.');

    console.log('demo data service tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
