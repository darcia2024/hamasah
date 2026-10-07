const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');
const { BLOK, ISIAN_EMAIL, JENIS_DOKUMEN, LABEL_BLOK } = require('../templates.js');

const POLA_BLOK = BLOK.join('|');

// Halaman Template super admin (template.html), ditambah dua bacaan untuk pemakai template:
// petugas pendaftaran (pesan WhatsApp) dan pendaftar di halaman Cek status (daftar dokumen).
// Lihat server/templates.js dan server/template-service.js.
module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/admin\/templates$/,
    permission: 'templates.manage',
    async handler({ response, services }) {
      json(response, 200, {
        ...await services.templateService.semua(),
        blok: BLOK.map((kunci) => ({ kunci, label: LABEL_BLOK[kunci] })),
        isianEmail: ISIAN_EMAIL
      });
    }
  },

  {
    method: 'PUT',
    pattern: new RegExp(`^/api/admin/templates/(${POLA_BLOK})$`),
    permission: 'templates.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.templateService.simpan(params[0], body && body.nilai, actor);
      if (hasil.ok && hasil.value.berubah) {
        await services.auditService.record({
          action: ACTIONS.TEMPLATE_UPDATED, actor, ip,
          entityType: 'template', entityId: params[0],
          metadata: { bagian: LABEL_BLOK[params[0]] }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'DELETE',
    pattern: new RegExp(`^/api/admin/templates/(${POLA_BLOK})$`),
    permission: 'templates.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.templateService.kembalikan(params[0], actor);
      if (hasil.ok && hasil.value.berubah) {
        await services.auditService.record({
          action: ACTIONS.TEMPLATE_RESET, actor, ip,
          entityType: 'template', entityId: params[0],
          metadata: { bagian: LABEL_BLOK[params[0]] }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  // Template pesan WhatsApp dan nama dokumen untuk tombol "Kabari lewat WhatsApp" petugas.
  {
    method: 'GET',
    pattern: /^\/api\/templates\/whatsapp$/,
    permission: 'registrations.read',
    async handler({ response, services }) {
      const [whatsapp, dokumen] = await Promise.all([services.templateService.ambil('whatsapp'), services.templateService.ambil('dokumen')]);
      json(response, 200, { whatsapp, dokumen });
    }
  },

  // Daftar jenis dokumen untuk pendaftar (halaman Cek status). Tanpa login: isinya hanya
  // nama dan keterangan dokumen, sama seperti yang sudah tertulis di halaman publik.
  {
    method: 'GET',
    pattern: /^\/api\/templates\/documents$/,
    async handler({ response, services }) {
      const dokumen = await services.templateService.ambil('dokumen');
      json(response, 200, { items: JENIS_DOKUMEN.map((type) => ({ type, ...dokumen[type] })) });
    }
  }
];
