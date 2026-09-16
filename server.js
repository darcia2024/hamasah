const path = require('node:path');
const { createHamasahApp } = require('./server/app.js');
const { createShutdownHandler } = require('./server/shutdown.js');
const { loadEnvironmentFile } = require('./database/migrate.js');
const { readProductionConfig } = require('./server/production-config.js');

loadEnvironmentFile(path.join(__dirname, '.env'), process.env);

// Konfigurasi diperiksa sebelum server menyala. Isi DATABASE_URL tidak pernah dicetak
// karena berisi password. Pemeriksaan ini juga menolak database sementara (pglite) di
// staging dan production, karena datanya hilang begitu proses berhenti.
let config;
try {
  config = readProductionConfig(process.env);
} catch (error) {
  console.error(`[server] Konfigurasi belum siap: ${error.message}`);
  process.exit(1);
}

const port = Number(process.env.PORT || 4273);
const app = createHamasahApp({
  rootDirectory: path.resolve(__dirname),
  databaseUrl: config.databaseUrl,
  appEnvironment: config.appEnvironment,
  ipHashSecret: config.ipHashSecret,
  storageDriver: config.storageDriver,
  storageBucket: config.storageBucket,
  storagePublicBucket: config.storagePublicBucket,
  supabaseUrl: config.supabaseUrl,
  supabaseServiceRoleKey: config.supabaseServiceRoleKey
});

const server = app.createServer();
server.listen(port, function onListening() {
  console.log(`Hamasah (${config.appEnvironment}) berjalan di http://127.0.0.1:${port}/website/`);
});

const shutdown = createShutdownHandler({ server, app });
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error(`[server] Promise gagal tanpa penanganan: ${reason instanceof Error ? reason.message : String(reason)}`);
});
