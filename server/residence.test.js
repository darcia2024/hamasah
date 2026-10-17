// Iqamah santri: sisa masa berlaku dan batas mulai perpanjangan, laporan santri yang dicek
// musyrif asramanya, penanda "sedang diurus", batas akses antar-asrama, dan perilaku
// sebelum migrasi 052 diterapkan.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { hitungIqamah } = require('./residence-service.js');

const SANDI = 'kata-sandi-uji-iqamah';
const HARI_MS = 24 * 60 * 60 * 1000;

function hariIni() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function geser(hari) {
  return new Date(new Date(`${hariIni()}T00:00:00Z`).getTime() + hari * HARI_MS).toISOString().slice(0, 10);
}

async function run() {
  // Perhitungan tahap tanpa database.
  assert.equal(hitungIqamah(null, '2026-10-17').tahap, 'kosong');
  assert.deepEqual(hitungIqamah('2027-01-15', '2026-10-17'), {
    expiresOn: '2027-01-15', sisaHari: 90, batasUrus: '2026-12-16', mulaiSiapkan: '2026-11-16', tahap: 'aman'
  });
  assert.equal(hitungIqamah('2026-12-16', '2026-10-17').tahap, 'siapkan', '60 hari lagi: berkas mulai disiapkan.');
  assert.equal(hitungIqamah('2026-11-16', '2026-10-17').tahap, 'urus', '30 hari lagi: wajib mulai mengurus.');
  assert.equal(hitungIqamah('2026-10-16', '2026-10-17').tahap, 'habis');

  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'kunci-bootstrap-uji',
    rateLimiter: createRelaxedRateLimiter()
  });
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
    assert.equal(hasil.status, 200, `Login ${email}: ${JSON.stringify(hasil.body)}`);
    return hasil.body.accessToken;
  }
  let admin;
  async function akun(name, email, role) {
    const hasil = await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI });
    assert.equal(hasil.status, 201, JSON.stringify(hasil.body));
    return hasil.body.account;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    admin = await masuk('admin@uji.test');

    const asramaA = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Hay Asyir', gender: 'putra', capacity: 10 })).body.dormitory;
    const asramaB = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Hay Sabi', gender: 'putra', capacity: 10 })).body.dormitory;
    const musyrifA = await akun('Musyrif A', 'musyrif-a@uji.test', 'supervisor');
    assert.equal((await api('POST', `/api/dormitories/${asramaA.id}/staff/${musyrifA.id}`, admin)).status, 201);

    async function santri(name, dormitoryId) {
      const dibuat = (await api('POST', '/api/students', admin, { name, program: 'Kuliah S1 Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', gender: 'putra' })).body.student;
      assert.equal((await api('PATCH', `/api/students/${dibuat.id}/placement`, admin, { dormitoryId, gender: 'putra' })).status, 200);
      return dibuat;
    }
    const ahmad = await santri('Ahmad Uji', asramaA.id);
    const umar = await santri('Umar Uji', asramaA.id);
    const bilal = await santri('Bilal Uji', asramaB.id);
    const akunAhmad = await akun('Ahmad Uji', 'ahmad@uji.test', 'student');
    const akunBilal = await akun('Bilal Uji', 'bilal@uji.test', 'student');
    const waliAhmad = await akun('Wali Ahmad', 'wali@uji.test', 'parent');
    await api('PATCH', `/api/students/${ahmad.id}/accounts`, admin, { studentAccountId: akunAhmad.id, parentAccountIds: [waliAhmad.id] });
    await api('PATCH', `/api/students/${bilal.id}/accounts`, admin, { studentAccountId: akunBilal.id });

    const tAhmad = await masuk('ahmad@uji.test');
    const tBilal = await masuk('bilal@uji.test');
    const tWali = await masuk('wali@uji.test');
    const tMusyrif = await masuk('musyrif-a@uji.test');

    // Belum ada tanggal: tahap kosong, dan santri/wali hanya melihat santrinya sendiri.
    const awal = await api('GET', '/api/iqamah-saya', tAhmad);
    assert.equal(awal.status, 200);
    assert.equal(awal.body.aturan.batasUrusHari, 30);
    assert.deepEqual(awal.body.students.map((s) => s.name), ['Ahmad Uji']);
    assert.equal(awal.body.students[0].iqamah.tahap, 'kosong');
    assert.deepEqual((await api('GET', '/api/iqamah-saya', tWali)).body.students.map((s) => s.name), ['Ahmad Uji']);

    // Musyrif mengisi tanggal untuk santri asramanya; 20 hari lagi berarti wajib mulai mengurus.
    const diisi = await api('PUT', `/api/students/${umar.id}/iqamah`, tMusyrif, { expiresOn: geser(20) });
    assert.equal(diisi.status, 200, JSON.stringify(diisi.body));
    assert.equal(diisi.body.iqamah.tahap, 'urus');
    assert.equal(diisi.body.iqamah.sisaHari, 20);
    assert.equal(diisi.body.iqamah.batasUrus, geser(-10));
    // Tanggal tersimpan di visa_tracking, jadi halaman Visa dan pengingat admin ikut membaca.
    const visa = (await database.query('SELECT status, visa_expires_at::text AS iqamah FROM visa_tracking WHERE student_id = $1', [umar.id])).rows[0];
    assert.deepEqual(visa, { status: 'approved', iqamah: geser(20) });
    // Bukan asrama musyrif ini, dan tanggal yang tidak masuk akal, ditolak.
    assert.equal((await api('PUT', `/api/students/${bilal.id}/iqamah`, tMusyrif, { expiresOn: geser(200) })).status, 403);
    assert.equal((await api('PUT', `/api/students/${umar.id}/iqamah`, tMusyrif, { expiresOn: geser(365 * 4) })).status, 422);
    assert.equal((await api('PUT', `/api/students/${umar.id}/iqamah`, tAhmad, { expiresOn: geser(200) })).status, 403, 'Santri tidak mengisi tanggal langsung.');

    // Santri menandai sedang mengurus; santri lain tidak bisa menandai santri ini.
    const urus = await api('PUT', `/api/students/${ahmad.id}/iqamah/pengurusan`, tAhmad, { aktif: true, note: 'Antre di Abbasiyah.' });
    assert.equal(urus.status, 200, JSON.stringify(urus.body));
    assert.equal(urus.body.pengurusan.startedOn, hariIni());
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/iqamah/pengurusan`, tBilal, { aktif: true })).status, 403);

    // Santri melapor tanggal baru: menunggu dicek, tanggal resmi belum berubah. Laporan kedua
    // menggantikan yang pertama.
    assert.equal((await api('POST', `/api/students/${ahmad.id}/iqamah/laporan`, tAhmad, { expiresOn: 'besok' })).status, 422);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/iqamah/laporan`, tBilal, { expiresOn: geser(300) })).status, 403);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/iqamah/laporan`, tAhmad, { expiresOn: geser(300) })).status, 201);
    const lapor = await api('POST', `/api/students/${ahmad.id}/iqamah/laporan`, tAhmad, { expiresOn: geser(365), note: 'Sudah diperpanjang satu tahun.' });
    assert.equal(lapor.status, 201);
    assert.equal(lapor.body.laporan.status, 'menunggu');
    assert.equal(lapor.body.laporan.expiresOn, geser(365));
    assert.equal(lapor.body.iqamah.tahap, 'kosong');
    assert.equal((await database.query("SELECT count(*)::int AS n FROM residence_reports WHERE status = 'menunggu'")).rows[0].n, 1);

    // Daftar musyrif: laporan menunggu di atas, lalu yang paling mendesak. Asrama lain ditolak.
    const daftar = await api('GET', `/api/asrama/${asramaA.id}/iqamah`, tMusyrif);
    assert.equal(daftar.status, 200);
    assert.deepEqual(daftar.body.students.map((s) => s.name), ['Ahmad Uji', 'Umar Uji']);
    assert.equal(daftar.body.students[0].pengurusan.note, 'Antre di Abbasiyah.');
    assert.equal((await api('GET', `/api/asrama/${asramaB.id}/iqamah`, tMusyrif)).status, 403);

    // Menolak wajib beralasan; menerima memindahkan tanggal ke data resmi dan melepas penanda.
    const idLaporan = lapor.body.laporan.id;
    assert.equal((await api('POST', `/api/iqamah/laporan/${idLaporan}/keputusan`, tMusyrif, { decision: 'ditolak' })).status, 422);
    const terima = await api('POST', `/api/iqamah/laporan/${idLaporan}/keputusan`, tMusyrif, { decision: 'diterima' });
    assert.equal(terima.status, 200, JSON.stringify(terima.body));
    assert.equal(terima.body.iqamah.expiresOn, geser(365));
    assert.equal(terima.body.iqamah.tahap, 'aman');
    assert.equal(terima.body.pengurusan, null);
    assert.equal(terima.body.laporan.status, 'diterima');
    assert.equal((await api('POST', `/api/iqamah/laporan/${idLaporan}/keputusan`, tMusyrif, { decision: 'diterima' })).status, 409);

    // Laporan yang ditolak terlihat oleh santri beserta alasannya.
    const lapor2 = await api('POST', `/api/students/${ahmad.id}/iqamah/laporan`, tAhmad, { expiresOn: geser(700) });
    const tolak = await api('POST', `/api/iqamah/laporan/${lapor2.body.laporan.id}/keputusan`, admin, { decision: 'ditolak', note: 'Tahun di kartu 2027, bukan 2028.' });
    assert.equal(tolak.status, 200);
    const lihat = (await api('GET', '/api/iqamah-saya', tAhmad)).body.students[0];
    assert.equal(lihat.laporan.status, 'ditolak');
    assert.equal(lihat.laporan.decisionNote, 'Tahun di kartu 2027, bukan 2028.');
    assert.equal(lihat.iqamah.expiresOn, geser(365), 'Tanggal resmi tidak berubah karena laporan ditolak.');

    // Audit mencatat laporan, pengisian, dan keputusan.
    const aksi = (await database.query("SELECT action, count(*)::int AS n FROM audit_events WHERE action LIKE 'residence.%' GROUP BY action ORDER BY action")).rows;
    assert.deepEqual(aksi, [
      { action: 'residence.report-decided', n: 2 },
      { action: 'residence.reported', n: 3 },
      { action: 'residence.updated', n: 1 }
    ]);

    // ------------------------------------------------------- sebelum migrasi 052 diterapkan
    await database.query('DROP TABLE residence_reports');
    await database.query('DROP TABLE residence_renewals');
    const tanpa = await api('GET', '/api/iqamah-saya', tAhmad);
    assert.equal(tanpa.status, 200);
    assert.equal(tanpa.body.students[0].tersedia, false);
    assert.equal(tanpa.body.students[0].iqamah.expiresOn, geser(365), 'Tanggal dari visa_tracking tetap tampil.');
    const ditolak = await api('POST', `/api/students/${ahmad.id}/iqamah/laporan`, tAhmad, { expiresOn: geser(400) });
    assert.equal(ditolak.status, 409);
    assert.match(ditolak.body.error, /Pengaturan/);
    assert.equal((await api('PUT', `/api/students/${umar.id}/iqamah`, tMusyrif, { expiresOn: geser(90) })).status, 200, 'Musyrif tetap bisa mengisi tanggal.');
    assert.equal((await api('GET', `/api/asrama/${asramaA.id}/iqamah`, tMusyrif)).body.tersedia, false);

    console.log('residence tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
