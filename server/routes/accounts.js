const { json, publicError } = require('../http/respond.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/accounts$/,
    async handler({ response, services, auth, readBody }) {
      if (!(await auth.isAdmin())) {
        json(response, 401, { error: 'Akses admin diperlukan.' });
        return;
      }
      const created = await services.identityService.createAccount(await readBody());
      json(response, created.ok ? 201 : 422, created.ok ? { account: created.value } : publicError(created));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/accounts$/,
    async handler({ response, services, auth }) {
      if (!(await auth.isAdmin())) {
        json(response, 401, { error: 'Akses admin diperlukan.' });
        return;
      }
      json(response, 200, { items: await services.identityService.listAccounts() });
    }
  }
];
