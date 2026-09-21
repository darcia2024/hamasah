'use strict';

// Perkakas browser headless bersama: mencari Chrome/Edge, menyalakannya, klien CDP
// minimal, tab dengan pengumpul diagnostik, dan aplikasi yang dinyalakan di dalam
// proses dengan database in-memory. Dipakai oleh scripts/contrast-check.js dan
// scripts/browser-contract.js supaya keduanya tidak menyimpang.

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

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

  // Diagnostik yang dikumpulkan sepanjang hidup tab: dipakai kontrak browser untuk
  // melaporkan pelanggaran CSP, galat JavaScript, dan sumber daya yang gagal dimuat.
  const diagnostics = [];
  const urlOf = new Map();
  const typeOf = new Map();
  const BLOCKED_ON_PURPOSE = /fonts.(googleapis|gstatic).com/;
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    diagnostics.push({ kind: 'js-error', text: (d.exception && d.exception.description) || d.text || 'galat JavaScript', url: d.url || '', line: d.lineNumber });
  }, sessionId);
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error') return;
    const text = (p.args || []).map((arg) => (arg.value !== undefined ? String(arg.value) : arg.description || '')).join(' ');
    diagnostics.push({ kind: 'console-error', text });
  }, sessionId);
  cdp.on('Log.entryAdded', (p) => {
    const entry = p.entry || {};
    if (entry.level !== 'error') return;
    // Pelanggaran CSP dilaporkan browser sebagai entri log bersumber "security" atau
    // sebagai teks "Refused to ...". Keduanya dihitung.
    const csp = entry.source === 'security' || /Content Security Policy|Refused to/i.test(entry.text || '');
    if (BLOCKED_ON_PURPOSE.test(entry.url || '') || BLOCKED_ON_PURPOSE.test(entry.text || '')) return;
    diagnostics.push({ kind: csp ? 'csp' : 'log-error', text: entry.text || '', url: entry.url || '' });
  }, sessionId);
  // Pelanggaran CSP pada atribut style/onclick tidak selalu muncul sebagai pesan console;
  // browser melaporkannya lewat domain Audits sebagai ContentSecurityPolicyIssue.
  cdp.on('Audits.issueAdded', (p) => {
    const issue = p.issue || {};
    const detail = issue.details && issue.details.contentSecurityPolicyIssueDetails;
    if (issue.code !== 'ContentSecurityPolicyIssue' || !detail) return;
    diagnostics.push({
      kind: 'csp',
      text: `${detail.violatedDirective} memblokir ${detail.contentSecurityPolicyViolationType || 'sumber'}${detail.blockedURL ? ` (${detail.blockedURL})` : ''}`,
      url: (detail.sourceCodeLocation && detail.sourceCodeLocation.url) || '',
      line: detail.sourceCodeLocation ? detail.sourceCodeLocation.lineNumber + 1 : undefined
    });
  }, sessionId);
  cdp.on('Network.requestWillBeSent', (p) => { urlOf.set(p.requestId, p.request.url); typeOf.set(p.requestId, p.type); }, sessionId);
  cdp.on('Network.responseReceived', (p) => {
    if (p.response.status >= 400) diagnostics.push({ kind: 'http-error', text: `HTTP ${p.response.status} untuk ${p.type}`, url: p.response.url });
  }, sessionId);
  cdp.on('Network.loadingFailed', (p) => {
    const url = urlOf.get(p.requestId) || '';
    if (p.canceled || BLOCKED_ON_PURPOSE.test(url)) return;
    diagnostics.push({ kind: 'load-failed', text: `${typeOf.get(p.requestId) || 'sumber daya'} gagal dimuat: ${p.errorText}`, url });
  }, sessionId);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Log.enable');
  await send('Audits.enable');
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
    diagnostics,
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


module.exports = { ROLE_EMAILS, bootApp, call, connectCdp, delay, findBrowser, freePort, launchBrowser, openTab };
