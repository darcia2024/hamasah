const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// KPI musyrif (kpi-service.js). Audit mencatat jenis aksi, tidak ada isi komentar atau bukti.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  { method: 'GET', pattern: pola('\\/api\\/kpi\\/pengaturan'), permission: 'kpi.manage', async handler({ response, services, auth }) { balas(response, await services.kpiService.getSettings(await auth.actor())); } },
  {
    method: 'PUT',
    pattern: pola('\\/api\\/kpi\\/pengaturan'),
    permission: 'kpi.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.kpiService.updateSettings(body, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_SETTINGS_CHANGED, actor, ip, entityType: 'kpi-settings', entityId: '1', metadata: { fields: Object.keys(body || {}).join(', ') } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/kpi\\/indikator'),
    permission: 'kpi.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.kpiService.createIndicator(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_INDICATOR_CHANGED, actor, ip, entityType: 'kpi-indicator', entityId: hasil.value.id, metadata: { change: 'dibuat' } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/kpi\\/indikator\\/${ID}`),
    permission: 'kpi.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.kpiService.updateIndicator(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_INDICATOR_CHANGED, actor, ip, entityType: 'kpi-indicator', entityId: params[0], metadata: { change: 'diubah' } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola('\\/api\\/kpi\\/musyrif'), permission: 'kpi.manage', async handler({ response, services, auth }) { balas(response, await services.kpiService.listMusyrif(await auth.actor())); } },
  {
    method: 'POST',
    pattern: pola('\\/api\\/kpi\\/penilaian'),
    permission: 'kpi.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.kpiService.evaluate(body && body.musyrifId, body && body.month, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_EVALUATION_COMPUTED, actor, ip, entityType: 'kpi-evaluation', entityId: hasil.value.id, metadata: { month: hasil.value.month } });
      balas(response, hasil);
    }
  },
  {
    method: 'GET',
    pattern: pola('\\/api\\/kpi\\/penilaian'),
    permission: 'kpi.manage',
    async handler({ response, services, auth, url }) {
      balas(response, await services.kpiService.detail(url.searchParams.get('musyrifId'), url.searchParams.get('month'), await auth.actor()));
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/kpi\\/penilaian\\/${ID}`),
    permission: 'kpi.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.kpiService.adjust(params[0], body, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_EVALUATION_ADJUSTED, actor, ip, entityType: 'kpi-evaluation', entityId: params[0], metadata: { adjusted: Object.keys((body && body.adjustments) || {}).length } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/kpi\\/penilaian\\/${ID}\\/final`),
    permission: 'kpi.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.kpiService.finalize(params[0], actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_EVALUATION_FINALIZED, actor, ip, entityType: 'kpi-evaluation', entityId: params[0], metadata: { month: hasil.value.month } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola('\\/api\\/kpi\\/perbandingan'), permission: 'kpi.manage', async handler({ response, services, auth, url }) { balas(response, await services.kpiService.comparison(await auth.actor(), url.searchParams.get('year'))); } },
  { method: 'GET', pattern: pola('\\/api\\/kpi\\/pekerjaan-tambahan'), permission: 'kpi.manage', async handler({ response, services, auth, url }) { balas(response, await services.kpiService.listExtraWork(await auth.actor(), url.searchParams.get('status'))); } },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/kpi\\/pekerjaan-tambahan\\/${ID}`),
    permission: 'kpi.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.kpiService.verifyExtraWork(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_EXTRA_WORK_DECIDED, actor, ip, entityType: 'kpi-extra-work', entityId: params[0], metadata: { status: hasil.value.status } });
      balas(response, hasil);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/kpi\\/bukti\\/${ID}\\/komentar`),
    permission: 'kpi.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.kpiService.commentEvidence(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_EVIDENCE_REVIEWED, actor, ip, entityType: 'kpi-evidence', entityId: params[0], metadata: {} });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/kpi\\/penghargaan'),
    permission: 'kpi.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.kpiService.addReward(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_REWARD_GIVEN, actor, ip, entityType: 'kpi-reward', entityId: hasil.value.id, metadata: {} });
      balas(response, hasil, 201);
    }
  },
  { method: 'GET', pattern: pola('\\/api\\/kpi\\/saya'), permission: 'kpi.self.read', async handler({ response, services, auth, url }) { balas(response, await services.kpiService.mine(await auth.actor(), url.searchParams.get('year'))); } },
  {
    method: 'POST',
    pattern: pola('\\/api\\/kpi\\/bukti'),
    permission: 'kpi.self.write',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.kpiService.addEvidence(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_EVIDENCE_ADDED, actor, ip, entityType: 'kpi-evidence', entityId: hasil.value.id, metadata: { month: hasil.value.month } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/kpi\\/pekerjaan-tambahan'),
    permission: 'kpi.self.write',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.kpiService.addExtraWork(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.KPI_EXTRA_WORK_ADDED, actor, ip, entityType: 'kpi-extra-work', entityId: hasil.value.id, metadata: { kind: hasil.value.kind } });
      balas(response, hasil, 201);
    }
  }
];
