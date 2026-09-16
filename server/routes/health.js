const { json } = require('../http/respond.js');

module.exports = [
  // Liveness: hanya memastikan proses masih melayani permintaan. Tidak menyentuh database,
  // supaya gangguan database tidak membuat platform terus menghidupkan ulang container.
  {
    method: 'GET',
    pattern: /^\/api\/health$/,
    handler({ response }) {
      json(response, 200, { ok: true, service: 'hamasah-api' });
    }
  },

  // Readiness: memastikan database dapat dihubungi. Detail error tidak ditampilkan.
  {
    method: 'GET',
    pattern: /^\/api\/ready$/,
    async handler({ response, services }) {
      const ready = await services.checkDatabaseReady();
      json(response, ready.ok ? 200 : 503, ready);
    }
  }
];
