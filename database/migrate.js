const fs = require('node:fs');
const path = require('node:path');
const { assertDatabaseWriteAllowed } = require('../server/environment');
const { readProductionConfig } = require('../server/production-config');

const DEFAULT_ENV_FILE = path.join(__dirname, '..', '.env');

// Kunci yang hanya boleh berasal dari terminal, tidak pernah dibaca dari file .env.
const TERMINAL_ONLY_KEYS = new Set(['ALLOW_PRODUCTION_WRITE']);

function loadEnvironmentFile(filePath, environment) {
  if (!filePath || !fs.existsSync(filePath)) return environment;

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (TERMINAL_ONLY_KEYS.has(key)) continue;

    const value = trimmed.slice(separator + 1).trim();
    if (!environment[key]) environment[key] = value;
  }

  return environment;
}

// envFilePath: null dipakai test agar file .env di laptop tidak ikut terbaca.
async function migrate({ environment = { ...process.env }, Client, envFilePath = DEFAULT_ENV_FILE } = {}) {
  loadEnvironmentFile(envFilePath, environment);
  assertDatabaseWriteAllowed(environment);
  const config = readProductionConfig(environment);
  const PgClient = Client || require('pg').Client;
  const schema = fs.readFileSync(path.join(__dirname, '001_initial_schema.sql'), 'utf8');
  const client = new PgClient({ connectionString: config.databaseUrl });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    const { rows } = await client.query("SELECT to_regclass('public.accounts') AS accounts_table");
    if (rows[0]?.accounts_table !== 'accounts') {
      throw new Error('Verifikasi schema gagal: tabel accounts tidak ditemukan.');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrate()
    .then(() => console.log('Migrasi PostgreSQL Hamasah selesai dan tervalidasi.'))
    .catch((error) => {
      console.error(`Migrasi gagal: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { DEFAULT_ENV_FILE, loadEnvironmentFile, migrate };
