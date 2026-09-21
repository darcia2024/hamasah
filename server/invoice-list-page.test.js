// Daftar tagihan berpaginasi dengan nama santri (Task R6.2): disaring dan dipotong di SQL,
// jumlah query tidak tumbuh mengikuti jumlah tagihan, dan nama santri ikut dari tabel students.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createCountingDatabase } = require('./test-support/counting-database.js');
const { createPostgresOperationsStore } = require('./postgres-operations-store.js');
const { createPostgresStudentStore } = require('./postgres-student-store.js');
const { createOperationsService } = require('./operations-service.js');

const BASE = Date.parse('2026-09-01T00:00:00.000Z');

async function run() {
  const inner = await createTestDatabase();
  const database = createCountingDatabase(inner);
  try {
    const students = createPostgresStudentStore({ database: inner });
    const store = createPostgresOperationsStore({ database });
    const service = createOperationsService({ store, studentExists: async () => true, now: () => '2026-09-21T00:00:00.000Z' });

    const santri = [];
    for (const nama of ['Abdullah Fikri', 'Bilal 100% Ahmad']) {
      const id = crypto.randomUUID();
      await students.saveStudent({
        id, name: nama, program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', status: 'active',
        studentAccountId: null, parentAccountIds: [], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z'
      });
      santri.push({ id, nama });
    }

    async function tambah(jumlah, sudah) {
      for (let n = sudah + 1; n <= jumlah; n += 1) {
        await store.saveInvoice({
          id: crypto.randomUUID(),
          number: `INV/HI/2026/${String(n).padStart(5, '0')}`,
          studentId: santri[n % 2].id,
          description: n === 13 ? 'SPP bulan Oktober' : `Tagihan ${n}`,
          amount: 1000000 + n,
          status: n % 4 === 0 ? 'paid' : 'unpaid',
          issuedAt: new Date(BASE + n * 60000).toISOString(),
          paidAt: n % 4 === 0 ? new Date(BASE + n * 60000).toISOString() : null,
          receiptNumber: n % 4 === 0 ? `KWT/HI/2026/${String(n).padStart(5, '0')}` : null
        });
      }
    }
    async function ukur(options) {
      database.counter.queries = 0;
      const hasil = await service.listInvoicesPage(options);
      return { hasil, queries: database.counter.queries };
    }

    await tambah(6, 0);
    const kecil = await ukur({ limit: 10 });
    await tambah(80, 6);
    const besar = await ukur({ limit: 10 });
    assert.equal(besar.queries, kecil.queries, `Query tagihan tumbuh dari ${kecil.queries} ke ${besar.queries} saat 6 -> 80 tagihan.`);
    assert.equal(besar.queries, 2, 'Satu halaman: satu query hitung dan satu query halaman.');

    // Bentuk, urutan terbaru dulu, dan halaman berikutnya melanjutkan tanpa tumpang tindih.
    assert.deepEqual([besar.hasil.items.length, besar.hasil.total, besar.hasil.limit, besar.hasil.offset], [10, 80, 10, 0]);
    assert.equal(besar.hasil.items[0].number, 'INV/HI/2026/00080');
    assert.equal((await service.listInvoicesPage({ limit: 10, offset: 10 })).items[0].number, 'INV/HI/2026/00070');
    assert.equal((await service.listInvoicesPage({ limit: 10, offset: 70 })).items.at(-1).number, 'INV/HI/2026/00001');
    assert.equal((await service.listInvoicesPage({ limit: 100000 })).limit, 100, 'Batas atas limit.');
    assert.equal(typeof besar.hasil.items[0].amount, 'number');

    // Nama santri ikut dari tabel students, sehingga konsol keuangan tidak jatuh ke UUID.
    for (const item of besar.hasil.items) {
      assert.equal(item.studentName, santri.find((s) => s.id === item.studentId).nama);
    }

    // Filter dan pencarian berjalan di SQL, dan total mengikuti filter.
    assert.equal((await service.listInvoicesPage({ status: 'paid', limit: 100 })).total, 20);
    assert.ok((await service.listInvoicesPage({ status: 'paid', limit: 100 })).items.every((item) => item.status === 'paid'));
    assert.deepEqual((await service.listInvoicesPage({ search: 'inv/hi/2026/00042' })).items.map((i) => i.number), ['INV/HI/2026/00042']);
    assert.deepEqual((await service.listInvoicesPage({ search: 'bulan oktober' })).items.map((i) => i.number), ['INV/HI/2026/00013']);
    assert.equal((await service.listInvoicesPage({ search: 'abdullah', limit: 100 })).total, 40, 'Pencarian mencocokkan nama santri.');
    assert.equal((await service.listInvoicesPage({ search: '100%', limit: 100 })).total, 40, '"100%" adalah huruf biasa, bukan pola.');
    assert.equal((await service.listInvoicesPage({ search: '%' })).total, 40, '"%" hanya cocok dengan nama yang memuat "%".');
    assert.equal((await service.listInvoicesPage({ search: 'tidak-ada' })).total, 0);
    assert.equal((await service.listInvoicesPage({ status: 'paid', search: 'abdullah', limit: 100 })).total, 20, 'Semua tagihan lunas milik santri pertama (nomor genap).');
    assert.equal((await service.listInvoicesPage({ status: 'paid', search: 'bilal', limit: 100 })).total, 0);

    // Ringkasan konsol: halaman pertama saja, dengan total, dan visa memuat nama santri.
    await store.saveVisa({ studentId: santri[0].id, status: 'submitted', passportExpiresAt: null, visaExpiresAt: null, note: '', updatedAt: '2026-09-20T00:00:00.000Z' });
    const ringkasan = await service.overview();
    assert.equal(ringkasan.invoices.length, 20);
    assert.equal(ringkasan.invoicesTotal, 80);
    assert.equal(ringkasan.visas[0].studentName, 'Abdullah Fikri');

    // Ekspor laporan tetap memuat semuanya.
    assert.equal((await service.list()).invoices.length, 80);

    // Store memori (test dan pengembangan) memberi bentuk yang sama.
    const memori = createOperationsService({ studentExists: async () => true });
    assert.deepEqual(Object.keys(await memori.listInvoicesPage({})).sort(), ['items', 'limit', 'offset', 'total']);

    console.log(`invoice list page tests passed (${besar.queries} query per halaman pada 6 dan 80 tagihan)`);
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
