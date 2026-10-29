// PWA (item 23): manifest dan ikon valid, disajikan dengan tipe yang benar, service worker tidak pernah menyentuh API atau
// permintaan selain GET, halaman utama memasang tag PWA, dan panduan pemasangan tersedia.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { jenisPermintaan } = require('../website/sw.js');

const ROOT = path.resolve(__dirname, '..');

function ukuranPng(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

async function run() {
  // Manifest: lengkap dan semua ikon ada dengan ukuran yang dijanjikan.
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'website', 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/portal');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.lang, 'id');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'Ikon maskable untuk Android.');
  for (const ikon of manifest.icons) {
    const [w, h] = ukuranPng(path.join(ROOT, ikon.src.replace(/^\//, '')));
    assert.equal(`${w}x${h}`, ikon.sizes, `${ikon.src} berukuran ${w}x${h}`);
  }
  assert.deepEqual(ukuranPng(path.join(ROOT, 'assets', 'pwa', 'apple-touch-icon.png')), [180, 180]);

  // Aturan service worker: API dan non-GET tidak pernah dicache.
  const u = (p) => new URL(`https://contoh.test${p}`);
  assert.equal(jenisPermintaan(u('/api/me'), 'GET', 'cors'), 'lewat');
  assert.equal(jenisPermintaan(u('/api/kotak-pesan'), 'GET', 'cors'), 'lewat');
  assert.equal(jenisPermintaan(u('/api/auth/login'), 'POST', 'cors'), 'lewat');
  assert.equal(jenisPermintaan(u('/media/galeri-kegiatan/x.jpg'), 'GET', 'no-cors'), 'lewat', 'Media dinamis tidak disimpan.');
  assert.equal(jenisPermintaan(u('/portal'), 'GET', 'navigate'), 'halaman');
  assert.equal(jenisPermintaan(u('/portal.js?v=abc123'), 'GET', 'no-cors'), 'berversi');
  assert.equal(jenisPermintaan(u('/portal.js'), 'GET', 'no-cors'), 'lewat', 'Tanpa versi tidak disimpan.');
  assert.equal(jenisPermintaan(u('/assets/pwa/icon-192.png'), 'GET', 'no-cors'), 'aset');
  assert.equal(jenisPermintaan(u('/assets/pwa/icon-192.png'), 'DELETE', 'no-cors'), 'lewat');

  // Disajikan server dengan tipe dan header yang benar.
  const database = await createTestDatabase();
  const app = createHamasahApp({ rootDirectory: ROOT, database, bootstrapKey: 'kunci-bootstrap-uji', rateLimiter: createRelaxedRateLimiter() });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const m = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(m.status, 200);
    assert.match(m.headers.get('content-type'), /application\/manifest\+json/);
    const sw = await fetch(`${base}/sw.js`);
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get('content-type'), /javascript/);
    assert.equal(sw.headers.get('cache-control'), 'no-cache', 'Service worker tidak boleh di-cache lama supaya pembaruan sampai.');
    assert.equal((await fetch(`${base}/offline.html`)).status, 200);
    assert.equal((await fetch(`${base}/assets/pwa/icon-512.png`)).headers.get('content-type'), 'image/png');

    // Halaman tag PWA dan panduan.
    for (const halaman of ['portal', 'pasang-aplikasi', '']) {
      const html = await (await fetch(`${base}/${halaman}`)).text();
      assert.match(html, /rel="manifest"/, `${halaman || 'beranda'} memasang manifest`);
      assert.match(html, /name="theme-color"/);
      assert.match(html, /rel="apple-touch-icon"/);
    }
    const panduan = await (await fetch(`${base}/pasang-aplikasi`)).text();
    assert.match(panduan, /Android \(Chrome\)/);
    assert.match(panduan, /iPhone dan iPad \(Safari\)/);
    assert.match(panduan, /Tambah ke Layar Utama/);
    const portal = await (await fetch(`${base}/portal`)).text();
    assert.match(portal, /Tetap masuk di perangkat ini/);
    assert.match(portal, /href="pasang-aplikasi"/);
    assert.match(portal, /src="pwa\.js/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
  console.log('pwa tests passed');
}

run().catch((error) => { console.error(error); process.exit(1); });
