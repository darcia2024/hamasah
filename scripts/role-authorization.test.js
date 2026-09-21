// Otorisasi per role lewat lapisan HTTP, dengan sesi masing-masing role (Task R5.2).
//
// Berkas ini dulunya bernama uat-roles.test.js dan membandingkan array dengan dirinya
// sendiri; dua service dipanggil langsung dengan tiga actor. Tujuh role tidak pernah
// diuji di lapisan route. Sekarang:
//
//   1. Untuk setiap role, satu permintaan yang seharusnya diizinkan dan satu yang
//      seharusnya ditolak. Keduanya DITURUNKAN dari ROUTES dan PERMISSIONS, bukan
//      daftar kedua yang bisa menyimpang dari server/access-policy.js.
//   2. Batas data antar-pengguna: wali A tidak melihat anak wali B, santri A tidak
//      membuka data atau maddah santri B. Batas asrama musyrif diuji di
//      server/dormitory-access.test.js.
//
// Ini uji otorisasi, bukan UAT. Matriks lengkap (setiap endpoint x setiap role)
// tetap di server/access-matrix.test.js.

const assert = require('node:assert/strict');
const path = require('node:path');
const { ROUTES, createHamasahApp } = require('../server/app.js');
const { NOT_ALLOWED, ROLES, roleHasPermission } = require('../server/access-policy.js');
const { createTestDatabase } = require('../server/test-support/database.js');
const { createRelaxedRateLimiter } = require('../server/test-support/rate-limit.js');

const KATA_SANDI = 'kata-sandi-otorisasi-uji';
const SEMUA_ROLE = Object.values(ROLES);

async function request(baseUrl, method, pathname, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const contentType = response.headers.get('content-type') || '';
  return { status: response.status, body: contentType.includes('application/json') ? await response.json() : await response.text() };
}

// Pola regex route menjadi path literal. Hanya route tanpa grup tangkap yang dipakai.
function pathDariPola(pattern) {
  const sumber = pattern.source.replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/').replace(/\\\./g, '.');
  return /[()[\]?*+|\\]/.test(sumber) ? null : sumber;
}

// GET ber-izin yang bisa dipanggil apa adanya. Path dibaca dari route, tidak ditulis ulang.
function bacaanTanpaParameter() {
  return ROUTES
    .filter((route) => route.method === 'GET' && route.permission)
    .map((route) => ({ permission: route.permission, path: pathDariPola(route.pattern) }))
    .filter((entri) => entri.path);
}

async function run() {
  const bacaan = bacaanTanpaParameter();
  assert.ok(bacaan.length >= 5, 'Terlalu sedikit route bacaan yang dapat diturunkan; pola route berubah?');

  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'bootstrap-otorisasi-uji',
    rateLimiter: createRelaxedRateLimiter()
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await request(baseUrl, 'POST', '/api/auth/bootstrap', {
      token: 'bootstrap-otorisasi-uji',
      body: { name: 'Admin Otorisasi', email: 'admin@hamasah.test', password: KATA_SANDI }
    });
    async function masuk(email) {
      const hasil = await request(baseUrl, 'POST', '/api/auth/login', { body: { email, password: KATA_SANDI } });
      assert.equal(hasil.status, 200, `Login ${email} gagal.`);
      return hasil.body.accessToken;
    }
    const adminToken = await masuk('admin@hamasah.test');
    const token = { [ROLES.ADMIN]: adminToken };

    async function buatAkun(email, role) {
      const dibuat = await request(baseUrl, 'POST', '/api/accounts', {
        token: adminToken, body: { name: `Akun ${email}`, email, role, password: KATA_SANDI }
      });
      assert.equal(dibuat.status, 201, JSON.stringify(dibuat.body));
      return { id: dibuat.body.account.id, token: await masuk(email) };
    }

    // ---- 1. Satu izin dan satu tolak untuk setiap role, lewat sesinya sendiri ----
    for (const role of SEMUA_ROLE.filter((nama) => nama !== ROLES.ADMIN)) {
      token[role] = (await buatAkun(`${role}@hamasah.test`, role)).token;
    }

    const diperiksa = {};
    for (const role of SEMUA_ROLE) {
      const boleh = bacaan.find((entri) => roleHasPermission(role, entri.permission));
      const dilarang = bacaan.find((entri) => !roleHasPermission(role, entri.permission));
      assert.ok(boleh, `Tidak ada route bacaan yang diizinkan untuk ${role}.`);
      diperiksa[role] = { boleh: boleh.path };

      const diizinkan = await request(baseUrl, 'GET', boleh.path, { token: token[role] });
      assert.equal(diizinkan.status, 200, `${role} seharusnya boleh GET ${boleh.path}, bukan ${diizinkan.status}.`);

      // Admin memegang semua izin, jadi tidak ada yang bisa ditolak baginya.
      if (role === ROLES.ADMIN) {
        assert.equal(dilarang, undefined, 'Admin seharusnya tidak punya route bacaan yang ditolak.');
        continue;
      }
      assert.ok(dilarang, `Tidak ada route bacaan yang ditolak untuk ${role}.`);
      diperiksa[role].tolak = dilarang.path;
      const ditolak = await request(baseUrl, 'GET', dilarang.path, { token: token[role] });
      assert.equal(ditolak.status, 403, `${role} seharusnya ditolak GET ${dilarang.path}, bukan ${ditolak.status}.`);
      assert.equal(ditolak.body.error, NOT_ALLOWED);
    }

    // ---- 2. Batas data antar-pengguna ----
    const waliA = await buatAkun('wali.a@hamasah.test', ROLES.PARENT);
    const waliB = await buatAkun('wali.b@hamasah.test', ROLES.PARENT);
    const santriAkunA = await buatAkun('santri.a@hamasah.test', ROLES.STUDENT);
    const santriAkunB = await buatAkun('santri.b@hamasah.test', ROLES.STUDENT);

    async function buatSantri(name, akun, wali) {
      const dibuat = await request(baseUrl, 'POST', '/api/students', {
        token: adminToken,
        body: { name, program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20' }
      });
      assert.equal(dibuat.status, 201, JSON.stringify(dibuat.body));
      const id = dibuat.body.student.id;
      const kaitan = await request(baseUrl, 'PATCH', `/api/students/${id}/accounts`, {
        token: adminToken, body: { studentAccountId: akun.id, parentAccountIds: [wali.id] }
      });
      assert.equal(kaitan.status, 200, JSON.stringify(kaitan.body));
      return id;
    }
    const santriA = await buatSantri('Santri Batas Alfa', santriAkunA, waliA);
    const santriB = await buatSantri('Santri Batas Beta', santriAkunB, waliB);

    const maddahA = (await request(baseUrl, 'POST', '/api/courses', {
      token: adminToken, body: { title: 'Maddah Alfa', description: 'Maddah untuk santri Alfa.' }
    })).body.course.id;
    const maddahB = (await request(baseUrl, 'POST', '/api/courses', {
      token: adminToken, body: { title: 'Maddah Beta', description: 'Maddah untuk santri Beta.' }
    })).body.course.id;
    const materi = await request(baseUrl, 'POST', `/api/courses/${maddahB}/materials`, {
      token: adminToken,
      body: { type: 'text', title: 'Materi Beta', content: 'Isi.', summary: 'Rangkuman materi beta.', keyPoints: ['Poin.'], studyGuide: [] }
    });
    assert.equal(materi.status, 201, JSON.stringify(materi.body));
    const materiB = materi.body.material.id;
    assert.equal((await request(baseUrl, 'POST', `/api/students/${santriA}/courses/${maddahA}`, { token: adminToken })).status, 204);
    assert.equal((await request(baseUrl, 'POST', `/api/students/${santriB}/courses/${maddahB}`, { token: adminToken })).status, 204);

    function tidakBocor(hasil, nama) {
      assert.equal(JSON.stringify(hasil.body).includes(nama), false, `Respons penolakan membocorkan "${nama}".`);
    }

    // Wali: hanya anaknya.
    const daftarWaliA = (await request(baseUrl, 'GET', '/api/my-students', { token: waliA.token })).body.items;
    assert.deepEqual(daftarWaliA.map((santri) => santri.name), ['Santri Batas Alfa']);
    assert.equal((await request(baseUrl, 'GET', `/api/students/${santriA}/dashboard`, { token: waliA.token })).status, 200);
    for (const tujuan of [`/api/students/${santriB}/dashboard`, `/api/students/${santriB}/report`, `/api/students/${santriB}/courses`]) {
      const hasil = await request(baseUrl, 'GET', tujuan, { token: waliA.token });
      assert.equal(hasil.status, 403, `Wali A membuka ${tujuan}: ${hasil.status}.`);
      tidakBocor(hasil, 'Santri Batas Beta');
    }
    // Wali tidak pernah menulis, bahkan untuk anaknya sendiri.
    assert.equal((await request(baseUrl, 'POST', `/api/students/${santriA}/attendance`, {
      token: waliA.token, body: { status: 'present', category: 'Subuh berjamaah' }
    })).status, 403);

    // Santri: hanya dirinya dan maddah yang diikutinya.
    assert.deepEqual(
      (await request(baseUrl, 'GET', '/api/my-students', { token: santriAkunA.token })).body.items.map((santri) => santri.name),
      ['Santri Batas Alfa']
    );
    assert.equal((await request(baseUrl, 'GET', `/api/students/${santriA}/dashboard`, { token: santriAkunA.token })).status, 200);
    assert.equal((await request(baseUrl, 'GET', `/api/students/${santriA}/courses/${maddahA}`, { token: santriAkunA.token })).status, 200);
    for (const tujuan of [`/api/students/${santriB}/dashboard`, `/api/students/${santriB}/courses`, `/api/students/${santriB}/courses/${maddahB}`]) {
      const hasil = await request(baseUrl, 'GET', tujuan, { token: santriAkunA.token });
      assert.equal(hasil.status, 403, `Santri A membuka ${tujuan}: ${hasil.status}.`);
      tidakBocor(hasil, 'Santri Batas Beta');
    }
    // Maddah yang tidak diikuti tidak terbuka, bahkan lewat id dirinya sendiri.
    const takDiikuti = await request(baseUrl, 'GET', `/api/students/${santriA}/courses/${maddahB}`, { token: santriAkunA.token });
    assert.notEqual(takDiikuti.status, 200, 'Santri membuka maddah yang tidak diikutinya.');
    // Menandai materi selesai atas nama santri lain ditolak.
    const selesaiOrangLain = await request(baseUrl, 'POST', `/api/students/${santriB}/courses/${maddahB}/materials/${materiB}/complete`, { token: santriAkunA.token });
    // Route LMS membalas penolakan akses dengan 422 (bukan 403 seperti route lain);
    // yang diuji di sini adalah bahwa ditolak dan tidak ada yang tercatat.
    assert.equal(selesaiOrangLain.status, 422);
    assert.equal(selesaiOrangLain.body.error, 'Akses pembelajaran tidak diizinkan.');
    const progresB = await request(baseUrl, 'GET', `/api/students/${santriB}/courses/${maddahB}`, { token: santriAkunB.token });
    assert.equal(progresB.status, 200);
    assert.equal(JSON.stringify(progresB.body).includes('"completed":true'), false, 'Penolakan tadi mengubah progres santri B.');

    const ringkas = SEMUA_ROLE.map((role) => `${role}: boleh ${diperiksa[role].boleh}${diperiksa[role].tolak ? `, tolak ${diperiksa[role].tolak}` : ''}`);
    console.log(`role authorization tests passed (${SEMUA_ROLE.length} role lewat HTTP; batas wali dan santri)`);
    console.log(ringkas.map((baris) => `  ${baris}`).join('\n'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
