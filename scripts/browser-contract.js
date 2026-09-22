'use strict';

// Kontrak browser (Task R5.1): membuka setiap halaman website/*.html di Chrome/Edge
// sungguhan dan memeriksa apa yang hanya bisa dibuktikan browser.
//
// Versi lama (test:browser-contract) tidak membuka browser; ia membaca HTML dengan regex
// dan memeriksa styles.css milik prototipe lama (dihapus di R8.1). Berkas itu kini scripts/static-contract.test.js
// dan dijalankan oleh `npm test`; kalimat "lulus, 16 halaman" dari sana hanya membuktikan
// keberadaan viewport, landmark, skip link, dan breakpoint. Yang di sini:
//
//   - tidak ada pelanggaran CSP di console
//   - tidak ada galat JavaScript, dan tidak ada respons HTTP >= 400 atau sumber daya gagal muat
//   - tidak ada gulir horizontal (scrollWidth > clientWidth) pada 360, 390, 768, 1024, 1440 px
//   - tidak ada gambar yang gagal muat
//   - setiap kontrol interaktif punya nama aksesibel (dari pohon aksesibilitas browser)
//
// Waktu: sekitar 1-3 menit untuk seluruh halaman x lima lebar (banyak di antaranya menunggu
// jaringan lokal). Karena itu skrip ini TIDAK ikut `npm test`; jalankan sebelum rilis:
//
//   npm run test:browser-contract [-- --page=index --viewport=360,1440 --verbose --browser=path]
//
// Kode keluar: 0 lulus, 1 ada pelanggaran, 2 alat gagal berjalan (mis. browser tidak ada).

const fs = require('node:fs');
const path = require('node:path');
const {
  ROLE_EMAILS, bootApp, call, connectCdp, delay, findBrowser, launchBrowser, openTab
} = require('./browser-harness.js');

const WEBSITE = path.resolve(__dirname, '..', 'website');
const DEFAULT_VIEWPORTS = [360, 390, 768, 1024, 1440];
const TAB_SELECTOR = '[id^="tab-btn-"], .crm-pill-btn, [role="tab"]';

// Halaman internal butuh sesi; sisanya publik. Selebihnya diperlakukan sama.
const INTERNAL_ROLE = { audit: 'admin', monitoring: 'admin', operations: 'admin', lms: 'admin', portal: 'admin', staff: 'admin' };
// Halaman yang hanya bermakna dengan token di hash atau query. Artikel dirender server
// (Task R7.3), jadi tanpa slug yang terbit halamannya memang 404.
const PAGE_HASH = { 'reset-password': '#token=uji-kontrak', aktivasi: '#token=uji-kontrak', article: '?slug=pendampingan-santri-di-kairo' };

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch',
  'tab', 'menuitem', 'slider', 'spinbutton', 'listbox', 'option'
]);

function parseArgs(argv) {
  const options = { pages: null, viewports: DEFAULT_VIEWPORTS, verbose: false, browser: null, help: false };
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (key === 'page') options.pages = value.split(',').filter(Boolean);
    else if (key === 'viewport') options.viewports = value.split(',').map(Number).filter((n) => n > 0);
    else if (key === 'verbose') options.verbose = true;
    else if (key === 'browser') options.browser = value;
    else if (key === 'help' || key === 'h') options.help = true;
  }
  return options;
}

const HELP = `Kontrak browser: membuka setiap halaman di browser sungguhan.

  --page=a,b        hanya halaman ini (nama tanpa .html)
  --viewport=360,.. lebar viewport (default ${DEFAULT_VIEWPORTS.join(',')})
  --browser=path    jalur ke Chrome atau Edge (atau env CHROME_PATH)
  --verbose         cetak juga halaman yang lulus dengan rinciannya
`;

// Dijalankan di dalam halaman.
function inspectPage() {
  const out = { overflow: null, brokenImages: [] };
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth) {
    const wide = [];
    for (const element of document.body.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.right > doc.clientWidth + 1) {
        const name = element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') + (typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : '');
        wide.push(name);
        if (wide.length >= 3) break;
      }
    }
    out.overflow = { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide };
  }
  for (const image of document.images) {
    if (!image.getAttribute('src')) continue;
    if (image.complete && image.naturalWidth === 0) out.brokenImages.push(image.getAttribute('src'));
  }
  return out;
}

async function unnamedControls(tab) {
  const { nodes } = await tab.send('Accessibility.getFullAXTree');
  const bad = [];
  for (const node of nodes) {
    if (node.ignored) continue;
    const role = node.role && node.role.value;
    if (!INTERACTIVE_ROLES.has(role)) continue;
    const name = node.name && node.name.value ? String(node.name.value).trim() : '';
    if (name) continue;
    let label = role;
    if (node.backendDOMNodeId) {
      try {
        const { node: dom } = await tab.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId });
        const attributes = dom.attributes || [];
        const pairs = [];
        for (let i = 0; i < attributes.length; i += 2) {
          if (['id', 'class', 'href', 'type'].includes(attributes[i])) pairs.push(`${attributes[i]}="${attributes[i + 1]}"`);
        }
        label = `<${dom.nodeName.toLowerCase()} ${pairs.join(' ')}>`.replace(' >', '>');
      } catch {
        // Simpul yang sudah lepas dari DOM tidak perlu dirinci.
      }
    }
    bad.push(label);
  }
  return bad;
}

async function checkPage(cdp, baseUrl, page, viewport, token) {
  const height = viewport < 768 ? 812 : 900;
  const bootScript = token
    ? `try { sessionStorage.setItem('hamasahPortalSession', ${JSON.stringify(JSON.stringify({ accessToken: token }))}); } catch (error) { /* origin tanpa penyimpanan */ }`
    : '';
  const tab = await openTab(cdp, { width: viewport, height, bootScript });
  const violations = new Set();
  try {
    await tab.send('Accessibility.enable');
    await tab.send('DOM.enable');
    const loaded = tab.once('Page.loadEventFired');
    await tab.send('Page.navigate', { url: `${baseUrl}/website/${page}.html${PAGE_HASH[page] || ''}` });
    await Promise.race([loaded, delay(25000).then(() => { throw new Error('halaman tidak selesai dimuat dalam 25 detik'); })]);
    await tab.waitIdle();
    await delay(300);

    const inspect = async (state) => {
      // Gambar malas-muat yang belum diminta bukan "gagal"; minta semuanya dulu.
      await tab.evaluate("document.querySelectorAll('img[loading=\"lazy\"]').forEach((img) => { img.loading = 'eager'; })");
      await tab.waitIdle(400, 8000);
      const result = await tab.evaluate(`(${inspectPage.toString()})()`);
      const suffix = state === 'awal' ? '' : ` (setelah ${state})`;
      if (result.overflow) {
        violations.add(`gulir horizontal${suffix}: scrollWidth ${result.overflow.scrollWidth} > clientWidth ${result.overflow.clientWidth}; elemen melebar: ${result.overflow.wide.join(', ') || '-'}`);
      }
      for (const src of result.brokenImages) violations.add(`gambar gagal dimuat${suffix}: ${src}`);
      for (const label of await unnamedControls(tab)) violations.add(`kontrol tanpa nama aksesibel${suffix}: ${label}`);
    };

    await inspect('awal');

    // Halaman internal: klik setiap tab supaya isi yang baru dirender ikut diperiksa.
    const tabCount = await tab.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(TAB_SELECTOR)})).filter((b) => b.offsetParent !== null).length`);
    for (let index = 0; index < tabCount; index += 1) {
      const label = await tab.evaluate(`(() => {
        const button = Array.from(document.querySelectorAll(${JSON.stringify(TAB_SELECTOR)})).filter((b) => b.offsetParent !== null)[${index}];
        if (!button) return null;
        const name = (button.textContent || '').replace(/[ \\t\\r\\n]+/g, ' ').trim().slice(0, 40);
        button.click();
        return name;
      })()`);
      if (label === null) break;
      await delay(250);
      await tab.waitIdle(300, 6000);
      await inspect(`tab "${label}"`);
    }

    for (const item of tab.diagnostics) {
      const where = item.url ? ` [${item.url.replace(baseUrl, '')}${item.line ? `:${item.line}` : ''}]` : '';
      const label = { csp: 'pelanggaran CSP', 'js-error': 'galat JavaScript', 'console-error': 'console.error', 'log-error': 'galat di console', 'http-error': 'respons gagal', 'load-failed': 'muat gagal' }[item.kind] || item.kind;
      violations.add(`${label}: ${String(item.text).replace(/\s+/g, ' ').slice(0, 220)}${where}`);
    }
  } finally {
    await tab.close();
  }
  return [...violations];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return 0; }

  const executable = findBrowser(options.browser);
  if (!executable) {
    console.error('Chrome atau Edge tidak ditemukan. Pasang salah satunya, atau berikan --browser=<jalur> atau env CHROME_PATH.');
    return 2;
  }

  let pages = fs.readdirSync(WEBSITE).filter((name) => name.endsWith('.html')).map((name) => name.replace(/\.html$/, '')).sort();
  if (options.pages) pages = pages.filter((page) => options.pages.includes(page));
  if (!pages.length) { console.error('Tidak ada halaman yang cocok.'); return 2; }

  let app = null; let browser = null; let cdp = null;
  const results = [];
  try {
    console.log('Menyalakan aplikasi (database in-memory) dan browser...');
    app = await bootApp();
    const login = await call(app.baseUrl, 'POST', '/api/auth/login', null, { email: ROLE_EMAILS.admin, password: app.password });
    if (!login.body.accessToken) throw new Error(`Login admin gagal: HTTP ${login.status}`);
    browser = await launchBrowser(executable);
    cdp = await connectCdp(browser.wsUrl);

    for (const page of pages) {
      for (const viewport of options.viewports) {
        const label = `${page}.html @${viewport}`;
        try {
          const found = await checkPage(cdp, app.baseUrl, page, viewport, INTERNAL_ROLE[page] ? login.body.accessToken : null);
          results.push({ label, found });
          if (found.length) { console.log(`  GAGAL  ${label}`); found.forEach((item) => console.log(`         - ${item}`)); }
          else if (options.verbose) console.log(`  ok     ${label}`);
        } catch (error) {
          results.push({ label, found: [`tidak dapat diperiksa: ${error.message}`], tool: true });
          console.log(`  ERROR  ${label}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`\nAlat gagal berjalan: ${error.message}`);
    return 2;
  } finally {
    if (cdp) cdp.close();
    if (browser) await browser.stop();
    if (app) await app.stop();
  }

  const failed = results.filter((r) => r.found.length);
  const toolFailed = results.some((r) => r.tool);
  console.log(`\nKontrak browser: ${pages.length} halaman x ${options.viewports.length} lebar = ${results.length} pemeriksaan, ${failed.length} gagal.`);
  if (toolFailed) return 2;
  return failed.length ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (error) => { console.error(error); process.exitCode = 2; });
