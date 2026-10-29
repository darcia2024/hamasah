const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Asisten Operasional Hamasah (ops-assistant-service.js). Hanya membaca dan menyusun teks; tidak pernah mengubah data.
function balas(response, hasil) {
  json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/asisten-operasional$/,
    permission: 'assistant-ops.use',
    async handler({ response, services, auth }) {
      balas(response, await services.opsAssistantService.pilihan(await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/asisten-operasional\/([\w-]+)$/,
    permission: 'assistant-ops.use',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.opsAssistantService.run(params[0], await readBody(), actor);
      // Jejak audit mencatat jenis tugas dan mode (lokal atau AI), bukan isi pertanyaan atau jawaban.
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.OPS_ASSISTANT_USED, actor, ip, entityType: 'assistant', entityId: params[0], metadata: { mode: hasil.value.mode } });
      balas(response, hasil);
    }
  }
];
