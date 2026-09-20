const assert = require('node:assert/strict');
const { createMemoryOperationsStore } = require('./operations-service.js');
const { createOperationsImportService } = require('./operations-import-service.js');

async function run() {
  const store = createMemoryOperationsStore();
  const applied = [];
  const service = createOperationsImportService({
    store,
    now: () => '2026-09-20T08:00:00.000Z',
    inventoryWriter: async (row) => { applied.push(row); await store.saveInventory({ id: row.id || `generated-${applied.length}`, ...row, updatedAt: '2026-09-20T08:00:00.000Z' }); }
  });
  const finance = { id: 'finance-1', role: 'finance' };
  const invalid = await service.preview({ entity: 'inventory', rows: [
    { name: 'Kasur', location: 'Hay Asyir', quantity: 4 },
    { name: 'Kasur', location: 'Hay Asyir', quantity: 4 }
  ] }, finance);
  assert.equal(invalid.ok, true);
  assert.equal(invalid.value.validCount, 1);
  assert.equal((await service.commit(invalid.value.id, finance)).ok, false);

  const valid = await service.preview({ entity: 'inventory', rows: [{ name: 'Meja belajar', location: 'Hay Sabi', quantity: 10 }] }, finance);
  assert.equal(valid.value.errors.length, 0);
  assert.equal((await service.rollback(valid.value.id, finance)).value.status, 'rolled-back');
  assert.equal(applied.length, 0, 'Rollback preview tidak boleh menulis data bisnis.');

  const committed = await service.preview({ entity: 'inventory', rows: [{ name: 'Kursi', location: 'Hay Sabi', quantity: 8 }] }, finance);
  assert.equal((await service.commit(committed.value.id, finance)).value.status, 'committed');
  assert.equal(applied.length, 1);
  assert.equal((await service.commit(committed.value.id, finance)).value.status, 'committed', 'Commit ulang harus idempotent.');
  assert.equal(applied.length, 1);
  console.log('operations import service tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
