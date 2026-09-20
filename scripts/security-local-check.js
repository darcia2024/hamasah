'use strict';
const fs = require('node:fs'); const path = require('node:path');
function run(root = path.resolve(__dirname, '..')) {
  const findings = [];
  const lock = path.join(root, 'package-lock.json');
  if (!fs.existsSync(lock)) findings.push('package-lock.json tidak ada');
  else if (!JSON.parse(fs.readFileSync(lock, 'utf8')).packages) findings.push('package-lock tidak memiliki packages');
  const source = fs.readdirSync(path.join(root, 'server')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(root, 'server', f), 'utf8')).join('\n');
  if (/console\.log\([^\n]*(password|secret|token|DATABASE_URL)/i.test(source)) findings.push('kemungkinan secret dicetak ke log server');
  const headers = fs.readFileSync(path.join(root, 'server/http/security-headers.js'), 'utf8');
  if (!headers.includes('X-Content-Type-Options') && !headers.includes('x-content-type-options')) findings.push('header keamanan tidak ditemukan');
  return { ok: findings.length === 0, findings };
}
if (require.main === module) { const result = run(); if (!result.ok) { result.findings.forEach((item) => console.error(`- ${item}`)); process.exitCode = 1; } else console.log('local security checks passed'); }
module.exports = { run };
