// Halaman Pengaturan super admin: saklar fitur yang benar-benar berlaku di endpoint
// terkait, pembaruan database dari aplikasi, penjagaan izin, dan jejak audit.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-pengaturan';

const PENDAFTAR = {
  applicantName: 'Pendaftar Uji', phone: '0812 3456 7890',
  guardianName: 'Wali Uji', guardianPhone: '0813 2222 3333',
  email: 'pendaftar@uji.test', guardianEmail: 'wali@uji.test',
  birthDate: '2007-04-12', gender: 'putra', schoolOrigin: 'SMA Uji', guardianConsent: true,
  program: 'mahad-al-azhar', educationLevel: 'MA', city: 'Bandung',
  consent: true, dataProcessingConsent: true
};

async function run() {
  const database = await createTestDatabase();
  // Seperti production sebelum migrasi 043 diterapkan. Tabel dihapus sebelum aplikasi
  // dibuat: job audit saat server menyala sudah membaca pengaturan dan menyimpannya di
  // cache, jadi menghapusnya belakangan tidak meniru keadaan production.
  await database.query('DROP TABLE app_settings');
  await database.query("DELETE FROM schema_migrations WHERE version = '043'");
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'kunci-bootstrap-uji',
    rateLimiter: createRelaxedRateLimiter(),
    healthRecordsEnabled: false
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
  async function jumlahAudit(action) {
    return (await database.query('SELECT count(*)::int AS jumlah FROM audit_events WHERE action = $1', [action])).rows[0].jumlah;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    await api('POST', '/api/accounts', admin, { name: 'Musyrif Uji', email: 'musyrif@uji.test', role: 'supervisor', password: SANDI });
    const musyrif = await masuk('musyrif@uji.test');

    // ------------------------------------------- database lama tanpa tabel pengaturan
    // Aplikasi tetap jalan dengan nilai bawaan, penyimpanan ditolak, dan tombol
    // pembaruan menerapkan file yang kurang.
    const lama = await api('GET', '/api/admin/settings', admin);
    assert.equal(lama.status, 200);
    assert.equal(lama.body.tersedia, false);
    assert.equal(lama.body.nilai['pendaftaran.dibuka'], true, 'Tanpa tabel, nilai bawaan tetap dipakai.');
    assert.deepEqual(lama.body.database.tertunda.map((item) => item.berkas), ['043_app_settings.sql']);
    assert.equal((await api('POST', '/api/registrations', null, PENDAFTAR)).status, 201, 'Pendaftaran tetap jalan sebelum database diperbarui.');

    const ditolak = await api('PUT', '/api/admin/settings', admin, { nilai: { 'pendaftaran.dibuka': false } });
    assert.equal(ditolak.status, 409);
    assert.match(ditolak.body.error, /pembaruan database/);

    assert.equal((await api('POST', '/api/admin/settings/database', musyrif)).status, 403);
    const diperbarui = await api('POST', '/api/admin/settings/database', admin);
    assert.equal(diperbarui.status, 200, JSON.stringify(diperbarui.body));
    assert.deepEqual(diperbarui.body.diterapkan, ['043_app_settings.sql']);
    assert.deepEqual(diperbarui.body.status.tertunda, []);
    assert.equal(await jumlahAudit('database.updated'), 1);
    assert.deepEqual((await api('POST', '/api/admin/settings/database', admin)).body.diterapkan, [], 'Kedua kali tidak ada yang diterapkan.');
    assert.equal(await jumlahAudit('database.updated'), 1, 'Tanpa perubahan tidak ada catatan audit baru.');
    assert.equal((await api('GET', '/api/admin/settings', admin)).body.tersedia, true);

    // ------------------------------------------------------------- izin dan validasi
    assert.equal((await api('GET', '/api/admin/settings', musyrif)).status, 403);
    assert.equal((await api('PUT', '/api/admin/settings', musyrif, { nilai: { 'pendaftaran.dibuka': false } })).status, 403);
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'asisten.batasPerJam': 0 } })).status, 422);
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'asisten.batasPerJam': 2.5 } })).status, 422);
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'audit.masaSimpanHari': 30 } })).status, 422);
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'pendaftaran.pesanTutup': 'Tutup' } })).status, 422);
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'pendaftaran.dibuka': 'tidak' } })).status, 422);
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'kunci.asing': true } })).status, 422);
    assert.equal(await jumlahAudit('settings.updated'), 0);

    // ------------------------------------------------------------ pendaftaran ditutup
    const pesan = 'Gelombang 2026 sudah penuh. Gelombang berikutnya dibuka Januari 2027.';
    const tutup = await api('PUT', '/api/admin/settings', admin, {
      nilai: { 'pendaftaran.dibuka': false, 'pendaftaran.pesanTutup': `  ${pesan}  `, 'pendaftaran.periode': 'Penerimaan 2027/2028' }
    });
    assert.equal(tutup.status, 200, JSON.stringify(tutup.body));
    assert.deepEqual(tutup.body.berubah.sort(), ['pendaftaran.dibuka', 'pendaftaran.periode', 'pendaftaran.pesanTutup']);
    assert.equal(tutup.body.nilai['pendaftaran.pesanTutup'], pesan, 'Spasi di tepi dibuang.');
    assert.equal(tutup.body.terakhir.oleh, 'Admin Uji');

    const publik = await api('GET', '/api/settings/public');
    assert.equal(publik.status, 200);
    assert.deepEqual(publik.body, {
      pendaftaran: { dibuka: false, periode: 'Penerimaan 2027/2028', pesanTutup: pesan },
      asisten: { situs: true }
    });
    const daftarSaatTutup = await api('POST', '/api/registrations', null, { ...PENDAFTAR, email: 'kedua@uji.test' });
    assert.equal(daftarSaatTutup.status, 409);
    assert.equal(daftarSaatTutup.body.error, pesan);
    assert.equal(daftarSaatTutup.body.code, 'registration-closed');

    const audit = (await database.query("SELECT metadata FROM audit_events WHERE action = 'settings.updated'")).rows;
    assert.equal(audit.length, 1);
    assert.ok(audit[0].metadata.pengaturan.includes('pendaftaran.dibuka: false'), JSON.stringify(audit[0].metadata));
    assert.ok(audit[0].metadata.pengaturan.includes('pendaftaran.pesanTutup'), 'Teks dicatat kuncinya saja.');

    // Nilai yang sama tidak menulis ulang dan tidak menambah audit.
    const sama = await api('PUT', '/api/admin/settings', admin, { nilai: { 'pendaftaran.dibuka': false } });
    assert.deepEqual(sama.body.berubah, []);
    assert.equal(await jumlahAudit('settings.updated'), 1);

    await api('PUT', '/api/admin/settings', admin, { nilai: { 'pendaftaran.dibuka': true } });
    assert.equal((await api('POST', '/api/registrations', null, { ...PENDAFTAR, email: 'ketiga@uji.test' })).status, 201);

    // ---------------------------------------------------------------- asisten website
    assert.equal((await api('POST', '/api/assistant/ask', null, { question: 'Berapa biaya mahad?' })).status, 200);
    await api('PUT', '/api/admin/settings', admin, { nilai: { 'asisten.situs': false } });
    const asistenMati = await api('POST', '/api/assistant/ask', null, { question: 'Berapa biaya mahad?' });
    assert.equal(asistenMati.status, 503);
    assert.equal(asistenMati.body.nonaktif, true);
    assert.equal((await api('GET', '/api/settings/public')).body.asisten.situs, false);

    // -------------------------------------------------------------- catatan kesehatan
    const santri = (await api('POST', '/api/students', admin, { name: 'Santri Uji', program: 'Kuliah S1 Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', gender: 'putra' })).body.student;
    const kesehatan = { occurredOn: '2026-09-01', condition: 'sakit-ringan', complaint: 'Demam', actionTaken: 'Istirahat' };
    assert.equal((await api('GET', `/api/students/${santri.id}/care`, admin)).body.healthEnabled, false);
    assert.equal((await api('POST', `/api/students/${santri.id}/health`, admin, kesehatan)).status, 404);
    await api('PUT', '/api/admin/settings', admin, { nilai: { 'kesehatan.aktif': true } });
    assert.equal((await api('GET', `/api/students/${santri.id}/care`, admin)).body.healthEnabled, true);
    assert.equal((await api('POST', `/api/students/${santri.id}/health`, admin, kesehatan)).status, 201);
    const ringkasan = await api('GET', '/api/admin/overview', admin);
    assert.equal(ringkasan.body.healthEnabled, true, 'Dashboard ikut membaca saklar yang sama.');

    console.log('settings tests passed (database lama, izin, validasi, pendaftaran, asisten, kesehatan)');
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
