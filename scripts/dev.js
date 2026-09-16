// Menjalankan aplikasi lengkap di laptop memakai PostgreSQL in-process (PGlite).
// Tidak pernah menyentuh Supabase: DATABASE_URL diisi sebelum .env dimuat, dan
// loadEnvironmentFile tidak menimpa nilai yang sudah ada.
const path = require('node:path');
const { migrate } = require('../database/migrate.js');
const { createDatabase } = require('../server/db.js');
const { seedDevelopmentData, DEV_PASSWORD } = require('./seed-dev.js');

const DEV_DATABASE_URL = 'pglite:./data/dev-db';

process.env.APP_ENV = 'development';
process.env.DATABASE_URL = DEV_DATABASE_URL;

async function main() {
  console.log('[dev] Menyiapkan database lokal di data/dev-db.');
  const database = createDatabase({ connectionString: DEV_DATABASE_URL });
  try {
    const hasil = await migrate({
      environment: { APP_ENV: 'development', DATABASE_URL: DEV_DATABASE_URL },
      database,
      envFilePath: null,
      logger: { log(pesan) { console.log(`[dev] ${pesan}`); } }
    });
    if (!hasil.applied.length) {
      console.log('[dev] Schema sudah terbaru.');
    }
    const seed = await seedDevelopmentData({ database });
    if (seed.accounts.length) {
      console.log(`[dev] Akun contoh (hanya untuk pengembangan), kata sandi "${DEV_PASSWORD}":`);
      seed.accounts.forEach((email) => console.log(`[dev]   ${email}`));
    }
  } finally {
    // PGlite hanya boleh dibuka satu proses, jadi koneksi penyiapan ditutup
    // sebelum server memakai folder yang sama.
    await database.close();
  }

  require(path.join(__dirname, '..', 'server.js'));
}

main().catch((error) => {
  console.error(`[dev] Gagal menyiapkan lingkungan pengembangan: ${error.message}`);
  process.exitCode = 1;
});
