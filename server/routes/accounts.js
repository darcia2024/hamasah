const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/accounts$/,
    permission: 'accounts.manage',
    async handler({ response, services, readBody, auth, ip }) {
      const created = await services.identityService.createAccount(await readBody());
      if (created.ok) {
        await services.auditService.record({
          action: ACTIONS.ACCOUNT_CREATED, actor: await auth.actor(), ip,
          entityType: 'account', entityId: created.value.id,
          metadata: { email: created.value.email, role: created.value.role }
        });
      }
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
