const { json } = require('../http/respond.js');
const { getBearerToken, safeEqual } = require('../http/auth.js');

// Perawatan berkala untuk platform yang tidak menjalankan proses menyala terus.
//
// Di server biasa, pembersihan sesi kedaluwarsa, catatan audit lama, unggahan
// tertunda, dan baris pembatas laju dikerjakan timer di dalam proses. Di platform
// serverless timer itu tidak pernah jalan, jadi pekerjaannya dipanggil dari luar
// oleh penjadwal (cron) lewat rute ini.
//
// Rutenya tidak memakai sesi. Penjaganya satu kunci rahasia di environment
// (`MAINTENANCE_KEY`, atau `CRON_SECRET` yang dipasang Vercel). Tanpa kunci,
// rutenya tertutup untuk semua orang, bukan terbuka.
// Cron Vercel memanggil dengan GET, penjadwal lain biasanya POST. Keduanya diterima
// karena pekerjaannya sama dan sama-sama dijaga kunci yang sama.
async function handler({ request, response, services }) {
  const kunci = services.maintenanceService.secret();
  if (!kunci) {
    json(response, 503, { error: 'Perawatan terjadwal belum dikonfigurasi.' });
    return;
  }

  // Perbandingan waktu tetap, supaya lama respons tidak membocorkan kuncinya.
  if (!safeEqual(getBearerToken(request), kunci)) {
    json(response, 401, { error: 'Kunci perawatan tidak cocok.' });
    return;
  }

  const hasil = await services.maintenanceService.run();
  json(response, 200, { ok: true, dibersihkan: hasil });
}

const RUTE = {
  pattern: /^\/api\/tasks\/maintenance$/,
  rateLimit: { rule: 'api-default', identity: ({ ip }) => ip },
  handler
};

module.exports = [
  { method: 'POST', ...RUTE },
  { method: 'GET', ...RUTE }
];
