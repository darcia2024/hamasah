const { json, publicError } = require('../http/respond.js');
const { readRawBody } = require('../http/body.js');
const { ACTIONS } = require('../audit-service.js');

// Berkas tidak pernah ditampilkan langsung di dalam halaman, selalu diunduh.
// Tanpa ini, berkas HTML atau SVG yang lolos pemeriksaan bisa dijalankan sebagai
// halaman di origin yang sama dan ikut membawa sesi pengguna.
const DOWNLOAD_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
});

module.exports = [
  // Langkah 1: meminta tempat unggah. Izin dan aturan ukuran diperiksa di sini,
  // sebelum satu byte pun isi berkas diterima.
  {
    method: 'POST',
    pattern: /^\/api\/uploads$/,
    // Sengaja tidak mensyaratkan sesi. Calon santri belum punya akun; yang
    // dipegangnya hanya token pendaftaran. Yang memutuskan boleh atau tidak adalah
    // aturan per tujuan di upload-policies.js, bukan ada tidaknya sesi.
    async handler({ response, services, auth, readBody }) {
      const actor = await auth.actor();
      const hasil = await services.fileService.createUpload(await readBody(), { actor, auth });
      if (!hasil.ok) {
        json(response, hasil.status || 422, publicError(hasil));
        return;
      }
      json(response, 201, {
        upload: {
          id: hasil.value.id,
          purpose: hasil.value.purpose,
          entityId: hasil.value.entityId,
          originalName: hasil.value.originalName,
          contentType: hasil.value.contentType,
          status: hasil.value.status
        }
      });
    }
  },

  // Langkah 2: mengirim isi berkas sebagai byte mentah.
  {
    method: 'PUT',
    pattern: /^\/api\/uploads\/([\w-]+)\/content$/,
    rateLimit: { rule: 'upload', identity: ({ ip }) => ip },
    async handler({ request, response, services, auth, params, ip }) {
      const actor = await auth.actor();
      // Izin dan batas ukuran diperiksa lebih dulu, baru isinya dibaca. Urutan ini
      // yang membuat kiriman raksasa dari pihak tak berhak diputus sejak awal,
      // bukan ditampung penuh dulu baru ditolak.
      const izin = await services.fileService.beginContent(params[0], { actor, auth });
      if (!izin.ok) {
        json(response, izin.status || 422, publicError(izin));
        return;
      }
      const buffer = await readRawBody(request, izin.value.maxBytes);
      const hasil = await services.fileService.saveContent(params[0], buffer, { actor, auth });
      if (!hasil.ok) {
        json(response, hasil.status || 422, publicError(hasil));
        return;
      }
      await services.auditService.record({
        action: ACTIONS.FILE_UPLOADED, actor, ip,
        entityType: hasil.value.entityType, entityId: hasil.value.entityId,
        metadata: { fileId: hasil.value.id, purpose: hasil.value.purpose, ukuran: hasil.value.sizeBytes }
      });
      json(response, 200, { file: { id: hasil.value.id, status: hasil.value.status, sha256: hasil.value.sha256 } });
    }
  },

  // Langkah 3: mengunduh. Setiap unduhan dicatat, karena inilah cara dokumen
  // pribadi keluar dari sistem.
  {
    method: 'GET',
    pattern: /^\/api\/files\/([\w-]+)$/,
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.fileService.prepareDownload(params[0], { actor, auth });
      if (!hasil.ok) {
        json(response, hasil.status || 404, publicError(hasil));
        return;
      }
      const { record, signedUrl, content } = hasil.value;

      await services.auditService.record({
        action: ACTIONS.FILE_DOWNLOADED, actor, ip,
        entityType: record.entityType, entityId: record.entityId,
        metadata: { fileId: record.id, purpose: record.purpose }
      });

      if (signedUrl) {
        // Tautan bertanda tangan berlaku 60 detik. Yang dikirim ke pemanggil hanya
        // pengalihan, bukan isi berkasnya, sehingga aplikasi tidak ikut menyalurkan data.
        response.writeHead(302, { ...DOWNLOAD_HEADERS, Location: signedUrl });
        response.end();
        return;
      }

      response.writeHead(200, {
        ...DOWNLOAD_HEADERS,
        'Content-Type': record.contentType,
        'Content-Length': String(content.length),
        'Content-Disposition': `attachment; filename="${record.originalName}"`
      });
      response.end(content);
    }
  }
];
