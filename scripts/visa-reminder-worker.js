'use strict';
// Pengingat visa dan paspor (Task R8.2). Dijalankan scheduler (cron/service manager) sekali
// sehari dengan --once, bukan daemon di proses web:
//
//   npm run worker:visa-reminders
//
// Memindai dokumen yang kedaluwarsa dalam VISA_REMINDER_DAYS hari (default 30), lalu
// mengirim satu ringkasan ke setiap admin aktif. Pengingat yang sudah terkirim dicatat di
// visa_reminder_log sehingga tidak terkirim ulang setelah restart. Tanpa pengirim email
// terkonfigurasi, proses keluar dengan kode gagal dan tidak menandai apa pun terkirim.
const path = require('node:path');
const { createDatabase } = require('../server/db.js');
const { createEmailSender } = require('../server/email-service.js');
const { createNotificationService } = require('../server/notification-service.js');
const { createPostgresNotificationStore } = require('../server/postgres-notification-store.js');
const { createPostgresOperationsStore } = require('../server/postgres-operations-store.js');
const { createPostgresVisaReminderStore } = require('../server/postgres-visa-reminder-store.js');
const { createOperationsService } = require('../server/operations-service.js');
const { createVisaReminderWorker } = require('../server/visa-reminder-worker.js');
const { loadEnvironmentFile } = require('../database/migrate.js');
const { readProductionConfig } = require('../server/production-config.js');

// Aktor sistem: visaReminders hanya terbuka untuk peran keuangan/admin dan hanya membaca.
const SYSTEM_ACTOR = Object.freeze({ id: 'system:visa-reminder-worker', role: 'admin' });

// notify untuk worker: satu ringkasan per admin aktif. Berhasil hanya bila semua terkirim.
function createAdminDigestNotifier({ database, notificationService, appBaseUrl }) {
  return async (items) => {
    const { rows } = await database.query("SELECT email, name FROM accounts WHERE role = 'admin' AND active = TRUE ORDER BY email");
    if (rows.length === 0) return { ok: false, error: 'Tidak ada akun admin aktif untuk menerima pengingat.' };
    const overdue = items.filter((item) => item.overdue).length;
    const operationsUrl = `${appBaseUrl}/website/operations.html`;
    const gagal = [];
    for (const admin of rows) {
      const hasil = await notificationService.sendVisaReminderDigest({ email: admin.email, name: admin.name, total: items.length, overdue, operationsUrl });
      if (!hasil.ok) gagal.push(admin.email);
    }
    return gagal.length ? { ok: false, error: `Ringkasan gagal terkirim ke ${gagal.length} dari ${rows.length} admin.` } : { ok: true };
  };
}

async function main() {
  if (!process.argv.includes('--once')) {
    console.log('[visa-reminder-worker] jalankan dengan --once dari scheduler, bukan daemon di proses web.');
    return;
  }
  loadEnvironmentFile(path.join(__dirname, '..', '.env'), process.env);
  const config = readProductionConfig(process.env);
  const database = createDatabase({ connectionString: config.databaseUrl });
  try {
    const sender = createEmailSender({ driver: config.email.driver, apiKey: config.email.resendApiKey, from: config.email.emailFrom, logger: console });
    const notificationService = createNotificationService({ store: createPostgresNotificationStore({ database }), sender });
    const worker = createVisaReminderWorker({
      operationsService: createOperationsService({ store: createPostgresOperationsStore({ database }) }),
      stateStore: createPostgresVisaReminderStore({ database }),
      days: Number(process.env.VISA_REMINDER_DAYS || 30),
      notify: notificationService.canSend()
        ? createAdminDigestNotifier({ database, notificationService, appBaseUrl: config.email.appBaseUrl || process.env.APP_BASE_URL || '' })
        : null
    });
    const result = await worker.runOnce(SYSTEM_ACTOR);
    if (!result.ok) {
      console.error(`[visa-reminder-worker] gagal: ${result.error}${result.value ? ` (${result.value.pending} pengingat tertunda dari ${result.value.scanned} dipindai)` : ''}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[visa-reminder-worker] ${result.value.scanned} dokumen dipindai, ${result.value.notified.length} pengingat baru dikirim.`);
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(`[visa-reminder-worker] tidak dapat dijalankan: ${error.message}`); process.exitCode = 1; });
}

module.exports = { SYSTEM_ACTOR, createAdminDigestNotifier };
