const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Profil santri terintegrasi (student-profile-service.js): kontak, pendidikan, paspor dan iqamah,
// penempatan, riwayat status, dan dokumen pribadi. Audit hanya mencatat nama kolom dan jenis
// dokumen, tidak pernah isinya.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  {
    method: 'GET',
    pattern: pola(`\\/api\\/students\\/${ID}\\/profil`),
    permission: 'students.read',
    async handler({ response, services, auth, params }) {
      balas(response, await services.studentProfileService.profile(params[0], await auth.actor()));
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/students\\/${ID}\\/profil`),
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentProfileService.updateProfile(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.STUDENT_PROFILE_UPDATED, actor, ip, entityType: 'student', entityId: params[0], metadata: { fields: hasil.value.fields.join(', ') } });
      }
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/students\\/${ID}\\/dokumen`),
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentProfileService.addDocument(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.STUDENT_DOCUMENT_CHANGED, actor, ip, entityType: 'student', entityId: params[0], metadata: { change: 'ditambah', kind: hasil.value.kind } });
      }
      balas(response, hasil, 201);
    }
  },
  {
    method: 'DELETE',
    pattern: pola(`\\/api\\/students\\/${ID}\\/dokumen\\/${ID}`),
    permission: 'students.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentProfileService.archiveDocument(params[0], params[1], actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.STUDENT_DOCUMENT_CHANGED, actor, ip, entityType: 'student', entityId: params[0], metadata: { change: 'diarsipkan' } });
      }
      balas(response, hasil);
    }
  }
];
