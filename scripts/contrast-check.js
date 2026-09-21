#!/usr/bin/env node
// Pengukur kontras teks otomatis (Task R4.3).
//
// Membuka setiap halaman di browser sungguhan, menelusuri elemen teks, menghitung
// rasio kontras teks terhadap latarnya, lalu melaporkan yang di bawah target WCAG:
// 4,5:1 untuk teks normal, 3:1 untuk teks besar (24 px, atau 18,66 px bila tebal).
//
// Kenapa alat ini ada: pass "Outline UI" (docs/UI_UX_OUTLINE_STYLE_2026-09-20.md)
// hanya meninjau screenshot tanpa mengukur, sehingga teks dengan rasio 1,06:1
// lolos karena masih terbaca samar di layar developer.
//
// Cara kerjanya:
//   - App dijalankan di dalam proses ini dengan database in-memory dan data contoh,
//     lalu browser disetir lewat Chrome DevTools Protocol. Tidak ada dependensi baru
//     dan tidak pernah menyentuh database asli.
//   - Halaman internal diukur SETELAH login, memakai peran yang sesuai, dan setiap
//     tab di dalamnya diklik supaya panel yang tersembunyi ikut terukur. Audit awal
//     buta terhadap ini karena sesi internal tidak pernah berhasil dibuka.
//   - Latar buram diukur pasti. Latar foto atau gradien TIDAK diberi angka tunggal,
//     karena skrip tidak tahu piksel foto. Yang dilaporkan adalah batas terburuk dan
//     terbaik; lulus hanya bila ada lapisan penutup yang menjamin keterbacaan di atas
//     foto apa pun, sisanya ditandai TINJAU MANUAL.
//
// Yang TIDAK diukur, supaya tidak ada yang mengira lebih dari yang dilakukan:
//   - Keadaan hover, fokus, dan aktif. Hanya keadaan statis setelah halaman dimuat.
//   - Kontras non-teks (ikon, batas, indikator fokus). Itu kriteria WCAG 1.4.11.
//   - Lapisan penutup yang dibuat dengan ::before atau ::after, dan text-shadow.
//     Keduanya membuat hasil lebih konservatif, tidak lebih longgar.
//   - Font web. Google Fonts diblokir supaya hasil identik di mesin tanpa internet;
//     ukuran huruf tidak berubah, hanya bentuknya.
//
// Pemakaian:
//   npm run check:contrast
//   node scripts/contrast-check.js --page=index,biaya --viewport=375
//   node scripts/contrast-check.js --strict --json=hasil.json
//
// Kode keluar: 0 bersih, 1 ada pelanggaran (atau tinjau manual bila --strict),
// 2 alat gagal mengukur (browser tidak ditemukan, halaman gagal dimuat).

'use strict';

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const C = require('./contrast-math.js');

const TAB_SELECTOR = '[id^="tab-btn-"], .crm-pill-btn, [role="tab"]';

// ---------------------------------------------------------------------------
// Argumen
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { pages: null, viewports: [375, 1280], strict: false, verbose: false, json: null, browser: null, help: false };
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (key === 'page') options.pages = value.split(',').map((item) => item.trim()).filter(Boolean);
    else if (key === 'viewport') options.viewports = value.split(',').map(Number).filter((n) => n > 0);
    else if (key === 'strict') options.strict = true;
    else if (key === 'verbose') options.verbose = true;
    else if (key === 'json') options.json = value;
    else if (key === 'browser') options.browser = value;
    else if (key === 'help') options.help = true;
    else throw new Error(`Opsi tidak dikenal: ${arg}. Jalankan dengan --help.`);
  }
  return options;
}

const HELP = `Pengukur kontras teks.

  --page=a,b        hanya halaman ini (nama berkas tanpa .html, mis. index,portal)
  --viewport=375    lebar viewport, dipisah koma (bawaan 375,1280)
  --strict          TINJAU MANUAL ikut membuat skrip gagal
  --verbose         tampilkan seluruh temuan tinjau manual, bukan ringkasannya
  --json=berkas     tulis hasil lengkap sebagai JSON
  --browser=path    jalur ke Chrome atau Edge (atau env CHROME_PATH)
`;

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

function findBrowser(explicit) {
  const env = process.env;
  const candidates = [
    explicit,
    env.CHROME_PATH,
    env.ProgramFiles && path.join(env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launchBrowser(executable) {
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-contrast-'));
  const child = spawn(executable, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  let exited = false;
  child.once('exit', () => { exited = true; });

  let wsUrl = null;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !wsUrl) {
    if (exited) throw new Error('Browser berhenti sebelum siap.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) wsUrl = (await response.json()).webSocketDebuggerUrl;
    } catch {
      await delay(200);
    }
  }
  if (!wsUrl) throw new Error('Browser tidak menjawab pada port debugging.');

  async function stop() {
    if (!exited) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    }
    await delay(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    } catch {
      // Profil sementara yang masih terkunci tidak layak menggagalkan hasil ukur.
    }
  }
  return { wsUrl, stop };
}

// Klien Chrome DevTools Protocol minimal. WebSocket sudah bawaan Node 22 ke atas.
function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = [];

    const api = {
      send(method, params = {}, sessionId) {
        const id = nextId++;
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        return new Promise((ok, fail) => {
          pending.set(id, { ok, fail, method });
          socket.send(JSON.stringify(payload));
        });
      },
      on(method, handler, sessionId) {
        const entry = { method, handler, sessionId };
        listeners.push(entry);
        return () => { listeners.splice(listeners.indexOf(entry), 1); };
      },
      close() { socket.close(); }
    };

    socket.addEventListener('open', () => resolve(api));
    socket.addEventListener('error', () => reject(new Error('Gagal tersambung ke browser lewat DevTools.')));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.fail(new Error(`${entry.method}: ${message.error.message}`));
        else entry.ok(message.result);
        return;
      }
      if (!message.method) return;
      for (const listener of [...listeners]) {
        if (listener.method === message.method && (!listener.sessionId || listener.sessionId === message.sessionId)) {
          listener.handler(message.params);
        }
      }
    });
  });
}

async function openTab(cdp, { width, height, bootScript }) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);

  const inflight = new Set();
  let lastActivity = Date.now();
  const touch = () => { lastActivity = Date.now(); };
  cdp.on('Network.requestWillBeSent', (p) => { inflight.add(p.requestId); touch(); }, sessionId);
  cdp.on('Network.loadingFinished', (p) => { inflight.delete(p.requestId); touch(); }, sessionId);
  cdp.on('Network.loadingFailed', (p) => { inflight.delete(p.requestId); touch(); }, sessionId);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  try {
    // Font web diblokir supaya hasil tidak bergantung pada koneksi internet.
    await send('Network.setBlockedURLs', { urls: ['*://fonts.googleapis.com/*', '*://fonts.gstatic.com/*'] });
  } catch {
    // Versi browser yang menolak perintah ini tetap dapat dipakai.
  }
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  if (bootScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: bootScript });

  return {
    send,
    async waitIdle(quietMs = 500, timeoutMs = 12000) {
      const limit = Date.now() + timeoutMs;
      while (Date.now() < limit) {
        if (inflight.size === 0 && Date.now() - lastActivity >= quietMs) return;
        await delay(100);
      }
    },
    once(method) {
      return new Promise((resolve) => {
        const off = cdp.on(method, (params) => { off(); resolve(params); }, sessionId);
      });
    },
    async evaluate(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) {
        throw new Error((exceptionDetails.exception && exceptionDetails.exception.description) || exceptionDetails.text || 'Evaluasi gagal');
      }
      return result.value;
    },
    close() { return cdp.send('Target.closeTarget', { targetId }).catch(() => {}); }
  };
}

// ---------------------------------------------------------------------------
// Aplikasi dan data contoh
// ---------------------------------------------------------------------------

async function bootApp() {
  // Sama seperti scripts/dev.js: penyimpanan berkas selalu lokal, dan .env tidak
  // pernah dibaca oleh createHamasahApp, jadi tidak ada jalan ke database asli.
  process.env.STORAGE_DRIVER = 'local';
  const { createHamasahApp } = require('../server/app.js');
  const { createTestDatabase } = require('../server/test-support/database.js');
  const { createRelaxedRateLimiter } = require('../server/test-support/rate-limit.js');
  const { seedDevelopmentData, DEV_PASSWORD } = require('./seed-dev.js');

  const database = await createTestDatabase();
  await seedDevelopmentData({ database, logger: { log() {} } });

  const app = createHamasahApp({
    rootDirectory: ROOT,
    database,
    appEnvironment: 'development',
    rateLimiter: createRelaxedRateLimiter(),
    email: { driver: 'test', appBaseUrl: 'http://127.0.0.1' },
    emailSender: { provider: 'test', configured: true, async send() { return { id: 'kontras' }; } }
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    password: DEV_PASSWORD,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await database.close();
    }
  };
}

const ROLE_EMAILS = Object.freeze({
  admin: 'admin@hamasah.test',
  petugas: 'petugas@hamasah.test',
  musyrif: 'musyrif@hamasah.test',
  guru: 'guru@hamasah.test',
  keuangan: 'keuangan@hamasah.test',
  wali: 'wali@hamasah.test',
  santri: 'santri@hamasah.test'
});

async function call(baseUrl, method, pathname, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const parsed = await response.json().catch(() => ({}));
  return { status: response.status, body: parsed };
}

// Mengisi data supaya daftar, lencana status, dan tabel benar-benar tampil. Halaman
// kosong hampir tidak punya teks berstatus, dan di situlah masalah warna biasanya
// bersembunyi. Setiap langkah dibungkus try supaya satu endpoint yang berubah
// bentuk tidak menggagalkan seluruh pengukuran.
async function seedScenarioData(baseUrl, tokens, warn) {
  const admin = tokens.admin;
  const attempt = async (label, action) => {
    try {
      const result = await action();
      if (result && result.status >= 400) warn(`seed ${label}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 120)}`);
      return result;
    } catch (error) {
      warn(`seed ${label}: ${error.message}`);
      return null;
    }
  };

  const students = await call(baseUrl, 'GET', '/api/my-students', admin);
  const studentId = students.body.items && students.body.items[0] && students.body.items[0].id;
  const today = new Date();
  const isoDay = (offset) => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const context = { studentId, studentIds: {} };

  for (const role of ['wali', 'santri', 'musyrif']) {
    const own = await call(baseUrl, 'GET', '/api/my-students', tokens[role]);
    context.studentIds[role] = own.body.items && own.body.items[0] && own.body.items[0].id;
  }
  context.studentIds.admin = studentId;

  if (studentId) {
    const at = today.toISOString();
    await attempt('kegiatan', () => call(baseUrl, 'POST', `/api/students/${studentId}/activities`, admin, { title: 'Talaqqi pagi', description: 'Membaca kitab bersama pembina.', occurredAt: at }));
    await attempt('capaian', () => call(baseUrl, 'POST', `/api/students/${studentId}/achievements`, admin, { title: 'Hafalan Juz 1', description: 'Selesai.', occurredAt: at }));
    await attempt('presensi', () => call(baseUrl, 'POST', `/api/students/${studentId}/attendance`, admin, { status: 'late', category: 'Mudzakarah malam', occurredAt: at }));
    await attempt('evaluasi', () => call(baseUrl, 'POST', `/api/students/${studentId}/evaluations`, admin, { note: 'Perkembangan bahasa Arab konsisten.', area: 'Akademik', occurredAt: at }));
    await attempt('pelanggaran', () => call(baseUrl, 'POST', `/api/students/${studentId}/violations`, admin, { note: 'Terlambat kembali ke asrama.', level: 'sedang', occurredAt: at }));

    // Tiga keadaan invoice, karena masing-masing punya lencana warna sendiri.
    await attempt('invoice belum bayar', () => call(baseUrl, 'POST', '/api/operations/invoices', admin, { studentId, description: 'SPP September', amount: 1500000 }));
    const paid = await attempt('invoice lunas', () => call(baseUrl, 'POST', '/api/operations/invoices', admin, { studentId, description: 'SPP Agustus', amount: 1500000 }));
    if (paid && paid.body.invoice) await attempt('tandai lunas', () => call(baseUrl, 'PATCH', `/api/operations/invoices/${paid.body.invoice.id}/paid`, admin));
    const voided = await attempt('invoice batal', () => call(baseUrl, 'POST', '/api/operations/invoices', admin, { studentId, description: 'SPP Juli', amount: 1500000 }));
    if (voided && voided.body.invoice) await attempt('batalkan', () => call(baseUrl, 'PATCH', `/api/operations/invoices/${voided.body.invoice.id}/void`, admin, { reason: 'Tagihan ganda untuk bulan yang sama.' }));

    // Satu paspor yang sudah lewat dan satu visa yang segera habis: dua lencana berbeda.
    await attempt('visa', () => call(baseUrl, 'POST', '/api/operations/visas', admin, { studentId, status: 'submitted', passportExpiresAt: isoDay(-5), visaExpiresAt: isoDay(12), note: 'Uji kontras.' }));
  }

  const item = await attempt('inventaris', () => call(baseUrl, 'POST', '/api/operations/inventory', admin, { name: 'Kasur asrama', location: 'Hay Asyir', quantity: 4 }));
  if (item && item.body.item) await attempt('mutasi', () => call(baseUrl, 'POST', `/api/operations/inventory/${item.body.item.id}/movements`, admin, { direction: 'in', quantity: 2, reason: 'Pembelian tambahan' }));

  await attempt('konsultasi', () => call(baseUrl, 'POST', '/api/inquiries', null, { name: 'Siti Aminah', phone: '081298765432', topic: 'biaya', message: 'Mohon informasi skema pembayaran untuk program Mahad tahun depan.' }));

  const registration = await attempt('pendaftaran', () => call(baseUrl, 'POST', '/api/registrations', null, {
    applicantName: 'Calon Uji Kontras', phone: '081234500001', guardianName: 'Wali Uji', guardianPhone: '081298700001',
    email: 'kontras@example.test', guardianEmail: 'wali.kontras@example.test', birthDate: '2005-01-01', gender: 'putra',
    schoolOrigin: 'MA Uji', guardianConsent: true, program: 'kuliah-al-azhar', educationLevel: 'MA', city: 'Bandung',
    consent: true, dataProcessingConsent: true
  }));
  if (registration && registration.body.registration) {
    context.registration = { id: registration.body.registration.registrationId, code: registration.body.accessCode };
  }

  const articles = await call(baseUrl, 'GET', '/api/articles', null);
  const list = articles.body.items || articles.body.articles || [];
  context.articleSlug = list[0] && list[0].slug;
  return context;
}

// ---------------------------------------------------------------------------
// Skenario
// ---------------------------------------------------------------------------

function buildScenarios(context) {
  const scenarios = [];
  const publicPages = ['index', 'biaya', 'kontak', 'articles', 'kebijakan-privasi', '404', 'lupa-password'];
  for (const page of publicPages) scenarios.push({ name: page, page });

  scenarios.push({ name: 'article', page: 'article', query: context.articleSlug ? `?slug=${encodeURIComponent(context.articleSlug)}` : '' });
  scenarios.push({ name: 'reset-password', page: 'reset-password', hash: '#token=uji-kontras' });
  scenarios.push({ name: 'aktivasi', page: 'aktivasi', hash: '#token=uji-kontras' });

  const states = [];
  if (context.registration) {
    states.push({
      label: 'setelah masuk',
      run: `(async () => {
        document.querySelector('#reg-id').value = ${JSON.stringify(context.registration.id)};
        document.querySelector('#access-token').value = ${JSON.stringify(context.registration.code)};
        document.querySelector('#lookup-form').requestSubmit();
        await new Promise((resolve) => setTimeout(resolve, 1800));
      })()`
    });
  }
  scenarios.push({ name: 'cek-status', page: 'cek-status', states });

  // Layar masuk halaman internal: yang dilihat siapa pun yang belum punya sesi.
  for (const page of ['portal', 'staff', 'lms', 'monitoring', 'operations', 'audit']) {
    scenarios.push({ name: `${page} (layar masuk)`, page });
  }

  // Setelah login, memakai peran yang benar-benar memakai halaman itu.
  const signedIn = [
    ['portal', 'admin'], ['portal', 'wali'], ['portal', 'santri'], ['portal', 'musyrif'],
    ['staff', 'petugas'], ['lms', 'guru'], ['lms', 'santri'],
    ['monitoring', 'musyrif'], ['operations', 'keuangan'], ['audit', 'admin']
  ];
  for (const [page, role] of signedIn) {
    scenarios.push({ name: `${page} (${role})`, page, role, autoTabs: true });
  }
  // Tampilan detail santri di portal: bagian yang paling banyak lencana dan tab.
  for (const role of ['admin', 'wali', 'santri']) {
    const id = context.studentIds[role];
    if (id) scenarios.push({ name: `portal (${role}, detail santri)`, page: 'portal', role, query: `?studentId=${encodeURIComponent(id)}`, autoTabs: true });
  }
  return scenarios;
}

// ---------------------------------------------------------------------------
// Pengukuran di dalam halaman
// ---------------------------------------------------------------------------

// Dijalankan di browser lewat toString(), jadi tidak boleh merujuk apa pun dari
// lingkup Node. HamasahContrast disuntikkan lebih dulu dari contrast-math.js.
function measureInPage() {
  'use strict';
  const C = window.HamasahContrast;
  const PHOTO_TAGS = { IMG: 1, VIDEO: 1, CANVAS: 1, IFRAME: 1, OBJECT: 1, EMBED: 1 };
  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TITLE: 1, OPTION: 1, OPTGROUP: 1 };

  const styleCache = new Map();
  function style(node) {
    let cached = styleCache.get(node);
    if (!cached) { cached = getComputedStyle(node); styleCache.set(node, cached); }
    return cached;
  }

  // Opasitas kelompok: hasil kali opacity elemen dan semua leluhurnya. Penerapannya
  // pada lapisan adalah aproksimasi yang eksak untuk satu lapisan buram di dalam
  // kelompok, dan mendekati untuk susunan lapisan tembus pandang bertingkat.
  const opacityCache = new Map();
  function groupOpacity(node) {
    if (opacityCache.has(node)) return opacityCache.get(node);
    const own = parseFloat(style(node).opacity);
    const parent = node.parentElement;
    const value = (Number.isNaN(own) ? 1 : own) * (parent ? groupOpacity(parent) : 1);
    opacityCache.set(node, value);
    return value;
  }

  function splitTopLevel(value) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of value) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += char;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function colorsIn(text) {
    return (text.match(/rgba?\([^)]*\)/g) || []).map((token) => C.parseColor(token)).filter(Boolean);
  }

  // Menelusuri lapisan di belakang teks dari atas ke bawah sampai menemukan dasar:
  // warna buram (pasti), atau foto/gradien (tidak diketahui).
  function resolveBackdrop(layers) {
    const over = [];
    const notes = [];
    for (const layer of layers) {
      const computed = style(layer);
      const multiplier = groupOpacity(layer);

      if (PHOTO_TAGS[layer.tagName]) {
        return { over, base: { type: 'photo' }, kind: `<${layer.tagName.toLowerCase()}>`, notes };
      }

      const image = computed.backgroundImage;
      if (image && image !== 'none') {
        let imageBase = null;
        for (const part of splitTopLevel(image)) {
          if (/^(-webkit-)?image-set\(|^url\(/.test(part)) { imageBase = { type: 'photo' }; break; }
          const stops = colorsIn(part);
          if (!stops.length) { imageBase = { type: 'photo' }; break; }
          if (stops.every((stop) => stop.a >= 0.999)) { imageBase = { type: 'gradient', colors: stops }; break; }
          // Gradien tembus pandang dihitung pada bagian TERLEMAHNYA. Konservatif:
          // teks di ujung yang pekat tetap dinilai seolah berada di ujung yang tipis.
          const weakest = stops.reduce((least, stop) => (stop.a < least.a ? stop : least), stops[0]);
          if (weakest.a > 0) over.push({ r: weakest.r, g: weakest.g, b: weakest.b, a: weakest.a * multiplier });
          notes.push('gradien tembus pandang dihitung pada bagian terlemahnya');
        }
        if (imageBase) return { over, base: imageBase, kind: imageBase.type, notes };
      }

      const background = C.parseColor(computed.backgroundColor);
      if (!background) {
        notes.push('warna latar tidak terbaca');
        return { over, base: { type: 'photo' }, kind: 'tidak terbaca', notes };
      }
      const alpha = background.a * multiplier;
      if (alpha <= 0) continue;
      if (alpha >= 0.999) {
        return { over, base: { type: 'solid', color: { r: background.r, g: background.g, b: background.b, a: 1 } }, kind: 'solid', notes };
      }
      over.push({ r: background.r, g: background.g, b: background.b, a: alpha });
    }
    return { over, base: { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } }, kind: 'kanvas putih bawaan', notes };
  }

  function describe(element) {
    const parts = [];
    let node = element;
    for (let depth = 0; depth < 3 && node && node.nodeType === 1; depth += 1, node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(`${part}#${node.id}`); break; }
      const classes = Array.from(node.classList).slice(0, 2).join('.');
      if (classes) part += `.${classes}`;
      parts.unshift(part);
    }
    return parts.join(' > ');
  }

  const RANK = { violation: 0, manual: 1, pass: 2 };
  let checked = 0;
  let passed = 0;
  const findings = [];
  const seen = new Set();

  function measure(element, textColor, fontSize, fontWeight, text, rects, extraNote) {
    // Titik uji: tengah baris pertama dan terakhir. Teks yang membungkus di atas
    // latar yang berubah dinilai pada titik terburuknya.
    const chosen = rects.length > 1 ? [rects[0], rects[rects.length - 1]] : [rects[0]];
    let worstResult = null;
    let worstMeta = null;

    for (const rect of chosen) {
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;

      const stack = document.elementsFromPoint(x, y);
      const start = stack.indexOf(element);
      const notes = extraNote ? [extraNote] : [];
      let layers;
      if (start === -1) {
        layers = [];
        for (let node = element; node; node = node.parentElement) layers.push(node);
        notes.push('elemen tidak ada di titik uji; dihitung dari leluhurnya');
      } else {
        layers = stack.slice(start);
      }

      const backdrop = resolveBackdrop(layers);
      const target = C.targetFor(fontSize, fontWeight);
      const result = C.analyze({
        text: { r: textColor.r, g: textColor.g, b: textColor.b, a: textColor.a * groupOpacity(element) },
        over: backdrop.over,
        base: backdrop.base,
        target
      });
      const meta = { backdrop, target, notes: notes.concat(backdrop.notes) };
      if (!worstResult || RANK[result.status] < RANK[worstResult.status]
        || (RANK[result.status] === RANK[worstResult.status] && result.worst < worstResult.worst)) {
        worstResult = result;
        worstMeta = meta;
      }
    }
    if (!worstResult) return;

    checked += 1;
    if (worstResult.status === 'pass') { passed += 1; return; }

    const key = [worstResult.status, describe(element), text, C.toHex(textColor), worstResult.backdrop].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({
      status: worstResult.status,
      worst: worstResult.worst,
      best: worstResult.best,
      target: worstMeta.target,
      large: C.isLargeText(fontSize, fontWeight),
      text,
      selector: describe(element),
      color: C.toHex(textColor),
      fontSize,
      fontWeight,
      backdrop: worstResult.backdrop,
      kind: worstMeta.backdrop.kind,
      notes: Array.from(new Set(worstMeta.notes))
    });
  }

  function lineRects(nodes) {
    const rects = [];
    for (const node of nodes) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
    }
    return rects;
  }

  function visible(element) {
    if (typeof element.checkVisibility === 'function') {
      if (!element.checkVisibility({ checkOpacity: true, opacityProperty: true, checkVisibilityCSS: true, visibilityProperty: true })) return false;
    }
    if (element.closest(':disabled, svg')) return false;
    return true;
  }

  function bringIntoView(element) {
    const box = element.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }
  }

  // Teks biasa.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
  });
  const byElement = new Map();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!element || SKIP_TAGS[element.tagName]) continue;
    if (!byElement.has(element)) byElement.set(element, []);
    byElement.get(element).push(node);
  }

  for (const [element, nodes] of byElement) {
    if (!visible(element)) continue;
    bringIntoView(element);
    const rects = lineRects(nodes);
    if (!rects.length) continue;

    const computed = style(element);
    const fill = computed.getPropertyValue('-webkit-text-fill-color');
    const color = C.parseColor(fill && fill.trim() ? fill : computed.color);
    const fontSize = parseFloat(computed.fontSize);
    const fontWeight = parseInt(computed.fontWeight, 10) || 400;
    const text = nodes.map((node) => node.nodeValue).join(' ').replace(/\s+/g, ' ').trim().slice(0, 90);

    // Teks tanpa satu pun huruf atau angka adalah pemisah atau penanda dekoratif
    // ("·", ">", "/", "*"). WCAG mengecualikan teks insidental semacam itu, dan
    // membiarkannya masuk hanya membuat laporan penuh temuan yang bukan temuan.
    if (!/[\p{L}\p{N}]/u.test(text)) continue;

    if (!color) {
      checked += 1;
      findings.push({ status: 'manual', worst: null, best: null, target: C.targetFor(fontSize, fontWeight), large: false, text, selector: describe(element), color: '?', fontSize, fontWeight, backdrop: '-', kind: 'warna teks tidak terbaca', notes: [] });
      continue;
    }
    if (color.a === 0) {
      // Teks transparan biasanya berarti gradien di balik background-clip: text.
      checked += 1;
      findings.push({ status: 'manual', worst: null, best: null, target: C.targetFor(fontSize, fontWeight), large: false, text, selector: describe(element), color: 'transparan', fontSize, fontWeight, backdrop: '-', kind: 'teks transparan (gradien?)', notes: [] });
      continue;
    }
    measure(element, color, fontSize, fontWeight, text, rects, null);
  }

  // Isian formulir: nilai dan placeholder tidak berupa simpul teks, jadi terlewat
  // di atas. Placeholder abu-abu terang adalah pelanggaran yang sangat umum.
  const controls = document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]), textarea, select');
  for (const control of controls) {
    if (!visible(control)) continue;
    bringIntoView(control);
    const box = control.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const computed = style(control);
    const fontSize = parseFloat(computed.fontSize);
    const fontWeight = parseInt(computed.fontWeight, 10) || 400;

    let colorText = computed.color;
    let label;
    if (control.tagName === 'SELECT') {
      const selected = control.selectedOptions && control.selectedOptions[0];
      label = `(pilihan) ${selected ? selected.textContent.trim() : ''}`;
    } else if (control.value) {
      label = control.type === 'password' ? '(isi kata sandi)' : `(isi) ${control.value}`;
    } else if (control.placeholder) {
      colorText = getComputedStyle(control, '::placeholder').color;
      label = `(placeholder) ${control.placeholder}`;
    } else {
      continue;
    }
    const color = C.parseColor(colorText);
    if (!color) continue;
    measure(control, color, fontSize, fontWeight, label.slice(0, 90), [box], null);
  }

  return { checked, passed, findings };
}

// ---------------------------------------------------------------------------
// Menjalankan
// ---------------------------------------------------------------------------

function bootScriptFor(token) {
  const math = fs.readFileSync(path.join(__dirname, 'contrast-math.js'), 'utf8');
  const session = token
    ? `try { sessionStorage.setItem('hamasahPortalSession', ${JSON.stringify(JSON.stringify({ accessToken: token }))}); } catch (error) { /* origin tanpa penyimpanan */ }`
    : '';
  return `${math}\n${session}`;
}

const MEASURE_EXPRESSION = `(${measureInPage.toString()})()`;

async function measureScenario(cdp, baseUrl, scenario, viewport, tokens, options) {
  const height = viewport < 768 ? 812 : 900;
  const tab = await openTab(cdp, { width: viewport, height, bootScript: bootScriptFor(scenario.role ? tokens[scenario.role] : null) });
  const stateResults = [];
  try {
    const url = `${baseUrl}/website/${scenario.page}.html${scenario.query || ''}${scenario.hash || ''}`;
    const loaded = tab.once('Page.loadEventFired');
    await tab.send('Page.navigate', { url });
    await Promise.race([loaded, delay(25000).then(() => { throw new Error('halaman tidak selesai dimuat dalam 25 detik'); })]);
    await tab.waitIdle();
    await delay(300);

    const record = async (label) => {
      const result = await tab.evaluate(MEASURE_EXPRESSION);
      stateResults.push({ label, ...result });
    };

    await record('awal');

    for (const state of scenario.states || []) {
      await tab.evaluate(state.run);
      await tab.waitIdle();
      await record(state.label);
    }

    if (scenario.autoTabs) {
      const count = await tab.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(TAB_SELECTOR)})).filter((b) => b.offsetParent !== null).length`);
      for (let index = 0; index < count; index += 1) {
        const label = await tab.evaluate(`(() => {
          const button = Array.from(document.querySelectorAll(${JSON.stringify(TAB_SELECTOR)})).filter((b) => b.offsetParent !== null)[${index}];
          if (!button) return null;
          const name = (button.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
          button.click();
          return name;
        })()`);
        if (label === null) break;
        await delay(250);
        await tab.waitIdle(300, 6000);
        await record(`tab: ${label}`);
      }
    }
  } finally {
    await tab.close();
  }
  return stateResults;
}

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------

const fmt = (value) => (value === null || value === undefined ? '?' : C.floorTo2(value).toFixed(2).replace('.', ','));

function summarize(runs) {
  const merged = new Map();
  let checked = 0;
  let passed = 0;
  for (const run of runs) {
    for (const state of run.states) {
      checked += state.checked;
      passed += state.passed;
      for (const finding of state.findings) {
        const key = [finding.status, finding.selector, finding.text, finding.color, finding.backdrop].join('|');
        const where = `${run.scenario} @${run.viewport}${state.label === 'awal' ? '' : ` (${state.label})`}`;
        if (!merged.has(key)) merged.set(key, { ...finding, where: new Set([where]) });
        else merged.get(key).where.add(where);
      }
    }
  }
  const all = Array.from(merged.values());
  const byWorst = (a, b) => (a.worst === null ? 99 : a.worst) - (b.worst === null ? 99 : b.worst);
  return {
    checked,
    passed,
    violations: all.filter((item) => item.status === 'violation').sort(byWorst),
    manual: all.filter((item) => item.status === 'manual').sort(byWorst)
  };
}

function printFinding(finding, index) {
  const where = Array.from(finding.where);
  const shown = where.slice(0, 3).join(', ') + (where.length > 3 ? `, +${where.length - 3} lainnya` : '');
  const ratio = finding.worst === null
    ? 'tidak terukur'
    : finding.worst === finding.best
      ? `${fmt(finding.worst)}:1`
      : `${fmt(finding.worst)}:1 sampai ${fmt(finding.best)}:1`;
  const size = `${Math.round(finding.fontSize * 10) / 10}px/${finding.fontWeight}${finding.large ? ' besar' : ''}`;
  console.log(`  ${String(index + 1).padStart(2)}. ${ratio}  (perlu ${fmt(finding.target)}:1)  "${finding.text}"`);
  console.log(`      ${finding.selector}  |  ${finding.color} pada ${finding.backdrop}  |  ${size}`);
  console.log(`      ${shown}${finding.notes.length ? `  |  ${finding.notes.join('; ')}` : ''}`);
}

function report(runs, summary, options) {
  console.log('');
  console.log('Ringkasan per halaman');
  console.log('---------------------');
  for (const run of runs) {
    const violations = run.states.reduce((sum, state) => sum + state.findings.filter((f) => f.status === 'violation').length, 0);
    const manual = run.states.reduce((sum, state) => sum + state.findings.filter((f) => f.status === 'manual').length, 0);
    const checked = run.states.reduce((sum, state) => sum + state.checked, 0);
    const marker = violations ? 'GAGAL' : manual ? 'tinjau' : 'ok';
    console.log(`  ${marker.padEnd(6)} ${`${run.scenario} @${run.viewport}`.padEnd(46)} ${String(checked).padStart(5)} elemen, ${violations} pelanggaran, ${manual} tinjau manual`);
  }

  console.log('');
  console.log(`PELANGGARAN: ${summary.violations.length} temuan unik`);
  if (!summary.violations.length) console.log('  (tidak ada)');
  summary.violations.forEach(printFinding);

  console.log('');
  console.log(`TINJAU MANUAL: ${summary.manual.length} temuan unik (latar foto atau gradien, atau bergantung pada piksel)`);
  const limit = options.verbose ? summary.manual.length : 12;
  summary.manual.slice(0, limit).forEach(printFinding);
  if (summary.manual.length > limit) console.log(`  ... ${summary.manual.length - limit} lainnya. Gunakan --verbose untuk semuanya.`);

  console.log('');
  console.log(`Diperiksa ${summary.checked} elemen teks: ${summary.passed} lulus, ${summary.violations.length} pelanggaran unik, ${summary.manual.length} tinjau manual unik.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return 0; }

  const executable = findBrowser(options.browser);
  if (!executable) {
    console.error('Chrome atau Edge tidak ditemukan. Pasang salah satunya, atau berikan --browser=<jalur> atau env CHROME_PATH.');
    return 2;
  }

  const warnings = [];
  const warn = (message) => warnings.push(message);
  let app = null;
  let browser = null;
  let cdp = null;
  const runs = [];
  const failures = [];

  try {
    console.log('Menyalakan aplikasi (database in-memory) dan browser...');
    app = await bootApp();
    const tokens = {};
    for (const [role, email] of Object.entries(ROLE_EMAILS)) {
      const login = await call(app.baseUrl, 'POST', '/api/auth/login', null, { email, password: app.password });
      if (!login.body.accessToken) throw new Error(`Login ${role} gagal: HTTP ${login.status}`);
      tokens[role] = login.body.accessToken;
    }
    const context = await seedScenarioData(app.baseUrl, tokens, warn);
    if (options.verbose) warnings.forEach((message) => console.log(`  ! ${message}`));

    browser = await launchBrowser(executable);
    cdp = await connectCdp(browser.wsUrl);

    let scenarios = buildScenarios(context);
    if (options.pages) scenarios = scenarios.filter((scenario) => options.pages.includes(scenario.page));
    if (!scenarios.length) throw new Error(`Tidak ada halaman yang cocok dengan --page=${options.pages}.`);

    for (const scenario of scenarios) {
      for (const viewport of options.viewports) {
        const label = `${scenario.name} @${viewport}`;
        process.stdout.write(`  mengukur ${label} ... `);
        try {
          const states = await measureScenario(cdp, app.baseUrl, scenario, viewport, tokens, options);
          runs.push({ scenario: scenario.name, viewport, states });
          const found = states.reduce((sum, state) => sum + state.findings.length, 0);
          console.log(`${states.reduce((sum, state) => sum + state.checked, 0)} elemen, ${found} temuan`);
        } catch (error) {
          failures.push(`${label}: ${error.message}`);
          console.log(`GAGAL DIUKUR (${error.message})`);
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

  const summary = summarize(runs);
  report(runs, summary, options);

  if (warnings.length && !options.verbose) {
    console.log(`\n${warnings.length} langkah data contoh gagal (jalankan --verbose untuk rinciannya). Halaman terkait mungkin terukur dengan lebih sedikit data.`);
  }
  if (options.json) {
    fs.writeFileSync(options.json, JSON.stringify({ summary: { ...summary, violations: summary.violations.map((f) => ({ ...f, where: Array.from(f.where) })), manual: summary.manual.map((f) => ({ ...f, where: Array.from(f.where) })) }, failures }, null, 2));
    console.log(`Hasil lengkap ditulis ke ${options.json}`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} halaman gagal diukur, jadi hasil di atas TIDAK lengkap:`);
    failures.forEach((item) => console.error(`  - ${item}`));
    return 2;
  }
  if (summary.violations.length) return 1;
  if (options.strict && summary.manual.length) return 1;
  return 0;
}

main().then((code) => { process.exitCode = code; }, (error) => {
  console.error(error);
  process.exitCode = 2;
});
