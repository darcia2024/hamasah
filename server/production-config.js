function requiredEnvironment(environment, key) {
  const value = String(environment[key] || '').trim();
  if (!value) {
    throw new Error(`${key} harus diisi untuk menjalankan production.`);
  }
  return value;
}

function readProductionConfig(environment) {
  const values = environment || process.env;
  const databaseUrl = requiredEnvironment(values, 'DATABASE_URL');
  const bootstrapKey = requiredEnvironment(values, 'HAMASAH_BOOTSTRAP_KEY');
  const storageBucket = requiredEnvironment(values, 'STORAGE_BUCKET');
  const url = new URL(databaseUrl);

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL harus memakai protokol postgresql.');
  }
  if (bootstrapKey.length < 32) {
    throw new Error('HAMASAH_BOOTSTRAP_KEY harus terdiri dari minimal 32 karakter.');
  }

  return Object.freeze({ databaseUrl, bootstrapKey, storageBucket });
}

module.exports = { readProductionConfig };
