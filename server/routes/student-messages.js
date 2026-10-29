const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Pesan personal musyrif ke santri dan pengaturan catatan yang boleh dilihat santri
// (student-message-service.js). Audit tidak mencatat isi pesan, hanya siapa dan jenisnya.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  {
    method: 'GET',
    pattern: pola(`\\/api\\/students\\/${ID}\\/pesan`),
    permission: 'personal-messages.read',
    async handler({ response, services, auth, params }) {
      balas(response, await services.studentMessageService.list(params[0], await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/students\\/${ID}\\/pesan`),
    permission: 'personal-messages.send',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentMessageService.send(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.PERSONAL_MESSAGE_SENT, actor, ip, entityType: 'student', entityId: params[0], metadata: { kind: hasil.value.kind } });
      }
      balas(response, hasil, 201);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pesan\\/${ID}\\/dibaca`),
    permission: 'personal-messages.ack',
    async handler({ response, services, auth, params }) {
      balas(response, await services.studentMessageService.markRead(params[0], await auth.actor()));
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/pesan\\/${ID}\\/bagikan`),
    permission: 'personal-messages.send',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentMessageService.share(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.PERSONAL_MESSAGE_SHARED, actor, ip, entityType: 'personal-message', entityId: params[0], metadata: { shared: hasil.value.sharedWithParent } });
      }
      balas(response, hasil);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/students\\/${ID}\\/catatan\\/(evaluations|violations)\\/${ID}\\/visibilitas`),
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentMessageService.setNoteVisibility(params[0], params[1], params[2], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({ action: ACTIONS.NOTE_VISIBILITY_CHANGED, actor, ip, entityType: 'student', entityId: params[0], metadata: { collection: params[1], studentVisible: hasil.value.studentVisible } });
      }
      balas(response, hasil);
    }
  }
];
