// Absensi kegiatan: jenis bisa ditambah admin, sesi punya jadwal/lokasi/kelompok/petugas, musyrif hanya mengisi santri
// asramanya, status sesi terpisah dari absensi santri, koreksi wajib beralasan dan berjejak, rekap per santri/asrama/kegiatan.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-absensi';

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
    const B = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Kairo', gender: 'putra', capacity: 5 })).body.dormitory;
    const musyrifA = await akun('Musyrif A', 'a@uji.test', 'supervisor');
    const musyrifB = await akun('Musyrif B', 'b@uji.test', 'supervisor');
    await akun('Wali', 'wali@uji.test', 'parent');
    await api('POST', `/api/dormitories/${A.id}/staff/${musyrifA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${musyrifB.id}`, admin);
    const mk = async (nama, asrama) => (await api('POST', '/api/students', admin, { name: nama, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: asrama.id })).body.student;
    const a1 = await mk('Santri A1', A);
    const a2 = await mk('Santri A2', A);
    const b1 = await mk('Santri B1', B);
    const tAdmin = admin;
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tWali = await masuk('wali@uji.test');

    // Jenis kegiatan: bawaan ada, hanya admin yang menambah.
    const jenis = await api('GET', '/api/kegiatan/jenis', tA);
    assert.equal(jenis.status, 200);
    assert.ok(jenis.body.items.some((j) => j.name === 'Halaqah pagi'));
    assert.equal((await api('POST', '/api/kegiatan/jenis', tA, { name: 'Olahraga' })).status, 403);
    assert.equal((await api('GET', '/api/kegiatan/jenis', tWali)).status, 403);
    const baru = await api('POST', '/api/kegiatan/jenis', tAdmin, { name: 'Olahraga pagi', description: 'Senam bersama' });
    assert.equal(baru.status, 201, baru.teks);
    assert.equal((await api('POST', '/api/kegiatan/jenis', tAdmin, { name: 'olahraga PAGI' })).status, 409, 'Nama kembar ditolak.');
    const halaqah = jenis.body.items.find((j) => j.name === 'Halaqah pagi');

    // Sesi: validasi, batas asrama.
    const sesiBody = (ekstra) => ({ typeId: halaqah.id, date: '2026-10-05', startTime: '05:30', endTime: '06:30', location: 'Musholla', groupKind: 'asrama', dormitoryId: A.id, staffAccountId: musyrifA.id, ...ekstra });
    assert.equal((await api('POST', '/api/kegiatan/sesi', tA, sesiBody({ date: '2026-13-40' }))).status, 422);
    assert.equal((await api('POST', '/api/kegiatan/sesi', tA, sesiBody({ endTime: '05:00' }))).status, 422);
    assert.equal((await api('POST', '/api/kegiatan/sesi', tA, sesiBody({ dormitoryId: B.id }))).status, 403, 'Musyrif tidak membuat sesi untuk asrama lain.');
    assert.equal((await api('POST', '/api/kegiatan/sesi', tA, sesiBody({ groupKind: 'semua', dormitoryId: undefined }))).status, 403, 'Sesi semua santri hanya admin.');
    assert.equal((await api('POST', '/api/kegiatan/sesi', tA, sesiBody({ staffAccountId: (await akun('Wali Dua', 'wali2@uji.test', 'parent')).id }))).status, 422, 'Petugas harus admin atau musyrif.');
    const sesi = await api('POST', '/api/kegiatan/sesi', tA, sesiBody());
    assert.equal(sesi.status, 201, sesi.teks);
    assert.equal(sesi.body.status, 'terjadwal');
    assert.equal(sesi.body.participants, 2);
    const sesiSemua = await api('POST', '/api/kegiatan/sesi', tAdmin, sesiBody({ groupKind: 'semua', dormitoryId: undefined, date: '2026-10-06', staffAccountId: undefined }));
    assert.equal(sesiSemua.status, 201, sesiSemua.teks);
    assert.equal(sesiSemua.body.participants, 3);

    // Musyrif B tidak melihat/mengelola sesi asrama A.
    assert.ok(!(await api('GET', '/api/kegiatan/sesi', tB)).body.items.some((s) => s.id === sesi.body.id));
    assert.equal((await api('GET', `/api/kegiatan/sesi/${sesi.body.id}`, tB)).status, 403);

    // Absensi butuh sesi terlaksana (tidak disimpulkan dari ketidakhadiran).
    const isi = (token, id, entries, reason) => api('PUT', `/api/kegiatan/sesi/${id}/absensi`, token, { entries, reason });
    let hasil = await isi(tA, sesi.body.id, [{ studentId: a1.id, status: 'hadir' }]);
    assert.equal(hasil.status, 409);
    assert.match(hasil.body.error, /terlaksana/);
    assert.equal((await api('PATCH', `/api/kegiatan/sesi/${sesi.body.id}`, tA, { status: 'tidak-terlaksana' })).status, 422, 'Alasan wajib.');
    assert.equal((await api('PATCH', `/api/kegiatan/sesi/${sesi.body.id}`, tB, { status: 'terlaksana' })).status, 403);
    assert.equal((await api('PATCH', `/api/kegiatan/sesi/${sesi.body.id}`, tA, { status: 'terlaksana' })).status, 200);

    // Pengisian: peserta saja, dalam batas musyrif.
    assert.equal((await isi(tA, sesi.body.id, [{ studentId: b1.id, status: 'hadir' }])).status, 403, 'Santri asrama lain ditolak.');
    assert.equal((await isi(tA, sesi.body.id, [{ studentId: a1.id, status: 'telat' }])).status, 422);
    hasil = await isi(tA, sesi.body.id, [{ studentId: a1.id, status: 'hadir' }, { studentId: a2.id, status: 'sakit', note: 'Demam' }]);
    assert.equal(hasil.status, 200, hasil.teks);
    assert.equal(hasil.body.recorded, 2);

    // Koreksi wajib beralasan dan berjejak; yang sama dilewati.
    assert.equal((await isi(tA, sesi.body.id, [{ studentId: a2.id, status: 'izin' }])).status, 422);
    hasil = await isi(tA, sesi.body.id, [{ studentId: a2.id, status: 'izin' }, { studentId: a1.id, status: 'hadir' }], 'Surat izin menyusul dari wali');
    assert.equal(hasil.status, 200, hasil.teks);
    assert.deepEqual([hasil.body.recorded, hasil.body.corrected, hasil.body.unchanged], [0, 1, 1]);
    const rincian = await api('GET', `/api/kegiatan/sesi/${sesi.body.id}`, tA);
    assert.equal(rincian.body.students.find((s) => s.id === a2.id).status, 'izin');
    assert.equal(rincian.body.corrections.length, 1);
    assert.equal(rincian.body.corrections[0].reason, 'Surat izin menyusul dari wali');
    assert.equal(rincian.body.corrections[0].from, 'sakit');
    // Sesi yang sudah punya absensi tidak bisa dinyatakan tidak terlaksana begitu saja.
    assert.equal((await api('PATCH', `/api/kegiatan/sesi/${sesi.body.id}`, tA, { status: 'tidak-terlaksana', reason: 'Listrik padam' })).status, 409);

    // Sesi semua santri: musyrif hanya mengisi santrinya.
    await api('PATCH', `/api/kegiatan/sesi/${sesiSemua.body.id}`, tAdmin, { status: 'terlaksana' });
    assert.equal((await isi(tA, sesiSemua.body.id, [{ studentId: a1.id, status: 'alpa' }])).status, 200);
    assert.equal((await isi(tA, sesiSemua.body.id, [{ studentId: b1.id, status: 'hadir' }])).status, 403);
    const rosterA = await api('GET', `/api/kegiatan/sesi/${sesiSemua.body.id}`, tA);
    assert.deepEqual(rosterA.body.students.map((s) => s.name).sort(), ['Santri A1', 'Santri A2'], 'Musyrif melihat daftar santrinya saja.');

    // Sesi tidak terlaksana tidak menghukum siapa pun dan tidak masuk rekap.
    const sesiBatal = await api('POST', '/api/kegiatan/sesi', tAdmin, sesiBody({ date: '2026-10-07' }));
    assert.equal((await api('PATCH', `/api/kegiatan/sesi/${sesiBatal.body.id}`, tAdmin, { status: 'tidak-terlaksana', reason: 'Listrik padam seharian' })).status, 200);
    assert.equal((await isi(tAdmin, sesiBatal.body.id, [{ studentId: a1.id, status: 'alpa' }])).status, 409);

    // Rekap: per santri, asrama, kegiatan; bulan dan tahun.
    const rekapSantri = await api('GET', '/api/kegiatan/rekap?by=santri&period=bulan&value=2026-10', tA);
    assert.equal(rekapSantri.status, 200, rekapSantri.teks);
    const r1 = rekapSantri.body.items.find((i) => i.label === 'Santri A1');
    assert.deepEqual([r1.hadir, r1.alpa, r1.sessions, r1.rate], [1, 1, 2, 50]);
    const r2 = rekapSantri.body.items.find((i) => i.label === 'Santri A2');
    assert.deepEqual([r2.izin, r2.belum], [1, 1]);
    assert.equal(r2.rate, null, 'Tanpa hadir atau alpa, persentase tidak dihitung.');
    assert.equal(rekapSantri.body.sessionsNotHeld.notHeld, 1);
    assert.ok(!rekapSantri.body.items.some((i) => i.label === 'Santri B1'), 'Musyrif A tidak melihat santri asrama B.');
    const rekapAsrama = await api('GET', '/api/kegiatan/rekap?by=asrama&period=tahun&value=2026', tAdmin);
    assert.ok(rekapAsrama.body.items.some((i) => i.label === 'Asrama A'));
    const rekapKegiatan = await api('GET', '/api/kegiatan/rekap?by=kegiatan&period=bulan&value=2026-10', tAdmin);
    assert.ok(rekapKegiatan.body.items.some((i) => i.label === 'Halaqah pagi'));
    assert.equal((await api('GET', '/api/kegiatan/rekap?by=santri&period=bulan&value=oktober', tA)).status, 422);

    console.log('activity attendance tests passed');
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
