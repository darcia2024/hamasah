// Tag bagikan, robots.txt, dan sitemap (Phase R7).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const seo = require('./seo.js');

const WEBSITE = path.resolve(__dirname, '..', 'website');
const ORIGIN = 'https://hamasah.example';

// R7.1: setiap halaman publik mendapat tag lengkap dengan URL absolut.
const WAJIB = ['og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt',
  'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];
for (const [name, canonicalPath] of Object.entries(seo.PUBLIC_PAGES)) {
  const html = seo.decoratePublicPage(`website/${name}`, fs.readFileSync(path.join(WEBSITE, name), 'utf8'), ORIGIN);
  for (const key of WAJIB) {
    assert.match(html, new RegExp(`(?:property|name)="${key}" content="[^"]+"`), `${name}: ${key} hilang`);
  }
  assert.ok(html.includes(`<meta property="og:url" content="${ORIGIN}${canonicalPath}" />`), `${name}: og:url tidak absolut`);
  assert.ok(html.includes(`<meta property="og:image" content="${ORIGIN}/assets/og-default.jpg" />`), `${name}: og:image tidak absolut`);
  assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}${canonicalPath}" />`), `${name}: canonical tidak absolut`);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1, `${name}: canonical ganda`);
  const title = seo.escapeHtml(html.match(/<title>([^<]*)<\/title>/)[1].replace(/&amp;/g, '&'));
  assert.ok(html.includes(`<meta property="og:title" content="${title}" />`), `${name}: og:title tidak sama dengan <title>`);
}

// Halaman internal tidak dihias.
assert.equal(seo.decoratePublicPage('website/staff.html', '<html><head><title>x</title></head></html>', ORIGIN), null);
assert.equal(seo.decoratePublicPage('assets/index.html', '<html><head><title>x</title></head></html>', ORIGIN), null);

// Nilai di-escape.
const escaped = seo.decorateHead('<head><title>A &amp; "B"</title><meta name="description" content="x&quot;&lt;y" /></head>', { origin: ORIGIN, canonicalPath: '/website/' });
assert.ok(escaped.includes('<meta property="og:title" content="A &amp; &quot;B&quot;" />'));
assert.ok(escaped.includes('<meta property="og:description" content="x&quot;&lt;y" />'));
assert.ok(!/content="[^"]*<[^"]*"/.test(escaped));

// Gambar bagikan default ada dan berukuran 1200 x 630 (header JPEG SOF).
const jpeg = fs.readFileSync(path.resolve(__dirname, '..', seo.DEFAULT_IMAGE.path.slice(1)));
let offset = 2;
let size = null;
while (offset < jpeg.length) {
  const marker = jpeg[offset + 1];
  const length = jpeg.readUInt16BE(offset + 2);
  if (marker >= 0xc0 && marker <= 0xc3) { size = { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) }; break; }
  offset += 2 + length;
}
assert.deepEqual(size, { width: 1200, height: 630 });

// Origin: APP_BASE_URL menang; host permintaan hanya di development/test dan harus rapi.
assert.equal(seo.resolveOrigin({ appBaseUrl: 'https://a.test/', appEnvironment: 'production' }), 'https://a.test');
assert.equal(seo.resolveOrigin({ request: { headers: { host: 'localhost:4291' } }, appEnvironment: 'development' }), 'http://localhost:4291');
assert.equal(seo.resolveOrigin({ request: { headers: { host: 'evil.test/"><script>' } }, appEnvironment: 'development' }), 'http://localhost');
assert.equal(seo.resolveOrigin({ request: { headers: { host: 'evil.test' } }, appEnvironment: 'production' }), '');

console.log('seo tests passed');
