// Test integrasi: API berjalan di atas store PostgreSQL (PGlite) lewat satu database bersama.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

async function request(baseUrl, pathname, options) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  if (response.status === 204) {
    return { status: response.status, body: null };
  }
  return { status: response.status, body: await response.json() };
}

async function run() {
  const rootDirectory = path.resolve(__dirname, '..');
  const database = await createTestDatabase();
  // Test ini mengirim sebelas pendaftaran sekaligus dari satu alamat untuk menguji
  // penomoran, jadi batas laju sengaja dilonggarkan di sini.
  const app = createHamasahApp({
    rootDirectory, database, bootstrapKey: 'bootstrap-test-key',
    rateLimiter: createRelaxedRateLimiter()
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Liveness selalu 200, readiness memeriksa database.
    const health = await request(baseUrl, '/api/health');
    assert.equal(health.status, 200);
    const ready = await request(baseUrl, '/api/ready');
    assert.equal(ready.status, 200);
    assert.equal(ready.body.ok, true);

    // Akun dan sesi tersimpan di PostgreSQL.
    const bootstrap = await request(baseUrl, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { Authorization: 'Bearer bootstrap-test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin Uji', email: 'admin@hamasah.test', password: 'kata-sandi-admin-uji' })
    });
    assert.equal(bootstrap.status, 201);

    const login = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hamasah.test', password: 'kata-sandi-admin-uji' })
    });
    assert.equal(login.status, 200);
    const adminHeaders = { Authorization: `Bearer ${login.body.accessToken}`, 'Content-Type': 'application/json' };

    const me = await request(baseUrl, '/api/me', { headers: adminHeaders });
    assert.equal(me.status, 200);
    assert.equal(me.body.account.role, 'admin');

    const accountRows = await database.query('SELECT count(*)::int AS jumlah FROM accounts');
    const sessionRows = await database.query('SELECT count(*)::int AS jumlah FROM account_sessions');
    assert.equal(accountRows.rows[0].jumlah, 1);
    assert.equal(sessionRows.rows[0].jumlah, 1);

    // Pendaftaran tersimpan lewat transaksi dan bisa dibaca pemilik token.
    const registration = await request(baseUrl, '/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantName: 'Calon Santri Uji',
        phone: '081234567890',
        guardianName: 'Wali Uji',
        guardianPhone: '081298765432',
        program: 'kuliah-al-azhar',
        educationLevel: 'SMA',
        city: 'Bandung',
        consent: true
      })
    });
    assert.equal(registration.status, 201);
    const registrationId = registration.body.registration.registrationId;
    assert.match(registrationId, /^HI-REG-\d{4}-00001$/);

    const status = await request(baseUrl, `/api/registrations/${registrationId}`, {
      headers: { Authorization: `Bearer ${registration.body.accessToken}` }
    });
    assert.equal(status.status, 200);
    assert.equal(status.body.registration.registrationId, registrationId);

    // Sepuluh pendaftaran bersamaan harus mendapat nomor berbeda dan semuanya tersimpan.
    const bersamaan = await Promise.all(Array.from({ length: 10 }, (unused, index) => request(baseUrl, '/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantName: `Calon Bersamaan ${index + 1}`,
        phone: '081234567890',
        guardianName: 'Wali Uji',
        guardianPhone: '081298765432',
        program: 'kuliah-al-azhar',
        educationLevel: 'SMA',
        city: 'Bandung',
        consent: true
      })
    })));
    assert.deepEqual([...new Set(bersamaan.map((entry) => entry.status))], [201]);
    const nomorBersamaan = bersamaan.map((entry) => entry.body.registration.registrationId);
    assert.equal(new Set(nomorBersamaan).size, 10, `Nomor registrasi harus unik: ${nomorBersamaan.join(', ')}`);
    const tersimpan = await database.query('SELECT count(*)::int AS jumlah FROM registrations');
    assert.equal(tersimpan.rows[0].jumlah, 11);

    const staffList = await request(baseUrl, '/api/registrations', { headers: adminHeaders });
    assert.equal(staffList.status, 200);
    assert.equal(staffList.body.items.length, 11);

    // Riwayat status mencatat akun pelaku, dan peran diambil dari sesi, bukan dari isi request.
    const officerAccount = await request(baseUrl, '/api/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Petugas Uji', email: 'petugas@hamasah.test', role: 'registration-officer', password: 'kata-sandi-petugas-uji' })
    });
    assert.equal(officerAccount.status, 201);
    const officerLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'petugas@hamasah.test', password: 'kata-sandi-petugas-uji' })
    });
    assert.equal(officerLogin.status, 200);

    const changed = await request(baseUrl, `/api/registrations/${registrationId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${officerLogin.body.accessToken}`, 'Content-Type': 'application/json' },
      // Petugas mencoba mengaku admin lewat isi request.
      body: JSON.stringify({ status: 'document-review', note: 'Berkas mulai diperiksa.', role: 'admin' })
    });
    assert.equal(changed.status, 200);

    const detail = (await request(baseUrl, '/api/registrations', { headers: adminHeaders }))
      .body.items.find((item) => item.registrationId === registrationId);
    const terakhir = detail.history.at(-1);
    assert.equal(terakhir.to, 'document-review');
    assert.equal(terakhir.byRole, 'registration-officer', 'Peran wajib diambil dari sesi, bukan dari isi request.');
    assert.equal(terakhir.byAccountId, officerAccount.body.account.id);
    assert.equal(terakhir.byName, 'Petugas Uji');

    // Pendaftar tidak boleh melihat nama petugas di riwayat miliknya.
    const milikPendaftar = await request(baseUrl, `/api/registrations/${registrationId}`, {
      headers: { Authorization: `Bearer ${registration.body.accessToken}` }
    });
    assert.equal(milikPendaftar.status, 200);
    assert.equal(JSON.stringify(milikPendaftar.body).includes('Petugas Uji'), false);

    // Tanpa sesi, perubahan status ditolak.
    const tanpaSesi = await request(baseUrl, `/api/registrations/${registrationId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'academic-preparation' })
    });
    assert.equal(tanpaSesi.status, 401);

    // Artikel.
    const article = await request(baseUrl, '/api/articles', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Kegiatan Santri Hamasah', excerpt: 'Ringkasan kegiatan.', body: 'Isi kegiatan lengkap.' })
    });
    assert.equal(article.status, 201);
    const articles = await request(baseUrl, '/api/articles');
    assert.equal(articles.body.items.length, 1);

    const logout = await request(baseUrl, '/api/auth/logout', { method: 'POST', headers: adminHeaders });
    assert.equal(logout.status, 204);
    const afterLogout = await request(baseUrl, '/api/me', { headers: adminHeaders });
    assert.equal(afterLogout.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  }

  // Database dari luar tidak ikut ditutup oleh app.close().
  const stillOpen = await database.query('SELECT 1 AS satu');
  assert.equal(stillOpen.rows[0].satu, 1);
  await database.close();

  // Database yang dibuat app sendiri ditutup oleh app.close().
  const ownedApp = createHamasahApp({ rootDirectory, databaseUrl: 'pglite:memory' });
  await ownedApp.close();

  // Saat database tidak dapat dihubungi: liveness tetap 200, readiness 503 tanpa detail error.
  const brokenApp = createHamasahApp({
    rootDirectory,
    database: {
      kind: 'uji',
      async query() { throw new Error('koneksi ke db.contoh.internal ditolak'); },
      async withTransaction() { throw new Error('koneksi ke db.contoh.internal ditolak'); },
      async exec() {},
      async close() {}
    }
  });
  const brokenServer = brokenApp.createServer();
  await new Promise((resolve) => brokenServer.listen(0, '127.0.0.1', resolve));
  const brokenUrl = `http://127.0.0.1:${brokenServer.address().port}`;
  try {
    assert.equal((await request(brokenUrl, '/api/health')).status, 200);
    const gagal = await request(brokenUrl, '/api/ready');
    assert.equal(gagal.status, 503);
    assert.equal(gagal.body.ok, false);
    assert.equal(JSON.stringify(gagal.body).includes('db.contoh.internal'), false, 'Detail error tidak boleh bocor ke pemanggil.');
  } finally {
    await new Promise((resolve) => brokenServer.close(resolve));
    await brokenApp.close();
  }

  console.log('app postgres integration tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
