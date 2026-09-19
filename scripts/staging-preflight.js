// Pemeriksaan read-only sebelum UAT staging.
// Tidak membuka koneksi database kecuali dipanggil dengan --verify-database.

const path = require('node:path');
const { loadEnvironmentFile } = require('../database/migrate.js');
const { readProductionConfig } = require('../server/production-config.js');

function checkStagingEnvironment(environment = process.env, { loadFile = true } = {}) {
  const values = { ...environment };
  if (loadFile) loadEnvironmentFile(path.join(__dirname, '..', '.env'), values);
  const config = readProductionConfig(values);
  const errors = [];
  const warnings = [];
  if (!['staging', 'production'].includes(config.appEnvironment)) {
    errors.push(`APP_ENV harus staging atau production, sekarang ${config.appEnvironment}.`);
  }
  if (!config.storageBucket) errors.push('STORAGE_BUCKET wajib diisi untuk UAT staging/production.');
  if (config.storageDriver !== 'supabase') errors.push('STORAGE_DRIVER harus supabase untuk UAT staging/production.');
  if (config.email.driver === 'disabled') errors.push('EMAIL_DRIVER masih disabled; worker dan aktivasi akun tidak bisa diuji.');
  if (!config.email.appBaseUrl) errors.push('APP_BASE_URL wajib diisi agar link email dapat diuji.');
  if (config.email.appBaseUrl && !config.email.appBaseUrl.startsWith('https://')) warnings.push('APP_BASE_URL belum memakai https://. Gunakan HTTPS pada domain staging yang sebenarnya.');
  if (!values.NOTIFICATION_PAYLOAD_KEY && !config.ipHashSecret) errors.push('NOTIFICATION_PAYLOAD_KEY atau IP_HASH_SECRET wajib tersedia untuk worker.');
  return { config, errors, warnings };
}

async function verifyDatabaseIfRequested() {
  if (!process.argv.includes('--verify-database')) return null;
  const { verifyDatabase } = require('../database/verify.js');
  return verifyDatabase();
}

async function main() {
  try {
    const result = checkStagingEnvironment();
    for (const warning of result.warnings) console.warn(`[preflight] PERINGATAN: ${warning}`);
    if (result.errors.length) {
      for (const error of result.errors) console.error(`[preflight] GAGAL: ${error}`);
      process.exitCode = 1;
      return;
    }
    const database = await verifyDatabaseIfRequested();
    if (database) console.log(`[preflight] database OK: ${database.migrations} migrasi, ${database.tables} tabel.`);
    console.log(`[preflight] ${result.config.appEnvironment} siap untuk UAT.`);
  } catch (error) {
    console.error(`[preflight] GAGAL: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { checkStagingEnvironment };
