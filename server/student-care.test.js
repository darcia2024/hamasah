// Ibadah (sholat berjamaah 5 waktu, setoran hafalan) dan kesehatan santri lewat HTTP.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { createStudentCareService } = require('./student-care-service.js');

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function run() {
  // Saklar kesehatan mati: tidak bisa mencatat, ringkasan tidak membawa kesehatan.
  const mati = createStudentCareService({ store: { listPrayers: async () => [], listMemorization: async () => [] }, accessFor: async () => ({ exists: true, view: true, write: true, staff: true }) });
  assert.equal((await mati.addHealth('s', { condition: 'sehat' }, { id: 'a', role: 'admin' })).status, 404);
  assert.equal((await mati.summary('s', { id: 'a', role: 'admin' })).value.health, null);

  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'), database, bootstrapKey: 'bootstrap-care', auditRetention: false,
    rateLimiter: createRelaxedRateLimiter(), healthRecordsEnabled: true, inProcessNotificationWorker: false
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const json = (headers) => ({ ...headers, 'Content-Type': 'application/json' });
  try {
    assert.equal((await request(baseUrl, '/api/auth/bootstrap', { method: 'POST', headers: json({ Authorization: 'Bearer bootstrap-care' }), body: JSON.stringify({ name: 'Admin Uji', email: 'admin@care.test', password: 'kata-sandi-admin-aman' }) })).status, 201);
    const masuk = async (email, password) => ({ Authorization: `Bearer ${(await request(baseUrl, '/api/auth/login', { method: 'POST', headers: json({}), body: JSON.stringify({ email, password }) })).body.accessToken}` });
    const admin = await masuk('admin@care.test', 'kata-sandi-admin-aman');
    const akun = async (name, email, role) => (await request(baseUrl, '/api/accounts', { method: 'POST', headers: json(admin), body: JSON.stringify({ name, email, role, password: 'kata-sandi-uji-aman' }) })).body.account.id;
    const waliId = await akun('Wali Uji', 'wali@care.test', 'parent');
    await akun('Wali Lain', 'wali-lain@care.test', 'parent');
    await akun('Musyrif Uji', 'musyrif@care.test', 'supervisor');
    const santri = await request(baseUrl, '/api/students', { method: 'POST', headers: json(admin), body: JSON.stringify({ name: 'Santri Uji', program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-01', parentAccountIds: [waliId] }) });
    const id = santri.body.student.id;
    const wali = await masuk('wali@care.test', 'kata-sandi-uji-aman');
    const waliLain = await masuk('wali-lain@care.test', 'kata-sandi-uji-aman');
    const musyrif = await masuk('musyrif@care.test', 'kata-sandi-uji-aman');

    // Sholat: satu tanggal, beberapa waktu; koreksi mengganti, bukan menambah baris.
    const sholat = (body, headers = admin) => request(baseUrl, `/api/students/${id}/prayers`, { method: 'PUT', headers: json(headers), body: JSON.stringify(body) });
    assert.equal((await sholat({ date: '2026-09-01', entries: [{ prayer: 'subuh', status: 'berjamaah' }, { prayer: 'dzuhur', status: 'munfarid' }, { prayer: 'isya', status: 'izin', note: 'Sakit' }] })).status, 200);
    assert.equal((await sholat({ date: '2026-09-01', entries: [{ prayer: 'dzuhur', status: 'berjamaah' }] })).status, 200);
    assert.equal((await sholat({ date: '2026-09-02', entries: [{ prayer: 'subuh', status: 'tidak' }] })).status, 200);
    assert.equal((await sholat({ date: '2026-09-02', entries: [{ prayer: 'tahajud', status: 'berjamaah' }] })).status, 422);
    assert.equal((await sholat({ date: '2099-01-01', entries: [{ prayer: 'subuh', status: 'berjamaah' }] })).status, 422, 'Tanggal masa depan ditolak.');
    assert.equal((await sholat({ date: '2026-09-02', entries: [{ prayer: 'subuh', status: 'berjamaah' }] }, musyrif)).status, 403, 'Musyrif di luar asramanya ditolak.');
    assert.equal((await sholat({ date: '2026-09-02', entries: [{ prayer: 'subuh', status: 'berjamaah' }] }, wali)).status, 403, 'Wali tidak bisa mencatat.');

    // Hafalan.
    const hafalan = (body) => request(baseUrl, `/api/students/${id}/memorization`, { method: 'POST', headers: json(admin), body: JSON.stringify(body) });
    assert.equal((await hafalan({ occurredOn: '2026-09-02', kind: 'ziyadah', portion: 'An-Naba 1-20', grade: 'lancar' })).status, 201);
    assert.equal((await hafalan({ occurredOn: '2026-09-02', kind: 'ziyadah', portion: '', grade: 'lancar' })).status, 422);

    // Kesehatan: detail medis hanya staf.
    const sehat = await request(baseUrl, `/api/students/${id}/health`, { method: 'POST', headers: json(admin), body: JSON.stringify({ occurredOn: '2026-09-02', condition: 'sakit-ringan', complaint: 'Demam 38 derajat', actionTaken: 'Paracetamol, istirahat', parentNote: 'Ananda demam ringan dan sudah membaik.' }) });
    assert.equal(sehat.status, 201);

    const periode = '?from=2026-09-01&to=2026-09-30';
    const staf = (await request(baseUrl, `/api/students/${id}/care${periode}`, { headers: admin })).body.care;
    assert.deepEqual(staf.prayers.totals, { berjamaah: 2, munfarid: 0, tidak: 1, izin: 1 });
    assert.equal(staf.prayers.recorded, 4);
    assert.equal(staf.prayers.berjamaahRate, 50);
    assert.deepEqual(staf.prayers.days[1], { date: '2026-09-01', prayers: { subuh: 'berjamaah', dzuhur: 'berjamaah', ashar: null, maghrib: null, isya: 'izin' } });
    assert.equal(staf.memorization[0].portion, 'An-Naba 1-20');
    assert.equal(staf.health[0].complaint, 'Demam 38 derajat');

    const waliCare = await request(baseUrl, `/api/students/${id}/care${periode}`, { headers: wali });
    assert.equal(waliCare.status, 200);
    assert.deepEqual(waliCare.body.care.health, [{ occurredOn: '2026-09-02', condition: 'sakit-ringan', parentNote: 'Ananda demam ringan dan sudah membaik.' }]);
    assert.ok(!JSON.stringify(waliCare.body).includes('Demam 38') && !JSON.stringify(waliCare.body).includes('Paracetamol'), 'Detail medis tidak sampai ke wali.');
    assert.equal((await request(baseUrl, `/api/students/${id}/care${periode}`, { headers: waliLain })).status, 403);
    assert.equal((await request(baseUrl, `/api/students/${id}/care?from=2026-01-01&to=2026-12-31`, { headers: admin })).status, 422, 'Rentang terlalu panjang ditolak.');

    // Rapor PDF memuat ibadah dan kesehatan versi wali, siapa pun yang mengunduh.
    for (const [nama, headers] of [['wali', wali], ['admin', admin]]) {
      const rapor = await fetch(`${baseUrl}/api/students/${id}/report.pdf?from=2026-09-01&to=2026-09-30`, { headers });
      assert.equal(rapor.status, 200, nama);
      const teks = Buffer.from(await rapor.arrayBuffer()).toString('latin1');
      assert.ok(teks.includes('4 waktu sholat tercatat: 2 berjamaah \\(50%\\), 0 munfarid, 1 tidak sholat, 1 izin.'), nama);
      assert.ok(teks.includes('Ziyadah An-Naba 1-20 \\(lancar\\)'), nama);
      assert.ok(teks.includes('Sakit ringan. Ananda demam ringan dan sudah membaik.'), nama);
      assert.ok(!teks.includes('Demam 38') && !teks.includes('Paracetamol'), `${nama}: detail medis tidak tercetak di rapor`);
    }

    // Isi kesehatan tidak masuk audit.
    const audit = await database.query("SELECT metadata::text AS m FROM audit_events WHERE action = 'student.health-recorded'");
    assert.equal(audit.rows.length, 1);
    assert.ok(!audit.rows[0].m.includes('Demam'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
  console.log('student care tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
