// LMS internal khusus santri: maddah dikelompokkan per program dan jenjang, hak akses mengikuti keanggotaan program
// (otomatis tambah dan cabut, pendaftaran manual tidak disentuh), dan musyrif mencatat kehadiran sesi belajar bersama.
// Juga: kelas berbayar umum dialihkan ke website learning terpisah bila diatur.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-lms-program';
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
    const A = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Kairo', gender: 'putra', capacity: 6 })).body.dormitory;
    const B = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Kairo', gender: 'putra', capacity: 6 })).body.dormitory;
    const mA = await akun('Musyrif A', 'a@uji.test', 'supervisor');
    const mB = await akun('Musyrif B', 'b@uji.test', 'supervisor');
    const guru = await akun('Guru Uji', 'guru@uji.test', 'teacher');
    await akun('Guru Lain', 'guru2@uji.test', 'teacher');
    const akunSantri = await akun('Santri Satu', 'santri1@uji.test', 'student');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const mk = async (nama, asrama) => (await api('POST', '/api/students', admin, { name: nama, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: asrama.id })).body.student;
    const s1 = await mk('Santri Satu', A);
    const s2 = await mk('Santri Dua', A);
    const s3 = await mk('Santri Tiga', B);
    await database.query('UPDATE students SET student_account_id = $1 WHERE id = $2', [akunSantri.id, s1.id]);
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tGuru = await masuk('guru@uji.test');
    const tGuru2 = await masuk('guru2@uji.test');
    const tSantri = await masuk('santri1@uji.test');

    // Program dan batch langsung di database (halaman Program sudah punya tesnya sendiri).
    const lokasi = (await database.query(`SELECT id FROM locations WHERE name = 'Hamasah Mesir'`)).rows[0];
    const program = crypto.randomUUID();
    const program2 = crypto.randomUUID();
    await database.query(`INSERT INTO programs (id, location_id, name, kind) VALUES ($1, $3, 'Program Kuliah', 'pembinaan'), ($2, $3, 'Program Mahad', 'pembinaan')`, [program, program2, lokasi.id]);
    const batch = crypto.randomUUID();
    await database.query(`INSERT INTO program_batches (id, program_id, name, starts_on, status) VALUES ($1, $2, 'Batch 1', '2026-01-01', 'berjalan')`, [batch, program]);
    await database.query(`INSERT INTO batch_participants (batch_id, student_id) VALUES ($1, $2), ($1, $3)`, [batch, s1.id, s2.id]);

    // ------------------------------------------------------------ cakupan program dan jenjang
    const maddah = (await api('POST', '/api/courses', tGuru, { title: 'Nahwu Dasar', description: 'Dasar nahwu untuk pemula santri.' })).body.course;
    const lain = (await api('POST', '/api/courses', tGuru2, { title: 'Fiqih Ibadah', description: 'Fiqih ibadah sehari-hari santri.' })).body.course;
    assert.equal((await api('PATCH', `/api/courses/${maddah.id}/cakupan`, tGuru2, { programId: program })).status, 403, 'Pengajar lain tidak boleh mengubah cakupan.');
    assert.equal((await api('PATCH', `/api/courses/${maddah.id}/cakupan`, tSantri, { programId: program })).status, 403);
    assert.equal((await api('PATCH', `/api/courses/${maddah.id}/cakupan`, tGuru, { autoAccess: true })).status, 422, 'Akses otomatis butuh program.');
    assert.equal((await api('PATCH', `/api/courses/${maddah.id}/cakupan`, tGuru, { programId: crypto.randomUUID() })).status, 404);

    // Menandai program dan jenjang tanpa akses otomatis tidak mendaftarkan siapa pun.
    const awal = await api('PATCH', `/api/courses/${maddah.id}/cakupan`, tGuru, { programId: program, level: 'Jenjang 1' });
    assert.equal(awal.status, 200, awal.teks);
    assert.equal(awal.body.added, 0);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM course_enrollments WHERE course_id = $1', [maddah.id])).rows[0].n, 0);

    // Akses otomatis mendaftarkan peserta batch aktif saja.
    const otomatis = await api('PATCH', `/api/courses/${maddah.id}/cakupan`, tGuru, { autoAccess: true });
    assert.equal(otomatis.status, 200);
    assert.equal(otomatis.body.added, 2);
    const terdaftar = async (id) => (await database.query('SELECT student_id, source FROM course_enrollments WHERE course_id = $1', [id])).rows;
    assert.deepEqual((await terdaftar(maddah.id)).map((r) => r.source), ['program', 'program']);
    assert.ok(!(await terdaftar(maddah.id)).some((r) => r.student_id === s3.id), 'Santri di luar program tidak terdaftar.');

    // Pendaftaran manual dipertahankan; yang otomatis dicabut saat santri keluar dari batch.
    assert.equal((await api('POST', `/api/students/${s3.id}/courses/${maddah.id}`, tGuru)).status, 204);
    await database.query(`UPDATE batch_participants SET status = 'keluar' WHERE student_id = $1`, [s2.id]);
    const sinkron = await api('POST', `/api/courses/${maddah.id}/sinkron`, tGuru);
    assert.equal(sinkron.status, 200);
    assert.equal(sinkron.body.removed, 1);
    const sesudah = await terdaftar(maddah.id);
    assert.deepEqual(sesudah.map((r) => r.student_id).sort(), [s1.id, s3.id].sort());
    assert.equal(sesudah.find((r) => r.student_id === s3.id).source, 'manual', 'Pendaftaran manual tidak dicabut sinkronisasi.');
    assert.equal((await api('POST', `/api/courses/${maddah.id}/sinkron`, tGuru2)).status, 403);

    // Santri yang masuk batch setelahnya mendapat akses saat membuka katalognya sendiri.
    await database.query(`INSERT INTO batch_participants (batch_id, student_id) VALUES ($1, $2)`, [batch, s3.id]);
    assert.equal((await api('GET', `/api/students/${s2.id}/katalog-belajar`, tSantri)).status, 403, 'Santri tidak membuka katalog santri lain.');

    // Katalog staf: dikelompokkan per program dan jenjang; pengajar hanya melihat miliknya.
    const katalog = await api('GET', '/api/lms/katalog', tGuru);
    assert.equal(katalog.status, 200);
    assert.deepEqual(katalog.body.groups.map((g) => [g.programName, g.level, g.courses.length]), [['Program Kuliah', 'Jenjang 1', 1]]);
    assert.equal(katalog.body.groups[0].courses[0].automatic, 1);
    const katalogAdmin = (await api('GET', '/api/lms/katalog', admin)).body.groups;
    assert.deepEqual(katalogAdmin.map((g) => g.programName), ['Program Kuliah', 'Tanpa program']);
    assert.equal((await api('GET', '/api/lms/katalog', tSantri)).status, 403);

    // Katalog santri: hanya maddah yang boleh dibukanya, dikelompokkan sama.
    await api('PATCH', `/api/courses/${lain.id}/cakupan`, admin, { programId: program2, level: 'Mahad' });
    const katSantri = await api('GET', `/api/students/${s1.id}/katalog-belajar`, tSantri);
    assert.equal(katSantri.status, 200, katSantri.teks);
    assert.deepEqual(katSantri.body.groups.map((g) => [g.programName, g.level, g.courses.map((c) => c.title)]), [['Program Kuliah', 'Jenjang 1', ['Nahwu Dasar']]], 'Maddah program lain tidak tampil.');

    // Akses mengikuti program: santri baru yang masuk batch mendapat maddah otomatis saat membuka katalog.
    await database.query(`UPDATE students SET student_account_id = NULL WHERE id = $1`, [s1.id]);
    const akun2 = await akun('Santri Dua Akun', 'santri2@uji.test', 'student');
    await database.query('UPDATE students SET student_account_id = $1 WHERE id = $2', [akun2.id, s2.id]);
    await database.query(`UPDATE batch_participants SET status = 'aktif' WHERE student_id = $1`, [s2.id]);
    const tSantri2 = await masuk('santri2@uji.test');
    const katS2 = await api('GET', `/api/students/${s2.id}/katalog-belajar`, tSantri2);
    assert.equal(katS2.status, 200, katS2.teks);
    assert.equal(katS2.body.groups[0].courses[0].title, 'Nahwu Dasar', 'Masuk batch otomatis membuka maddah program.');
    // Keluar dari batch mencabut akses otomatis pada pembukaan katalog berikutnya.
    await database.query(`UPDATE batch_participants SET status = 'keluar' WHERE student_id = $1`, [s2.id]);
    assert.deepEqual((await api('GET', `/api/students/${s2.id}/katalog-belajar`, tSantri2)).body.groups, []);

    // Mematikan akses otomatis hanya mencabut baris otomatis.
    const mati = await api('PATCH', `/api/courses/${maddah.id}/cakupan`, tGuru, { autoAccess: false });
    assert.equal(mati.status, 200);
    assert.deepEqual((await terdaftar(maddah.id)).map((r) => r.source), ['manual']);

    // ------------------------------------------------------------ sesi belajar bersama dan kehadiran
    assert.equal((await api('POST', `/api/courses/${maddah.id}/sesi`, tSantri, { title: 'Sesi' })).status, 403);
    assert.equal((await api('POST', `/api/courses/${maddah.id}/sesi`, tA, { title: 'Sesi tanpa asrama', heldOn: HARI })).status, 422, 'Musyrif wajib memilih asramanya.');
    assert.equal((await api('POST', `/api/courses/${maddah.id}/sesi`, tA, { title: 'Sesi asrama B', heldOn: HARI, dormitoryId: B.id })).status, 403);
    assert.equal((await api('POST', `/api/courses/${maddah.id}/sesi`, tA, { title: 'Sesi besok', heldOn: '2999-01-01', dormitoryId: A.id })).status, 422);
    assert.equal((await api('POST', `/api/courses/${maddah.id}/sesi`, tGuru2, { title: 'Sesi guru lain', heldOn: HARI })).status, 403, 'Pengajar hanya untuk maddah miliknya.');

    // Daftarkan s1 dan s2 manual supaya ada peserta di asrama A.
    await api('POST', `/api/students/${s1.id}/courses/${maddah.id}`, admin);
    await api('POST', `/api/students/${s2.id}/courses/${maddah.id}`, admin);
    const sesi = await api('POST', `/api/courses/${maddah.id}/sesi`, tA, { title: 'Muraja\'ah nahwu bersama', heldOn: HARI, dormitoryId: A.id });
    assert.equal(sesi.status, 201, sesi.teks);
    const detail = await api('GET', `/api/lms/sesi/${sesi.body.id}`, tA);
    assert.deepEqual(detail.body.students.map((s) => s.name), ['Santri Dua', 'Santri Satu'], 'Roster: santri asrama A yang terdaftar di maddah, bukan santri asrama B.');
    assert.equal((await api('GET', `/api/lms/sesi/${sesi.body.id}`, tB)).status, 404, 'Musyrif B tidak melihat sesi asrama A.');

    assert.equal((await api('PUT', `/api/lms/sesi/${sesi.body.id}/kehadiran`, tA, { entries: [] })).status, 422);
    assert.equal((await api('PUT', `/api/lms/sesi/${sesi.body.id}/kehadiran`, tA, { entries: [{ studentId: s1.id, status: 'ngawur' }] })).status, 422);
    assert.equal((await api('PUT', `/api/lms/sesi/${sesi.body.id}/kehadiran`, tA, { entries: [{ studentId: s3.id, status: 'hadir' }] })).status, 422, 'Santri asrama lain bukan peserta.');
    assert.equal((await api('PUT', `/api/lms/sesi/${sesi.body.id}/kehadiran`, tB, { entries: [{ studentId: s1.id, status: 'hadir' }] })).status, 404);
    const simpan = await api('PUT', `/api/lms/sesi/${sesi.body.id}/kehadiran`, tA, { entries: [{ studentId: s1.id, status: 'hadir' }, { studentId: s2.id, status: 'sakit', note: 'Demam' }] });
    assert.equal(simpan.status, 200, simpan.teks);
    await api('PUT', `/api/lms/sesi/${sesi.body.id}/kehadiran`, tA, { entries: [{ studentId: s2.id, status: 'izin' }] });
    const setelah = (await api('GET', `/api/lms/sesi/${sesi.body.id}`, tA)).body.students;
    assert.equal(setelah.find((s) => s.studentId === s2.id).status, 'izin', 'Kehadiran bisa dikoreksi.');

    const daftar = await api('GET', '/api/lms/sesi', tA);
    assert.equal(daftar.body.items.length, 1);
    assert.deepEqual([daftar.body.items[0].recorded, daftar.body.items[0].present], [2, 1]);
    assert.equal((await api('GET', '/api/lms/sesi', tB)).body.items.length, 0);
    assert.equal((await api('GET', '/api/lms/sesi', tGuru)).body.items.length, 1, 'Pemilik maddah melihat sesi maddahnya.');
    assert.equal((await api('GET', '/api/lms/sesi', tGuru2)).body.items.length, 0);

    const rekap = await api('GET', `/api/courses/${maddah.id}/kehadiran`, admin);
    assert.equal(rekap.body.sessions, 1);
    assert.deepEqual(rekap.body.items.find((r) => r.studentId === s1.id), { studentId: s1.id, name: 'Santri Satu', present: 1, excused: 0, sick: 0, absent: 0 });
    assert.equal((await api('GET', `/api/courses/${maddah.id}/kehadiran`, tGuru2)).status, 404);

    // ------------------------------------------------------------ kelas berbayar umum dialihkan
    assert.equal((await api('GET', '/api/kelas')).body.redirectUrl, null);
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'kelas.websiteBelajar': 'http://belajar.example' } })).status, 200);
    assert.equal((await api('GET', '/api/kelas')).body.redirectUrl, null, 'Alamat non-https diabaikan.');
    const set = await api('PUT', '/api/admin/settings', admin, { nilai: { 'kelas.websiteBelajar': 'https://belajar.example/kelas' } });
    assert.equal(set.status, 200, set.teks);
    await api('POST', '/api/admin/settings/lupakan-cache', admin).catch(() => {});
    const katalogUmum = await api('GET', '/api/kelas');
    assert.equal(katalogUmum.body.redirectUrl, 'https://belajar.example/kelas');
    const daftarUmum = await api('POST', '/api/kelas/daftar', null, { name: 'Pembeli', email: 'pembeli@uji.test', password: SANDI });
    assert.equal(daftarUmum.status, 409);
    assert.equal(daftarUmum.body.redirectUrl, 'https://belajar.example/kelas');
    assert.equal((await api('POST', `/api/kelas/${maddah.id}/beli`, tSantri)).status, 409);

    console.log('lms program tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
