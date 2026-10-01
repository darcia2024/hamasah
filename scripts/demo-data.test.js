const assert = require('node:assert/strict');
const identity = require('../server/identity-service.js');
const { createTestDatabase } = require('../server/test-support/database.js');
const { createPostgresAccountStore } = require('../server/postgres-account-store.js');
const {
  DEMO_ACCOUNTS, DEMO_DOMAIN, DEMO_DORMITORIES, DEMO_INQUIRIES, DEMO_INVENTORY, DEMO_KLOTER,
  DEMO_REGISTRATIONS, DEMO_STUDENTS, LOCAL_DEMO_PASSWORD,
  gantiSandiDemo, hapusDataDemo, isiDataDemo, temukanDataDemo, totalBaris
} = require('./demo-data.js');

const SILENT_LOGGER = { log() {} };

async function hitung(database, sql, params) {
  return (await database.query(sql, params)).rows[0].jumlah;
}

async function run() {
  const database = await createTestDatabase();
  try {
    // Akun admin sungguhan yang sudah ada tidak boleh tersentuh data demo.
    const identityService = identity.createIdentityService({ accountStore: createPostgresAccountStore({ database }) });
    const admin = await identityService.createAccount({ name: 'Admin Hamasah', email: 'admin@hamasah.com', role: identity.ROLES.ADMIN, password: 'kata-sandi-admin-asli' });
    assert.equal(admin.ok, true);

    const hasil = await isiDataDemo({ database, kataSandi: LOCAL_DEMO_PASSWORD, logger: SILENT_LOGGER });
    assert.equal(hasil.sudahAda, false);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM accounts WHERE email LIKE $1', [`%@${DEMO_DOMAIN}`]), DEMO_ACCOUNTS.length);
    assert.equal(await hitung(database, "SELECT count(*)::int AS jumlah FROM accounts WHERE role = 'admin'"), 1, 'Skrip demo tidak membuat akun admin.');
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM students'), DEMO_STUDENTS.length);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM students WHERE dormitory_id IS NOT NULL'), DEMO_STUDENTS.length);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM dormitories'), DEMO_DORMITORIES.length);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM staff_dormitory_assignments'), 2);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM departure_groups'), DEMO_KLOTER.length);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM inventory_items'), DEMO_INVENTORY.length);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM inquiries'), DEMO_INQUIRIES.length);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM visa_tracking'), DEMO_STUDENTS.length);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM courses'), 2);
    assert.ok(await hitung(database, 'SELECT count(*)::int AS jumlah FROM student_prayer_logs') >= DEMO_STUDENTS.length * 7, 'Catatan sholat terisi.');
    assert.ok(await hitung(database, 'SELECT count(*)::int AS jumlah FROM student_health_logs') > 0, 'Catatan kesehatan terisi.');
    assert.ok(await hitung(database, 'SELECT count(*)::int AS jumlah FROM lms_attempts') > 0, 'Ada percobaan kuis.');
    assert.ok(await hitung(database, "SELECT count(*)::int AS jumlah FROM lms_submissions WHERE status = 'reviewed'") > 0, 'Ada tugas yang sudah dinilai.');
    assert.ok(await hitung(database, "SELECT count(*)::int AS jumlah FROM invoices WHERE status = 'paid'") > 0, 'Ada tagihan lunas.');
    assert.ok(await hitung(database, "SELECT count(*)::int AS jumlah FROM invoices WHERE status = 'unpaid'") > 0, 'Ada tagihan belum lunas.');

    // Pendaftar tersebar di semua tahap, dan pendaftar yang sudah berangkat terhubung ke data santrinya.
    const status = (await database.query('SELECT DISTINCT status FROM registrations')).rows.map((row) => row.status).sort();
    assert.deepEqual(status, ['academic-preparation', 'cancelled', 'completed', 'document-review', 'needs-revision', 'ready-for-departure', 'submitted']);
    assert.equal(hasil.pendaftar.length, DEMO_REGISTRATIONS.length);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM students WHERE registration_id IS NOT NULL'), 2);

    // Semua nomor WhatsApp fiktif dan semua email di domain .test.
    assert.equal(await hitung(database, "SELECT count(*)::int AS jumlah FROM registrations WHERE phone_e164 NOT LIKE '+62800000%' OR email NOT LIKE $1", [`%@${DEMO_DOMAIN}`]), 0);

    // Dijalankan ulang tidak membuat data ganda.
    const kedua = await isiDataDemo({ database, kataSandi: LOCAL_DEMO_PASSWORD, logger: SILENT_LOGGER });
    assert.equal(kedua.sudahAda, true);
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM students'), DEMO_STUDENTS.length);

    // Kata sandi dan kode akses bisa diganti tanpa mengubah data lain.
    const sandiBaru = 'kata-sandi-demo-baru-123';
    const ganti = await gantiSandiDemo({ database, kataSandi: sandiBaru });
    assert.equal(ganti.pendaftar.length, DEMO_REGISTRATIONS.length);
    const akunDemo = (await database.query('SELECT password_hash FROM accounts WHERE email = $1', [`petugas@${DEMO_DOMAIN}`])).rows[0];
    assert.equal(await identity.verifyPassword(sandiBaru, akunDemo.password_hash), true);
    const akunAdmin = (await database.query("SELECT password_hash FROM accounts WHERE email = 'admin@hamasah.com'")).rows[0];
    assert.equal(await identity.verifyPassword('kata-sandi-admin-asli', akunAdmin.password_hash), true, 'Kata sandi admin tidak ikut berubah.');

    // Penghapusan: laporan lengkap, lalu semua hilang tanpa menyentuh akun admin.
    const data = await temukanDataDemo(database);
    assert.equal(data.akun.length, DEMO_ACCOUNTS.length);
    assert.equal(data.santri.length, DEMO_STUDENTS.length);
    assert.equal(data.kloter.length, DEMO_KLOTER.length);
    assert.equal(data.asramaDilewati.length, 0);
    assert.equal(data.inventarisDilewati.length, 0);
    await hapusDataDemo({ database, data, storage: null, logger: SILENT_LOGGER });
    assert.equal(totalBaris(await temukanDataDemo(database)), 0);
    for (const tabel of ['students', 'registrations', 'invoices', 'departure_groups', 'dormitories', 'inventory_items', 'inquiries', 'courses']) {
      assert.equal(await hitung(database, `SELECT count(*)::int AS jumlah FROM ${tabel}`), 0, `Tabel ${tabel} bersih.`);
    }
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM accounts'), 1, 'Hanya akun admin yang tersisa.');
    // Nomor pendaftaran, invoice, dan kuitansi sungguhan pertama kembali mulai dari 00001.
    assert.equal(await hitung(database, 'SELECT count(*)::int AS jumlah FROM document_counters'), 0);

    console.log('demo data tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
