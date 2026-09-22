// Markdown terbatas untuk isi artikel (Task R7.5).
const assert = require('node:assert/strict');
const { renderMarkdown } = require('./article-markdown.js');

// Subset yang disepakati.
assert.equal(renderMarkdown('## Persiapan\n\n### Berkas'), '<h2>Persiapan</h2>\n        <h3>Berkas</h3>');
assert.equal(renderMarkdown('- paspor\n- ijazah'), '<ul><li>paspor</li><li>ijazah</li></ul>');
assert.equal(renderMarkdown('* satu\n* dua'), '<ul><li>satu</li><li>dua</li></ul>');
assert.equal(renderMarkdown('1. daftar\n2. tes'), '<ol><li>daftar</li><li>tes</li></ol>');
assert.equal(renderMarkdown('- a\n\n- b\n\n1. c\n\n2. d'), '<ul><li>a</li><li>b</li></ul>\n        <ol><li>c</li><li>d</li></ol>');
assert.equal(renderMarkdown('> Ilmu itu cahaya.'), '<blockquote><p>Ilmu itu cahaya.</p></blockquote>');
assert.equal(renderMarkdown('**tebal** dan *miring* dan _juga_'), '<p><strong>tebal</strong> dan <em>miring</em> dan <em>juga</em></p>');
assert.equal(renderMarkdown('[Al-Azhar](https://www.azhar.eg/)'), '<p><a href="https://www.azhar.eg/" rel="nofollow noopener">Al-Azhar</a></p>');
assert.equal(renderMarkdown('[surel](mailto:info@contoh.test)'), '<p><a href="mailto:info@contoh.test" rel="nofollow noopener">surel</a></p>');
assert.equal(renderMarkdown('## Judul\nlangsung teks'), '<h2>Judul</h2>\n        <p>langsung teks</p>');

// Teks polos lama tetap tampil sama: paragraf dipisah baris kosong.
assert.equal(renderMarkdown('Paragraf satu.\n\nParagraf dua.'), '<p>Paragraf satu.</p>\n        <p>Paragraf dua.</p>');
assert.equal(renderMarkdown('Harga 2 * 3 = 6, nama_file_ini, 5*4'), '<p>Harga 2 * 3 = 6, nama_file_ini, 5*4</p>');
assert.equal(renderMarkdown('# bukan heading'), '<p># bukan heading</p>');
assert.equal(renderMarkdown(''), '');
assert.equal(renderMarkdown('a\r\n\r\nb'), '<p>a</p>\n        <p>b</p>');

// HTML mentah tidak pernah dieksekusi; skema tautan berbahaya menjadi teks.
const serangan = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[klik](javascript:alert(1))',
  '[klik](data:text/html,<script>alert(1)</script>)',
  '[x](https://a.test/"onmouseover="alert(1))',
  '**<b>tebal</b>**',
  '## <iframe src=//evil>',
  '> <svg onload=alert(1)>'
];
for (const input of serangan) {
  const html = renderMarkdown(input);
  assert.ok(!/<(?:script|img|iframe|svg|b)[\s>]/i.test(html), `${input} -> ${html}`);
  assert.ok(!/href="(?:javascript|data):/i.test(html), `${input} -> ${html}`);
  assert.ok(!/"\s*on\w+=/i.test(html), `${input} -> ${html}`);
}
assert.equal(renderMarkdown('[klik](javascript:alert(1))'), '<p>[klik](javascript:alert(1))</p>');

console.log('article markdown tests passed');
