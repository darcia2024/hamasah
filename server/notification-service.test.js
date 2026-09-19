const assert = require('node:assert/strict');
const { createNotificationService } = require('./notification-service.js');

function memoryStore() {
  const items = [];
  return {
    items,
    async create(item) { const saved = { ...item, status: 'pending', attempts: 0 }; items.push(saved); return saved; },
    async markSent(id, values) { const item = items.find((entry) => entry.id === id); Object.assign(item, { status: 'sent', attempts: item.attempts + 1, ...values }); return item; },
    async markFailed(id, values) { const item = items.find((entry) => entry.id === id); Object.assign(item, { status: 'failed', attempts: item.attempts + 1, ...values }); return item; },
    async list() { return { items, total: items.length, limit: 50, offset: 0 }; }
  };
}

async function run() {
  const store = memoryStore();
  const delivered = [];
  const service = createNotificationService({
    store,
    sender: { provider: 'test', configured: true, async send(message) { delivered.push(message); return { id: 'provider-1' }; } },
    now: () => new Date('2026-09-19T12:00:00.000Z')
  });
  const sent = await service.sendPasswordReset({ email: 'wali@hamasah.test', name: 'Wali', resetUrl: 'https://app.test/reset?token=secret-token' });
  assert.equal(sent.ok, true);
  assert.equal(delivered.length, 1);
  assert.equal(store.items[0].status, 'sent');
  assert.equal(JSON.stringify(store.items).includes('secret-token'), false, 'Outbox tidak boleh menyimpan token reset.');

  const failedStore = memoryStore();
  const failed = createNotificationService({
    store: failedStore,
    sender: { provider: 'test', configured: true, async send() { throw new Error('provider tidak tersedia'); } }
  });
  assert.equal((await failed.sendInvitation({ email: 'wali@hamasah.test', name: 'Wali', activationUrl: 'https://app.test/a?token=secret' })).ok, false);
  assert.equal(failedStore.items[0].status, 'failed');
  assert.equal(JSON.stringify(failedStore.items).includes('secret'), false);
  console.log('notification service tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
