const { json, publicError } = require('../http/respond.js');

module.exports = [
  // Ringkasan santri, asrama, dan musyrif untuk dashboard super admin.
  {
    method: 'GET',
    pattern: /^\/api\/admin\/overview$/,
    permission: 'overview.read',
    async handler({ response, services, auth }) {
      const hasil = await services.adminOverviewService.overview(await auth.actor());
      json(response, hasil.ok ? 200 : (hasil.status || 403), hasil.ok ? hasil.value : publicError(hasil));
    }
  },
  // Perkembangan santri di asrama yang dipegang musyrif, untuk beranda musyrif.
  {
    method: 'GET',
    pattern: /^\/api\/musyrif\/ringkasan$/,
    permission: 'overview.dormitory',
    async handler({ response, services, auth }) {
      const hasil = await services.adminOverviewService.dormitoryOverview(await auth.actor());
      json(response, hasil.ok ? 200 : (hasil.status || 403), hasil.ok ? hasil.value : publicError(hasil));
    }
  }
];
