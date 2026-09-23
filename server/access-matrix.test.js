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
    assert.deepEqual(saya.body.permissions, ['finance.manage', 'operations.manage', 'operations.read']);
    assert.deepEqual(
      (await request(baseUrl, 'GET', '/api/me', { token: token[ROLES.PARENT] })).body.permissions,
      ['students.read']
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

      { permission: 'dormitories.manage', method: 'GET', path: '/api/dormitories' },
      {
        permission: 'dormitories.manage', method: 'POST', path: '/api/dormitories',
        body: () => ({ name: `Asrama ${Math.random().toString(36).slice(2, 8)}`, area: 'Hay Sabi', gender: 'putri' })
      },
      { permission: 'dormitories.manage', method: 'POST', path: () => `/api/dormitories/${dormitoryId}/staff/${akunId[R.SUPERVISOR]}` },
      { permission: 'dormitories.manage', method: 'DELETE', path: () => `/api/dormitories/${dormitoryId}/staff/${akunId[R.SUPERVISOR]}` },

      { permission: 'students.read', method: 'GET', path: '/api/my-students' },
      { permission: 'students.read', method: 'GET', path: () => `/api/students/${studentId}/dashboard` },
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
        permission: 'students.manage', method: 'POST', path: '/api/students',
        body: () => ({ name: 'Santri Tambahan', program: 'Mahad Al-Azhar', city: 'Kairo', joinDate: '2026-08-22' })
      },
      {
        permission: 'students.manage', method: 'PATCH', path: () => `/api/students/${studentId}/accounts`,
        body: () => ({ parentAccountIds: [akunId[R.PARENT]] })
      },
      {
        permission: 'students.manage', method: 'PATCH', path: () => `/api/students/${studentId}/placement`,
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
      {
        permission: 'operations.manage', method: 'POST', path: '/api/operations/visas',
        body: () => ({ studentId, status: 'collecting-documents', note: 'Berkas diperiksa.' })
      },
      {
        permission: 'operations.manage', method: 'POST', path: '/api/operations/inventory',
        body: () => ({ name: 'Lemari asrama', location: 'Hay Asyir', quantity: 3 })
      },

      { permission: 'registrations.read', method: 'GET', path: '/api/registrations' },
      {
        permission: 'registrations.update-status', method: 'PATCH', path: () => `/api/registrations/${registrationId}/status`,
        body: () => ({ status: 'document-review', note: 'Berkas mulai diperiksa.' })
      },
      {
        permission: 'registrations.update-status', method: 'POST', path: () => `/api/registrations/${registrationId}/notes`,
        body: () => ({ visibility: 'internal', body: 'Catatan matriks.' })
      },
      {
        permission: 'registrations.convert', method: 'POST', path: () => `/api/registrations/${registrationId}/convert`
      },
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
      {
        permission: 'inquiries.manage', method: 'PATCH',
        path: '/api/inquiries/00000000-0000-4000-8000-000000000000/status',
        body: () => ({ status: 'contacted' })
      },
      { permission: 'finance.manage', method: 'GET', path: '/api/operations/invoices/00000000-0000-0000-0000-000000000001/receipt.pdf' },
      { permission: 'operations.read', method: 'GET', path: '/api/operations/report.csv' },
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
