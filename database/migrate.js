const fs = require('node:fs');
const path = require('node:path');
const { assertDatabaseWriteAllowed, readAppEnvironment } = require('../server/environment');
const { assertDatabaseUrl, readProductionConfig } = require('../server/production-config');
const { createDatabase } = require('../server/db');
const { DEFAULT_MIGRATIONS_DIRECTORY, listMigrations } = require('./migrations');

const DEFAULT_ENV_FILE = path.join(__dirname, '..', '.env');

// Kunci yang hanya boleh berasal dari terminal, tidak pernah dibaca dari file .env.
const TERMINAL_ONLY_KEYS = new Set(['ALLOW_PRODUCTION_WRITE']);

// Angka tetap untuk pg_advisory_xact_lock, supaya dua proses migrasi tidak berjalan bersamaan.
const MIGRATION_LOCK_KEY = 427315;

const LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
`;

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

// Migrasi sebaiknya lewat koneksi session (port 5432) atau koneksi langsung,
// bukan pooler mode transaksi. Karena itu DATABASE_MIGRATION_URL didahulukan.
function resolveMigrationUrl(environment) {
  const appEnvironment = readAppEnvironment(environment);
  const migrationUrl = String(environment.DATABASE_MIGRATION_URL || '').trim();
  if (migrationUrl) {
    return assertDatabaseUrl(migrationUrl, appEnvironment, 'DATABASE_MIGRATION_URL');
  }
  return readProductionConfig(environment).databaseUrl;
}

async function tableExists(database, name) {
  const { rows } = await database.query('SELECT to_regclass($1) AS relasi', [`public.${name}`]);
  return Boolean(rows[0].relasi);
}

async function readLedger(database) {
  const { rows } = await database.query('SELECT version, name, checksum FROM schema_migrations');
  return new Map(rows.map((row) => [row.version, { name: row.name, checksum: row.checksum }]));
}

async function countExistingTables(database, tables) {
  let found = 0;
  for (const table of tables) {
    if (await tableExists(database, table)) found += 1;
  }
  return found;
}

// Mengembalikan true jika migrasi benar-benar dijalankan oleh proses ini.
async function applyMigration(database, migration) {
  return database.withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    const { rows } = await tx.query('SELECT version FROM schema_migrations WHERE version = $1', [migration.version]);
    if (rows.length) {
      // Proses lain sudah menerapkan migrasi ini sambil menunggu kunci.
      return false;
    }
    await tx.exec(migration.sql);
    await tx.query(
      'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
      [migration.version, migration.name, migration.checksum]
    );
    return true;
  });
}

async function recordMigration(database, migration) {
  await database.query(
    'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING',
    [migration.version, migration.name, migration.checksum]
  );
}

function assertLedgerMatchesFiles(ledger, migrations) {
  for (const migration of migrations) {
    const record = ledger.get(migration.version);
    if (record && record.checksum !== migration.checksum) {
      throw new Error(`File migrasi yang sudah diterapkan tidak boleh diubah: ${migration.file}. Buat file migrasi baru.`);
    }
  }
  const files = new Set(migrations.map((migration) => migration.version));
  for (const version of ledger.keys()) {
    if (!files.has(version)) {
      throw new Error(`Migrasi ${version} tercatat di database tetapi filenya tidak ditemukan. Kembalikan file tersebut sebelum melanjutkan.`);
    }
  }
}

async function prepareLedger(database, migrations, { baseline }) {
  if (await tableExists(database, 'schema_migrations')) {
    return;
  }

  const appTables = [...new Set(migrations.flatMap((migration) => migration.tables))];
  const existing = await countExistingTables(database, appTables);
  if (existing > 0 && !baseline) {
    throw new Error('Database sudah berisi tabel aplikasi tetapi belum punya catatan migrasi. Periksa isinya dengan npm run verify:database, lalu jalankan npm run migrate -- --baseline.');
  }
  await database.exec(LEDGER_SQL);
}

async function baselineDecision(database, migration) {
  if (migration.tables.length === 0) {
    return 'pending';
  }
  const found = await countExistingTables(database, migration.tables);
  if (found === 0) return 'pending';
  if (found === migration.tables.length) return 'record';
  throw new Error(`Kondisi database tidak jelas untuk ${migration.file}: sebagian tabelnya sudah ada, sebagian belum. Periksa database secara manual sebelum melanjutkan.`);
}

async function migrate({
  environment = { ...process.env },
  database: injectedDatabase,
  envFilePath = DEFAULT_ENV_FILE,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
  baseline = false,
  logger = console
} = {}) {
  loadEnvironmentFile(envFilePath, environment);
  assertDatabaseWriteAllowed(environment);

  const migrations = listMigrations(migrationsDirectory);
  const database = injectedDatabase || createDatabase({ connectionString: resolveMigrationUrl(environment) });
  const result = { applied: [], baselined: [], pending: [], skipped: [] };

  try {
    await prepareLedger(database, migrations, { baseline });
    const ledger = await readLedger(database);
    assertLedgerMatchesFiles(ledger, migrations);

    for (const migration of migrations) {
      if (ledger.has(migration.version)) {
        result.skipped.push(migration.file);
        continue;
      }

      if (baseline) {
        const decision = await baselineDecision(database, migration);
        if (decision === 'record') {
          await recordMigration(database, migration);
          result.baselined.push(migration.file);
          logger.log(`Dicatat tanpa dijalankan: ${migration.file}`);
        } else {
          result.pending.push(migration.file);
        }
        continue;
      }

      if (await applyMigration(database, migration)) {
        result.applied.push(migration.file);
        logger.log(`Menerapkan: ${migration.file}`);
      } else {
        result.skipped.push(migration.file);
      }
    }

    return result;
  } finally {
    if (!injectedDatabase) {
      await database.close();
    }
  }
}

if (require.main === module) {
  const baseline = process.argv.includes('--baseline');
  migrate({ baseline })
    .then((result) => {
      if (result.baselined.length) {
        console.log(`Baseline selesai: ${result.baselined.length} migrasi dicatat tanpa dijalankan.`);
      }
      if (result.applied.length) {
        console.log(`Migrasi selesai: ${result.applied.length} file diterapkan.`);
      }
      if (!result.baselined.length && !result.applied.length) {
        console.log('Tidak ada migrasi baru.');
      }
      if (result.pending.length) {
        console.log(`Masih ada ${result.pending.length} migrasi yang belum diterapkan. Jalankan npm run migrate.`);
      }
    })
    .catch((error) => {
      console.error(`Migrasi gagal: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { DEFAULT_ENV_FILE, LEDGER_SQL, loadEnvironmentFile, migrate, resolveMigrationUrl };
