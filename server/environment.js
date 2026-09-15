const APP_ENVIRONMENTS = Object.freeze(['development', 'test', 'staging', 'production']);

// Nilai konfirmasi yang harus diketik manusia di terminal sebelum skrip menulis ke production.
const PRODUCTION_WRITE_CONFIRMATION = 'I_UNDERSTAND';

function readAppEnvironment(environment) {
  const values = environment || process.env;
  const value = String(values.APP_ENV || '').trim().toLowerCase();
  if (!value) {
    return 'development';
  }
  if (!APP_ENVIRONMENTS.includes(value)) {
    throw new Error(`APP_ENV "${value}" tidak dikenal. Gunakan salah satu: ${APP_ENVIRONMENTS.join(', ')}.`);
  }
  return value;
}

// Dipanggil di awal setiap skrip yang menulis ke database, sebelum koneksi dibuka.
// APP_ENV kosong ditolak: tanpa label lingkungan, skrip tidak bisa membedakan
// database lokal dari production.
function assertDatabaseWriteAllowed(environment) {
  const values = environment || process.env;
  if (!String(values.APP_ENV || '').trim()) {
    throw new Error('APP_ENV belum diisi. Tentukan lingkungan (development, test, staging, atau production) sebelum menjalankan skrip yang menulis ke database.');
  }

  const appEnvironment = readAppEnvironment(values);
  if (appEnvironment === 'production' && values.ALLOW_PRODUCTION_WRITE !== PRODUCTION_WRITE_CONFIRMATION) {
    throw new Error('Skrip ini akan menulis ke database production dan dihentikan. Buat backup terlebih dahulu, lalu jalankan ulang dengan ALLOW_PRODUCTION_WRITE=I_UNDERSTAND yang diset hanya di terminal ini.');
  }
  return appEnvironment;
}

module.exports = {
  APP_ENVIRONMENTS,
  PRODUCTION_WRITE_CONFIRMATION,
  assertDatabaseWriteAllowed,
  readAppEnvironment
};
