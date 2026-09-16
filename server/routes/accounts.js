const { json, publicError } = require('../http/respond.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/accounts$/,
    permission: 'accounts.manage',
    async handler({ response, services, readBody }) {
      const created = await services.identityService.createAccount(await readBody());
      json(response, created.ok ? 201 : 422, created.ok ? { account: created.value } : publicError(created));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/accounts$/,
    permission: 'accounts.manage',
    async handler({ response, services }) {
      json(response, 200, { items: await services.identityService.listAccounts() });
    }
  }
];
