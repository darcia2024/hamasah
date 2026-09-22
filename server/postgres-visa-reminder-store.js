// State worker pengingat visa (Task R8.2): kunci pengingat yang sudah terkirim, supaya
// restart tidak mengirim ulang semuanya.
function createPostgresVisaReminderStore({ database } = {}) {
  if (!database) throw new Error('createPostgresVisaReminderStore membutuhkan database.');
  return Object.freeze({
    async load() {
      const { rows } = await database.query('SELECT reminder_key FROM visa_reminder_log');
      return rows.map((row) => row.reminder_key);
    },
    // Hanya kunci baru yang dikirim ke sini.
    async save(keys) {
      for (const key of keys) {
        await database.query('INSERT INTO visa_reminder_log (reminder_key) VALUES ($1) ON CONFLICT (reminder_key) DO NOTHING', [key]);
      }
    }
  });
}

module.exports = { createPostgresVisaReminderStore };
