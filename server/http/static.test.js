const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { serveStaticFile } = require('./static.js');

// Percobaan keluar folder diuji di folder sementara berisi berkas rahasia PALSU,
// bukan di root repo. Kalau suatu saat test ini gagal, yang ikut tercetak di layar
// adalah isi berkas palsu itu, bukan .env sungguhan.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-static-'));
const ISI_RAHASIA_PALSU = 'DATABASE_URL=postgresql://rahasia-palsu';

fs.mkdirSync(path.join(SANDBOX, 'website'), { recursive: true });
fs.mkdirSync(path.join(SANDBOX, 'assets'), { recursive: true });
fs.writeFileSync(path.join(SANDBOX, 'website', 'index.html'), '<h1>Beranda uji</h1>', 'utf8');
fs.writeFileSync(path.join(SANDBOX, 'website', 'gaya.css'), 'body { color: #363638; }', 'utf8');
fs.writeFileSync(path.join(SANDBOX, 'assets', 'logo.png'), 'bukan-png-sungguhan', 'utf8');
fs.writeFileSync(path.join(SANDBOX, '.env'), ISI_RAHASIA_PALSU, 'utf8');
fs.writeFileSync(path.join(SANDBOX, 'package.json'), '{ "name": "rahasia-palsu" }', 'utf8');

// Response palsu: writable stream biasa, ditambah writeHead seperti http.ServerResponse.
function fakeResponse() {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  stream.writeHead = function writeHead(status, headers) {
    stream.status = status;
    stream.headers = headers || {};
    return stream;
  };
  stream.selesai = new Promise((resolve) => stream.on('finish', resolve));
  stream.isi = () => Buffer.concat(chunks).toString('utf8');
  return stream;
}

async function serve(pathname, rootDirectory = SANDBOX) {
  const response = fakeResponse();
  serveStaticFile(response, { pathname, rootDirectory });
  await response.selesai;
  return response;
}

const BS = String.fromCharCode(92);

async function run() {
  try {
    const beranda = await serve('/');
    assert.equal(beranda.status, 200);
    assert.equal(beranda.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.equal(beranda.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(beranda.isi(), '<h1>Beranda uji</h1>');

    const gaya = await serve('/website/gaya.css');
    assert.equal(gaya.status, 200);
    assert.equal(gaya.headers['Content-Type'], 'text/css; charset=utf-8');

    const logo = await serve('/assets/logo.png');
    assert.equal(logo.status, 200);
    assert.equal(logo.headers['Content-Type'], 'image/png');

    // Keluar dari folder yang diizinkan harus gagal. Ini yang menjaga .env dan
    // berkas konfigurasi lain tidak bisa diambil lewat URL.
    const percobaan = [
      '/website/../.env',
      '/website/../../.env',
      '/../.env',
      '/.env',
      '/package.json',
      '/website/..%2f.env',
      '/website/%2e%2e/.env',
      // Backslash: di Windows path.resolve memperlakukannya sebagai pemisah folder,
      // sedangkan path.posix.normalize tidak. Tanpa penyeragaman, yang ini lolos.
      `/website/..${BS}.env`,
      `/website${BS}..${BS}.env`,
      `/assets/..${BS}.env`,
      `/assets/..${BS}package.json`
    ];
    for (const jalan of percobaan) {
      const ditolak = await serve(jalan);
      assert.equal(
        ditolak.isi().includes('rahasia-palsu'),
        false,
        `Berkas di luar folder yang diizinkan tersaji lewat ${JSON.stringify(jalan)}`
      );
      assert.equal(ditolak.status, 404, `Seharusnya ditolak: ${JSON.stringify(jalan)}`);
    }

    // Berkas yang memang tidak ada di dalam folder yang diizinkan.
    const tidakAda = await serve('/website/tidak-ada.html');
    assert.equal(tidakAda.status, 404);
    assert.equal(tidakAda.isi(), 'Halaman tidak ditemukan.');

    // Halaman sungguhan di repo tetap tersaji.
    const portal = await serve('/website/portal.html', path.resolve(__dirname, '..', '..'));
    assert.equal(portal.status, 200);

    console.log('static file server tests passed');
  } finally {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
