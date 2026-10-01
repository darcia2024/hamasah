// Ubah data master oleh super admin: santri, asrama, akun, dan maddah (lewat HTTP,
// lengkap dengan penjagaan izin dan jejak audit).
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-master';

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
    return { status: response.status, body: teks ? JSON.parse(teks) : null };
  }
  async function masuk(email, password = SANDI) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password });
    assert.equal(hasil.status, 200, `Login ${email}: ${JSON.stringify(hasil.body)}`);
    return hasil.body.accessToken;
  }
  async function jumlahAudit(action) {
    return (await database.query('SELECT count(*)::int AS jumlah FROM audit_events WHERE action = $1', [action])).rows[0].jumlah;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    const akun = {};
    for (const [kunci, role] of [['musyrif', 'supervisor'], ['wali', 'parent'], ['guru', 'teacher'], ['guru2', 'teacher'], ['keuangan', 'finance']]) {
      const dibuat = await api('POST', '/api/accounts', admin, { name: `Akun ${kunci}`, email: `${kunci}@uji.test`, role, password: SANDI });
      assert.equal(dibuat.status, 201);
      akun[kunci] = dibuat.body.account;
    }
    const adminId = (await api('GET', '/api/me', admin)).body.account.id;

    // ---------------------------------------------------------------- asrama
    const putra = (await api('POST', '/api/dormitories', admin, { name: 'Asrama Uji Putra', area: 'Hay Asyir', gender: 'putra', capacity: 2 })).body.dormitory;
    const putri = (await api('POST', '/api/dormitories', admin, { name: 'Asrama Uji Putri', area: 'Hay Sabi', gender: 'putri', capacity: 2 })).body.dormitory;
    await api('POST', `/api/dormitories/${putra.id}/staff/${akun.musyrif.id}`, admin);
    const santri = (await api('POST', '/api/students', admin, { name: 'Santri Uji', program: 'Kuliah S1 Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', gender: 'putra', dormitoryId: putra.id })).body.student;
    await api('POST', '/api/students', admin, { name: 'Santri Uji Dua', program: 'Kuliah S1 Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', gender: 'putra', dormitoryId: putra.id });
    await api('PATCH', `/api/students/${santri.id}/accounts`, admin, { parentAccountIds: [akun.wali.id] });

    assert.equal((await api('PATCH', `/api/dormitories/${putra.id}`, admin, { capacity: 1 })).status, 422, 'Kapasitas di bawah penghuni ditolak.');
    assert.equal((await api('PATCH', `/api/dormitories/${putra.id}`, admin, { name: 'Asrama Uji Putri' })).status, 422, 'Nama kembar ditolak.');
    assert.equal((await api('PATCH', `/api/dormitories/${putra.id}`, admin, { gender: 'putri' })).status, 422, 'Jenis tidak bisa diubah selama ada penghuni.');
    const asramaBaru = await api('PATCH', `/api/dormitories/${putra.id}`, admin, { name: 'Asrama Al-Fath', capacity: 10 });
    assert.equal(asramaBaru.status, 200);
    assert.equal(asramaBaru.body.dormitory.name, 'Asrama Al-Fath');
    assert.equal(asramaBaru.body.dormitory.capacity, 10);
    assert.equal((await api('DELETE', `/api/dormitories/${putra.id}`, admin)).status, 422, 'Asrama berpenghuni tidak bisa dihapus.');
    assert.equal((await api('PATCH', `/api/dormitories/${putra.id}`, await masuk('musyrif@uji.test'), { capacity: 12 })).status, 403);

    // ---------------------------------------------------------------- santri
    assert.equal((await api('PATCH', `/api/students/${santri.id}`, await masuk('musyrif@uji.test'), { name: 'Coba' })).status, 403, 'Musyrif tidak boleh mengubah data inti.');
    assert.equal((await api('PATCH', `/api/students/${santri.id}`, admin, { joinDate: '2026-02-31' })).status, 422, 'Tanggal yang tidak ada ditolak.');
    assert.equal((await api('PATCH', `/api/students/${santri.id}`, admin, { gender: 'putri' })).status, 422, 'Jenis tidak boleh bentrok dengan asramanya.');
    const ubahSantri = await api('PATCH', `/api/students/${santri.id}`, admin, { name: 'Santri Uji Pertama', program: "Ma'had Al-Azhar" });
    assert.equal(ubahSantri.status, 200);
    assert.deepEqual(ubahSantri.body.changed.sort(), ['name', 'program']);
    assert.equal(ubahSantri.body.student.dormitoryId, putra.id, 'Masih di asramanya selama aktif.');
    const lulus = await api('PATCH', `/api/students/${santri.id}`, admin, { status: 'graduated' });
    assert.equal(lulus.status, 200);
    assert.equal(lulus.body.student.status, 'graduated');
    assert.equal(lulus.body.student.dormitoryId, null, 'Santri lulus melepas tempat di asrama.');
    assert.equal(lulus.body.releasedFromDormitory, true);
    const riwayat = await database.query('SELECT count(*)::int AS jumlah FROM student_dormitory_history WHERE student_id = $1 AND dormitory_id IS NULL', [santri.id]);
    assert.equal(riwayat.rows[0].jumlah, 1, 'Pelepasan tercatat di riwayat penempatan.');
    assert.equal(await jumlahAudit('student.updated'), 2);

    // ---------------------------------------------------------------- akun
    assert.equal((await api('PATCH', `/api/accounts/${adminId}`, admin, { role: 'finance' })).status, 422, 'Peran sendiri tidak bisa diubah.');
    assert.equal((await api('PATCH', `/api/accounts/${akun.wali.id}`, admin, { role: 'finance' })).status, 422, 'Wali yang terhubung ke santri tidak bisa diganti perannya.');
    assert.equal((await api('PATCH', `/api/accounts/${akun.keuangan.id}`, admin, { email: 'admin@uji.test' })).status, 422, 'Email kembar ditolak.');
    const sesiMusyrif = await masuk('musyrif@uji.test');
    const ubahMusyrif = await api('PATCH', `/api/accounts/${akun.musyrif.id}`, admin, { name: 'Ustadz Baru', role: 'registration-officer' });
    assert.equal(ubahMusyrif.status, 200);
    assert.deepEqual(ubahMusyrif.body.changed.sort(), ['name', 'role']);
    assert.ok(ubahMusyrif.body.sessionsRevoked >= 1, 'Sesi lama dicabut saat peran berubah.');
    assert.equal((await api('GET', '/api/me', sesiMusyrif)).status, 401, 'Token lama tidak berlaku lagi.');
    const penugasan = await database.query('SELECT count(*)::int AS jumlah FROM staff_dormitory_assignments WHERE account_id = $1', [akun.musyrif.id]);
    assert.equal(penugasan.rows[0].jumlah, 0, 'Penugasan asrama dicabut setelah tidak lagi musyrif.');

    assert.equal((await api('POST', `/api/accounts/${adminId}/password-reset`, admin)).status, 422, 'Akun sendiri memakai Ganti kata sandi.');
    const sesiKeuangan = await masuk('keuangan@uji.test');
    const reset = await api('POST', `/api/accounts/${akun.keuangan.id}/password-reset`, admin);
    assert.equal(reset.status, 200);
    assert.match(reset.body.temporaryPassword, /^sementara-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    assert.equal((await api('GET', '/api/me', sesiKeuangan)).status, 401, 'Sesi lama dicabut setelah reset.');
    await masuk('keuangan@uji.test', reset.body.temporaryPassword);
    assert.equal((await api('POST', '/api/auth/login', null, { email: 'keuangan@uji.test', password: SANDI })).status, 401, 'Kata sandi lama tidak berlaku.');
    const auditReset = await database.query("SELECT metadata FROM audit_events WHERE action = 'account.password-reset-by-admin'");
    assert.equal(auditReset.rows.length, 1);
    assert.ok(!JSON.stringify(auditReset.rows[0].metadata).includes(reset.body.temporaryPassword), 'Kata sandi tidak masuk jejak audit.');

    // ---------------------------------------------------------------- maddah
    const guru = await masuk('guru@uji.test');
    const maddah = (await api('POST', '/api/courses', guru, { title: 'Nahwu Uji', description: 'Maddah untuk pengujian ubah data.' })).body.course;
    const ubahMaddah = await api('PATCH', `/api/courses/${maddah.id}`, guru, { title: 'Nahwu Dasar Uji' });
    assert.equal(ubahMaddah.status, 200);
    assert.equal(ubahMaddah.body.course.title, 'Nahwu Dasar Uji');
    assert.equal((await api('PATCH', `/api/courses/${maddah.id}`, guru, { ownerAccountId: akun.guru2.id })).status, 403, 'Guru tidak bisa memindahkan maddah.');
    assert.equal((await api('PATCH', `/api/courses/${maddah.id}`, admin, { ownerAccountId: akun.keuangan.id })).status, 422, 'Pemilik harus akun guru.');
    const pindah = await api('PATCH', `/api/courses/${maddah.id}`, admin, { ownerAccountId: akun.guru2.id });
    assert.equal(pindah.status, 200);
    assert.equal(pindah.body.course.ownerAccountId, akun.guru2.id);
    assert.equal((await api('PATCH', `/api/courses/${maddah.id}`, guru, { title: 'Bukan milik lagi' })).status, 404, 'Guru lama tidak lagi bisa mengubahnya.');

    // ---------------------------------------------------------------- hapus asrama kosong
    await api('POST', `/api/dormitories/${putri.id}/staff/${akun.guru.id}`, admin); // ditolak: bukan musyrif
    assert.equal((await api('DELETE', `/api/dormitories/${putri.id}`, admin)).status, 204);
    assert.equal((await database.query('SELECT count(*)::int AS jumlah FROM dormitories WHERE id = $1', [putri.id])).rows[0].jumlah, 0);
    assert.equal(await jumlahAudit('dormitory.deleted'), 1);

    console.log('master data tests passed');
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
