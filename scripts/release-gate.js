'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readAppEnvironment } = require('../server/environment.js');

const REQUIRED_FILES = Object.freeze([
  'Dockerfile', 'PRODUCTION_DEPLOYMENT.md', 'RUNBOOK.md',
  'server/http/security-headers.js', 'scripts/notification-worker.js'
]);

function checkReleaseGate(options) {
  const config = options || {};
  const root = config.rootDirectory || path.resolve(__dirname, '..');
  const environment = config.environment || process.env;
  const errors = [];
  let appEnv;
  try { appEnv = readAppEnvironment(environment); } catch (error) { return { ok: false, errors: [error.message], appEnv: null }; }
  if (['staging', 'production'].includes(appEnv)) {
    if (!String(environment.DATABASE_URL || '').startsWith('postgres')) errors.push('DATABASE_URL PostgreSQL wajib di staging/production.');
    if (!String(environment.STORAGE_BUCKET || '').trim()) errors.push('STORAGE_BUCKET wajib di staging/production.');
    if (String(environment.HAMASAH_BOOTSTRAP_KEY || '').length > 0 && String(environment.HAMASAH_BOOTSTRAP_KEY).length < 32) errors.push('HAMASAH_BOOTSTRAP_KEY harus minimal 32 karakter.');
    if (appEnv === 'production' && String(environment.APP_BASE_URL || '').startsWith('http://')) errors.push('APP_BASE_URL production harus HTTPS.');
  }
  for (const file of REQUIRED_FILES) if (!fs.existsSync(path.join(root, file))) errors.push(`Artefak rilis hilang: ${file}`);
  return { ok: errors.length === 0, appEnv, errors, checkedFiles: REQUIRED_FILES.length };
}

if (require.main === module) {
  const result = checkReleaseGate();
  if (result.ok) console.log(`[release-gate] ${result.appEnv} siap untuk pemeriksaan lanjutan (${result.checkedFiles} artefak).`);
  else { console.error(`[release-gate] gagal (${result.appEnv || 'environment tidak valid'}):`); result.errors.forEach((error) => console.error(`- ${error}`)); process.exitCode = 1; }
}

module.exports = { REQUIRED_FILES, checkReleaseGate };
