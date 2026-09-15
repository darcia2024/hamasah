const assert = require('node:assert/strict');
const { readProductionConfig } = require('./production-config.js');

assert.throws(() => readProductionConfig({}), /DATABASE_URL/);
assert.throws(() => readProductionConfig({ DATABASE_URL: 'https://example.com', HAMASAH_BOOTSTRAP_KEY: 'a'.repeat(32), STORAGE_BUCKET: 'private-documents' }), /postgresql/);
const config = readProductionConfig({
  DATABASE_URL: 'postgresql://user:password@db.example.com:5432/hamasah',
  HAMASAH_BOOTSTRAP_KEY: 'a'.repeat(32),
  STORAGE_BUCKET: 'hamasah-private-documents'
});
assert.equal(config.storageBucket, 'hamasah-private-documents');
console.log('production-config tests passed');
