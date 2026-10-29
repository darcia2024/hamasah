const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Batas peringatan dokumen tinggal (document-settings-service.js).
function balas(response, hasil) {
  json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/pengaturan-dokumen$/,
    permission: 'document-alerts.read',
    async handler({ response, services, auth }) {
      balas(response, await services.documentSettingsService.read(await auth.actor()));
    }
  },
  {
    method: 'PUT',
    pattern: /^\/api\/pengaturan-dokumen$/,
    permission: 'document-alerts.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.documentSettingsService.update(body, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.DOCUMENT_ALERTS_CHANGED, actor, ip, entityType: 'document-alerts', entityId: '1', metadata: { fields: Object.keys(body || {}).join(', ') } });
      balas(response, hasil);
    }
  }
];
