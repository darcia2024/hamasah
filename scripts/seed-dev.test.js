const assert = require('node:assert/strict');
const { createTestDatabase } = require('../server/test-support/database.js');
const { DEV_ACCOUNTS, DEV_DORMITORIES, DEV_STUDENTS, seedDevelopmentData } = require('./seed-dev.js');

const SILENT_LOGGER = { log() {} };

async function run() {
  const database = await createTestDatabase();
  try {
    const pertama = await seedDevelopmentData({ database, logger: SILENT_LOGGER });
    assert.equal(pertama.accounts.length, DEV_ACCOUNTS.length);
    assert.ok(pertama.articles.length >= 1, 'Artikel contoh ikut dibuat.');
    assert.equal(pertama.students.length, DEV_STUDENTS.length);
    assert.equal(pertama.courses.length, 1);
    assert.equal(pertama.dormitories.length, DEV_DORMITORIES.length);

    const akun = await database.query('SELECT email, role FROM accounts ORDER BY email');
    assert.deepEqual(
      akun.rows.map((row) => row.role).sort(),
      ['admin', 'finance', 'parent', 'registration-officer', 'student', 'supervisor', 'teacher']
    );

    // Santri contoh punya relasi wali, presensi, kegiatan, dan maddah.
    const relasi = await database.query('SELECT count(*)::int AS jumlah FROM student_parent_accounts');
    assert.equal(relasi.rows[0].jumlah, DEV_STUDENTS.length);
    const presensi = await database.query('SELECT count(*)::int AS jumlah FROM student_attendance');
    assert.equal(presensi.rows[0].jumlah, DEV_STUDENTS.length * 2);
    const materi = await database.query('SELECT count(*)::int AS jumlah FROM course_materials');
    assert.equal(materi.rows[0].jumlah, 2);
    const kelas = await database.query('SELECT count(*)::int AS jumlah FROM course_enrollments');
    assert.equal(kelas.rows[0].jumlah, DEV_STUDENTS.length);

    // Santri contoh langsung ditempatkan di asrama sesuai jenisnya, dan musyrif
    // dev ditugaskan ke satu asrama saja.
    const penempatan = await database.query('SELECT count(*)::int AS jumlah FROM students WHERE dormitory_id IS NOT NULL');
    assert.equal(penempatan.rows[0].jumlah, DEV_STUDENTS.length);
    const penugasan = await database.query('SELECT count(*)::int AS jumlah FROM staff_dormitory_assignments');
    assert.equal(penugasan.rows[0].jumlah, 1);

    // Dijalankan ulang tidak membuat data ganda.
    const kedua = await seedDevelopmentData({ database, logger: SILENT_LOGGER });
    assert.deepEqual(kedua.accounts, []);
    assert.deepEqual(kedua.articles, []);
    assert.deepEqual(kedua.students, []);
    assert.deepEqual(kedua.courses, []);
    assert.deepEqual(kedua.dormitories, []);
    const jumlah = await database.query('SELECT count(*)::int AS akun FROM accounts');
    assert.equal(jumlah.rows[0].akun, DEV_ACCOUNTS.length);
    const santri = await database.query('SELECT count(*)::int AS jumlah FROM students');
    assert.equal(santri.rows[0].jumlah, DEV_STUDENTS.length);
    const presensiKedua = await database.query('SELECT count(*)::int AS jumlah FROM student_attendance');
    assert.equal(presensiKedua.rows[0].jumlah, DEV_STUDENTS.length * 2, 'Seed kedua tidak menambah presensi.');
    const asramaKedua = await database.query('SELECT count(*)::int AS jumlah FROM dormitories');
    assert.equal(asramaKedua.rows[0].jumlah, DEV_DORMITORIES.length, 'Seed kedua tidak menambah asrama.');
    const penugasanKedua = await database.query('SELECT count(*)::int AS jumlah FROM staff_dormitory_assignments');
    assert.equal(penugasanKedua.rows[0].jumlah, 1, 'Penugasan musyrif tidak menjadi ganda.');
    const kelasKedua = await database.query('SELECT count(*)::int AS jumlah FROM course_enrollments');
    assert.equal(kelasKedua.rows[0].jumlah, DEV_STUDENTS.length, 'Pendaftaran maddah tidak menjadi ganda.');

    console.log('dev seed tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
