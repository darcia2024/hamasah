// Halaman artikel dirender server (Task R7.3).
//
// Sebelumnya article.html hanya kerangka "Memuat artikel..." dan isinya disuntik article.js
// lewat fetch, jadi crawler dan pratinjau tautan WhatsApp hanya melihat halaman kosong
// bertajuk umum. Sekarang /article?slug=<slug> (alamat lama /website/article.html dialihkan ke sini, tidak
// diubah) dijawab server dengan <title>, description, canonical, tag bagikan, dan isi artikel
// yang sudah terisi. Tidak ada build step: template tetap website/article.html.
//
// Ini satu-satunya renderer isi artikel. article.js di browser hanya mengurus tombol bagikan.

const fs = require('node:fs');
const path = require('node:path');
const seo = require('./seo.js');
const { renderMarkdown } = require('./article-markdown.js');

const { escapeHtml } = seo;
const CONTENT_PATTERN = /(<article id="article-content"[^>]*>)[\s\S]*?(<\/article>)/;
const BREADCRUMB_PATTERN = /(<span id="breadcrumb-current-title">)[^<]*(<\/span>)/;
const RELATED_PATTERN = /(<section id="article-related"[^>]*>)[\s\S]*?(<\/section>)/;
const WHATSAPP_ICON = '<svg class="m3-icon m3-icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const LINK_ICON = '<svg class="m3-icon m3-icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

function formatDate(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Africa/Cairo' }).format(new Date(value));
}

function readingMinutes(body) {
  const words = String(body || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

// Baris penulis ala halaman baca: avatar, nama, lalu waktu baca dan tanggal terbit.
function renderByline(article) {
  // Tanpa tanggal karangan: artikel tanpa tanggal terbit dikatakan begitu.
  const date = article.publishedAt ? formatDate(article.publishedAt) : 'Tanggal terbit belum tercatat';
  // Penulis sebenarnya (Task R7.4); artikel lama tanpa data penulis memakai nama redaksi dan
  // menyebut terus terang bahwa penulisnya tidak tercatat.
  const author = article.authorName ? String(article.authorName).trim() : '';
  const initial = escapeHtml((author || 'Hamasah').charAt(0).toLocaleUpperCase('id-ID'));
  const baca = `${readingMinutes(article.body)} menit baca`;
  const info = author
    ? `<strong>${escapeHtml(author)}</strong><small>${baca} · ${date}</small>`
    : `<strong>Tim Redaksi Hamasah International</strong><small>${baca} · Penulis tidak tercatat · ${date}</small>`;
  return `<div class="story-author">
          <div class="story-author__avatar" aria-hidden="true">${initial}</div>
          <div class="story-author__info">${info}</div>
        </div>`;
}

// Tombol bagikan. Dipakai dua kali (di bawah judul dan di akhir tulisan); article.js
// mengikat semua tombol ber-data-share, bukan satu id.
function renderShare(label) {
  return `<div class="story-actions" role="group" aria-label="${escapeHtml(label)}">
          <button class="story-action" type="button" data-share="wa">${WHATSAPP_ICON}<span>Bagikan</span></button>
          <button class="story-action" type="button" data-share="copy">${LINK_ICON}<span data-share-label>Salin tautan</span></button>
        </div>`;
}

// Isi: Markdown terbatas (Task R7.5, server/article-markdown.js, juga dipakai pratinjau CMS).
// Teks polos lama tetap menjadi paragraf.
function renderBody(body) {
  return renderMarkdown(body);
}

// Susunan halaman baca: kategori, judul, ringkasan sebagai subjudul, penulis, bagikan,
// sampul, lalu isi dalam satu kolom sempit. Artikel tanpa sampul tidak diberi kotak kosong.
function renderArticle(article) {
  const title = String(article.title || 'Artikel Hamasah');
  const excerpt = String(article.excerpt || '').trim();
  const category = String(article.category || 'Pena Hamasah');
  const cover = article.coverUrl
    ? `
      <figure class="story-cover">
        <img class="article-cover" src="${escapeHtml(article.coverUrl)}" alt="${escapeHtml(article.coverAltText || title)}" width="1000" height="562" decoding="async" />
      </figure>`
    : '';
  return `
      <header class="story-header">
        <p class="story-kicker"><a href="articles">Pena Hamasah</a><span aria-hidden="true">·</span><span>${escapeHtml(category)}</span></p>
        <h1 class="story-title">${escapeHtml(title)}</h1>
        ${excerpt ? `<p class="story-subtitle">${escapeHtml(excerpt)}</p>` : ''}
        ${renderByline(article)}
        ${renderShare('Bagikan tulisan ini')}
      </header>
${cover}

      <div class="story-body article-prose">
        ${renderBody(article.body)}
      </div>

      <footer class="story-footer">
        <p class="story-tags"><span class="story-tag">${escapeHtml(category)}</span></p>
        <p class="story-signature"><strong>Pena Hamasah Kairo</strong>, media literasi, panduan studi, dan kabar berkah dari bumi para nabi.</p>
        ${renderShare('Bagikan tulisan ini')}
      </footer>
      `;
}

// "Tulisan lain": sampai tiga artikel terbit selain yang sedang dibaca.
function renderRelated(related) {
  const items = (related || []).slice(0, 3);
  if (!items.length) return '';
  const cards = items.map((item) => {
    const judul = escapeHtml(item.title || '');
    const gambar = item.coverUrl
      ? `<img src="${escapeHtml(item.coverUrl)}" alt="" width="1000" height="562" loading="lazy" decoding="async" />`
      : '<span class="story-related__blank" aria-hidden="true"></span>';
    const meta = [item.category, item.publishedAt ? formatDate(item.publishedAt) : ''].filter(Boolean).map(escapeHtml).join(' · ');
    return `
          <li>
            <a class="story-related__item" href="${escapeHtml(seo.articlePath(item.slug))}">
              <span class="story-related__media">${gambar}</span>
              <span class="story-related__text">
                <strong>${judul}</strong>
                <span>${escapeHtml(item.excerpt || '')}</span>
                <small>${meta}</small>
              </span>
            </a>
          </li>`;
  }).join('');
  return `
        <h2 class="story-related__title">Tulisan lain dari Pena Hamasah</h2>
        <ul class="story-related__list">${cards}
        </ul>
        <a class="story-related__all" href="articles">Lihat semua tulisan</a>
      `;
}

function renderMissing() {
  return `
        <div class="article-error-state">
          <p class="eyebrow">Pena Hamasah</p>
          <h1>Artikel Tidak Ditemukan</h1>
          <p>Artikel ini tidak ada atau belum diterbitkan. Silakan kembali ke daftar artikel untuk memilih bacaan lainnya.</p>
          <a class="button button--primary" href="articles">Lihat Semua Artikel</a>
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
function renderArticlePage({ template, article, origin, related = [], content = null }) {
  if (!article) {
    let html = replaceHead(template, { title: 'Artikel Tidak Ditemukan | Hamasah International', description: 'Artikel ini tidak ada atau belum diterbitkan.', robots: 'noindex' });
    html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/i, '');
    html = html.replace(CONTENT_PATTERN, wrap(renderMissing())).replace(BREADCRUMB_PATTERN, wrap('Tidak Ditemukan'));
    return { status: 404, html: require('./site-content.js').renderHalaman(html, content) };
  }
  const title = String(article.title || 'Artikel Hamasah');
  const description = String(article.excerpt || '').trim() || `${title}, Pena Hamasah.`;
  let html = replaceHead(template, { title: `${title} | Hamasah International`, description });
  // Sampul di situs sendiri disimpan sebagai path (/assets/...); tag bagikan butuh URL absolut.
  const image = article.coverUrl
    ? { url: article.coverUrl.startsWith('/') ? `${origin}${article.coverUrl}` : article.coverUrl, alt: article.coverAltText || title }
    : null;
  html = seo.decorateHead(html, { origin, canonicalPath: seo.articlePath(article.slug), type: 'article', image });
  if (article.publishedAt) {
    html = html.replace(/\s*<\/head>/i, literal(`\n    <meta property="article:published_time" content="${escapeHtml(article.publishedAt)}" />\n  </head>`));
  }
  html = html.replace(CONTENT_PATTERN, wrap(renderArticle(article))).replace(BREADCRUMB_PATTERN, wrap(escapeHtml(title)));
  html = html.replace(RELATED_PATTERN, wrap(renderRelated(related.filter((item) => item.slug !== article.slug))));
  return { status: 200, html: require('./site-content.js').renderHalaman(html, content) };
}

function readTemplate(rootDirectory) {
  return fs.readFileSync(path.join(rootDirectory, 'website', 'article.html'), 'utf8');
}

module.exports = { readTemplate, renderArticle, renderArticlePage, renderBody };
