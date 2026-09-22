'use strict';

// Satu sumber versi untuk aset halaman (Task R6.3).
//
// Sebelumnya versi ditulis tangan dan berbeda antar halaman: index.html memuat
// website.css?v=21 sementara halaman internal memuat website.css?v=18, sehingga berkas yang
// sama diunduh dua kali sebagai dua URL. Sekarang versi = sidik isi berkas, dihitung di sini
// dan dipasang ke SEMUA halaman. Berkas yang berubah otomatis berganti URL, dan itulah yang
// membuat cache setahun (immutable) di server/http/static.js aman.
//
//   npm run stamp:assets           pasang versi baru ke website/*.html
//   npm run stamp:assets -- --check   hanya periksa (kode keluar 1 bila ada yang usang)
//
// Yang diberi versi: CSS dan JS lokal yang ditautkan lewat <link href> dan <script src>.
// scripts/asset-versions.test.js menjalankan pemeriksaan ini di `npm test`.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const WEBSITE = path.resolve(__dirname, '..', 'website');
const REFERENCE = /(<(?:link|script)\b[^>]*?\b(?:href|src)=")([^"?#]+\.(?:css|js))(\?v=[^"#]*)?(")/gi;

// Akhir baris dinormalkan supaya sidik sama di Windows (core.autocrlf) dan Linux.
function fingerprint(file) {
  const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
}

function isLocal(reference) {
  return !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(reference) && !reference.startsWith('data:');
}

// Mengembalikan { html, stale, missing } untuk satu halaman. `stale` berisi referensi yang
// versinya belum sama dengan sidik isi berkasnya.
function stampHtml(html, pageDirectory = WEBSITE) {
  const stale = [];
  const missing = [];
  const stamped = html.replace(REFERENCE, (match, before, reference, version, after) => {
    if (!isLocal(reference)) return match;
    const file = path.resolve(pageDirectory, reference);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missing.push(reference);
      return match;
    }
    const wanted = `?v=${fingerprint(file)}`;
    if (version !== wanted) stale.push({ reference, found: version || '(tanpa versi)', wanted });
    return `${before}${reference}${wanted}${after}`;
  });
  return { html: stamped, stale, missing };
}

function pages() {
  return fs.readdirSync(WEBSITE).filter((name) => name.endsWith('.html')).sort();
}

function run({ check = false } = {}) {
  const problems = [];
  let changed = 0;
  for (const name of pages()) {
    const file = path.join(WEBSITE, name);
    const original = fs.readFileSync(file, 'utf8');
    const result = stampHtml(original);
    result.missing.forEach((reference) => problems.push(`${name}: ${reference} tidak ada`));
    if (result.stale.length) {
      result.stale.forEach((item) => problems.push(`${name}: ${item.reference} berversi ${item.found}, seharusnya ${item.wanted}`));
      if (!check) {
        fs.writeFileSync(file, result.html);
        changed += 1;
      }
    }
  }
  return { problems, changed };
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const { problems, changed } = run({ check });
  const missing = problems.filter((line) => line.endsWith('tidak ada'));
  if (check && problems.length) {
    problems.forEach((line) => console.error(`- ${line}`));
    console.error('Jalankan: npm run stamp:assets');
    process.exitCode = 1;
  } else if (missing.length) {
    missing.forEach((line) => console.error(`- ${line}`));
    process.exitCode = 1;
  } else {
    console.log(check ? 'versi aset sudah mutakhir' : `versi aset dipasang (${changed} halaman diubah)`);
  }
}

module.exports = { fingerprint, run, stampHtml };
