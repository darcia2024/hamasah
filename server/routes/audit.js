const { json, publicError } = require('../http/respond.js');
const { ACTION_VALUES } = require('../audit-service.js');

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/audit$/,
    permission: 'audit.read',
    async handler({ response, services, auth, url }) {
      const q = url.searchParams;
      const hasil = await services.auditService.list({
        from: q.get('from') || undefined,
        to: q.get('to') || undefined,
        action: q.get('action') || undefined,
        actorAccountId: q.get('actorAccountId') || undefined,
        limit: q.get('limit') || undefined,
        offset: q.get('offset') || undefined
      }, await auth.actor());
      if (!hasil.ok) {
        json(response, 403, publicError(hasil));
        return;
      }
      // Daftar aksi ikut dikirim supaya layar audit bisa menyusun pilihan filter
      // tanpa menebak-nebak nama aksi.
      json(response, 200, { ...hasil.value, actions: ACTION_VALUES });
    }
  }
];
