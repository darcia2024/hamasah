// Profil santri terintegrasi: kontak, pendidikan, status paspor, riwayat status, dan dokumen pribadi
// beserta hak akses per peran (admin, musyrif asrama itu, santri, wali, dan pihak luar).
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { samarkan, keadaanDokumen } = require('./student-profile-service.js');

const SANDI = 'kata-sandi-uji-profil';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function run() {
  assert.equal(samarkan('A1234567'), '••••567');
  assert.equal(samarkan(''), '');
  assert.equal(keadaanDokumen('2026-12-01', '2026-10-28', 180, '').state, 'hampir-kedaluwarsa');
  assert.equal(keadaanDokumen('2026-10-01', '2026-10-28', 180, '').state, 'kedaluwarsa');
  assert.equal(keadaanDokumen('2030-01-01', '2026-10-28', 180, '').state, 'aktif');
  assert.equal(keadaanDokumen('2030-01-01', '2026-10-28', 180, 'hilang').label, 'Hilang', 'Status manual menang atas tanggal.');
  assert.equal(keadaanDokumen(null, '2026-10-28', 180, '').state, 'belum-dicatat');

  const database = await createTestDatabase();
  const app = createHamasahApp({ rootDirectory: path.resolve(__dirname, '..'), database, bootstrapKey: 'kunci-bootstrap-uji', rateLimiter: createRelaxedRateLimiter() });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, pathname, token, body, raw) {
    const headers = {};
    if (!raw) headers['Content-Type'] = 'application/json';
    else headers['Content-Type'] = raw.contentType;
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: raw ? raw.buffer : (body === undefined ? undefined : JSON.stringify(body)) });
    const teks = await response.text();
    return { status: response.status, body: teks && response.headers.get('content-type')?.includes('json') ? JSON.parse(teks) : null };
  }
  async function masuk(email) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password: SANDI });
    assert.equal(hasil.status, 200, JSON.stringify(hasil.body));
    return hasil.body.accessToken;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    async function akun(name, email, role) {
      const hasil = await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI });
      assert.equal(hasil.status, 201, JSON.stringify(hasil.body));
      return hasil.body.account;
    }
    const A = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Kairo', gender: 'putra', capacity: 10 })).body.dormitory;
    const B = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Kairo', gender: 'putra', capacity: 10 })).body.dormitory;
    const musyrifA = await akun('Musyrif A', 'musyrif-a@uji.test', 'supervisor');
    const musyrifB = await akun('Musyrif B', 'musyrif-b@uji.test', 'supervisor');
    assert.equal((await api('POST', `/api/dormitories/${A.id}/staff/${musyrifA.id}`, admin)).status, 201);
    assert.equal((await api('POST', `/api/dormitories/${B.id}/staff/${musyrifB.id}`, admin)).status, 201);
    const akunSantri = await akun('Ahmad Akun', 'ahmad@uji.test', 'student');
    const akunWali = await akun('Wali Ahmad', 'wali@uji.test', 'parent');
    await akun('Wali Lain', 'wali-lain@uji.test', 'parent');
    const tA = await masuk('musyrif-a@uji.test');
    const tB = await masuk('musyrif-b@uji.test');
    const tSantri = await masuk('ahmad@uji.test');
    const tWali = await masuk('wali@uji.test');
    const tWaliLain = await masuk('wali-lain@uji.test');
    const ahmad = (await api('POST', '/api/students', admin, { name: 'Ahmad', program: 'Kuliah S1 Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', gender: 'putra' })).body.student;
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/placement`, admin, { dormitoryId: A.id, gender: 'putra' })).status, 200);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/accounts`, admin, { studentAccountId: akunSantri.id, parentAccountIds: [akunWali.id] })).status, 200);

    // Profil kosong tetap utuh, dengan hak edit sesuai peran.
    let profil = (await api('GET', `/api/students/${ahmad.id}/profil`, admin)).body;
    assert.equal(profil.available, true);
    assert.deepEqual([profil.status.value, profil.status.label], ['active', 'Aktif']);
    assert.deepEqual(profil.placement.dormitory.name, 'Asrama A');
    assert.deepEqual(profil.placement.supervisors, ['Musyrif A']);
    assert.equal(profil.passport.state, 'belum-dicatat');
    assert.equal(profil.can.editIdentity, true);
    assert.equal(profil.can.changeStatus, true);
    const profilA = (await api('GET', `/api/students/${ahmad.id}/profil`, tA)).body;
    assert.deepEqual([profilA.can.editContact, profilA.can.editIdentity, profilA.can.changeStatus], [true, false, false]);
    const profilSantri = (await api('GET', `/api/students/${ahmad.id}/profil`, tSantri)).body;
    assert.deepEqual([profilSantri.can.editContact, profilSantri.can.editEducation, profilSantri.can.uploadDocuments], [false, false, false]);

    // Akses melihat: santri lain dan wali lain ditolak.
    assert.equal((await api('GET', `/api/students/${ahmad.id}/profil`, tB)).status, 403, 'Musyrif asrama lain.');
    assert.equal((await api('GET', `/api/students/${ahmad.id}/profil`, tWaliLain)).status, 403);
    assert.equal((await api('GET', `/api/students/${ahmad.id}/profil`, tWali)).status, 200);

    // Ubah profil: admin semua; musyrif hanya kontak, pendidikan, dan status paspor manual.
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, admin, { birthPlace: 'Bogor', nationality: 'Indonesia', passportNumber: 'A1234567', iqamahNumber: 'IQ9988776', phone: '+20 100 000 0000' })).status, 200);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tA, { passportNumber: 'X0000000' })).status, 403, 'Nomor paspor hanya admin.');
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tB, { phone: '1' })).status, 403, 'Musyrif asrama lain.');
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tSantri, { phone: '1' })).status, 403);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tA, { email: 'bukan-email' })).status, 422);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tA, { educationStatus: 'ngawur' })).status, 422);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tA, { studyYear: 99 })).status, 422);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tA, {})).status, 422);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tA, {
      email: 'ahmad@contoh.id', emergencyName: 'Bapak Ahmad', emergencyPhone: '+62 811 000 000', educationLevel: 'S1', institution: 'Universitas Al-Azhar', major: 'Syariah Islamiyah',
      studyYear: 1, educationStatus: 'aktif', educationNote: 'Semester ganjil berjalan.', passportState: 'diurus'
    })).status, 200);
    profil = (await api('GET', `/api/students/${ahmad.id}/profil`, admin)).body;
    assert.deepEqual([profil.personal.birthPlace, profil.personal.phone, profil.personal.email], ['Bogor', '+20 100 000 0000', 'ahmad@contoh.id']);
    assert.deepEqual([profil.education.level, profil.education.institution, profil.education.studyYear, profil.education.statusLabel], ['S1', 'Universitas Al-Azhar', 1, 'Aktif']);
    assert.deepEqual([profil.passport.state, profil.passport.label], ['diurus', 'Sedang diurus']);
    assert.deepEqual([profil.identifiers.passportNumber, profil.identifiers.masked], ['A1234567', false]);

    // Nomor identitas tersamar untuk selain admin; kontak tetap terlihat musyrif, santri, dan wali.
    for (const token of [tA, tSantri, tWali]) {
      const lihat = (await api('GET', `/api/students/${ahmad.id}/profil`, token)).body;
      assert.deepEqual([lihat.identifiers.passportNumber, lihat.identifiers.iqamahNumber, lihat.identifiers.masked], ['••••567', '••••776', true]);
      assert.equal(lihat.personal.email, 'ahmad@contoh.id');
      assert.deepEqual(lihat.status.history, [], 'Riwayat status hanya untuk staf.');
    }

    // Nomor identitas tersimpan terenkripsi di database, bukan teks biasa.
    const mentah = (await database.query('SELECT passport_number, iqamah_number FROM student_profiles WHERE student_id = $1', [ahmad.id])).rows[0];
    assert.match(mentah.passport_number, /^enc1\./);
    assert.match(mentah.iqamah_number, /^enc1\./);
    assert.ok(!mentah.passport_number.includes('A1234567') && !mentah.iqamah_number.includes('IQ9988776'));

    // Wali terhubung tampil; email wali hanya untuk staf.
    assert.deepEqual((await api('GET', `/api/students/${ahmad.id}/profil`, admin)).body.guardians.map((w) => [w.name, w.email]), [['Wali Ahmad', 'wali@uji.test']]);
    assert.deepEqual((await api('GET', `/api/students/${ahmad.id}/profil`, tWali)).body.guardians.map((w) => [w.name, w.email]), [['Wali Ahmad', null]]);

    // Tanggal paspor dari data visa dihitung otomatis; status manual menang.
    await database.query(`INSERT INTO visa_tracking (student_id, status, passport_expires_at, visa_expires_at) VALUES ($1, 'collecting-documents', '2026-12-01', '2026-10-01')`, [ahmad.id]);
    profil = (await api('GET', `/api/students/${ahmad.id}/profil`, admin)).body;
    assert.equal(profil.passport.state, 'diurus');
    assert.equal(profil.iqamah.state, 'kedaluwarsa');
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, tA, { passportState: '' })).status, 200);
    profil = (await api('GET', `/api/students/${ahmad.id}/profil`, admin)).body;
    assert.equal(profil.passport.state, 'hampir-kedaluwarsa');

    // Status santri: berubah lewat jalur admin, riwayat tercatat dengan alasan.
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}`, tA, { status: 'leave' })).status, 403);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}`, admin, { status: 'ngawur' })).status, 422);
    const cuti = await api('PATCH', `/api/students/${ahmad.id}`, admin, { status: 'leave', statusReason: 'Cuti satu semester karena sakit.' });
    assert.equal(cuti.status, 200, JSON.stringify(cuti.body));
    assert.equal(cuti.body.releasedFromDormitory, false, 'Cuti menahan tempat di asrama.');
    profil = (await api('GET', `/api/students/${ahmad.id}/profil`, admin)).body;
    assert.deepEqual([profil.status.value, profil.status.label], ['leave', 'Cuti atau izin panjang']);
    assert.equal(profil.placement.dormitory.name, 'Asrama A', 'Tempat tetap ditahan selama cuti.');
    assert.deepEqual([profil.status.history[0].from, profil.status.history[0].to, profil.status.history[0].reason, profil.status.history[0].changedBy], ['Aktif', 'Cuti atau izin panjang', 'Cuti satu semester karena sakit.', 'Admin Uji']);
    // Mengundurkan diri melepas dari asrama; kembali aktif perlu ditempatkan ulang.
    const mundur = await api('PATCH', `/api/students/${ahmad.id}`, admin, { status: 'withdrawn', statusReason: 'Pindah ke Indonesia.' });
    assert.equal(mundur.body.releasedFromDormitory, true);
    assert.equal((await api('GET', `/api/students/${ahmad.id}/profil`, admin)).body.placement.dormitory, null);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}`, admin, { status: 'active' })).status, 200);
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/placement`, admin, { dormitoryId: A.id, gender: 'putra' })).status, 200);
    assert.equal((await database.query(`SELECT count(*)::int AS n FROM audit_events WHERE action = 'student.status-changed'`)).rows[0].n, 3);

    // Dokumen pribadi: unggah lewat jalur berkas privat, daftarkan dengan visibilitas.
    async function unggah(token, entityId) {
      const minta = await api('POST', '/api/uploads', token, { purpose: 'student-document', entityId, fileName: 'Paspor Ahmad.pdf', contentType: 'application/pdf', size: PDF.length });
      if (minta.status !== 201) return { status: minta.status };
      const kirim = await api('PUT', `/api/uploads/${minta.body.upload.id}/content`, token, undefined, { contentType: 'application/pdf', buffer: PDF });
      assert.equal(kirim.status, 200, JSON.stringify(kirim.body));
      return { status: 201, id: minta.body.upload.id };
    }
    assert.equal((await unggah(tSantri, ahmad.id)).status, 403, 'Santri tidak mengunggah dokumen pribadinya.');
    assert.equal((await unggah(tB, ahmad.id)).status, 403, 'Musyrif asrama lain.');
    const berkasAdmin = await unggah(admin, ahmad.id);
    const berkasStaf = await unggah(tA, ahmad.id);
    const berkasKeluarga = await unggah(tA, ahmad.id);
    assert.deepEqual([berkasAdmin.status, berkasStaf.status, berkasKeluarga.status], [201, 201, 201]);
    // Berkas belum didaftarkan: hanya admin yang bisa membuka.
    assert.equal((await api('GET', `/api/files/${berkasStaf.id}`, admin)).status, 200);
    assert.equal((await api('GET', `/api/files/${berkasStaf.id}`, tA)).status, 403);

    const daftar = (jenis, berkas, judul, visibility) => api('POST', `/api/students/${ahmad.id}/dokumen`, jenis, { fileId: berkas, kind: 'paspor', title: judul, visibility });
    assert.equal((await daftar(tA, berkasAdmin.id, 'Paspor asli', 'admin')).status, 403, 'Musyrif tidak membatasi untuk admin saja.');
    assert.equal((await daftar(admin, berkasAdmin.id, 'Paspor asli', 'admin')).status, 201);
    assert.equal((await daftar(tA, berkasStaf.id, 'Salinan paspor', 'staf')).status, 201);
    assert.equal((await daftar(tA, berkasStaf.id, 'Salinan paspor', 'staf')).status, 409, 'Berkas tidak didaftarkan dua kali.');
    assert.equal((await daftar(tA, berkasKeluarga.id, 'Surat keterangan', 'keluarga')).status, 201);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/dokumen`, tA, { fileId: berkasKeluarga.id, kind: 'rahasia', title: 'X', visibility: 'staf' })).status, 422);
    assert.equal((await api('POST', `/api/students/${ahmad.id}/dokumen`, tSantri, { fileId: berkasKeluarga.id, kind: 'paspor', title: 'Santri', visibility: 'staf' })).status, 403);

    const judulUntuk = async (token) => (await api('GET', `/api/students/${ahmad.id}/profil`, token)).body.documents.map((d) => d.title).sort();
    assert.deepEqual(await judulUntuk(admin), ['Paspor asli', 'Salinan paspor', 'Surat keterangan']);
    assert.deepEqual(await judulUntuk(tA), ['Salinan paspor', 'Surat keterangan']);
    assert.deepEqual(await judulUntuk(tSantri), ['Surat keterangan']);
    assert.deepEqual(await judulUntuk(tWali), ['Surat keterangan']);
    // Unduhan mengikuti visibilitas yang sama.
    assert.equal((await api('GET', `/api/files/${berkasAdmin.id}`, tA)).status, 403);
    assert.equal((await api('GET', `/api/files/${berkasAdmin.id}`, admin)).status, 200);
    assert.equal((await api('GET', `/api/files/${berkasStaf.id}`, tA)).status, 200);
    assert.equal((await api('GET', `/api/files/${berkasStaf.id}`, tWali)).status, 403);
    assert.equal((await api('GET', `/api/files/${berkasKeluarga.id}`, tWali)).status, 200);
    assert.equal((await api('GET', `/api/files/${berkasKeluarga.id}`, tSantri)).status, 200);
    assert.equal((await api('GET', `/api/files/${berkasKeluarga.id}`, tWaliLain)).status, 403);
    assert.equal((await api('GET', `/api/files/${berkasKeluarga.id}`, tB)).status, 403);
    assert.equal((await api('GET', `/api/files/${berkasKeluarga.id}`)).status, 403);

    // Arsip: dokumen hilang dari daftar dan tidak bisa diunduh selain admin.
    const dokumenKeluarga = (await api('GET', `/api/students/${ahmad.id}/profil`, tA)).body.documents.find((d) => d.title === 'Surat keterangan');
    assert.equal((await api('DELETE', `/api/students/${ahmad.id}/dokumen/${dokumenKeluarga.id}`, tSantri)).status, 403);
    assert.equal((await api('DELETE', `/api/students/${ahmad.id}/dokumen/${dokumenKeluarga.id}`, tA)).status, 200);
    assert.deepEqual(await judulUntuk(tWali), []);
    assert.equal((await api('GET', `/api/files/${berkasKeluarga.id}`, tWali)).status, 403);
    const adminDokumen = (await api('GET', `/api/students/${ahmad.id}/profil`, admin)).body.documents.find((d) => d.title === 'Paspor asli');
    assert.equal((await api('DELETE', `/api/students/${ahmad.id}/dokumen/${adminDokumen.id}`, tA)).status, 403, 'Dokumen khusus admin tidak diarsipkan musyrif.');

    // Sebelum migrasi: profil tetap tampil dengan data dasar, penyimpanan ditolak dengan arahan.
    await database.query('DROP TABLE student_documents');
    await database.query('DROP TABLE student_profiles CASCADE');
    const belum = await api('GET', `/api/students/${ahmad.id}/profil`, admin);
    assert.equal(belum.status, 200);
    assert.equal(belum.body.available, false);
    assert.equal(belum.body.name, 'Ahmad');
    assert.equal((await api('PATCH', `/api/students/${ahmad.id}/profil`, admin, { phone: '1' })).status, 409);

    console.log('student profile tests passed');
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
