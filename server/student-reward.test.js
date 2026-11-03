// Hadiah santri: dicatat admin dengan jenis yang mendidik, dibaca sesuai cakupan, dan pembatalan tidak menghapus riwayat.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-hadiah';
const HARI = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

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
    return { status: response.status, teks, body: teks.startsWith('{') ? JSON.parse(teks) : null };
  }
  const masuk = async (email) => (await api('POST', '/api/auth/login', null, { email, password: SANDI })).body.accessToken;

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    const akun = async (name, email, role) => (await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI })).body.account;
    const A = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Kairo', gender: 'putra', capacity: 5 })).body.dormitory;
    const B = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Kairo', gender: 'putra', capacity: 5 })).body.dormitory;
    const mA = await akun('Musyrif A', 'a@uji.test', 'supervisor');
    const mB = await akun('Musyrif B', 'b@uji.test', 'supervisor');
    const wali = await akun('Wali', 'wali@uji.test', 'parent');
    const waliLain = await akun('Wali Lain', 'lain@uji.test', 'parent');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const buatSantri = async (name, asrama) => (await api('POST', '/api/students', admin, { name, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: asrama.id })).body.student;
    const anak = await buatSantri('Santri Satu', A);
    const anakLain = await buatSantri('Santri Dua', B);
    await api('PATCH', `/api/students/${anak.id}/accounts`, admin, { parentAccountIds: [wali.id] });
    await api('PATCH', `/api/students/${anakLain.id}/accounts`, admin, { parentAccountIds: [waliLain.id] });
    const [tA, tB, tWali, tLain] = await Promise.all(['a@uji.test', 'b@uji.test', 'wali@uji.test', 'lain@uji.test'].map(masuk));

    const baik = { studentId: anak.id, kind: 'buku', title: 'Kitab Riyadhus Shalihin', reason: 'Khatam hafalan Juz 30.', awardedOn: HARI };

    // Hanya admin yang mencatat; isian divalidasi.
    assert.equal((await api('POST', '/api/hadiah', tA, baik)).status, 403, 'Musyrif tidak mencatat hadiah.');
    assert.equal((await api('POST', '/api/hadiah', tWali, baik)).status, 403);
    for (const salah of [{ kind: 'uang' }, { title: 'x' }, { reason: 'x' }, { awardedOn: '2999-01-01' }, { awardedOn: 'kemarin' }, { studentId: 'bukan-id' }]) {
      assert.equal((await api('POST', '/api/hadiah', admin, { ...baik, ...salah })).status, 422, JSON.stringify(salah));
    }
    assert.equal((await api('POST', '/api/hadiah', admin, { ...baik, studentId: '00000000-0000-4000-8000-000000000000' })).status, 404);

    const dicatat = await api('POST', '/api/hadiah', admin, baik);
    assert.equal(dicatat.status, 201, dicatat.teks);
    assert.equal(dicatat.body.kindLabel, 'Buku bacaan atau kitab referensi');
    assert.equal(dicatat.body.createdBy, 'Admin Uji');
    const lain = await api('POST', '/api/hadiah', admin, { ...baik, studentId: anakLain.id, kind: 'piagam', title: 'Piagam kebersihan' });
    assert.equal(lain.status, 201, lain.teks);

    // Cakupan baca.
    assert.equal((await api('GET', '/api/hadiah', admin)).body.items.length, 2);
    assert.equal((await api('GET', '/api/hadiah', admin)).body.canManage, true);
    const lihatA = await api('GET', '/api/hadiah', tA);
    assert.deepEqual(lihatA.body.items.map((h) => h.studentId), [anak.id], 'Musyrif hanya santri asramanya.');
    assert.equal(lihatA.body.canManage, false);
    assert.equal((await api('GET', '/api/hadiah', tWali)).status, 403);
    const keluarga = await api('GET', `/api/students/${anak.id}/hadiah`, tWali);
    assert.equal(keluarga.status, 200, keluarga.teks);
    assert.deepEqual(keluarga.body.items.map((h) => h.title), ['Kitab Riyadhus Shalihin']);
    assert.equal(keluarga.body.items[0].createdBy, undefined, 'Data internal tidak dikirim ke keluarga.');
    assert.equal((await api('GET', `/api/students/${anak.id}/hadiah`, tLain)).status, 403, 'Wali lain tidak bisa membaca.');
    assert.equal((await api('GET', `/api/students/${anak.id}/hadiah`, tB)).status, 403, 'Musyrif asrama lain tidak bisa membaca.');
    assert.equal((await api('GET', `/api/students/${anak.id}/hadiah`, tA)).status, 200);
    assert.equal((await api('GET', `/api/students/${anak.id}/hadiah`)).status, 401);

    // Pembatalan: butuh alasan, hilang dari keluarga, riwayat tetap ada.
    const id = dicatat.body.id;
    assert.equal((await api('POST', `/api/hadiah/${id}/batal`, tA, { reason: 'Salah catat santri.' })).status, 403);
    assert.equal((await api('POST', `/api/hadiah/${id}/batal`, admin, { reason: 'x' })).status, 422);
    const batal = await api('POST', `/api/hadiah/${id}/batal`, admin, { reason: 'Salah catat santri.' });
    assert.equal(batal.status, 200, batal.teks);
    assert.equal(batal.body.voided, true);
    assert.equal((await api('POST', `/api/hadiah/${id}/batal`, admin, { reason: 'Salah catat santri.' })).status, 409);
    assert.deepEqual((await api('GET', `/api/students/${anak.id}/hadiah`, tWali)).body.items, []);
    const riwayat = (await api('GET', '/api/hadiah', admin)).body.items.find((h) => h.id === id);
    assert.equal(riwayat.voidReason, 'Salah catat santri.');

    // Tercatat di jejak audit.
    const jejak = await database.query(`SELECT action FROM audit_events WHERE action LIKE 'student-reward.%' ORDER BY occurred_at`).catch(() => database.query(`SELECT action FROM audit_events WHERE action LIKE 'student-reward.%'`));
    assert.deepEqual(jejak.rows.map((r) => r.action).sort(), ['student-reward.given', 'student-reward.given', 'student-reward.voided']);

    console.log('student reward tests passed');
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
