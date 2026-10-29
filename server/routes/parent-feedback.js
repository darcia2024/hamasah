const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Kritik, saran, apresiasi, dan keluhan wali (parent-feedback-service.js). Audit tidak mencatat isi
// masukan, hanya jenisnya.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/masukan\/saya$/,
    permission: 'feedback.mine',
    async handler({ response, services, auth }) {
      balas(response, await services.parentFeedbackService.mine(await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/masukan$/,
    permission: 'feedback.send',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.parentFeedbackService.send(await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.PARENT_FEEDBACK_SENT, actor, ip, entityType: 'parent-feedback', entityId: hasil.value.id, metadata: { kind: hasil.value.kind } });
      }
      balas(response, hasil, 201);
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/masukan$/,
    permission: 'feedback.read',
    async handler({ response, services, auth, url }) {
      balas(response, await services.parentFeedbackService.inbox(await auth.actor(), url.searchParams.get('status')));
    }
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/masukan\/([\w-]+)\/verifikasi$/,
    permission: 'feedback.verify',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.parentFeedbackService.verify(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.PARENT_FEEDBACK_VERIFIED, actor, ip, entityType: 'parent-feedback', entityId: params[0], metadata: { linkedToKpi: Boolean(hasil.value.kpiAccountId) } });
      balas(response, hasil);
    }
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/masukan\/([\w-]+)$/,
    permission: 'feedback.read',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.parentFeedbackService.handle(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.PARENT_FEEDBACK_HANDLED, actor, ip, entityType: 'parent-feedback', entityId: params[0], metadata: { status: hasil.value.status } });
      }
      balas(response, hasil);
    }
  }
];
