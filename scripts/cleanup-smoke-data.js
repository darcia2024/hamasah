// Membersihkan data fiktif yang dibuat oleh scripts/smoke.js dari lingkungan
// yang sudah berjalan (staging atau production).
//
// SELALU dijalankan manusia, tidak pernah oleh Sonnet: skrip ini menghapus baris
// sungguhan dari database production dan berkas sungguhan dari object storage.
//
// Secara default skrip ini HANYA MELAPORKAN apa yang cocok dengan pola data smoke
// test (tidak menghapus apa pun). Untuk benar-benar menghapus, set juga
// CONFIRM_DELETE=I_UNDERSTAND selain APP_ENV dan ALLOW_PRODUCTION_WRITE.
//
// Pola yang dicocokkan, persis seperti yang dibuat scripts/smoke.js:
//   - akun:          wali.smoke.<tag>@hamasah.test, wali.lain.smoke.<tag>@hamasah.test,
//                     santri.smoke.<tag>@hamasah.test
//   - santri:        nama "Santri Smoke <tag>" ATAU terhubung ke akun santri di atas
//   - maddah:        judul "Nahwu Smoke Test <tag>"
//   - pendaftaran:   nama pendaftar "Calon Smoke Test <tag>"
//   - invoice:       terhubung ke santri smoke ATAU deskripsi "SPP smoke test <tag>"
//   - berkas:        file_objects untuk entity_type 'registration' milik pendaftaran smoke
//
// Akun admin yang dipakai menjalankan smoke test TIDAK disentuh: pola di atas hanya
// cocok dengan akun yang dibuat OLEH smoke test, bukan akun admin yang sudah ada.
//
// Catatan audit (audit_events) sengaja TIDAK dihapus. Baris itu sudah dirancang
// bertahan lewat ON DELETE SET NULL supaya riwayat "apa yang pernah terjadi" tidak
// hilang, termasuk riwayat bahwa data smoke test pernah dibuat lalu dibersihkan.
//
// Pemakaian (laporan saja, aman dijalankan berkali-kali):
//   APP_ENV=production node scripts/cleanup-smoke-data.js
//
// Pemakaian (menghapus sungguhan, setelah meninjau laporan di atas):
//   APP_ENV=production ALLOW_PRODUCTION_WRITE=I_UNDERSTAND CONFIRM_DELETE=I_UNDERSTAND \
//     node scripts/cleanup-smoke-data.js

const path = require('node:path');
const { loadEnvironmentFile } = require('../database/migrate.js');
const { assertDatabaseWriteAllowed } = require('../server/environment.js');
const { readProductionConfig } = require('../server/production-config.js');
const { createDatabase } = require('../server/db.js');
const { createLocalStorage } = require('../server/storage/local.js');
const { createSupabaseStorage } = require('../server/storage/supabase.js');

const CONFIRM_DELETE = 'I_UNDERSTAND';

// Diambil dari scripts/smoke.js: acak() = crypto.randomBytes(4).toString('hex').
const SMOKE_ACCOUNT_EMAIL = /^(wali\.smoke\.|wali\.lain\.smoke\.|santri\.smoke\.)[0-9a-f]{8}@hamasah\.test$/;
const SMOKE_STUDENT_NAME = 'Santri Smoke %';
const SMOKE_COURSE_TITLE = 'Nahwu Smoke Test %';
const SMOKE_APPLICANT_NAME = 'Calon Smoke Test %';
const SMOKE_INVOICE_DESCRIPTION = 'SPP smoke test%';

function createStorage(config) {
  return config.storageDriver === 'supabase'
    ? createSupabaseStorage({ url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey })
    : createLocalStorage({ rootDirectory: path.join(__dirname, '..', 'data', 'dev-storage') });
}

async function temukanData(database, config) {
  const akun = await database.query(
    `SELECT id, email, role FROM accounts WHERE email ~ $1 ORDER BY email`,
    [SMOKE_ACCOUNT_EMAIL.source]
  );
  const akunIds = akun.rows.map((row) => row.id);

  const santri = await database.query(
    `SELECT id, name FROM students WHERE name LIKE $1 OR student_account_id = ANY($2::uuid[]) ORDER BY name`,
    [SMOKE_STUDENT_NAME, akunIds]
  );
  const santriIds = santri.rows.map((row) => row.id);

  const maddah = await database.query(`SELECT id, title FROM courses WHERE title LIKE $1 ORDER BY title`, [SMOKE_COURSE_TITLE]);

  const pendaftaran = await database.query(
    `SELECT id, registration_id, applicant_name FROM registrations WHERE applicant_name LIKE $1 ORDER BY applicant_name`,
    [SMOKE_APPLICANT_NAME]
  );

  const invoice = await database.query(
    `SELECT id, invoice_number, student_id FROM invoices WHERE student_id = ANY($1::uuid[]) OR description LIKE $2 ORDER BY invoice_number`,
    [santriIds, SMOKE_INVOICE_DESCRIPTION]
  );

  const kodePendaftaran = pendaftaran.rows.map((row) => row.registration_id);
  const berkas = kodePendaftaran.length
    ? await database.query(
      `SELECT id, bucket, storage_key FROM file_objects WHERE entity_type = 'registration' AND entity_id = ANY($1::text[]) ORDER BY storage_key`,
      [kodePendaftaran]
    )
    : { rows: [] };

  return {
    akun: akun.rows,
    santri: santri.rows,
    maddah: maddah.rows,
    pendaftaran: pendaftaran.rows,
    invoice: invoice.rows,
    berkas: berkas.rows
  };
}

function cetakLaporan(data) {
  console.log('--- Data yang cocok dengan pola smoke test ---');
  console.log(`Akun:        ${data.akun.length} baris`);
  data.akun.forEach((row) => console.log(`  - ${row.email} (${row.role})`));
  console.log(`Santri:      ${data.santri.length} baris`);
  data.santri.forEach((row) => console.log(`  - ${row.name}`));
  console.log(`Maddah:      ${data.maddah.length} baris`);
  data.maddah.forEach((row) => console.log(`  - ${row.title}`));
  console.log(`Pendaftaran: ${data.pendaftaran.length} baris`);
  data.pendaftaran.forEach((row) => console.log(`  - ${row.registration_id} (${row.applicant_name})`));
  console.log(`Invoice:     ${data.invoice.length} baris`);
  data.invoice.forEach((row) => console.log(`  - ${row.invoice_number}`));
  console.log(`Berkas:      ${data.berkas.length} baris (akan dihapus juga dari object storage)`);
  data.berkas.forEach((row) => console.log(`  - ${row.bucket}/${row.storage_key}`));
  console.log('---');
}

async function hapusData(database, storage, data) {
  await database.withTransaction(async (tx) => {
    if (data.invoice.length) {
      await tx.query('DELETE FROM invoices WHERE id = ANY($1::uuid[])', [data.invoice.map((row) => row.id)]);
    }
    if (data.santri.length) {
      await tx.query('DELETE FROM students WHERE id = ANY($1::uuid[])', [data.santri.map((row) => row.id)]);
    }
    if (data.maddah.length) {
      await tx.query('DELETE FROM courses WHERE id = ANY($1::uuid[])', [data.maddah.map((row) => row.id)]);
    }
    if (data.pendaftaran.length) {
      await tx.query('DELETE FROM registrations WHERE id = ANY($1::uuid[])', [data.pendaftaran.map((row) => row.id)]);
    }
    if (data.akun.length) {
      await tx.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [data.akun.map((row) => row.id)]);
    }
  });
  console.log('Baris database terhapus.');

  for (const file of data.berkas) {
    try {
      await storage.remove(file.bucket, file.storage_key);
      await database.query('DELETE FROM file_objects WHERE id = $1', [file.id]);
      console.log(`  Terhapus: ${file.bucket}/${file.storage_key}`);
    } catch (error) {
      console.error(`  Gagal menghapus ${file.bucket}/${file.storage_key}: ${error.message}`);
    }
  }
}

async function main() {
  loadEnvironmentFile(path.join(__dirname, '..', '.env'), process.env);
  const environment = assertDatabaseWriteAllowed(process.env);
  const config = readProductionConfig(process.env);
  const konfirmasiHapus = process.env.CONFIRM_DELETE === CONFIRM_DELETE;

  const database = createDatabase({ connectionString: config.databaseUrl });
  try {
    const data = await temukanData(database, config);
    cetakLaporan(data);

    const totalBaris = data.akun.length + data.santri.length + data.maddah.length + data.pendaftaran.length + data.invoice.length;
    if (totalBaris === 0) {
      console.log('Tidak ada data smoke test yang tersisa.');
      return;
    }

    if (!konfirmasiHapus) {
      console.log('');
      console.log(`Ini baru LAPORAN, belum ada yang dihapus dari lingkungan ${environment}.`);
      console.log('Tinjau daftar di atas. Kalau sudah yakin, jalankan ulang dengan tambahan CONFIRM_DELETE=I_UNDERSTAND.');
      return;
    }

    const storage = createStorage(config);
    await hapusData(database, storage, data);
    console.log(`Selesai. Data smoke test di lingkungan ${environment} sudah dibersihkan.`);
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(`Gagal membersihkan data smoke test: ${error.message}`);
  process.exitCode = 1;
});
