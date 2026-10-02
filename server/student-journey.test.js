// Roadmap studi dan santri teladan bulanan: siapa boleh melihat dan mengubah, kandidat dari
// data bulan itu, Hall of Fame untuk santri dan wali tanpa id santri, audit, dan perilaku
// sebelum migrasi 044 diterapkan.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-perjalanan';

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
  async function masuk(email) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password: SANDI });
    assert.equal(hasil.status, 200, `Login ${email}: ${JSON.stringify(hasil.body)}`);
    return hasil.body.accessToken;
  }
  async function akun(name, email, role) {
    const hasil = await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI });
    assert.equal(hasil.status, 201, JSON.stringify(hasil.body));
    return hasil.body.account;
  }
  async function santri(name, program) {
    const hasil = await api('POST', '/api/students', admin, { name, program, city: 'Kairo', joinDate: '2026-08-20', gender: 'putra' });
    assert.equal(hasil.status, 201, JSON.stringify(hasil.body));
    return hasil.body.student;
  }
  async function jumlahAudit(action) {
    return (await database.query('SELECT count(*)::int AS jumlah FROM audit_events WHERE action = $1', [action])).rows[0].jumlah;
  }

  let admin;
  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    admin = await masuk('admin@uji.test');

    const ahmad = await santri('Ahmad Uji', 'Kuliah S1 Al-Azhar (Ushuluddin)');
    const bilal = await santri('Bilal Uji', "Ma'had Al-Azhar (Tsanawi)");
    const candra = await santri('Candra Uji', 'Kuliah S1 Al-Azhar (Syariah)');
    const akunAhmad = await akun('Ahmad Uji', 'ahmad@uji.test', 'student');
    const akunWali = await akun('Wali Ahmad', 'wali@uji.test', 'parent');
    await akun('Santri Lain', 'lain@uji.test', 'student');
    await akun('Musyrif Uji', 'musyrif@uji.test', 'supervisor');
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/accounts`, admin, { studentAccountId: akunAhmad.id, parentAccountIds: [akunWali.id] })).status, 200);
    const tokenAhmad = await masuk('ahmad@uji.test');
    const tokenWali = await masuk('wali@uji.test');
    const tokenLain = await masuk('lain@uji.test');
    const tokenMusyrif = await masuk('musyrif@uji.test');

    // ---------------------------------------------------------------------- roadmap
    const awal = await api('GET', `/api/students/${ahmad.id}/roadmap`, tokenAhmad);
    assert.equal(awal.status, 200, JSON.stringify(awal.body));
    assert.equal(awal.body.roadmap.program, 'Kuliah S1 Al-Azhar');
    assert.equal(awal.body.roadmap.phases.length, 5);
    assert.equal(awal.body.roadmap.current, null);

    assert.equal((await api('PUT', `/api/students/${ahmad.id}/roadmap`, tokenMusyrif, { phase: 3 })).status, 403, 'Hanya admin.');
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/roadmap`, admin, { phase: 6 })).status, 422);
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/roadmap`, admin, { phase: 2.5 })).status, 422);
    const atur = await api('PUT', `/api/students/${ahmad.id}/roadmap`, admin, { phase: 3 });
    assert.equal(atur.status, 200, JSON.stringify(atur.body));
    assert.equal(atur.body.title, 'Talaqqi kitab turats & Markaz Lughoh');
    assert.equal(await jumlahAudit('student.phase-updated'), 1);

    const dilihatWali = await api('GET', `/api/students/${ahmad.id}/roadmap`, tokenWali);
    assert.equal(dilihatWali.body.roadmap.current, 3);
    assert.deepEqual(dilihatWali.body.roadmap.phases.map((fase) => fase.state), ['done', 'done', 'current', 'upcoming', 'upcoming']);
    assert.equal((await api('GET', `/api/students/${ahmad.id}/roadmap`, tokenLain)).status, 403, 'Santri lain tidak boleh melihat.');

    // Program tanpa roadmap: tidak tampil dan tidak bisa diatur.
    assert.equal((await api('GET', `/api/students/${bilal.id}/roadmap`, admin)).body.roadmap, null);
    assert.equal((await api('PUT', `/api/students/${bilal.id}/roadmap`, admin, { phase: 1 })).status, 422);

    // Mengosongkan fase.
    assert.equal((await api('PUT', `/api/students/${ahmad.id}/roadmap`, admin, { phase: null })).body.phase, null);
    assert.equal((await api('GET', `/api/students/${ahmad.id}/roadmap`, tokenAhmad)).body.roadmap.current, null);
    await api('PUT', `/api/students/${ahmad.id}/roadmap`, admin, { phase: 3 });

    // ---------------------------------------------------------------- kandidat teladan
    // Oktober 2026: Candra berjamaah 5/5, Ahmad 3/5, Bilal tanpa catatan.
    async function sholat(studentId, tanggal, status) {
      await database.query(
        'INSERT INTO student_prayer_logs (id, student_id, prayer_date, prayer, status) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), studentId, tanggal, 'subuh', status]
      );
    }
    for (let hari = 1; hari <= 5; hari += 1) {
      await sholat(candra.id, `2026-10-0${hari}`, 'berjamaah');
      await sholat(ahmad.id, `2026-10-0${hari}`, hari <= 3 ? 'berjamaah' : 'munfarid');
    }
    await sholat(bilal.id, '2026-09-30', 'berjamaah');
    await database.query(
      "INSERT INTO student_memorization_logs (id, student_id, occurred_on, kind, portion, grade) VALUES ($1, $2, '2026-10-02', 'ziyadah', 'QS. Al-Mulk 1-15', 'lancar')",
      [crypto.randomUUID(), ahmad.id]
    );

    const oktober = await api('GET', '/api/admin/honors?month=2026-10', admin);
    assert.equal(oktober.status, 200, JSON.stringify(oktober.body));
    assert.equal(oktober.body.tersedia, true);
    assert.deepEqual(oktober.body.items, []);
    assert.deepEqual(oktober.body.candidates.map((item) => item.name), ['Candra Uji', 'Ahmad Uji'], 'Bilal tanpa catatan Oktober tidak ikut.');
    assert.equal(oktober.body.candidates[0].berjamaahRate, 100);
    assert.equal(oktober.body.candidates[1].berjamaahRate, 60);
    assert.equal(oktober.body.candidates[1].ziyadah, 1);
    assert.equal((await api('GET', '/api/admin/honors?month=2026-13', admin)).status, 422);
    assert.equal((await api('GET', '/api/admin/honors?month=2026-10', tokenMusyrif)).status, 403);

    // ---------------------------------------------------------------- pilih teladan
    const pilih = await api('POST', '/api/admin/honors', admin, { month: '2026-10', studentId: candra.id, title: 'Santri teladan sholat', reason: 'Sholat berjamaah penuh sepanjang Oktober.' });
    assert.equal(pilih.status, 201, JSON.stringify(pilih.body));
    assert.equal((await api('POST', '/api/admin/honors', admin, { month: '2026-10', studentId: candra.id, title: 'Lagi', reason: 'Dobel tidak boleh terjadi.' })).status, 422);
    assert.equal((await api('POST', '/api/admin/honors', admin, { month: '2026-10', studentId: ahmad.id, title: 'OK', reason: 'Terlalu pendek' })).status, 422, 'Gelar minimal 3 karakter.');
    assert.equal((await api('POST', '/api/admin/honors', tokenMusyrif, { month: '2026-10', studentId: ahmad.id, title: 'Teladan', reason: 'Bukan admin tidak boleh memilih.' })).status, 403);
    assert.equal(await jumlahAudit('honor.added'), 1);

    // Santri dan wali melihat bulan terakhir, tanpa id santri.
    for (const token of [tokenAhmad, tokenWali, tokenLain]) {
      const lihat = await api('GET', '/api/honors', token);
      assert.equal(lihat.status, 200);
      assert.equal(lihat.body.month, '2026-10');
      assert.deepEqual(lihat.body.items, [{ name: 'Candra Uji', program: 'Kuliah S1 Al-Azhar (Syariah)', title: 'Santri teladan sholat', reason: 'Sholat berjamaah penuh sepanjang Oktober.' }]);
    }
    assert.equal((await api('GET', '/api/honors', null)).status, 401, 'Tidak untuk publik.');

    const hapus = await api('DELETE', `/api/admin/honors/${pilih.body.honor.id}`, admin);
    assert.equal(hapus.status, 204);
    assert.deepEqual((await api('GET', '/api/honors', tokenAhmad)).body, { month: null, items: [] });
    assert.equal(await jumlahAudit('honor.removed'), 1);

    // ------------------------------------------------- sebelum migrasi 044 diterapkan
    await database.query('DROP TABLE student_honors');
    await database.query('DROP TABLE student_study_phases');
    assert.equal((await api('GET', `/api/students/${ahmad.id}/roadmap`, tokenAhmad)).body.roadmap, null, 'Tanpa tabel, roadmap tidak tampil.');
    assert.deepEqual((await api('GET', '/api/honors', tokenAhmad)).body, { month: null, items: [] });
    assert.equal((await api('GET', '/api/admin/honors?month=2026-10', admin)).body.tersedia, false);
    const tanpaTabel = await api('PUT', `/api/students/${ahmad.id}/roadmap`, admin, { phase: 2 });
    assert.equal(tanpaTabel.status, 409);
    assert.match(tanpaTabel.body.error, /Pengaturan/);
    assert.equal((await api('POST', '/api/admin/honors', admin, { month: '2026-10', studentId: candra.id, title: 'Teladan', reason: 'Tetap ditolak dengan pesan yang jelas.' })).status, 409);
    assert.equal((await api('GET', `/api/students/${ahmad.id}/dashboard`, tokenAhmad)).status, 200, 'Dashboard santri tetap jalan.');

    console.log('student journey tests passed (roadmap, kandidat, teladan, akses, audit, sebelum migrasi)');
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
