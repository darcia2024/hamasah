const { DEFAULT_ENV_FILE, loadEnvironmentFile, resolveMigrationUrl } = require('./migrate');
const { DEFAULT_MIGRATIONS_DIRECTORY, listMigrations } = require('./migrations');
const { createDatabase } = require('../server/db');

// Query tabel di schema public yang belum memakai Row Level Security.
// Sejak Task 6.6, daftar ini harus kosong.
const TABLES_WITHOUT_RLS_SQL = `
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY c.relname
`;

function findMissingTables(expected, available) {
  const present = new Set(available);
  return expected.filter((table) => !present.has(table));
}

async function verifyDatabase({
  environment = { ...process.env },
  database: injectedDatabase,
  envFilePath = DEFAULT_ENV_FILE,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY
} = {}) {
  loadEnvironmentFile(envFilePath, environment);
  const migrations = listMigrations(migrationsDirectory);
  const database = injectedDatabase || createDatabase({ connectionString: resolveMigrationUrl(environment) });

  try {
    const ledgerTable = await database.query("SELECT to_regclass('public.schema_migrations') AS relasi");
    if (!ledgerTable.rows[0].relasi) {
      throw new Error('Catatan migrasi belum ada di database. Jalankan npm run migrate, atau npm run migrate -- --baseline untuk database yang sudah berisi tabel.');
    }

    const ledgerRows = await database.query('SELECT version, checksum FROM schema_migrations');
    const ledger = new Map(ledgerRows.rows.map((row) => [row.version, row.checksum]));

    const pending = migrations.filter((migration) => !ledger.has(migration.version));
    if (pending.length) {
      throw new Error(`Migrasi belum diterapkan: ${pending.map((migration) => migration.file).join(', ')}.`);
    }

    const changed = migrations.filter((migration) => ledger.get(migration.version) !== migration.checksum);
    if (changed.length) {
      throw new Error(`Isi file migrasi berbeda dari yang diterapkan di database: ${changed.map((migration) => migration.file).join(', ')}.`);
    }

    const files = new Set(migrations.map((migration) => migration.version));
    const orphans = [...ledger.keys()].filter((version) => !files.has(version));
    if (orphans.length) {
      throw new Error(`Migrasi tercatat di database tetapi filenya tidak ditemukan: ${orphans.join(', ')}.`);
    }

    const expectedTables = [...new Set(migrations.flatMap((migration) => migration.tables))].sort();
    const tableRows = await database.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [expectedTables]
    );
    const missing = findMissingTables(expectedTables, tableRows.rows.map((row) => row.table_name));
    if (missing.length) {
      throw new Error(`Tabel production belum lengkap: ${missing.join(', ')}`);
    }

    const rlsRows = await database.query(TABLES_WITHOUT_RLS_SQL);
    return {
      migrations: migrations.length,
      tables: expectedTables.length,
      tablesWithoutRls: rlsRows.rows.map((row) => row.relname)
    };
  } finally {
    if (!injectedDatabase) {
      await database.close();
    }
  }
}

if (require.main === module) {
  verifyDatabase()
    .then((result) => {
      console.log(`Verifikasi PostgreSQL selesai: ${result.migrations} migrasi diterapkan, ${result.tables} tabel aplikasi tersedia.`);
      if (result.tablesWithoutRls.length) {
        console.warn(`Peringatan: ${result.tablesWithoutRls.length} tabel belum memakai Row Level Security: ${result.tablesWithoutRls.join(', ')}.`);
      }
    })
    .catch((error) => {
      console.error(`Verifikasi database gagal: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { TABLES_WITHOUT_RLS_SQL, findMissingTables, verifyDatabase };
