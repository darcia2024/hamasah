// Matriks akses: setiap endpoint dicoba oleh setiap role, dan tanpa login sama sekali.
//
// Yang diperiksa bukan status sukses, melainkan penjagaannya:
//   tanpa sesi          -> 401 "Silakan masuk terlebih dahulu."
//   role tidak berhak   -> 403 "Anda tidak memiliki akses ke fitur ini."
//   role berhak         -> tidak pernah dibalas dengan dua pesan di atas
//
// Status akhir untuk role yang berhak sengaja tidak dipatok, karena bisa 200, 201,
// 422 (data tidak valid), atau 403 dengan pesan lain (misalnya wali membuka santri
// milik wali lain). Yang penting penjagaan di lapisan route berperilaku benar.

const assert = require('node:assert/strict');
const path = require('node:path');
const { ROUTES, createHamasahApp } = require('./app.js');
const { NOT_ALLOWED, NOT_SIGNED_IN, PERMISSIONS, ROLES } = require('./access-policy.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SEMUA_ROLE = Object.values(ROLES);
const KATA_SANDI = 'kata-sandi-matriks-uji';

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
  const isi = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body: isi };
}

async function run() {
  const database = await createTestDatabase();
  // Matriks mengirim ratusan permintaan dari satu alamat; yang diuji di sini
  // otorisasi, bukan batas laju.
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'bootstrap-matriks-uji',
    rateLimiter: createRelaxedRateLimiter()
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Admin pertama lewat bootstrap, sisanya dibuat admin.
    await request(baseUrl, 'POST', '/api/auth/bootstrap', {
      token: 'bootstrap-matriks-uji',
      body: { name: 'Admin Matriks', email: 'admin@hamasah.test', password: KATA_SANDI }
    });

    const token = {};
    const akunId = {};
    async function masuk(email) {
      const hasil = await request(baseUrl, 'POST', '/api/auth/login', { body: { email, password: KATA_SANDI } });
      assert.equal(hasil.status, 200, `Login ${email} gagal.`);
      return hasil.body.accessToken;
    }
    token[ROLES.ADMIN] = await masuk('admin@hamasah.test');

    for (const role of SEMUA_ROLE.filter((nama) => nama !== ROLES.ADMIN)) {
      const dibuat = await request(baseUrl, 'POST', '/api/accounts', {
        token: token[ROLES.ADMIN],
        body: { name: `Akun ${role}`, email: `${role}@hamasah.test`, role, password: KATA_SANDI }
      });
      assert.equal(dibuat.status, 201, `Gagal membuat akun ${role}: ${JSON.stringify(dibuat.body)}`);
      akunId[role] = dibuat.body.account.id;
      token[role] = await masuk(`${role}@hamasah.test`);
    }

    // /api/me ikut mengirim daftar izin untuk menyusun menu.
    const saya = await request(baseUrl, 'GET', '/api/me', { token: token[ROLES.FINANCE] });
    assert.deepEqual(saya.body.permissions, ['finance.manage', 'leave.payment-read', 'operations.manage', 'operations.read']);
    assert.deepEqual(
      (await request(baseUrl, 'GET', '/api/me', { token: token[ROLES.PARENT] })).body.permissions,
      ['dormitory-schedule.read', 'family-messages.send', 'feedback.mine', 'feedback.send', 'programs.history', 'residence.read', 'students.read']
    );

    // Data secukupnya supaya endpoint punya sasaran yang nyata.
    const santri = await request(baseUrl, 'POST', '/api/students', {
      token: token[ROLES.ADMIN],
      body: { name: 'Santri Matriks', program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20' }
    });
    assert.equal(santri.status, 201);
    const studentId = santri.body.student.id;
    await request(baseUrl, 'PATCH', `/api/students/${studentId}/accounts`, {
      token: token[ROLES.ADMIN],
      body: { studentAccountId: akunId[ROLES.STUDENT], parentAccountIds: [akunId[ROLES.PARENT]] }
    });

    const maddah = await request(baseUrl, 'POST', '/api/courses', {
      token: token[ROLES.ADMIN],
      body: { title: 'Nahwu Matriks', description: 'Maddah untuk pengujian akses.' }
    });
    assert.equal(maddah.status, 201);
    const courseId = maddah.body.course.id;
    const materi = await request(baseUrl, 'POST', `/api/courses/${courseId}/materials`, {
      token: token[ROLES.ADMIN],
      body: {
        type: 'text', title: 'Materi Matriks', content: 'Isi materi.', summary: 'Rangkuman materi matriks.',
        keyPoints: ['Poin pertama.'], studyGuide: [{ question: 'Apa ini?', answer: 'Materi uji.' }]
      }
    });
    assert.equal(materi.status, 201);
    const materialId = materi.body.material.id;
    await request(baseUrl, 'POST', `/api/students/${studentId}/courses/${courseId}`, { token: token[ROLES.ADMIN] });

    const tagihan = await request(baseUrl, 'POST', '/api/operations/invoices', {
      token: token[ROLES.ADMIN],
      body: { studentId, description: 'SPP matriks', amount: 1000000 }
    });
    assert.equal(tagihan.status, 201);
    const invoiceId = tagihan.body.invoice.id;

    const asrama = await request(baseUrl, 'POST', '/api/dormitories', {
      token: token[ROLES.ADMIN],
      body: { name: 'Asrama Matriks', area: 'Hay Asyir', gender: 'putra' }
    });
    assert.equal(asrama.status, 201, JSON.stringify(asrama.body));
    const dormitoryId = asrama.body.dormitory.id;

    const pendaftaran = await request(baseUrl, 'POST', '/api/registrations', {
      body: {
        applicantName: 'Calon Matriks', phone: '081234567890', guardianName: 'Wali Matriks',
        guardianPhone: '081298765432', email: 'matriks@example.test', guardianEmail: 'wali.matriks@example.test', birthDate: '2004-01-01', gender: 'putra', schoolOrigin: 'SMA Uji', guardianConsent: true, program: 'kuliah-al-azhar', educationLevel: 'SMA', city: 'Bandung', consent: true, dataProcessingConsent: true
      }
    });
    assert.equal(pendaftaran.status, 201);
    const registrationId = pendaftaran.body.registration.registrationId;

    const R = ROLES;
    const matriks = [
      { permission: 'accounts.manage', method: 'GET', path: '/api/accounts' },
      {
        permission: 'accounts.manage', method: 'POST', path: '/api/accounts',
        body: () => ({ name: 'Akun Tambahan', email: `tambahan-${Math.random().toString(36).slice(2)}@hamasah.test`, role: R.PARENT, password: KATA_SANDI })
      },

      {
        permission: 'accounts.manage', method: 'PATCH', path: () => `/api/accounts/${akunId[R.TEACHER]}/active`,
        body: () => ({ active: true })
      },
      { permission: 'accounts.invitation-send', method: 'GET', path: '/api/notifications?limit=5' },
      { permission: 'accounts.invitation-send', method: 'POST', path: () => `/api/accounts/${akunId[R.TEACHER]}/invitation` },

      { permission: 'audit.read', method: 'GET', path: '/api/audit?limit=5' },
      { permission: 'overview.read', method: 'GET', path: '/api/admin/overview' },
      { permission: 'monitoring.read', method: 'GET', path: '/api/admin/monitoring-pusat' },
      { permission: 'monitoring.manage', method: 'POST', path: '/api/admin/monitoring-pusat/masalah', body: () => ({ kind: 'lapor-diri', note: '' }) },
      { permission: 'monitoring.manage', method: 'PATCH', path: '/api/admin/monitoring-pusat/masalah', body: () => ({ kind: 'nol', status: 'baru' }) },
      { permission: 'monitoring.manage', method: 'PUT', path: '/api/admin/monitoring-pusat/asrama/00000000-0000-4000-8000-000000000000/negara', body: () => ({ country: 'Narnia' }) },
      { permission: 'urusan.manage', method: 'GET', path: '/api/musyrif/urusan' },
      { permission: 'urusan.manage', method: 'POST', path: '/api/musyrif/urusan', body: () => ({ kind: 'lapor-diri', note: '' }) },
      { permission: 'urusan.manage', method: 'PATCH', path: '/api/musyrif/urusan', body: () => ({ kind: 'nol', status: 'baru' }) },
      { permission: 'overview.dormitory', method: 'GET', path: '/api/musyrif/ringkasan' },
      // Kelola Asrama (migrasi 050). Isian tidak valid atau id yang tidak ada: tidak ada yang tersimpan.
      { permission: 'dormitory-management.manage', method: 'GET', path: '/api/asrama' },
      // Struktur kamar dan penempatan (migrasi 059).
      { permission: 'dormitory-management.manage', method: 'GET', path: () => `/api/asrama/${dormitoryId}/kamar` },
      { permission: 'dormitory-management.manage', method: 'POST', path: () => `/api/asrama/${dormitoryId}/kamar`, body: () => ({ name: '' }) },
      { permission: 'dormitory-management.manage', method: 'GET', path: () => `/api/asrama/${dormitoryId}/masalah` },
      { permission: 'dormitory-management.manage', method: 'POST', path: '/api/students/00000000-0000-4000-8000-000000000000/kamar', body: () => ({ dormitoryId: '' }) },
      { permission: 'dormitory-management.manage', method: 'PATCH', path: () => `/api/asrama/${dormitoryId}/kamar/00000000-0000-4000-8000-000000000000`, body: () => ({ name: '' }) },
      { permission: 'dormitory-management.manage', method: 'DELETE', path: () => `/api/asrama/${dormitoryId}/kamar/00000000-0000-4000-8000-000000000000` },
      { permission: 'dormitories.manage', method: 'PUT', path: () => `/api/asrama/${dormitoryId}/lokasi`, body: () => ({ locationId: '00000000-0000-4000-8000-000000000000' }) },
      // Impor santri massal (migrasi 063). Baris kosong: tidak ada yang dibuat.
      { permission: 'students.import', method: 'GET', path: '/api/impor-santri' },
      { permission: 'students.import', method: 'POST', path: '/api/impor-santri/pratinjau', body: () => ({ rows: [] }) },
      { permission: 'students.import', method: 'PATCH', path: '/api/impor-santri/00000000-0000-4000-8000-000000000000/baris/1', body: () => ({ values: {} }) },
      // Profil santri terintegrasi (migrasi 061).
      { permission: 'students.read', method: 'GET', path: '/api/students/00000000-0000-4000-8000-000000000000/profil' },
      { permission: 'students.manage', method: 'PATCH', path: '/api/students/00000000-0000-4000-8000-000000000000/profil', body: () => ({ phone: '1' }) },
      { permission: 'students.manage', method: 'POST', path: '/api/students/00000000-0000-4000-8000-000000000000/dokumen', body: () => ({ kind: 'paspor' }) },
      { permission: 'students.manage', method: 'DELETE', path: '/api/students/00000000-0000-4000-8000-000000000000/dokumen/00000000-0000-4000-8000-000000000001' },
      // Lokasi, program, dan batch (migrasi 060). Id yang tidak ada: tidak ada yang tersimpan.
      { permission: 'programs.manage', method: 'GET', path: '/api/pembinaan/lokasi' },
      { permission: 'programs.manage', method: 'GET', path: '/api/pembinaan/lokasi/00000000-0000-4000-8000-000000000000' },
      { permission: 'programs.manage', method: 'POST', path: '/api/pembinaan/lokasi/00000000-0000-4000-8000-000000000000/program', body: () => ({ name: 'Uji', kind: 'karantina' }) },
      { permission: 'programs.manage', method: 'PATCH', path: '/api/pembinaan/program/00000000-0000-4000-8000-000000000000', body: () => ({ name: 'Uji' }) },
      { permission: 'programs.manage', method: 'POST', path: '/api/pembinaan/program/00000000-0000-4000-8000-000000000000/batch', body: () => ({ name: 'Uji', startsOn: '2027-01-01' }) },
      { permission: 'programs.manage', method: 'GET', path: '/api/pembinaan/batch/00000000-0000-4000-8000-000000000000' },
      { permission: 'programs.manage', method: 'PATCH', path: '/api/pembinaan/batch/00000000-0000-4000-8000-000000000000', body: () => ({ status: 'berjalan' }) },
      { permission: 'programs.manage', method: 'POST', path: '/api/pembinaan/batch/00000000-0000-4000-8000-000000000000/peserta', body: () => ({ studentIds: [] }) },
      { permission: 'programs.manage', method: 'PATCH', path: '/api/pembinaan/batch/00000000-0000-4000-8000-000000000000/peserta/00000000-0000-4000-8000-000000000001', body: () => ({ status: 'keluar' }) },
      { permission: 'programs.admin', method: 'GET', path: '/api/pembinaan/petugas' },
      { permission: 'programs.admin', method: 'PUT', path: '/api/pembinaan/lokasi/00000000-0000-4000-8000-000000000000/petugas', body: () => ({ accountId: '00000000-0000-4000-8000-000000000001' }) },
      { permission: 'programs.history', method: 'GET', path: '/api/students/00000000-0000-4000-8000-000000000000/riwayat-pembinaan' },
      { permission: 'dormitories.manage', method: 'GET', path: '/api/lokasi' },
      { permission: 'dormitories.manage', method: 'POST', path: '/api/lokasi', body: () => ({ name: '' }) },
      { permission: 'dormitory-management.manage', method: 'GET', path: () => `/api/asrama/${dormitoryId}` },
      { permission: 'dormitory-management.manage', method: 'POST', path: () => `/api/asrama/${dormitoryId}/jadwal`, body: () => ({ title: '' }) },
      { permission: 'dormitory-management.manage', method: 'PATCH', path: () => `/api/asrama/${dormitoryId}/jadwal/00000000-0000-4000-8000-000000000000`, body: () => ({ title: '' }) },
      { permission: 'dormitory-management.manage', method: 'DELETE', path: () => `/api/asrama/${dormitoryId}/jadwal/00000000-0000-4000-8000-000000000000` },
      { permission: 'dormitory-management.manage', method: 'PUT', path: () => `/api/asrama/${dormitoryId}/piket`, body: () => ({}) },
      { permission: 'dormitory-management.manage', method: 'POST', path: () => `/api/asrama/${dormitoryId}/galeri`, body: () => ({ fileId: '' }) },
      { permission: 'dormitory-management.manage', method: 'DELETE', path: () => `/api/asrama/${dormitoryId}/galeri/00000000-0000-4000-8000-000000000000` },
      { permission: 'dormitory-schedule.read', method: 'GET', path: '/api/asrama-saya' },
      // Iqamah (migrasi 052). Tanggal kosong atau id yang tidak ada: tidak ada yang tersimpan.
      { permission: 'residence.read', method: 'GET', path: '/api/iqamah-saya' },
      { permission: 'residence.report', method: 'POST', path: () => `/api/students/${studentId}/iqamah/laporan`, body: () => ({ expiresOn: '' }) },
      { permission: 'residence.renewal', method: 'PUT', path: () => `/api/students/00000000-0000-4000-8000-000000000000/iqamah/pengurusan`, body: () => ({ aktif: true }) },
      { permission: 'residence.manage', method: 'PUT', path: () => `/api/students/${studentId}/iqamah`, body: () => ({ expiresOn: '' }) },
      { permission: 'residence.manage', method: 'POST', path: '/api/iqamah/laporan/00000000-0000-4000-8000-000000000000/keputusan', body: () => ({ decision: 'diterima' }) },
      { permission: 'residence.manage', method: 'GET', path: () => `/api/asrama/${dormitoryId}/iqamah` },
      { permission: 'demo.manage', method: 'GET', path: '/api/admin/demo-data' },
      // Langkah yang tidak dikenal dan konfirmasi yang salah: admin mendapat 422, bukan
      // data demo sungguhan di database uji matriks.
      { permission: 'demo.manage', method: 'POST', path: '/api/admin/demo-data/langkah', body: () => ({ langkah: 'tidak-ada' }) },
      { permission: 'demo.manage', method: 'POST', path: '/api/admin/demo-data/hapus', body: () => ({ konfirmasi: 'bukan' }) },
      { permission: 'demo.manage', method: 'POST', path: '/api/admin/demo-data/sandi' },
      { permission: 'settings.manage', method: 'GET', path: '/api/admin/settings' },
      { permission: 'content.manage', method: 'GET', path: '/api/admin/content' },
      // Isi tidak lengkap: admin mendapat 422, bukan konten situs yang berubah.
      { permission: 'content.manage', method: 'PUT', path: '/api/admin/content/kontak', body: () => ({ nilai: {} }) },
      { permission: 'content.manage', method: 'DELETE', path: '/api/admin/content/pengumuman' },
      { permission: 'templates.manage', method: 'GET', path: '/api/admin/templates' },
      { permission: 'templates.manage', method: 'PUT', path: '/api/admin/templates/kop', body: () => ({ nilai: {} }) },
      { permission: 'templates.manage', method: 'DELETE', path: '/api/admin/templates/kop' },
      { permission: 'registrations.read', method: 'GET', path: '/api/templates/whatsapp' },
      // Tanpa perubahan dan database yang sudah lengkap: admin mendapat 200 tanpa mengubah apa pun.
      { permission: 'settings.manage', method: 'PUT', path: '/api/admin/settings', body: () => ({ nilai: {} }) },
      { permission: 'settings.manage', method: 'POST', path: '/api/admin/settings/database' },

      { permission: 'dormitories.manage', method: 'GET', path: '/api/dormitories' },
      {
        permission: 'dormitories.manage', method: 'POST', path: '/api/dormitories',
        body: () => ({ name: `Asrama ${Math.random().toString(36).slice(2, 8)}`, area: 'Hay Sabi', gender: 'putri' })
      },
      { permission: 'dormitories.manage', method: 'POST', path: () => `/api/dormitories/${dormitoryId}/staff/${akunId[R.SUPERVISOR]}` },
      { permission: 'dormitories.manage', method: 'DELETE', path: () => `/api/dormitories/${dormitoryId}/staff/${akunId[R.SUPERVISOR]}` },

      { permission: 'students.edit', method: 'PATCH', path: () => `/api/students/${studentId}`, body: () => ({ city: 'Kairo' }) },
      { permission: 'dormitories.manage', method: 'PATCH', path: () => `/api/dormitories/${dormitoryId}`, body: () => ({ area: 'Hay Asyir' }) },
      { permission: 'accounts.manage', method: 'PATCH', path: () => `/api/accounts/${akunId[R.TEACHER]}`, body: () => ({ name: 'Akun teacher' }) },
      { permission: 'accounts.manage', method: 'POST', path: () => `/api/accounts/00000000-0000-4000-8000-000000000000/password-reset` },
      { permission: 'courses.manage', method: 'PATCH', path: () => `/api/courses/${courseId}`, body: () => ({ title: 'Nahwu Matriks' }) },
      { permission: 'students.read', method: 'GET', path: '/api/my-students' },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/dashboard` },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/roadmap` },
      { permission: 'students.read', method: 'GET', path: '/api/honors' },
      // Fase di luar rentang dan teladan tanpa data lengkap: admin mendapat 422, tidak mengubah apa pun.
      { permission: 'honors.manage', method: 'PUT', path: () => `/api/students/${studentId}/roadmap`, body: () => ({ phase: 99 }) },
      { permission: 'honors.manage', method: 'GET', path: '/api/admin/honors?month=2026-10' },
      { permission: 'honors.manage', method: 'POST', path: '/api/admin/honors', body: () => ({ month: '2026-10' }) },
      { permission: 'honors.manage', method: 'DELETE', path: '/api/admin/honors/00000000-0000-4000-8000-000000000000' },
      // Kehidupan santri (migrasi 045). Isian tidak valid supaya tidak ada yang tersimpan.
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/juz` },
      { permission: 'students.read', method: 'GET', path: '/api/announcements' },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/leave` },
      { permission: 'students.manage', method: 'PUT', path: () => `/api/students/${studentId}/juz/31`, body: () => ({ status: 'hafal' }) },
      { permission: 'announcements.manage', method: 'GET', path: '/api/announcements/asrama' },
      { permission: 'announcements.manage', method: 'POST', path: '/api/announcements', body: () => ({}) },
      { permission: 'announcements.manage', method: 'DELETE', path: '/api/announcements/00000000-0000-4000-8000-000000000000' },
      { permission: 'leave.request', method: 'POST', path: () => `/api/students/${studentId}/leave`, body: () => ({}) },
      { permission: 'leave.request', method: 'POST', path: '/api/leave/00000000-0000-4000-8000-000000000000/batal' },
      { permission: 'leave.decide', method: 'GET', path: '/api/leave' },
      { permission: 'leave.decide', method: 'POST', path: '/api/students/00000000-0000-4000-8000-000000000000/izin-pulang', body: () => ({ reason: '' }) },
      { permission: 'leave.payment-read', method: 'GET', path: '/api/izin-pulang' },
      { permission: 'leave.decide', method: 'POST', path: '/api/leave/00000000-0000-4000-8000-000000000000/returned', body: () => ({}) },
      { permission: 'students.manage', method: 'GET', path: '/api/presensi-asrama?mode=sholat&date=2026-10-01&prayer=subuh' },
      { permission: 'students.manage', method: 'GET', path: '/api/presensi-asrama/hari-ini' },
      { permission: 'students.manage', method: 'POST', path: '/api/presensi-asrama/sholat', body: () => ({ date: '2026-10-01', prayer: 'subuh', entries: [] }) },
      { permission: 'students.manage', method: 'POST', path: '/api/presensi-asrama/kegiatan', body: () => ({ date: '2026-10-01', category: 'Ta', entries: [] }) },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/doa` },
      { permission: 'family-messages.send', method: 'POST', path: () => `/api/students/${studentId}/doa`, body: () => ({}) },
      { permission: 'feedback.mine', method: 'GET', path: '/api/masukan/saya' },
      { permission: 'feedback.send', method: 'POST', path: '/api/masukan', body: () => ({}) },
      { permission: 'feedback.read', method: 'GET', path: '/api/masukan' },
      { permission: 'feedback.read', method: 'PATCH', path: '/api/masukan/00000000-0000-4000-8000-000000000000', body: () => ({}) },
      { permission: 'family-messages.read', method: 'GET', path: '/api/doa' },
      { permission: 'family-messages.read', method: 'POST', path: '/api/doa/00000000-0000-4000-8000-000000000000/dibaca' },
      { permission: 'leave.decide', method: 'PATCH', path: '/api/leave/00000000-0000-4000-8000-000000000000', body: () => ({ decision: 'tidak-ada' }) },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/report` },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/report.pdf` },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/course-progress` },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/care` },
      { permission: 'students.manage', method: 'PUT', path: () => `/api/students/${studentId}/prayers`, body: () => ({ date: '2026-09-01', entries: [{ prayer: 'subuh', status: 'berjamaah' }] }) },
      { permission: 'students.manage', method: 'POST', path: () => `/api/students/${studentId}/memorization`, body: () => ({ occurredOn: '2026-09-01', kind: 'ziyadah', portion: 'An-Naba 1-10', grade: 'lancar' }) },
      { permission: 'students.manage', method: 'POST', path: () => `/api/students/${studentId}/health`, body: () => ({ occurredOn: '2026-09-01', condition: 'sehat' }) },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/invoices` },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/invoices/00000000-0000-4000-8000-000000000000/receipt.pdf` },
      {
        permission: 'students.edit', method: 'POST', path: '/api/students',
        body: () => ({ name: 'Santri Tambahan', program: 'Mahad Al-Azhar', city: 'Kairo', joinDate: '2026-08-22' })
      },
      {
        permission: 'students.edit', method: 'PATCH', path: () => `/api/students/${studentId}/accounts`,
        body: () => ({ parentAccountIds: [akunId[R.PARENT]] })
      },
      // Koreksi catatan pembinaan tetap untuk musyrif dan admin (catatan fiktif: 4xx).
      {
        permission: 'students.manage', method: 'PATCH', path: () => `/api/students/${studentId}/attendance/00000000-0000-4000-8000-000000000000`,
        body: () => ({ status: 'present', reason: 'Koreksi uji matriks akses.' })
      },
      {
        permission: 'students.edit', method: 'PATCH', path: () => `/api/students/${studentId}/placement`,
        body: () => ({ gender: 'putra', dormitoryId })
      },
      {
        permission: 'students.manage', method: 'POST', path: () => `/api/students/${studentId}/attendance`,
        body: () => ({ status: 'present', category: 'Subuh berjamaah' })
      },
      {
        permission: 'students.manage', method: 'POST', path: () => `/api/students/${studentId}/violations`,
        body: () => ({ note: 'Catatan pelanggaran untuk pengujian.', level: 'ringan' })
      },

      { permission: 'courses.manage', method: 'GET', path: '/api/courses' },
      { permission: 'courses.manage', method: 'GET', path: () => `/api/courses/${courseId}/submissions` },
      { permission: 'courses.manage', method: 'PUT', path: () => `/api/courses/${courseId}/materials/urutan`, body: () => ({ ids: [] }) },
      { permission: 'courses.manage', method: 'GET', path: () => `/api/courses/${courseId}/progres` },
      { permission: 'courses.manage', method: 'GET', path: '/api/lms/ringkasan-guru' },
      { permission: 'courses.manage', method: 'GET', path: '/api/lms/pilihan-santri' },
      {
        permission: 'courses.manage', method: 'POST', path: '/api/courses',
        body: () => ({ title: 'Maddah Tambahan', description: 'Deskripsi maddah tambahan.' })
      },
      {
        permission: 'courses.manage', method: 'POST', path: () => `/api/courses/${courseId}/materials`,
        body: () => ({
          type: 'text', title: 'Materi Tambahan', content: 'Isi.', summary: 'Rangkuman materi tambahan.',
          keyPoints: ['Poin.'], studyGuide: []
        })
      },
      {
        permission: 'courses.manage', method: 'PATCH', path: () => `/api/courses/${courseId}/materials/${materialId}`,
        body: () => ({ title: 'Materi Matriks Revisi', content: 'Isi materi revisi.', summary: 'Rangkuman materi matriks revisi.', keyPoints: ['Poin revisi.'] })
      },
      { permission: 'courses.manage', method: 'POST', path: () => `/api/students/${studentId}/courses/${courseId}` },
      { permission: 'courses.read', method: 'GET', path: () => `/api/students/${studentId}/courses` },
      { permission: 'courses.read', method: 'GET', path: () => `/api/students/${studentId}/courses/${courseId}` },
      { permission: 'courses.read', method: 'POST', path: () => `/api/students/${studentId}/courses/${courseId}/materials/${materialId}/complete` },
      {
        permission: 'courses.read', method: 'POST',
        path: () => `/api/students/${studentId}/courses/${courseId}/materials/${materialId}/study-help`,
        body: () => ({ question: 'Apa ini?' })
      },

      { permission: 'operations.read', method: 'GET', path: '/api/operations' },
      { permission: 'operations.read', method: 'GET', path: '/api/operations/invoices?limit=5' },
      {
        permission: 'finance.manage', method: 'POST', path: '/api/operations/invoices',
        body: () => ({ studentId, description: 'SPP tambahan', amount: 750000 })
      },
      { permission: 'finance.manage', method: 'PATCH', path: () => `/api/operations/invoices/${invoiceId}/paid` },
      { permission: 'finance.manage', method: 'GET', path: '/api/operations/invoices/massal' },
      // Pratinjau saja: tidak menerbitkan apa pun.
      { permission: 'finance.manage', method: 'POST', path: '/api/operations/invoices/massal', body: () => ({ description: 'SPP pratinjau matriks', amount: 100000 }) },
      {
        permission: 'operations.manage', method: 'POST', path: '/api/operations/visas',
        body: () => ({ studentId, status: 'collecting-documents', note: 'Berkas diperiksa.' })
      },
      {
        permission: 'operations.manage', method: 'POST', path: '/api/operations/inventory',
        body: () => ({ name: 'Lemari asrama', location: 'Hay Asyir', quantity: 3 })
      },

      { permission: 'registrations.read', method: 'GET', path: '/api/registrations' },
      { permission: 'registrations.read', method: 'GET', path: '/api/registrations/ringkasan' },
      { permission: 'registrations.read', method: 'GET', path: '/api/registrations/tindak-lanjut' },
      {
        permission: 'registrations.update-status', method: 'POST', path: '/api/registrations/manual',
        body: () => ({ sumber: 'whatsapp', konfirmasiPersetujuan: false })
      },
      { permission: 'departures.manage', method: 'GET', path: '/api/departures/00000000-0000-4000-8000-000000000000/anggota' },
      { permission: 'departures.manage', method: 'GET', path: '/api/departures/00000000-0000-4000-8000-000000000000/manifest.csv' },
      {
        permission: 'registrations.update-status', method: 'PATCH', path: () => `/api/registrations/${registrationId}/status`,
        body: () => ({ status: 'document-review', note: 'Berkas mulai diperiksa.' })
      },
      {
        permission: 'registrations.update-status', method: 'POST', path: () => `/api/registrations/${registrationId}/notes`,
        body: () => ({ visibility: 'internal', body: 'Catatan matriks.' })
      },
      {
        permission: 'registrations.update-status', method: 'PATCH', path: () => `/api/registrations/${registrationId}/next-steps/00000000-0000-4000-8000-000000000000`,
        body: () => ({ done: true })
      },
      {
        permission: 'registrations.convert', method: 'POST', path: () => `/api/registrations/${registrationId}/convert`
      },
        { permission: 'registrations.update-status', method: 'POST', path: () => `/api/registrations/${registrationId}/access-code`, body: () => ({ confirmedOwner: false }) },
      { permission: 'departures.manage', method: 'GET', path: '/api/departures' },
      { permission: 'departures.manage', method: 'POST', path: '/api/departures', body: () => ({ name: `Kloter Matriks ${Math.random().toString(36).slice(2, 6)}` }) },
      { permission: 'departures.manage', method: 'PATCH', path: '/api/departures/00000000-0000-4000-8000-000000000000', body: () => ({ status: 'confirmed' }) },
      { permission: 'departures.manage', method: 'PUT', path: () => `/api/registrations/${registrationId}/departure`, body: () => ({ departureGroupId: null }) },

      {
        permission: 'articles.write', method: 'POST', path: '/api/articles',
        body: () => ({ title: `Artikel Matriks ${Math.random().toString(36).slice(2, 8)}`, excerpt: 'Ringkasan.', body: 'Isi artikel.' })
      },
      { permission: 'articles.write', method: 'GET', path: '/api/staff/articles' },
      { permission: 'articles.write', method: 'POST', path: '/api/staff/articles/preview', body: () => ({ body: '## Uji' }) },
      { permission: 'articles.write', method: 'GET', path: '/api/staff/articles/artikel-matriks-tidak-ada' },
      { permission: 'inquiries.read', method: 'GET', path: '/api/inquiries' },
      // Toko kelas daring (migrasi 049). Kelas yang tidak ada dan harga kosong: tidak ada yang tersimpan.
      { permission: 'shop.buy', method: 'GET', path: '/api/kelas/saya' },
      { permission: 'shop.buy', method: 'POST', path: '/api/kelas/00000000-0000-4000-8000-000000000000/beli' },
      { permission: 'shop.manage', method: 'GET', path: '/api/admin/kelas' },
      { permission: 'shop.manage', method: 'PUT', path: () => `/api/admin/kelas/${courseId}`, body: () => ({ price: 0 }) },
      {
        permission: 'inquiries.manage', method: 'PATCH',
        path: '/api/inquiries/00000000-0000-4000-8000-000000000000/status',
        body: () => ({ status: 'contacted' })
      },
      { permission: 'finance.manage', method: 'GET', path: '/api/operations/invoices/00000000-0000-0000-0000-000000000001/receipt.pdf' },
      { permission: 'operations.read', method: 'GET', path: '/api/operations/report.csv' },
      { permission: 'operations.read', method: 'GET', path: '/api/operations/pilihan-santri' },
      { permission: 'settings.manage', method: 'POST', path: '/api/admin/settings/artikel' },
      { permission: 'operations.read', method: 'GET', path: '/api/operations/ringkasan' },
      { permission: 'operations.read', method: 'GET', path: '/api/operations/tunggakan' },
      { permission: 'operations.read', method: 'GET', path: '/api/operations/riwayat' },
      {
        permission: 'articles.write', method: 'PATCH', path: '/api/articles/artikel-matriks-tidak-ada',
        body: () => ({ status: 'published' })
      }
    ];

    // Setiap izin yang ada di peta harus benar-benar diuji lewat minimal satu endpoint.
    const izinDiuji = new Set(matriks.map((entri) => entri.permission));
    assert.deepEqual(
      Object.keys(PERMISSIONS).filter((izin) => !izinDiuji.has(izin)),
      [],
      'Ada izin di access-policy.js yang belum diuji di matriks.'
    );

    // Setiap route yang menyatakan izin harus terwakili di matriks.
    const dipakaiRoute = new Set(ROUTES.filter((route) => route.permission).map((route) => `${route.method} ${route.permission}`));
    const diuji = new Set(matriks.map((entri) => `${entri.method} ${entri.permission}`));
    assert.deepEqual(
      [...dipakaiRoute].filter((kunci) => !diuji.has(kunci)).sort(),
      [],
      'Ada route ber-izin yang belum diuji di matriks.'
    );

    let jumlahPemeriksaan = 0;
    for (const entri of matriks) {
      const pathname = typeof entri.path === 'function' ? entri.path() : entri.path;
      const label = `${entri.method} ${pathname} (${entri.permission})`;
      const bolehRole = PERMISSIONS[entri.permission];

      // Tanpa sesi sama sekali.
      const tanpaSesi = await request(baseUrl, entri.method, pathname, { body: entri.body ? entri.body() : undefined });
      assert.equal(tanpaSesi.status, 401, `${label} tanpa sesi seharusnya 401.`);
      assert.equal(tanpaSesi.body.error, NOT_SIGNED_IN, `${label} tanpa sesi memakai pesan yang salah.`);

      // Token asal-asalan diperlakukan sama dengan tanpa sesi.
      const tokenPalsu = await request(baseUrl, entri.method, pathname, {
        token: 'token-yang-tidak-pernah-diterbitkan',
        body: entri.body ? entri.body() : undefined
      });
      assert.equal(tokenPalsu.status, 401, `${label} dengan token palsu seharusnya 401.`);

      for (const role of SEMUA_ROLE) {
        const hasil = await request(baseUrl, entri.method, pathname, {
          token: token[role],
          body: entri.body ? entri.body() : undefined
        });
        jumlahPemeriksaan += 1;

        if (bolehRole.includes(role)) {
          assert.notEqual(hasil.body && hasil.body.error, NOT_ALLOWED, `${label} seharusnya terbuka untuk ${role}.`);
          assert.notEqual(hasil.status, 401, `${label} seharusnya tidak menolak sesi ${role}.`);
          continue;
        }

        assert.equal(hasil.status, 403, `${label} seharusnya 403 untuk ${role}, bukan ${hasil.status}.`);
        assert.equal(hasil.body.error, NOT_ALLOWED, `${label} untuk ${role} memakai pesan yang salah.`);
        // Penolakan karena role tidak boleh dibalas 422, karena itu bukan soal data.
        assert.notEqual(hasil.status, 422, `${label} untuk ${role} dibalas 422, bukan 403.`);
      }
    }

    // Endpoint publik tetap terbuka tanpa sesi.
    assert.equal((await request(baseUrl, 'GET', '/api/health')).status, 200);
    assert.equal((await request(baseUrl, 'GET', '/api/articles')).status, 200);
    assert.equal((await request(baseUrl, 'GET', '/api/settings/public')).status, 200);
    assert.equal((await request(baseUrl, 'GET', '/api/templates/documents')).status, 200);
    assert.equal((await request(baseUrl, 'POST', '/api/faq/ask', { body: { question: 'Bagaimana cara mendaftar?' } })).status, 200);

    console.log(`access matrix tests passed (${matriks.length} endpoint x ${SEMUA_ROLE.length} role = ${jumlahPemeriksaan} pemeriksaan)`);
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
