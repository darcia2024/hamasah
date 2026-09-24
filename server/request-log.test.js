// Setiap respons membawa X-Request-Id, dan error 500 mencatat kode yang sama di
// log (satu baris JSON) dan di pesan untuk pengguna.

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { createHamasahApp } = require('./app.js');
const { createRequestId, logEvent } = require('./http/request-log.js');
const { createTestDatabase } = require('./test-support/database.js');

const POLA_KODE = /^HI-[2-9A-HJKMNP-Z]{8}$/;

test('kode permintaan pendek, tanpa karakter yang mirip, dan berbeda tiap kali', () => {
  const kode = new Set();
  for (let i = 0; i < 500; i += 1) {
    const satu = createRequestId();
    assert.match(satu, POLA_KODE);
    kode.add(satu);
  }
  assert.equal(kode.size, 500);
});

test('logEvent menulis satu baris JSON', () => {
  const tertulis = [];
  const sink = { log: (baris) => tertulis.push(['log', baris]), error: (baris) => tertulis.push(['error', baris]) };
  logEvent('error', 'uji', { requestId: 'HI-ABCDEFGH' }, sink);
  assert.equal(tertulis.length, 1);
  assert.equal(tertulis[0][0], 'error');
  assert.ok(!tertulis[0][1].includes('\n'));
  const isi = JSON.parse(tertulis[0][1]);
  assert.equal(isi.event, 'uji');
  assert.equal(isi.requestId, 'HI-ABCDEFGH');
  assert.ok(isi.time);
});

test('error 500 membawa kode yang sama di header, body, dan log', async () => {
  const database = await createTestDatabase();
  const log = [];
  const logger = { log() {}, warn() {}, info() {}, error: (baris) => log.push(baris) };
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    auditRetention: false,
    logger,
    // Sitemap membaca artikel dari store; store ini sengaja gagal.
    articleStore: {
      async listPublishedForSitemap() { throw new Error('database putus di tengah jalan'); }
    }
  });
  const server = http.createServer(app.requestListener());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const sehat = await fetch(`${baseUrl}/api/health`);
    assert.match(sehat.headers.get('x-request-id'), POLA_KODE);

    const gagal = await fetch(`${baseUrl}/sitemap.xml?token=rahasia-jangan-dicatat`);
    assert.equal(gagal.status, 500);
    const kode = gagal.headers.get('x-request-id');
    assert.match(kode, POLA_KODE);
    const body = await gagal.json();
    assert.equal(body.requestId, kode);
    assert.ok(body.error.includes(kode), 'Pesan untuk pengguna menyebutkan kode.');
    assert.ok(!body.error.includes('database putus'), 'Detail error tidak bocor ke pengguna.');

    const baris = log.map((isi) => JSON.parse(isi)).find((isi) => isi.event === 'request_failed');
    assert.ok(baris, 'Kegagalan tercatat sebagai request_failed.');
    assert.equal(baris.requestId, kode);
    assert.equal(baris.path, '/sitemap.xml');
    assert.equal(baris.error, 'database putus di tengah jalan');
    assert.ok(!JSON.stringify(baris).includes('rahasia-jangan-dicatat'), 'Query string tidak ikut dicatat.');

    console.log('request log tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
});
