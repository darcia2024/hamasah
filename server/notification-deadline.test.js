const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptNotificationPayload } = require('./notification-payload');
const { createNotificationWorker } = require('./notification-worker');

test('bounded notification delivery never leases work after the budget is exhausted', async () => {
  let calls = 0;
  const worker = createNotificationWorker({ store: { async claim() { calls++; return []; } },
    sender: { async send() { throw Error('must not send'); } }, notificationPayloadKey: 'test-key' });
  assert.deepEqual(await worker.runOnce({ limit: 50, maxDurationMs: 0 }), { claimed: 0, results: [] });
  assert.equal(calls, 0);
});

test('bounded delivery claims individual messages and leaves the rest available', async () => {
  const sealed = encryptNotificationPayload({ kind: 'password-reset', name: 'Dummy', resetToken: 'dummy-token' }, 'test-key');
  const queue = ['a','b','c'].map(id => ({ id, notification_type: 'password-reset', recipient_email: 'dummy@example.test',
    payload_ciphertext: sealed.ciphertext, payload_nonce: sealed.nonce, payload_tag: sealed.tag, claim_token: id }));
  const sent = [];
  const worker = createNotificationWorker({ notificationPayloadKey: 'test-key', appBaseUrl: 'https://example.test',
    sender: { async send(message) { sent.push(message); return { id: 'provider-id' }; } },
    store: {
      async claim(options) { assert.equal(options.limit, 1); return queue.length ? [queue.shift()] : []; },
      async markDelivered(id) { return id; },
      async markDeliveryFailed() { assert.fail('delivery should succeed'); }
    }
  });
  assert.equal((await worker.runOnce({ limit: 2, maxDurationMs: 20000 })).claimed, 2);
  assert.equal(sent.length, 2);
  assert.equal(queue.length, 1);
});
