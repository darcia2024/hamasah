const { answerQuestion } = require('../faq-service.js');
const { json } = require('../http/respond.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/faq\/ask$/,
    async handler({ response, readBody }) {
      const body = await readBody();
      json(response, 200, answerQuestion(body.question));
    }
  }
];
