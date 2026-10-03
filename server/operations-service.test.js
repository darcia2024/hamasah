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
  assert.equal((await service.correctInvoice(invoice.value.id, { description: 'Koreksi', amount: 1_500_000, reason: 'Sudah dibayar' }, admin)).ok, false, 'Invoice lunas tidak boleh diubah tanpa nota pembatalan.');

  // Dua permintaan pelunasan bersamaan hanya menghasilkan satu nomor kuitansi.
  const bersamaan = await Promise.all([
    service.markInvoicePaid(kedua.value.id, admin),
    service.markInvoicePaid(kedua.value.id, admin)
  ]);
  const nomorKuitansi = bersamaan.map((hasil) => hasil.value.receiptNumber);
  assert.equal(new Set(nomorKuitansi).size, 1, `Kuitansi ganda: ${nomorKuitansi.join(', ')}`);

  assert.equal((await service.saveVisa({ studentId: 'student-1', status: 'collecting-documents', note: 'Paspor diperiksa' }, admin)).ok, true);
  const visaReminder = await service.saveVisa({ studentId: 'student-1', status: 'submitted', passportExpiresAt: '2026-09-20' }, admin);
  assert.equal(visaReminder.ok, true);
  const reminders = await service.visaReminders({ days: 30 }, admin);
  assert.equal(reminders.ok, true);
  assert.equal(reminders.value[0].document, 'passport');
  assert.equal((await service.saveVisa({ studentId: 'santri-fiktif', status: 'collecting-documents' }, admin)).ok, false);
  const inventarisAwal = await service.saveInventory({ name: 'Kasur asrama', location: 'Hay Asyir', quantity: 20 }, admin);
  assert.equal(inventarisAwal.ok, true);
  assert.equal((await service.moveInventory(inventarisAwal.value.id, { direction: 'out', quantity: 21, reason: 'Distribusi kamar' }, admin)).ok, false, 'Stok tidak boleh negatif.');
  const mutasi = await service.moveInventory(inventarisAwal.value.id, { direction: 'out', quantity: 2, reason: 'Distribusi kamar' }, admin);
  assert.equal(mutasi.ok, true);
  assert.equal(mutasi.value.item.quantity, 18);
  assert.equal((await service.saveVisaDocument({ studentId: 'student-1', documentType: 'passport', fileObjectId: 'file-1', expiresAt: '2028-01-01' }, admin)).ok, true);
  const ketiga = await service.createInvoice({ studentId: 'student-1', description: 'SPP November', amount: 1500000 }, admin);
  const koreksi = await service.correctInvoice(ketiga.value.id, { description: 'SPP November dikoreksi', amount: 1600000, reason: 'Nominal sesuai surat keputusan' }, admin);
  assert.equal(koreksi.ok, true);
  assert.equal(koreksi.value.amount, 1600000);

  const daftar = await service.list();
  assert.equal(daftar.invoices.length, 3);
  assert.equal(daftar.visas.length, 1);
  assert.equal(daftar.inventory.length, 1);

  // Tahun nomor dokumen mengikuti tanggal di Indonesia.
  assert.equal(yearInJakarta('2026-12-31T17:30:00.000Z'), 2027);
  assert.equal(documentNumber('INV', 7, 2027), 'INV/HI/2027/00007');

  await keuangan();
  console.log('operations-service tests passed');
}

// Ringkasan, tunggakan, rincian pembayaran, pengingat, dan saringan bulan (role keuangan).
async function keuangan() {
  let waktu = '2026-10-03T03:00:00.000Z';
  const keu = { id: 'akun-keuangan', role: 'finance' };
  const service = createOperationsService({
    now: () => waktu,
    studentExists: async (id) => ['s-1', 's-2'].includes(id),
    listStudents: async () => [
      { id: 's-1', name: 'Ahmad', program: 'Kuliah S1 Al-Azhar', status: 'active', city: 'Bandung' },
      { id: 's-2', name: 'Budi', program: "Ma'had Al-Azhar", status: 'active' },
      { id: 's-3', name: 'Lulus', program: 'Kuliah S1 Al-Azhar', status: 'graduated' }
    ]
  });

  // Pilihan santri: hanya yang aktif, tanpa data pribadi lain.
  assert.deepEqual((await service.studentOptions(keu)).value, [
    { id: 's-1', name: 'Ahmad', program: 'Kuliah S1 Al-Azhar' },
    { id: 's-2', name: 'Budi', program: "Ma'had Al-Azhar" }
  ]);
  assert.equal((await service.studentOptions(musyrif)).ok, false);

  // Satu tagihan lama (Agustus), dua tagihan Oktober.
  waktu = '2026-08-15T03:00:00.000Z';
  const lama = await service.createInvoice({ studentId: 's-1', description: 'Daftar ulang', amount: 3500000 }, keu);
  waktu = '2026-10-01T03:00:00.000Z';
  const okt1 = await service.createInvoice({ studentId: 's-1', description: 'SPP Oktober', amount: 1500000 }, keu);
  const okt2 = await service.createInvoice({ studentId: 's-2', description: 'SPP Oktober', amount: 1500000 }, keu);
  waktu = '2026-10-03T03:00:00.000Z';

  // Rincian pembayaran: tanggal tidak boleh di masa depan atau sebelum terbit, metode wajib.
  assert.equal((await service.markInvoicePaid(okt2.value.id, keu, { paidOn: '2026-10-04', method: 'tunai' })).ok, false);
  assert.equal((await service.markInvoicePaid(okt2.value.id, keu, { paidOn: '2026-09-30', method: 'tunai' })).ok, false);
  assert.equal((await service.markInvoicePaid(okt2.value.id, keu, { paidOn: '2026-10-02', method: 'cek' })).ok, false);
  const lunas = await service.markInvoicePaid(okt2.value.id, keu, { paidOn: '2026-10-02', method: 'transfer', note: 'BSI' });
  assert.equal(lunas.ok, true);
  assert.equal(lunas.paymentDetailSaved, true);
  assert.deepEqual(lunas.value.payment, { paidOn: '2026-10-02', method: 'transfer', note: 'BSI', recordedByAccountId: 'akun-keuangan', recordedAt: waktu });
  // Tanpa rincian tetap bisa (perilaku lama).
  assert.equal((await service.markInvoicePaid(lama.value.id, keu)).ok, true);
  assert.equal((await service.getInvoice(lama.value.id, keu)).payment, null);
  waktu = '2026-10-03T04:00:00.000Z';
  const lama2 = await service.createInvoice({ studentId: 's-2', description: 'Seragam', amount: 400000 }, keu);
  waktu = '2026-11-20T03:00:00.000Z';

  // Ringkasan per 20 November: tunggakan okt1 + lama2, keduanya > 30 hari.
  const r = (await service.financeSummary(keu)).value;
  assert.equal(r.month, '2026-11');
  assert.deepEqual(r.outstanding, { count: 2, total: 1900000 });
  assert.deepEqual(r.overdue, { count: 2, total: 1900000 });
  assert.deepEqual(r.collectedThisMonth, { count: 0, total: 0 });
  assert.deepEqual(r.issuedThisMonth, { count: 0, total: 0 });
  assert.equal((await service.financeSummary(musyrif)).ok, false);

  // Tunggakan per santri, total terbesar dulu.
  const t = (await service.arrears(keu)).value;
  assert.deepEqual(t.map((item) => [item.studentName, item.count, item.total]), [['Ahmad', 1, 1500000], ['Budi', 1, 400000]]);

  // Saringan bulan terbit (WIB) dan urutan terlama dulu.
  const oktober = await service.listInvoicesPage({ month: '2026-10' });
  assert.equal(oktober.total, 3);
  const terlama = await service.listInvoicesPage({ status: 'unpaid', sort: 'oldest' });
  assert.deepEqual(terlama.items.map((item) => item.id), [okt1.value.id, lama2.value.id]);
  assert.equal((await service.listInvoicesPage({ studentId: 's-2' })).total, 2);

  // Pengingat: hanya yang belum dibayar, paling sering sekali per 24 jam.
  assert.equal((await service.prepareReminder(okt2.value.id, keu)).ok, false, 'Tagihan lunas tidak diingatkan.');
  assert.equal((await service.prepareReminder(okt1.value.id, keu)).ok, true);
  await service.recordReminder(okt1.value.id, keu, 1);
  const kedua = await service.prepareReminder(okt1.value.id, keu);
  assert.equal(kedua.status, 429);
  const dariDaftar = (await service.listInvoicesPage({ studentId: 's-1', status: 'unpaid' })).items[0];
  assert.equal(dariDaftar.lastReminder.count, 1);
  waktu = '2026-11-21T03:00:01.000Z';
  assert.equal((await service.prepareReminder(okt1.value.id, keu)).ok, true, 'Setelah 24 jam boleh lagi.');

  // Laporan: rentang bulan inklusif.
  const laporan = await service.invoiceReport({ fromMonth: '2026-10', toMonth: '2026-10' });
  assert.deepEqual(laporan.map((item) => item.description).sort(), ['SPP Oktober', 'SPP Oktober', 'Seragam']);
  assert.equal(laporan.find((item) => item.id === okt2.value.id).payment.method, 'transfer');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
