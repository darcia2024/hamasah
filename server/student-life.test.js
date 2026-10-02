// Kehidupan santri: peta hafalan juz, pengumuman per asrama dan penerima, pengajuan izin
// dengan persetujuan musyrif asramanya, tagihan yang bisa dilihat santri sendiri, dan
// perilaku sebelum migrasi 045 diterapkan.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-kehidupan';

async function run() {
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
  async function jumlahAudit(action) {
    return (await database.query('SELECT count(*)::int AS jumlah FROM audit_events WHERE action = $1', [action])).rows[0].jumlah;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    admin = await masuk('admin@uji.test');

    // Dua asrama; musyrif A hanya memegang asrama A.
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

    // Nama musyrif asrama ikut di dashboard (tanpa email), untuk kartu profil wali.
    const profil = await api('GET', `/api/students/${ahmad.id}/dashboard`, tWali);
    assert.deepEqual(profil.body.dashboard.student.dormitory.supervisors, ['Musyrif A']);
    assert.deepEqual((await api('GET', `/api/students/${bilal.id}/dashboard`, tBilal)).body.dashboard.student.dormitory.supervisors, [], 'Asrama B tanpa musyrif.');

    // ------------------------------------------------------------------ hafalan juz
    const kosong = await api('GET', `/api/students/${ahmad.id}/juz`, tAhmad);
    assert.equal(kosong.status, 200);
    assert.equal(kosong.body.juz.length, 30);
    assert.equal(kosong.body.hafal, 0);
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/juz/30`, tMusyrif, { status: 'hafal' })).status, 200);
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/juz/29`, tMusyrif, { status: 'sedang' })).status, 200);
    assert.equal((await api('PUT', `/api/students/${bilal.id}/juz/30`, tMusyrif, { status: 'hafal' })).status, 403, 'Musyrif A tidak memegang Bilal.');
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/juz/31`, tMusyrif, { status: 'hafal' })).status, 422);
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/juz/1`, tMusyrif, { status: 'mutqin' })).status, 422);
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/juz/1`, tAhmad, { status: 'hafal' })).status, 403, 'Santri tidak menandai sendiri.');
    const peta = await api('GET', `/api/students/${ahmad.id}/juz`, tWali);
    assert.equal(peta.body.hafal, 1);
    assert.equal(peta.body.sedang, 1);
    assert.equal(peta.body.juz[29].status, 'hafal');
    assert.equal((await api('GET', `/api/students/${ahmad.id}/juz`, tBilal)).status, 403);
    await api('PUT', `/api/students/${ahmad.id}/juz/29`, admin, { status: 'belum' });
    assert.equal((await api('GET', `/api/students/${ahmad.id}/juz`, tAhmad)).body.sedang, 0);
    assert.equal(await jumlahAudit('student.juz-updated'), 3);

    // ------------------------------------------------------------------- pengumuman
    const tujuanMusyrif = await api('GET', '/api/announcements/asrama', tMusyrif);
    assert.deepEqual(tujuanMusyrif.body, { allowAll: false, dormitories: [{ id: asramaA.id, name: 'Asrama A' }] });
    assert.equal((await api('GET', '/api/announcements/asrama', admin)).body.dormitories.length, 2);
    assert.equal((await api('GET', '/api/announcements/asrama', tAhmad)).status, 403);
    const semua = await api('POST', '/api/announcements', admin, { title: 'Libur Maulid', body: 'Kegiatan talaqqi libur pada hari Maulid Nabi.', audience: 'semua' });
    assert.equal(semua.status, 201, JSON.stringify(semua.body));
    const wali = await api('POST', '/api/announcements', admin, { title: 'Info SPP', body: 'Pembayaran SPP Oktober paling lambat tanggal 10.', audience: 'wali' });
    const asramaAInfo = await api('POST', '/api/announcements', tMusyrif, { title: 'Kerja bakti', body: 'Kerja bakti Asrama A hari Jumat pagi.', audience: 'santri', dormitoryId: asramaA.id });
    assert.equal(asramaAInfo.status, 201, JSON.stringify(asramaAInfo.body));
    assert.equal((await api('POST', '/api/announcements', tMusyrif, { title: 'Untuk semua', body: 'Musyrif tidak boleh menulis ke semua asrama.', audience: 'santri' })).status, 403);
    assert.equal((await api('POST', '/api/announcements', tMusyrif, { title: 'Asrama lain', body: 'Musyrif tidak boleh menulis ke asrama B.', audience: 'santri', dormitoryId: asramaB.id })).status, 403);
    assert.equal((await api('POST', '/api/announcements', tAhmad, { title: 'Santri', body: 'Santri tidak boleh menulis pengumuman.', audience: 'semua' })).status, 403);
    assert.equal((await api('POST', '/api/announcements', admin, { title: 'Kedaluwarsa', body: 'Tanggal berakhir sudah lewat.', audience: 'semua', expiresOn: '2020-01-01' })).status, 422);

    const judul = async (token) => (await api('GET', '/api/announcements', token)).body.items.map((item) => item.title);
    assert.deepEqual(await judul(tAhmad), ['Kerja bakti', 'Libur Maulid'], 'Santri A: asramanya dan semua, tanpa yang khusus wali.');
    assert.deepEqual(await judul(tBilal), ['Libur Maulid'], 'Santri B tidak melihat pengumuman asrama A.');
    assert.deepEqual(await judul(tWali), ['Info SPP', 'Libur Maulid'], 'Wali tidak melihat yang khusus santri.');
    const milikMusyrif = (await api('GET', '/api/announcements', tMusyrif)).body.items;
    assert.deepEqual(milikMusyrif.map((item) => [item.title, item.canDelete]), [['Kerja bakti', true], ['Info SPP', false], ['Libur Maulid', false]]);
    assert.equal((await api('DELETE', `/api/announcements/${semua.body.announcement.id}`, tMusyrif)).status, 403);
    assert.equal((await api('DELETE', `/api/announcements/${asramaAInfo.body.announcement.id}`, tMusyrif)).status, 204);
    assert.equal((await api('DELETE', `/api/announcements/${wali.body.announcement.id}`, admin)).status, 204);
    assert.deepEqual(await judul(tAhmad), ['Libur Maulid']);
    assert.equal((await api('GET', '/api/announcements', null)).status, 401);

    // ------------------------------------------------------------------------ izin
    const besok = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const lusa = new Date(besok.getTime() + 6 * 60 * 60 * 1000);
    const izinBaru = { kind: 'keluar-asrama', startsAt: besok.toISOString(), endsAt: lusa.toISOString(), reason: 'Mengurus perpanjangan iqamah di Abbasiyah.' };
    const ajukan = await api('POST', `/api/students/${ahmad.id}/leave`, tAhmad, izinBaru);
    assert.equal(ajukan.status, 201, JSON.stringify(ajukan.body));
    assert.equal(ajukan.body.leave.status, 'menunggu');
    assert.equal((await api('POST', `/api/students/${bilal.id}/leave`, tAhmad, izinBaru)).status, 403, 'Santri tidak mengajukan untuk orang lain.');
    assert.equal((await api('POST', `/api/students/${ahmad.id}/leave`, tWali, izinBaru)).status, 403, 'Wali tidak mengajukan.');
    assert.equal((await api('POST', `/api/students/${ahmad.id}/leave`, tAhmad, { ...izinBaru, endsAt: besok.toISOString() })).status, 422);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/leave`, tAhmad, { ...izinBaru, kind: 'jalan-jalan' })).status, 422);

    const antrean = await api('GET', '/api/leave', tMusyrif);
    assert.deepEqual(antrean.body.items.map((item) => item.studentName), ['Ahmad Uji']);
    const izinBilal = await api('POST', `/api/students/${bilal.id}/leave`, tBilal, { ...izinBaru, kind: 'sakit', reason: 'Demam sejak semalam.' });
    assert.equal((await api('GET', '/api/leave', tMusyrif)).body.items.length, 1, 'Musyrif A tidak melihat izin asrama B.');
    assert.equal((await api('GET', '/api/leave', admin)).body.items.length, 2);
    assert.equal((await api('PATCH', `/api/leave/${izinBilal.body.leave.id}`, tMusyrif, { decision: 'disetujui' })).status, 403);
    assert.equal((await api('PATCH', `/api/leave/${ajukan.body.leave.id}`, tMusyrif, { decision: 'ditolak' })).status, 422, 'Penolakan perlu alasan.');

    const setuju = await api('PATCH', `/api/leave/${ajukan.body.leave.id}`, tMusyrif, { decision: 'disetujui', note: 'Kembali sebelum maghrib.' });
    assert.equal(setuju.status, 200, JSON.stringify(setuju.body));
    assert.equal(setuju.body.leave.status, 'disetujui');
    assert.equal(setuju.body.leave.decidedBy, 'Musyrif A');
    assert.equal((await api('PATCH', `/api/leave/${ajukan.body.leave.id}`, admin, { decision: 'ditolak', note: 'Telat' })).status, 409, 'Tidak bisa diputuskan dua kali.');
    const kehadiran = await api('GET', `/api/students/${ahmad.id}/dashboard`, tWali);
    assert.ok(kehadiran.body.dashboard.attendance.entries.some((entry) => entry.status === 'excused' && entry.category === 'Izin keluar asrama'), 'Izin disetujui tercatat di kegiatan harian.');
    assert.deepEqual((await api('GET', `/api/students/${ahmad.id}/leave`, tWali)).body.items.map((item) => item.status), ['disetujui'], 'Wali melihat izin anaknya.');
    assert.equal((await api('GET', `/api/students/${ahmad.id}/leave`, tBilal)).status, 403);

    assert.equal((await api('POST', `/api/leave/${izinBilal.body.leave.id}/batal`, tAhmad)).status, 403, 'Bukan izin miliknya.');
    assert.equal((await api('POST', `/api/leave/${izinBilal.body.leave.id}/batal`, tBilal)).status, 200);
    assert.equal((await api('POST', `/api/leave/${izinBilal.body.leave.id}/batal`, tBilal)).status, 409);
    assert.equal(await jumlahAudit('leave.requested'), 2);
    assert.equal(await jumlahAudit('leave.decided'), 1);
    assert.equal(await jumlahAudit('leave.cancelled'), 1);

    // ------------------------------------------------------------- tagihan sendiri
    const tagihan = await api('POST', '/api/operations/invoices', admin, { studentId: ahmad.id, description: 'SPP Oktober', amount: 1500000 });
    assert.equal(tagihan.status, 201);
    const lihatSendiri = await api('GET', `/api/students/${ahmad.id}/invoices`, tAhmad);
    assert.equal(lihatSendiri.status, 200, JSON.stringify(lihatSendiri.body));
    assert.deepEqual(lihatSendiri.body.items.map((item) => item.description), ['SPP Oktober']);
    assert.equal((await api('GET', `/api/students/${ahmad.id}/invoices`, tBilal)).status, 403, 'Santri lain tidak melihat tagihan Ahmad.');
    assert.equal((await api('POST', '/api/operations/invoices', tAhmad, { studentId: ahmad.id, description: 'Coba', amount: 1 })).status, 403);

    // --------------------------------------------- pesan dan doa dari wali
    const waliLain = await akun('Wali Lain', 'wali-lain@uji.test', 'parent');
    const tWaliLain = await masuk('wali-lain@uji.test');
    const doa = await api('POST', `/api/students/${ahmad.id}/doa`, tWali, { body: 'Semoga Ahmad istiqamah dan sehat selalu di Kairo.' });
    assert.equal(doa.status, 201, JSON.stringify(doa.body));
    assert.equal(doa.body.message.readAt, null);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/doa`, tWali, { body: 'Hai' })).status, 422);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/doa`, tWaliLain, { body: 'Bukan anak saya.' })).status, 403);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/doa`, tAhmad, { body: 'Santri tidak mengirim.' })).status, 403);
    assert.ok(waliLain.id);

    assert.equal((await api('GET', `/api/students/${ahmad.id}/doa`, tAhmad)).status, 403, 'Santri tidak membaca pesan wali.');
    assert.deepEqual((await api('GET', `/api/students/${ahmad.id}/doa`, tWali)).body.items.map((item) => item.body), ['Semoga Ahmad istiqamah dan sehat selalu di Kairo.']);
    const kotakMasuk = await api('GET', '/api/doa', tMusyrif);
    assert.deepEqual(kotakMasuk.body.items.map((item) => [item.studentName, item.parentName]), [['Ahmad Uji', 'Wali Ahmad']]);
    assert.equal((await api('GET', '/api/doa', tWali)).status, 403);

    // Musyrif lain (tanpa asrama A) tidak melihat dan tidak bisa menandai.
    await akun('Musyrif B', 'musyrif-b@uji.test', 'supervisor');
    const tMusyrifB = await masuk('musyrif-b@uji.test');
    assert.deepEqual((await api('GET', '/api/doa', tMusyrifB)).body.items, []);
    assert.equal((await api('POST', `/api/doa/${doa.body.message.id}/dibaca`, tMusyrifB)).status, 403);

    const dibaca = await api('POST', `/api/doa/${doa.body.message.id}/dibaca`, tMusyrif);
    assert.equal(dibaca.status, 200, JSON.stringify(dibaca.body));
    assert.equal(dibaca.body.message.readBy, 'Musyrif A');
    assert.deepEqual((await api('GET', '/api/doa', tMusyrif)).body.items, [], 'Yang sudah dibaca hilang dari kotak belum dibaca.');
    assert.equal((await api('GET', '/api/doa?status=semua', tMusyrif)).body.items.length, 1);
    assert.ok((await api('GET', `/api/students/${ahmad.id}/doa`, tWali)).body.items[0].readAt, 'Wali melihat pesannya sudah dibaca.');
    assert.equal(await jumlahAudit('family-message.sent'), 1);
    assert.equal(await jumlahAudit('family-message.read'), 1);

    // ------------------------------------------------- sebelum migrasi 045 dan 046 diterapkan
    await database.query('DROP TABLE family_messages');
    assert.equal((await api('GET', `/api/students/${ahmad.id}/doa`, tWali)).body.tersedia, false);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/doa`, tWali, { body: 'Ditolak karena tabel belum ada.' })).status, 409);
    await database.query('DROP TABLE student_juz_progress');
    await database.query('DROP TABLE announcements');
    await database.query('DROP TABLE student_leave_requests');
    const tanpaJuz = await api('GET', `/api/students/${ahmad.id}/juz`, tAhmad);
    assert.equal(tanpaJuz.body.tersedia, false);
    assert.deepEqual((await api('GET', '/api/announcements', tAhmad)).body, { tersedia: false, items: [] });
    assert.equal((await api('GET', `/api/students/${ahmad.id}/leave`, tAhmad)).body.tersedia, false);
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/juz/1`, admin, { status: 'hafal' })).status, 409);
    assert.equal((await api('POST', '/api/announcements', admin, { title: 'Uji', body: 'Ditolak karena tabel belum ada.', audience: 'semua' })).status, 409);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/leave`, tAhmad, izinBaru)).status, 409);
    assert.equal((await api('GET', `/api/students/${ahmad.id}/dashboard`, tAhmad)).status, 200, 'Dashboard tetap jalan.');

    console.log('student life tests passed (juz, pengumuman, izin, tagihan santri, sebelum migrasi)');
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
