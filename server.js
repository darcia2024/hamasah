const path = require('node:path');
const { createHamasahApp } = require('./server/app.js');
const { createShutdownHandler } = require('./server/shutdown.js');
const { loadEnvironmentFile } = require('./database/migrate.js');

loadEnvironmentFile(path.join(__dirname, '.env'), process.env);
const port = Number(process.env.PORT || 4273);
const app = createHamasahApp({
  rootDirectory: path.resolve(__dirname),
  databaseUrl: process.env.DATABASE_URL || ''
});

const server = app.createServer();
server.listen(port, function onListening() {
  console.log(`Hamasah berjalan di http://127.0.0.1:${port}/website/`);
});

const shutdown = createShutdownHandler({ server, app });
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error(`[server] Promise gagal tanpa penanganan: ${reason instanceof Error ? reason.message : String(reason)}`);
});
