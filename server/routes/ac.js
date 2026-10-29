const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// AC patungan dan refund (ac-contribution-service.js). Audit mencatat aksi dan id, tidak ada nominal per santri.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  { method: 'GET', pattern: pola('\\/api\\/ac\\/unit'), permission: 'ac.read', async handler({ response, services, auth, url }) { balas(response, await services.acContributionService.listUnits(await auth.actor(), { dormitoryId: url.searchParams.get('dormitoryId') || undefined })); } },
  {
    method: 'POST',
    pattern: pola('\\/api\\/ac\\/unit'),
    permission: 'ac.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.acContributionService.createUnit(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.AC_UNIT_CHANGED, actor, ip, entityType: 'ac-unit', entityId: hasil.value.id, metadata: { change: 'dibuat', ownership: hasil.value.ownership } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/ac\\/unit\\/${ID}`),
    permission: 'ac.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.acContributionService.updateUnit(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.AC_UNIT_CHANGED, actor, ip, entityType: 'ac-unit', entityId: params[0], metadata: { change: 'diubah', ownership: hasil.value.ownership } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola(`\\/api\\/ac\\/unit\\/${ID}\\/kontribusi`), permission: 'ac.manage', async handler({ response, services, auth, params }) { balas(response, await services.acContributionService.listContributions(params[0], await auth.actor())); } },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/ac\\/unit\\/${ID}\\/kontribusi`),
    permission: 'ac.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.acContributionService.addContribution(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.AC_CONTRIBUTION_ADDED, actor, ip, entityType: 'ac-unit', entityId: params[0], metadata: { kind: hasil.value.kind } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/ac\\/kontribusi\\/${ID}\\/batal`),
    permission: 'ac.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.acContributionService.voidContribution(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.AC_CONTRIBUTION_VOIDED, actor, ip, entityType: 'ac-contribution', entityId: params[0], metadata: {} });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola(`\\/api\\/ac\\/santri\\/${ID}\\/refund`), permission: 'ac.manage', async handler({ response, services, auth, params }) { balas(response, await services.acContributionService.refundPreview(params[0], await auth.actor())); } },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/ac\\/santri\\/${ID}\\/refund`),
    permission: 'ac.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.acContributionService.requestRefund(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.AC_REFUND_REQUESTED, actor, ip, entityType: 'student', entityId: params[0], metadata: { count: hasil.value.items.length } });
      balas(response, hasil, 201);
    }
  },
  { method: 'GET', pattern: pola('\\/api\\/ac\\/refund'), permission: 'ac.manage', async handler({ response, services, auth, url }) { balas(response, await services.acContributionService.listRefunds(await auth.actor(), url.searchParams.get('status') || undefined)); } },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/ac\\/refund\\/${ID}\\/putusan`),
    permission: 'ac.approve',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.acContributionService.decideRefund(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.AC_REFUND_DECIDED, actor, ip, entityType: 'ac-refund', entityId: params[0], metadata: { status: hasil.value.status } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/ac\\/refund\\/${ID}\\/cairkan`),
    permission: 'ac.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.acContributionService.disburseRefund(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.AC_REFUND_DISBURSED, actor, ip, entityType: 'ac-refund', entityId: params[0], metadata: {} });
      balas(response, hasil);
    }
  }
];
