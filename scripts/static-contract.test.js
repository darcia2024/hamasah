const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'website');
const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.match(html, /<meta[^>]+name=["']viewport["']/i, `${page} harus memiliki viewport.`);
  const publicPage = !/^(audit|monitoring|operations|lms|portal|staff)\.html$/i.test(page);
  if (publicPage) {
    assert.match(html, /<main\b/i, `${page} harus memiliki landmark main.`);
    if (/<nav\b/i.test(html) || /class=["'][^"']*shell/i.test(html)) assert.match(html, /skip-link/i, `${page} harus memiliki skip link.`);
  }
}
const css = fs.readFileSync(path.join(root, '..', 'styles.css'), 'utf8') + fs.readFileSync(path.join(root, '..', 'cinematic.css'), 'utf8');
assert.match(css, /@media\s*\(/i, 'CSS harus memiliki breakpoint responsive.');
console.log(`browser contract tests passed (${pages.length} halaman)`);
