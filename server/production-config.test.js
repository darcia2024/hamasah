const assert = require('node:assert/strict');
const { assertDatabaseUrl, readProductionConfig } = require('./production-config.js');

const DATABASE_URL = 'postgresql://user:password@db.example.com:5432/hamasah';
const IP_HASH_SECRET = 'b'.repeat(32);
// Staging dan production wajib memakai penyimpanan berkas sungguhan.
const STORAGE = { SUPABASE_URL: 'https://contoh.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'kunci-service-role-palsu' };

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
assert.equal(config.email.driver, 'console');

// Di luar production, bucket dan bootstrap key tidak wajib.
const staging = readProductionConfig({ APP_ENV: 'staging', DATABASE_URL, IP_HASH_SECRET, ...STORAGE });
assert.equal(staging.appEnvironment, 'staging');
assert.equal(staging.storageBucket, '');
assert.equal(staging.bootstrapKey, '');
assert.equal(staging.email.driver, 'disabled');

// Production mewajibkan STORAGE_BUCKET.
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL, IP_HASH_SECRET, ...STORAGE }), /STORAGE_BUCKET/);

// Bootstrap key dihapus setelah admin pertama dibuat, jadi production tetap jalan tanpanya.
const production = readProductionConfig({ APP_ENV: 'production', DATABASE_URL, IP_HASH_SECRET, ...STORAGE, STORAGE_BUCKET: 'hamasah-private-documents' });
assert.equal(production.appEnvironment, 'production');
assert.equal(production.bootstrapKey, '');

const resend = readProductionConfig({
  APP_ENV: 'production', DATABASE_URL, IP_HASH_SECRET, ...STORAGE, STORAGE_BUCKET: 'bucket',
  EMAIL_DRIVER: 'resend', RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'Hamasah <noreply@example.test>', APP_BASE_URL: 'https://hamasahinternational.com/'
});
assert.equal(resend.email.driver, 'resend');
assert.equal(resend.email.appBaseUrl, 'https://hamasahinternational.com');
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL, IP_HASH_SECRET, ...STORAGE, STORAGE_BUCKET: 'bucket', EMAIL_DRIVER: 'console' }), /EMAIL_DRIVER 'console'/);
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL, IP_HASH_SECRET, ...STORAGE, STORAGE_BUCKET: 'bucket', EMAIL_DRIVER: 'resend', RESEND_API_KEY: 'x', EMAIL_FROM: 'a@b.test' }), /APP_BASE_URL/);

// Jika bootstrap key diisi, panjangnya tetap diperiksa.
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL, IP_HASH_SECRET, ...STORAGE, STORAGE_BUCKET: 'bucket', HAMASAH_BOOTSTRAP_KEY: 'pendek' }), /32 karakter/);
assert.throws(() => readProductionConfig({ APP_ENV: 'staging', DATABASE_URL, IP_HASH_SECRET, ...STORAGE, HAMASAH_BOOTSTRAP_KEY: 'pendek' }), /32 karakter/);

// IP_HASH_SECRET wajib di staging dan production, dan panjangnya diperiksa.
assert.throws(() => readProductionConfig({ APP_ENV: 'staging', DATABASE_URL, ...STORAGE }), /IP_HASH_SECRET/);
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL, ...STORAGE, STORAGE_BUCKET: 'bucket' }), /IP_HASH_SECRET/);
assert.throws(() => readProductionConfig({ APP_ENV: 'staging', DATABASE_URL, ...STORAGE, IP_HASH_SECRET: 'pendek' }), /IP_HASH_SECRET harus terdiri dari minimal 32 karakter/);
// Di pengembangan tidak wajib, karena datanya memang fiktif.
assert.equal(readProductionConfig({ DATABASE_URL }).ipHashSecret, '');
assert.equal(staging.ipHashSecret, IP_HASH_SECRET);

// PGlite hanya boleh dipakai di development dan test.
assert.equal(readProductionConfig({ APP_ENV: 'development', DATABASE_URL: 'pglite:./data/dev-db' }).databaseUrl, 'pglite:./data/dev-db');
assert.equal(assertDatabaseUrl('pglite:memory', 'test'), 'pglite:memory');
assert.throws(() => assertDatabaseUrl('pglite:memory', 'staging'), /pglite/);
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL: 'pglite:memory', IP_HASH_SECRET, ...STORAGE, STORAGE_BUCKET: 'bucket' }), /pglite/);

// Penyimpanan berkas: di pengembangan memakai disk, di staging dan production wajib
// memakai object storage sungguhan, karena berkas di disk container ikut hilang
// setiap kali container diganti.
assert.equal(readProductionConfig({ DATABASE_URL }).storageDriver, 'local');
assert.equal(staging.storageDriver, 'supabase');
assert.equal(staging.supabaseServiceRoleKey, STORAGE.SUPABASE_SERVICE_ROLE_KEY);
assert.throws(() => readProductionConfig({ APP_ENV: 'staging', DATABASE_URL, IP_HASH_SECRET, STORAGE_DRIVER: 'local' }), /tidak boleh dipakai di lingkungan staging/);
assert.throws(() => readProductionConfig({ APP_ENV: 'production', DATABASE_URL, IP_HASH_SECRET, STORAGE_BUCKET: 'bucket', STORAGE_DRIVER: 'local' }), /tidak boleh dipakai di lingkungan production/);
assert.throws(() => readProductionConfig({ DATABASE_URL, STORAGE_DRIVER: 'ftp' }), /STORAGE_DRIVER harus/);
// Driver supabase tanpa alamat dan kunci ditolak sejak awal, bukan saat unggahan pertama.
assert.throws(() => readProductionConfig({ APP_ENV: 'staging', DATABASE_URL, IP_HASH_SECRET }), /SUPABASE_URL/);
assert.throws(() => readProductionConfig({ APP_ENV: 'staging', DATABASE_URL, IP_HASH_SECRET, SUPABASE_URL: STORAGE.SUPABASE_URL }), /SUPABASE_SERVICE_ROLE_KEY/);

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
