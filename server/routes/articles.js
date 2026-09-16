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
    async handler({ response, services, auth, readBody }) {
      if (!(await auth.staffActor())) {
        json(response, 401, { error: 'Akses petugas diperlukan.' });
        return;
      }
      const created = await services.articleStore.create(await readBody(), new Date().toISOString());
      json(response, created.ok ? 201 : 422, created.ok ? { item: created.value } : publicError(created));
    }
  }
];
