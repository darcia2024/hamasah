'use strict';
// Gerbang Content Security Policy untuk halaman di website/ (Task R1.7).
//
// Server mengirim `script-src 'self'` dan `style-src 'self' https://fonts.googleapis.com`
// tanpa `'unsafe-inline'` (server/http/security-headers.js). Browser karena itu
// memblokir atribut style="...", elemen <style>, <script> tanpa src, dan handler
// atribut seperti onclick. Semua itu tidak pernah berlaku di browser, sehingga
// layout dan interaksi yang ditulis begitu diam-diam tidak aktif.
//
// Test ini menolak pola tersebut sebelum masuk repo. Jangan menyelesaikan
// kegagalan di sini dengan menambahkan 'unsafe-inline' ke CSP: itu membuka
// kembali permukaan XSS yang justru ditutup oleh kebijakan tersebut.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const websiteDirectory = path.resolve(__dirname, '..', 'website');

// Atribut handler yang dieksekusi sebagai script inline.
const EVENT_ATTRIBUTES = [
  'onabort', 'onblur', 'onchange', 'onclick', 'ondblclick', 'onerror', 'onfocus',
  'oninput', 'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onmousedown',
  'onmouseenter', 'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover',
  'onmouseup', 'onreset', 'onscroll', 'onselect', 'onsubmit', 'ontoggle', 'onunload'
];

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function findAll(content, pattern) {
  const hits = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = regex.exec(content)) !== null) {
    hits.push({ line: lineOf(content, match.index), text: match[0].slice(0, 80) });
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return hits;
}

function report(page, label, hits) {
  return hits.map((hit) => `  ${page}:${hit.line}  ${label}: ${hit.text}`).join('\n');
}

function run() {
  const pages = fs.readdirSync(websiteDirectory).filter((name) => name.endsWith('.html'));
  assert.ok(pages.length > 0, 'Tidak ada halaman HTML yang diperiksa.');

  const findings = [];

  for (const page of pages) {
    const content = fs.readFileSync(path.join(websiteDirectory, page), 'utf8');

    const styleAttributes = findAll(content, /\sstyle\s*=\s*"[^"]*"/);
    if (styleAttributes.length) {
      findings.push(report(page, 'atribut style inline', styleAttributes));
    }

    const styleElements = findAll(content, /<style[\s>]/i);
    if (styleElements.length) {
      findings.push(report(page, 'elemen <style>', styleElements));
    }

    // <script> tanpa atribut src dieksekusi sebagai script inline.
    const inlineScripts = findAll(content, /<script(?![^>]*\ssrc\s*=)[^>]*>/i);
    if (inlineScripts.length) {
      findings.push(report(page, 'script inline tanpa src', inlineScripts));
    }

    for (const attribute of EVENT_ATTRIBUTES) {
      const handlers = findAll(content, new RegExp(`\\s${attribute}\\s*=`, 'i'));
      if (handlers.length) {
        findings.push(report(page, `handler atribut ${attribute}`, handlers));
      }
    }
  }

  // Berkas JavaScript juga diperiksa. Template string yang dipasang lewat innerHTML
  // menghasilkan atribut style sungguhan di DOM, jadi tetap diblokir CSP walaupun
  // sumbernya bukan berkas HTML. Begitu juga setAttribute('style', ...) dan cssText,
  // yang dihitung sebagai penerapan style inline; penulisan properti satu per satu
  // (element.style.width = '...') tetap boleh dan tidak diperiksa di sini.
  const scripts = fs.readdirSync(websiteDirectory).filter((name) => name.endsWith('.js'));
  for (const script of scripts) {
    const content = fs.readFileSync(path.join(websiteDirectory, script), 'utf8');

    const styleInTemplate = findAll(content, /\sstyle\s*=\s*["'][^"']*["']/);
    if (styleInTemplate.length) {
      findings.push(report(script, 'atribut style di dalam string HTML', styleInTemplate));
    }

    const setStyleAttribute = findAll(content, /setAttribute\(\s*["']style["']/);
    if (setStyleAttribute.length) {
      findings.push(report(script, "setAttribute('style', ...)", setStyleAttribute));
    }

    const cssText = findAll(content, /\.style\.cssText\s*=/);
    if (cssText.length) {
      findings.push(report(script, 'style.cssText', cssText));
    }
  }

  if (findings.length) {
    const pesan = [
      'Ditemukan style atau script inline yang akan diblokir Content Security Policy:',
      '',
      findings.join('\n'),
      '',
      'Pindahkan nilainya ke berkas CSS atau JS. Jangan menambahkan \'unsafe-inline\' ke CSP.'
    ].join('\n');
    assert.fail(pesan);
  }

  console.log(`csp contract tests passed (${pages.length} halaman + ${scripts.length} skrip, 0 style/script inline)`);
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { EVENT_ATTRIBUTES, run };
