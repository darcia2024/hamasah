const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Data demo dari dashboard super admin. Lihat server/demo-data-service.js.
module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/admin\/demo-data$/,
    permission: 'demo.manage',
    async handler({ response, services }) {
      json(response, 200, await services.demoDataService.status());
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/admin\/demo-data\/langkah$/,
    permission: 'demo.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const body = await readBody();
      const hasil = await services.demoDataService.jalankanLangkah(body && body.langkah);
      if (hasil.ok && hasil.value.langkah === 'akun' && hasil.value.dibuat) {
        await services.auditService.record({
          action: ACTIONS.DEMO_DATA_STARTED, actor: await auth.actor(), ip,
          entityType: 'demo-data', entityId: 'demo', metadata: { akun: hasil.value.dibuat }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/admin\/demo-data\/sandi$/,
    permission: 'demo.manage',
    async handler({ response, services, auth, ip }) {
      const hasil = await services.demoDataService.gantiSandi();
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.DEMO_DATA_PASSWORD_RESET, actor: await auth.actor(), ip,
          entityType: 'demo-data', entityId: 'demo', metadata: {}
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/admin\/demo-data\/hapus$/,
    permission: 'demo.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const body = await readBody();
      const hasil = await services.demoDataService.hapus(body && body.konfirmasi);
      if (hasil.ok && hasil.value.dihapus.akun + hasil.value.dihapus.santri + hasil.value.dihapus.pendaftar > 0) {
        await services.auditService.record({
          action: ACTIONS.DEMO_DATA_DELETED, actor: await auth.actor(), ip,
          entityType: 'demo-data', entityId: 'demo', metadata: hasil.value.dihapus
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  }
];
