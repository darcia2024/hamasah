const { json, publicError } = require('../http/respond.js');
const { renderMarkdown } = require('../article-markdown.js');

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/articles$/,
    async handler({ response, services, url }) {
      const query = url.searchParams;
      json(response, 200, await services.articleStore.list({
        category: query.get('category') || undefined,
        search: query.get('search') || undefined,
        limit: query.get('limit'),
        offset: query.get('offset')
      }));
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
    method: 'GET',
    pattern: /^\/api\/staff\/articles$/,
    permission: 'articles.write',
    async handler({ response, services, url }) {
      const query = url.searchParams;
      json(response, 200, await services.articleStore.list({
        publicOnly: false,
        category: query.get('category') || undefined,
        search: query.get('search') || undefined,
        limit: query.get('limit'),
        offset: query.get('offset')
      }));
    }
  },

  // Daftar editorial tidak membawa isi artikel; formulir edit mengambilnya dari sini.
  {
    method: 'GET',
    pattern: /^\/api\/staff\/articles\/([a-z0-9-]+)$/,
    permission: 'articles.write',
    async handler({ response, services, params }) {
      const article = await services.articleStore.get(params[0], { publicOnly: false });
      if (!article) {
        json(response, 404, { error: 'Artikel tidak ditemukan.' });
        return;
      }
      json(response, 200, { item: article });
    }
  },

  // Pratinjau isi memakai renderer yang sama dengan halaman publik (Task R7.5).
  {
    method: 'POST',
    pattern: /^\/api\/staff\/articles\/preview$/,
    permission: 'articles.write',
    async handler({ response, readBody }) {
      const input = await readBody();
      json(response, 200, { html: renderMarkdown(String((input && input.body) || '').slice(0, 100000)) });
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/articles$/,
    permission: 'articles.write',
    async handler({ response, services, readBody, auth }) {
      const actor = await auth.actor();
      const created = await services.articleStore.create(await readBody(), new Date().toISOString(), { authorAccountId: actor ? actor.id : null });
      json(response, created.ok ? 201 : 422, created.ok ? { item: created.value } : publicError(created));
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/articles\/([a-z0-9-]+)$/,
    permission: 'articles.write',
    async handler({ response, services, params, readBody }) {
      const updated = await services.articleStore.update(params[0], await readBody(), new Date().toISOString());
      json(response, updated.ok ? 200 : (updated.status || 422), updated.ok ? { item: updated.value } : publicError(updated));
    }
  }
];
