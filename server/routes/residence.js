const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Iqamah santri (residence-service.js). Santri dan wali: GET /api/iqamah-saya. Santri
// melapor tanggal baru; musyrif asramanya atau admin menerima, menolak, atau mengisi
// tanggal langsung. Audit hanya mencatat tanggal dan keputusan, bukan catatannya.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/iqamah-saya$/,
    permission: 'residence.read',
    async handler({ response, services, auth }) {
      balas(response, await services.residenceService.forFamily(await auth.actor()));
    }
  },

  // Laporan tanggal iqamah baru dari santri: { expiresOn, note }.
  {
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/iqamah\/laporan$/,
    permission: 'residence.report',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.residenceService.report(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.RESIDENCE_REPORTED, actor, ip,
          entityType: 'student', entityId: params[0],
          metadata: { expiresOn: hasil.value.laporan && hasil.value.laporan.expiresOn }
        });
      }
      balas(response, hasil, 201);
    }
  },

  // Penanda perpanjangan sedang diurus: { aktif: true|false, note }.
  {
    method: 'PUT',
    pattern: /^\/api\/students\/([\w-]+)\/iqamah\/pengurusan$/,
    permission: 'residence.renewal',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.residenceService.setRenewal(params[0], await readBody(), await auth.actor()));
    }
  },

  // Musyrif atau admin mengisi tanggal habis iqamah yang sudah dicek: { expiresOn }.
  {
    method: 'PUT',
    pattern: /^\/api\/students\/([\w-]+)\/iqamah$/,
    permission: 'residence.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.residenceService.setExpiry(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.RESIDENCE_UPDATED, actor, ip,
          entityType: 'student', entityId: params[0],
          metadata: { expiresOn: hasil.value.iqamah.expiresOn }
        });
      }
      balas(response, hasil);
    }
  },

  // Keputusan atas laporan santri: { decision: diterima|ditolak, note }.
  {
    method: 'POST',
    pattern: /^\/api\/iqamah\/laporan\/([\w-]+)\/keputusan$/,
    permission: 'residence.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.residenceService.decideReport(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.RESIDENCE_REPORT_DECIDED, actor, ip,
          entityType: 'student', entityId: hasil.value.studentId,
          metadata: { reportId: params[0], decision: hasil.value.decision }
        });
      }
      balas(response, hasil);
    }
  },

  // Daftar iqamah santri satu asrama, untuk tab Iqamah di Kelola Asrama.
  {
    method: 'GET',
    pattern: /^\/api\/asrama\/([\w-]+)\/iqamah$/,
    permission: 'residence.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.residenceService.forDormitory(params[0], await auth.actor()));
    }
  }
];
