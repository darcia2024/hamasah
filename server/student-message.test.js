// Pesan personal musyrif ke santri: privat secara data. Wali tidak pernah menerimanya otomatis, hanya yang
// sengaja dibagikan staf; santri tidak bisa membagikan; pesan tidak bocor lewat dashboard, rapor, atau profil.
// Catatan pembinaan untuk santri mengikuti pengaturan visibilitas.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-pesan';
const RAHASIA = 'Rahasia evaluasi personal XYZ-123 untuk ananda.';

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
    const santriAkun = await akun('Santri Satu', 'santri1@uji.test', 'student');
    const santri2Akun = await akun('Santri Dua', 'santri2@uji.test', 'student');
    const wali = await akun('Wali Satu', 'wali1@uji.test', 'parent');
    const musyrifA = await akun('Musyrif A', 'musyrif-a@uji.test', 'supervisor');
    const musyrifB = await akun('Musyrif B', 'musyrif-b@uji.test', 'supervisor');
    await api('POST', `/api/dormitories/${A.id}/staff/${musyrifA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${musyrifB.id}`, admin);
    const anak = (await api('POST', '/api/students', admin, { name: 'Santri Satu', program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: A.id })).body.student;
    const anak2 = (await api('POST', '/api/students', admin, { name: 'Santri Dua', program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: A.id })).body.student;
    await api('PATCH', `/api/students/${anak.id}/accounts`, admin, { studentAccountId: santriAkun.id, parentAccountIds: [wali.id] });
    await api('PATCH', `/api/students/${anak2.id}/accounts`, admin, { studentAccountId: santri2Akun.id });
    const tSantri = await masuk('santri1@uji.test');
    const tSantri2 = await masuk('santri2@uji.test');
    const tWali = await masuk('wali1@uji.test');
    const tA = await masuk('musyrif-a@uji.test');
    const tB = await masuk('musyrif-b@uji.test');

    // Kirim: hanya staf yang berhak atas santri itu.
    const kirim = (token, id, body) => api('POST', `/api/students/${id}/pesan`, token, body);
    assert.equal((await kirim(tSantri, anak.id, { subject: 'Halo', body: 'Isi pesan uji.' })).status, 403);
    assert.equal((await kirim(tWali, anak.id, { subject: 'Halo', body: 'Isi pesan uji.' })).status, 403);
    assert.equal((await kirim(tB, anak.id, { subject: 'Halo', body: 'Isi pesan uji.' })).status, 403, 'Musyrif asrama lain ditolak.');
    assert.equal((await kirim(tA, anak.id, { kind: 'aneh', subject: 'Halo', body: 'Isi pesan uji.' })).status, 422);
    assert.equal((await kirim(tA, anak.id, { subject: 'ab', body: 'Isi pesan uji.' })).status, 422);
    const pesan = await kirim(tA, anak.id, { kind: 'evaluasi', subject: 'Evaluasi pribadi', body: RAHASIA });
    assert.equal(pesan.status, 201, pesan.teks);
    assert.equal(pesan.body.sharedWithParent, false, 'Pesan baru selalu privat.');

    // Santri membaca miliknya; santri lain dan wali tidak.
    const milikSantri = await api('GET', `/api/students/${anak.id}/pesan`, tSantri);
    assert.equal(milikSantri.status, 200);
    assert.equal(milikSantri.body.items.length, 1);
    assert.equal(milikSantri.body.unread, 1);
    assert.equal((await api('GET', `/api/students/${anak.id}/pesan`, tSantri2)).status, 403, 'Santri lain tidak boleh.');
    const lihatWali = await api('GET', `/api/students/${anak.id}/pesan`, tWali);
    assert.equal(lihatWali.status, 200);
    assert.equal(lihatWali.body.items.length, 0, 'Wali tidak menerima pesan otomatis.');
    assert.ok(!lihatWali.teks.includes('XYZ-123'));
    assert.equal((await api('GET', `/api/students/${anak.id}/pesan`, tB)).status, 403);

    // Tidak bocor ke permukaan lain yang dilihat wali.
    for (const jalur of [`/api/students/${anak.id}/dashboard`, `/api/students/${anak.id}/profil`, `/api/students/${anak.id}/care`, `/api/students/${anak.id}/report`, `/api/doa`, '/api/masukan/saya']) {
      const hasil = await api('GET', jalur, tWali);
      assert.ok(!hasil.teks.includes('XYZ-123'), `Pesan privat bocor lewat ${jalur}`);
    }
    const pdf = await fetch(`${baseUrl}/api/students/${anak.id}/report.pdf`, { headers: { Authorization: `Bearer ${tWali}` } });
    assert.ok(!Buffer.from(await pdf.arrayBuffer()).toString('latin1').includes('XYZ-123'));

    // Santri membaca: hanya santri penerima yang menandai dibaca.
    assert.equal((await api('POST', `/api/pesan/${pesan.body.id}/dibaca`, tWali)).status, 403);
    assert.equal((await api('POST', `/api/pesan/${pesan.body.id}/dibaca`, tSantri2)).status, 404);
    assert.equal((await api('POST', `/api/pesan/${pesan.body.id}/dibaca`, tSantri)).status, 200);
    assert.equal((await api('GET', `/api/students/${anak.id}/pesan`, tSantri)).body.unread, 0);

    // Berbagi ke wali: hanya staf yang berhak, dan tercatat siapa.
    const bagikan = (token, id, shared) => api('PATCH', `/api/pesan/${id}/bagikan`, token, { shared });
    assert.equal((await bagikan(tSantri, pesan.body.id, true)).status, 403, 'Santri tidak bisa membagikan.');
    assert.equal((await bagikan(tWali, pesan.body.id, true)).status, 403);
    assert.equal((await bagikan(tB, pesan.body.id, true)).status, 404);
    const dibagi = await bagikan(tA, pesan.body.id, true);
    assert.equal(dibagi.status, 200, dibagi.teks);
    assert.equal(dibagi.body.sharedBy, 'Musyrif A');
    const sesudahBagi = await api('GET', `/api/students/${anak.id}/pesan`, tWali);
    assert.equal(sesudahBagi.body.items.length, 1);
    assert.equal(sesudahBagi.body.items[0].sharedWithParent, undefined, 'Wali tidak melihat metadata internal.');
    assert.equal((await bagikan(tA, pesan.body.id, false)).status, 200);
    assert.equal((await api('GET', `/api/students/${anak.id}/pesan`, tWali)).body.items.length, 0, 'Ditarik kembali.');

    // Catatan pembinaan: evaluasi tampil ke santri, disiplin tersembunyi, sampai staf mengatur.
    const evaluasi = await api('POST', `/api/students/${anak.id}/evaluations`, tA, { area: 'Akhlak', note: 'Evaluasi akhlak yang cukup panjang.' });
    const disiplin = await api('POST', `/api/students/${anak.id}/violations`, tA, { level: 'ringan', note: 'Terlambat apel pagi berulang.' });
    assert.equal(evaluasi.status, 201, evaluasi.teks);
    assert.equal(disiplin.status, 201, disiplin.teks);
    const idEval = evaluasi.body.item.id;
    const idDisiplin = disiplin.body.item.id;
    const dash = async (token) => (await api('GET', `/api/students/${anak.id}/dashboard`, token)).body.dashboard;
    let santriLihat = await dash(tSantri);
    assert.equal(santriLihat.evaluations.length, 1);
    assert.equal(santriLihat.discipline.length, 0, 'Disiplin tersembunyi dari santri secara bawaan.');
    assert.equal((await dash(tWali)).discipline.length, 1, 'Wali tidak terpengaruh pengaturan santri.');
    const stafLihat = await dash(tA);
    assert.equal(stafLihat.discipline[0].studentVisible, false);
    assert.equal(stafLihat.evaluations[0].studentVisible, true);

    const atur = (token, koleksi, id, nilai) => api('PATCH', `/api/students/${anak.id}/catatan/${koleksi}/${id}/visibilitas`, token, { studentVisible: nilai });
    assert.equal((await atur(tSantri, 'violations', idDisiplin, true)).status, 403);
    assert.equal((await atur(tB, 'violations', idDisiplin, true)).status, 403);
    assert.equal((await atur(tA, 'violations', idDisiplin, 'ya')).status, 422);
    assert.equal((await atur(tA, 'violations', idEval, true)).status, 404, 'Id catatan harus cocok dengan koleksinya.');
    assert.equal((await atur(tA, 'violations', idDisiplin, true)).status, 200);
    assert.equal((await atur(tA, 'evaluations', idEval, false)).status, 200);
    santriLihat = await dash(tSantri);
    assert.equal(santriLihat.discipline.length, 1);
    assert.equal(santriLihat.evaluations.length, 0);
    assert.equal((await dash(tWali)).evaluations.length, 1);

    console.log('student message tests passed');
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
