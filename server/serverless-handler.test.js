// Adaptor serverless (api/index.js) harus melayani permintaan sama seperti server biasa.
//
// Yang diuji di sini bukan Vercel-nya, melainkan janji yang dipegang adaptor itu:
// satu fungsi penangan yang bisa dipakai ulang lintas permintaan, melayani halaman
// statis maupun API, tanpa menyalakan server sendiri dan tanpa timer di dalam proses.

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');

test('penangan permintaan dapat dipakai tanpa createServer', async () => {
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    auditRetention: false
  });

  // Inilah yang dipakai api/index.js: fungsi penangan, bukan server.
  const listener = app.requestListener();
  assert.equal(typeof listener, 'function');

  // Fungsi itu dipasang ke server bawaan Node hanya untuk keperluan test, persis
  // seperti platform serverless memasangnya ke servernya sendiri.
  const server = http.createServer(listener);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Liveness tidak menyentuh database, jadi harus tetap menjawab.
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);

    // Halaman publik disajikan dari berkas di disk. Di Vercel berkas ini ikut
    // dibundel lewat "includeFiles" pada vercel.json.
    const beranda = await fetch(`${baseUrl}/website/`);
    assert.equal(beranda.status, 200);
    const html = await beranda.text();
    assert.ok(html.includes('<title>'), 'Beranda disajikan sebagai HTML.');

    // Rute API yang butuh sesi tetap menolak tanpa sesi.
    const tertutup = await fetch(`${baseUrl}/api/accounts`);
    assert.equal(tertutup.status, 401);

    // Penangan yang sama dipakai untuk permintaan berikutnya, seperti instance
    // serverless yang masih hangat.
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);

    console.log('serverless handler tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
});
