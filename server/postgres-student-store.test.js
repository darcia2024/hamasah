const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresStudentStore } = require('./postgres-student-store.js');
const { createStudentPortalService } = require('./student-portal-service.js');

const CREATED_AT = '2026-09-15T00:00:00.000Z';

async function insertAccount(database, role, email) {
  const id = crypto.randomUUID();
  await database.query(
    'INSERT INTO accounts (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)',
    [id, email, `Akun ${role}`, role, 'hash-uji']
  );
  return id;
}

async function run() {
  const database = await createTestDatabase();
  try {
    const store = createPostgresStudentStore({ database });
    const santriAccountId = await insertAccount(database, 'student', 'santri.uji@hamasah.test');
    const waliSatu = await insertAccount(database, 'parent', 'wali1.uji@hamasah.test');
    const waliDua = await insertAccount(database, 'parent', 'wali2.uji@hamasah.test');

    assert.deepEqual(await store.listStudents(), []);
    assert.equal(await store.getStudent(crypto.randomUUID()), null);

    const studentId = crypto.randomUUID();
    const saved = await store.saveStudent({
      id: studentId,
      name: 'Abdullah Fikri',
      program: 'Kuliah Al-Azhar',
      city: 'Kairo',
      joinDate: '2026-08-20',
      status: 'active',
      studentAccountId: santriAccountId,
      parentAccountIds: [waliSatu, waliDua, waliSatu],
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    });
    assert.equal(saved.name, 'Abdullah Fikri');
    // Tanggal gabung tidak boleh bergeser sehari karena zona waktu.
    assert.equal(saved.joinDate, '2026-08-20');
    assert.deepEqual([...saved.parentAccountIds].sort(), [waliSatu, waliDua].sort());
    assert.deepEqual(await store.getStudent(studentId), saved);

    // Menyimpan ulang mengganti daftar wali, bukan menambah.
    const diperbarui = await store.saveStudent({
      ...saved,
      city: 'Hay Asyir',
      parentAccountIds: [waliDua],
      updatedAt: '2026-09-16T00:00:00.000Z'
    });
    assert.deepEqual(diperbarui.parentAccountIds, [waliDua]);
    // Mencabut semua wali benar-benar mengosongkan relasi, bukan menyisakan yang lama.
    const tanpaWali = await store.saveStudent({ ...diperbarui, parentAccountIds: [] });
    assert.deepEqual(tanpaWali.parentAccountIds, []);
    await store.saveStudent({ ...diperbarui, parentAccountIds: [waliDua] });
    assert.equal(diperbarui.city, 'Hay Asyir');
    assert.equal(diperbarui.createdAt, CREATED_AT, 'createdAt tidak boleh tertimpa saat update.');
    assert.equal((await store.listStudents()).length, 1, 'Upsert tidak boleh membuat baris kedua.');

    // Catatan per koleksi.
    const catatan = [
      ['activities', { title: 'Talaqqi pagi', description: 'Membaca kitab bersama pembina.' }],
      ['achievements', { title: 'Hafalan Juz 1', description: '' }],
      ['attendance', { status: 'present', category: 'Subuh berjamaah', note: '' }],
      ['evaluations', { area: 'Akademik', note: 'Perkembangan bahasa Arab konsisten.' }],
      ['violations', { level: 'ringan', note: 'Terlambat kembali ke asrama.' }]
    ];
    for (const [collection, isi] of catatan) {
      const entry = await store.append(collection, {
        id: crypto.randomUUID(),
        studentId,
        ...isi,
        occurredAt: CREATED_AT,
        createdAt: CREATED_AT
      });
      assert.equal(entry.studentId, studentId);
      const daftar = await store.byStudent(collection, studentId);
      assert.equal(daftar.length, 1, `Koleksi ${collection} harus berisi satu catatan.`);
      assert.deepEqual(daftar[0], entry);
    }

    // Urutan terbaru lebih dulu.
    await store.append('attendance', {
      id: crypto.randomUUID(), studentId, status: 'late', category: 'Mudzakarah malam', note: '',
      occurredAt: '2026-09-16T12:00:00.000Z', createdAt: '2026-09-16T12:00:00.000Z'
    });
    const presensi = await store.byStudent('attendance', studentId);
    assert.deepEqual(presensi.map((entry) => entry.status), ['late', 'present']);

    // Catatan santri lain tidak ikut terbawa.
    const lainId = crypto.randomUUID();
    await store.saveStudent({
      id: lainId, name: 'Santri Lain', program: 'Mahad Al-Azhar', city: 'Kairo', joinDate: '2026-08-21',
      status: 'active', studentAccountId: null, parentAccountIds: [], createdAt: CREATED_AT, updatedAt: CREATED_AT
    });
    assert.deepEqual(await store.byStudent('attendance', lainId), []);
    assert.deepEqual((await store.listStudents()).map((student) => student.name), ['Abdullah Fikri', 'Santri Lain']);

    // Nama koleksi dari luar tidak boleh menjadi nama tabel.
    await assert.rejects(() => store.append('accounts; DROP TABLE students', {}), /Koleksi catatan tidak dikenal/);
    await assert.rejects(() => store.byStudent('constructor', studentId), /Koleksi catatan tidak dikenal/);

    // Service memakai store ini apa adanya.
    const service = createStudentPortalService({ store, now: () => '2026-09-16T08:00:00.000Z' });
    const dashboard = await service.dashboard(studentId, { id: waliDua, role: 'parent' });
    assert.equal(dashboard.ok, true);
    assert.equal(dashboard.value.attendance.total, 2);
    assert.equal(dashboard.value.attendance.rate, 100);
    assert.equal(dashboard.value.achievements.length, 1);
    // Wali yang sudah dicabut kehilangan akses.
    assert.equal((await service.dashboard(studentId, { id: waliSatu, role: 'parent' })).ok, false);
    assert.equal((await service.listForActor({ id: waliDua, role: 'parent' })).length, 1);

    const dibuatService = await service.createStudent(
      { name: 'Santri Baru', program: 'Hamasah Courses', city: 'Jakarta', joinDate: '2026-09-01' },
      { id: 'admin-1', role: 'admin' }
    );
    assert.equal(dibuatService.ok, true);
    assert.equal((await store.getStudent(dibuatService.value.id)).name, 'Santri Baru');

    console.log('postgres student store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
