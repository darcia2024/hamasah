const { answerQuestion } = require('../faq-service.js');
const { sesuaikanTeksKontak } = require('../site-content.js');
const { json } = require('../http/respond.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/faq\/ask$/,
    rateLimit: { rule: 'faq-ask', identity: ({ ip }) => ip },
    async handler({ response, readBody, services }) {
      const body = await readBody();
      const jawaban = answerQuestion(body.question);
      // Nomor WhatsApp dan alamat mengikuti yang disimpan di halaman Konten Website.
      const konten = await services.siteContentService.untukHalaman();
      json(response, 200, konten ? { ...jawaban, answer: sesuaikanTeksKontak(jawaban.answer, konten.nilai.kontak) } : jawaban);
    }
  }
];
