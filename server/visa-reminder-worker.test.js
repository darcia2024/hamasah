// Worker pengingat visa (Task R8.2).
const assert = require('node:assert/strict');
const { createVisaReminderWorker } = require('./visa-reminder-worker.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createNotificationService } = require('./notification-service.js');
const { createPostgresNotificationStore } = require('./postgres-notification-store.js');
const { createPostgresVisaReminderStore } = require('./postgres-visa-reminder-store.js');
const { createAdminDigestNotifier } = require('../scripts/visa-reminder-worker.js');

const ADMIN = { id: 'admin', role: 'admin' };
const ops = (items) => ({ async visaReminders() { return { ok: true, value: items }; } });
const S1 = { studentId: 's1', document: 'visa', expiresAt: '2026-09-25', overdue: false };
const S2 = { studentId: 's2', document: 'passport', expiresAt: '2026-09-10', overdue: true };

async function run() {
  // Satu putaran = satu panggilan notify berisi semua item baru; putaran berikutnya diam.
  const calls = [];
  const worker = createVisaReminderWorker({ operationsService: ops([S1, S2]), notify: async (items) => { calls.push(items); return { ok: true }; }, now: () => new Date('2026-09-20T00:00:00Z') });
  assert.equal((await worker.runOnce(ADMIN)).value.notified.length, 2);
  assert.equal((await worker.runOnce(ADMIN)).value.notified.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);

  // Tanpa pengirim: gagal dan tidak ada yang ditandai terkirim (dulu default-nya { ok: true }).
  const saved = [];
  const memoryState = { async load() { return [...saved]; }, async save(keys) { saved.push(...keys); } };
  const tanpaPengirim = createVisaReminderWorker({ operationsService: ops([S1]), stateStore: memoryState });
  const gagal = await tanpaPengirim.runOnce(ADMIN);
  assert.equal(gagal.ok, false);
  assert.match(gagal.error, /belum dikonfigurasi/);
  assert.equal(gagal.value.pending, 1);
  assert.deepEqual(saved, []);

  // Pengirim gagal atau melempar: tidak ditandai terkirim, putaran berikutnya mencoba lagi.
  let percobaan = 0;
  const rapuh = createVisaReminderWorker({ operationsService: ops([S1]), stateStore: memoryState, notify: async () => { percobaan += 1; if (percobaan === 1) throw new Error('penyedia mati'); return { ok: true }; } });
  assert.equal((await rapuh.runOnce(ADMIN)).ok, false);
  assert.deepEqual(saved, []);
  assert.equal((await rapuh.runOnce(ADMIN)).value.notified.length, 1);
  assert.deepEqual(saved, ['s1:visa:2026-09-25']);

  // Akses ditolak diteruskan apa adanya.
  const ditolak = createVisaReminderWorker({ operationsService: { async visaReminders() { return { ok: false, error: 'Akses admin diperlukan.' }; } }, notify: async () => ({ ok: true }) });
  assert.equal((await ditolak.runOnce({ role: 'parent' })).ok, false);

  // Integrasi: state di visa_reminder_log bertahan melewati restart, ringkasan tercatat di outbox.
  const database = await createTestDatabase();
  try {
    await database.query(
      `INSERT INTO accounts (id, email, name, role, active, password_hash) VALUES
       ('00000000-0000-4000-8000-000000000001', 'admin@hamasah.test', 'Admin Uji', 'admin', TRUE, 'x'),
       ('00000000-0000-4000-8000-000000000002', 'nonaktif@hamasah.test', 'Admin Lama', 'admin', FALSE, 'x'),
       ('00000000-0000-4000-8000-000000000003', 'wali@hamasah.test', 'Wali', 'parent', TRUE, 'x')`
    );
    const terkirim = [];
    const sender = { provider: 'test', configured: true, async send(message) { terkirim.push(message); return { id: `m${terkirim.length}` }; } };
    const notificationService = createNotificationService({ store: createPostgresNotificationStore({ database }), sender });
    const makeWorker = () => createVisaReminderWorker({
      operationsService: ops([S1, S2]),
      stateStore: createPostgresVisaReminderStore({ database }),
      notify: createAdminDigestNotifier({ database, notificationService, appBaseUrl: 'https://app.hamasah.test' })
    });
    const pertama = await makeWorker().runOnce(ADMIN);
    assert.equal(pertama.ok, true);
    assert.equal(pertama.value.notified.length, 2);
    assert.equal(terkirim.length, 1, 'Hanya admin aktif yang menerima.');
    assert.equal(terkirim[0].to, 'admin@hamasah.test');
    assert.match(terkirim[0].subject, /2 dokumen/);
    assert.match(terkirim[0].html, /1 di antaranya sudah melewati/);
    assert.ok(terkirim[0].html.includes('https://app.hamasah.test/website/operations.html'));
    assert.ok(!terkirim[0].html.includes('s1') && !terkirim[0].html.includes('2026-09-25'), 'Tanpa data santri di email.');
    const outbox = await database.query("SELECT status FROM notification_outbox WHERE notification_type = 'visa-reminder'");
    assert.deepEqual(outbox.rows.map((row) => row.status), ['sent']);

    // "Restart": worker baru membaca state dari database, tidak mengirim ulang.
    const ulang = await makeWorker().runOnce(ADMIN);
    assert.equal(ulang.value.notified.length, 0);
    assert.equal(terkirim.length, 1);
  } finally {
    await database.close();
  }
  console.log('visa-reminder-worker tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
