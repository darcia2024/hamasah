const { json, noContent, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/dormitories$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth }) {
      const hasil = await services.dormitoryService.list(await auth.actor());
      json(response, hasil.ok ? 200 : 403, hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/dormitories$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const dibuat = await services.dormitoryService.create(await readBody(), await auth.actor());
      if (dibuat.ok) {
        await services.auditService.record({
          action: ACTIONS.DORMITORY_CREATED, actor: await auth.actor(), ip,
          entityType: 'dormitory', entityId: dibuat.value.id,
          metadata: { name: dibuat.value.name, gender: dibuat.value.gender }
        });
      }
      json(response, dibuat.ok ? 201 : 422, dibuat.ok ? { dormitory: dibuat.value } : publicError(dibuat));
    }
  },

  // Menugaskan musyrif ke satu asrama.
  {
    method: 'POST',
    pattern: /^\/api\/dormitories\/([\w-]+)\/staff\/([\w-]+)$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth, params, ip }) {
      const hasil = await services.dormitoryService.assign(params[0], params[1], await auth.actor());
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.DORMITORY_STAFF_ASSIGNED, actor: await auth.actor(), ip,
          entityType: 'dormitory', entityId: params[0], metadata: { accountId: params[1] }
        });
      }
      json(response, hasil.ok ? 201 : 422, hasil.ok ? { assignment: hasil.value } : publicError(hasil));
    }
  },

  {
    method: 'DELETE',
    pattern: /^\/api\/dormitories\/([\w-]+)\/staff\/([\w-]+)$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth, params, ip }) {
      const hasil = await services.dormitoryService.unassign(params[0], params[1], await auth.actor());
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.DORMITORY_STAFF_UNASSIGNED, actor: await auth.actor(), ip,
          entityType: 'dormitory', entityId: params[0], metadata: { accountId: params[1] }
        });
        noContent(response);
        return;
      }
      json(response, 422, publicError(hasil));
    }
  }
];
