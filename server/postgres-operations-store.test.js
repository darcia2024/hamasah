const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresOperationsStore } = require('./postgres-operations-store.js');
const { createOperationsService, documentNumber } = require('./operations-service.js');

const ISSUED_AT = '2026-09-15T00:00:00.000Z';

async function insertStudent(database, name) {
  const id = crypto.randomUUID();
  await database.query(
    `INSERT INTO students (id, name, program, city, join_date, status) VALUES ($1, $2, 'Kuliah Al-Azhar', 'Kairo', '2026-08-20', 'active')`,
    [id, name]
  );
  return id;
}

async function run() {
  const database = await createTestDatabase();
  try {
    const store = createPostgresOperationsStore({ database });
    const studentId = await insertStudent(database, 'Abdullah Fikri');

    assert.deepEqual(await store.listInvoices(), []);
    assert.equal(await store.getInvoice(crypto.randomUUID()), null);
    assert.equal(await store.getVisa(studentId), null);

    // Penghitung nomor dokumen berbagi tabel document_counters dengan pendaftaran.
    assert.equal(await store.nextSequence('invoice', 2026), 1);
    assert.equal(await store.nextSequence('invoice', 2026), 2);
    assert.equal(await store.nextSequence('invoice', 2027), 1, 'Penghitung dipisah per tahun.');

    const invoice = await store.saveInvoice({
      id: crypto.randomUUID(), number: 'INV/HI/2026/00001', studentId, description: 'SPP September',
      amount: 1500000, status: 'unpaid', issuedAt: ISSUED_AT, paidAt: null, receiptNumber: null
    });
    // amount_rupiah bertipe BIGINT: pg mengembalikannya sebagai teks, jadi harus tetap angka.
    assert.equal(invoice.amount, 1500000);
    assert.equal(typeof invoice.amount, 'number');
    assert.deepEqual(await store.getInvoice(invoice.id), invoice);

    const payment = (year) => ({
      paidAt: '2026-09-16T00:00:00.000Z',
      year,
      receiptNumberFor: (sequence) => documentNumber('KWT', sequence, year)
    });
    const lunas = await store.markInvoicePaid(invoice.id, payment(2026));
    assert.equal(lunas.status, 'paid');
    assert.equal(lunas.receiptNumber, 'KWT/HI/2026/00001');
    assert.equal(lunas.paidAt, '2026-09-16T00:00:00.000Z');

    // Invoice yang sudah lunas tidak berubah lagi dan tidak menghabiskan nomor kuitansi.
    assert.equal(await store.markInvoicePaid(invoice.id, payment(2026)), null);
    assert.equal(await store.markInvoicePaid(crypto.randomUUID(), payment(2026)), null);
    const kedua = await store.saveInvoice({
      id: crypto.randomUUID(), number: 'INV/HI/2026/00002', studentId, description: 'SPP Oktober',
      amount: 1500000, status: 'unpaid', issuedAt: '2026-09-16T00:00:00.000Z', paidAt: null, receiptNumber: null
    });
    const lunasKedua = await store.markInvoicePaid(kedua.id, payment(2026));
    assert.equal(lunasKedua.receiptNumber, 'KWT/HI/2026/00002', 'Nomor kuitansi tidak boleh berlubang.');

    // Visa: satu baris per santri, tanggal tidak bergeser sehari.
    const visa = await store.saveVisa({
      studentId, status: 'collecting-documents', passportExpiresAt: '2028-01-31',
      visaExpiresAt: null, note: 'Paspor diperiksa', updatedAt: ISSUED_AT
    });
    assert.equal(visa.passportExpiresAt, '2028-01-31');
    assert.equal(visa.visaExpiresAt, null);
    const visaDiperbarui = await store.saveVisa({ ...visa, status: 'submitted', note: '', updatedAt: '2026-09-16T00:00:00.000Z' });
    assert.equal(visaDiperbarui.status, 'submitted');
    assert.equal(visaDiperbarui.note, '');
    assert.equal((await store.listVisas()).length, 1, 'Upsert visa tidak boleh membuat baris kedua.');

    // Inventaris: upsert berdasarkan id, urut nama.
    const kasur = await store.saveInventory({ id: crypto.randomUUID(), name: 'Kasur asrama', location: 'Hay Asyir', quantity: 20, updatedAt: ISSUED_AT });
    await store.saveInventory({ id: crypto.randomUUID(), name: 'Almari', location: 'Hay Asyir', quantity: 10, updatedAt: ISSUED_AT });
    await store.saveInventory({ ...kasur, quantity: 25, updatedAt: '2026-09-16T00:00:00.000Z' });
    const inventaris = await store.listInventory();
    assert.deepEqual(inventaris.map((item) => item.name), ['Almari', 'Kasur asrama']);
    assert.equal(inventaris[1].quantity, 25);

    // Service memakai store ini apa adanya.
    const service = createOperationsService({
      store,
      now: () => '2026-09-17T00:00:00.000Z',
      studentExists: async (id) => id === studentId
    });
    const dibuat = await service.createInvoice({ studentId, description: 'SPP November', amount: 1750000 }, { role: 'admin' });
    assert.equal(dibuat.ok, true);
    assert.equal(dibuat.value.number, 'INV/HI/2026/00003', 'Nomor melanjutkan penghitung yang sama.');
    assert.equal((await service.createInvoice({ studentId: crypto.randomUUID(), description: 'SPP', amount: 1000 }, { role: 'admin' })).ok, false);

    // Dua pelunasan bersamaan di database hanya menghasilkan satu nomor kuitansi.
    const bersamaan = await Promise.all([
      service.markInvoicePaid(dibuat.value.id, { role: 'admin' }),
      service.markInvoicePaid(dibuat.value.id, { role: 'admin' })
    ]);
    const nomor = bersamaan.map((hasil) => hasil.value.receiptNumber);
    assert.equal(new Set(nomor).size, 1, `Kuitansi ganda: ${nomor.join(', ')}`);
    assert.equal(nomor[0], 'KWT/HI/2026/00003');

    const daftar = await service.list();
    assert.equal(daftar.invoices.length, 3);
    assert.equal(daftar.invoices[0].description, 'SPP November', 'Invoice terbaru di urutan pertama.');
    assert.equal(daftar.visas.length, 1);
    assert.equal(daftar.inventory.length, 2);

    // Task R3.2. Koreksi invoice dicatat sejak migrasi 022 tetapi tidak pernah dibaca.
    const petugasId = crypto.randomUUID();
    await database.query(
      `INSERT INTO accounts (id, email, name, role, password_hash) VALUES ($1, 'keuangan.uji@hamasah.test', 'Keuangan Uji', 'finance', 'hash-uji')`,
      [petugasId]
    );
    const dikoreksi = await store.saveInvoice({
      id: crypto.randomUUID(), number: 'INV/HI/2026/09003', studentId, description: 'SPP Nopember',
      amount: 1500000, status: 'unpaid', issuedAt: '2026-09-17T00:00:00.000Z', paidAt: null, receiptNumber: null
    });
    assert.deepEqual(await store.listInvoiceCorrections(dikoreksi.id), []);

    const hasilKoreksi = await store.correctInvoice(dikoreksi.id, {
      id: crypto.randomUUID(), description: 'SPP November', amount: 1650000,
      reason: 'Salah ketik bulan dan nominal.', actorAccountId: petugasId,
      createdAt: '2026-09-17T01:00:00.000Z'
    });
    assert.equal(hasilKoreksi.description, 'SPP November');
    assert.equal(hasilKoreksi.amount, 1650000);

    const riwayat = await store.listInvoiceCorrections(dikoreksi.id);
    assert.equal(riwayat.length, 1);
    assert.equal(riwayat[0].reason, 'Salah ketik bulan dan nominal.');
    assert.equal(riwayat[0].previousDescription, 'SPP Nopember');
    assert.equal(riwayat[0].previousAmount, 1500000);
    assert.equal(typeof riwayat[0].previousAmount, 'number', 'BIGINT tidak boleh lolos sebagai string.');
    assert.equal(riwayat[0].correctedDescription, 'SPP November');
    assert.equal(riwayat[0].correctedAmount, 1650000);
    assert.equal(riwayat[0].actorName, 'Keuangan Uji');

    // Invoice yang sudah lunas tidak dapat dikoreksi maupun dibatalkan.
    assert.equal(await store.correctInvoice(invoice.id, {
      id: crypto.randomUUID(), description: 'Coba koreksi', amount: 1000,
      reason: 'Tidak boleh berhasil.', actorAccountId: petugasId, createdAt: ISSUED_AT
    }), null);
    assert.equal(await store.voidInvoice(invoice.id, { reason: 'Tidak boleh berhasil.', voidedAt: ISSUED_AT }), null);

    const dibatalkan = await store.voidInvoice(dikoreksi.id, {
      reason: 'Tagihan ganda untuk bulan yang sama.', voidedAt: '2026-09-17T02:00:00.000Z', actorAccountId: petugasId
    });
    assert.equal(dibatalkan.status, 'voided');
    assert.equal(dibatalkan.voidReason, 'Tagihan ganda untuk bulan yang sama.');
    // Sudah dibatalkan, jadi tidak bisa dikoreksi lagi, tetapi jejaknya tetap terbaca.
    assert.equal(await store.correctInvoice(dikoreksi.id, {
      id: crypto.randomUUID(), description: 'Setelah batal', amount: 1000,
      reason: 'Tidak boleh berhasil.', actorAccountId: petugasId, createdAt: ISSUED_AT
    }), null);
    assert.equal((await store.listInvoiceCorrections(dikoreksi.id)).length, 1);

    // ON DELETE SET NULL: pelaku dihapus, jejak koreksinya bertahan tanpa nama.
    await database.query('DELETE FROM accounts WHERE id = $1', [petugasId]);
    const setelahAkunDihapus = await store.listInvoiceCorrections(dikoreksi.id);
    assert.equal(setelahAkunDihapus.length, 1);
    assert.equal(setelahAkunDihapus[0].actorAccountId, null);
    assert.equal(setelahAkunDihapus[0].actorName, null);
    assert.equal(setelahAkunDihapus[0].reason, 'Salah ketik bulan dan nominal.');

    // Task R3.3. Berkas visa disimpan sejak migrasi 022 dan tidak pernah dibaca.
    assert.deepEqual(await store.listVisaDocuments(studentId), []);
    await store.saveVisaDocument({
      id: crypto.randomUUID(), studentId, fileObjectId: null, documentType: 'passport',
      expiresAt: '2028-01-31', note: 'Paspor lama', uploadedAt: '2026-09-18T00:00:00.000Z'
    });
    await store.saveVisaDocument({
      id: crypto.randomUUID(), studentId, fileObjectId: null, documentType: 'visa',
      expiresAt: null, note: '', uploadedAt: '2026-09-19T00:00:00.000Z'
    });
    const berkasVisa = await store.listVisaDocuments(studentId);
    assert.equal(berkasVisa.length, 2);
    assert.equal(berkasVisa[0].documentType, 'visa', 'Unggahan terbaru di urutan pertama.');
    assert.equal(berkasVisa[0].expiresAt, null);
    // Tanggal tidak boleh bergeser sehari karena zona waktu.
    assert.equal(berkasVisa[1].expiresAt, '2028-01-31');
    assert.equal(berkasVisa[1].note, 'Paspor lama');

    const santriLain = await insertStudent(database, 'Santri Lain');
    assert.deepEqual(await store.listVisaDocuments(santriLain), [], 'Berkas santri lain tidak ikut terbawa.');
    assert.equal((await store.listVisaDocuments(null)).length, 2, 'Tanpa filter, seluruh berkas terbaca.');

    // Task R3.4. Mutasi inventaris dicatat sejak migrasi 022 dan tidak pernah dibaca.
    const lemari = await store.saveInventory({
      id: crypto.randomUUID(), name: 'Lemari santri', location: 'Hay Asyir', quantity: 5, updatedAt: ISSUED_AT
    });
    assert.deepEqual(await store.listInventoryMovements(lemari.id), []);

    const masuk = await store.applyInventoryMovement(lemari.id, {
      id: crypto.randomUUID(), direction: 'in', quantity: 3, reason: 'Pembelian tambahan',
      actorAccountId: null, createdAt: '2026-09-20T00:00:00.000Z'
    });
    assert.equal(masuk.item.quantity, 8);
    const keluar = await store.applyInventoryMovement(lemari.id, {
      id: crypto.randomUUID(), direction: 'out', quantity: 2, reason: 'Dipindah ke asrama putri',
      actorAccountId: null, createdAt: '2026-09-21T00:00:00.000Z'
    });
    assert.equal(keluar.item.quantity, 6, 'Jumlah mengikuti ledger, bukan angka yang ditulis terpisah.');

    const mutasi = await store.listInventoryMovements(lemari.id);
    assert.equal(mutasi.length, 2);
    assert.equal(mutasi[0].direction, 'out', 'Mutasi terbaru di urutan pertama.');
    assert.equal(mutasi[0].quantity, 2);
    assert.equal(typeof mutasi[0].quantity, 'number');
    assert.equal(mutasi[1].reason, 'Pembelian tambahan');

    // Keluar melebihi stok ditolak, dan tidak meninggalkan jejak mutasi.
    const gagal = await store.applyInventoryMovement(lemari.id, {
      id: crypto.randomUUID(), direction: 'out', quantity: 99, reason: 'Tidak boleh berhasil',
      actorAccountId: null, createdAt: '2026-09-22T00:00:00.000Z'
    });
    assert.equal(gagal.error, 'Stok tidak boleh negatif.');
    assert.equal((await store.listInventoryMovements(lemari.id)).length, 2, 'Mutasi yang ditolak tidak boleh tercatat.');
    assert.equal((await store.listInventory()).find((x) => x.id === lemari.id).quantity, 6);

    console.log('postgres operations store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
