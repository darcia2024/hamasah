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
  const storagePublicBucket = optionalEnvironment(values, 'STORAGE_PUBLIC_BUCKET');

  // Driver penyimpanan berkas. 'local' menyimpan ke disk dan hanya untuk
  // pengembangan: berkasnya ikut hilang setiap kali container diganti.
  const butuhStorageSungguhan = ['staging', 'production'].includes(appEnvironment);
  const storageDriver = optionalEnvironment(values, 'STORAGE_DRIVER') || (butuhStorageSungguhan ? 'supabase' : 'local');
  if (!['local', 'supabase'].includes(storageDriver)) {
    throw new Error("STORAGE_DRIVER harus 'local' atau 'supabase'.");
  }
  if (storageDriver === 'local' && butuhStorageSungguhan) {
    throw new Error(`STORAGE_DRIVER 'local' tidak boleh dipakai di lingkungan ${appEnvironment}.`);
  }
  const supabaseUrl = storageDriver === 'supabase' ? requiredEnvironment(values, 'SUPABASE_URL', appEnvironment) : '';
  // Key ini melewati seluruh aturan Row Level Security, jadi hanya boleh ada di
  // environment server dan tidak pernah dikirim ke browser.
  const supabaseServiceRoleKey = storageDriver === 'supabase'
    ? requiredEnvironment(values, 'SUPABASE_SERVICE_ROLE_KEY', appEnvironment)
    : '';
  const bootstrapKey = optionalEnvironment(values, 'HAMASAH_BOOTSTRAP_KEY');
  // Kunci HMAC untuk alamat IP di catatan audit. Wajib di luar pengembangan, karena
  // tanpa kunci, daftar alamat IP yang mungkin cukup pendek untuk dicoba satu per satu.
  const ipHashSecret = ['staging', 'production'].includes(appEnvironment)
    ? requiredEnvironment(values, 'IP_HASH_SECRET', appEnvironment)
    : optionalEnvironment(values, 'IP_HASH_SECRET');
  if (ipHashSecret && ipHashSecret.length < 32) {
    throw new Error('IP_HASH_SECRET harus terdiri dari minimal 32 karakter.');
  }

  if (bootstrapKey && bootstrapKey.length < 32) {
    throw new Error('HAMASAH_BOOTSTRAP_KEY harus terdiri dari minimal 32 karakter.');
  }

  return Object.freeze({
    appEnvironment,
    databaseUrl,
    bootstrapKey,
    ipHashSecret,
    storageBucket,
    storagePublicBucket,
    storageDriver,
    supabaseUrl,
    supabaseServiceRoleKey
  });
}

module.exports = { PGLITE_ENVIRONMENTS, assertDatabaseUrl, readProductionConfig };
