const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');
const { STATUSES } = require('../postgres-inquiry-store.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/inquiries$/,
    // Formulir publik tanpa sesi, jadi batasnya per IP. Aturannya terpisah dari
    // `registration-create` karena konsekuensinya berbeda: pendaftaran membuat
    // nomor registrasi, pesan konsultasi hanya menambah antrean tindak lanjut.
    rateLimit: { rule: 'inquiry-create', identity: ({ ip }) => ip },
    async handler({ response, services, readBody, ip }) {
      const created = await services.inquiryStore.create(await readBody());
      if (!created.ok) {
        json(response, 422, { error: created.error, field: created.field || null });
        return;
      }
      // Nama, nomor, dan isi pesan sengaja tidak masuk metadata audit: nomor dan
      // isi pesan termasuk kunci terlarang di audit-service.
      await services.auditService.record({
        action: ACTIONS.INQUIRY_RECEIVED, ip,
        entityType: 'inquiry', entityId: created.value.id,
        metadata: { topic: created.value.topic }
      });
      json(response, 201, { item: { id: created.value.id, createdAt: created.value.createdAt } });
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/inquiries$/,
    permission: 'inquiries.read',
    async handler({ response, services, url }) {
      const q = url.searchParams;
      json(response, 200, {
        ...(await services.inquiryStore.list({
          status: q.get('status') || undefined,
          page: q.get('page') || undefined,
          pageSize: q.get('pageSize') || undefined
        })),
        statuses: STATUSES
      });
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/inquiries\/([\w-]+)\/status$/,
    permission: 'inquiries.manage',
    async handler({ response, services, params, readBody, auth, ip }) {
      const body = await readBody();
      const actor = await auth.actor();
      const updated = await services.inquiryStore.updateStatus(params[0], String(body.status || ''), actor.id);
      if (!updated.ok) {
        json(response, updated.status || 422, publicError(updated));
        return;
      }
      await services.auditService.record({
        action: ACTIONS.INQUIRY_STATUS_CHANGED, ip, actor,
        entityType: 'inquiry', entityId: updated.value.id,
        metadata: { status: updated.value.status }
      });
      json(response, 200, { item: updated.value });
    }
  }
];
