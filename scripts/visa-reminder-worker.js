'use strict';
// Scheduler adapter: deployment memanggil --once sesuai cron/service manager.
// Pengiriman aktual dapat disambungkan ke notification service setelah kebijakan email disetujui.
const { createVisaReminderWorker } = require('../server/visa-reminder-worker.js');

async function main() {
  if (process.argv.includes('--once')) {
    console.log('[visa-reminder-worker] adapter siap; sambungkan operationsService dan notification provider di deployment.');
    return;
  }
  console.log('[visa-reminder-worker] gunakan --once dari scheduler, bukan daemon di proses web.');
}
main().catch((error) => { console.error(`[visa-reminder-worker] gagal: ${error.message}`); process.exitCode = 1; });

module.exports = { createVisaReminderWorker };
