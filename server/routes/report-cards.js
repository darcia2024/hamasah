const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Rapor bulanan (report-card-service.js). Wali dan santri hanya membaca yang sudah terbit.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const BLN = '(\\d{4}-\\d{2})';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  {
    method: 'GET',
    pattern: pola('\\/api\\/rapor\\/pengaturan'),
    permission: 'reports.manage',
    async handler({ response, services, auth }) {
      balas(response, await services.reportCardService.getSettings(await auth.actor()));
    }
  },
  {
    method: 'PUT',
    pattern: pola('\\/api\\/rapor\\/pengaturan'),
    permission: 'reports.config',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.reportCardService.updateSettings(body, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.REPORT_SETTINGS_CHANGED, actor, ip, entityType: 'report-settings', entityId: '1', metadata: { fields: Object.keys(body || {}).join(', ') } });
      balas(response, hasil);
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/rapor\\/bulan\\/${BLN}`),
    permission: 'reports.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.reportCardService.monthOverview(params[0], await auth.actor()));
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/students\\/${ID}\\/rapor`),
    permission: 'reports.read',
    async handler({ response, services, auth, params }) {
      balas(response, await services.reportCardService.list(params[0], await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/students\\/${ID}\\/rapor\\/${BLN}\\/susun`),
    permission: 'reports.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.reportCardService.compose(params[0], params[1], actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.REPORT_CARD_COMPOSED, actor, ip, entityType: 'student', entityId: params[0], metadata: { month: params[1] } });
      balas(response, hasil);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/students\\/${ID}\\/rapor\\/${BLN}`),
    permission: 'reports.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.reportCardService.update(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.REPORT_CARD_UPDATED, actor, ip, entityType: 'student', entityId: params[0], metadata: { month: params[1], status: hasil.value.status } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/students\\/${ID}\\/rapor\\/${BLN}\\/terbitkan`),
    permission: 'reports.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.reportCardService.publish(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.REPORT_CARD_PUBLISHED, actor, ip, entityType: 'student', entityId: params[0], metadata: { month: params[1], status: hasil.value.status } });
      balas(response, hasil);
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/students\\/${ID}\\/rapor\\/${BLN}\\/pdf`),
    permission: 'reports.read',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.reportCardService.pdf(params[0], params[1], actor);
      if (!hasil.ok) { balas(response, hasil); return; }
      await services.auditService.record({ action: ACTIONS.REPORT_CARD_DOWNLOADED, actor, ip, entityType: 'student', entityId: params[0], metadata: { month: params[1] } });
      response.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${hasil.value.fileName}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(hasil.value.buffer);
    }
  }
];
