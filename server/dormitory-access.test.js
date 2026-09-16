// Musyrif hanya boleh melihat dan mencatat untuk santri di asrama yang
// ditugaskan kepadanya. Diuji lewat HTTP, di atas PostgreSQL sungguhan (PGlite),
// karena inilah jalur yang dipakai pengguna.

const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const KATA_SANDI = 'kata-sandi-asrama-uji';

async function request(baseUrl, method, pathname, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const contentType = response.headers.get('content-type') || '';
  return { status: response.status, body: contentType.includes('application/json') ? await response.json() : await response.text() };
}

async function run() {
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'bootstrap-asrama-uji',
    rateLimiter: createRelaxedRateLimiter()
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await request(baseUrl, 'POST', '/api/auth/bootstrap', {
      token: 'bootstrap-asrama-uji',
      body: { name: 'Admin Asrama', email: 'admin@hamasah.test', password: KATA_SANDI }
    });
    async function masuk(email) {
      const hasil = await request(baseUrl, 'POST', '/api/auth/login', { body: { email, password: KATA_SANDI } });
      assert.equal(hasil.status, 200, `Login ${email} gagal.`);
      return hasil.body.accessToken;
    }
    const adminToken = await masuk('admin@hamasah.test');

    async function buatMusyrif(email, nama) {
      const dibuat = await request(baseUrl, 'POST', '/api/accounts', {
        token: adminToken,
        body: { name: nama, email, role: 'supervisor', password: KATA_SANDI }
      });
      assert.equal(dibuat.status, 201, JSON.stringify(dibuat.body));
      return { id: dibuat.body.account.id, token: await masuk(email) };
    }
    const musyrifA = await buatMusyrif('musyrif.a@hamasah.test', 'Musyrif Asrama A');
    const musyrifB = await buatMusyrif('musyrif.b@hamasah.test', 'Musyrif Asrama B');

    // Dua asrama, masing-masing satu santri.
    async function buatAsrama(name, area, gender) {
      const dibuat = await request(baseUrl, 'POST', '/api/dormitories', { token: adminToken, body: { name, area, gender } });
      assert.equal(dibuat.status, 201, JSON.stringify(dibuat.body));
      return dibuat.body.dormitory.id;
    }
    const asramaA = await buatAsrama('Hay Asyir Putra', 'Hay Asyir', 'putra');
    const asramaB = await buatAsrama('Hay Sabi Putri', 'Hay Sabi', 'putri');

    // Nama asrama tidak boleh kembar, dan jenisnya harus putra atau putri.
    assert.equal((await request(baseUrl, 'POST', '/api/dormitories', {
      token: adminToken, body: { name: 'Hay Asyir Putra', area: 'Hay Asyir', gender: 'putra' }
    })).status, 422);
    assert.equal((await request(baseUrl, 'POST', '/api/dormitories', {
      token: adminToken, body: { name: 'Asrama Lain', area: 'Hay Asyir', gender: 'campur' }
    })).status, 422);

    async function buatSantri(name, gender, dormitoryId) {
      const dibuat = await request(baseUrl, 'POST', '/api/students', {
        token: adminToken,
        body: { name, program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', gender, dormitoryId }
      });
      assert.equal(dibuat.status, 201, JSON.stringify(dibuat.body));
      return dibuat.body.student.id;
    }
    const santriA = await buatSantri('Santri Asrama A', 'putra', asramaA);
    const santriB = await buatSantri('Santri Asrama B', 'putri', asramaB);

    // Sebelum ditugaskan, musyrif tidak melihat siapa pun. Ini disengaja: kalau
    // "belum ditugaskan" berarti melihat semua, pembatasan ini tidak ada artinya.
    assert.deepEqual((await request(baseUrl, 'GET', '/api/my-students', { token: musyrifA.token })).body.items, []);
    assert.equal((await request(baseUrl, 'GET', `/api/students/${santriA}/dashboard`, { token: musyrifA.token })).status, 403);

    // Penugasan hanya untuk akun musyrif.
    const adminId = (await request(baseUrl, 'GET', '/api/accounts', { token: adminToken }))
      .body.items.find((akun) => akun.role === 'admin').id;
    const salahRole = await request(baseUrl, 'POST', `/api/dormitories/${asramaA}/staff/${adminId}`, { token: adminToken });
    assert.equal(salahRole.status, 422);
    assert.match(salahRole.body.error, /hanya untuk akun musyrif/);

    assert.equal((await request(baseUrl, 'POST', `/api/dormitories/${asramaA}/staff/${musyrifA.id}`, { token: adminToken })).status, 201);
    assert.equal((await request(baseUrl, 'POST', `/api/dormitories/${asramaB}/staff/${musyrifB.id}`, { token: adminToken })).status, 201);

    // Musyrif A melihat santri asramanya, dan hanya itu.
    const daftarA = (await request(baseUrl, 'GET', '/api/my-students', { token: musyrifA.token })).body.items;
    assert.deepEqual(daftarA.map((santri) => santri.name), ['Santri Asrama A']);
    assert.equal((await request(baseUrl, 'GET', `/api/students/${santriA}/dashboard`, { token: musyrifA.token })).status, 200);

    // Santri asrama lain tertutup, baik dibaca maupun ditulis.
    const dashboardLain = await request(baseUrl, 'GET', `/api/students/${santriB}/dashboard`, { token: musyrifA.token });
    assert.equal(dashboardLain.status, 403);
    assert.equal((await request(baseUrl, 'GET', `/api/students/${santriB}/report`, { token: musyrifA.token })).status, 403);

    const catatanLain = await request(baseUrl, 'POST', `/api/students/${santriB}/violations`, {
      token: musyrifA.token,
      body: { note: 'Catatan yang tidak seharusnya bisa dibuat.', level: 'ringan' }
    });
    assert.equal(catatanLain.status, 403, 'Penolakan karena asrama adalah soal akses, jadi 403 dan bukan 422.');
    assert.match(catatanLain.body.error, /di luar asrama/);

    assert.equal((await request(baseUrl, 'POST', `/api/students/${santriB}/attendance`, {
      token: musyrifA.token, body: { status: 'present', category: 'Subuh berjamaah' }
    })).status, 403);
    assert.equal((await request(baseUrl, 'PATCH', `/api/students/${santriB}/placement`, {
      token: musyrifA.token, body: { dormitoryId: asramaA }
    })).status, 403, 'Musyrif tidak boleh memindahkan santri asrama lain ke asramanya.');
    assert.equal((await request(baseUrl, 'PATCH', `/api/students/${santriB}/accounts`, {
      token: musyrifA.token, body: { parentAccountIds: [] }
    })).status, 403);

    // Santri di asramanya sendiri tetap bisa dicatat.
    assert.equal((await request(baseUrl, 'POST', `/api/students/${santriA}/attendance`, {
      token: musyrifA.token, body: { status: 'present', category: 'Subuh berjamaah' }
    })).status, 201);

    // Musyrif B adalah cerminannya.
    assert.deepEqual(
      (await request(baseUrl, 'GET', '/api/my-students', { token: musyrifB.token })).body.items.map((santri) => santri.name),
      ['Santri Asrama B']
    );
    assert.equal((await request(baseUrl, 'GET', `/api/students/${santriA}/dashboard`, { token: musyrifB.token })).status, 403);

    // Admin tetap melihat semuanya.
    assert.equal((await request(baseUrl, 'GET', '/api/my-students', { token: adminToken })).body.items.length, 2);

    // Santri putri tidak boleh ditempatkan di asrama putra.
    const salahJenis = await request(baseUrl, 'PATCH', `/api/students/${santriB}/placement`, {
      token: adminToken, body: { dormitoryId: asramaA }
    });
    assert.equal(salahJenis.status, 422);
    assert.match(salahJenis.body.error, /tidak sesuai dengan jenis asrama/);

    // Penugasan dicabut, aksesnya ikut hilang.
    assert.equal((await request(baseUrl, 'DELETE', `/api/dormitories/${asramaA}/staff/${musyrifA.id}`, { token: adminToken })).status, 204);
    assert.deepEqual((await request(baseUrl, 'GET', '/api/my-students', { token: musyrifA.token })).body.items, []);
    assert.equal((await request(baseUrl, 'GET', `/api/students/${santriA}/dashboard`, { token: musyrifA.token })).status, 403);
    assert.equal((await request(baseUrl, 'DELETE', `/api/dormitories/${asramaA}/staff/${musyrifA.id}`, { token: adminToken })).status, 422);

    // Daftar asrama beserta penugasannya untuk layar admin.
    const daftarAsrama = (await request(baseUrl, 'GET', '/api/dormitories', { token: adminToken })).body;
    assert.deepEqual(daftarAsrama.dormitories.map((asrama) => asrama.name), ['Hay Asyir Putra', 'Hay Sabi Putri']);
    assert.deepEqual(daftarAsrama.assignments.map((tugas) => tugas.accountName), ['Musyrif Asrama B']);

    console.log('dormitory access tests passed');
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
