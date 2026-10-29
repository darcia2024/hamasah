const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Inventaris asrama yang diperluas (inventory-service.js). Audit mencatat aksi dan nama aset, tidak ada isi catatan.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  { method: 'GET', pattern: pola('\\/api\\/inventaris\\/asrama'), permission: 'inventory.manage', async handler({ response, services, auth }) { balas(response, await services.inventoryService.listDormitories(await auth.actor())); } },
  { method: 'GET', pattern: pola('\\/api\\/inventaris\\/dashboard'), permission: 'inventory.manage', async handler({ response, services, auth }) { balas(response, await services.inventoryService.dashboard(await auth.actor())); } },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/inventaris\\/asrama\\/${ID}\\/aset`),
    permission: 'inventory.manage',
    async handler({ response, services, auth, params, url }) {
      const q = url.searchParams;
      balas(response, await services.inventoryService.listItems(params[0], await auth.actor(), { q: q.get('q') || undefined, category: q.get('category') || undefined, condition: q.get('condition') || undefined }));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/inventaris\\/asrama\\/${ID}\\/aset`),
    permission: 'inventory.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.inventoryService.createItem(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.INVENTORY_ITEM_CHANGED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { change: 'dibuat', code: hasil.value.code } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/inventaris\\/asrama\\/${ID}\\/aset\\/${ID}`),
    permission: 'inventory.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.inventoryService.updateItem(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.INVENTORY_ITEM_CHANGED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { change: 'diubah', code: hasil.value.code } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola(`\\/api\\/inventaris\\/asrama\\/${ID}\\/aset\\/${ID}\\/riwayat`), permission: 'inventory.manage', async handler({ response, services, auth, params }) { balas(response, await services.inventoryService.listEvents(params[0], params[1], await auth.actor())); } },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/inventaris\\/asrama\\/${ID}\\/aset\\/${ID}\\/riwayat`),
    permission: 'inventory.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.inventoryService.addEvent(params[0], params[1], body, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.INVENTORY_EVENT_ADDED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { kind: body && body.kind } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/inventaris\\/asrama\\/${ID}\\/pemeriksaan`),
    permission: 'inventory.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.inventoryService.startCheck(params[0], body && body.month, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.INVENTORY_CHECK_STARTED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { month: hasil.value.month } });
      balas(response, hasil, 201);
    }
  },
  { method: 'GET', pattern: pola(`\\/api\\/inventaris\\/asrama\\/${ID}\\/pemeriksaan\\/(\\d{4}-\\d{2})`), permission: 'inventory.manage', async handler({ response, services, auth, params }) { balas(response, await services.inventoryService.getCheck(params[0], params[1], await auth.actor())); } },
  { method: 'PUT', pattern: pola(`\\/api\\/inventaris\\/pemeriksaan\\/${ID}`), permission: 'inventory.manage', async handler({ response, services, auth, params, readBody }) { balas(response, await services.inventoryService.saveCheck(params[0], await readBody(), await auth.actor())); } },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/inventaris\\/pemeriksaan\\/${ID}\\/selesai`),
    permission: 'inventory.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.inventoryService.completeCheck(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.INVENTORY_CHECK_COMPLETED, actor, ip, entityType: 'inventory-check', entityId: params[0], metadata: { month: hasil.value.month, adjusted: hasil.value.adjusted } });
      balas(response, hasil);
    }
  }
];
