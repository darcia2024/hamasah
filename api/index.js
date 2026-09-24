// Titik masuk untuk platform serverless (Vercel).
//
// Aplikasi ini aslinya satu server Node yang menyala terus. Di Vercel tidak ada
// proses yang hidup antar permintaan, jadi yang diekspor di sini bukan server,
// melainkan satu fungsi penangan permintaan. Aplikasi dirakit sekali per instance
// lalu dipakai ulang selama instance itu masih hangat.
//
// Yang WAJIB diketahui saat memakai jalur ini:
//   - Timer di dalam proses tidak pernah jalan. Pembersihan sesi, catatan audit,
//     unggahan tertunda, dan baris pembatas laju dikerjakan cron yang memanggil
//     POST /api/tasks/maintenance. Lihat vercel.json.
//   - Worker notifikasi juga tidak jalan. Kalau email diaktifkan, jalankan
//     `npm run worker:notifications` di tempat lain atau panggil lewat cron.
//   - Hitungan pembatas laju untuk kredensial disimpan di database (migrasi 041),
//     karena memori proses hilang setiap instance mati.

const path = require('node:path');
const { createHamasahApp } = require('../server/app.js');
const { appOptionsFromConfig, readProductionConfig } = require('../server/production-config.js');

let handlerPromise = null;

function buatHandler() {
  const config = readProductionConfig(process.env);
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    // Opsi yang sama persis dengan server.js, termasuk penyimpanan Supabase dan email.
    ...appOptionsFromConfig(config),
    trustProxy: true,
    // Timer tidak berguna di serverless: instance mati sebelum jadwal berikutnya.
    // Pekerjaannya dipanggil cron lewat POST /api/tasks/maintenance.
    auditRetention: false
  });
  return app.requestListener();
}

module.exports = async function handler(request, response) {
  if (!handlerPromise) {
    handlerPromise = Promise.resolve().then(buatHandler).catch((error) => {
      handlerPromise = null;
      throw error;
    });
  }
  const listener = await handlerPromise;
  return listener(request, response);
};
