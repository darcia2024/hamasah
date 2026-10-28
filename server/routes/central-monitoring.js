const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Monitoring pusat (central-monitoring-service.js). Filter lewat query: country, dormitoryId,
// level, kind, status. Audit hanya mencatat jenis dan status, bukan isi catatannya.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/admin\/monitoring-pusat$/,
    permission: 'monitoring.read',
    async handler({ response, services, auth, url }) {
      const q = url.searchParams;
      balas(response, await services.centralMonitoringService.overview(await auth.actor(), {
        country: q.get('country'),
        dormitoryId: q.get('dormitoryId'),
        level: q.get('level'),
        kind: q.get('kind'),
        status: q.get('status')
      }));
    }
  },

  // Catat masalah baru (lapor diri, lapor pendidikan, status pendidikan): { studentId, kind, note, dueOn }.
  {
    method: 'POST',
    pattern: /^\/api\/admin\/monitoring-pusat\/masalah$/,
    permission: 'monitoring.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.centralMonitoringService.create(await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.MONITORING_CASE_CREATED, actor, ip,
          entityType: 'student', entityId: hasil.value.studentId,
          metadata: { kind: hasil.value.kind }
        });
      }
      balas(response, hasil, 201);
    }
  },

  // Ubah status masalah: { studentId, kind, ref, status, note }.
  {
    method: 'PATCH',
    pattern: /^\/api\/admin\/monitoring-pusat\/masalah$/,
    permission: 'monitoring.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const isi = await readBody();
      const hasil = await services.centralMonitoringService.setStatus(isi, actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.MONITORING_CASE_UPDATED, actor, ip,
          entityType: 'student', entityId: String(isi.studentId),
          metadata: { kind: String(isi.kind), status: hasil.value.status }
        });
      }
      balas(response, hasil);
    }
  }
];
