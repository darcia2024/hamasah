// Presensi per asrama: musyrif mencatat sholat dan kegiatan seluruh santri asramanya
// sekaligus; batas asrama tetap berlaku per santri, sholat bisa ditimpa, kegiatan yang
// sudah tercatat tidak ditimpa, dan satu ringkasan audit per penyimpanan.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-presensi-asrama';

function hariIniJakarta(offsetHari = 0) {
  const d = new Date(Date.now() + offsetHari * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

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
    return { status: response.status, body: teks ? JSON.parse(teks) : null };
  }
  async function masuk(email) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password: SANDI });
    assert.equal(hasil.status, 200, `Login ${email}: ${JSON.stringify(hasil.body)}`);
    return hasil.body.accessToken;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    const asramaA = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Hay Asyir', gender: 'putra', capacity: 10 })).body.dormitory;
    const asramaB = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Hay Sabi', gender: 'putra', capacity: 10 })).body.dormitory;
    const musyrif = (await api('POST', '/api/accounts', admin, { name: 'Musyrif A', email: 'musyrif@uji.test', role: 'supervisor', password: SANDI })).body.account;
    await api('POST', `/api/dormitories/${asramaA.id}/staff/${musyrif.id}`, admin);
    await api('POST', '/api/accounts', admin, { name: 'Wali Uji', email: 'wali@uji.test', role: 'parent', password: SANDI });
    const tMusyrif = await masuk('musyrif@uji.test');
    const tWali = await masuk('wali@uji.test');

    async function santri(name, dormitoryId) {
      const dibuat = (await api('POST', '/api/students', admin, { name, program: 'Kuliah S1 Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', gender: 'putra' })).body.student;
      await api('PATCH', `/api/students/${dibuat.id}/placement`, admin, { dormitoryId, gender: 'putra' });
      return dibuat;
    }
    const ahmad = await santri('Ahmad Uji', asramaA.id);
    const candra = await santri('Candra Uji', asramaA.id);
    const bilal = await santri('Bilal Uji', asramaB.id);
    const lulus = await santri('Lulus Uji', asramaA.id);
    await api('PATCH', `/api/students/${lulus.id}`, admin, { status: 'graduated' });
    const hariIni = hariIniJakarta();

    // ------------------------------------------------------------------- daftar hadir
    const daftar = await api('GET', `/api/presensi-asrama?mode=sholat&date=${hariIni}&prayer=subuh`, tMusyrif);
    assert.equal(daftar.status, 200, JSON.stringify(daftar.body));
    assert.deepEqual(daftar.body.dormitories.map((item) => item.name), ['Asrama A'], 'Musyrif hanya melihat asramanya.');
    assert.deepEqual(daftar.body.students.map((item) => [item.name, item.status]), [['Ahmad Uji', null], ['Candra Uji', null]], 'Santri lulus tidak ikut.');
    const asramaLain = await api('GET', `/api/presensi-asrama?mode=sholat&date=${hariIni}&prayer=subuh&dormitoryId=${asramaB.id}`, tMusyrif);
    assert.equal(asramaLain.body.dormitoryId, null);
    assert.deepEqual(asramaLain.body.students, []);
    assert.equal((await api('GET', `/api/presensi-asrama?mode=sholat&date=${hariIni}&prayer=subuh`, admin)).body.dormitories.length, 2);
    assert.equal((await api('GET', `/api/presensi-asrama?mode=sholat&date=${hariIni}&prayer=dhuha`, tMusyrif)).status, 422);
    assert.equal((await api('GET', '/api/presensi-asrama', tWali)).status, 403);

    // ------------------------------------------------------------------------- sholat
    const sholat = await api('POST', '/api/presensi-asrama/sholat', tMusyrif, {
      dormitoryId: asramaA.id, date: hariIni, prayer: 'subuh',
      entries: [{ studentId: ahmad.id, status: 'berjamaah' }, { studentId: candra.id, status: 'munfarid' }, { studentId: bilal.id, status: 'berjamaah' }]
    });
    assert.equal(sholat.status, 200, JSON.stringify(sholat.body));
    assert.equal(sholat.body.tersimpan, 2);
    assert.deepEqual(sholat.body.gagal.map((item) => item.studentId), [bilal.id], 'Santri asrama lain ditolak per santri.');
    // Menimpa status yang sama.
    await api('POST', '/api/presensi-asrama/sholat', tMusyrif, { dormitoryId: asramaA.id, date: hariIni, prayer: 'subuh', entries: [{ studentId: candra.id, status: 'berjamaah' }] });
    const setelah = await api('GET', `/api/presensi-asrama?mode=sholat&date=${hariIni}&prayer=subuh`, tMusyrif);
    assert.deepEqual(setelah.body.students.map((item) => item.status), ['berjamaah', 'berjamaah']);
    const rekap = await api('GET', `/api/students/${candra.id}/care`, admin);
    assert.equal(rekap.body.care.prayers.recorded, 1, 'Tidak ada baris ganda.');

    assert.equal((await api('POST', '/api/presensi-asrama/sholat', tMusyrif, { date: hariIni, prayer: 'subuh', entries: [{ studentId: ahmad.id, status: 'telat' }] })).status, 422);
    assert.equal((await api('POST', '/api/presensi-asrama/sholat', tMusyrif, { date: hariIni, prayer: 'subuh', entries: [] })).status, 422);
    const besok = await api('POST', '/api/presensi-asrama/sholat', tMusyrif, { date: hariIniJakarta(2), prayer: 'subuh', entries: [{ studentId: ahmad.id, status: 'berjamaah' }] });
    assert.equal(besok.body.tersimpan, 0, 'Tanggal yang akan datang ditolak.');

    // ----------------------------------------------------------------------- kegiatan
    const kegiatan = await api('POST', '/api/presensi-asrama/kegiatan', tMusyrif, {
      dormitoryId: asramaA.id, date: hariIni, category: 'Talaqqi pagi',
      entries: [{ studentId: ahmad.id, status: 'present' }, { studentId: candra.id, status: 'late', note: 'Terlambat 10 menit.' }]
    });
    assert.equal(kegiatan.status, 200, JSON.stringify(kegiatan.body));
    assert.equal(kegiatan.body.tersimpan, 2);
    const daftarKegiatan = await api('GET', `/api/presensi-asrama?mode=kegiatan&date=${hariIni}&category=${encodeURIComponent('Talaqqi pagi')}`, tMusyrif);
    assert.deepEqual(daftarKegiatan.body.students.map((item) => item.status), ['present', 'late']);
    assert.ok(daftarKegiatan.body.categories.includes('Talaqqi pagi'), 'Kategori yang dipakai jadi saran.');
    const ulang = await api('POST', '/api/presensi-asrama/kegiatan', tMusyrif, { dormitoryId: asramaA.id, date: hariIni, category: 'Talaqqi pagi', entries: [{ studentId: ahmad.id, status: 'absent' }] });
    assert.equal(ulang.body.tersimpan, 0, 'Kegiatan yang sudah tercatat tidak ditimpa.');
    assert.equal((await api('GET', `/api/students/${ahmad.id}/dashboard`, admin)).body.dashboard.attendance.entries[0].status, 'present');
    assert.equal((await api('POST', '/api/presensi-asrama/kegiatan', tMusyrif, { date: hariIniJakarta(2), category: 'Talaqqi pagi', entries: [{ studentId: ahmad.id, status: 'present' }] })).status, 422);
    assert.equal((await api('POST', '/api/presensi-asrama/kegiatan', tMusyrif, { date: hariIni, category: 'Ta', entries: [{ studentId: ahmad.id, status: 'present' }] })).status, 422);

    // ---------------------------------------------------------------- tugas hari ini
    const tugas = await api('GET', '/api/presensi-asrama/hari-ini', tMusyrif);
    assert.equal(tugas.status, 200, JSON.stringify(tugas.body));
    assert.equal(tugas.body.students, 2, 'Hanya santri aktif asrama A.');
    assert.deepEqual(tugas.body.sholatBelum.map((item) => [item.prayer, item.belum]), [['dzuhur', 2], ['ashar', 2], ['maghrib', 2], ['isya', 2]], 'Subuh sudah dicatat untuk keduanya.');
    assert.equal(tugas.body.izinMenunggu, 0);
    assert.deepEqual(tugas.body.kesehatan, [], 'Fitur kesehatan mati secara bawaan.');
    assert.equal((await api('GET', '/api/presensi-asrama/hari-ini', admin)).body.students, 3);
    assert.equal((await api('GET', '/api/presensi-asrama/hari-ini', tWali)).status, 403);

    const audit = (await database.query("SELECT metadata FROM audit_events WHERE action = 'dormitory.roll-recorded' ORDER BY occurred_at")).rows.map((row) => row.metadata);
    assert.equal(audit.length, 3, 'Satu ringkasan per penyimpanan yang menyimpan sesuatu.');
    assert.deepEqual([audit[0].jenis, audit[0].tersimpan, audit[0].gagal], ['sholat', 2, 1]);
    assert.ok(!JSON.stringify(audit).includes('Ahmad'), 'Tanpa nama santri di audit.');

    console.log('dormitory roll tests passed (daftar hadir, sholat, kegiatan, batas asrama, audit)');
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
