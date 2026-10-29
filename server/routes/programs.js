const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Lokasi operasional, program pembinaan, dan batch (program-service.js). Batch bukan asrama.
// Petugas hanya menyentuh lokasi yang ditugaskan kepadanya; admin semuanya. Audit mencatat id dan
// perubahan statusnya, bukan catatan bebas.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

async function catat(services, actor, ip, action, entityType, entityId, metadata) {
  await services.auditService.record({ action, actor, ip, entityType, entityId, metadata });
}

// Akses maddah LMS mengikuti keanggotaan program: setiap perubahan peserta batch langsung diselaraskan, tidak menunggu santri membuka katalog.
// Kegagalan di sini tidak boleh menggagalkan perubahan peserta (katalog santri tetap menyelaraskan saat dibuka).
async function selaraskanLms(services, studentIds) {
  if (!services.lmsProgramService) return;
  for (const id of studentIds.slice(0, 200)) {
    try { await services.lmsProgramService.sinkronSantri(String(id)); } catch { /* ditunda sampai katalog dibuka */ }
  }
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/pembinaan\/lokasi$/,
    permission: 'programs.manage',
    async handler({ response, services, auth }) {
      balas(response, await services.programService.listLocations(await auth.actor()));
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/pembinaan\\/lokasi\\/${ID}`),
    permission: 'programs.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.programService.report(params[0], await auth.actor()));
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/pembinaan\/petugas$/,
    permission: 'programs.admin',
    async handler({ response, services, auth }) {
      balas(response, await services.programService.staffCandidates(await auth.actor()));
    }
  },
  {
    method: 'PUT',
    pattern: pola(`\\/api\\/pembinaan\\/lokasi\\/${ID}\\/petugas`),
    permission: 'programs.admin',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.programService.setStaff(params[0], await readBody(), actor);
      if (hasil.ok) await catat(services, actor, ip, ACTIONS.LOCATION_STAFF_CHANGED, 'location', params[0], { accountId: hasil.value.accountId, assigned: hasil.value.assigned });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pembinaan\\/lokasi\\/${ID}\\/program`),
    permission: 'programs.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.programService.createProgram(params[0], await readBody(), actor);
      if (hasil.ok) await catat(services, actor, ip, ACTIONS.PROGRAM_SAVED, 'program', hasil.value.id, { change: 'dibuat' });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/pembinaan\\/program\\/${ID}`),
    permission: 'programs.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.programService.updateProgram(params[0], await readBody(), actor);
      if (hasil.ok) await catat(services, actor, ip, ACTIONS.PROGRAM_SAVED, 'program', params[0], { change: 'diubah' });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pembinaan\\/program\\/${ID}\\/batch`),
    permission: 'programs.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.programService.createBatch(params[0], await readBody(), actor);
      if (hasil.ok) await catat(services, actor, ip, ACTIONS.BATCH_SAVED, 'batch', hasil.value.id, { change: 'dibuat' });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/pembinaan\\/batch\\/${ID}`),
    permission: 'programs.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.programService.batchDetail(params[0], await auth.actor()));
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/pembinaan\\/batch\\/${ID}`),
    permission: 'programs.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.programService.updateBatch(params[0], await readBody(), actor);
      if (hasil.ok) await catat(services, actor, ip, ACTIONS.BATCH_SAVED, 'batch', params[0], { change: 'diubah', from: hasil.value.previousStatus, to: hasil.value.status });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pembinaan\\/batch\\/${ID}\\/peserta`),
    permission: 'programs.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.programService.addParticipants(params[0], body, actor);
      if (hasil.ok) await selaraskanLms(services, Array.isArray(body && body.studentIds) ? body.studentIds : []);
      if (hasil.ok) await catat(services, actor, ip, ACTIONS.BATCH_PARTICIPANTS_CHANGED, 'batch', params[0], { added: hasil.value.added });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/pembinaan\\/batch\\/${ID}\\/peserta\\/${ID}`),
    permission: 'programs.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.programService.setParticipant(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await catat(services, actor, ip, ACTIONS.BATCH_PARTICIPANTS_CHANGED, 'batch', params[0], { studentId: params[1], status: hasil.value.status });
      if (hasil.ok) await selaraskanLms(services, [params[1]]);
      balas(response, hasil);
    }
  },

  // Riwayat pembinaan satu santri lintas lokasi: batch yang diikuti dan penempatan asrama.
  {
    method: 'GET',
    pattern: pola(`\\/api\\/students\\/${ID}\\/riwayat-pembinaan`),
    permission: 'programs.history',
    async handler({ response, services, auth, params }) {
      balas(response, await services.programService.studentHistory(params[0], await auth.actor()));
    }
  }
];
