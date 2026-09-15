const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadEnvironmentFile, migrate } = require('./migrate');

const TEST_ENVIRONMENT = Object.freeze({
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/hamasah',
  STORAGE_BUCKET: 'hamasah-private-documents',
  HAMASAH_BOOTSTRAP_KEY: 'this-is-a-safe-test-key-with-more-than-32-characters'
});

function createMockClient() {
  const state = { constructed: 0, connected: 0, ended: false, queries: [] };
  class MockClient {
    constructor() { state.constructed += 1; }
    async connect() { state.connected += 1; }
    async query(sql) {
      state.queries.push(sql);
      if (String(sql).startsWith('SELECT to_regclass')) {
        return { rows: [{ accounts_table: 'accounts' }] };
      }
      return { rows: [] };
    }
    async end() { state.ended = true; }
  }
  return { MockClient, state };
}

async function run() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-env-'));
  const envFile = path.join(temporaryDirectory, '.env');
  fs.writeFileSync(envFile, [
    'DATABASE_URL=postgresql://file-user:file-password@localhost:5432/hamasah',
    'STORAGE_BUCKET=file-bucket',
    'ALLOW_PRODUCTION_WRITE=I_UNDERSTAND',
    ''
  ].join('\n'));
  const loaded = loadEnvironmentFile(envFile, { STORAGE_BUCKET: 'process-bucket' });
  assert.equal(loaded.DATABASE_URL, 'postgresql://file-user:file-password@localhost:5432/hamasah');
  assert.equal(loaded.STORAGE_BUCKET, 'process-bucket');
  // Konfirmasi tulis production hanya berlaku jika diset di terminal, bukan dari file.
  assert.equal(loaded.ALLOW_PRODUCTION_WRITE, undefined);
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });

  // Migrasi normal di lingkungan test.
  const normal = createMockClient();
  await migrate({ environment: { ...TEST_ENVIRONMENT }, Client: normal.MockClient, envFilePath: null });
  assert.equal(normal.state.queries[0], 'BEGIN');
  assert.match(normal.state.queries[1], /CREATE TABLE accounts/i);
  assert.equal(normal.state.queries[2], 'COMMIT');
  assert.match(normal.state.queries[3], /SELECT to_regclass/);
  assert.equal(normal.state.ended, true);

  // APP_ENV kosong: berhenti sebelum client dibuat.
  const withoutAppEnv = createMockClient();
  const { APP_ENV, ...environmentWithoutAppEnv } = TEST_ENVIRONMENT;
  await assert.rejects(
    migrate({ environment: environmentWithoutAppEnv, Client: withoutAppEnv.MockClient, envFilePath: null }),
    /APP_ENV belum diisi/
  );
  assert.equal(withoutAppEnv.state.constructed, 0);
  assert.equal(withoutAppEnv.state.connected, 0);

  // Production tanpa konfirmasi: berhenti sebelum client dibuat.
  const productionBlocked = createMockClient();
  await assert.rejects(
    migrate({ environment: { ...TEST_ENVIRONMENT, APP_ENV: 'production' }, Client: productionBlocked.MockClient, envFilePath: null }),
    /ALLOW_PRODUCTION_WRITE/
  );
  assert.equal(productionBlocked.state.constructed, 0);
  assert.equal(productionBlocked.state.connected, 0);

  // Production dengan konfirmasi dari terminal: migrasi berjalan.
  const productionAllowed = createMockClient();
  await migrate({
    environment: { ...TEST_ENVIRONMENT, APP_ENV: 'production', ALLOW_PRODUCTION_WRITE: 'I_UNDERSTAND' },
    Client: productionAllowed.MockClient,
    envFilePath: null
  });
  assert.equal(productionAllowed.state.connected, 1);

  console.log('migration runner tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
