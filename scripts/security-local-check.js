'use strict';
// Pemeriksaan keamanan lokal (Task R5.3).
//
// Versi awal hanya memindai server/, sehingga kredensial pengujian yang tersaji di
// website/portal.js tidak akan pernah terdeteksi. Sekarang folder yang DISAJIKAN
// publik ikut dipindai, dan `npm audit` menjadi gerbang. Setiap temuan menyebut
// berkas dan baris.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Ambang keparahan yang disepakati: high ke atas memblokir. Temuan low/moderate
// tetap dilaporkan sebagai catatan tetapi tidak menggagalkan.
const AUDIT_LEVEL = 'high';

const SERVED_EXTENSIONS = new Set(['.js', '.html', '.css', '.json', '.txt', '.md', '.map']);
const CODE_EXTENSIONS = new Set(['.js', '.html']);

// Berkas yang tidak boleh ada di folder yang disajikan publik.
const NEVER_SERVED = [
  { test: (name) => /\.test\.js$/.test(name), why: 'berkas test tidak boleh tersaji publik' },
  { test: (name) => /\.md$/i.test(name), why: 'dokumen Markdown internal tidak boleh tersaji publik' }
];

// Domain yang hanya dipakai untuk akun pengujian.
const TEST_EMAIL = /[\w.+-]+@[\w-]+\.(?:test|local|invalid|localhost)\b/i;
// Kata sandi literal: penugasan/properti bernama password/sandi dengan nilai string tidak kosong.
const LITERAL_PASSWORD = /\b(?:password|passwd|pwd|kata[-_ ]?sandi|sandi)\w*\s*[:=]\s*(['"`])(?!\1)[^'"`$\n]{3,}\1/i;
// `passInput.value = '...'` : isian kata sandi diisi literal.
const FILLED_PASSWORD_FIELD = /(?:pass|pwd|sandi)\w*\s*\.value\s*=\s*(['"`])(?!\1)[^'"`$\n]+\1/i;
const HTML_PASSWORD_VALUE = /<input\b[^>]*type=["']password["'][^>]*\bvalue=["'][^"']+["']/i;

const IGNORED_DIRS = new Set(['node_modules', '.git']);

function walk(directory, visit, relative = '') {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(full, visit, rel);
    else visit(full, rel, entry.name);
  }
}

function scanServed(root, findings) {
  const served = path.join(root, 'website');
  walk(served, (full, rel, name) => {
    const location = `website/${rel}`;
    for (const rule of NEVER_SERVED) {
      if (rule.test(name)) findings.push(`${location}: ${rule.why}`);
    }
    const ext = path.extname(name).toLowerCase();
    if (!SERVED_EXTENSIONS.has(ext)) return;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((rawLine, index) => {
      // Contoh isian (placeholder) bukan kredensial; bagian itu dibuang sebelum diperiksa.
      const line = rawLine.replace(/\bplaceholder\s*=\s*(["'])[^"']*\1/gi, '');
      const where = `${location}:${index + 1}`;
      if (CODE_EXTENSIONS.has(ext)) {
        if (TEST_EMAIL.test(line)) findings.push(`${where}: alamat email akun pengujian tersaji publik`);
        if (LITERAL_PASSWORD.test(line) || FILLED_PASSWORD_FIELD.test(line) || HTML_PASSWORD_VALUE.test(line)) {
          findings.push(`${where}: kata sandi literal tersaji publik`);
        }
      }
      // Modul server di-require dari folder publik: berarti kode server ikut tersaji.
      if (ext === '.js' && /\brequire\(\s*['"`][^'"`]*(?:\.\.\/server|\/server\/)/.test(line)) {
        findings.push(`${where}: berkas publik me-require modul server`);
      }
    });
  });
}

function scanServer(root, findings) {
  const serverDir = path.join(root, 'server');
  walk(serverDir, (full, rel, name) => {
    if (!name.endsWith('.js') || /\.test\.js$/.test(name)) return;
    fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (/console\.log\([^\n]*(password|secret|token|DATABASE_URL)/i.test(line)) {
        findings.push(`server/${rel}:${index + 1}: kemungkinan secret dicetak ke log server`);
      }
    });
  });
  const headersPath = path.join(serverDir, 'http/security-headers.js');
  const headers = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
  if (!/x-content-type-options/i.test(headers)) findings.push('server/http/security-headers.js: header keamanan tidak ditemukan');
}

function scanLockfile(root, findings) {
  const lock = path.join(root, 'package-lock.json');
  if (!fs.existsSync(lock)) findings.push('package-lock.json tidak ada');
  else if (!JSON.parse(fs.readFileSync(lock, 'utf8')).packages) findings.push('package-lock.json: tidak memiliki packages');
}

const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];

// Menjalankan `npm audit --omit=dev --json`. Jaringan tidak tersedia bukan berarti
// aman, jadi kegagalan menjalankan audit DILAPORKAN sebagai temuan, tidak diam-diam lulus.
function runAudit(root, level) {
  const result = spawnSync('npm audit --omit=dev --json', {
    cwd: root, encoding: 'utf8', shell: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024
  });
  let report;
  try { report = JSON.parse(result.stdout || ''); } catch { report = null; }
  if (!report || !report.metadata || !report.metadata.vulnerabilities) {
    const reason = report && report.error ? report.error.summary || report.error.code : (result.stderr || 'keluaran tidak terbaca').trim().split('\n')[0];
    return { findings: [`npm audit gagal dijalankan: ${reason}`], notes: [] };
  }
  const counts = report.metadata.vulnerabilities;
  const blocking = SEVERITY_ORDER.slice(SEVERITY_ORDER.indexOf(level)).filter((name) => counts[name] > 0);
  const findings = blocking.map((name) => `npm audit: ${counts[name]} kerentanan tingkat ${name} (ambang ${level})`);
  const below = SEVERITY_ORDER.slice(0, SEVERITY_ORDER.indexOf(level)).filter((name) => counts[name] > 0);
  const notes = below.map((name) => `npm audit: ${counts[name]} kerentanan tingkat ${name} (di bawah ambang, dicatat)`);
  return { findings, notes };
}

// options.audit: false untuk lewati (test unit tanpa jaringan), atau fungsi pengganti.
function run(root = path.resolve(__dirname, '..'), options = {}) {
  const findings = [];
  const notes = [];
  scanLockfile(root, findings);
  scanServer(root, findings);
  scanServed(root, findings);
  if (options.audit !== false) {
    const audit = typeof options.audit === 'function' ? options.audit(root, AUDIT_LEVEL) : runAudit(root, AUDIT_LEVEL);
    findings.push(...audit.findings);
    notes.push(...audit.notes);
  }
  return { ok: findings.length === 0, findings, notes };
}

if (require.main === module) {
  const result = run();
  result.notes.forEach((item) => console.log(`  catatan: ${item}`));
  if (!result.ok) {
    result.findings.forEach((item) => console.error(`- ${item}`));
    process.exitCode = 1;
  } else {
    console.log('local security checks passed');
  }
}

module.exports = { AUDIT_LEVEL, run, runAudit };
