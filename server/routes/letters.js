const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Surat masuk, surat keluar, dan arsip (letter-archive-service.js). Audit mencatat nomor surat dan aksi, tidak ada isinya.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  {
    method: 'GET',
    pattern: pola('\\/api\\/surat\\/jenis'),
    permission: 'letters.manage',
    async handler({ response, services, auth }) {
      balas(response, await services.letterArchiveService.listTypes(await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/surat\\/jenis'),
    permission: 'letters.admin',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.createType(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LETTER_TYPE_CHANGED, actor, ip, entityType: 'letter-type', entityId: hasil.value.id, metadata: { change: 'dibuat' } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/surat\\/jenis\\/konfirmasi'),
    permission: 'letters.admin',
    async handler({ response, services, auth, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.confirmTypes(actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LETTER_TYPE_CHANGED, actor, ip, entityType: 'letter-type', entityId: 'semua', metadata: { change: 'dikonfirmasi', count: hasil.value.confirmed } });
      balas(response, hasil);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/surat\\/jenis\\/${ID}`),
    permission: 'letters.admin',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.updateType(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LETTER_TYPE_CHANGED, actor, ip, entityType: 'letter-type', entityId: params[0], metadata: { change: 'diubah' } });
      balas(response, hasil);
    }
  },
  {
    method: 'GET',
    pattern: pola('\\/api\\/surat\\/santri'),
    permission: 'letters.manage',
    async handler({ response, services, auth }) {
      balas(response, await services.letterArchiveService.santriPilihan(await auth.actor()));
    }
  },
  {
    method: 'GET',
    pattern: pola('\\/api\\/surat'),
    permission: 'letters.manage',
    async handler({ response, services, auth, url }) {
      balas(response, await services.letterArchiveService.list(await auth.actor(), { status: url.searchParams.get('status') || undefined, typeId: url.searchParams.get('typeId') || undefined, q: url.searchParams.get('q') || undefined }));
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/surat'),
    permission: 'letters.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.create(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LETTER_CREATED, actor, ip, entityType: 'letter', entityId: hasil.value.id, metadata: { referenceNo: hasil.value.referenceNo } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/surat\\/${ID}\\/arsip\\.pdf`),
    permission: 'letters.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.archivePdf(params[0], actor);
      if (!hasil.ok) { balas(response, hasil); return; }
      await services.auditService.record({ action: ACTIONS.LETTER_ARCHIVE_DOWNLOADED, actor, ip, entityType: 'letter', entityId: params[0], metadata: {} });
      response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${hasil.value.fileName}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(hasil.value.buffer);
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/surat\\/${ID}`),
    permission: 'letters.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.letterArchiveService.detail(params[0], await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/surat\\/${ID}\\/verifikasi`),
    permission: 'letters.verify',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.verify(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LETTER_VERIFIED, actor, ip, entityType: 'letter', entityId: params[0], metadata: { referenceNo: hasil.value.referenceNo } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/surat\\/${ID}\\/putusan`),
    permission: 'letters.admin',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.decide(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LETTER_DECIDED, actor, ip, entityType: 'letter', entityId: params[0], metadata: { referenceNo: hasil.value.referenceNo, status: hasil.value.status } });
      balas(response, hasil);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/surat\\/${ID}\\/daftar-keluar\\/${ID}`),
    permission: 'letters.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.setChecklist(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LETTER_EXIT_CHECKED, actor, ip, entityType: 'letter', entityId: params[0], metadata: { kind: params[1], status: hasil.value.status } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/surat\\/${ID}\\/proses-keluar`),
    permission: 'letters.admin',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.letterArchiveService.completeExit(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.LETTER_EXIT_COMPLETED, actor, ip, entityType: 'student', entityId: hasil.value.studentId, metadata: { referenceNo: hasil.value.referenceNo } });
      balas(response, hasil);
    }
  }
];
