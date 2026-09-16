const assert = require('node:assert/strict');
const { createTestDatabase } = require('../server/test-support/database.js');
const { DEV_ACCOUNTS, seedDevelopmentData } = require('./seed-dev.js');

const SILENT_LOGGER = { log() {} };

async function run() {
  const database = await createTestDatabase();
  try {
    const pertama = await seedDevelopmentData({ database, logger: SILENT_LOGGER });
    assert.equal(pertama.accounts.length, DEV_ACCOUNTS.length);
    assert.ok(pertama.articles.length >= 1, 'Artikel contoh ikut dibuat.');

    const akun = await database.query('SELECT email, role FROM accounts ORDER BY email');
    assert.deepEqual(akun.rows.map((row) => row.role).sort(), ['admin', 'parent', 'registration-officer', 'student', 'supervisor']);

    // Dijalankan ulang tidak membuat data ganda.
    const kedua = await seedDevelopmentData({ database, logger: SILENT_LOGGER });
    assert.deepEqual(kedua.accounts, []);
    assert.deepEqual(kedua.articles, []);
    const jumlah = await database.query('SELECT count(*)::int AS akun FROM accounts');
    assert.equal(jumlah.rows[0].akun, DEV_ACCOUNTS.length);

    console.log('dev seed tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
