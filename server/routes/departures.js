// Kloter keberangkatan: dikelola petugas pendaftaran dan admin (izin departures.manage).
const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

const REGISTRATION_ID = String.raw`HI-REG-\d{4}-\d{5}`;

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/departures$/,
    permission: 'departures.manage',
    async handler({ response, services, auth }) {
      const result = await services.departureService.listGroups(await auth.actor());
      json(response, result.ok ? 200 : 403, result.ok ? { items: result.value } : publicError(result));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/departures$/,
    permission: 'departures.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const result = await services.departureService.createGroup(await readBody(), actor);
      if (result.ok) {
        await services.auditService.record({ action: ACTIONS.DEPARTURE_GROUP_SAVED, actor, ip, entityType: 'departure-group', entityId: result.value.id, metadata: { name: result.value.name, status: result.value.status } });
      }
      json(response, result.ok ? 201 : 422, result.ok ? { group: result.value } : publicError(result));
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/departures\/([\w-]+)$/,
    permission: 'departures.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const result = await services.departureService.updateGroup(params[0], await readBody(), actor);
      let notified = 0;
      if (result.ok && result.changes.length && result.members.length) {
        notified = await services.eventNotifier.departureUpdated(result.members, result.value, result.changes);
      }
      if (result.ok) {
        await services.auditService.record({ action: ACTIONS.DEPARTURE_GROUP_SAVED, actor, ip, entityType: 'departure-group', entityId: result.value.id, metadata: { name: result.value.name, status: result.value.status } });
      }
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { group: result.value, notified } : publicError(result));
    }
  },

  // Menugaskan pendaftar ke kloter; departureGroupId null melepasnya.
  {
    method: 'PUT',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/departure$`),
    permission: 'departures.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const result = await services.departureService.assign(params[0], body.departureGroupId || null, actor);
      if (result.ok && result.changed && result.value) {
        await services.eventNotifier.departureAssigned(params[0], await services.departureService.forApplicant(params[0]));
      }
      if (result.ok) {
        await services.auditService.record({ action: ACTIONS.REGISTRATION_DEPARTURE_ASSIGNED, actor, ip, entityType: 'registration', entityId: params[0], metadata: { departureGroupId: body.departureGroupId || null } });
      }
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { departure: result.value } : publicError(result));
    }
  }
];
