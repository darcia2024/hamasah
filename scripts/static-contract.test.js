// Kontrak statis halaman website/: membaca berkas, TIDAK membuka browser.
//
// Yang dibuktikan di sini hanya keberadaan: viewport, landmark, skip link, dan bahwa CSS
// yang benar-benar ditautkan halaman ada dan punya breakpoint. Jangan mengutip berkas ini
// sebagai bukti CSP, layout, atau aksesibilitas; itu hanya bisa dibuktikan browser, lewat
// `npm run test:browser-contract` (scripts/browser-contract.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'website');
const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
const cssRead = new Map();
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.match(html, /<meta[^>]+name=["']viewport["']/i, `${page} harus memiliki viewport.`);
  const publicPage = !/^(audit|monitoring|operations|lms|portal|staff)\.html$/i.test(page);
  if (publicPage) {
    assert.match(html, /<main\b/i, `${page} harus memiliki landmark main.`);
    if (/<nav\b/i.test(html) || /class=["'][^"']*shell/i.test(html)) assert.match(html, /skip-link/i, `${page} harus memiliki skip link.`);
  }

  // CSS yang dipakai halaman ini: dibaca dari <link rel="stylesheet">, bukan dari berkas
  // prototipe di root. Setiap tautan lokal harus ada, dan gabungannya punya breakpoint.
  const links = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
    .map((tag) => (tag[0].match(/href=["']([^"'?#]+)/i) || [])[1])
    .filter((href) => href && !/^(?:https?:)?\/\//i.test(href));
  assert.ok(links.length > 0, `${page} tidak menautkan stylesheet lokal.`);
  let combined = '';
  for (const href of links) {
    const file = path.resolve(root, href);
    assert.ok(file.startsWith(root), `${page} menautkan stylesheet di luar website/: ${href}`);
    assert.ok(fs.existsSync(file), `${page} menautkan ${href} yang tidak ada.`);
    if (!cssRead.has(file)) cssRead.set(file, fs.readFileSync(file, 'utf8'));
    combined += cssRead.get(file);
  }
  // Halaman auth sengaja tanpa breakpoint: lebarnya cair lewat min(100%, ...). Apakah itu
  // benar-benar tidak melimpah dibuktikan browser (gulir horizontal pada 360-1440 px).
  assert.match(combined, /@media\s*\(|min\(\s*100%/i, `${page}: CSS yang dipakai halaman harus memiliki breakpoint atau lebar cair.`);
}
console.log(`static contract tests passed (${pages.length} halaman, ${cssRead.size} stylesheet dibaca)`);
