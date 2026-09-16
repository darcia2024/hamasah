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

  // Menonaktifkan akun sekaligus mencabut sesinya. Tanpa pencabutan, akun yang
  // sudah dinonaktifkan masih bisa dipakai sampai sesinya kedaluwarsa sendiri.
  {
    method: 'PATCH',
    pattern: /^\/api\/accounts\/([\w-]+)\/active$/,
    permission: 'accounts.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const body = await readBody();
      const actor = await auth.actor();
      const hasil = await services.identityService.setAccountActive(params[0], body.active === true, actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.ACCOUNT_ACTIVE_CHANGED, actor, ip,
          entityType: 'account', entityId: params[0],
          metadata: { active: hasil.value.account.active, sesiDicabut: hasil.value.sessionsRevoked }
        });
      }
      json(response, hasil.ok ? 200 : 422, hasil.ok ? hasil.value : publicError(hasil));
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
