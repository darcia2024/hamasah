const assert = require('node:assert/strict');
const { createNotificationWorker } = require('./notification-worker.js');
const { encryptNotificationPayload } = require('./notification-payload.js');

async function run() {
  const payload = encryptNotificationPayload({ accountId: 'account-1', email: 'wali@example.test', invitationToken: 'token-rahasia-aman-1234567890' }, 'worker-test-key');
  let item = {
    id: 'outbox-1', notification_type: 'account-invitation', recipient_email: 'wali@example.test', attempts: 0,
    payload_ciphertext: payload.ciphertext, payload_nonce: payload.nonce, payload_tag: payload.tag, claim_token: 'claim-1'
  };
  let delivered = null;
  let sentMessage = null;
  const store = {
    async claim() { return item ? [item] : []; },
    async markDelivered(id, claimToken, value) { delivered = { id, claimToken, value }; item = null; return delivered; },
    async markDeliveryFailed() { throw new Error('unexpected failure'); }
  };
  const worker = createNotificationWorker({
    store, notificationPayloadKey: 'worker-test-key', appBaseUrl: 'https://hamasah.test',
    sender: { async send(message) { sentMessage = message; return { id: 'provider-1' }; } },
    now: () => new Date('2026-09-19T00:00:00.000Z')
  });
  const result = await worker.runOnce();
  assert.equal(result.claimed, 1);
  assert.equal(delivered.id, 'outbox-1');
  assert.match(sentMessage.html, /aktivasi\.html#token=token-rahasia-aman-1234567890/);
  console.log('notification worker tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
