const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/accounts\/invitations$/,
    permission: 'accounts.manage',
    async handler({ response, services, config, readBody, auth, ip }) {
      if (!services.notificationService.canSend()) {
        json(response, 503, { error: 'Layanan email belum dikonfigurasi.' });
        return;
      }
      const invited = await services.identityService.inviteAccount(await readBody());
      if (!invited.ok) {
        json(response, 422, publicError(invited));
        return;
      }
      const value = invited.value;
      const activationUrl = `${config.appBaseUrl || 'http://localhost:4273'}/website/aktivasi.html#token=${encodeURIComponent(value.invitationToken)}`;
      const sent = await services.notificationService.sendInvitation({ email: value.account.email, name: value.account.name, activationUrl });
      await services.auditService.record({
        action: ACTIONS.ACCOUNT_INVITED, actor: await auth.actor(), ip,
        entityType: 'account', entityId: value.account.id,
        metadata: { email: value.account.email, role: value.account.role, delivered: sent.ok }
      });
      await services.auditService.record({
        action: sent.ok ? ACTIONS.NOTIFICATION_SENT : ACTIONS.NOTIFICATION_FAILED, actor: await auth.actor(), ip,
        entityType: 'account', entityId: value.account.id,
        metadata: { type: 'account-invitation', email: value.account.email }
      });
      json(response, sent.ok ? 201 : 502, sent.ok ? { account: value.account } : { account: value.account, error: sent.error });
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/accounts\/([\w-]+)\/invitation$/,
    permission: 'accounts.manage',
    async handler({ response, services, config, auth, params, ip }) {
      if (!services.notificationService.canSend()) {
        json(response, 503, { error: 'Layanan email belum dikonfigurasi.' });
        return;
      }
      const renewed = await services.identityService.renewInvitation(params[0]);
      if (!renewed.ok) {
        json(response, 422, publicError(renewed));
        return;
      }
      const value = renewed.value;
      const activationUrl = `${config.appBaseUrl || 'http://localhost:4273'}/website/aktivasi.html#token=${encodeURIComponent(value.invitationToken)}`;
      const sent = await services.notificationService.sendInvitation({ email: value.account.email, name: value.account.name, activationUrl });
      await services.auditService.record({
        action: ACTIONS.ACCOUNT_INVITATION_RENEWED, actor: await auth.actor(), ip,
        entityType: 'account', entityId: value.account.id,
        metadata: { email: value.account.email, delivered: sent.ok }
      });
      json(response, sent.ok ? 200 : 502, sent.ok ? { account: value.account } : { account: value.account, error: sent.error });
    }
  },

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
    pattern: /^\/api\/notifications$/,
    permission: 'accounts.manage',
    async handler({ response, services, url }) {
      json(response, 200, await services.notificationService.list({
        limit: url.searchParams.get('limit'), offset: url.searchParams.get('offset'),
        recipientEmail: url.searchParams.get('email'), status: url.searchParams.get('status')
      }));
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
