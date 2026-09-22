// Halaman artikel dirender server (Task R7.3).
const assert = require('node:assert/strict');
const path = require('node:path');
const { readTemplate, renderArticlePage } = require('./article-page.js');

const template = readTemplate(path.resolve(__dirname, '..'));
const ORIGIN = 'https://hamasah.example';
const artikel = {
  slug: 'kabar-kairo',
  title: 'Kabar $& Kairo <script>alert(1)</script>',
  excerpt: 'Ringkasan "kutip" & <b>tebal</b> $1',
  body: 'Paragraf pertama.\n\n<img src=x onerror=alert(1)>\n\nParagraf $` ketiga.',
  category: 'Kegiatan',
  publishedAt: '2026-09-01T08:00:00.000Z',
  authorName: 'Ustadzah Contoh',
  coverUrl: 'https://cdn.example/cover.jpg',
  coverAltText: 'Santri di serambi masjid'
};

const { status, html } = renderArticlePage({ template, article: artikel, origin: ORIGIN });
assert.equal(status, 200);

// Tanpa menjalankan JavaScript: judul, deskripsi, dan isi sudah ada di HTML.
assert.ok(html.includes('<title>Kabar $&amp; Kairo &lt;script&gt;alert(1)&lt;/script&gt; | Hamasah International</title>'));
assert.ok(html.includes('<meta name="description" content="Ringkasan &quot;kutip&quot; &amp; &lt;b&gt;tebal&lt;/b&gt; $1" />'));
assert.ok(html.includes('<p>Paragraf pertama.</p>'));
assert.ok(html.includes('<p>Paragraf $` ketiga.</p>'), 'Pola $ tidak boleh ditafsirkan.');
assert.ok(!html.includes('Memuat artikel'), 'Kerangka memuat harus sudah diganti.');
assert.ok(html.includes('<strong>Ustadzah Contoh</strong>'));
assert.ok(html.includes('Diterbitkan pada 1 September 2026'));

// Tidak ada injeksi HTML dari isi artikel.
assert.ok(!html.includes('<script>alert'));
assert.ok(!html.includes('<img src=x'));
assert.ok(!html.includes('<b>tebal'));
assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));

// Tag bagikan mencerminkan artikel yang dibuka.
const url = `${ORIGIN}/website/article.html?slug=kabar-kairo`;
assert.ok(html.includes(`<link rel="canonical" href="${url}" />`));
assert.ok(html.includes(`<meta property="og:url" content="${url}" />`));
assert.ok(html.includes('<meta property="og:type" content="article" />'));
assert.ok(html.includes('<meta property="og:title" content="Kabar $&amp; Kairo &lt;script&gt;alert(1)&lt;/script&gt; | Hamasah International" />'));
assert.ok(html.includes('<meta property="og:image" content="https://cdn.example/cover.jpg" />'));
assert.ok(html.includes('<meta property="og:image:alt" content="Santri di serambi masjid" />'));
assert.ok(html.includes('<meta property="article:published_time" content="2026-09-01T08:00:00.000Z" />'));
assert.equal((html.match(/<title>/g) || []).length, 1);

// Tanpa cover: gambar bagikan default. Tanpa penulis: fallback redaksi yang menyebut dirinya fallback.
const lama = renderArticlePage({ template, article: { ...artikel, coverUrl: null, authorName: null, publishedAt: null }, origin: ORIGIN }).html;
assert.ok(lama.includes(`<meta property="og:image" content="${ORIGIN}/assets/og-default.jpg" />`));
assert.ok(lama.includes('<strong>Tim Redaksi Hamasah International</strong><small>Penulis tidak tercatat · Tanggal terbit belum tercatat</small>'));
assert.ok(!lama.includes('September 2026'), 'Tidak ada tanggal karangan.');

// Tidak ada atau belum terbit: 404, noindex, tanpa canonical dan tag bagikan.
const hilang = renderArticlePage({ template, article: null, origin: ORIGIN });
assert.equal(hilang.status, 404);
assert.ok(hilang.html.includes('<meta name="robots" content="noindex" />'));
assert.ok(hilang.html.includes('Artikel Tidak Ditemukan'));
assert.ok(!hilang.html.includes('rel="canonical"'));
assert.ok(!hilang.html.includes('og:title'));

console.log('article page tests passed');
