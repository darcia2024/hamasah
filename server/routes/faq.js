const { answerQuestion } = require('../faq-service.js');
const { json } = require('../http/respond.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/faq\/ask$/,
    rateLimit: { rule: 'faq-ask', identity: ({ ip }) => ip },
    async handler({ response, readBody }) {
      const body = await readBody();
      json(response, 200, answerQuestion(body.question));
    }
  }
];
