// Menjalankan pengiriman notification_outbox sebagai proses terpisah dari web.
// Di staging/production proses ini dijalankan oleh scheduler atau service manager.

const path = require('node:path');
const { createDatabase } = require('../server/db.js');
const { createPostgresNotificationStore } = require('../server/postgres-notification-store.js');
const { createEmailSender } = require('../server/email-service.js');
const { createNotificationWorker } = require('../server/notification-worker.js');
const { loadEnvironmentFile } = require('../database/migrate.js');
const { readProductionConfig } = require('../server/production-config.js');
const { createTemplateService } = require('../server/template-service.js');

loadEnvironmentFile(path.join(__dirname, '..', '.env'), process.env);

async function main() {
  const config = readProductionConfig(process.env);
  if (config.email.driver === 'disabled') {
    throw new Error('EMAIL_DRIVER masih disabled; worker tidak dijalankan.');
  }
  const database = createDatabase({ connectionString: config.databaseUrl });
  const sender = createEmailSender({
    driver: config.email.driver,
    apiKey: config.email.resendApiKey,
    from: config.email.emailFrom,
    logger: console
  });
  const templates = createTemplateService({ database });
  const worker = createNotificationWorker({
    store: createPostgresNotificationStore({ database }),
    sender,
    notificationPayloadKey: process.env.NOTIFICATION_PAYLOAD_KEY || process.env.IP_HASH_SECRET,
    appBaseUrl: config.email.appBaseUrl || process.env.APP_BASE_URL,
    templates: async () => ({ email: await templates.ambil('email'), kop: await templates.ambil('kop') }),
    senderTimeoutMs: Number(process.env.NOTIFICATION_SENDER_TIMEOUT_MS || 10000)
  });
  const once = process.argv.includes('--once');
  const intervalMs = Math.max(5000, Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS || 30000) || 30000);
  let timer = null;
  let stopped = false;
  let inFlight = null;

  async function run() {
    if (stopped) return;
    if (inFlight) return inFlight;
    inFlight = worker.runOnce({ limit: Number(process.env.NOTIFICATION_WORKER_BATCH_SIZE || 20) })
      .then(result => { if (result.claimed > 0) console.log(`[notification-worker] ${result.claimed} item diproses.`); })
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  async function shutdown(signal) {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (inFlight) await inFlight.catch(() => {});
    await database.close();
    console.log(`[notification-worker] berhenti (${signal}).`);
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  await run();
  const scheduleNext = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await run().catch((error) => console.error(`[notification-worker] gagal: ${error.message}`));
      scheduleNext();
    }, intervalMs);
  };
  if (!once) scheduleNext();
  else await shutdown('once');
}

main().catch((error) => {
  console.error(`[notification-worker] tidak dapat dijalankan: ${error.message}`);
  process.exitCode = 1;
});
