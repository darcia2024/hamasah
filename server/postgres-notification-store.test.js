const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresNotificationStore } = require('./postgres-notification-store.js');

async function run() {
  const database = await createTestDatabase();
  try {
    const store = createPostgresNotificationStore({ database });
    const created = await store.create({
      id: crypto.randomUUID(), notificationType: 'account-invitation', recipientEmail: 'worker@test.example',
      provider: 'test', createdAt: new Date().toISOString()
    });
    const claimed = await store.claim({ limit: 10, now: new Date() });
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, created.id);
    assert.equal(claimed[0].status, 'processing');
    assert.ok(claimed[0].claim_token);
    const delivered = await store.markDelivered(created.id, claimed[0].claim_token, {
      providerMessageId: 'provider-1', sentAt: new Date().toISOString()
    });
    assert.equal(delivered.status, 'sent');
    console.log('postgres notification store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
