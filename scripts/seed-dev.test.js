const assert = require('node:assert/strict');
const { createTestDatabase } = require('../server/test-support/database.js');
const { DEV_ACCOUNTS, DEV_STUDENTS, seedDevelopmentData } = require('./seed-dev.js');

const SILENT_LOGGER = { log() {} };

async function run() {
  const database = await createTestDatabase();
  try {
    const pertama = await seedDevelopmentData({ database, logger: SILENT_LOGGER });
    assert.equal(pertama.accounts.length, DEV_ACCOUNTS.length);
    assert.ok(pertama.articles.length >= 1, 'Artikel contoh ikut dibuat.');
    assert.equal(pertama.students.length, DEV_STUDENTS.length);
    assert.equal(pertama.courses.length, 1);

    const akun = await database.query('SELECT email, role FROM accounts ORDER BY email');
    assert.deepEqual(akun.rows.map((row) => row.role).sort(), ['admin', 'parent', 'registration-officer', 'student', 'supervisor']);

    // Santri contoh punya relasi wali, presensi, kegiatan, dan maddah.
    const relasi = await database.query('SELECT count(*)::int AS jumlah FROM student_parent_accounts');
    assert.equal(relasi.rows[0].jumlah, DEV_STUDENTS.length);
    const presensi = await database.query('SELECT count(*)::int AS jumlah FROM student_attendance');
    assert.equal(presensi.rows[0].jumlah, DEV_STUDENTS.length * 2);
    const materi = await database.query('SELECT count(*)::int AS jumlah FROM course_materials');
    assert.equal(materi.rows[0].jumlah, 2);
    const kelas = await database.query('SELECT count(*)::int AS jumlah FROM course_enrollments');
    assert.equal(kelas.rows[0].jumlah, DEV_STUDENTS.length);

    // Dijalankan ulang tidak membuat data ganda.
    const kedua = await seedDevelopmentData({ database, logger: SILENT_LOGGER });
    assert.deepEqual(kedua.accounts, []);
    assert.deepEqual(kedua.articles, []);
    assert.deepEqual(kedua.students, []);
    assert.deepEqual(kedua.courses, []);
    const jumlah = await database.query('SELECT count(*)::int AS akun FROM accounts');
    assert.equal(jumlah.rows[0].akun, DEV_ACCOUNTS.length);
    const santri = await database.query('SELECT count(*)::int AS jumlah FROM students');
    assert.equal(santri.rows[0].jumlah, DEV_STUDENTS.length);
    const presensiKedua = await database.query('SELECT count(*)::int AS jumlah FROM student_attendance');
    assert.equal(presensiKedua.rows[0].jumlah, DEV_STUDENTS.length * 2, 'Seed kedua tidak menambah presensi.');
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
