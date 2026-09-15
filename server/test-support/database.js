const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../db.js');

// Catatan: jangan beri nama file helper dengan pola test-*.js atau *.test.js,
// karena node --test akan menjalankannya sebagai file test.

const SCHEMA_FILES = Object.freeze(['001_initial_schema.sql', '002_account_sessions.sql']);

// Database PostgreSQL in-memory (PGlite) berisi schema aplikasi, untuk test.
// Setelah Task 6.5, schema diterapkan lewat migration runner.
async function createTestDatabase() {
  const database = createDatabase({ connectionString: 'pglite:memory' });
  for (const file of SCHEMA_FILES) {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', file), 'utf8');
    await database.exec(sql);
  }
  return database;
}

module.exports = { createTestDatabase };
