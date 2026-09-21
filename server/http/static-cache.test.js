// Cache, ETag, 304, dan kompresi pada penyajian berkas statis (Task R6.3).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { PassThrough } = require('node:stream');
const { serveStaticFile } = require('./static.js');

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-static-cache-'));
fs.mkdirSync(path.join(SANDBOX, 'website'), { recursive: true });
fs.mkdirSync(path.join(SANDBOX, 'assets'), { recursive: true });
const CSS = `${'.kartu { color: #363638; padding: 12px; }\n'.repeat(200)}`;
fs.writeFileSync(path.join(SANDBOX, 'website', 'gaya.css'), CSS, 'utf8');
fs.writeFileSync(path.join(SANDBOX, 'website', 'kecil.css'), 'a{b:c}', 'utf8');
fs.writeFileSync(path.join(SANDBOX, 'website', 'index.html'), `<!doctype html><p>${'isi '.repeat(400)}</p>`, 'utf8');
fs.writeFileSync(path.join(SANDBOX, 'assets', 'logo.png'), Buffer.alloc(4096, 7));

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
  stream.bytes = () => Buffer.concat(chunks);
  return stream;
}

async function serve(pathname, { headers = {}, search = '' } = {}) {
  const response = fakeResponse();
  serveStaticFile(response, { pathname, rootDirectory: SANDBOX, request: { headers }, search });
  await response.selesai;
  return response;
}

async function run() {
  try {
    // Header dasar: ETag ada, HTML selalu divalidasi ulang, tanpa versi CSS juga.
    const html = await serve('/website/index.html');
    assert.equal(html.status, 200);
    assert.match(html.headers.ETag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    assert.equal(html.headers['Cache-Control'], 'no-cache');
    assert.equal(html.headers.Vary, 'Accept-Encoding');
    assert.equal((await serve('/website/gaya.css')).headers['Cache-Control'], 'no-cache', 'CSS tanpa versi harus divalidasi ulang.');

    // CSS/JS dengan ?v=: cache setahun dan immutable. Gambar: cache sehari.
    assert.equal((await serve('/website/gaya.css', { search: '?v=abc123' })).headers['Cache-Control'], 'public, max-age=31536000, immutable');
    assert.equal((await serve('/website/gaya.css', { search: '?utm=1' })).headers['Cache-Control'], 'no-cache', 'Parameter lain bukan versi.');
    const gambar = await serve('/assets/logo.png');
    assert.equal(gambar.headers['Cache-Control'], 'public, max-age=86400');
    assert.equal(gambar.headers['Content-Encoding'], undefined, 'PNG tidak dikompresi ulang.');
    assert.equal(gambar.headers.Vary, undefined);
    assert.equal(gambar.bytes().length, 4096);

    // Tanpa Accept-Encoding: berkas apa adanya, dengan Content-Length yang benar.
    const polos = await serve('/website/gaya.css');
    assert.equal(polos.headers['Content-Encoding'], undefined);
    assert.equal(polos.headers['Content-Length'], Buffer.byteLength(CSS));
    assert.equal(polos.bytes().toString('utf8'), CSS);

    // Kompresi: brotli lebih dulu, lalu gzip; isi setelah dekompresi sama persis.
    const br = await serve('/website/gaya.css', { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    assert.equal(br.headers['Content-Encoding'], 'br');
    assert.ok(br.headers['Content-Length'] < Buffer.byteLength(CSS) / 5, 'Brotli seharusnya jauh lebih kecil.');
    assert.equal(zlib.brotliDecompressSync(br.bytes()).toString('utf8'), CSS);
    const gz = await serve('/website/gaya.css', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gz.headers['Content-Encoding'], 'gzip');
    assert.equal(zlib.gunzipSync(gz.bytes()).toString('utf8'), CSS);
    // q=0 berarti menolak.
    assert.equal((await serve('/website/gaya.css', { headers: { 'accept-encoding': 'br;q=0, gzip' } })).headers['Content-Encoding'], 'gzip');
    assert.equal((await serve('/website/gaya.css', { headers: { 'accept-encoding': 'gzip;q=0, br;q=0' } })).headers['Content-Encoding'], undefined);
    assert.equal((await serve('/website/gaya.css', { headers: { 'accept-encoding': 'identity' } })).headers['Content-Encoding'], undefined);
    // Berkas sangat kecil tidak layak dikompresi.
    assert.equal((await serve('/website/kecil.css', { headers: { 'accept-encoding': 'br' } })).headers['Content-Encoding'], undefined);
    assert.equal(zlib.brotliDecompressSync((await serve('/website/index.html', { headers: { 'accept-encoding': 'br' } })).bytes()).toString('utf8').startsWith('<!doctype html>'), true);

    // If-None-Match: 304 tanpa isi, dengan ETag dan Cache-Control yang sama, juga untuk versi terkompresi.
    const etag = html.headers.ETag;
    for (const encoding of [undefined, 'br', 'gzip']) {
      const headers = { 'if-none-match': etag };
      if (encoding) headers['accept-encoding'] = encoding;
      const kedua = await serve('/website/index.html', { headers });
      assert.equal(kedua.status, 304, `Permintaan ulang (${encoding || 'polos'}) seharusnya 304.`);
      assert.equal(kedua.bytes().length, 0);
      assert.equal(kedua.headers.ETag, etag);
      assert.equal(kedua.headers['Cache-Control'], 'no-cache');
    }
    assert.equal((await serve('/website/index.html', { headers: { 'if-none-match': `"lain", ${etag}` } })).status, 304, 'Daftar ETag.');
    assert.equal((await serve('/website/index.html', { headers: { 'if-none-match': etag.replace('W/', '') } })).status, 304, 'Perbandingan lemah.');
    assert.equal((await serve('/website/index.html', { headers: { 'if-none-match': '*' } })).status, 304);
    assert.equal((await serve('/website/index.html', { headers: { 'if-none-match': 'W/"salah"' } })).status, 200, 'ETag berbeda mengirim isi penuh.');

    // Berkas berubah -> ETag berubah -> isi baru, bukan salinan terkompresi yang basi.
    const sebelum = (await serve('/website/gaya.css', { headers: { 'accept-encoding': 'br' } }));
    const lama = path.join(SANDBOX, 'website', 'gaya.css');
    fs.writeFileSync(lama, `${CSS}.baru { color: red; }\n`, 'utf8');
    const waktu = new Date(Date.now() + 5000);
    fs.utimesSync(lama, waktu, waktu);
    const sesudah = await serve('/website/gaya.css', { headers: { 'accept-encoding': 'br' } });
    assert.notEqual(sesudah.headers.ETag, sebelum.headers.ETag);
    assert.match(zlib.brotliDecompressSync(sesudah.bytes()).toString('utf8'), /\.baru/);
    assert.equal((await serve('/website/gaya.css', { headers: { 'if-none-match': sebelum.headers.ETag } })).status, 200, 'ETag lama tidak lagi cocok.');

    // 404 tetap 404, tanpa ETag.
    const hilang = await serve('/website/tidak-ada.css');
    assert.equal(hilang.status, 404);
    assert.equal(hilang.headers.ETag, undefined);

    console.log('static cache tests passed');
  } finally {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
