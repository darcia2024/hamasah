const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Absensi kegiatan (activity-attendance-service.js). Audit hanya mencatat jenis aksi dan jumlah, tidak pernah
// daftar nama santri.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  {
    method: 'GET',
    pattern: pola('\\/api\\/kegiatan\\/jenis'),
    permission: 'attendance.manage',
    async handler({ response, services, auth }) {
      balas(response, await services.activityAttendanceService.listTypes(await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/kegiatan\\/jenis'),
    permission: 'activities.admin',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.activityAttendanceService.createType(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.ACTIVITY_TYPE_CHANGED, actor, ip, entityType: 'activity-type', entityId: hasil.value.id, metadata: { change: 'dibuat' } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/kegiatan\\/jenis\\/${ID}`),
    permission: 'activities.admin',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.activityAttendanceService.updateType(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.ACTIVITY_TYPE_CHANGED, actor, ip, entityType: 'activity-type', entityId: params[0], metadata: { change: 'diubah' } });
      balas(response, hasil);
    }
  },
  {
    method: 'GET',
    pattern: pola('\\/api\\/kegiatan\\/sesi'),
    permission: 'attendance.manage',
    async handler({ response, services, auth, url }) {
      balas(response, await services.activityAttendanceService.listSessions(await auth.actor(), {
        from: url.searchParams.get('from') || undefined, to: url.searchParams.get('to') || undefined, dormitoryId: url.searchParams.get('dormitoryId') || undefined
      }));
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/kegiatan\\/sesi'),
    permission: 'attendance.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.activityAttendanceService.createSession(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.ACTIVITY_SESSION_CREATED, actor, ip, entityType: 'activity-session', entityId: hasil.value.id, metadata: { type: hasil.value.typeName, date: hasil.value.date } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/kegiatan\\/sesi\\/${ID}`),
    permission: 'attendance.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.activityAttendanceService.roster(params[0], await auth.actor()));
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/kegiatan\\/sesi\\/${ID}`),
    permission: 'attendance.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.activityAttendanceService.setSessionStatus(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.ACTIVITY_SESSION_STATUS, actor, ip, entityType: 'activity-session', entityId: params[0], metadata: { status: hasil.value.status } });
      balas(response, hasil);
    }
  },
  {
    method: 'PUT',
    pattern: pola(`\\/api\\/kegiatan\\/sesi\\/${ID}\\/absensi`),
    permission: 'attendance.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.activityAttendanceService.saveAttendance(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.ACTIVITY_ATTENDANCE_SAVED, actor, ip, entityType: 'activity-session', entityId: params[0], metadata: { recorded: hasil.value.recorded, corrected: hasil.value.corrected } });
      balas(response, hasil);
    }
  },
  {
    method: 'GET',
    pattern: pola('\\/api\\/kegiatan\\/rekap'),
    permission: 'attendance.manage',
    async handler({ response, services, auth, url }) {
      balas(response, await services.activityAttendanceService.recap(await auth.actor(), {
        by: url.searchParams.get('by') || 'santri', period: url.searchParams.get('period') || 'bulan',
        value: url.searchParams.get('value') || undefined, dormitoryId: url.searchParams.get('dormitoryId') || undefined
      }));
    }
  }
];
