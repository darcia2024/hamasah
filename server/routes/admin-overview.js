const { json, publicError } = require('../http/respond.js');

module.exports = [
  // Ringkasan santri, asrama, dan musyrif untuk dashboard super admin.
  {
    method: 'GET',
    pattern: /^\/api\/admin\/overview$/,
    permission: 'overview.read',
    async handler({ response, services, auth }) {
      const hasil = await services.adminOverviewService.overview(await auth.actor());
      json(response, hasil.ok ? 200 : (hasil.status || 403), hasil.ok ? hasil.value : publicError(hasil));
    }
  },
  // Perkembangan santri di asrama yang dipegang musyrif, untuk beranda musyrif.
  {
    method: 'GET',
    pattern: /^\/api\/musyrif\/ringkasan$/,
    permission: 'overview.dormitory',
    async handler({ response, services, auth }) {
      const hasil = await services.adminOverviewService.dormitoryOverview(await auth.actor());
      if (hasil.ok) {
        // Kartu santri hanya meminta foto yang memang ada.
        const berfoto = await services.studentPhotoService.withPhoto(hasil.value.students.map((s) => s.id));
        hasil.value.students = hasil.value.students.map((s) => ({ ...s, hasPhoto: berfoto.has(String(s.id)) }));
      }
      json(response, hasil.ok ? 200 : (hasil.status || 403), hasil.ok ? hasil.value : publicError(hasil));
    }
  },
  // Cerita musyrif dipetakan AI menjadi usulan catatan santri (musyrif-story-service.js).
  // Tidak menyimpan apa pun; portal menyimpan lewat endpoint pencatatan setelah ditinjau.
  {
    method: 'POST',
    pattern: /^\/api\/musyrif\/cerita$/,
    permission: 'students.manage',
    rateLimit: { rule: 'ai-ask', identity: ({ ip }) => ip },
    async handler({ response, services, auth, readBody }) {
      const hasil = await services.musyrifStoryService.map(await readBody(), await auth.actor());
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },
  // Apakah cerita AI aktif di server ini, supaya portal bisa menyembunyikan atau
  // menjelaskan kotak cerita.
  {
    method: 'GET',
    pattern: /^\/api\/musyrif\/cerita\/status$/,
    permission: 'students.manage',
    async handler({ response, services }) {
      json(response, 200, { active: services.musyrifStoryService.aktif() });
    }
  }
];
