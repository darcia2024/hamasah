// Lokasi operasional, program, dan batch: batch bukan asrama, petugas hanya menangani lokasinya,
// riwayat santri tetap melekat setelah berpindah lokasi.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-program';

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
    return { status: response.status, body: teks && response.headers.get('content-type')?.includes('json') ? JSON.parse(teks) : null };
  }
  async function masuk(email) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password: SANDI });
    assert.equal(hasil.status, 200, JSON.stringify(hasil.body));
    return hasil.body.accessToken;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    async function akun(name, email, role) {
      const hasil = await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI });
      assert.equal(hasil.status, 201, JSON.stringify(hasil.body));
      return hasil.body.account;
    }

    // Lokasi operasional Mesir dan Indonesia tersedia sejak migrasi.
    const daftar = (await api('GET', '/api/pembinaan/lokasi', admin)).body;
    assert.equal(daftar.available, true);
    const mesir = daftar.locations.find((l) => l.name === 'Hamasah Mesir');
    const indonesia = daftar.locations.find((l) => l.name === 'Hamasah Indonesia');
    assert.ok(mesir && indonesia);
    assert.deepEqual([mesir.country, indonesia.country], ['Mesir', 'Indonesia']);

    // Asrama tanpa lokasi eksplisit mengikuti negaranya. Satu asrama di Mesir, satu di Indonesia.
    const asramaMesir = (await api('POST', '/api/dormitories', admin, { name: 'Asrama Kairo', area: 'Hay Asyir, Kairo', gender: 'putra', capacity: 10 })).body.dormitory;
    const asramaIndo = (await api('POST', '/api/dormitories', admin, { name: 'Asrama Bogor', area: 'Bogor, Indonesia', gender: 'putra', capacity: 10 })).body.dormitory;
    await database.query(`UPDATE dormitories SET country = 'Indonesia' WHERE id = $1`, [asramaIndo.id]);
    const musyrifKairo = await akun('Musyrif Kairo', 'musyrif-kairo@uji.test', 'supervisor');
    const petugas = await akun('Petugas Bogor', 'petugas-bogor@uji.test', 'registration-officer');
    const guru = await akun('Guru Uji', 'guru@uji.test', 'teacher');
    assert.equal((await api('POST', `/api/dormitories/${asramaMesir.id}/staff/${musyrifKairo.id}`, admin)).status, 201);
    const tMusyrif = await masuk('musyrif-kairo@uji.test');
    const tPetugas = await masuk('petugas-bogor@uji.test');
    const tGuru = await masuk('guru@uji.test');

    // Cakupan: musyrif melihat lokasi tempat asramanya; petugas belum ditugaskan melihat kosong.
    assert.deepEqual((await api('GET', '/api/pembinaan/lokasi', tMusyrif)).body.locations.map((l) => l.name), ['Hamasah Mesir']);
    assert.deepEqual((await api('GET', '/api/pembinaan/lokasi', tPetugas)).body.locations, []);
    assert.equal((await api('GET', '/api/pembinaan/lokasi', tGuru)).status, 403);
    assert.equal((await api('GET', `/api/pembinaan/lokasi/${indonesia.id}`, tMusyrif)).status, 403, 'Lokasi lain bukan wewenang musyrif Kairo.');
    assert.equal((await api('GET', `/api/pembinaan/lokasi/${indonesia.id}`, tPetugas)).status, 403);

    // Hanya admin yang menugaskan petugas.
    assert.equal((await api('PUT', `/api/pembinaan/lokasi/${indonesia.id}/petugas`, tMusyrif, { accountId: petugas.id })).status, 403);
    assert.equal((await api('PUT', `/api/pembinaan/lokasi/${indonesia.id}/petugas`, admin, { accountId: guru.id })).status, 422, 'Guru bukan petugas lokasi.');
    assert.equal((await api('PUT', `/api/pembinaan/lokasi/${indonesia.id}/petugas`, admin, { accountId: petugas.id })).status, 200);
    assert.deepEqual((await api('GET', '/api/pembinaan/lokasi', tPetugas)).body.locations.map((l) => l.name), ['Hamasah Indonesia']);

    // Laporan lokasi: asrama, petugas, program, dan ringkasan milik lokasi itu saja.
    const laporanIndo = (await api('GET', `/api/pembinaan/lokasi/${indonesia.id}`, tPetugas)).body;
    assert.deepEqual(laporanIndo.dormitories.map((d) => d.name), ['Asrama Bogor']);
    assert.deepEqual(laporanIndo.staff.map((s) => s.name), ['Petugas Bogor']);
    const laporanMesir = (await api('GET', `/api/pembinaan/lokasi/${mesir.id}`, tMusyrif)).body;
    assert.deepEqual(laporanMesir.dormitories.map((d) => d.name), ['Asrama Kairo']);
    assert.deepEqual(laporanMesir.staff.map((s) => [s.name, s.via]), [['Musyrif Kairo', 'asrama']]);

    // Program: karantina di Indonesia, pembinaan di Mesir.
    const karantina = await api('POST', `/api/pembinaan/lokasi/${indonesia.id}/program`, tPetugas, { name: 'Karantina Persiapan Mesir', kind: 'karantina', durationDays: 90, description: 'Persiapan sebelum berangkat.' });
    assert.equal(karantina.status, 201, JSON.stringify(karantina.body));
    assert.equal((await api('POST', `/api/pembinaan/lokasi/${indonesia.id}/program`, tPetugas, { name: 'Karantina Persiapan Mesir', kind: 'karantina' })).status, 409);
    assert.equal((await api('POST', `/api/pembinaan/lokasi/${indonesia.id}/program`, tPetugas, { name: 'X', kind: 'karantina' })).status, 422);
    assert.equal((await api('POST', `/api/pembinaan/lokasi/${indonesia.id}/program`, tPetugas, { name: 'Program Aneh', kind: 'asrama' })).status, 422, 'Jenis hanya karantina atau pembinaan.');
    assert.equal((await api('POST', `/api/pembinaan/lokasi/${mesir.id}/program`, tPetugas, { name: 'Pembinaan Mesir', kind: 'pembinaan' })).status, 403);
    const pembinaan = await api('POST', `/api/pembinaan/lokasi/${mesir.id}/program`, tMusyrif, { name: 'Pembinaan Santri Al-Azhar', kind: 'pembinaan' });
    assert.equal(pembinaan.status, 201);

    // Batch: tanggal mulai wajib, tanggal selesai opsional, status berjalan bertahap.
    const batchUrl = `/api/pembinaan/program/${karantina.body.id}/batch`;
    assert.equal((await api('POST', batchUrl, tPetugas, { name: 'Batch 1' })).status, 422, 'Tanggal mulai wajib.');
    assert.equal((await api('POST', batchUrl, tPetugas, { name: 'Batch 1', startsOn: '2027-01-10', endsOn: '2027-01-01' })).status, 422);
    const batch1 = await api('POST', batchUrl, tPetugas, { name: 'Batch 1', startsOn: '2027-01-10' });
    assert.equal(batch1.status, 201, JSON.stringify(batch1.body));
    assert.equal((await api('POST', batchUrl, tPetugas, { name: 'batch 1', startsOn: '2027-02-01' })).status, 409);
    assert.equal((await api('POST', `/api/pembinaan/program/${karantina.body.id}/batch`, tMusyrif, { name: 'Batch Musyrif', startsOn: '2027-02-01' })).status, 403);
    let detail = (await api('GET', `/api/pembinaan/batch/${batch1.body.id}`, tPetugas)).body;
    assert.deepEqual([detail.batch.status, detail.batch.endsOn, detail.batch.nextStatuses], ['direncanakan', null, ['berjalan', 'dibatalkan']]);

    // Peserta: santri belum berasrama boleh ikut karantina Indonesia (batch bukan asrama).
    async function santri(name, dormitoryId) {
      const dibuat = (await api('POST', '/api/students', admin, { name, program: 'Ma\'had Al-Azhar', city: 'Bogor', joinDate: '2026-08-20', gender: 'putra' })).body.student;
      if (dormitoryId) assert.equal((await api('PATCH', `/api/students/${dibuat.id}/placement`, admin, { dormitoryId, gender: 'putra' })).status, 200);
      return dibuat;
    }
    const rizky = await santri('Rizky');
    const salman = await santri('Salman');
    const penghuniKairo = await santri('Penghuni Kairo', asramaMesir.id);
    detail = (await api('GET', `/api/pembinaan/batch/${batch1.body.id}`, tPetugas)).body;
    assert.ok(detail.candidates.some((s) => s.id === rizky.id), 'Santri tanpa asrama menjadi calon.');
    assert.ok(!detail.candidates.some((s) => s.id === penghuniKairo.id), 'Penghuni asrama Mesir bukan calon petugas Indonesia.');
    assert.equal((await api('POST', `/api/pembinaan/batch/${batch1.body.id}/peserta`, tPetugas, { studentIds: [penghuniKairo.id] })).status, 422);
    assert.equal((await api('POST', `/api/pembinaan/batch/${batch1.body.id}/peserta`, tPetugas, { studentIds: [] })).status, 422);
    assert.equal((await api('POST', `/api/pembinaan/batch/${batch1.body.id}/peserta`, tPetugas, { studentIds: [rizky.id, salman.id] })).status, 201);
    assert.equal((await api('POST', `/api/pembinaan/batch/${batch1.body.id}/peserta`, tPetugas, { studentIds: [rizky.id] })).status, 422, 'Sudah menjadi peserta aktif.');

    // Satu santri tidak aktif di dua batch dari program yang sama.
    const batch2 = await api('POST', batchUrl, tPetugas, { name: 'Batch 2', startsOn: '2027-04-10' });
    assert.equal((await api('POST', `/api/pembinaan/batch/${batch2.body.id}/peserta`, tPetugas, { studentIds: [rizky.id] })).status, 409);

    // Alur status: tidak boleh loncat; selesai meluluskan peserta aktif dan mengisi tanggal selesai.
    assert.equal((await api('PATCH', `/api/pembinaan/batch/${batch1.body.id}`, tPetugas, { status: 'selesai' })).status, 409, 'Harus berjalan dulu.');
    assert.equal((await api('PATCH', `/api/pembinaan/batch/${batch1.body.id}`, tPetugas, { status: 'berjalan' })).status, 200);
    assert.equal((await api('PATCH', `/api/pembinaan/batch/${batch1.body.id}/peserta/${salman.id}`, tPetugas, { status: 'keluar', note: 'Mengundurkan diri.' })).status, 200);
    const selesai = await api('PATCH', `/api/pembinaan/batch/${batch1.body.id}`, tPetugas, { status: 'selesai' });
    assert.equal(selesai.status, 200);
    detail = (await api('GET', `/api/pembinaan/batch/${batch1.body.id}`, tPetugas)).body;
    assert.equal(detail.batch.status, 'selesai');
    assert.match(detail.batch.endsOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(detail.participants.map((p) => [p.name, p.status]).sort(), [['Rizky', 'lulus'], ['Salman', 'keluar']]);
    assert.deepEqual(detail.candidates, [], 'Batch yang selesai tidak menerima peserta.');
    assert.equal((await api('POST', `/api/pembinaan/batch/${batch1.body.id}/peserta`, tPetugas, { studentIds: [salman.id] })).status, 409);
    assert.equal((await api('PATCH', `/api/pembinaan/batch/${batch1.body.id}`, tPetugas, { name: 'Ganti nama' })).status, 409, 'Batch tertutup tidak diubah.');
    assert.equal((await api('PATCH', `/api/pembinaan/batch/${batch2.body.id}`, tPetugas, { status: 'dibatalkan' })).status, 200);

    // Laporan lokasi mencerminkan batch dan peserta.
    const lagi = (await api('GET', `/api/pembinaan/lokasi/${indonesia.id}`, tPetugas)).body;
    assert.equal(lagi.summary.finishedBatches, 1);
    assert.equal(lagi.summary.activeBatches, 0);
    assert.equal(lagi.programs[0].batches.length, 2);

    // Santri lulus karantina lalu masuk asrama Mesir: riwayat program tetap, penempatan ikut tercatat.
    const kamar = await api('POST', `/api/asrama/${asramaMesir.id}/kamar`, admin, { name: 'K1', capacity: 3 });
    assert.equal(kamar.status, 201);
    assert.equal((await api('POST', `/api/students/${rizky.id}/kamar`, admin, { dormitoryId: asramaMesir.id, roomId: kamar.body.id, reason: 'Lulus karantina.' })).status, 200);
    const riwayat = (await api('GET', `/api/students/${rizky.id}/riwayat-pembinaan`, admin)).body;
    assert.equal(riwayat.available, true);
    const program = riwayat.items.find((i) => i.type === 'program');
    assert.deepEqual([program.title, program.location, program.country, program.status], ['Karantina Persiapan Mesir, Batch 1', 'Hamasah Indonesia', 'Indonesia', 'lulus']);
    assert.ok(riwayat.items.some((i) => i.type === 'penempatan' && /Asrama Kairo, kamar K1/.test(i.title)));
    // Batch masih terpisah dari asrama: peserta tetap tercatat walau santri kini penghuni Mesir.
    assert.equal((await api('GET', `/api/pembinaan/batch/${batch1.body.id}`, tPetugas)).body.participants.find((p) => p.name === 'Rizky').dormitory, 'Asrama Kairo');

    // Akses riwayat: santri sendiri boleh, santri lain tidak.
    await api('PATCH', `/api/students/${rizky.id}/accounts`, admin, { studentAccountId: (await akun('Rizky Akun', 'rizky@uji.test', 'student')).id });
    const tRizky = await masuk('rizky@uji.test');
    assert.equal((await api('GET', `/api/students/${rizky.id}/riwayat-pembinaan`, tRizky)).status, 200);
    assert.equal((await api('GET', `/api/students/${salman.id}/riwayat-pembinaan`, tRizky)).status, 403);
    assert.equal((await api('GET', `/api/students/${rizky.id}/riwayat-pembinaan`, tGuru)).status, 403);

    // Sebelum migrasi: pembacaan tidak jatuh, penyimpanan ditolak dengan arahan.
    await database.query('DROP TABLE batch_participants');
    await database.query('DROP TABLE program_batches CASCADE');
    await database.query('DROP TABLE programs CASCADE');
    assert.equal((await api('GET', '/api/pembinaan/lokasi', admin)).body.available, false);
    assert.equal((await api('POST', `/api/pembinaan/lokasi/${indonesia.id}/program`, admin, { name: 'Baru', kind: 'karantina' })).status, 409);

    console.log('program dan batch tests passed');
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
