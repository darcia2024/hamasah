const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Buku setoran tahfidz (tahfidz-service.js). Audit mencatat jenis aksi dan surat, tidak ada isi catatan.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  {
    method: 'GET',
    pattern: pola(`\\/api\\/students\\/${ID}\\/setoran`),
    permission: 'tahfidz.read',
    async handler({ response, services, auth, params, url }) {
      balas(response, await services.tahfidzService.overview(params[0], await auth.actor(), { month: url.searchParams.get('month') || undefined }));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/students\\/${ID}\\/setoran`),
    permission: 'tahfidz.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.tahfidzService.addEntry(params[0], body, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.TAHFIDZ_ENTRY_ADDED, actor, ip, entityType: 'student', entityId: params[0], metadata: { kind: body.kind, surah: body.surah } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/students\\/${ID}\\/setoran\\/${ID}\\/batal`),
    permission: 'tahfidz.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.tahfidzService.voidEntry(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.TAHFIDZ_ENTRY_VOIDED, actor, ip, entityType: 'student', entityId: params[0], metadata: { entryId: params[1] } });
      balas(response, hasil);
    }
  }
];
