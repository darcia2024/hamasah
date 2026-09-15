const assert = require('node:assert/strict');
const { REQUIRED_TABLES, assertRequiredTables, verifyDatabase } = require('./verify');

async function run() {
  assert.equal(assertRequiredTables(REQUIRED_TABLES), REQUIRED_TABLES.length);
  assert.throws(() => assertRequiredTables(['accounts']), /registrations/);

  let ended = false;
  class MockClient {
    async connect() {}
    async query(sql, parameters) {
      assert.match(sql, /information_schema\.tables/);
      assert.deepEqual(parameters, [REQUIRED_TABLES]);
      return { rows: REQUIRED_TABLES.map((table_name) => ({ table_name })) };
    }
    async end() { ended = true; }
  }
  const count = await verifyDatabase({
    environment: {
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/hamasah',
      STORAGE_BUCKET: 'hamasah-private-documents',
      HAMASAH_BOOTSTRAP_KEY: 'this-is-a-safe-test-key-with-more-than-32-characters'
    },
    Client: MockClient,
    envFilePath: null
  });
  assert.equal(count, REQUIRED_TABLES.length);
  assert.equal(ended, true);
  console.log('database verification tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
