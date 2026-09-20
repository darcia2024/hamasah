const crypto = require('node:crypto');
const { VISA_STATUSES } = require('./operations-service.js');

const ENTITIES = new Set(['inventory', 'visa']);
const IMPORT_ROLES = new Set(['admin', 'finance']);
const clean = (value) => String(value || '').trim();

function createMemoryOperationsImportStore() {
  const batches = new Map();
  return {
    async saveImportBatch(batch) { batches.set(batch.id, JSON.parse(JSON.stringify(batch))); return JSON.parse(JSON.stringify(batch)); },
    async getImportBatch(id) { const batch = batches.get(id); return batch ? JSON.parse(JSON.stringify(batch)) : null; },
    async updateImportBatch(id, patch) { const batch = batches.get(id); if (!batch) return null; batches.set(id, { ...batch, ...patch }); return JSON.parse(JSON.stringify(batches.get(id))); },
    async listImportBatches({ entity, status, limit = 20, offset = 0 } = {}) { const items = [...batches.values()].filter((batch) => (!entity || batch.entity === entity) && (!status || batch.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); return { items: JSON.parse(JSON.stringify(items.slice(offset, offset + limit))), total: items.length }; }
  };
}

function createOperationsImportService(options = {}) {
  const store = options.store;
  const importStore = options.importStore || createMemoryOperationsImportStore();
  const now = options.now || (() => new Date().toISOString());
  const inventoryWriter = options.inventoryWriter || (async () => null);
  const visaWriter = options.visaWriter || (async () => null);

  function allowed(actor) { return Boolean(actor && IMPORT_ROLES.has(actor.role)); }

  async function preview(input, actor) {
    if (!allowed(actor)) return { ok: false, error: 'Akses finance diperlukan.' };
    const source = input || {};
    const entity = clean(source.entity);
    const rows = Array.isArray(source.rows) ? source.rows : [];
    if (!ENTITIES.has(entity) || rows.length === 0 || rows.length > 1000) return { ok: false, error: 'Entity atau jumlah baris import belum valid.' };
    const errors = [];
    const seen = new Set();
    const existing = entity === 'inventory' ? await store.listInventory() : await store.listVisas();
    rows.forEach((raw, index) => {
      const row = raw && typeof raw === 'object' ? raw : {};
      const key = entity === 'inventory' ? `${clean(row.id) || 'new'}:${clean(row.name).toLocaleLowerCase('id-ID')}:${clean(row.location).toLocaleLowerCase('id-ID')}` : clean(row.studentId);
      if (seen.has(key)) errors.push({ row: index + 1, field: 'duplicate', message: 'Baris duplikat dalam batch.' });
      seen.add(key);
      if (entity === 'inventory') {
        const quantity = Number(row.quantity);
        if (clean(row.name).length < 2) errors.push({ row: index + 1, field: 'name', message: 'Nama barang wajib diisi.' });
        if (clean(row.location).length < 2) errors.push({ row: index + 1, field: 'location', message: 'Lokasi wajib diisi.' });
        if (!Number.isInteger(quantity) || quantity < 0) errors.push({ row: index + 1, field: 'quantity', message: 'Jumlah harus bilangan bulat minimal nol.' });
        if (existing.some((item) => (clean(row.id) && item.id === row.id) || (item.name.toLocaleLowerCase('id-ID') === clean(row.name).toLocaleLowerCase('id-ID') && item.location.toLocaleLowerCase('id-ID') === clean(row.location).toLocaleLowerCase('id-ID')))) errors.push({ row: index + 1, field: 'duplicate', message: 'Barang dengan id/nama dan lokasi tersebut sudah ada.' });
      } else {
        if (!clean(row.studentId)) errors.push({ row: index + 1, field: 'studentId', message: 'studentId wajib diisi.' });
        if (!VISA_STATUSES.includes(clean(row.status))) errors.push({ row: index + 1, field: 'status', message: 'Status visa tidak dikenal.' });
        for (const field of ['passportExpiresAt', 'visaExpiresAt']) if (row[field] && Number.isNaN(Date.parse(row[field]))) errors.push({ row: index + 1, field, message: 'Tanggal tidak valid.' });
      }
    });
    const batch = { id: crypto.randomUUID(), entity, status: 'previewed', rowCount: rows.length, validCount: rows.length - new Set(errors.map((error) => error.row)).size, errors, rows, actorAccountId: actor.id || null, createdAt: now(), committedAt: null, rolledBackAt: null };
    await importStore.saveImportBatch(batch);
    return { ok: true, value: batch };
  }

  async function commit(batchId, actor) {
    if (!allowed(actor)) return { ok: false, error: 'Akses finance diperlukan.' };
    const batch = await importStore.getImportBatch(batchId);
    if (!batch) return { ok: false, error: 'Batch import tidak ditemukan.' };
    if (batch.status === 'committed') return { ok: true, value: batch };
    if (batch.status !== 'previewed') return { ok: false, error: 'Batch sudah dibatalkan.' };
    if (batch.errors.length) return { ok: false, error: 'Batch masih memiliki error validasi.' };
    for (const row of batch.rows) {
      if (batch.entity === 'inventory') await inventoryWriter(row, actor);
      else await visaWriter(row, actor);
    }
    return { ok: true, value: await importStore.updateImportBatch(batchId, { status: 'committed', committedAt: now() }) };
  }

  async function rollback(batchId, actor) {
    if (!allowed(actor)) return { ok: false, error: 'Akses finance diperlukan.' };
    const batch = await importStore.getImportBatch(batchId);
    if (!batch) return { ok: false, error: 'Batch import tidak ditemukan.' };
    if (batch.status === 'rolled-back') return { ok: true, value: batch };
    if (batch.status === 'committed') return { ok: false, error: 'Batch yang sudah commit tidak dapat di-rollback otomatis.' };
    return { ok: true, value: await importStore.updateImportBatch(batchId, { status: 'rolled-back', rolledBackAt: now() }) };
  }

  async function listBatches(input, actor) {
    if (!allowed(actor)) return { ok: false, error: 'Akses finance diperlukan.' };
    const source = input || {};
    const page = Number.isInteger(Number(source.page)) && Number(source.page) > 0 ? Number(source.page) : 1;
    const pageSize = Math.min(Math.max(Number(source.pageSize) || 10, 1), 50);
    const result = await importStore.listImportBatches({ entity: ENTITIES.has(clean(source.entity)) ? clean(source.entity) : null, status: ['previewed', 'committed', 'rolled-back'].includes(clean(source.status)) ? clean(source.status) : null, limit: pageSize, offset: (page - 1) * pageSize });
    return { ok: true, value: { ...result, page, pageSize } };
  }

  return Object.freeze({ commit, createMemoryOperationsImportStore, listBatches, preview, rollback });
}

module.exports = { createMemoryOperationsImportStore, createOperationsImportService };
