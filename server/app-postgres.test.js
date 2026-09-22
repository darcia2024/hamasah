// Test integrasi: API berjalan di atas store PostgreSQL (PGlite) lewat satu database bersama.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const registrationDomain = require('../website/registration-domain.js');
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
  const sentEmails = [];
  // Test ini mengirim sebelas pendaftaran sekaligus dari satu alamat untuk menguji
  // penomoran, jadi batas laju sengaja dilonggarkan di sini.
  const app = createHamasahApp({
    rootDirectory, database, bootstrapKey: 'bootstrap-test-key',
    rateLimiter: createRelaxedRateLimiter(),
    email: { driver: 'test', appBaseUrl: 'https://app.hamasah.test' },
    emailSender: {
      provider: 'test', configured: true,
      async send(message) { sentEmails.push(message); return { id: `mail-${sentEmails.length}` }; }
    }
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

    // Admin mengundang wali tanpa pernah mengetahui atau menerima kata sandinya.
    const invitation = await request(baseUrl, '/api/accounts/invitations', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ name: 'Wali Undangan', email: 'wali.undangan@hamasah.test', role: 'parent' })
    });
    assert.equal(invitation.status, 201);
    assert.equal(invitation.body.account.active, false);
    assert.equal(sentEmails.length, 1);
    const invitationUrl = new URL(sentEmails[0].html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&'));
    const invitationToken = new URLSearchParams(invitationUrl.hash.slice(1)).get('token');
    assert.equal(JSON.stringify(invitation.body).includes(invitationToken), false, 'Token tidak boleh muncul pada respons API.');
    const accept = await request(baseUrl, '/api/auth/invitations/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: invitationToken, password: 'kata-sandi-wali-uji' })
    });
    assert.equal(accept.status, 200);
    assert.equal(accept.body.account.email, 'wali.undangan@hamasah.test');
    assert.equal(accept.body.account.active, true);
    const waliLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wali.undangan@hamasah.test', password: 'kata-sandi-wali-uji' })
    });
    assert.equal(waliLogin.status, 200);

    const resetRequest = await request(baseUrl, '/api/auth/password-reset-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wali.undangan@hamasah.test' })
    });
    assert.equal(resetRequest.status, 202);
    assert.equal(sentEmails.length, 2);
    const resetUrl = new URL(sentEmails[1].html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&'));
    const resetComplete = await request(baseUrl, '/api/auth/password-reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: new URLSearchParams(resetUrl.hash.slice(1)).get('token'), password: 'kata-sandi-wali-baru' })
    });
    assert.equal(resetComplete.status, 204);
    assert.equal((await request(baseUrl, '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wali.undangan@hamasah.test', password: 'kata-sandi-wali-baru' })
    })).status, 200);
    const notificationRows = await database.query('SELECT count(*)::int AS jumlah FROM notification_outbox WHERE status = \'sent\'');
    assert.equal(notificationRows.rows[0].jumlah, 2);

    // Pendaftaran tersimpan lewat transaksi dan bisa dibaca pemilik token.
    const registration = await request(baseUrl, '/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantName: 'Calon Santri Uji',
        phone: '081234567890',
        guardianName: 'Wali Uji',
        guardianPhone: '081298765432',
        email: 'calon.uji@example.test', guardianEmail: 'wali.uji@example.test',
        birthDate: '2004-01-01', gender: 'putra', schoolOrigin: 'SMA Uji', guardianConsent: true,
        program: 'kuliah-al-azhar',
        educationLevel: 'SMA',
        city: 'Bandung',
        consent: true, dataProcessingConsent: true,
        // Task R2.3. Dititipkan sengaja: server harus mengabaikannya.
        privacyPolicyVersion: 'v99-palsu'
      })
    });
    assert.equal(registration.status, 201);
    const registrationId = registration.body.registration.registrationId;
    assert.match(registrationId, /^HI-REG-\d{4}-00001$/);

    // Task R2.3. Versi kebijakan yang tersimpan adalah versi server saat persetujuan
    // diberikan, bukan yang dikirim browser, dan bukan default 'v1' dari migrasi 013
    // yang menunjuk dokumen tidak pernah ada.
    const versiRows = await database.query(
      'SELECT privacy_policy_version FROM registrations WHERE registration_id = $1',
      [registrationId]
    );
    assert.equal(versiRows.rows[0].privacy_policy_version, registrationDomain.PRIVACY_POLICY_VERSION);
    assert.notEqual(versiRows.rows[0].privacy_policy_version, 'v99-palsu');
    assert.notEqual(versiRows.rows[0].privacy_policy_version, 'v1');

    // Task R2.3. Tanpa persetujuan pemrosesan data pribadi, pendaftaran ditolak.
    const tanpaPersetujuanData = await request(baseUrl, '/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantName: 'Calon Tanpa Persetujuan',
        phone: '081234567891',
        guardianName: 'Wali Uji',
        guardianPhone: '081298765433',
        email: 'tanpa.persetujuan@example.test', guardianEmail: 'wali.tanpa@example.test',
        birthDate: '2004-01-01', gender: 'putra', schoolOrigin: 'SMA Uji', guardianConsent: true,
        program: 'kuliah-al-azhar', educationLevel: 'SMA', city: 'Bandung',
        consent: true, dataProcessingConsent: false
      })
    });
    assert.equal(tanpaPersetujuanData.status, 422);
    assert.ok(tanpaPersetujuanData.body.errors.dataProcessingConsent);

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
        email: `bersamaan-${index + 1}@example.test`, guardianEmail: `wali-bersamaan-${index + 1}@example.test`,
        birthDate: '2004-01-01', gender: 'putra', schoolOrigin: 'SMA Uji', guardianConsent: true,
        program: 'kuliah-al-azhar',
        educationLevel: 'SMA',
        city: 'Bandung',
        consent: true, dataProcessingConsent: true
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
    // Penulis dicatat dari sesi yang membuat artikel dan tampil di detail publik (Task R7.4).
    assert.equal(article.body.item.authorName, 'Admin Uji');
    assert.equal((await request(baseUrl, `/api/articles/${article.body.item.slug}`)).body.item.authorName, article.body.item.authorName);
    const articles = await request(baseUrl, '/api/articles');
    assert.equal(articles.body.items.length, 1);

    const draftArticle = await request(baseUrl, '/api/articles', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ title: 'Draf Kegiatan Hamasah', excerpt: 'Draf untuk ditinjau.', body: 'Isi draf yang belum dipublikasikan.', status: 'draft' })
    });
    assert.equal(draftArticle.status, 201);
    assert.equal((await request(baseUrl, '/api/articles')).body.items.length, 1);
    const editorialList = await request(baseUrl, '/api/staff/articles', { headers: adminHeaders });
    assert.equal(editorialList.status, 200);
    assert.equal(editorialList.body.items.length, 2);
    assert.equal(editorialList.body.total, 2);
    assert.equal('body' in editorialList.body.items[0], false, 'Daftar editorial tidak membawa isi artikel.');
    assert.equal('body' in articles.body.items[0], false, 'Katalog publik tidak membawa isi artikel.');
    const editorialDetail = await request(baseUrl, `/api/staff/articles/${draftArticle.body.item.slug}`, { headers: adminHeaders });
    assert.equal(editorialDetail.status, 200);
    assert.equal(editorialDetail.body.item.body, 'Isi draf yang belum dipublikasikan.', 'Draf dapat dibuka penuh oleh staf.');
    assert.equal((await request(baseUrl, `/api/articles/${draftArticle.body.item.slug}`)).status, 404, 'Draf tetap tidak terbuka untuk publik.');
    const publishedDraft = await request(baseUrl, `/api/articles/${draftArticle.body.item.slug}`, {
      method: 'PATCH', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' })
    });
    assert.equal(publishedDraft.status, 200);
    assert.equal((await request(baseUrl, '/api/articles')).body.items.length, 2);
    const archivedDraft = await request(baseUrl, `/api/articles/${draftArticle.body.item.slug}`, {
      method: 'PATCH', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived' })
    });
    assert.equal(archivedDraft.status, 200);
    assert.equal((await request(baseUrl, '/api/articles')).body.items.length, 1);

    // Sitemap dan robots dihasilkan server dengan URL absolut (Task R7.2).
    const draftOnly = await request(baseUrl, '/api/articles', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ title: 'Draf Lain Hamasah', excerpt: 'Masih draf.', body: 'Belum terbit.', status: 'draft' })
    });
    for (const lokasi of ['/sitemap.xml', '/website/sitemap.xml']) {
      const sitemap = await fetch(`${baseUrl}${lokasi}`);
      assert.equal(sitemap.status, 200);
      assert.match(sitemap.headers.get('content-type'), /application\/xml/);
      const xml = await sitemap.text();
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.ok(locs.length > 0 && locs.every((loc) => loc.startsWith('https://app.hamasah.test/')), 'Semua URL sitemap absolut.');
      assert.ok(locs.includes(`https://app.hamasah.test/website/article.html?slug=${article.body.item.slug}`), 'Artikel terbit masuk sitemap.');
      assert.ok(!xml.includes(draftArticle.body.item.slug), 'Artikel arsip tidak masuk sitemap.');
      assert.ok(!xml.includes(draftOnly.body.item.slug), 'Artikel draf tidak masuk sitemap.');
      assert.ok(!xml.includes('kebijakan-privasi'), 'Halaman ber-noindex tidak masuk sitemap.');
      assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}T/);
    }
    // Halaman artikel dirender server dari URL lama (Task R7.3).
    const halaman = await fetch(`${baseUrl}/website/article.html?slug=${article.body.item.slug}`);
    assert.equal(halaman.status, 200);
    const halamanHtml = await halaman.text();
    assert.ok(halamanHtml.includes('<title>Kegiatan Santri Hamasah | Hamasah International</title>'));
    assert.ok(halamanHtml.includes('<p>Isi kegiatan lengkap.</p>'));
    assert.ok(halamanHtml.includes(`<meta property="og:url" content="https://app.hamasah.test/website/article.html?slug=${article.body.item.slug}" />`));
    assert.ok(halamanHtml.includes('<strong>Admin Uji</strong>'));
    assert.equal((await fetch(`${baseUrl}/website/article.html?slug=${draftOnly.body.item.slug}`)).status, 404, 'Draf tidak dirender untuk publik.');
    assert.equal((await fetch(`${baseUrl}/website/article.html`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/website/article.html?slug=%3Cscript%3E`)).status, 404);

    for (const lokasi of ['/robots.txt', '/website/robots.txt']) {
      const robots = await (await fetch(`${baseUrl}${lokasi}`)).text();
      assert.match(robots, /^Sitemap: https:\/\/app\.hamasah\.test\/sitemap\.xml$/m);
      for (const internal of ['staff', 'portal', 'monitoring', 'audit', 'lms', 'operations', 'aktivasi', 'reset-password']) {
        assert.match(robots, new RegExp(`^Disallow: /website/${internal}\\.html$`, 'm'), `${internal}.html harus dilarang`);
      }
      assert.doesNotMatch(robots, /Disallow: \/website\/(?:index|biaya|kontak|articles|article|cek-status)\.html/);
    }

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
