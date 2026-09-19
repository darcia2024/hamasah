function requireString(value, field) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${field} belum dikonfigurasi.`);
  return result;
}

function createDisabledEmailSender() {
  return Object.freeze({ provider: 'disabled', configured: false, async send() { throw new Error('Layanan email belum dikonfigurasi.'); } });
}

function createConsoleEmailSender({ logger = console } = {}) {
  return Object.freeze({
    provider: 'console',
    configured: true,
    async send(message) {
      // Isi dan tautan tidak pernah dicetak, karena dapat memuat token reset.
      logger.log(`[email:console] ${message.type} untuk ${message.to} disiapkan.`);
      return { id: `console-${Date.now()}` };
    }
  });
}

function createResendEmailSender({ apiKey, from, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const secret = requireString(apiKey, 'RESEND_API_KEY');
  const sender = requireString(from, 'EMAIL_FROM');
  if (typeof fetchImpl !== 'function') throw new Error('fetch tidak tersedia untuk pengiriman email.');
  return Object.freeze({
    provider: 'resend',
    configured: true,
    async send(message) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: sender, to: [message.to], subject: message.subject, html: message.html }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.id) throw new Error('Penyedia email menolak pengiriman.');
      return { id: body.id };
    }
  });
}

function createEmailSender(config = {}) {
  if (config.driver === 'resend') return createResendEmailSender(config);
  if (config.driver === 'console') return createConsoleEmailSender(config);
  return createDisabledEmailSender();
}

module.exports = { createConsoleEmailSender, createDisabledEmailSender, createEmailSender, createResendEmailSender };
