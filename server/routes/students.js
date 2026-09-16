const identity = require('../identity-service.js');
const { csv, json, publicError } = require('../http/respond.js');

const RECORD_METHODS = Object.freeze({
  activities: 'addActivity',
  achievements: 'addAchievement',
  attendance: 'addAttendance',
  evaluations: 'addEvaluation',
  violations: 'addViolation'
});

function reportRows(dashboard) {
  const rows = [
    ['Santri', dashboard.student.name],
    ['Program', dashboard.student.program],
    ['Kota', dashboard.student.city],
    ['Kehadiran', dashboard.attendance.rate === null ? '' : `${dashboard.attendance.rate}%`],
    [],
    ['Jenis', 'Tanggal', 'Judul atau catatan']
  ];
  dashboard.activities.forEach(function activity(entry) { rows.push(['Kegiatan', entry.occurredAt, entry.title]); });
  dashboard.achievements.forEach(function achievement(entry) { rows.push(['Achievement', entry.occurredAt, entry.title]); });
  dashboard.evaluations.forEach(function evaluation(entry) { rows.push(['Evaluasi', entry.occurredAt, entry.note]); });
  dashboard.discipline.forEach(function discipline(entry) { rows.push(['Disiplin', entry.occurredAt, entry.note]); });
  return rows;
}

module.exports = [
  // Daftar santri yang boleh dilihat pemanggil: staf melihat semua, wali dan santri
  // hanya miliknya sendiri. Penyaringannya ada di service.
  {
    method: 'GET',
    pattern: /^\/api\/my-students$/,
    permission: 'students.read',
    async handler({ response, services, auth }) {
      json(response, 200, { items: await services.studentPortalService.listForActor(await auth.actor()) });
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/students$/,
    permission: 'students.manage',
    async handler({ response, services, auth, readBody }) {
      const created = await services.studentPortalService.createStudent(await readBody(), await auth.actor());
      json(response, created.ok ? 201 : 422, created.ok ? { student: created.value } : publicError(created));
    }
  },

  // Menghubungkan akun santri dan akun wali. Role akun diperiksa lebih dulu supaya
  // akun staf tidak bisa dipasang sebagai wali dan ikut melihat dashboard santri.
  {
    method: 'PATCH',
    pattern: /^\/api\/students\/([\w-]+)\/accounts$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody }) {
      const actor = await auth.actor();
      const body = await readBody();
      if (body.studentAccountId) {
        const studentAccount = await services.accountStore.getById(body.studentAccountId);
        if (!studentAccount || studentAccount.role !== identity.ROLES.STUDENT) {
          json(response, 422, { error: 'Akun santri tidak valid.' });
          return;
        }
      }
      if (Array.isArray(body.parentAccountIds)) {
        const parentAccounts = await Promise.all(body.parentAccountIds.map((accountId) => services.accountStore.getById(accountId)));
        const parentsValid = parentAccounts.every((account) => account && account.role === identity.ROLES.PARENT);
        if (!parentsValid) {
          json(response, 422, { error: 'Relasi akun wali tidak valid.' });
          return;
        }
      }
      const linked = await services.studentPortalService.linkAccounts(params[0], body, actor);
      json(response, linked.ok ? 200 : 422, linked.ok ? { student: linked.value } : publicError(linked));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/dashboard$/,
    permission: 'students.read',
    async handler({ response, services, auth, params }) {
      const dashboard = await services.studentPortalService.dashboard(params[0], await auth.actor());
      json(response, dashboard.ok ? 200 : 403, dashboard.ok ? { dashboard: dashboard.value } : publicError(dashboard));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/report$/,
    permission: 'students.read',
    async handler({ response, services, auth, params }) {
      const report = await services.studentPortalService.dashboard(params[0], await auth.actor());
      if (!report.ok) {
        json(response, 403, publicError(report));
        return;
      }
      csv(response, { filename: `ringkasan-${report.value.student.id}.csv`, rows: reportRows(report.value) });
    }
  },

  // Nama method diambil dari peta konstanta, bukan langsung dari potongan URL.
  {
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/(activities|achievements|attendance|evaluations|violations)$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody }) {
      const method = RECORD_METHODS[params[1]];
      const result = await services.studentPortalService[method](params[0], await readBody(), await auth.actor());
      json(response, result.ok ? 201 : 422, result.ok ? { item: result.value } : publicError(result));
    }
  }
];
