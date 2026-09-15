const { readAppEnvironment } = require('./environment.js');

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

  const databaseUrl = requiredEnvironment(values, 'DATABASE_URL', appEnvironment);
  const storageBucket = isProduction
    ? requiredEnvironment(values, 'STORAGE_BUCKET', appEnvironment)
    : optionalEnvironment(values, 'STORAGE_BUCKET');
  const bootstrapKey = optionalEnvironment(values, 'HAMASAH_BOOTSTRAP_KEY');
  const url = new URL(databaseUrl);

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL harus memakai protokol postgresql.');
  }
  if (bootstrapKey && bootstrapKey.length < 32) {
    throw new Error('HAMASAH_BOOTSTRAP_KEY harus terdiri dari minimal 32 karakter.');
  }

  return Object.freeze({ appEnvironment, databaseUrl, bootstrapKey, storageBucket });
}

module.exports = { readProductionConfig };
