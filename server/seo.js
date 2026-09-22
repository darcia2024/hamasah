// Distribusi publik (Phase R7): tag Open Graph dan Twitter Card, robots.txt, dan sitemap.xml.
//
// Satu sumber: daftar halaman publik di bawah. Halaman publik mendapat tag bagikan saat
// disajikan (diambil dari <title> dan <meta name="description"> halaman itu sendiri, jadi
// HTML tidak menulis dua kali), masuk sitemap bila tidak ber-noindex, dan tidak dilarang di
// robots.txt. Setiap HTML lain di website/ dianggap internal dan otomatis masuk Disallow,
// supaya halaman internal baru terlindungi tanpa perlu diingat.
//
// URL di tag bagikan dan sitemap wajib absolut. Host diambil dari APP_BASE_URL, bukan ditulis
// keras. Di development/test tanpa APP_BASE_URL, host permintaan dipakai (dengan pola ketat).

const fs = require('node:fs');
const path = require('node:path');

const SITE_NAME = 'Hamasah International';
const LOCALE = 'id_ID';
const DEFAULT_IMAGE = Object.freeze({
  path: '/assets/og-default.jpg',
  width: 1200,
  height: 630,
  alt: 'Hamasah International, bimbingan dan pendampingan studi Universitas Al-Azhar Kairo'
});

// Berkas (relatif ke website/) -> URL kanonis. article.html tidak di sini: halamannya
// dirender per artikel (server/article-page.js) dan tiap artikel masuk sitemap sendiri.
const PUBLIC_PAGES = Object.freeze({
  'index.html': '/website/',
  'biaya.html': '/website/biaya.html',
  'kontak.html': '/website/kontak.html',
  'articles.html': '/website/articles.html',
  'cek-status.html': '/website/cek-status.html',
  'kebijakan-privasi.html': '/website/kebijakan-privasi.html'
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function decodeEntities(value) {
  return String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));
}

// Origin tanpa garis miring akhir, mis. "https://hamasah.id".
function resolveOrigin({ appBaseUrl, request, appEnvironment } = {}) {
  if (appBaseUrl) return String(appBaseUrl).replace(/\/+$/, '');
  if (['development', 'test'].includes(appEnvironment)) {
    const host = request && request.headers && request.headers.host;
    if (host && /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return `http://${host}`;
    return 'http://localhost';
  }
  // Staging/production tanpa APP_BASE_URL ditolak saat start (server/production-config.js).
  return '';
}

function isIndexable(html) {
  return !/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
}

function readHeadValue(html, pattern) {
  const match = html.match(pattern);
  return match ? decodeEntities(match[1].trim()) : '';
}

function socialTags({ origin, url, title, description, type = 'website', image }) {
  const picture = image || { ...DEFAULT_IMAGE, url: origin + DEFAULT_IMAGE.path };
  const tags = [
    ['property', 'og:type', type],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:locale', LOCALE],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', url],
    ['property', 'og:image', picture.url],
    ...(picture.width ? [['property', 'og:image:width', String(picture.width)], ['property', 'og:image:height', String(picture.height)]] : []),
    ['property', 'og:image:alt', picture.alt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', picture.url],
    ['name', 'twitter:image:alt', picture.alt]
  ];
  return tags.map(([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`).join('\n    ');
}

// Menjadikan canonical absolut (atau menambahkannya) dan menyisipkan tag bagikan sebelum </head>.
function decorateHead(html, { origin, canonicalPath, type, image }) {
  if (!origin) return html;
  const url = origin + canonicalPath;
  const title = readHeadValue(html, /<title>([^<]*)<\/title>/i);
  const description = readHeadValue(html, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const canonical = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  let result = /<link\s+rel="canonical"[^>]*>/i.test(html)
    ? html.replace(/<link\s+rel="canonical"[^>]*>/i, () => canonical)
    : html.replace(/<\/title>/i, () => `</title>\n    ${canonical}`);
  // Pengganti lewat fungsi: "$&" di judul tidak boleh ditafsirkan sebagai pola.
  const tags = socialTags({ origin, url, title, description, type, image });
  result = result.replace(/\s*<\/head>/i, () => `\n    ${tags}\n  </head>`);
  return result;
}

// Dipakai penyaji statis: hanya halaman publik yang dihias; halaman lain dikembalikan null
// (disajikan apa adanya).
function decoratePublicPage(relativePath, html, origin) {
  const name = relativePath.replace(/^website\//, '');
  const canonicalPath = PUBLIC_PAGES[name];
  if (!canonicalPath || !relativePath.startsWith('website/')) return null;
  return decorateHead(html, { origin, canonicalPath });
}

function internalPages(websiteDirectory) {
  return fs.readdirSync(websiteDirectory)
    .filter((name) => name.endsWith('.html') && !PUBLIC_PAGES[name] && name !== 'article.html')
    .sort();
}

function robotsTxt({ origin, websiteDirectory }) {
  const lines = ['User-agent: *', 'Allow: /'];
  for (const name of internalPages(websiteDirectory)) {
    lines.push(`Disallow: /website/${name}`, `Disallow: /${name}`);
  }
  lines.push('Disallow: /api/', '', `Sitemap: ${origin}/sitemap.xml`, '');
  return lines.join('\n');
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// articles: artikel terbit saja, [{ slug, updatedAt, publishedAt }].
function sitemapXml({ origin, websiteDirectory, articles = [] }) {
  const entries = [];
  for (const [name, canonicalPath] of Object.entries(PUBLIC_PAGES)) {
    const file = path.join(websiteDirectory, name);
    if (!fs.existsSync(file)) continue;
    if (!isIndexable(fs.readFileSync(file, 'utf8'))) continue;
    // Tanpa lastmod: waktu ubah berkas berganti setiap checkout, bukan tanggal isi berubah.
    entries.push({ loc: origin + canonicalPath, lastmod: null });
  }
  for (const article of articles) {
    entries.push({ loc: origin + articlePath(article.slug), lastmod: isoDate(article.updatedAt) || isoDate(article.publishedAt) });
  }
  const body = entries.map((entry) => `  <url><loc>${escapeHtml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// URL kanonis satu artikel. Bentuk lama (article.html?slug=...) dipertahankan supaya tautan
// yang sudah beredar tidak putus; server yang merender isinya (Task R7.3).
function articlePath(slug) {
  return `/website/article.html?slug=${encodeURIComponent(slug)}`;
}

module.exports = {
  DEFAULT_IMAGE,
  PUBLIC_PAGES,
  SITE_NAME,
  articlePath,
  decorateHead,
  decoratePublicPage,
  escapeHtml,
  internalPages,
  isIndexable,
  resolveOrigin,
  robotsTxt,
  sitemapXml,
  socialTags
};
