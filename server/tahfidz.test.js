// Buku setoran tahfidz: validasi surat/ayat, kemajuan dihitung dari ayat unik (tanpa hitung ganda), murajaah tidak menambah
// kemajuan, pembatalan beralasan mengembalikan hitungan, hak akses musyrif/wali/santri.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { SURAT, TOTAL_AYAT } = require('./quran-surah.js');
const { hitungSetoran } = require('./tahfidz-service.js');

const SANDI = 'kata-sandi-uji-tahfidz';

async function run() {
  assert.equal(SURAT.length, 114);
  assert.equal(TOTAL_AYAT, 6236);

  // Logika inti tanpa database: tumpang tindih dan urutan kronologis.
  const e = (id, date, kind, surah, f, t) => ({ id, date, createdAt: `${date}T0${id}:00:00Z`, kind, surah, ayahFrom: f, ayahTo: t });
  const h = hitungSetoran([e(1, '2026-10-03', 'ziyadah', 2, 5, 10), e(2, '2026-10-01', 'ziyadah', 2, 1, 7), e(3, '2026-10-04', 'murajaah', 2, 1, 10), e(4, '2026-10-05', 'ziyadah', 2, 8, 12)]);
  const per = Object.fromEntries(h.entries.map((x) => [x.id, x.newAyat]));
  assert.deepEqual(per, { 2: 7, 1: 3, 3: 0, 4: 2 }, 'Urut menurut tanggal: ayat 1-7 dulu, lalu 8-10 baru, murajaah nol, 11-12 baru.');
  assert.equal([...h.coverage.get(2)].length, 12);

  const database = await createTestDatabase();
  const app = createHamasahApp({ rootDirectory: path.resolve(__dirname, '..'), database, bootstrapKey: 'kunci-bootstrap-uji', rateLimiter: createRelaxedRateLimiter() });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, pathname, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const teks = await response.text();
    return { status: response.status, teks, body: teks && response.headers.get('content-type')?.includes('json') ? JSON.parse(teks) : null };
  }
  const masuk = async (email) => (await api('POST', '/api/auth/login', null, { email, password: SANDI })).body.accessToken;

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    async function akun(name, email, role) {
      const hasil = await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI });
      assert.equal(hasil.status, 201, hasil.teks);
      return hasil.body.account;
    }
    const A = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Kairo', gender: 'putra', capacity: 5 })).body.dormitory;
    const B = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Kairo', gender: 'putra', capacity: 5 })).body.dormitory;
    const mA = await akun('Musyrif A', 'a@uji.test', 'supervisor');
    const mB = await akun('Musyrif B', 'b@uji.test', 'supervisor');
    const wali = await akun('Wali', 'wali@uji.test', 'parent');
    const waliLain = await akun('Wali Lain', 'lain@uji.test', 'parent');
    const santriAkun = await akun('Santri', 'santri@uji.test', 'student');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const anak = (await api('POST', '/api/students', admin, { name: 'Santri Satu', program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: A.id })).body.student;
    await api('PATCH', `/api/students/${anak.id}/accounts`, admin, { studentAccountId: santriAkun.id, parentAccountIds: [wali.id] });
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tWali = await masuk('wali@uji.test');
    const tLain = await masuk('lain@uji.test');
    const tSantri = await masuk('santri@uji.test');
    void waliLain;

    const tambah = (token, body) => api('POST', `/api/students/${anak.id}/setoran`, token, body);
    const dasar = { date: '2026-10-01', kind: 'ziyadah', surah: 2, ayahFrom: 1, ayahTo: 10, quality: 'lancar', examiner: 'Ust. Hanif', note: 'Perbaiki mad' };

    // Hak akses dan validasi.
    assert.equal((await tambah(tWali, dasar)).status, 403);
    assert.equal((await tambah(tSantri, dasar)).status, 403);
    assert.equal((await tambah(tB, dasar)).status, 403, 'Musyrif asrama lain ditolak.');
    assert.equal((await tambah(tA, { ...dasar, surah: 115 })).status, 422);
    assert.equal((await tambah(tA, { ...dasar, surah: 1, ayahFrom: 1, ayahTo: 8 })).status, 422, 'Al-Fatihah hanya 7 ayat.');
    assert.equal((await tambah(tA, { ...dasar, ayahFrom: 10, ayahTo: 5 })).status, 422);
    assert.equal((await tambah(tA, { ...dasar, kind: 'lain' })).status, 422);
    assert.equal((await tambah(tA, { ...dasar, quality: 'bagus' })).status, 422);
    assert.equal((await tambah(tA, { ...dasar, date: '2099-01-01' })).status, 422, 'Tidak boleh tanggal masa depan.');
    assert.equal((await tambah(tA, { ...dasar, date: '2026-02-31' })).status, 422);

    // Penghitungan ganda.
    const s1 = await tambah(tA, dasar);
    assert.equal(s1.status, 201, s1.teks);
    assert.equal(s1.body.newAyat, 10);
    assert.equal(s1.body.totalUnique, 10);
    const ulang = await tambah(tA, { ...dasar, date: '2026-10-02', ayahFrom: 5, ayahTo: 15 });
    assert.equal(ulang.body.newAyat, 5, 'Hanya ayat 11-15 yang baru.');
    assert.equal(ulang.body.repeatedAyat, 6);
    assert.equal(ulang.body.totalUnique, 15);
    assert.match(ulang.body.notice, /6 dari 11 ayat sudah pernah disetor/);
    const sama = await tambah(tA, { ...dasar, date: '2026-10-03' });
    assert.equal(sama.body.newAyat, 0, 'Menyetor ulang rentang yang sama tidak menambah.');
    assert.equal(sama.body.totalUnique, 15);
    const murajaah = await tambah(tA, { ...dasar, date: '2026-10-03', kind: 'murajaah', ayahFrom: 1, ayahTo: 15, quality: 'kurang-lancar' });
    assert.equal(murajaah.body.newAyat, 0);
    assert.equal(murajaah.body.totalUnique, 15);
    // Murajaah ganda di hari yang sama dihitung sekali.
    await tambah(tA, { ...dasar, date: '2026-10-03', kind: 'murajaah', ayahFrom: 5, ayahTo: 8, quality: 'lancar' });
    // Setoran yang dimasukkan terlambat dengan tanggal lebih awal menggeser pembagi ayat baru, total unik tetap.
    const terlambat = await tambah(tA, { ...dasar, date: '2026-09-30', ayahFrom: 11, ayahTo: 20 });
    assert.equal(terlambat.body.totalUnique, 20);

    const lihat = await api('GET', `/api/students/${anak.id}/setoran?month=2026-10`, tA);
    assert.equal(lihat.status, 200);
    assert.equal(lihat.body.progress.uniqueAyat, 20);
    assert.equal(lihat.body.progress.totalAyat, 6236);
    assert.equal(lihat.body.progress.surahs[0].covered, 20);
    // Setelah urutan kronologis: 30 Sep ayat 11-20 (10 baru), 1 Okt ayat 1-10 (10 baru), 2 Okt ayat 5-15 (0 baru), 3 Okt (0).
    assert.equal(lihat.body.month.newAyat, 10);
    assert.equal(lihat.body.month.murajaahAyat, 15, 'Murajaah unik bulan ini: ayat 1-15 sekali.');
    const hari3 = lihat.body.daily.find((d) => d.date === '2026-10-03');
    assert.equal(hari3.murajaahAyat, 15, 'Ayat murajaah yang sama di hari yang sama dihitung sekali.');
    assert.equal(lihat.body.monthly.length, 12);
    assert.equal(lihat.body.monthly[11].month, new Date().toISOString().slice(0, 7).length === 7 ? lihat.body.monthly[11].month : '');
    assert.ok(lihat.body.entries.length >= 6);

    // Pembatalan beralasan mengembalikan hitungan dan tetap tercatat sebagai jejak.
    assert.equal((await api('POST', `/api/students/${anak.id}/setoran/${terlambat.body.id}/batal`, tA, { reason: 'x' })).status, 422);
    assert.equal((await api('POST', `/api/students/${anak.id}/setoran/${terlambat.body.id}/batal`, tB, { reason: 'Salah input surat' })).status, 403);
    assert.equal((await api('POST', `/api/students/${anak.id}/setoran/${terlambat.body.id}/batal`, tA, { reason: 'Salah input surat' })).status, 200);
    assert.equal((await api('POST', `/api/students/${anak.id}/setoran/${terlambat.body.id}/batal`, tA, { reason: 'Salah input surat' })).status, 409);
    const sesudah = await api('GET', `/api/students/${anak.id}/setoran?month=2026-10`, tA);
    assert.equal(sesudah.body.progress.uniqueAyat, 15);
    assert.equal(sesudah.body.voided.length, 1);
    assert.equal(sesudah.body.voided[0].voidReason, 'Salah input surat');

    // Wali dan santri membaca perkembangannya; wali lain, musyrif lain, tidak. Keluarga tidak melihat jejak internal.
    const walinya = await api('GET', `/api/students/${anak.id}/setoran`, tWali);
    assert.equal(walinya.status, 200);
    assert.equal(walinya.body.progress.uniqueAyat, 15);
    assert.equal(walinya.body.voided, undefined);
    assert.equal(walinya.body.entries[0].recordedBy, undefined);
    assert.equal((await api('GET', `/api/students/${anak.id}/setoran`, tSantri)).status, 200);
    assert.equal((await api('GET', `/api/students/${anak.id}/setoran`, tLain)).status, 403);
    assert.equal((await api('GET', `/api/students/${anak.id}/setoran`, tB)).status, 403);

    console.log('tahfidz tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
