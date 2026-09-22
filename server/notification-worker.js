const { decryptNotificationPayload } = require('./notification-payload.js');
const { escapeHtml, NOTIFICATION_TYPES } = require('./notification-service.js');
const { EVENT_TYPES, eventMessage } = require('./notification-templates.js');

function createNotificationWorker({ store, sender, notificationPayloadKey, appBaseUrl, now = () => new Date(), senderTimeoutMs = 10000, maxAttempts = 5, baseRetryMs = 60000, leaseMs = 300000 } = {}) {
  if (!store || typeof store.claim !== 'function') throw new Error('Worker membutuhkan store durable dengan claim().');
  if (!sender || typeof sender.send !== 'function') throw new Error('Worker membutuhkan sender email.');
  if (!notificationPayloadKey) throw new Error('Worker membutuhkan kunci payload notifikasi.');

  async function sendWithTimeout(message) {
    let timer;
    try {
      return await Promise.race([
        sender.send(message),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Penyedia email melebihi batas waktu.')), senderTimeoutMs); })
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async function process(item) {
    try {
      const payload = decryptNotificationPayload({ ciphertext: item.payload_ciphertext, nonce: item.payload_nonce, tag: item.payload_tag }, notificationPayloadKey);
      let message;
      if (item.notification_type === NOTIFICATION_TYPES.INVITATION) {
        const activationUrl = `${appBaseUrl}/website/aktivasi.html#token=${encodeURIComponent(payload.invitationToken)}`;
        message = { type: NOTIFICATION_TYPES.INVITATION, to: item.recipient_email, subject: 'Aktivasi akun Hamasah International', html: `<p>Assalamu'alaikum,</p><p>Akun Hamasah International Anda telah dibuat. Buat kata sandi melalui tautan berikut:</p><p><a href="${escapeHtml(activationUrl)}">Aktivasi akun</a></p><p>Tautan ini memiliki masa berlaku terbatas.</p>` };
      } else if (item.notification_type === NOTIFICATION_TYPES.PASSWORD_RESET && payload.kind === 'applicant-recovery') {
        message = { type: NOTIFICATION_TYPES.PASSWORD_RESET, to: item.recipient_email, subject: 'Kode akses pendaftaran Hamasah International', html: `<p>Assalamu'alaikum ${escapeHtml(payload.name)},</p><p>Berikut kode akses baru untuk memeriksa pendaftaran ${escapeHtml(payload.registrationId)}:</p><p style="font-size:24px;font-weight:700;letter-spacing:3px">${escapeHtml(payload.accessCode)}</p><p>Jangan bagikan kode ini kepada orang lain.</p>` };
      } else if (Object.values(EVENT_TYPES).includes(item.notification_type)) {
        const content = eventMessage(item.notification_type, payload, appBaseUrl);
        message = { type: item.notification_type, to: item.recipient_email, ...content };
      } else {
        throw new Error('Tipe payload notifikasi belum didukung worker.');
      }
      const sent = await sendWithTimeout(message);
      return store.markDelivered(item.id, item.claim_token, { providerMessageId: sent.id, sentAt: now().toISOString() });
    } catch (error) {
      const attempts = Number(item.attempts || 0) + 1;
      const delay = baseRetryMs * (2 ** Math.min(attempts - 1, 6));
      return store.markDeliveryFailed(item.id, item.claim_token, {
        message: error.message, failedAt: now().toISOString(), retryAt: new Date(now().getTime() + delay).toISOString(), maxAttempts
      });
    }
  }

  async function runOnce({ limit = 10 } = {}) {
    const claimed = await store.claim({ limit, now: now(), leaseMs });
    const results = [];
    for (const item of claimed) results.push(await process(item));
    return { claimed: claimed.length, results };
  }

  return Object.freeze({ runOnce });
}

module.exports = { createNotificationWorker };
