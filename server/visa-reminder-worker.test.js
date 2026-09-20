const assert = require('node:assert/strict');
const { createVisaReminderWorker } = require('./visa-reminder-worker.js');

async function run() {
  let calls = 0;
  const worker = createVisaReminderWorker({
    operationsService: { async visaReminders() { return { ok: true, value: [{ studentId: 's1', document: 'visa', expiresAt: '2026-09-25' }] }; } },
    notify: async () => { calls += 1; return { ok: true }; },
    now: () => new Date('2026-09-20T00:00:00Z')
  });
  assert.equal((await worker.runOnce({ id: 'admin', role: 'admin' })).value.notified.length, 1);
  assert.equal((await worker.runOnce({ id: 'admin', role: 'admin' })).value.notified.length, 0);
  assert.equal(calls, 1);
  const saved = [];
  const durable = createVisaReminderWorker({ operationsService: { async visaReminders() { return { ok: true, value: [{ studentId: 's2', document: 'visa', expiresAt: '2026-09-26' }] }; } }, notify: async () => ({ ok: true }), stateStore: { async load() { return saved; }, async save(keys) { saved.splice(0, saved.length, ...keys); } } });
  await durable.runOnce({ id: 'admin', role: 'admin' });
  const restarted = createVisaReminderWorker({ operationsService: { async visaReminders() { return { ok: true, value: [{ studentId: 's2', document: 'visa', expiresAt: '2026-09-26' }] }; } }, notify: async () => { throw new Error('duplikat'); }, stateStore: { async load() { return saved; }, async save() {} } });
  assert.equal((await restarted.runOnce({ id: 'admin', role: 'admin' })).value.notified.length, 0);
  console.log('visa-reminder-worker tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
