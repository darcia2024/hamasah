const path = require('node:path');
const { createHamasahApp } = require('./server/app.js');
const { loadEnvironmentFile } = require('./database/migrate.js');

loadEnvironmentFile(path.join(__dirname, '.env'), process.env);
const port = Number(process.env.PORT || 4273);
const app = createHamasahApp({
  rootDirectory: path.resolve(__dirname),
  databaseUrl: process.env.DATABASE_URL || ''
});

app.createServer().listen(port, function onListening() {
  console.log(`Hamasah berjalan di http://127.0.0.1:${port}/website/`);
});
