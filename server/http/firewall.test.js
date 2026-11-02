// Firewall: permintaan nakal ditolak, dan tidak ada halaman, aset, atau rute sah yang ikut tertolak.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const { PANJANG_URL_MAKS, periksaPermintaan } = require('./firewall.js');
const { createHamasahApp } = require('../app.js');
const { createTestDatabase } = require('../test-support/database.js');

const ROOT = path.resolve(__dirname, '..', '..');
const cek = (url, method = 'GET') => periksaPermintaan({ url, method });

function semuaBerkas(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entri) => {
    const lokasi = path.join(folder, entri.name);
    return entri.isDirectory() ? semuaBerkas(lokasi) : [lokasi];
  });
}

test('menolak URL rusak, traversal, dan alamat kepanjangan', () => {
  for (const url of ['//', '//evil.example/', 'http://[bad/', 'http://evil.example/', '*', '', '/%', '/a%zz']) {
    assert.deepEqual(cek(url), { status: 400, aturan: 'url-rusak' }, url);
  }
  for (const url of ['/website/../package.json', '/website/..%2f..%2fpackage.json', '/assets/%2e%2e/package.json', '/assets/..%5c..%5cpackage.json', '/a%00.html', '/api/../package.json']) {
    assert.deepEqual(cek(url), { status: 400, aturan: 'traversal' }, url);
  }
  assert.equal(cek(`/${'a'.repeat(PANJANG_URL_MAKS)}`).status, 414);
});

test('menolak metode berbahaya, dan metode tulis ke halaman', () => {
  for (const method of ['TRACE', 'TRACK', 'CONNECT']) {
    assert.equal(cek('/', method).status, 405, method);
    assert.equal(cek('/api/me', method).status, 405, method);
  }
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.equal(cek('/biaya', method).status, 405, method);
    assert.equal(cek('/api/uploads/abc/content', method), null, `${method} ke API tetap lewat`);
  }
  // Formulir halaman bermetode post: kiriman sebelum JS termuat tidak boleh jadi galat.
  assert.equal(cek('/daftar', 'POST'), null);
});

test('menolak penyisiran otomatis dengan 404', () => {
  for (const url of ['/.env', '/.git/config', '/.aws/credentials', '/website/.env', '/wp-login.php', '/wp-admin/', '/wp-content/x.png', '/xmlrpc.php', '/phpmyadmin/', '/cgi-bin/test', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/backup.sql', '/db.zip', '/index.php?x=1', '/actuator/health', '/etc/passwd']) {
    assert.deepEqual(cek(url), { status: 404, aturan: 'penyisiran' }, url);
  }
});

test('semua berkas website dan assets lolos, di alamat bersih maupun lama', () => {
  const berkas = [...semuaBerkas(path.join(ROOT, 'website')), ...semuaBerkas(path.join(ROOT, 'assets'))]
    .map((lokasi) => path.relative(ROOT, lokasi).split(path.sep).join('/'));
  assert.ok(berkas.length > 100, 'Daftar berkas tidak terbaca.');
  for (const nama of berkas) {
    assert.equal(cek(`/${nama}?v=abc123`), null, nama);
    if (nama.startsWith('website/')) {
      const akar = nama.slice('website/'.length);
      assert.equal(cek(`/${akar}`), null, akar);
      if (akar.endsWith('.html')) assert.equal(cek(`/${akar.slice(0, -5)}`), null, akar);
    }
  }
});

test('alamat sah lainnya lolos, termasuk query yang berisi teks bebas', () => {
  for (const url of ['/', '/?__x=1', '/article?slug=tips-lulus', '/article?q=1%20OR%201=1', '/cari?q=%3Cscript%3E', '/kontak?topic=a..b', '/.well-known/security.txt', '/.well-known/acme-challenge/abc', '/media/galeri/123e4567-e89b-12d3-a456-426614174000.jpg', '/api/health', '/api/registrations/HI-REG-2026-00001', '/api/pratinjau/pin', '/%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest']) {
    assert.equal(cek(url), null, url);
  }
});

function kirimMentah(port, baris) {
  return new Promise((resolve, reject) => {
    const soket = net.connect(port, '127.0.0.1');
    let data = '';
    soket.setTimeout(5000, () => { soket.destroy(); reject(new Error(`Tidak dijawab: ${baris}`)); });
    soket.on('data', (d) => { data += d.toString('latin1'); });
    soket.on('close', () => resolve(data));
    soket.on('error', reject);
    soket.write(`${baris} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
  });
}

test('terpasang di aplikasi: dijawab, berheader aman, dan PIN dibatasi', async () => {
  const database = await createTestDatabase();
  const catatan = [];
  const app = createHamasahApp({
    rootDirectory: ROOT,
    database,
    auditRetention: false,
    sitePin: '0001',
    logger: { log: (b) => catatan.push(b), info: (b) => catatan.push(b), warn: (b) => catatan.push(b), error: (b) => catatan.push(b) }
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    // Sebelum firewall, dua permintaan ini menggantung tanpa jawaban.
    assert.match(await kirimMentah(port, 'GET //'), /^HTTP\/1\.1 400 /);
    assert.match(await kirimMentah(port, 'GET http://[bad/'), /^HTTP\/1\.1 400 /);
    const env = await kirimMentah(port, 'GET /.env');
    assert.match(env, /^HTTP\/1\.1 404 /);
    assert.match(env, /x-content-type-options: nosniff/i);
    assert.match(await kirimMentah(port, 'TRACE /'), /^HTTP\/1\.1 405 /);
    assert.ok(catatan.some((baris) => baris.includes('firewall_blocked') && baris.includes('penyisiran')), 'Penolakan tidak tercatat.');

    // Jalur sah tetap jalan.
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/qohiroh`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/biaya`, { redirect: 'manual' })).status, 401, 'Gerbang PIN tetap bekerja.');

    // Menebak PIN berhenti di percobaan ke-11, dan PIN benar tetap memberi cookie sebelum batas.
    const kirimPin = (pin) => fetch(`${baseUrl}/api/pratinjau/pin`, {
      method: 'POST', redirect: 'manual', body: `pin=${pin}&kembali=%2F`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const benar = await kirimPin('0001');
    assert.equal(benar.status, 303);
    assert.ok(benar.headers.get('set-cookie'));
    for (let i = 0; i < 9; i += 1) assert.equal((await kirimPin('1234')).status, 303);
    assert.equal((await kirimPin('0001')).status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
});
