const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../server/db.js');
const { migrate } = require('./migrate.js');
const { listMigrations } = require('./migrations.js');
const { findMissingTables, verifyDatabase } = require('./verify.js');

const SILENT_LOGGER = { log() {} };
const TEST_ENVIRONMENT = Object.freeze({ APP_ENV: 'test' });
const REPO_MIGRATIONS = __dirname;

function temporaryMigrations(extraFiles = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-verify-'));
  for (const file of fs.readdirSync(REPO_MIGRATIONS).filter((name) => /^\d{3}_.+\.sql$/.test(name))) {
    fs.copyFileSync(path.join(REPO_MIGRATIONS, file), path.join(directory, file));
  }
  for (const [name, content] of Object.entries(extraFiles)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

// Satu instance PGlite dipakai ulang, schema dikosongkan sebelum tiap skenario.
let sharedDatabase;

async function withDatabase(work) {
  if (!sharedDatabase) {
    sharedDatabase = createDatabase({ connectionString: 'pglite:memory' });
  }
  await sharedDatabase.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await work(sharedDatabase);
}

async function closeSharedDatabase() {
  if (sharedDatabase) {
    await sharedDatabase.close();
    sharedDatabase = undefined;
  }
}

function verify(database, options = {}) {
  return verifyDatabase({
    environment: { ...TEST_ENVIRONMENT },
    database,
    envFilePath: null,
    migrationsDirectory: REPO_MIGRATIONS,
    ...options
  });
}

function runMigrate(database, options = {}) {
  return migrate({
    environment: { ...TEST_ENVIRONMENT },
    database,
    envFilePath: null,
    migrationsDirectory: REPO_MIGRATIONS,
    logger: SILENT_LOGGER,
    ...options
  });
}

function testPureHelper() {
  assert.deepEqual(findMissingTables(['accounts', 'articles'], ['accounts']), ['articles']);
  assert.deepEqual(findMissingTables(['accounts'], ['accounts', 'lain']), []);
}

async function testHealthyDatabase() {
  await withDatabase(async (database) => {
    await runMigrate(database);
    // Jumlah dihitung dari daftar migrasi supaya test tidak perlu diubah tiap ada migrasi baru.
    const migrations = listMigrations(REPO_MIGRATIONS);
    const expectedTables = new Set(migrations.flatMap((migration) => migration.tables));
    const result = await verify(database);
    assert.equal(result.migrations, migrations.length);
    assert.equal(result.tables, expectedTables.size);
  });
}

async function testTableWithoutRowLevelSecurity() {
  await withDatabase(async (database) => {
    await runMigrate(database);
    await database.exec('CREATE TABLE tabel_tanpa_rls (id UUID PRIMARY KEY);');
    await assert.rejects(verify(database), /tabel_tanpa_rls/);
  });
}

async function testLedgerMissing() {
  await withDatabase(async (database) => {
    await assert.rejects(verify(database), /Catatan migrasi belum ada/);
  });
}

async function testPendingMigration() {
  const directory = temporaryMigrations({ '900_belum_diterapkan.sql': 'CREATE TABLE belum (id UUID PRIMARY KEY);\n' });
  await withDatabase(async (database) => {
    await runMigrate(database);
    await assert.rejects(verify(database, { migrationsDirectory: directory }), /belum diterapkan: 900_belum_diterapkan\.sql/);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testChangedChecksum() {
  const directory = temporaryMigrations();
  await withDatabase(async (database) => {
    await runMigrate(database, { migrationsDirectory: directory });
    fs.appendFileSync(path.join(directory, '002_account_sessions.sql'), '\n-- diubah setelah diterapkan\n');
    await assert.rejects(verify(database, { migrationsDirectory: directory }), /berbeda dari yang diterapkan/);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testMissingTable() {
  await withDatabase(async (database) => {
    await runMigrate(database);
    await database.exec('DROP TABLE inventory_items CASCADE;');
    await assert.rejects(verify(database), /belum lengkap: inventory_items/);
  });
}

async function run() {
  testPureHelper();
  await testHealthyDatabase();
  await testTableWithoutRowLevelSecurity();
  await testLedgerMissing();
  await testPendingMigration();
  await testChangedChecksum();
  await testMissingTable();
  console.log('database verification tests passed');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeSharedDatabase);
