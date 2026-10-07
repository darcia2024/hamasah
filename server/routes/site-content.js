const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');
const { BLOK, FOTO_TESTIMONI, HALAMAN_BLOK, LABEL_BLOK, formatWhatsapp } = require('../site-content.js');

const POLA_BLOK = BLOK.join('|');

// Halaman Konten Website super admin. Lihat server/site-content.js dan
// server/site-content-service.js.
module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/admin\/content$/,
    permission: 'content.manage',
    async handler({ response, services }) {
      const konten = await services.siteContentService.semua();
      json(response, 200, {
        ...konten,
        blok: BLOK.map((kunci) => ({ kunci, label: LABEL_BLOK[kunci], halaman: HALAMAN_BLOK[kunci] })),
        fotoTestimoni: FOTO_TESTIMONI.map(({ berkas, label }) => ({ berkas, label })),
        whatsappTampil: formatWhatsapp(konten.nilai.kontak.whatsapp)
      });
    }
  },

  {
    method: 'PUT',
    pattern: new RegExp(`^/api/admin/content/(${POLA_BLOK})$`),
    permission: 'content.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      // Foto galeri unggahan harus benar-benar ada dan siap, bukan id karangan.
      if (params[0] === 'galeri' && body && Array.isArray(body.nilai)) {
        for (const [i, item] of body.nilai.entries()) {
          const cocok = /^unggah\/([0-9a-f-]{36})\.(?:jpg|png|webp)$/.exec(String((item && item.foto) || ''));
          if (cocok && !(await services.fileService.isReady(cocok[1], 'gallery-photo'))) {
            const pesan = `Foto ke-${i + 1} tidak ditemukan. Unggah ulang fotonya.`;
            json(response, 422, { error: pesan, errors: { [`${i}.foto`]: pesan } });
            return;
          }
        }
      }
      const hasil = await services.siteContentService.simpan(params[0], body && body.nilai, actor);
      if (hasil.ok && hasil.value.berubah) {
        await services.auditService.record({
          action: ACTIONS.SITE_CONTENT_UPDATED, actor, ip,
          entityType: 'site-content', entityId: params[0],
          metadata: { bagian: LABEL_BLOK[params[0]] }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'DELETE',
    pattern: new RegExp(`^/api/admin/content/(${POLA_BLOK})$`),
    permission: 'content.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.siteContentService.kembalikan(params[0], actor);
      if (hasil.ok && hasil.value.berubah) {
        await services.auditService.record({
          action: ACTIONS.SITE_CONTENT_RESET, actor, ip,
          entityType: 'site-content', entityId: params[0],
          metadata: { bagian: LABEL_BLOK[params[0]] }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  }
];
