'use strict';

// Ukuran skala yang relevan (Task R5.4).
//
// Dua skrip performa yang lama tidak akan pernah mendeteksi masalah yang ditemukan audit:
// performance-smoke memanggil fungsi di dalam proses dengan store memori, dan
// http-performance memanggil /api/health yang sengaja tidak menyentuh database. Yang di
// sini mengukur dua hal yang benar-benar menentukan biaya bagi pengguna:
//
//   1. Jumlah query SQL dan waktu GET /api/registrations pada 20 lalu 200 pendaftar.
//      Yang dijaga adalah TUMBUHNYA: jumlah query tidak boleh mengikuti jumlah pendaftar
//      (temuan E-01: 1 + N query, sehingga 1.000 pendaftar = 1.001 query).
//   2. Berat halaman portal: jumlah byte yang benar-benar melintas di jaringan untuk HTML,
//      CSS, dan JS yang ditautkannya (temuan E-03: 266 KB tanpa kompresi).
//
// Bukan `.test.js`, sehingga tidak ikut `npm test`, dan SENGAJA gagal selama E-01 dan E-03
// belum diperbaiki (R6.1 dan R6.3). Angka awal dicatat di docs/REMEDIASI_R5_HASIL_*.md dan
// angka sesudah R6 di R6; skrip yang sama dipakai untuk keduanya.
//
//   npm run test:scale            jalankan dan tegakkan ambang
//   npm run test:scale -- --json  cetak angkanya sebagai JSON (untuk dicatat)

const http = require('node:http');
const path = require('node:path');
const { createHamasahApp } = require('../server/app.js');
const { createTestDatabase } = require('../server/test-support/database.js');
const { createRelaxedRateLimiter } = require('../server/test-support/rate-limit.js');

const ROOT = path.resolve(__dirname, '..');

// Ambang. Pertumbuhan query dari 20 ke 200 pendaftar boleh paling banyak 2 (misalnya
// satu query hitung tambahan); satu query berpaginasi tidak tumbuh sama sekali.
const LIMITS = Object.freeze({
  smallCount: 20,
  largeCount: 200,
  maxQueryGrowth: 2,
  maxListMs: 1500,
  maxPortalWireBytes: 150 * 1024
});

// Membungkus database supaya setiap query terhitung, termasuk yang di dalam transaksi.
function countingDatabase(inner) {
  const counter = { queries: 0 };
  return {
    counter,
    query(sql, params) { counter.queries += 1; return inner.query(sql, params); },
    exec: inner.exec ? (sql) => { counter.queries += 1; return inner.exec(sql); } : undefined,
    withTransaction(work) {
      return inner.withTransaction((tx) => work({
        query(sql, params) { counter.queries += 1; return tx.query(sql, params); },
        exec: tx.exec ? (sql) => { counter.queries += 1; return tx.exec(sql); } : undefined
      }));
    },
    close: () => inner.close()
  };
}

async function request(baseUrl, method, pathname, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, body: type.includes('application/json') ? await response.json() : await response.text() };
}

function registrationBody(index) {
  const suffix = String(index).padStart(4, '0');
  return {
    applicantName: `Calon Skala ${suffix}`, phone: `0812${suffix}0001`, guardianName: `Wali Skala ${suffix}`,
    guardianPhone: `0812${suffix}0002`, email: `skala${suffix}@example.test`, guardianEmail: `wali.skala${suffix}@example.test`,
    birthDate: '2004-01-01', gender: 'putra', schoolOrigin: 'SMA Uji', guardianConsent: true,
    program: 'kuliah-al-azhar', educationLevel: 'SMA', city: 'Bandung', consent: true, dataProcessingConsent: true
  };
}

async function measureRegistrations(baseUrl, counter, token) {
  const measured = [];
  let created = 0;
  for (const target of [LIMITS.smallCount, LIMITS.largeCount]) {
    while (created < target) {
      created += 1;
      const posted = await request(baseUrl, 'POST', '/api/registrations', { body: registrationBody(created) });
      if (posted.status !== 201) throw new Error(`Gagal membuat pendaftar ${created}: HTTP ${posted.status} ${JSON.stringify(posted.body)}`);
    }
    counter.queries = 0;
    const started = performance.now();
    const listed = await request(baseUrl, 'GET', '/api/registrations', { token });
    const elapsedMs = performance.now() - started;
    if (listed.status !== 200) throw new Error(`GET /api/registrations: HTTP ${listed.status}`);
    measured.push({ registrations: target, queries: counter.queries, ms: Math.round(elapsedMs) });
  }
  return measured;
}

// Byte mentah di jaringan (setelah kompresi bila ada), bukan ukuran setelah didekompresi.
function fetchRaw(baseUrl, pathname, acceptEncoding) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${pathname}`, { headers: { 'Accept-Encoding': acceptEncoding } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        encoding: response.headers['content-encoding'] || 'identity',
        wireBytes: Buffer.concat(chunks).length,
        type: response.headers['content-type'] || ''
      }));
    }).on('error', reject);
  });
}

async function measurePortalWeight(baseUrl, page) {
  const html = await request(baseUrl, 'GET', `/website/${page}`);
  if (html.status !== 200) throw new Error(`/website/${page}: HTTP ${html.status}`);
  const assets = [];
  for (const match of html.body.matchAll(/<(?:link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref|script\b[^>]*\bsrc)=["']([^"']+)["']/gi)) {
    const ref = match[1].split('?')[0];
    if (/^(?:https?:)?\/\//i.test(ref)) continue;
    assets.push(`/website/${ref.replace(/^\.\//, '')}`);
  }
  const resources = [`/website/${page}`, ...new Set(assets)];
  const rows = [];
  for (const resource of resources) {
    const compressed = await fetchRaw(baseUrl, resource, 'gzip, br');
    const plain = await fetchRaw(baseUrl, resource, 'identity');
    if (compressed.status !== 200) throw new Error(`${resource}: HTTP ${compressed.status}`);
    rows.push({ resource, wireBytes: compressed.wireBytes, encoding: compressed.encoding, identityBytes: plain.wireBytes });
  }
  return {
    page,
    rows,
    wireBytes: rows.reduce((sum, row) => sum + row.wireBytes, 0),
    identityBytes: rows.reduce((sum, row) => sum + row.identityBytes, 0)
  };
}

async function main() {
  const wantJson = process.argv.includes('--json');
  const inner = await createTestDatabase();
  const database = countingDatabase(inner);
  const app = createHamasahApp({
    rootDirectory: ROOT,
    database,
    bootstrapKey: 'bootstrap-skala-uji',
    rateLimiter: createRelaxedRateLimiter()
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const failures = [];
  let report;
  try {
    const password = 'kata-sandi-skala-uji';
    await request(baseUrl, 'POST', '/api/auth/bootstrap', { token: 'bootstrap-skala-uji', body: { name: 'Admin Skala', email: 'admin@hamasah.test', password } });
    const login = await request(baseUrl, 'POST', '/api/auth/login', { body: { email: 'admin@hamasah.test', password } });
    if (login.status !== 200) throw new Error(`Login gagal: HTTP ${login.status}`);

    const registrations = await measureRegistrations(baseUrl, database.counter, login.body.accessToken);
    const portal = await measurePortalWeight(baseUrl, 'portal.html');
    report = { limits: LIMITS, registrations, portal };

    const [small, large] = registrations;
    const growth = large.queries - small.queries;
    if (growth > LIMITS.maxQueryGrowth) {
      failures.push(`GET /api/registrations: query tumbuh ${growth} dari ${small.registrations} ke ${large.registrations} pendaftar (${small.queries} -> ${large.queries}); ambang ${LIMITS.maxQueryGrowth}. Jumlah query mengikuti jumlah pendaftar (E-01).`);
    }
    if (large.ms > LIMITS.maxListMs) failures.push(`GET /api/registrations pada ${large.registrations} pendaftar: ${large.ms} ms; ambang ${LIMITS.maxListMs} ms.`);
    if (portal.wireBytes > LIMITS.maxPortalWireBytes) {
      failures.push(`Berat portal.html beserta CSS dan JS: ${(portal.wireBytes / 1024).toFixed(1)} KB di jaringan; ambang ${(LIMITS.maxPortalWireBytes / 1024).toFixed(0)} KB (E-03).`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }

  if (wantJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('GET /api/registrations');
    for (const row of report.registrations) console.log(`  ${String(row.registrations).padStart(4)} pendaftar: ${String(row.queries).padStart(4)} query, ${row.ms} ms`);
    console.log(`Berat ${report.portal.page} (HTML + CSS + JS, tanpa font eksternal)`);
    for (const row of report.portal.rows) console.log(`  ${(row.wireBytes / 1024).toFixed(1).padStart(7)} KB di jaringan (${row.encoding}), ${(row.identityBytes / 1024).toFixed(1).padStart(7)} KB tanpa kompresi  ${row.resource}`);
    console.log(`  ${(report.portal.wireBytes / 1024).toFixed(1).padStart(7)} KB total di jaringan, ${(report.portal.identityBytes / 1024).toFixed(1)} KB tanpa kompresi`);
  }
  if (failures.length) {
    console.error('\nMelewati ambang:');
    failures.forEach((item) => console.error(`- ${item}`));
    return 1;
  }
  console.log('\nscale check passed');
  return 0;
}

main().then((code) => { process.exitCode = code; }, (error) => { console.error(error); process.exitCode = 2; });
