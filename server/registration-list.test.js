// Daftar pendaftar untuk petugas: satu halaman disaring dan dipotong di SQL, dan jumlah
// query tidak tumbuh mengikuti jumlah pendaftar (Task R6.1, temuan E-01).

const assert = require('node:assert/strict');
const { createTestDatabase } = require('./test-support/database.js');
const { createCountingDatabase } = require('./test-support/counting-database.js');
const { createPostgresRegistrationStore } = require('./postgres-registration-store.js');
const { createRegistrationService } = require('./registration-service.js');

const BASE = Date.parse('2026-09-01T00:00:00.000Z');

function record(index) {
  const nomor = String(index).padStart(3, '0');
  const at = new Date(BASE + index * 60000).toISOString();
  return {
    registrationId: `HI-REG-2026-${String(index).padStart(5, '0')}`,
    status: index % 3 === 0 ? 'document-review' : 'submitted',
    progress: 15,
    applicant: {
      applicantName: index === 7 ? 'Siti 100%_Khusus' : `Calon ${nomor}`,
      phone: `+62811000${nomor}`,
      guardianName: 'Wali Uji', guardianPhone: '+628000000002', guardianEmail: 'wali@hamasah.test',
      email: `calon${nomor}@hamasah.test`, birthDate: '2008-04-12', gender: 'putra', schoolOrigin: 'SMA Uji',
      programDetails: {}, referralSource: '', privacyPolicyVersion: 'v2', guardianConsent: true,
      program: 'mahad-al-azhar', educationLevel: 'MA', city: 'Bandung'
    },
    accessTokenHash: `hash-${nomor}`,
    createdAt: at,
    updatedAt: at,
    // Jumlah dokumen berbeda per pendaftar, supaya penempelan anak ke induk yang salah ketahuan.
    documents: Array.from({ length: index % 4 }, (_, n) => ({
      type: 'passport', storageKey: `registrations/${nomor}/${n}.pdf`, status: 'received', uploadedAt: at, uploadedBy: 'applicant'
    })),
    statusHistory: [{ from: 'draft', to: 'submitted', changedAt: at, changedBy: 'applicant', note: `Awal ${nomor}` }]
  };
}

async function run() {
  const inner = await createTestDatabase();
  const database = createCountingDatabase(inner);
  try {
    const store = createPostgresRegistrationStore({ database });
    const service = createRegistrationService({ store });

    async function tambahSampai(jumlah, sudah) {
      for (let index = sudah + 1; index <= jumlah; index += 1) await store.insert(record(index));
    }
    async function ukur(options) {
      database.counter.queries = 0;
      const hasil = await service.listForStaff(options);
      return { hasil, queries: database.counter.queries };
    }

    await tambahSampai(5, 0);
    const kecil = await ukur({ pageSize: 10 });
    await tambahSampai(60, 5);
    const besar = await ukur({ pageSize: 10 });

    // Jumlah query untuk satu halaman tidak bergantung pada jumlah pendaftar.
    assert.equal(kecil.queries, besar.queries, `Query tumbuh dari ${kecil.queries} ke ${besar.queries} saat pendaftar 5 -> 60.`);
    assert.ok(besar.queries <= 6, `Satu halaman memakai ${besar.queries} query; seharusnya paling banyak 6.`);
    // Ukuran respons mengikuti ukuran halaman, bukan total.
    assert.equal(besar.hasil.items.length, 10);
    assert.equal(besar.hasil.total, 60);
    assert.deepEqual([besar.hasil.page, besar.hasil.pageSize], [1, 10]);

    // Terbaru lebih dulu, dan halaman berikutnya melanjutkan tanpa tumpang tindih.
    assert.equal(besar.hasil.items[0].registrationId, 'HI-REG-2026-00060');
    const halamanDua = (await service.listForStaff({ page: 2, pageSize: 10 })).items;
    assert.equal(halamanDua[0].registrationId, 'HI-REG-2026-00050');
    const terakhir = (await service.listForStaff({ page: 6, pageSize: 10 })).items;
    assert.equal(terakhir.at(-1).registrationId, 'HI-REG-2026-00001');
    assert.equal((await service.listForStaff({ page: 7, pageSize: 10 })).items.length, 0);

    // Anak menempel ke induk yang benar (jumlah dokumen dan riwayat per pendaftar).
    for (const item of besar.hasil.items) {
      const index = Number(item.registrationId.slice(-5));
      assert.equal(item.documents.length, index % 4, `${item.registrationId}: jumlah dokumen salah.`);
      assert.equal(item.history.length, 1);
      assert.equal(item.history[0].note, `Awal ${String(index).padStart(3, '0')}`);
    }

    // Filter status dan pencarian berjalan di SQL, dan total mengikuti filter.
    const review = await service.listForStaff({ status: 'document-review', pageSize: 100 });
    assert.equal(review.total, 20);
    assert.ok(review.items.every((item) => item.status === 'document-review'));
    const cari = await service.listForStaff({ search: 'calon 042' });
    assert.deepEqual(cari.items.map((item) => item.registrationId), ['HI-REG-2026-00042']);
    assert.equal((await service.listForStaff({ search: '00042' })).total, 1, 'Pencarian juga mencocokkan nomor pendaftaran.');
    assert.equal((await service.listForStaff({ search: '+62811000010' })).total, 1, 'Pencarian juga mencocokkan telepon.');
    // Karakter pola LIKE dari pengguna dianggap huruf biasa.
    assert.deepEqual((await service.listForStaff({ search: '100%_' })).items.map((item) => item.registrationId), ['HI-REG-2026-00007']);
    assert.equal((await service.listForStaff({ search: '%' })).total, 1, '"%" hanya cocok dengan nama yang memuat "%".');
    assert.equal((await service.listForStaff({ search: 'tidak-ada-yang-cocok' })).total, 0);
    assert.equal((await service.listForStaff({ status: 'document-review', search: 'calon 003' })).total, 1);

    // pageSize dibatasi, dan satu bentuk untuk semua pemanggilan (dulu array bila tanpa argumen).
    assert.equal((await service.listForStaff({ pageSize: 100000 })).pageSize, 100);
    const tanpaArgumen = await service.listForStaff();
    assert.equal(Array.isArray(tanpaArgumen), false);
    assert.deepEqual(Object.keys(tanpaArgumen).sort(), ['items', 'page', 'pageSize', 'total']);

    console.log(`registration list tests passed (${besar.queries} query per halaman pada 5 dan 60 pendaftar)`);
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
