// Rapor bulanan: indikator dari absensi, tahfidz, disiplin, partisipasi; bobot dan batas A/B/C dari pengaturan (bukan kode);
// alur draf -> tinjau -> terbit; wali hanya melihat yang terbit; PDF mengikuti pengaturan; riwayat tidak berubah saat
// pengaturan diganti.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { periksaConfig, DEFAULT_CONFIG } = require('./report-card-service.js');

const SANDI = 'kata-sandi-uji-rapor';
const BULAN = new Date().toISOString().slice(0, 7);

async function run() {
  assert.ok(periksaConfig({ weights: { attendance: 50, tahfidz: 50, discipline: 10, participation: 0 } }, DEFAULT_CONFIG).error, 'Bobot harus berjumlah 100.');
  assert.ok(periksaConfig({ grades: { A: 60, B: 70 } }, DEFAULT_CONFIG).error, 'A harus di atas B.');
  assert.ok(periksaConfig({ publishRoles: ['supervisor'] }, DEFAULT_CONFIG).error, 'Admin tetap penerbit.');
  assert.ok(periksaConfig({ publishRoles: ['parent', 'admin'] }, DEFAULT_CONFIG).error);

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
    return { status: response.status, teks, body: teks && response.headers.get('content-type')?.includes('json') ? JSON.parse(teks) : null, headers: response.headers };
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
    const santriAkun = await akun('Santri', 'santri@uji.test', 'student');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const anak = (await api('POST', '/api/students', admin, { name: 'Santri Satu', program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: A.id })).body.student;
    await api('PATCH', `/api/students/${anak.id}/accounts`, admin, { studentAccountId: santriAkun.id, parentAccountIds: [wali.id] });
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tWali = await masuk('wali@uji.test');
    const tSantri = await masuk('santri@uji.test');

    // Pengaturan: terbaca staf, hanya admin yang mengubah, tervalidasi.
    const aturan = await api('GET', '/api/rapor/pengaturan', tA);
    assert.equal(aturan.status, 200);
    assert.deepEqual(aturan.body.config.weights, { attendance: 30, tahfidz: 35, discipline: 20, participation: 15 });
    assert.equal(aturan.body.canEdit, false);
    assert.equal((await api('GET', '/api/rapor/pengaturan', tWali)).status, 403);
    assert.equal((await api('PUT', '/api/rapor/pengaturan', tA, { grades: { A: 90, B: 80 } })).status, 403, 'Musyrif tidak mengubah pengaturan.');
    assert.equal((await api('PUT', '/api/rapor/pengaturan', admin, { weights: { attendance: 10, tahfidz: 10, discipline: 10, participation: 10 } })).status, 422);

    // Bahan penilaian: absensi kegiatan, setoran, disiplin, partisipasi.
    const jenis = (await api('GET', '/api/kegiatan/jenis', tA)).body.items[0];
    const sesi = await api('POST', '/api/kegiatan/sesi', tA, { typeId: jenis.id, date: `${BULAN}-01`, groupKind: 'asrama', dormitoryId: A.id });
    assert.equal(sesi.status, 201, sesi.teks);
    await api('PATCH', `/api/kegiatan/sesi/${sesi.body.id}`, tA, { status: 'terlaksana' });
    assert.equal((await api('PUT', `/api/kegiatan/sesi/${sesi.body.id}/absensi`, tA, { entries: [{ studentId: anak.id, status: 'hadir' }] })).status, 200);
    assert.equal((await api('POST', `/api/students/${anak.id}/setoran`, tA, { date: `${BULAN}-01`, kind: 'ziyadah', surah: 2, ayahFrom: 1, ayahTo: 20, quality: 'lancar' })).status, 201);
    assert.equal((await api('POST', `/api/students/${anak.id}/violations`, tA, { level: 'ringan', note: 'Terlambat apel pagi.' })).status, 201);
    assert.equal((await api('POST', `/api/students/${anak.id}/achievements`, tA, { title: 'Juara lomba kebersihan', description: 'Kamar terbersih.' })).status, 201);

    // Susun: hanya musyrif asrama itu; angka dari data; indikator tanpa data tidak dihitung nol.
    assert.equal((await api('POST', `/api/students/${anak.id}/rapor/${BULAN}/susun`, tB)).status, 403);
    assert.equal((await api('POST', `/api/students/${anak.id}/rapor/${BULAN}/susun`, tWali)).status, 403);
    assert.equal((await api('POST', `/api/students/${anak.id}/rapor/2999-01/susun`, tA)).status, 422, 'Bulan depan ditolak.');
    const draf = await api('POST', `/api/students/${anak.id}/rapor/${BULAN}/susun`, tA);
    assert.equal(draf.status, 200, draf.teks);
    assert.equal(draf.body.status, 'draft');
    assert.equal(draf.body.scores.attendance, 100);
    assert.equal(draf.body.scores.tahfidz, 50, '20 ayat dari target 40.');
    assert.equal(draf.body.scores.discipline, 95);
    assert.equal(draf.body.scores.participation, 25, '1 dari target 4.');
    // (100*30 + 50*35 + 95*20 + 25*15) / 100 = 70.25 -> 70 -> B
    assert.equal(draf.body.total, 70);
    assert.equal(draf.body.grade, 'B');

    // Keluarga belum melihat apa pun sebelum terbit.
    assert.equal((await api('GET', `/api/students/${anak.id}/rapor`, tWali)).body.items.length, 0);
    assert.equal((await api('GET', `/api/students/${anak.id}/rapor`, tSantri)).body.items.length, 0);
    assert.equal((await api('GET', `/api/students/${anak.id}/rapor/${BULAN}/pdf`, tWali)).status, 404);

    // Alur: harus ditinjau dulu, catatan dan rekomendasi wajib, penerbit sesuai pengaturan.
    const terbitkan = (token, body) => api('POST', `/api/students/${anak.id}/rapor/${BULAN}/terbitkan`, token, body || {});
    assert.equal((await terbitkan(admin)).status, 409, 'Belum ditinjau.');
    assert.equal((await api('PATCH', `/api/students/${anak.id}/rapor/${BULAN}`, tA, { status: 'review' })).status, 422, 'Catatan dan rekomendasi wajib.');
    assert.equal((await api('PATCH', `/api/students/${anak.id}/rapor/${BULAN}`, tA, { status: 'published' })).status, 422);
    const diajukan = await api('PATCH', `/api/students/${anak.id}/rapor/${BULAN}`, tA, { note: 'Santri rajin halaqah, perlu menjaga ketepatan waktu.', recommendation: 'Pendampingan bangun pagi.', status: 'review' });
    assert.equal(diajukan.status, 200, diajukan.teks);
    assert.equal(diajukan.body.status, 'review');
    assert.equal((await terbitkan(tA)).status, 403, 'Musyrif belum diberi wewenang menerbitkan.');
    assert.equal((await terbitkan(tWali)).status, 403);

    // Admin memberi wewenang ke musyrif lewat pengaturan, bukan lewat kode; musyrif asrama lain tetap tak bisa.
    assert.equal((await api('PUT', '/api/rapor/pengaturan', admin, { publishRoles: ['admin', 'supervisor'] })).status, 200);
    assert.equal((await terbitkan(tB)).status, 403, 'Musyrif asrama lain tetap tidak berhak.');
    // Susun ulang sebelum terbit mengembalikan ke draf.
    const ulang = await api('POST', `/api/students/${anak.id}/rapor/${BULAN}/susun`, tA);
    assert.equal(ulang.body.status, 'draft');
    assert.equal((await api('PATCH', `/api/students/${anak.id}/rapor/${BULAN}`, tA, { status: 'review' })).status, 200);

    // Ganti pengaturan: rapor draf tidak berubah sampai disusun ulang; batas A/B/C dari pengaturan.
    assert.equal((await api('PUT', '/api/rapor/pengaturan', admin, { grades: { A: 70, B: 50 } })).status, 200);
    const terbit = await terbitkan(tA);
    assert.equal(terbit.status, 200, terbit.teks);
    assert.equal(terbit.body.status, 'published');
    assert.equal(terbit.body.grade, 'B', 'Rapor memakai salinan pengaturan saat disusun.');
    assert.equal(terbit.body.publishedBy, 'Musyrif A');

    // Terbit: keluarga melihat (tanpa data internal), tidak bisa diubah atau disusun ulang.
    const keluarga = await api('GET', `/api/students/${anak.id}/rapor`, tWali);
    assert.equal(keluarga.body.items.length, 1);
    assert.equal(keluarga.body.items[0].grade, 'B');
    assert.equal(keluarga.body.items[0].generatedBy, undefined);
    assert.equal(keluarga.body.trend.length, 1);
    assert.equal(keluarga.body.pdfEnabled, true);
    assert.equal((await api('PATCH', `/api/students/${anak.id}/rapor/${BULAN}`, tA, { note: 'Ubah diam-diam setelah terbit.' })).status, 409);
    assert.equal((await api('POST', `/api/students/${anak.id}/rapor/${BULAN}/susun`, tA)).status, 409);
    assert.equal((await api('GET', `/api/students/${anak.id}/rapor`, tB)).status, 403);

    // Penyusunan ulang setelah pengaturan berganti memakai batas baru.
    assert.equal((await terbitkan(tA, { retract: true })).body.status, 'review');
    assert.equal((await api('GET', `/api/students/${anak.id}/rapor`, tWali)).body.items.length, 0, 'Ditarik: keluarga tidak melihat lagi.');
    assert.equal((await api('POST', `/api/students/${anak.id}/rapor/${BULAN}/susun`, tA)).body.grade, 'A', 'Batas baru A=70.');
    await api('PATCH', `/api/students/${anak.id}/rapor/${BULAN}`, tA, { status: 'review' });
    assert.equal((await terbitkan(tA)).status, 200);

    // PDF: terbit dan diizinkan; dimatikan lewat pengaturan.
    const pdf = await fetch(`${baseUrl}/api/students/${anak.id}/rapor/${BULAN}/pdf`, { headers: { Authorization: `Bearer ${tWali}` } });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.ok(Buffer.from(await pdf.arrayBuffer()).toString('latin1').startsWith('%PDF-1.4'));
    assert.equal((await api('PUT', '/api/rapor/pengaturan', admin, { pdfEnabled: false })).status, 200);
    assert.equal((await api('GET', `/api/students/${anak.id}/rapor/${BULAN}/pdf`, tWali)).status, 403);
    assert.equal((await api('GET', `/api/students/${anak.id}/rapor`, tWali)).body.pdfEnabled, false);
    assert.equal((await fetch(`${baseUrl}/api/students/${anak.id}/rapor/${BULAN}/pdf`, { headers: { Authorization: `Bearer ${tA}` } })).status, 200, 'Staf tetap bisa mengunduh.');

    // Ringkasan bulan untuk layar musyrif.
    const bulan = await api('GET', `/api/rapor/bulan/${BULAN}`, tA);
    assert.equal(bulan.status, 200);
    assert.equal(bulan.body.items.length, 1);
    assert.equal(bulan.body.items[0].status, 'published');
    assert.equal((await api('GET', `/api/rapor/bulan/${BULAN}`, tWali)).status, 403);

    console.log('report card tests passed');
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
