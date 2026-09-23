// Rute perawatan terjadwal: POST /api/tasks/maintenance.
//
// Rute ini menjalankan pembersihan yang di server biasa dikerjakan timer. Karena
// tidak memakai sesi, penjaganya hanya satu kunci rahasia, jadi tiga hal wajib
// terbukti: tertutup saat kunci belum disetel, menolak kunci yang salah, dan
// benar-benar membersihkan saat kuncinya cocok.

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');

async function panggil(baseUrl, kunci) {
  const headers = kunci === null ? {} : { Authorization: `Bearer ${kunci}` };
  const response = await fetch(`${baseUrl}/api/tasks/maintenance`, { method: 'POST', headers });
  return { status: response.status, body: await response.json() };
}

test('perawatan terjadwal hanya berjalan dengan kunci yang benar', async () => {
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    // Pembatas bawaan sengaja dipakai, bukan versi longgar, supaya perawatan benar-benar
    // menyapu tabel rate_limit_hits seperti di production.
    auditRetention: false
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const kunciAsli = process.env.MAINTENANCE_KEY;
  const cronAsli = process.env.CRON_SECRET;

  try {
    // 1. Tanpa kunci di environment, rutenya tertutup untuk semua orang.
    delete process.env.MAINTENANCE_KEY;
    delete process.env.CRON_SECRET;
    const belumDisetel = await panggil(baseUrl, 'apa-saja');
    assert.equal(belumDisetel.status, 503, 'Tanpa kunci, rutenya tertutup, bukan terbuka.');

    process.env.MAINTENANCE_KEY = 'kunci-perawatan-uji-32-karakter-aman';

    // 2. Tanpa header sama sekali, dan dengan kunci salah: sama-sama ditolak.
    assert.equal((await panggil(baseUrl, null)).status, 401);
    assert.equal((await panggil(baseUrl, 'kunci-salah')).status, 401);

    // 3. Baris pembatas laju yang sudah kedaluwarsa benar-benar dibuang.
    await database.query(
      "INSERT INTO rate_limit_hits (bucket, occurred_at) VALUES ('login:uji', now() - interval '3 days')"
    );
    const berhasil = await panggil(baseUrl, 'kunci-perawatan-uji-32-karakter-aman');
    assert.equal(berhasil.status, 200);
    assert.equal(berhasil.body.ok, true);
    assert.ok(berhasil.body.dibersihkan, 'Hasil pembersihan dilaporkan.');
    const tersisa = await database.query("SELECT count(*)::int AS n FROM rate_limit_hits WHERE bucket = 'login:uji'");
    assert.equal(tersisa.rows[0].n, 0, 'Baris pembatas kedaluwarsa dibuang oleh perawatan.');

    console.log('maintenance route tests passed');
  } finally {
    if (kunciAsli === undefined) delete process.env.MAINTENANCE_KEY; else process.env.MAINTENANCE_KEY = kunciAsli;
    if (cronAsli === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = cronAsli;
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
});
