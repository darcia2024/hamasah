const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Impor santri massal (student-import-service.js). Hanya admin. Audit mencatat jumlah baris dan
// hasilnya, tidak pernah isi data santri, email, atau tautan aktivasi.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/impor-santri$/,
    permission: 'students.import',
    async handler({ response, services, auth }) {
      balas(response, await services.studentImportService.list(await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/impor-santri\/pratinjau$/,
    permission: 'students.import',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentImportService.preview(await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.STUDENT_IMPORT_PREVIEWED, actor, ip, entityType: 'student-import', entityId: hasil.value.id, metadata: { rows: hasil.value.summary.total, problems: hasil.value.summary.problem, duplicates: hasil.value.summary.duplicate } });
      }
      balas(response, hasil, 201);
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/impor-santri\\/${ID}`),
    permission: 'students.import',
    async handler({ response, services, auth, params }) {
      balas(response, await services.studentImportService.detail(params[0], await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/impor-santri\\/${ID}\\/konfirmasi`),
    permission: 'students.import',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentImportService.commit(params[0], await readBody(), actor);
      if (hasil.ok && hasil.value.status === 'committed') {
        const s = hasil.value.summary;
        await services.auditService.record({ action: ACTIONS.STUDENT_IMPORT_COMMITTED, actor, ip, entityType: 'student-import', entityId: params[0], metadata: { created: s.created, failed: s.failed, skipped: s.skipped, invited: s.invitedAccounts } });
      }
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/impor-santri\\/${ID}\\/batal`),
    permission: 'students.import',
    async handler({ response, services, auth, params }) {
      balas(response, await services.studentImportService.cancel(params[0], await auth.actor()));
    }
  },
  // Perbaiki satu baris pada pratinjau: { values: { name, birthDate, ... } }. Seluruh batch diperiksa ulang.
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/impor-santri\\/${ID}\\/baris\\/(\\d+)`),
    permission: 'students.import',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.studentImportService.reviseRow(params[0], params[1], await readBody(), await auth.actor()));
    }
  },
  // Kirim ulang undangan yang belum terkirim, per potongan: { run, limit }. Tautan tidak dikembalikan.
  {
    method: 'POST',
    pattern: pola(`\\/api\\/impor-santri\\/${ID}\\/undangan-ulang`),
    permission: 'students.import',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentImportService.resendInvitations(params[0], await readBody(), actor);
      if (hasil.ok && hasil.value.sent) {
        await services.auditService.record({ action: ACTIONS.STUDENT_IMPORT_INVITATIONS_RESENT, actor, ip, entityType: 'student-import', entityId: params[0], metadata: { sent: hasil.value.sent, failed: hasil.value.failed } });
      }
      balas(response, hasil);
    }
  }
];