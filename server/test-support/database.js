const { migrate } = require('../../database/migrate.js');
const { createDatabase } = require('../db.js');

// Catatan: jangan beri nama file helper dengan pola test-*.js atau *.test.js,
// karena node --test akan menjalankannya sebagai file test.

const SILENT_LOGGER = { log() {} };

// Database PostgreSQL in-memory (PGlite) berisi schema aplikasi, untuk test.
// Schema diterapkan lewat migration runner yang sama dengan production.
async function createTestDatabase() {
  const database = createDatabase({ connectionString: 'pglite:memory' });
  await migrate({
    environment: { APP_ENV: 'test' },
    database,
    envFilePath: null,
    logger: SILENT_LOGGER
  });
  return database;
}

module.exports = { createTestDatabase };
