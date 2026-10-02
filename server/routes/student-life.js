const { json, noContent, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Peta hafalan juz, pengumuman, dan pengajuan izin. Lihat server/student-life-service.js.
// Audit hanya mencatat id dan status, bukan isi pengumuman atau alasan izin.
function balas(response, hasil, sukses = 200, bungkus = (value) => value) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? bungkus(hasil.value) : publicError(hasil));
}

module.exports = [
  // ------------------------------------------------------------------ hafalan juz
  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/juz$/,
    permission: 'students.read',
    async handler({ response, services, auth, params }) {
      balas(response, await services.studentLifeService.juzMap(params[0], await auth.actor()));
    }
  },

  // Satu juz: { status: belum|sedang|hafal }. Musyrif asrama santri itu atau admin.
  {
    method: 'PUT',
    pattern: /^\/api\/students\/([\w-]+)\/juz\/(\d{1,2})$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.studentLifeService.setJuz(params[0], params[1], body && body.status, actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.STUDENT_JUZ_UPDATED, actor, ip,
          entityType: 'student', entityId: params[0],
          metadata: { juz: hasil.value.juz, status: hasil.value.status }
        });
      }
      balas(response, hasil);
    }
  },

  // ------------------------------------------------------------------- pengumuman
  // Untuk santri, wali, musyrif, dan admin: yang masih berlaku dan relevan bagi pembaca.
  {
    method: 'GET',
    pattern: /^\/api\/announcements$/,
    permission: 'students.read',
    async handler({ response, services, auth, url }) {
      balas(response, await services.studentLifeService.announcementsFor(await auth.actor(), { limit: url.searchParams.get('limit') }));
    }
  },

  // Asrama yang boleh dituju penulis pengumuman.
  {
    method: 'GET',
    pattern: /^\/api\/announcements\/asrama$/,
    permission: 'announcements.manage',
    async handler({ response, services, auth }) {
      balas(response, await services.studentLifeService.announcementTargets(await auth.actor()));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/announcements$/,
    permission: 'announcements.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentLifeService.createAnnouncement(await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.ANNOUNCEMENT_CREATED, actor, ip,
          entityType: 'announcement', entityId: hasil.value.id,
          metadata: { penerima: hasil.value.audience, asrama: hasil.value.dormitoryId || 'semua' }
        });
      }
      balas(response, hasil, 201, (value) => ({ announcement: value }));
    }
  },

  {
    method: 'DELETE',
    pattern: /^\/api\/announcements\/([\w-]+)$/,
    permission: 'announcements.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentLifeService.removeAnnouncement(params[0], actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.ANNOUNCEMENT_DELETED, actor, ip, entityType: 'announcement', entityId: params[0] });
        noContent(response);
        return;
      }
      balas(response, hasil);
    }
  },

  // ------------------------------------------------------------------------ izin
  // Riwayat izin satu santri: santri itu, walinya, musyrifnya, admin.
  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/leave$/,
    permission: 'students.read',
    async handler({ response, services, auth, params }) {
      balas(response, await services.studentLifeService.leavesOf(params[0], await auth.actor()));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/leave$/,
    permission: 'leave.request',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentLifeService.requestLeave(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.LEAVE_REQUESTED, actor, ip,
          entityType: 'leave', entityId: hasil.value.id,
          metadata: { studentId: params[0], jenis: hasil.value.kind }
        });
      }
      balas(response, hasil, 201, (value) => ({ leave: value }));
    }
  },

  // Antrean untuk musyrif dan admin (?status=menunggu|disetujui|ditolak|dibatalkan|semua).
  {
    method: 'GET',
    pattern: /^\/api\/leave$/,
    permission: 'leave.decide',
    async handler({ response, services, auth, url }) {
      balas(response, await services.studentLifeService.leaveQueue(await auth.actor(), url.searchParams.get('status')));
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/leave\/([\w-]+)$/,
    permission: 'leave.decide',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentLifeService.decideLeave(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.LEAVE_DECIDED, actor, ip,
          entityType: 'leave', entityId: params[0],
          metadata: { studentId: hasil.value.studentId, keputusan: hasil.value.status }
        });
      }
      balas(response, hasil, 200, (value) => ({ leave: value }));
    }
  },

  // Santri membatalkan pengajuannya sendiri selama belum diputuskan.
  {
    method: 'POST',
    pattern: /^\/api\/leave\/([\w-]+)\/batal$/,
    permission: 'leave.request',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentLifeService.cancelLeave(params[0], actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.LEAVE_CANCELLED, actor, ip,
          entityType: 'leave', entityId: params[0], metadata: { studentId: hasil.value.studentId }
        });
      }
      balas(response, hasil);
    }
  }
];
