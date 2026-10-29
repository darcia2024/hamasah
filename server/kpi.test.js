// KPI musyrif: indikator dapat dikonfigurasi, penilaian bulanan dari data sistem dengan penyesuaian berkomentar, finalisasi
// butuh pengaturan terkonfirmasi, rekap tahunan dan perbandingan, bukti dan pekerjaan tambahan, penghargaan bila program
// berjalan, dan ATURAN: keluhan wali yang belum diverifikasi tidak pernah menurunkan KPI.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-kpi';
const BULAN = new Date().toISOString().slice(0, 7);
const HARI = new Date().toISOString().slice(0, 10);

async function run() {
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
    const mA = await akun('Musyrif A', 'a@uji.test', 'supervisor');
    const mB = await akun('Musyrif B', 'b@uji.test', 'supervisor');
    const wali = await akun('Wali', 'wali@uji.test', 'parent');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    const anak = (await api('POST', '/api/students', admin, { name: 'Santri A', program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: A.id })).body.student;
    await api('PATCH', `/api/students/${anak.id}/accounts`, admin, { parentAccountIds: [wali.id] });
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tWali = await masuk('wali@uji.test');

    // Hak akses.
    assert.equal((await api('GET', '/api/kpi/pengaturan', tA)).status, 403);
    assert.equal((await api('GET', '/api/kpi/pengaturan', tWali)).status, 403);
    assert.equal((await api('GET', '/api/kpi/saya', tWali)).status, 403);
    assert.equal((await api('GET', '/api/kpi/saya', admin)).status, 403, 'Admin memakai tab Penilaian.');

    // Indikator: bawaan ada, dapat ditambah dan diubah.
    const aturan = await api('GET', '/api/kpi/pengaturan', admin);
    assert.equal(aturan.status, 200, aturan.teks);
    const nama = aturan.body.indicators.map((i) => i.code);
    assert.ok(['halaqah', 'sekolah', 'kajian', 'lms', 'kebersihan', 'tugas-administratif', 'pekerjaan-tambahan', 'absensi-lengkap'].every((k) => nama.includes(k)));
    assert.equal(aturan.body.indicators.find((i) => i.code === 'keluhan-terverifikasi').active, false, 'Indikator keluhan nonaktif secara bawaan.');
    assert.equal(aturan.body.config.confirmedAt, null);
    const tambahan = await api('POST', '/api/kpi/indikator', admin, { name: 'Disiplin apel pagi', source: 'manual', weight: 5 });
    assert.equal(tambahan.status, 201, tambahan.teks);
    assert.equal((await api('POST', '/api/kpi/indikator', admin, { name: 'disiplin APEL pagi', source: 'manual' })).status, 409);
    assert.equal((await api('POST', '/api/kpi/indikator', admin, { name: 'Indikator ngawur', source: 'ngawur' })).status, 422);
    assert.equal((await api('POST', '/api/kpi/indikator', tA, { name: 'Tidak boleh', source: 'manual' })).status, 403);
    const halaqah = aturan.body.indicators.find((i) => i.code === 'halaqah');
    assert.equal((await api('PATCH', `/api/kpi/indikator/${halaqah.id}`, admin, { weight: 200 })).status, 422);
    assert.equal((await api('PATCH', `/api/kpi/indikator/${halaqah.id}`, admin, { weight: 20 })).status, 200);

    // Data sumber: dua halaqah dipegang A (satu terlaksana, satu tidak), absensi lengkap, satu tiket tepat waktu.
    const jenis = (await api('GET', '/api/kegiatan/jenis', admin)).body.items;
    const tipeHalaqah = jenis.find((j) => j.name === 'Halaqah pagi');
    const buat = (tanggal, status, alasan) => api('POST', '/api/kegiatan/sesi', admin, { typeId: tipeHalaqah.id, date: tanggal, groupKind: 'asrama', dormitoryId: A.id, staffAccountId: mA.id }).then(async (s) => {
      assert.equal(s.status, 201, s.teks);
      assert.equal((await api('PATCH', `/api/kegiatan/sesi/${s.body.id}`, admin, { status, reason: alasan })).status, 200);
      return s.body.id;
    });
    const s1 = await buat(`${BULAN}-01`, 'terlaksana');
    await buat(`${BULAN}-02`, 'tidak-terlaksana', 'Listrik padam seharian');
    assert.equal((await api('PUT', `/api/kegiatan/sesi/${s1}/absensi`, tA, { entries: [{ studentId: anak.id, status: 'hadir' }] })).status, 200);

    // Keluhan wali yang BELUM diverifikasi: tidak memengaruhi apa pun.
    const keluhan = await api('POST', '/api/masukan', tWali, { kind: 'keluhan', subject: 'Keluhan tentang musyrif', body: 'Musyrif jarang terlihat di asrama pada malam hari.', studentId: anak.id });
    assert.equal(keluhan.status, 201, keluhan.teks);
    // Aktifkan indikator keluhan agar pengaruhnya benar-benar teruji.
    const ik = aturan.body.indicators.find((i) => i.code === 'keluhan-terverifikasi');
    assert.equal((await api('PATCH', `/api/kpi/indikator/${ik.id}`, admin, { active: true, weight: 10 })).status, 200);

    // Penilaian: hanya admin; bulan depan ditolak; hitung dari data.
    assert.equal((await api('POST', '/api/kpi/penilaian', tA, { musyrifId: mA.id, month: BULAN })).status, 403);
    assert.equal((await api('POST', '/api/kpi/penilaian', admin, { musyrifId: mA.id, month: '2999-01' })).status, 422);
    assert.equal((await api('POST', '/api/kpi/penilaian', admin, { musyrifId: wali.id, month: BULAN })).status, 404, 'Hanya akun musyrif.');
    const hitung = await api('POST', '/api/kpi/penilaian', admin, { musyrifId: mA.id, month: BULAN });
    assert.equal(hitung.status, 200, hitung.teks);
    const ev = hitung.body;
    const skor = (kode) => ev.items.find((i) => i.code === kode);
    assert.equal(skor('halaqah').autoScore, 50, '1 dari 2 halaqah terlaksana.');
    assert.equal(skor('sekolah').autoScore, null, 'Tanpa kegiatan: tidak dihitung nol.');
    assert.equal(skor('absensi-lengkap').autoScore, 100);
    assert.equal(skor('keluhan-terverifikasi').autoScore, 100, 'Keluhan belum diverifikasi tidak menurunkan KPI.');
    const totalSebelum = ev.total;
    assert.ok(totalSebelum !== null);
    assert.ok(ev.missing.includes('Pendampingan sekolah'));
    // halaqah 50 (bobot 20), absensi 100 (15), keluhan 100 (10), disiplin apel: manual tanpa nilai.
    assert.equal(totalSebelum, Math.round((50 * 20 + 100 * 15 + 100 * 10) / 45));

    // Verifikasi keluhan: hanya admin, wajib catatan, hanya keluhan; tanpa tautan tidak berpengaruh.
    assert.equal((await api('PATCH', `/api/masukan/${keluhan.body.id}/verifikasi`, tA, { note: 'Sudah dicek ke asrama.' })).status, 403);
    assert.equal((await api('PATCH', `/api/masukan/${keluhan.body.id}/verifikasi`, admin, { note: 'x' })).status, 422);
    assert.equal((await api('PATCH', `/api/masukan/${keluhan.body.id}/verifikasi`, admin, { note: 'Sudah dicek ke asrama, benar terjadi.' })).status, 200);
    assert.equal((await api('POST', '/api/kpi/penilaian', admin, { musyrifId: mA.id, month: BULAN })).body.total, totalSebelum, 'Verifikasi tanpa tautan tidak memengaruhi KPI.');
    assert.equal((await api('PATCH', `/api/masukan/${keluhan.body.id}/verifikasi`, admin, { note: 'Sudah dicek ke asrama, benar terjadi.', kpiAccountId: wali.id })).status, 422, 'Tautan harus ke musyrif.');
    assert.equal((await api('PATCH', `/api/masukan/${keluhan.body.id}/verifikasi`, admin, { note: 'Sudah dicek ke asrama, benar terjadi.', kpiAccountId: mA.id })).status, 200);
    const sesudah = (await api('POST', '/api/kpi/penilaian', admin, { musyrifId: mA.id, month: BULAN })).body;
    assert.equal(sesudah.items.find((i) => i.code === 'keluhan-terverifikasi').autoScore, 80, 'Hanya keluhan terverifikasi yang mengurangi 20 poin.');
    assert.ok(sesudah.total < totalSebelum);

    // Penyesuaian wajib berkomentar; komentar penilai tersimpan.
    const id = sesudah.id;
    assert.equal((await api('PATCH', `/api/kpi/penilaian/${id}`, admin, { adjustments: { [ik.id]: { score: 100 } } })).status, 422);
    assert.equal((await api('PATCH', `/api/kpi/penilaian/${id}`, admin, { adjustments: { [ik.id]: { score: 150, comment: 'Di luar rentang.' } } })).status, 422);
    const disesuaikan = await api('PATCH', `/api/kpi/penilaian/${id}`, admin, { adjustments: { [ik.id]: { score: 100, comment: 'Keluhan sudah diselesaikan musyrif bersama wali.' } }, comment: 'Kinerja baik bulan ini.' });
    assert.equal(disesuaikan.status, 200, disesuaikan.teks);
    assert.equal(disesuaikan.body.items.find((i) => i.code === 'keluhan-terverifikasi').adjusted, true);
    assert.equal(disesuaikan.body.total, totalSebelum);
    // Hitung ulang menjaga penyesuaian dan komentar.
    const ulang = (await api('POST', '/api/kpi/penilaian', admin, { musyrifId: mA.id, month: BULAN })).body;
    assert.equal(ulang.total, totalSebelum);
    assert.equal(ulang.comment, 'Kinerja baik bulan ini.');

    // Finalisasi butuh pengaturan terkonfirmasi.
    const gagalFinal = await api('POST', `/api/kpi/penilaian/${id}/final`, admin);
    assert.equal(gagalFinal.status, 409);
    assert.match(gagalFinal.body.error, /dikonfirmasi/);
    assert.equal((await api('PUT', '/api/kpi/pengaturan', tA, { confirm: true })).status, 403);
    assert.equal((await api('PUT', '/api/kpi/pengaturan', admin, { grades: { A: 60, B: 80 } })).status, 422);
    assert.equal((await api('PUT', '/api/kpi/pengaturan', admin, { grades: { A: 80, B: 60 }, rewardEnabled: true })).status, 200);
    // Musyrif belum melihat penilaian yang masih draf.
    assert.equal((await api('GET', '/api/kpi/saya', tA)).body.evaluations.length, 0);
    const final = await api('POST', `/api/kpi/penilaian/${id}/final`, admin);
    assert.equal(final.status, 200, final.teks);
    assert.equal(final.body.status, 'final');
    assert.equal(final.body.grade, 'B');
    assert.equal((await api('PATCH', `/api/kpi/penilaian/${id}`, admin, { comment: 'Ubah diam-diam.' })).status, 409);
    assert.equal((await api('POST', '/api/kpi/penilaian', admin, { musyrifId: mA.id, month: BULAN })).status, 409);

    // Musyrif melihat KPI dirinya sendiri (final), bukan milik orang lain.
    const saya = await api('GET', '/api/kpi/saya', tA);
    assert.equal(saya.status, 200);
    assert.equal(saya.body.evaluations.length, 1);
    assert.equal(saya.body.annual.average, totalSebelum);
    assert.equal((await api('GET', '/api/kpi/saya', tB)).body.evaluations.length, 0);

    // Bukti dan komentar penilai.
    assert.equal((await api('POST', '/api/kpi/bukti', tA, { month: BULAN, description: 'ab' })).status, 422);
    assert.equal((await api('POST', '/api/kpi/bukti', tA, { month: '2999-01', description: 'Bukti halaqah pekan 1.' })).status, 422);
    assert.equal((await api('POST', '/api/kpi/bukti', tA, { month: BULAN, description: 'Bukti halaqah pekan 1.', fileId: '00000000-0000-4000-8000-000000000000' })).status, 422);
    assert.equal((await api('POST', '/api/kpi/bukti', tWali, { month: BULAN, description: 'Bukti halaqah pekan 1.' })).status, 403);
    const bukti = await api('POST', '/api/kpi/bukti', tA, { month: BULAN, indicatorId: halaqah.id, description: 'Daftar hadir halaqah pekan pertama terlampir.' });
    assert.equal(bukti.status, 201, bukti.teks);
    assert.equal((await api('PATCH', `/api/kpi/bukti/${bukti.body.id}/komentar`, tA, { comment: 'Bagus sekali.' })).status, 403);
    assert.equal((await api('PATCH', `/api/kpi/bukti/${bukti.body.id}/komentar`, admin, { comment: 'Bukti sesuai catatan sistem.' })).status, 200);
    assert.equal((await api('GET', '/api/kpi/saya', tA)).body.evidence[0].reviewerComment, 'Bukti sesuai catatan sistem.');
    assert.equal((await api('GET', `/api/kpi/penilaian?musyrifId=${mA.id}&month=${BULAN}`, admin)).body.evidence.length, 1);

    // Pekerjaan tambahan: diajukan musyrif, diverifikasi admin, lalu menjadi bonus pada penilaian bulan itu.
    const kerja = await api('POST', '/api/kpi/pekerjaan-tambahan', tA, { workDate: HARI, kind: 'santri-sakit', description: 'Mengantar santri sakit ke rumah sakit dan mengurus administrasinya.' });
    assert.equal(kerja.status, 201, kerja.teks);
    assert.equal((await api('POST', '/api/kpi/pekerjaan-tambahan', tA, { workDate: '2999-01-01', kind: 'santri-sakit', description: 'Pekerjaan masa depan.' })).status, 422);
    assert.equal((await api('POST', '/api/kpi/pekerjaan-tambahan', tA, { workDate: HARI, kind: 'ngawur', description: 'Pekerjaan aneh sekali.' })).status, 422);
    assert.equal((await api('PATCH', `/api/kpi/pekerjaan-tambahan/${kerja.body.id}`, tA, { decision: 'diverifikasi' })).status, 403);
    assert.equal((await api('PATCH', `/api/kpi/pekerjaan-tambahan/${kerja.body.id}`, admin, { decision: 'ditolak' })).status, 422);
    assert.equal((await api('GET', '/api/kpi/pekerjaan-tambahan?status=diajukan', admin)).body.items.length, 1);
    assert.equal((await api('PATCH', `/api/kpi/pekerjaan-tambahan/${kerja.body.id}`, admin, { decision: 'diverifikasi', note: 'Sudah dikonfirmasi ke rumah sakit.' })).status, 200);
    assert.equal((await api('PATCH', `/api/kpi/pekerjaan-tambahan/${kerja.body.id}`, admin, { decision: 'ditolak', note: 'Sudah diputuskan sebelumnya.' })).status, 409);
    const bulanB = (await api('POST', '/api/kpi/penilaian', admin, { musyrifId: mB.id, month: BULAN })).body;
    assert.equal(bulanB.items.find((i) => i.code === 'pekerjaan-tambahan').autoScore, null, 'Tanpa pekerjaan tambahan: bonus tidak mengurangi.');
    assert.equal(bulanB.items.find((i) => i.code === 'halaqah').autoScore, null);

    // Penghargaan hanya bila program dijalankan (sudah diaktifkan di atas).
    assert.equal((await api('POST', '/api/kpi/penghargaan', tA, { musyrifId: mA.id, title: 'Musyrif teladan' })).status, 403);
    assert.equal((await api('POST', '/api/kpi/penghargaan', admin, { musyrifId: mA.id, title: 'Musyrif teladan', reason: 'Konsisten sepanjang bulan.' })).status, 201);
    assert.equal((await api('GET', '/api/kpi/saya', tA)).body.rewards.length, 1);
    assert.equal((await api('GET', '/api/kpi/saya', tB)).body.rewards.length, 0);
    assert.equal((await api('PUT', '/api/kpi/pengaturan', admin, { rewardEnabled: false })).status, 200);
    assert.equal((await api('POST', '/api/kpi/penghargaan', admin, { musyrifId: mA.id, title: 'Penghargaan lain' })).status, 409);
    assert.equal((await api('GET', '/api/kpi/saya', tA)).body.rewards.length, 0, 'Riwayat penghargaan tersembunyi bila program tidak berjalan.');

    // Perbandingan kinerja: hanya admin, hanya penilaian final.
    assert.equal((await api('GET', '/api/kpi/perbandingan', tA)).status, 403);
    const banding = await api('GET', `/api/kpi/perbandingan?year=${BULAN.slice(0, 4)}`, admin);
    assert.equal(banding.status, 200);
    const barisA = banding.body.items.find((r) => r.musyrifId === mA.id);
    const barisB = banding.body.items.find((r) => r.musyrifId === mB.id);
    assert.equal(barisA.average, totalSebelum);
    assert.equal(barisA.months[BULAN], totalSebelum);
    assert.equal(barisB.average, null, 'Draf tidak masuk perbandingan.');

    console.log('kpi tests passed');
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
