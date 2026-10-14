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
assert.ok(html.includes(' menit baca · 1 September 2026</small>'), 'Baris penulis: waktu baca dan tanggal terbit.');
// Susunan halaman baca: judul, ringkasan sebagai subjudul, sampul berbingkai, dua set tombol bagikan.
assert.ok(html.includes('<h1 class="story-title">'));
assert.ok(html.includes('<p class="story-subtitle">Ringkasan &quot;kutip&quot; &amp; &lt;b&gt;tebal&lt;/b&gt; $1</p>'));
assert.ok(html.includes('<figure class="story-cover">'));
assert.equal((html.match(/data-share="wa"/g) || []).length, 2);
assert.equal((html.match(/data-share="copy"/g) || []).length, 2);
// Tanpa daftar tulisan lain, bagiannya kosong (disembunyikan CSS).
assert.ok(/<section id="article-related"[^>]*><\/section>/.test(html));

// Tidak ada injeksi HTML dari isi artikel.
assert.ok(!html.includes('<script>alert'));
assert.ok(!html.includes('<img src=x'));
assert.ok(!html.includes('<b>tebal'));
assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));

// Tag bagikan mencerminkan artikel yang dibuka.
const url = `${ORIGIN}/article?slug=kabar-kairo`;
assert.ok(html.includes(`<link rel="canonical" href="${url}" />`));
assert.ok(html.includes(`<meta property="og:url" content="${url}" />`));
assert.ok(html.includes('<meta property="og:type" content="article" />'));
assert.ok(html.includes('<meta property="og:title" content="Kabar $&amp; Kairo &lt;script&gt;alert(1)&lt;/script&gt; | Hamasah International" />'));
assert.ok(html.includes('<meta property="og:image" content="https://cdn.example/cover.jpg" />'));
assert.ok(html.includes('<meta property="og:image:alt" content="Santri di serambi masjid" />'));
assert.ok(html.includes('<meta property="article:published_time" content="2026-09-01T08:00:00.000Z" />'));
assert.equal((html.match(/<title>/g) || []).length, 1);

// Tanpa cover: gambar bagikan default. Tanpa penulis: fallback redaksi yang menyebut dirinya fallback.
// Sampul di situs sendiri (path) menjadi URL absolut di tag bagikan, dan tetap path di <img>.
const lokal = renderArticlePage({ template, article: { ...artikel, coverUrl: '/assets/artikel/contoh.jpg' }, origin: ORIGIN }).html;
assert.ok(lokal.includes(`content="${ORIGIN}/assets/artikel/contoh.jpg"`), 'og:image absolut.');
assert.ok(lokal.includes('src="/assets/artikel/contoh.jpg"'));

const lama = renderArticlePage({ template, article: { ...artikel, coverUrl: null, authorName: null, publishedAt: null }, origin: ORIGIN }).html;
assert.ok(lama.includes(`<meta property="og:image" content="${ORIGIN}/assets/og-default.jpg" />`));
assert.ok(lama.includes('<strong>Tim Redaksi Hamasah International</strong><small>1 menit baca · Penulis tidak tercatat · Tanggal terbit belum tercatat</small>'));
assert.ok(!lama.includes('story-cover'), 'Artikel tanpa sampul tidak diberi kotak kosong.');

// Tulisan lain: paling banyak tiga, tanpa artikel yang sedang dibaca, isinya di-escape.
const lain = [
  { slug: 'kabar-kairo', title: 'Artikel ini sendiri', excerpt: 'x', category: 'Kegiatan', publishedAt: '2026-09-01T08:00:00.000Z' },
  { slug: 'satu', title: 'Tulisan <b>satu</b>', excerpt: 'Ringkasan satu.', category: 'Kegiatan', publishedAt: '2026-09-02T08:00:00.000Z', coverUrl: '/assets/artikel/satu.jpg' },
  { slug: 'dua', title: 'Tulisan dua', excerpt: 'Ringkasan dua.', category: 'Panduan Hidup', publishedAt: null, coverUrl: null },
  { slug: 'tiga', title: 'Tulisan tiga', excerpt: '', category: '', publishedAt: '2026-09-03T08:00:00.000Z' },
  { slug: 'empat', title: 'Tulisan empat', excerpt: '', category: '', publishedAt: '2026-09-04T08:00:00.000Z' }
];
const denganLain = renderArticlePage({ template, article: artikel, origin: ORIGIN, related: lain }).html;
assert.equal((denganLain.match(/class="story-related__item"/g) || []).length, 3);
assert.ok(!denganLain.includes('Artikel ini sendiri'));
assert.ok(denganLain.includes('href="/article?slug=satu"'));
assert.ok(denganLain.includes('Tulisan &lt;b&gt;satu&lt;/b&gt;') && !denganLain.includes('Tulisan <b>satu'));
assert.ok(denganLain.includes('Kegiatan · 2 September 2026'));
assert.ok(!denganLain.includes('Tulisan empat'));
assert.ok(!lama.includes('September 2026'), 'Tidak ada tanggal karangan.');

// Tidak ada atau belum terbit: 404, noindex, tanpa canonical dan tag bagikan.
const hilang = renderArticlePage({ template, article: null, origin: ORIGIN });
assert.equal(hilang.status, 404);
assert.ok(hilang.html.includes('<meta name="robots" content="noindex" />'));
assert.ok(hilang.html.includes('Artikel Tidak Ditemukan'));
assert.ok(!hilang.html.includes('rel="canonical"'));
assert.ok(!hilang.html.includes('og:title'));

console.log('article page tests passed');
