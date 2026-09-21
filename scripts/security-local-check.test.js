const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('./security-local-check.js');

// Pohon proyek minimal yang lolos semua pemeriksaan; tiap kasus merusaknya satu per satu.
function buatProyek(berkasWebsite = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-sec-'));
  fs.mkdirSync(path.join(root, 'server/http'), { recursive: true });
  fs.mkdirSync(path.join(root, 'website'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ packages: {} }));
  fs.writeFileSync(path.join(root, 'server/http/security-headers.js'), "module.exports = { 'X-Content-Type-Options': 'nosniff' };\n");
  for (const [nama, isi] of Object.entries(berkasWebsite)) fs.writeFileSync(path.join(root, 'website', nama), isi);
  return root;
}

function temuan(berkasWebsite) {
  return run(buatProyek(berkasWebsite), { audit: false }).findings;
}

// Pohon bersih lulus, dan contoh isian (placeholder) bukan kredensial.
assert.deepEqual(temuan({ 'ok.html': '<input type="email" placeholder="nama@hamasah.test">\n' }), []);

// Kredensial pengujian di berkas publik: berkas dan baris disebut.
const kredensial = temuan({ 'portal.js': "const a = 1;\nemail.value = 'santri@hamasah.test';\npassInput.value = 'kata-sandi-dev';\n" });
assert.ok(kredensial.includes('website/portal.js:2: alamat email akun pengujian tersaji publik'), kredensial.join('\n'));
assert.ok(kredensial.includes('website/portal.js:3: kata sandi literal tersaji publik'), kredensial.join('\n'));
assert.ok(temuan({ 'a.js': "post({ password: 'rahasia123' });\n" }).some((baris) => baris.startsWith('website/a.js:1: kata sandi')));
assert.ok(temuan({ 'a.html': '<input type="password" value="rahasia">\n' }).some((baris) => baris.startsWith('website/a.html:1: kata sandi')));
// Nilai dinamis bukan literal.
assert.deepEqual(temuan({ 'b.js': "post({ password: document.querySelector('#p').value });\n" }), []);

// Berkas server yang tersaji publik.
assert.ok(temuan({ 'x.test.js': '// uji\n' }).includes('website/x.test.js: berkas test tidak boleh tersaji publik'));
assert.ok(temuan({ 'CATATAN.md': '# catatan\n' }).some((baris) => baris.startsWith('website/CATATAN.md')));
assert.ok(temuan({ 'svc.js': "const s = require('../server/db.js');\n" }).includes('website/svc.js:1: berkas publik me-require modul server'));

// Pemeriksaan lama tetap berjalan, kini dengan nomor baris.
const root = buatProyek();
fs.writeFileSync(path.join(root, 'server/log.js'), "const a = 1;\nconsole.log('token', token);\n");
assert.ok(run(root, { audit: false }).findings.includes('server/log.js:2: kemungkinan secret dicetak ke log server'));
fs.rmSync(path.join(root, 'package-lock.json'));
assert.ok(run(root, { audit: false }).findings.includes('package-lock.json tidak ada'));

// npm audit: di atas ambang memblokir, di bawah ambang hanya dicatat, dan audit yang
// tidak bisa dijalankan tidak diam-diam lulus.
const bersih = buatProyek();
const blokir = run(bersih, { audit: () => ({ findings: ['npm audit: 1 kerentanan tingkat high (ambang high)'], notes: [] }) });
assert.equal(blokir.ok, false);
const dicatat = run(bersih, { audit: () => ({ findings: [], notes: ['npm audit: 2 kerentanan tingkat low (di bawah ambang, dicatat)'] }) });
assert.equal(dicatat.ok, true);
assert.equal(dicatat.notes.length, 1);

// Pohon proyek yang sebenarnya bersih (tanpa audit, agar test tidak butuh jaringan).
const nyata = run(path.resolve(__dirname, '..'), { audit: false });
assert.equal(nyata.ok, true, nyata.findings.join('; '));
console.log('security local check tests passed');
