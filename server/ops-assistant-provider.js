'use strict';

// Penyedia model untuk Asisten Operasional Hamasah (item 20), lewat OpenRouter seperti asisten situs.
// Layanan memanggil generate({ system, user }) hanya bila admin mengaktifkan pengiriman data ke penyedia luar
// (pengaturan asisten.kirimKeLuar) DAN kunci OPENROUTER_API_KEY terpasang. Isi `user` sudah dianonimkan oleh layanan.
// Catatan: belum diuji terhadap OpenRouter sungguhan di lingkungan ini; tesnya memakai penyedia tiruan.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-5-nano';
const TIMEOUT_MS = 20000;

function createOpsAssistantProvider({ env = process.env, fetchImpl = globalThis.fetch, logger = console } = {}) {
  const configured = Boolean(env.OPENROUTER_API_KEY) && typeof fetchImpl === 'function';

  async function generate({ system, user }) {
    if (!configured) throw new Error('provider-not-configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.APP_BASE_URL || 'https://hamasahinternational.com',
          'X-Title': 'Hamasah International'
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: 900,
          reasoning: { effort: 'low' }
        })
      });
      if (!response.ok) throw new Error(`openrouter-${response.status}`);
      const data = await response.json();
      const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!raw || !String(raw).trim()) throw new Error('openrouter-empty');
      return { text: String(raw) };
    } catch (error) {
      if (logger && typeof logger.warn === 'function') logger.warn(`[ops-assistant] penyedia gagal: ${error.name === 'AbortError' ? 'timeout' : error.message}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({ configured, generate });
}

module.exports = { createOpsAssistantProvider };
