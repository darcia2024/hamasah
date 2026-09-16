const identity = require('../identity-service.js');
const { csv, json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

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
    async handler({ response, services, auth, readBody, ip }) {
      const created = await services.studentPortalService.createStudent(await readBody(), await auth.actor());
      if (created.ok) {
        await services.auditService.record({
          action: ACTIONS.STUDENT_CREATED, actor: await auth.actor(), ip,
          entityType: 'student', entityId: created.value.id, metadata: { name: created.value.name, program: created.value.program }
        });
      }
      json(response, created.ok ? 201 : 422, created.ok ? { student: created.value } : publicError(created));
    }
  },

  // Menghubungkan akun santri dan akun wali. Role akun diperiksa lebih dulu supaya
  // akun staf tidak bisa dipasang sebagai wali dan ikut melihat dashboard santri.
  {
    method: 'PATCH',
    pattern: /^\/api\/students\/([\w-]+)\/accounts$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
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
      if (linked.ok) {
        await services.auditService.record({
          action: ACTIONS.STUDENT_ACCOUNTS_LINKED, actor, ip,
          entityType: 'student', entityId: params[0],
          metadata: { studentAccountId: linked.value.studentAccountId, jumlahWali: linked.value.parentAccountIds.length }
        });
      }
      json(response, linked.ok ? 200 : (linked.status || 422), linked.ok ? { student: linked.value } : publicError(linked));
    }
  },

  // Penempatan asrama dan jenis santri. Dipisah dari /accounts karena ini soal
  // pembinaan, bukan soal akun.
  {
    method: 'PATCH',
    pattern: /^\/api\/students\/([\w-]+)\/placement$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const hasil = await services.studentPortalService.setPlacement(params[0], await readBody(), await auth.actor());
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.STUDENT_PLACEMENT_CHANGED, actor: await auth.actor(), ip,
          entityType: 'student', entityId: params[0],
          metadata: { gender: hasil.value.gender, dormitoryId: hasil.value.dormitoryId }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? { student: hasil.value } : publicError(hasil));
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
    async handler({ response, services, auth, params, ip }) {
      const report = await services.studentPortalService.dashboard(params[0], await auth.actor());
      if (!report.ok) {
        json(response, 403, publicError(report));
        return;
      }
      // Ekspor data santri ke berkas dicatat, karena inilah cara data keluar dari sistem.
      await services.auditService.record({
        action: ACTIONS.STUDENT_REPORT_EXPORTED, actor: await auth.actor(), ip,
        entityType: 'student', entityId: params[0]
      });
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
      json(response, result.ok ? 201 : (result.status || 422), result.ok ? { item: result.value } : publicError(result));
    }
  }
];
