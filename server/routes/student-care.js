// Ibadah (sholat berjamaah, setoran hafalan) dan kesehatan santri.
const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

function range(url) {
  return { from: url.searchParams.get('from') || undefined, to: url.searchParams.get('to') || undefined };
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/care$/,
    permission: 'students.read',
    async handler({ response, services, auth, params, url }) {
      const result = await services.studentCareService.summary(params[0], await auth.actor(), range(url));
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { care: result.value, healthEnabled: services.studentCareService.healthEnabled } : publicError(result));
    }
  },

  {
    method: 'PUT',
    pattern: /^\/api\/students\/([\w-]+)\/prayers$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const result = await services.studentCareService.recordPrayers(params[0], await readBody(), actor);
      if (result.ok) await services.auditService.record({ action: ACTIONS.STUDENT_WORSHIP_RECORDED, actor, ip, entityType: 'student', entityId: params[0], metadata: { jenis: 'sholat', tanggal: result.value.date } });
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { prayers: result.value } : publicError(result));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/memorization$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const result = await services.studentCareService.addMemorization(params[0], await readBody(), actor);
      if (result.ok) await services.auditService.record({ action: ACTIONS.STUDENT_WORSHIP_RECORDED, actor, ip, entityType: 'student', entityId: params[0], metadata: { jenis: 'hafalan', tanggal: result.value.occurredOn } });
      json(response, result.ok ? 201 : (result.status || 422), result.ok ? { memorization: result.value } : publicError(result));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/health$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const result = await services.studentCareService.addHealth(params[0], await readBody(), actor);
      // Isi catatan kesehatan tidak masuk metadata audit; cukup bahwa catatan dibuat.
      if (result.ok) await services.auditService.record({ action: ACTIONS.STUDENT_HEALTH_RECORDED, actor, ip, entityType: 'student', entityId: params[0], metadata: { tanggal: result.value.occurredOn } });
      json(response, result.ok ? 201 : (result.status || 422), result.ok ? { health: result.value } : publicError(result));
    }
  }
];
