// Unggah dan unduh berkas, diuji lewat HTTP di atas PostgreSQL sungguhan (PGlite)
// dan penyimpanan disk sementara.
//
// Yang diperiksa terutama: siapa TIDAK boleh membuka berkas orang lain, dan isi
// berkas yang menyamar tidak lolos.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { createLocalStorage } = require('./storage/local.js');
const { safeFileName } = require('./file-service.js');
const { matchesSignature } = require('./storage/upload-policies.js');

const KATA_SANDI = 'kata-sandi-berkas-uji';

// Isi berkas contoh dengan byte awal yang benar.
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0x00)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x00)]);
// Berkas Windows yang diawali "MZ". Inilah yang biasa diganti nama menjadi .pdf.
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x90)]);

async function request(baseUrl, method, pathname, { token, body, raw, contentType, redirect } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (raw) headers['Content-Type'] = contentType || 'application/octet-stream';
  else headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: raw || (body === undefined ? undefined : JSON.stringify(body)),
    redirect: redirect || 'manual'
  });
  const tipe = response.headers.get('content-type') || '';
  let isi = null;
  if (tipe.includes('application/json')) isi = await response.json();
  else if (response.status !== 204 && response.status !== 302) isi = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body: isi, headers: response.headers };
}

async function run() {
  // Pemeriksaan tanda tangan byte, tanpa perlu server.
  assert.equal(matchesSignature('application/pdf', PDF), true);
  assert.equal(matchesSignature('application/pdf', EXE), false, 'Berkas .exe tidak boleh lolos sebagai PDF.');
  assert.equal(matchesSignature('image/png', PNG), true);
  assert.equal(matchesSignature('image/png', JPEG), false);
  assert.equal(matchesSignature('image/webp', Buffer.from('RIFF????WEBPxxxx')), true);
  assert.equal(matchesSignature('image/webp', Buffer.from('RIFF????WAVExxxx')), false, 'RIFF saja belum cukup untuk WebP.');
  assert.equal(matchesSignature('application/pdf', Buffer.from('%PD')), false, 'Berkas terlalu pendek ditolak.');

  // Nama berkas dibersihkan sebelum masuk header Content-Disposition.
  assert.equal(safeFileName('../../etc/passwd', 'application/pdf'), 'etc passwd');
  assert.equal(safeFileName('paspor"; rm -rf /.pdf', 'application/pdf'), 'paspor rm -rf .pdf');
  assert.equal(safeFileName('', 'image/png'), 'berkas.png');
  assert.equal(safeFileName('Ijazah Aliyah 2026.pdf', 'application/pdf'), 'Ijazah Aliyah 2026.pdf');

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-berkas-'));
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'bootstrap-berkas-uji',
    rateLimiter: createRelaxedRateLimiter(),
    storage: createLocalStorage({ rootDirectory: sandbox })
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await request(baseUrl, 'POST', '/api/auth/bootstrap', {
      token: 'bootstrap-berkas-uji',
      body: { name: 'Admin Berkas', email: 'admin@hamasah.test', password: KATA_SANDI }
    });
    async function masuk(email) {
      const hasil = await request(baseUrl, 'POST', '/api/auth/login', { body: { email, password: KATA_SANDI } });
      assert.equal(hasil.status, 200, `Login ${email} gagal.`);
      return hasil.body.accessToken;
    }
    const adminToken = await masuk('admin@hamasah.test');

    async function buatAkun(nama, email, role) {
      const dibuat = await request(baseUrl, 'POST', '/api/accounts', {
        token: adminToken, body: { name: nama, email, role, password: KATA_SANDI }
      });
      assert.equal(dibuat.status, 201, JSON.stringify(dibuat.body));
      return { id: dibuat.body.account.id, token: await masuk(email) };
    }
    const wali = await buatAkun('Wali Fikri', 'wali@hamasah.test', 'parent');
    const waliLain = await buatAkun('Wali Lain', 'wali-lain@hamasah.test', 'parent');
    const santriAkun = await buatAkun('Fikri', 'santri@hamasah.test', 'student');

    const santri = await request(baseUrl, 'POST', '/api/students', {
      token: adminToken,
      body: { name: 'Fikri Santri', program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20' }
    });
    const studentId = santri.body.student.id;
    await request(baseUrl, 'PATCH', `/api/students/${studentId}/accounts`, {
      token: adminToken, body: { studentAccountId: santriAkun.id, parentAccountIds: [wali.id] }
    });

    // --- Alur lengkap: minta tempat, kirim isi, unduh ---
    const diminta = await request(baseUrl, 'POST', '/api/uploads', {
      token: adminToken,
      body: { purpose: 'student-media', entityId: studentId, fileName: 'Foto Talaqqi.png', contentType: 'image/png', size: PNG.length }
    });
    assert.equal(diminta.status, 201, JSON.stringify(diminta.body));
    const fileId = diminta.body.upload.id;
    assert.equal(diminta.body.upload.status, 'pending');

    const dikirim = await request(baseUrl, 'PUT', `/api/uploads/${fileId}/content`, {
      token: adminToken, raw: PNG, contentType: 'image/png'
    });
    assert.equal(dikirim.status, 200, JSON.stringify(dikirim.body));
    assert.equal(dikirim.body.file.status, 'ready');
    assert.match(dikirim.body.file.sha256, /^[0-9a-f]{64}$/);

    // Kunci penyimpanan tidak boleh memuat nama asli berkas.
    const baris = await database.query('SELECT storage_key, original_name FROM file_objects WHERE id = $1', [fileId]);
    assert.equal(baris.rows[0].original_name, 'Foto Talaqqi.png');
    assert.equal(baris.rows[0].storage_key.includes('Foto'), false, 'Nama asli tidak boleh menjadi bagian kunci penyimpanan.');
    assert.match(baris.rows[0].storage_key, /^student-media\/[\w-]+\/[0-9a-f-]+\.png$/);

    // Berkas benar-benar ada di disk, dan di luar folder yang disajikan web.
    const tersimpan = path.join(sandbox, 'hamasah-private', baris.rows[0].storage_key);
    assert.ok(fs.existsSync(tersimpan), 'Berkas tersimpan di folder penyimpanan.');

    const unduh = await request(baseUrl, 'GET', `/api/files/${fileId}`, { token: adminToken });
    assert.equal(unduh.status, 200);
    assert.equal(unduh.headers.get('content-type'), 'image/png');
    assert.match(unduh.headers.get('content-disposition'), /attachment; filename="Foto Talaqqi.png"/);
    assert.equal(unduh.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(unduh.body, PNG);

    // --- Isi yang menyamar ditolak ---
    const mintaPdf = await request(baseUrl, 'POST', '/api/uploads', {
      token: adminToken,
      body: { purpose: 'course-file', entityId: 'maddah-uji', fileName: 'materi.pdf', contentType: 'application/pdf', size: EXE.length }
    });
    assert.equal(mintaPdf.status, 201);
    const menyamar = await request(baseUrl, 'PUT', `/api/uploads/${mintaPdf.body.upload.id}/content`, {
      token: adminToken, raw: EXE, contentType: 'application/pdf'
    });
    assert.equal(menyamar.status, 422);
    assert.match(menyamar.body.error, /tidak sesuai dengan tipe/);
    // Berkas yang ditolak tidak boleh ikut tersimpan.
    const statusMenyamar = await database.query('SELECT status FROM file_objects WHERE id = $1', [mintaPdf.body.upload.id]);
    assert.equal(statusMenyamar.rows[0].status, 'pending', 'Berkas yang ditolak tetap pending, bukan ready.');

    // --- Tipe yang tidak diterima untuk tujuan itu ---
    const tipeSalah = await request(baseUrl, 'POST', '/api/uploads', {
      token: adminToken,
      body: { purpose: 'course-file', entityId: 'maddah-uji', fileName: 'gambar.png', contentType: 'image/png', size: 100 }
    });
    assert.equal(tipeSalah.status, 422);
    assert.match(tipeSalah.body.error, /Tipe berkas tidak diterima/);

    // --- Ukuran berlebih ---
    const terlaluBesar = await request(baseUrl, 'POST', '/api/uploads', {
      token: adminToken,
      body: { purpose: 'signature-asset', entityId: 'hamasah', fileName: 'ttd.png', contentType: 'image/png', size: 5 * 1024 * 1024 }
    });
    assert.equal(terlaluBesar.status, 422);
    assert.match(terlaluBesar.body.error, /melebihi batas 1 MB/);

    // Ukuran yang dilaporkan kecil tetapi isinya besar juga ditolak saat isi dikirim.
    const mintaKecil = await request(baseUrl, 'POST', '/api/uploads', {
      token: adminToken,
      body: { purpose: 'signature-asset', entityId: 'hamasah', fileName: 'ttd.png', contentType: 'image/png', size: 100 }
    });
    const isiBesar = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 1, 0)]);
    const ditolakBesar = await request(baseUrl, 'PUT', `/api/uploads/${mintaKecil.body.upload.id}/content`, {
      token: adminToken, raw: isiBesar, contentType: 'image/png'
    });
    assert.equal(ditolakBesar.status, 413, 'Isi yang melebihi batas ditolak walau ukuran yang dilaporkan kecil.');

    // --- Izin: wali lain tidak bisa mengunduh ---
    assert.equal((await request(baseUrl, 'GET', `/api/files/${fileId}`, { token: wali.token })).status, 200, 'Wali santri ini boleh.');
    assert.equal((await request(baseUrl, 'GET', `/api/files/${fileId}`, { token: santriAkun.token })).status, 200, 'Santri sendiri boleh.');
    const ditolakWaliLain = await request(baseUrl, 'GET', `/api/files/${fileId}`, { token: waliLain.token });
    assert.equal(ditolakWaliLain.status, 403, 'Wali lain tidak boleh membuka foto santri orang.');
    assert.match(ditolakWaliLain.body.error, /tidak memiliki akses/);
    // Tanpa sesi sama sekali.
    assert.equal((await request(baseUrl, 'GET', `/api/files/${fileId}`)).status, 403);

    // Wali tidak boleh mengunggah foto santri.
    const waliUnggah = await request(baseUrl, 'POST', '/api/uploads', {
      token: wali.token,
      body: { purpose: 'student-media', entityId: studentId, fileName: 'foto.png', contentType: 'image/png', size: PNG.length }
    });
    assert.equal(waliUnggah.status, 403);

    // --- Berkas yang belum lengkap isinya tidak bisa diunduh ---
    const belumLengkap = await request(baseUrl, 'POST', '/api/uploads', {
      token: adminToken,
      body: { purpose: 'student-media', entityId: studentId, fileName: 'belum.png', contentType: 'image/png', size: PNG.length }
    });
    assert.equal((await request(baseUrl, 'GET', `/api/files/${belumLengkap.body.upload.id}`, { token: adminToken })).status, 404);

    // --- Isi tidak bisa dikirim dua kali ---
    const kedua = await request(baseUrl, 'PUT', `/api/uploads/${fileId}/content`, {
      token: adminToken, raw: PNG, contentType: 'image/png'
    });
    assert.equal(kedua.status, 422);
    assert.match(kedua.body.error, /sudah pernah dikirim/);

    // --- Dokumen pendaftaran: pemilik token pendaftaran, bukan pendaftar lain ---
    const daftar = await request(baseUrl, 'POST', '/api/registrations', {
      body: {
        applicantName: 'Calon Berkas', phone: '081234567890', guardianName: 'Wali Berkas',
        guardianPhone: '081298765432', email: 'berkas@example.test', guardianEmail: 'wali.berkas@example.test', birthDate: '2004-01-01', gender: 'putra', schoolOrigin: 'SMA Uji', guardianConsent: true, program: 'kuliah-al-azhar', educationLevel: 'SMA', city: 'Bandung', consent: true, dataProcessingConsent: true
      }
    });
    const registrationId = daftar.body.registration.registrationId;
    const tokenPendaftar = daftar.body.accessToken;

    const mintaPaspor = await request(baseUrl, 'POST', '/api/uploads', {
      token: tokenPendaftar,
      body: { purpose: 'registration-document', entityId: registrationId, fileName: 'paspor.pdf', contentType: 'application/pdf', size: PDF.length }
    });
    assert.equal(mintaPaspor.status, 201, JSON.stringify(mintaPaspor.body));
    const pasporId = mintaPaspor.body.upload.id;
    assert.equal((await request(baseUrl, 'PUT', `/api/uploads/${pasporId}/content`, {
      token: tokenPendaftar, raw: PDF, contentType: 'application/pdf'
    })).status, 200);

    assert.equal((await request(baseUrl, 'GET', `/api/files/${pasporId}`, { token: tokenPendaftar })).status, 200);
    assert.equal((await request(baseUrl, 'GET', `/api/files/${pasporId}`, { token: adminToken })).status, 200, 'Petugas boleh memeriksa berkas pendaftaran.');
    const pasporKeWali = await request(baseUrl, 'GET', `/api/files/${pasporId}`, { token: wali.token });
    assert.equal(pasporKeWali.status, 403, 'Wali santri lain tidak boleh membuka paspor calon santri.');
    assert.equal((await request(baseUrl, 'GET', `/api/files/${pasporId}`)).status, 403, 'Tanpa token pendaftaran, ditolak.');

    // --- Setiap unduhan tercatat di audit ---
    const audit = await request(baseUrl, 'GET', '/api/audit?limit=100', { token: adminToken });
    const aksi = audit.body.items.map((event) => event.action);
    assert.ok(aksi.includes('file.uploaded'), 'Unggahan tercatat.');
    assert.ok(aksi.includes('file.downloaded'), 'Unduhan tercatat, karena inilah cara dokumen pribadi keluar dari sistem.');

    console.log('file upload tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
