const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Hadiah dan apresiasi santri (student-reward-service.js). Dicatat admin; musyrif, wali, dan santri membaca sesuai cakupannya.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/hadiah$/,
    permission: 'rewards.list',
    async handler({ response, services, auth }) {
      balas(response, await services.studentRewardService.list(await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/hadiah$/,
    permission: 'rewards.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentRewardService.give(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.STUDENT_REWARD_GIVEN, actor, ip, entityType: 'student', entityId: hasil.value.studentId, metadata: { rewardId: hasil.value.id, kind: hasil.value.kind } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/hadiah\/([\w-]+)\/batal$/,
    permission: 'rewards.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentRewardService.void(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.STUDENT_REWARD_VOIDED, actor, ip, entityType: 'student', entityId: hasil.value.studentId, metadata: { rewardId: params[0] } });
      balas(response, hasil);
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/hadiah$/,
    permission: 'rewards.read',
    async handler({ response, services, auth, params }) {
      balas(response, await services.studentRewardService.forStudent(params[0], await auth.actor()));
    }
  }
];
