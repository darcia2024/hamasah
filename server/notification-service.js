const crypto = require('node:crypto');
const { encryptNotificationPayload } = require('./notification-payload.js');

const NOTIFICATION_TYPES = Object.freeze({ INVITATION: 'account-invitation', PASSWORD_RESET: 'password-reset', VISA_REMINDER: 'visa-reminder' });

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function createNotificationService({ store, sender, notificationPayloadKey = '', now = () => new Date(), senderTimeoutMs = 10000 } = {}) {
  if (!store) throw new Error('createNotificationService membutuhkan store.');
  if (!sender) throw new Error('createNotificationService membutuhkan sender.');

  async function sendWithTimeout(message) {
    let timer;
    try {
      return await Promise.race([
        sender.send(message),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Penyedia email melebihi batas waktu.')), senderTimeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function send({ notificationType, recipientEmail, subject, html }) {
    const createdAt = now().toISOString();
    const item = await store.create({ id: crypto.randomUUID(), notificationType, recipientEmail, provider: sender.provider, createdAt });
    try {
      const sent = await sendWithTimeout({ type: notificationType, to: recipientEmail, subject, html });
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

  async function sendApplicantRecovery({ email, name, registrationId, accessCode }) {
    return send({
      // Reuse the existing database enum until notification types are expanded in a later migration.
      notificationType: NOTIFICATION_TYPES.PASSWORD_RESET,
      recipientEmail: email,
      subject: 'Kode akses pendaftaran Hamasah International',
      html: `<p>Assalamu'alaikum ${escapeHtml(name)},</p><p>Berikut kode akses baru untuk memeriksa pendaftaran ${escapeHtml(registrationId)}:</p><p style="font-size:24px;font-weight:700;letter-spacing:3px">${escapeHtml(accessCode)}</p><p>Jangan bagikan kode ini kepada orang lain. Jika Anda tidak meminta kode baru, segera hubungi admin Hamasah International.</p>`
    });
  }

  // Ringkasan pengingat visa/paspor untuk admin (Task R8.2). Sengaja hanya jumlah dan
  // tautan: nama santri dan tanggal dokumen tidak ikut ke kotak surat.
  async function sendVisaReminderDigest({ email, name, total, overdue, operationsUrl }) {
    const lewat = overdue > 0 ? ` ${overdue} di antaranya sudah melewati tanggal kedaluwarsa.` : '';
    return send({
      notificationType: NOTIFICATION_TYPES.VISA_REMINDER,
      recipientEmail: email,
      subject: `Pengingat: ${total} dokumen visa/paspor perlu ditindaklanjuti`,
      html: `<p>Assalamu'alaikum ${escapeHtml(name)},</p><p>Ada ${Number(total)} dokumen visa atau paspor santri yang akan kedaluwarsa dalam waktu dekat.${escapeHtml(lewat)}</p><p><a href="${escapeHtml(operationsUrl)}">Buka halaman operasional</a> untuk melihat rinciannya.</p><p>Email ini dikirim otomatis dan hanya memuat dokumen yang belum pernah diingatkan.</p>`
    });
  }

  async function queueApplicantRecovery({ email, name, registrationId, accessCode }) {
    if (!notificationPayloadKey) throw new Error('Kunci payload notifikasi belum tersedia.');
    const payload = encryptNotificationPayload({ kind: 'applicant-recovery', name, registrationId, accessCode }, notificationPayloadKey);
    return store.create({
      id: crypto.randomUUID(), notificationType: NOTIFICATION_TYPES.PASSWORD_RESET,
      recipientEmail: email, provider: sender.provider, createdAt: now().toISOString(),
      payloadCiphertext: payload.ciphertext, payloadNonce: payload.nonce, payloadTag: payload.tag
    });
  }

  return Object.freeze({ canSend, list: (query) => store.list(query), queueApplicantRecovery, sendApplicantRecovery, sendInvitation, sendPasswordReset, sendVisaReminderDigest });
}

module.exports = { NOTIFICATION_TYPES, createNotificationService, escapeHtml };
