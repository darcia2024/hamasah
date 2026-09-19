const crypto = require('node:crypto');

const NOTIFICATION_TYPES = Object.freeze({ INVITATION: 'account-invitation', PASSWORD_RESET: 'password-reset' });

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function createNotificationService({ store, sender, now = () => new Date() } = {}) {
  if (!store) throw new Error('createNotificationService membutuhkan store.');
  if (!sender) throw new Error('createNotificationService membutuhkan sender.');

  async function send({ notificationType, recipientEmail, subject, html }) {
    const createdAt = now().toISOString();
    const item = await store.create({ id: crypto.randomUUID(), notificationType, recipientEmail, provider: sender.provider, createdAt });
    try {
      const sent = await sender.send({ type: notificationType, to: recipientEmail, subject, html });
      return { ok: true, value: await store.markSent(item.id, { providerMessageId: sent.id, sentAt: now().toISOString() }) };
    } catch (error) {
      await store.markFailed(item.id, { message: error.message, failedAt: now().toISOString() });
      return { ok: false, error: 'Notifikasi belum dapat dikirim.' };
    }
  }

  function canSend() { return sender.configured === true; }

  async function sendInvitation({ email, name, activationUrl }) {
    return send({
      notificationType: NOTIFICATION_TYPES.INVITATION,
      recipientEmail: email,
      subject: 'Aktivasi akun Hamasah International',
      html: `<p>Assalamu'alaikum ${escapeHtml(name)},</p><p>Akun Hamasah International Anda telah dibuat. Buat kata sandi melalui tautan berikut:</p><p><a href="${escapeHtml(activationUrl)}">Aktivasi akun</a></p><p>Tautan ini memiliki masa berlaku terbatas. Jika Anda tidak meminta akun ini, abaikan email ini.</p>`
    });
  }

  async function sendPasswordReset({ email, name, resetUrl }) {
    return send({
      notificationType: NOTIFICATION_TYPES.PASSWORD_RESET,
      recipientEmail: email,
      subject: 'Atur ulang kata sandi Hamasah International',
      html: `<p>Assalamu'alaikum ${escapeHtml(name)},</p><p>Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda.</p><p><a href="${escapeHtml(resetUrl)}">Atur ulang kata sandi</a></p><p>Tautan ini memiliki masa berlaku terbatas. Jika Anda tidak memintanya, abaikan email ini.</p>`
    });
  }

  return Object.freeze({ canSend, list: (query) => store.list(query), sendInvitation, sendPasswordReset });
}

module.exports = { NOTIFICATION_TYPES, createNotificationService, escapeHtml };
