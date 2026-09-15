const assert = require('node:assert/strict');
const { assertDatabaseUrl, readProductionConfig } = require('./production-config.js');

const DATABASE_URL = 'postgresql://user:password@db.example.com:5432/hamasah';

// DATABASE_URL selalu wajib, di lingkungan mana pun.
assert.throws(() => readProductionConfig({}), /DATABASE_URL/);
assert.throws(() => readProductionConfig({ APP_ENV: 'development' }), /DATABASE_URL/);
assert.throws(() => readProductionConfig({ DATABASE_URL: 'https://example.com', HAMASAH_BOOTSTRAP_KEY: 'a'.repeat(32), STORAGE_BUCKET: 'private-documents' }), /postgresql/);
assert.throws(() => readProductionConfig({ APP_ENV: 'prod', DATABASE_URL }), /tidak dikenal/);

// Konfigurasi lengkap tetap terbaca seperti sebelumnya.
const config = readProductionConfig({
  DATABASE_URL,
  HAMASAH_BOOTSTRAP_KEY: 'a'.repeat(32),
  STORAGE_BUCKET: 'hamasah-private-documents'
});
assert.equal(config.storageBucket, 'hamasah-private-documents');
assert.equal(config.appEnvironment, 'development');

// Di luar production, bucket dan bootstrap key tidak wajib.
const staging = readProductionConfig({ APP_ENV: 'staging', DATABASE_URL });
assert.equal(staging.appEnvironment, 'staging');
assert.equal(staging.storageBucket, '');
assert.equal(staging.bootstrapKey, '');

// Production mewajibkan STORAGE_BUCKET.
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL }), /STORAGE_BUCKET/);

// Bootstrap key dihapus setelah admin pertama dibuat, jadi production tetap jalan tanpanya.
const production = readProductionConfig({ APP_ENV: 'production', DATABASE_URL, STORAGE_BUCKET: 'hamasah-private-documents' });
assert.equal(production.appEnvironment, 'production');
assert.equal(production.bootstrapKey, '');

// Jika bootstrap key diisi, panjangnya tetap diperiksa.
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL, STORAGE_BUCKET: 'bucket', HAMASAH_BOOTSTRAP_KEY: 'pendek' }), /32 karakter/);
assert.throws(() => readProductionConfig({ APP_ENV: 'staging', DATABASE_URL, HAMASAH_BOOTSTRAP_KEY: 'pendek' }), /32 karakter/);

// PGlite hanya boleh dipakai di development dan test.
assert.equal(readProductionConfig({ APP_ENV: 'development', DATABASE_URL: 'pglite:./data/dev-db' }).databaseUrl, 'pglite:./data/dev-db');
assert.equal(assertDatabaseUrl('pglite:memory', 'test'), 'pglite:memory');
assert.throws(() => assertDatabaseUrl('pglite:memory', 'staging'), /pglite/);
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL: 'pglite:memory', STORAGE_BUCKET: 'bucket' }), /pglite/);

// URL yang tidak bisa dibaca ditolak tanpa menampilkan isinya.
let urlError = '';
try {
  assertDatabaseUrl('bukan-url-rahasia', 'staging', 'DATABASE_MIGRATION_URL');
} catch (error) {
  urlError = error.message;
}
assert.match(urlError, /DATABASE_MIGRATION_URL harus memakai protokol postgresql/);
assert.equal(urlError.includes('bukan-url-rahasia'), false);

console.log('production-config tests passed');
