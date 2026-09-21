// Versi aset di setiap halaman harus sama dengan sidik isi berkasnya, dan satu berkas hanya
// boleh diminta lewat satu URL (Task R6.3). Bila gagal: `npm run stamp:assets`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run, stampHtml } = require('./stamp-assets.js');

const { problems } = run({ check: true });
assert.deepEqual(problems, [], `Versi aset usang atau berkas hilang:\n${problems.join('\n')}\nJalankan: npm run stamp:assets`);

// Satu berkas, satu URL di seluruh halaman.
const website = path.resolve(__dirname, '..', 'website');
const urlsByFile = new Map();
for (const name of fs.readdirSync(website).filter((entry) => entry.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(website, name), 'utf8');
  for (const match of html.matchAll(/(?:href|src)="([^"?#]+\.(?:css|js))(\?v=[^"#]*)?"/gi)) {
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(match[1])) continue;
    const key = path.resolve(website, match[1]);
    if (!urlsByFile.has(key)) urlsByFile.set(key, new Set());
    urlsByFile.get(key).add(match[1] + (match[2] || ''));
  }
}
for (const [file, urls] of urlsByFile) {
  assert.equal(urls.size, 1, `${path.basename(file)} diminta lewat ${urls.size} URL berbeda: ${[...urls].join(', ')}`);
}

// Pemasangan bersifat idempoten dan hanya menyentuh versi.
const contoh = '<link rel="stylesheet" href="website-core.css?v=1"><script src="nav.js"></script><script src="https://cdn.example.test/x.js"></script>';
const sekali = stampHtml(contoh);
assert.equal(sekali.stale.length, 2);
assert.match(sekali.html, /website-core\.css\?v=[0-9a-f]{10}"/);
assert.match(sekali.html, /nav\.js\?v=[0-9a-f]{10}"/);
assert.ok(sekali.html.includes('https://cdn.example.test/x.js"'), 'Skrip eksternal tidak boleh diberi versi.');
assert.equal(stampHtml(sekali.html).stale.length, 0);

console.log(`asset version tests passed (${urlsByFile.size} berkas, satu URL per berkas)`);
