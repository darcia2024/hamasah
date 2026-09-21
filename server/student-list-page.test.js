// Daftar santri berpaginasi (Task R6.2). Cakupan akses kini diterapkan di SQL, jadi yang
// paling penting diuji adalah KESETARAANNYA dengan canView() yang lama: untuk setiap
// role, gabungan semua halaman harus sama persis dengan daftar penuh listForActor().

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createCountingDatabase } = require('./test-support/counting-database.js');
const { createPostgresStudentStore } = require('./postgres-student-store.js');
const { createStudentPortalService } = require('./student-portal-service.js');

const CREATED_AT = '2026-09-15T00:00:00.000Z';

async function insertAccount(database, role, email) {
  const id = crypto.randomUUID();
  await database.query(
    'INSERT INTO accounts (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)',
    [id, email, `Akun ${email}`, role, 'hash-uji']
  );
  return id;
}

async function insertDormitory(database, name, gender) {
  const id = crypto.randomUUID();
  await database.query('INSERT INTO dormitories (id, name, area, gender) VALUES ($1, $2, $3, $4)', [id, name, 'Area Uji', gender]);
  return id;
}

async function run() {
  const inner = await createTestDatabase();
  const database = createCountingDatabase(inner);
  try {
    const store = createPostgresStudentStore({ database });
    const asramaSatu = await insertDormitory(inner, 'Asrama Satu', 'putra');
    const asramaDua = await insertDormitory(inner, 'Asrama Dua', 'putri');
    const musyrif = await insertAccount(inner, 'supervisor', 'musyrif@hamasah.test');
    const musyrifKosong = await insertAccount(inner, 'supervisor', 'musyrif.kosong@hamasah.test');
    const waliA = await insertAccount(inner, 'parent', 'wali.a@hamasah.test');
    const waliB = await insertAccount(inner, 'parent', 'wali.b@hamasah.test');
    const waliTanpaAnak = await insertAccount(inner, 'parent', 'wali.kosong@hamasah.test');
    const akunSantri = await insertAccount(inner, 'student', 'santri.satu@hamasah.test');

    const namaAsrama = new Map([[asramaSatu, 'Asrama Satu'], [asramaDua, 'Asrama Dua']]);
    const service = createStudentPortalService({
      store,
      now: () => '2026-09-16T08:00:00.000Z',
      supervisorDormitories: async (accountId) => (accountId === musyrif ? [asramaSatu] : []),
      getDormitory: async (id) => (namaAsrama.has(id) ? { name: namaAsrama.get(id), area: 'Area Uji' } : null)
    });

    async function tambah(jumlah, sudah) {
      for (let n = sudah + 1; n <= jumlah; n += 1) {
        await store.saveStudent({
          id: crypto.randomUUID(),
          name: `Santri ${String(n).padStart(3, '0')}${n === 9 ? ' 100%' : ''}`,
          program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', status: 'active',
          gender: n % 2 ? 'putra' : 'putri',
          dormitoryId: n % 5 === 0 ? null : (n % 2 ? asramaSatu : asramaDua),
          studentAccountId: n === 1 ? akunSantri : null,
          parentAccountIds: n % 3 === 0 ? [waliA] : (n % 7 === 0 ? [waliB, waliA] : []),
          createdAt: CREATED_AT, updatedAt: CREATED_AT
        });
      }
    }
    async function semuaHalaman(actor, ukuran, search) {
      const ids = [];
      let total = null;
      for (let offset = 0; ; offset += ukuran) {
        const halaman = await service.listPageForActor(actor, { limit: ukuran, offset, search });
        total = halaman.total;
        ids.push(...halaman.items.map((item) => item.id));
        if (halaman.items.length < ukuran) break;
      }
      return { ids, total };
    }

    await tambah(30, 0);
    const kecil = await (async () => { database.counter.queries = 0; await service.listPageForActor({ id: 'x', role: 'admin' }, { limit: 10 }); return database.counter.queries; })();
    await tambah(120, 30);
    const besar = await (async () => { database.counter.queries = 0; await service.listPageForActor({ id: 'x', role: 'admin' }, { limit: 10 }); return database.counter.queries; })();
    assert.equal(besar, kecil, `Query daftar santri tumbuh dari ${kecil} ke ${besar} saat santri 30 -> 120.`);

    // Kesetaraan cakupan: halaman-halaman sama persis dengan daftar penuh yang disaring canView().
    const aktor = [
      { nama: 'admin', actor: { id: 'admin-1', role: 'admin' }, harapan: 120 },
      { nama: 'musyrif dengan asrama', actor: { id: musyrif, role: 'supervisor' } },
      { nama: 'musyrif tanpa penugasan', actor: { id: musyrifKosong, role: 'supervisor' }, harapan: 0 },
      { nama: 'wali A', actor: { id: waliA, role: 'parent' } },
      { nama: 'wali B', actor: { id: waliB, role: 'parent' } },
      { nama: 'wali tanpa anak', actor: { id: waliTanpaAnak, role: 'parent' }, harapan: 0 },
      { nama: 'santri', actor: { id: akunSantri, role: 'student' }, harapan: 1 },
      { nama: 'akun lain', actor: { id: crypto.randomUUID(), role: 'student' }, harapan: 0 },
      { nama: 'role tak dikenal', actor: { id: 'z', role: 'teacher' }, harapan: 0 }
    ];
    for (const kasus of aktor) {
      const lama = (await service.listForActor(kasus.actor)).map((santri) => santri.id).sort();
      const baru = await semuaHalaman(kasus.actor, 7);
      assert.deepEqual([...baru.ids].sort(), lama, `${kasus.nama}: gabungan halaman berbeda dari daftar penuh.`);
      assert.equal(baru.total, lama.length, `${kasus.nama}: total salah.`);
      assert.equal(new Set(baru.ids).size, baru.ids.length, `${kasus.nama}: ada baris ganda antar halaman.`);
      if (kasus.harapan !== undefined) assert.equal(lama.length, kasus.harapan, `${kasus.nama}: jumlah santri terlihat tidak sesuai harapan.`);
    }
    // Musyrif hanya melihat asramanya dan wali hanya anaknya (bukan sekadar sama dengan yang lama).
    const daftarMusyrif = await service.listPageForActor({ id: musyrif, role: 'supervisor' }, { limit: 100 });
    assert.ok(daftarMusyrif.items.length > 0 && daftarMusyrif.items.every((santri) => santri.dormitoryId === asramaSatu));
    assert.ok(daftarMusyrif.items.every((santri) => santri.dormitoryName === 'Asrama Satu'));
    const daftarWaliB = await service.listPageForActor({ id: waliB, role: 'parent' }, { limit: 100 });
    assert.deepEqual(daftarWaliB.items.length, (await store.listStudents()).filter((s) => s.parentAccountIds.includes(waliB)).length);

    // Urutan nama, batas atas limit, dan pencarian di SQL.
    const admin = { id: 'admin-1', role: 'admin' };
    const satu = await service.listPageForActor(admin, { limit: 5 });
    assert.deepEqual(satu.items.map((s) => s.name), ['Santri 001', 'Santri 002', 'Santri 003', 'Santri 004', 'Santri 005']);
    assert.deepEqual([satu.total, satu.limit, satu.offset], [120, 5, 0]);
    assert.equal((await service.listPageForActor(admin, { limit: 100000 })).limit, 100);
    assert.equal((await service.listPageForActor(admin, { limit: 100000 })).items.length, 100);
    assert.deepEqual((await service.listPageForActor(admin, { search: 'santri 042' })).items.map((s) => s.name), ['Santri 042']);
    assert.equal((await service.listPageForActor(admin, { search: '100%' })).total, 1);
    assert.equal((await service.listPageForActor(admin, { search: '%' })).total, 1, '% dari pengguna adalah huruf biasa.');
    // Pencarian tidak melebarkan cakupan: wali A mencari nama santri milik orang lain.
    const daftarWali = await service.listPageForActor({ id: waliA, role: 'parent' }, { search: 'Santri 001' });
    assert.equal(daftarWali.total, 0, 'Pencarian tidak boleh keluar dari cakupan akses.');

    console.log(`student list page tests passed (${besar} query per halaman pada 30 dan 120 santri; ${aktor.length} cakupan setara canView)`);
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
