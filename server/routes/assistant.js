const { ask } = require('../site-assistant.js');
const { json } = require('../http/respond.js');

module.exports = [
  // Asisten mengambang di landing page. Publik, tanpa sesi; jawaban hanya dari isi situs,
  // lewat OpenRouter bila OPENROUTER_API_KEY diisi, selain itu dari pencari lokal.
  {
    method: 'POST',
    pattern: /^\/api\/assistant\/ask$/,
    rateLimit: { rule: 'assistant-ask', identity: ({ ip }) => ip },
    async handler({ response, readBody, services }) {
      // Saklar "Asisten di website" di halaman Pengaturan.
      if (!(await services.settingsService.ambil('asisten.situs'))) {
        json(response, 503, { error: 'Asisten sedang tidak aktif. Silakan hubungi admin lewat WhatsApp.', nonaktif: true });
        return;
      }
      const body = await readBody();
      // history: beberapa giliran terakhir, supaya pertanyaan lanjutan ("kalau yang putri?") dipahami.
      json(response, 200, await ask(body.question, { history: body.history }));
    }
  }
];
