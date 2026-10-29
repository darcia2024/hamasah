const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// LMS program, jenjang, dan sesi belajar bersama (lms-program-service.js). Audit mencatat aksi dan id, bukan isi.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  { method: 'GET', pattern: pola('\\/api\\/lms\\/katalog'), permission: 'courses.manage', async handler({ response, services, auth }) { balas(response, await services.lmsProgramService.staffCatalog(await auth.actor())); } },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/courses\\/${ID}\\/cakupan`),
    permission: 'courses.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.lmsProgramService.setScope(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LMS_SCOPE_CHANGED, actor, ip, entityType: 'course', entityId: params[0], metadata: { autoAccess: hasil.value.autoAccess, added: hasil.value.added, removed: hasil.value.removed } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/courses\\/${ID}\\/sinkron`),
    permission: 'courses.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.lmsProgramService.syncCourse(params[0], actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LMS_SCOPE_CHANGED, actor, ip, entityType: 'course', entityId: params[0], metadata: { sync: true, added: hasil.value.added, removed: hasil.value.removed } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola(`\\/api\\/students\\/${ID}\\/katalog-belajar`), permission: 'courses.read', async handler({ response, services, auth, params }) { balas(response, await services.lmsProgramService.studentCatalog(params[0], await auth.actor())); } },
  {
    method: 'GET',
    pattern: pola('\\/api\\/lms\\/sesi'),
    permission: 'courses.manage',
    async handler({ response, services, auth, url }) {
      const q = url.searchParams;
      balas(response, await services.lmsProgramService.listSessions(await auth.actor(), { courseId: q.get('courseId') || undefined, from: q.get('from') || undefined, to: q.get('to') || undefined }));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/courses\\/${ID}\\/sesi`),
    permission: 'courses.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.lmsProgramService.createSession(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LMS_SESSION_CREATED, actor, ip, entityType: 'course', entityId: params[0], metadata: { sessionId: hasil.value.id } });
      balas(response, hasil, 201);
    }
  },
  { method: 'GET', pattern: pola(`\\/api\\/lms\\/sesi\\/${ID}`), permission: 'courses.manage', async handler({ response, services, auth, params }) { balas(response, await services.lmsProgramService.getSession(params[0], await auth.actor())); } },
  {
    method: 'PUT',
    pattern: pola(`\\/api\\/lms\\/sesi\\/${ID}\\/kehadiran`),
    permission: 'courses.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.lmsProgramService.saveAttendance(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LMS_ATTENDANCE_SAVED, actor, ip, entityType: 'course-session', entityId: params[0], metadata: { count: hasil.value.saved } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola(`\\/api\\/courses\\/${ID}\\/kehadiran`), permission: 'courses.manage', async handler({ response, services, auth, params }) { balas(response, await services.lmsProgramService.attendanceSummary(params[0], await auth.actor())); } }
];
