// api/index.js harus bisa melayani permintaan dengan environment production
// yang diisi persis seperti panduan rilis Vercel.
//
// serverless-handler.test.js hanya menguji createHamasahApp. Titik masuk Vercel
// sendiri pernah lupa mengoper konfigurasi Supabase, sehingga setiap permintaan
// di production gagal 500 tanpa satu test pun yang merah. Test ini memanggil
// api/index.js apa adanya supaya kejadian itu tertangkap di CI.

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { appOptionsFromConfig, readProductionConfig } = require('./production-config.js');

// Environment production sesuai tabel di docs/PANDUAN_RILIS_HOSTING_2026-09-22.md.
// Database sengaja menunjuk ke port yang tidak ada: /api/health tidak menyentuh
// database, dan pool pg baru membuka koneksi saat query pertama.
const ENV_PRODUCTION = Object.freeze({
  APP_ENV: 'production',
  DATABASE_URL: 'postgresql://hamasah:rahasia@127.0.0.1:1/hamasah',
  APP_BASE_URL: 'https://app.hamasah.example',
  IP_HASH_SECRET: 'i'.repeat(40),
  CRON_SECRET: 'c'.repeat(40),
  STORAGE_DRIVER: 'supabase',
  STORAGE_BUCKET: 'hamasah-private-documents',
  SUPABASE_URL: 'https://proyek.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'kunci-service-role-tiruan',
  TRUST_PROXY: 'true'
});

test('appOptionsFromConfig mengoper seluruh konfigurasi yang dibutuhkan app', () => {
  const config = readProductionConfig({
    ...ENV_PRODUCTION,
    EMAIL_DRIVER: 'resend',
    RESEND_API_KEY: 're_tiruan',
    EMAIL_FROM: 'Hamasah <noreply@hamasah.example>'
  });
  const opsi = appOptionsFromConfig(config);

  assert.equal(opsi.storageDriver, 'supabase');
  assert.equal(opsi.supabaseUrl, 'https://proyek.supabase.co');
  assert.equal(opsi.supabaseServiceRoleKey, 'kunci-service-role-tiruan');
  assert.equal(opsi.storageBucket, 'hamasah-private-documents');
  assert.equal(opsi.email.driver, 'resend');
  assert.equal(opsi.email.resendApiKey, 're_tiruan');
  assert.equal(opsi.appBaseUrl, 'https://app.hamasah.example');
  assert.equal(opsi.ipHashSecret, 'i'.repeat(40));

  // Setiap nilai konfigurasi yang dibaca harus sampai ke app. Kalau nanti ada
  // kunci baru di readProductionConfig, test ini memaksa kunci itu ikut dioper.
  for (const kunci of Object.keys(config)) {
    assert.ok(kunci in opsi, `Konfigurasi ${kunci} tidak dioper ke createHamasahApp.`);
  }
});

test('api/index.js melayani permintaan dengan environment production', async () => {
  const cadangan = { ...process.env };
  Object.assign(process.env, ENV_PRODUCTION);
  delete process.env.EMAIL_DRIVER;

  const handler = require('../api/index.js');
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.statusCode = 599;
      response.end(error.message);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200, `api/index.js gagal dirakit: ${await health.clone().text()}`);

    // Halaman publik tetap tersaji dari berkas di disk.
    const beranda = await fetch(`${baseUrl}/website/`);
    assert.equal(beranda.status, 200);

    // Cron perawatan menolak kunci yang salah, bukan gagal karena konfigurasi.
    const perawatan = await fetch(`${baseUrl}/api/tasks/maintenance`, {
      headers: { Authorization: 'Bearer kunci-salah' }
    });
    assert.equal(perawatan.status, 401);

    console.log('serverless entry tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const kunci of Object.keys(process.env)) {
      if (!(kunci in cadangan)) delete process.env[kunci];
    }
    Object.assign(process.env, cadangan);
  }
});
