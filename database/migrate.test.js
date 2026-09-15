const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../server/db.js');
const { loadEnvironmentFile, migrate } = require('./migrate.js');

const SILENT_LOGGER = { log() {} };
const TEST_ENVIRONMENT = Object.freeze({ APP_ENV: 'test' });
const REPO_MIGRATIONS = __dirname;

function temporaryDirectory(files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-migrate-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

function copyRepoMigrations(directory, { crlf = false } = {}) {
  for (const file of ['001_initial_schema.sql', '002_account_sessions.sql']) {
    const content = fs.readFileSync(path.join(REPO_MIGRATIONS, file), 'utf8');
    fs.writeFileSync(path.join(directory, file), crlf ? content.replace(/\r?\n/g, '\r\n') : content);
  }
  return directory;
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

// Satu instance PGlite dipakai ulang: membuat instance baru memakan waktu sekitar 1,8 detik,
// sedangkan mengosongkan schema hanya sekitar 30 milidetik.
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

async function ledgerVersions(database) {
  const { rows } = await database.query('SELECT version FROM schema_migrations ORDER BY version');
  return rows.map((row) => row.version);
}

async function tableExists(database, name) {
  const { rows } = await database.query('SELECT to_regclass($1) AS relasi', [`public.${name}`]);
  return Boolean(rows[0].relasi);
}

async function applySchemaManually(database) {
  for (const file of ['001_initial_schema.sql', '002_account_sessions.sql']) {
    await database.exec(fs.readFileSync(path.join(REPO_MIGRATIONS, file), 'utf8'));
  }
}

async function testEnvironmentFile() {
  const directory = temporaryDirectory({
    '.env': [
      'DATABASE_URL=postgresql://file-user:file-password@localhost:5432/hamasah',
      'STORAGE_BUCKET=file-bucket',
      'ALLOW_PRODUCTION_WRITE=I_UNDERSTAND',
      ''
    ].join('\n')
  });
  const loaded = loadEnvironmentFile(path.join(directory, '.env'), { STORAGE_BUCKET: 'process-bucket' });
  assert.equal(loaded.DATABASE_URL, 'postgresql://file-user:file-password@localhost:5432/hamasah');
  assert.equal(loaded.STORAGE_BUCKET, 'process-bucket');
  assert.equal(loaded.ALLOW_PRODUCTION_WRITE, undefined);
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testGuardRunsBeforeDatabase() {
  const forbidden = {
    kind: 'uji',
    query() { throw new Error('database tidak boleh dipakai'); },
    exec() { throw new Error('database tidak boleh dipakai'); },
    withTransaction() { throw new Error('database tidak boleh dipakai'); },
    close() { return Promise.resolve(); }
  };
  await assert.rejects(
    migrate({ environment: {}, database: forbidden, envFilePath: null, logger: SILENT_LOGGER }),
    /APP_ENV belum diisi/
  );
  await assert.rejects(
    migrate({ environment: { APP_ENV: 'production' }, database: forbidden, envFilePath: null, logger: SILENT_LOGGER }),
    /ALLOW_PRODUCTION_WRITE/
  );
}

async function testFreshApplyAndRerun() {
  await withDatabase(async (database) => {
    const first = await runMigrate(database);
    assert.deepEqual(first.applied, ['001_initial_schema.sql', '002_account_sessions.sql']);
    assert.deepEqual(await ledgerVersions(database), ['001', '002']);
    assert.equal(await tableExists(database, 'accounts'), true);
    assert.equal(await tableExists(database, 'account_sessions'), true);

    const rls = await database.query("SELECT relrowsecurity FROM pg_class WHERE relname = 'schema_migrations'");
    assert.equal(rls.rows[0].relrowsecurity, true);

    const second = await runMigrate(database);
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, ['001_initial_schema.sql', '002_account_sessions.sql']);
  });
}

async function testLineEndingsDoNotChangeChecksum() {
  const directory = copyRepoMigrations(temporaryDirectory(), { crlf: true });
  await withDatabase(async (database) => {
    await runMigrate(database);
    const result = await runMigrate(database, { migrationsDirectory: directory });
    assert.deepEqual(result.applied, [], 'File dengan akhiran baris CRLF tidak boleh dianggap migrasi baru.');
    assert.deepEqual(result.skipped.length, 2);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testChangedFileIsRejected() {
  const directory = copyRepoMigrations(temporaryDirectory());
  await withDatabase(async (database) => {
    await runMigrate(database, { migrationsDirectory: directory });
    fs.appendFileSync(path.join(directory, '001_initial_schema.sql'), '\n-- tambahan yang tidak boleh\n');
    await assert.rejects(runMigrate(database, { migrationsDirectory: directory }), /tidak boleh diubah/);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testMissingFileForRecordIsRejected() {
  const directory = copyRepoMigrations(temporaryDirectory());
  await withDatabase(async (database) => {
    await runMigrate(database, { migrationsDirectory: directory });
    fs.rmSync(path.join(directory, '002_account_sessions.sql'));
    await assert.rejects(runMigrate(database, { migrationsDirectory: directory }), /tidak ditemukan/);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testNewMigrationIsApplied() {
  const directory = copyRepoMigrations(temporaryDirectory({
    '003_contoh_tabel.sql': 'CREATE TABLE contoh_tabel (id UUID PRIMARY KEY);\nALTER TABLE contoh_tabel ENABLE ROW LEVEL SECURITY;\n'
  }));
  await withDatabase(async (database) => {
    const result = await runMigrate(database, { migrationsDirectory: directory });
    assert.deepEqual(result.applied.length, 3);
    assert.equal(await tableExists(database, 'contoh_tabel'), true);
    assert.deepEqual(await ledgerVersions(database), ['001', '002', '003']);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testFailingMigrationRollsBack() {
  const directory = copyRepoMigrations(temporaryDirectory({
    '003_gagal.sql': 'CREATE TABLE harus_hilang (id UUID PRIMARY KEY);\nSELECT * FROM tabel_tidak_ada;\n'
  }));
  await withDatabase(async (database) => {
    await assert.rejects(runMigrate(database, { migrationsDirectory: directory }), /tabel_tidak_ada/);
    assert.equal(await tableExists(database, 'harus_hilang'), false, 'Migrasi yang gagal tidak boleh meninggalkan tabel.');
    assert.deepEqual(await ledgerVersions(database), ['001', '002']);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testBaselineForExistingDatabase() {
  await withDatabase(async (database) => {
    await applySchemaManually(database);

    // Tanpa baseline: runner berhenti dan menjelaskan langkahnya.
    await assert.rejects(runMigrate(database), /--baseline/);

    const baselined = await runMigrate(database, { baseline: true });
    assert.deepEqual(baselined.baselined, ['001_initial_schema.sql', '002_account_sessions.sql']);
    assert.deepEqual(baselined.applied, []);
    assert.deepEqual(await ledgerVersions(database), ['001', '002']);

    const afterBaseline = await runMigrate(database);
    assert.deepEqual(afterBaseline.applied, []);
  });
}

async function testBaselineLeavesNewMigrationPending() {
  const directory = copyRepoMigrations(temporaryDirectory({
    '003_contoh_tabel.sql': 'CREATE TABLE contoh_tabel (id UUID PRIMARY KEY);\n'
  }));
  await withDatabase(async (database) => {
    await applySchemaManually(database);
    const baselined = await runMigrate(database, { migrationsDirectory: directory, baseline: true });
    assert.deepEqual(baselined.baselined.length, 2);
    assert.deepEqual(baselined.pending, ['003_contoh_tabel.sql']);
    assert.equal(await tableExists(database, 'contoh_tabel'), false, 'Mode baseline tidak boleh menjalankan SQL.');

    const applied = await runMigrate(database, { migrationsDirectory: directory });
    assert.deepEqual(applied.applied, ['003_contoh_tabel.sql']);
    assert.equal(await tableExists(database, 'contoh_tabel'), true);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testBaselineRejectsPartialState() {
  const directory = copyRepoMigrations(temporaryDirectory({
    '003_dua_tabel.sql': 'CREATE TABLE tabel_satu (id UUID PRIMARY KEY);\nCREATE TABLE tabel_dua (id UUID PRIMARY KEY);\n'
  }));
  await withDatabase(async (database) => {
    await applySchemaManually(database);
    await database.exec('CREATE TABLE tabel_satu (id UUID PRIMARY KEY);');
    await assert.rejects(
      runMigrate(database, { migrationsDirectory: directory, baseline: true }),
      /003_dua_tabel\.sql/
    );
  });
  fs.rmSync(directory, { recursive: true, force: true });
}

async function testConcurrentRunsApplyOnce() {
  await withDatabase(async (database) => {
    const [pertama, kedua] = await Promise.all([runMigrate(database), runMigrate(database)]);
    assert.deepEqual(await ledgerVersions(database), ['001', '002']);
    assert.equal(pertama.applied.length + kedua.applied.length, 2, 'Setiap migrasi hanya boleh diterapkan sekali.');
  });
}

async function run() {
  await testEnvironmentFile();
  await testGuardRunsBeforeDatabase();
  await testFreshApplyAndRerun();
  await testLineEndingsDoNotChangeChecksum();
  await testChangedFileIsRejected();
  await testMissingFileForRecordIsRejected();
  await testNewMigrationIsApplied();
  await testFailingMigrationRollsBack();
  await testBaselineForExistingDatabase();
  await testBaselineLeavesNewMigrationPending();
  await testBaselineRejectsPartialState();
  await testConcurrentRunsApplyOnce();
  console.log('migration runner tests passed');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeSharedDatabase);
