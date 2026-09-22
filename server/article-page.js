// Halaman artikel dirender server (Task R7.3).
//
// Sebelumnya article.html hanya kerangka "Memuat artikel..." dan isinya disuntik article.js
// lewat fetch, jadi crawler dan pratinjau tautan WhatsApp hanya melihat halaman kosong
// bertajuk umum. Sekarang /website/article.html?slug=<slug> (URL yang sudah beredar, tidak
// diubah) dijawab server dengan <title>, description, canonical, tag bagikan, dan isi artikel
// yang sudah terisi. Tidak ada build step: template tetap website/article.html.
//
// Ini satu-satunya renderer isi artikel. article.js di browser hanya mengurus tombol bagikan.

const fs = require('node:fs');
const path = require('node:path');
const seo = require('./seo.js');

const { escapeHtml } = seo;
const CONTENT_PATTERN = /(<article id="article-content"[^>]*>)[\s\S]*?(<\/article>)/;
const BREADCRUMB_PATTERN = /(<span id="breadcrumb-current-title">)[^<]*(<\/span>)/;
const CLOCK_ICON = '<svg class="m3-icon m3-icon--sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

function formatDate(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Africa/Cairo' }).format(new Date(value));
}

function renderByline(article) {
  // Tanpa tanggal karangan: artikel tanpa tanggal terbit dikatakan begitu.
  const date = article.publishedAt ? `Diterbitkan pada ${formatDate(article.publishedAt)}` : 'Tanggal terbit belum tercatat';
  // Penulis sebenarnya (Task R7.4); artikel lama tanpa data penulis memakai nama redaksi dan
  // menyebut terus terang bahwa penulisnya tidak tercatat.
  const author = article.authorName ? String(article.authorName).trim() : '';
  const initial = escapeHtml((author || 'Hamasah').charAt(0).toLocaleUpperCase('id-ID'));
  const info = author
    ? `<strong>${escapeHtml(author)}</strong><small>${date}</small>`
    : `<strong>Tim Redaksi Hamasah International</strong><small>Penulis tidak tercatat · ${date}</small>`;
  return `<div class="article-byline">
          <div class="author-avatar" aria-hidden="true">${initial}</div>
          <div class="author-info">${info}</div>
        </div>`;
}

// Isi: paragraf dipisah baris kosong, teks polos yang di-escape. Format lain menunggu KR5.
function renderBody(body) {
  return String(body || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n        ');
}

function renderArticle(article) {
  const title = String(article.title || 'Artikel Hamasah');
  const words = String(article.body || '').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 180));
  const cover = article.coverUrl
    ? `<img class="article-cover" src="${escapeHtml(article.coverUrl)}" alt="${escapeHtml(article.coverAltText || title)}" />`
    : '<div class="article-cover article-cover--empty" role="img" aria-label="Cover artikel tidak tersedia">Cover tidak tersedia</div>';
  return `
      <div class="article-header">
        ${cover}
        <div class="article-meta-tags">
          <span class="m3-category-chip">${escapeHtml(article.category || 'Pena Hamasah')}</span>
          <span class="article-reading-time">${CLOCK_ICON} ${minutes} Menit Baca</span>
        </div>
        <h1 class="article-headline">${escapeHtml(title)}</h1>
        ${renderByline(article)}
      </div>

      <div class="article-lead-box">
        <p class="article-lead-text">${escapeHtml(article.excerpt || '')}</p>
      </div>

      <div class="article-prose">
        ${renderBody(article.body)}
      </div>

      <div class="article-signature">
        <p><strong>Pena Hamasah Kairo</strong>, media literasi, panduan studi, dan kabar berkah dari bumi para nabi.</p>
      </div>
      `;
}

function renderMissing() {
  return `
        <div class="article-error-state">
          <p class="eyebrow">Pena Hamasah</p>
          <h1>Artikel Tidak Ditemukan</h1>
          <p>Artikel ini tidak ada atau belum diterbitkan. Silakan kembali ke daftar artikel untuk memilih bacaan lainnya.</p>
          <a class="button button--primary" href="articles.html">Lihat Semua Artikel</a>
        </div>
      `;
}

// Isi pengganti selalu lewat fungsi, supaya "$&" atau "$1" di judul/isi artikel tidak
// ditafsirkan String.replace sebagai pola.
const literal = (value) => () => value;
const wrap = (value) => (_, open, close) => open + value + close;

function replaceHead(html, { title, description, robots }) {
  let result = html.replace(/<title>[^<]*<\/title>/i, literal(`<title>${escapeHtml(title)}</title>`));
  result = result.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, wrap(escapeHtml(description)));
  if (robots) result = result.replace(/<\/title>/i, literal(`</title>\n    <meta name="robots" content="${robots}" />`));
  return result;
}

// Mengembalikan { status, html }. article null berarti tidak ada atau belum terbit.
function renderArticlePage({ template, article, origin }) {
  if (!article) {
    let html = replaceHead(template, { title: 'Artikel Tidak Ditemukan | Hamasah International', description: 'Artikel ini tidak ada atau belum diterbitkan.', robots: 'noindex' });
    html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/i, '');
    html = html.replace(CONTENT_PATTERN, wrap(renderMissing())).replace(BREADCRUMB_PATTERN, wrap('Tidak Ditemukan'));
    return { status: 404, html };
  }
  const title = String(article.title || 'Artikel Hamasah');
  const description = String(article.excerpt || '').trim() || `${title}, Pena Hamasah.`;
  let html = replaceHead(template, { title: `${title} | Hamasah International`, description });
  const image = article.coverUrl
    ? { url: article.coverUrl, alt: article.coverAltText || title }
    : null;
  html = seo.decorateHead(html, { origin, canonicalPath: seo.articlePath(article.slug), type: 'article', image });
  if (article.publishedAt) {
    html = html.replace(/\s*<\/head>/i, literal(`\n    <meta property="article:published_time" content="${escapeHtml(article.publishedAt)}" />\n  </head>`));
  }
  html = html.replace(CONTENT_PATTERN, wrap(renderArticle(article))).replace(BREADCRUMB_PATTERN, wrap(escapeHtml(title)));
  return { status: 200, html };
}

function readTemplate(rootDirectory) {
  return fs.readFileSync(path.join(rootDirectory, 'website', 'article.html'), 'utf8');
}

module.exports = { readTemplate, renderArticle, renderArticlePage, renderBody };
