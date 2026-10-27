// Gerbang PIN pratinjau: halaman dikunci, /pitch dan aset terbuka, cookie hanya dari PIN benar.
const assert = require('node:assert/strict');
const { createSitePin, COOKIE } = require('./site-pin.js');
const { readProductionConfig } = require('../production-config.js');

function jawaban() {
  const res = { status: 0, headers: {}, body: '' };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {}; };
  res.end = (body) => { res.body = body ? String(body) : ''; };
  return res;
}
const minta = (cookie = '') => ({ method: 'GET', headers: cookie ? { cookie } : {} });
const url = (alamat) => new URL(alamat, 'http://localhost');

assert.equal(createSitePin({ pin: '' }), null, 'tanpa PIN gerbang mati');
const gerbang = createSitePin({ pin: '0001', secret: 'rahasia-uji' });

// Halaman dijaga, kecuali pitch; aset dan API tidak.
for (const alamat of ['/', '/biaya', '/program-kuliah', '/staff', '/biaya.html', '/website/']) assert.ok(gerbang.halamanDijaga(alamat), alamat);
for (const alamat of ['/pitch', '/pitch.html', '/website/pitch.html', '/internal', '/internal.html', '/qohiroh', '/qohiroh.html', '/website/qohiroh.html', '/pitch.css', '/internal.css', '/qohiroh.css', '/assets/logo-emblem-gold.png', '/website-core.css']) assert.ok(!gerbang.halamanDijaga(alamat), alamat);

// Tanpa cookie: halaman PIN, tidak disimpan CDN, alamat kembali ikut di formulir.
const res = jawaban();
assert.equal(gerbang.tahan(minta(), res, url('/biaya?x=1')), true);
assert.equal(res.status, 401);
assert.equal(res.headers['Vercel-CDN-Cache-Control'], 'no-store');
assert.ok(res.body.includes('action="/api/pratinjau/pin"') && res.body.includes('value="/biaya?x=1"'));
assert.ok(!res.body.includes('pin__error'));
const resSalah = jawaban();
gerbang.tahan(minta(), resSalah, url('/biaya?pin=salah'));
assert.ok(resSalah.body.includes('pin__error') && resSalah.body.includes('value="/biaya"'));

// PIN salah: kembali dengan tanda salah, tanpa cookie.
const salah = jawaban();
gerbang.kirim(minta(), salah, Buffer.from('pin=1234&kembali=%2Fbiaya'), { secure: true });
assert.equal(salah.status, 303);
assert.equal(salah.headers.Location, '/biaya?pin=salah');
assert.equal(salah.headers['Set-Cookie'], undefined);

// PIN benar: cookie HttpOnly berisi HMAC (bukan PIN), lalu halaman terbuka.
const benar = jawaban();
gerbang.kirim(minta(), benar, Buffer.from('pin=0001&kembali=%2Fbiaya'), { secure: true });
assert.equal(benar.status, 303);
assert.equal(benar.headers.Location, '/biaya');
const cookie = benar.headers['Set-Cookie'];
assert.ok(cookie.startsWith(`${COOKIE}=`) && cookie.includes('HttpOnly') && cookie.includes('Secure') && !cookie.includes('=0001;'));
const nilai = cookie.split(';')[0];
assert.equal(gerbang.tahan(minta(`lain=1; ${nilai}`), jawaban(), url('/biaya')), false, 'cookie benar membuka halaman');
assert.equal(gerbang.tahan(minta(`${COOKIE}=palsu`), jawaban(), url('/biaya')), true, 'cookie palsu ditolak');

// Mengganti PIN mengeluarkan cookie lama.
assert.equal(createSitePin({ pin: '9999', secret: 'rahasia-uji' }).tahan(minta(nilai), jawaban(), url('/')), true);

// Alamat kembali ke situs lain ditolak.
const luar = jawaban();
gerbang.kirim(minta(), luar, Buffer.from('pin=0001&kembali=%2F%2Fevil.example'), { secure: false });
assert.equal(luar.headers.Location, '/');
assert.ok(!luar.headers['Set-Cookie'].includes('Secure'));

// Konfigurasi: production bawaan 0001, SITE_PIN=off mematikan, pengembangan mati.
const dasar = { APP_ENV: 'production', DATABASE_URL: 'postgres://u:p@db.example.com:5432/x', STORAGE_BUCKET: 'b', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', IP_HASH_SECRET: 'x'.repeat(32), APP_BASE_URL: 'https://hamasah.vercel.app' };
let produksi = null;
try { produksi = readProductionConfig(dasar); } catch { produksi = null; }
if (produksi) {
  assert.equal(produksi.sitePin, '0001');
  assert.equal(readProductionConfig({ ...dasar, SITE_PIN: 'off' }).sitePin, '');
  assert.equal(readProductionConfig({ ...dasar, SITE_PIN: '4321' }).sitePin, '4321');
}
assert.equal(readProductionConfig({ APP_ENV: 'development', DATABASE_URL: 'pglite:./data/x' }).sitePin, '');

console.log(`site pin tests passed${produksi ? '' : ' (konfigurasi production dilewati)'}`);
