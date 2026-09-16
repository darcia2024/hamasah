const { json, publicError } = require('../http/respond.js');

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/articles$/,
    async handler({ response, services }) {
      json(response, 200, { items: await services.articleStore.list() });
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/articles\/([a-z0-9-]+)$/,
    async handler({ response, services, params }) {
      const article = await services.articleStore.get(params[0]);
      if (!article) {
        json(response, 404, { error: 'Artikel tidak ditemukan.' });
        return;
      }
      json(response, 200, { item: article });
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/articles$/,
    permission: 'articles.write',
    async handler({ response, services, readBody }) {
      const created = await services.articleStore.create(await readBody(), new Date().toISOString());
      json(response, created.ok ? 201 : 422, created.ok ? { item: created.value } : publicError(created));
    }
  }
];
