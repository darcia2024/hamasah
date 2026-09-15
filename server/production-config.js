const { readAppEnvironment } = require('./environment.js');

// PGlite hanya untuk database lokal saat development dan test.
const PGLITE_ENVIRONMENTS = Object.freeze(['development', 'test']);

// Memeriksa satu URL database. Nilai URL tidak pernah ikut di pesan error karena bisa berisi password.
function assertDatabaseUrl(value, appEnvironment, key = 'DATABASE_URL') {
  const url = String(value || '').trim();
  if (!url) {
    throw new Error(`${key} harus diisi untuk menjalankan ${appEnvironment}.`);
  }
  if (url.startsWith('pglite:')) {
    if (!PGLITE_ENVIRONMENTS.includes(appEnvironment)) {
      throw new Error(`${key} tidak boleh memakai pglite di lingkungan ${appEnvironment}.`);
    }
    return url;
  }
  let protocol = '';
  try {
    protocol = new URL(url).protocol;
  } catch (error) {
    throw new Error(`${key} harus memakai protokol postgresql.`);
  }
  if (!['postgres:', 'postgresql:'].includes(protocol)) {
    throw new Error(`${key} harus memakai protokol postgresql.`);
  }
  return url;
}

function requiredEnvironment(environment, key, appEnvironment) {
  const value = String(environment[key] || '').trim();
  if (!value) {
    throw new Error(`${key} harus diisi untuk menjalankan ${appEnvironment}.`);
  }
  return value;
}

function optionalEnvironment(environment, key) {
  return String(environment[key] || '').trim();
}

// DATABASE_URL selalu wajib karena dipakai skrip database di semua lingkungan.
// STORAGE_BUCKET hanya wajib di production.
// HAMASAH_BOOTSTRAP_KEY tidak pernah wajib: kunci ini dihapus setelah admin pertama dibuat,
// tetapi jika diisi panjangnya tetap diperiksa.
function readProductionConfig(environment) {
  const values = environment || process.env;
  const appEnvironment = readAppEnvironment(values);
  const isProduction = appEnvironment === 'production';

  const databaseUrl = assertDatabaseUrl(values.DATABASE_URL, appEnvironment, 'DATABASE_URL');
  const storageBucket = isProduction
    ? requiredEnvironment(values, 'STORAGE_BUCKET', appEnvironment)
    : optionalEnvironment(values, 'STORAGE_BUCKET');
  const bootstrapKey = optionalEnvironment(values, 'HAMASAH_BOOTSTRAP_KEY');

  if (bootstrapKey && bootstrapKey.length < 32) {
    throw new Error('HAMASAH_BOOTSTRAP_KEY harus terdiri dari minimal 32 karakter.');
  }

  return Object.freeze({ appEnvironment, databaseUrl, bootstrapKey, storageBucket });
}

module.exports = { PGLITE_ENVIRONMENTS, assertDatabaseUrl, readProductionConfig };
