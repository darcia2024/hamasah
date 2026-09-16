const assert = require('node:assert/strict');
const { createOperationsService, documentNumber, yearInJakarta } = require('./operations-service.js');

const admin = { role: 'admin' };
const musyrif = { role: 'supervisor' };

async function run() {
  const service = createOperationsService({
    now: () => '2026-09-15T08:00:00.000Z',
    // Sengaja async, meniru pemeriksaan sungguhan ke database.
    studentExists: async (id) => id === 'student-1'
  });

  const invoice = await service.createInvoice({ studentId: 'student-1', description: 'SPP September', amount: 1500000 }, admin);
  assert.equal(invoice.ok, true);
  assert.equal(invoice.value.number, 'INV/HI/2026/00001');

  const kedua = await service.createInvoice({ studentId: 'student-1', description: 'SPP Oktober', amount: 1500000 }, admin);
  assert.equal(kedua.value.number, 'INV/HI/2026/00002', 'Nomor invoice berasal dari penghitung, bukan jumlah baris.');

  // Santri yang tidak ada dan nominal tidak wajar ditolak.
  assert.equal((await service.createInvoice({ studentId: 'santri-fiktif', description: 'SPP', amount: 1500000 }, admin)).ok, false);
  assert.equal((await service.createInvoice({ studentId: 'student-1', description: 'SPP', amount: 2000000000 }, admin)).ok, false);
  assert.equal((await service.createInvoice({ studentId: 'student-1', description: 'SPP', amount: 1500000 }, musyrif)).ok, false);

  const paid = await service.markInvoicePaid(invoice.value.id, admin);
  assert.equal(paid.value.receiptNumber, 'KWT/HI/2026/00001');

  // Dua permintaan pelunasan bersamaan hanya menghasilkan satu nomor kuitansi.
  const bersamaan = await Promise.all([
    service.markInvoicePaid(kedua.value.id, admin),
    service.markInvoicePaid(kedua.value.id, admin)
  ]);
  const nomorKuitansi = bersamaan.map((hasil) => hasil.value.receiptNumber);
  assert.equal(new Set(nomorKuitansi).size, 1, `Kuitansi ganda: ${nomorKuitansi.join(', ')}`);

  assert.equal((await service.saveVisa({ studentId: 'student-1', status: 'collecting-documents', note: 'Paspor diperiksa' }, admin)).ok, true);
  assert.equal((await service.saveVisa({ studentId: 'santri-fiktif', status: 'collecting-documents' }, admin)).ok, false);
  assert.equal((await service.saveInventory({ name: 'Kasur asrama', location: 'Hay Asyir', quantity: 20 }, admin)).ok, true);

  const daftar = await service.list();
  assert.equal(daftar.invoices.length, 2);
  assert.equal(daftar.visas.length, 1);
  assert.equal(daftar.inventory.length, 1);

  // Tahun nomor dokumen mengikuti tanggal di Indonesia.
  assert.equal(yearInJakarta('2026-12-31T17:30:00.000Z'), 2027);
  assert.equal(documentNumber('INV', 7, 2027), 'INV/HI/2027/00007');

  console.log('operations-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
