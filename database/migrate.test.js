const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadEnvironmentFile, migrate } = require('./migrate');

async function run() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-env-'));
  const envFile = path.join(temporaryDirectory, '.env');
  fs.writeFileSync(envFile, 'DATABASE_URL=postgresql://file-user:file-password@localhost:5432/hamasah\nSTORAGE_BUCKET=file-bucket\n');
  const loaded = loadEnvironmentFile(envFile, { STORAGE_BUCKET: 'process-bucket' });
  assert.equal(loaded.DATABASE_URL, 'postgresql://file-user:file-password@localhost:5432/hamasah');
  assert.equal(loaded.STORAGE_BUCKET, 'process-bucket');
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });

  const queries = [];
  let ended = false;
  class MockClient {
    async connect() {}
    async query(sql) {
      queries.push(sql);
      if (String(sql).startsWith('SELECT to_regclass')) {
        return { rows: [{ accounts_table: 'accounts' }] };
      }
      return { rows: [] };
    }
    async end() {
      ended = true;
    }
  }

  await migrate({
    environment: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/hamasah',
      STORAGE_BUCKET: 'hamasah-private-documents',
      HAMASAH_BOOTSTRAP_KEY: 'this-is-a-safe-test-key-with-more-than-32-characters'
    },
    Client: MockClient
  });

  assert.equal(queries[0], 'BEGIN');
  assert.match(queries[1], /CREATE TABLE accounts/i);
  assert.equal(queries[2], 'COMMIT');
  assert.match(queries[3], /SELECT to_regclass/);
  assert.equal(ended, true);
  console.log('migration runner tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
