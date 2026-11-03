const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');
const { BLOK, FOTO_TESTIMONI, HALAMAN_BLOK, LABEL_BLOK, formatWhatsapp } = require('../site-content.js');

const POLA_BLOK = BLOK.join('|');
const GALERI = 'galeri';

// Foto galeri unggahan harus benar-benar ada dan siap, bukan id karangan.
async function periksaFotoGaleri(response, services, body) {
  if (!body || !Array.isArray(body.nilai)) return true;
  for (const [i, item] of body.nilai.entries()) {
    const cocok = /^unggah\/([0-9a-f-]{36})\.(?:jpg|png|webp)$/.exec(String((item && item.foto) || ''));
    if (cocok && !(await services.fileService.isReady(cocok[1], 'gallery-photo'))) {
      const pesan = `Foto ke-${i + 1} tidak ditemukan. Unggah ulang fotonya.`;
      json(response, 422, { error: pesan, errors: { [`${i}.foto`]: pesan } });
      return false;
    }
  }
  return true;
}

async function simpanBlok({ response, services, auth, readBody, ip }, blok, bentuk = (value) => value) {
  const actor = await auth.actor();
  const body = await readBody();
  if (blok === GALERI && !(await periksaFotoGaleri(response, services, body))) return;
  const hasil = await services.siteContentService.simpan(blok, body && body.nilai, actor);
  if (hasil.ok && hasil.value.berubah) {
    await services.auditService.record({
      action: ACTIONS.SITE_CONTENT_UPDATED, actor, ip,
      entityType: 'site-content', entityId: blok,
      metadata: { bagian: LABEL_BLOK[blok] }
    });
  }
  json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? bentuk(hasil.value) : publicError(hasil));
}

async function kembalikanBlok({ response, services, auth, ip }, blok, bentuk = (value) => value) {
  const actor = await auth.actor();
  const hasil = await services.siteContentService.kembalikan(blok, actor);
  if (hasil.ok && hasil.value.berubah) {
    await services.auditService.record({
      action: ACTIONS.SITE_CONTENT_RESET, actor, ip,
      entityType: 'site-content', entityId: blok,
      metadata: { bagian: LABEL_BLOK[blok] }
    });
  }
  json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? bentuk(hasil.value) : publicError(hasil));
}

// Tim Media hanya menerima bagian galeri, bukan seluruh isian website.
function hanyaGaleri(isi) {
  return {
    nilai: { [GALERI]: isi.nilai[GALERI] },
    bawaan: { [GALERI]: isi.bawaan[GALERI] },
    tersimpan: { [GALERI]: isi.tersimpan[GALERI] },
    terakhir: isi.terakhir[GALERI] ? { [GALERI]: isi.terakhir[GALERI] } : {},
    tersedia: isi.tersedia
  };
}
const bentukGaleri = (value) => ({ ...value, isi: hanyaGaleri(value.isi) });

// Halaman Konten Website super admin. Lihat server/site-content.js dan
// server/site-content-service.js.
module.exports = [
  // Rubrik aktif untuk pilihan di editor artikel dan filter halaman Artikel (publik, tanpa data pribadi).
  {
    method: 'GET',
    pattern: /^\/api\/rubrik$/,
    async handler({ response, services }) {
      const konten = await services.siteContentService.semua();
      const items = ((konten.nilai && konten.nilai.rubrik) || []).filter((r) => r.aktif !== false).map((r) => ({ name: r.nama, label: r.label || r.nama, description: r.deskripsi || '' }));
      response.setHeader('Cache-Control', 'public, max-age=60');
      json(response, 200, { items });
    }
  },
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
    handler(konteks) {
      return simpanBlok(konteks, konteks.params[0]);
    }
  },

  {
    method: 'DELETE',
    pattern: new RegExp(`^/api/admin/content/(${POLA_BLOK})$`),
    permission: 'content.manage',
    handler(konteks) {
      return kembalikanBlok(konteks, konteks.params[0]);
    }
  },

  // Galeri beranda untuk Tim Media: dokumentasi kegiatan umum dan kelembagaan.
  {
    method: 'GET',
    pattern: /^\/api\/media\/konten$/,
    permission: 'gallery.manage',
    async handler({ response, services }) {
      const konten = await services.siteContentService.semua();
      json(response, 200, { ...hanyaGaleri(konten), blok: [{ kunci: GALERI, label: LABEL_BLOK[GALERI], halaman: HALAMAN_BLOK[GALERI] }] });
    }
  },
  {
    method: 'PUT',
    pattern: /^\/api\/media\/konten\/galeri$/,
    permission: 'gallery.manage',
    handler(konteks) {
      return simpanBlok(konteks, GALERI, bentukGaleri);
    }
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/media\/konten\/galeri$/,
    permission: 'gallery.manage',
    handler(konteks) {
      return kembalikanBlok(konteks, GALERI, bentukGaleri);
    }
  }
];
