// Surat masuk/keluar dan arsip: jenis surat belum final sampai admin mengonfirmasi, alur diajukan -> diverifikasi -> disetujui,
// hak tiap peran, daftar periksa keluar, pernyataan santri keluar, arsip PDF, dan pindaian yang terkunci per santri.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-surat';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

async function run() {
  const database = await createTestDatabase();
  const app = createHamasahApp({ rootDirectory: path.resolve(__dirname, '..'), database, bootstrapKey: 'kunci-bootstrap-uji', rateLimiter: createRelaxedRateLimiter() });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, pathname, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const teks = await response.text();
    return { status: response.status, teks, body: teks && response.headers.get('content-type')?.includes('json') ? JSON.parse(teks) : null };
  }
  const masuk = async (email) => (await api('POST', '/api/auth/login', null, { email, password: SANDI })).body.accessToken;

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    async function akun(name, email, role) {
      const hasil = await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI });
      assert.equal(hasil.status, 201, hasil.teks);
      return hasil.body.account;
    }
    const A = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Kairo', gender: 'putra', capacity: 5 })).body.dormitory;
    const B = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Kairo', gender: 'putra', capacity: 5 })).body.dormitory;
    const mA = await akun('Musyrif A', 'a@uji.test', 'supervisor');
    const mB = await akun('Musyrif B', 'b@uji.test', 'supervisor');
    await akun('Petugas', 'petugas@uji.test', 'registration-officer');
    await akun('Wali', 'wali@uji.test', 'parent');
    await akun('Keuangan', 'keuangan@uji.test', 'finance');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const mk = async (nama, asrama) => (await api('POST', '/api/students', admin, { name: nama, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: asrama.id })).body.student;
    const santriA = await mk('Santri A', A);
    const santriB = await mk('Santri B', B);
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tPetugas = await masuk('petugas@uji.test');
    const tWali = await masuk('wali@uji.test');
    const tUang = await masuk('keuangan@uji.test');

    // Jenis surat: empat jenis awal belum dikonfirmasi; wali dan keuangan tidak melihat.
    const jenis = await api('GET', '/api/surat/jenis', tPetugas);
    assert.equal(jenis.status, 200, jenis.teks);
    assert.equal(jenis.body.items.length, 4);
    assert.equal(jenis.body.unconfirmed, 4, 'Daftar belum dikonfirmasi dari template asli.');
    assert.equal(jenis.body.canEdit, false);
    assert.equal((await api('GET', '/api/surat/jenis', tWali)).status, 403);
    assert.equal((await api('GET', '/api/surat', tUang)).status, 403);
    assert.equal((await api('POST', '/api/surat/jenis/konfirmasi', tPetugas)).status, 403);
    assert.equal((await api('POST', '/api/surat/jenis', tPetugas, { name: 'Surat lain', direction: 'masuk' })).status, 403);
    const keluar = jenis.body.items.find((j) => j.exitFlow);
    const tataTertib = jenis.body.items.find((j) => j.code === 'pernyataan-tata-tertib');
    assert.ok(keluar && tataTertib);
    const baru = await api('POST', '/api/surat/jenis', admin, { name: 'Surat keterangan santri', direction: 'keluar' });
    assert.equal(baru.status, 201, baru.teks);
    assert.equal((await api('POST', '/api/surat/jenis', admin, { name: 'surat KETERANGAN santri', direction: 'keluar' })).status, 409);
    assert.equal((await api('POST', '/api/surat/jenis/konfirmasi', admin)).status, 200);
    assert.equal((await api('GET', '/api/surat/jenis', tPetugas)).body.unconfirmed, 0);

    // Pindaian: hanya yang berhak, terkunci pada santri tertentu.
    async function unggah(token, studentId) {
      const minta = await api('POST', '/api/uploads', token, { purpose: 'letter-scan', entityId: studentId, fileName: 'formulir.pdf', contentType: 'application/pdf', size: PDF.length });
      if (minta.status !== 201) return { gagal: minta };
      const id = minta.body.upload.id;
      const kirim = await fetch(`${baseUrl}/api/uploads/${id}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: PDF });
      assert.equal(kirim.status < 300, true, `kirim isi: ${kirim.status}`);
      return { id };
    }
    assert.ok((await unggah(tWali, santriA.id)).gagal, 'Wali tidak boleh mengunggah pindaian.');
    assert.ok((await unggah(tB, santriA.id)).gagal, 'Musyrif asrama lain tidak boleh.');
    const berkasA = await unggah(tA, santriA.id);
    assert.ok(berkasA.id, JSON.stringify(berkasA));

    // Catat surat.
    const dasar = { typeId: tataTertib.id, studentId: santriA.id, subject: 'Pernyataan tata tertib 2026', notes: 'Ditandatangani Bapak Wali.' };
    assert.equal((await api('POST', '/api/surat', tWali, dasar)).status, 403);
    assert.equal((await api('POST', '/api/surat', tB, { ...dasar, fileId: berkasA.id })).status, 404, 'Musyrif B bukan penanggung jawab Santri A.');
    assert.equal((await api('POST', '/api/surat', tA, { ...dasar, subject: 'ab' })).status, 422);
    assert.equal((await api('POST', '/api/surat', tA, { ...dasar, fileId: '00000000-0000-4000-8000-000000000000' })).status, 422, 'Berkas harus sah.');
    const berkasB = await unggah(admin, santriB.id);
    assert.equal((await api('POST', '/api/surat', tA, { ...dasar, fileId: berkasB.id })).status, 422, 'Pindaian santri lain ditolak.');
    const surat = await api('POST', '/api/surat', tA, { ...dasar, fileId: berkasA.id });
    assert.equal(surat.status, 201, surat.teks);
    assert.match(surat.body.referenceNo, /^SM\/HI\/\d{4}\/00001$/);
    assert.equal(surat.body.status, 'diajukan');
    const kedua = await api('POST', '/api/surat', tPetugas, { ...dasar, studentId: santriB.id, subject: 'Pernyataan tata tertib B' });
    assert.match(kedua.body.referenceNo, /00002$/);

    // Cakupan daftar.
    assert.equal((await api('GET', '/api/surat', tA)).body.items.length, 1, 'Musyrif hanya melihat suratnya.');
    assert.equal((await api('GET', '/api/surat', tPetugas)).body.items.length, 2);
    assert.equal((await api('GET', `/api/surat/${surat.body.id}`, tB)).status, 404);
    assert.equal((await api('GET', '/api/surat?status=ngawur', admin)).status, 422);

    // Verifikasi dan keputusan: urutan dan hak.
    const id = surat.body.id;
    assert.equal((await api('POST', `/api/surat/${id}/putusan`, admin, { decision: 'disetujui' })).status, 409, 'Harus diverifikasi dulu.');
    assert.equal((await api('POST', `/api/surat/${id}/verifikasi`, tA, {})).status, 403, 'Musyrif tidak memverifikasi.');
    assert.equal((await api('GET', `/api/surat/${id}/arsip.pdf`, admin)).status, 409, 'Arsip belum tersedia.');
    assert.equal((await api('POST', `/api/surat/${id}/verifikasi`, tPetugas, { note: 'Tanda tangan lengkap.' })).status, 200);
    assert.equal((await api('POST', `/api/surat/${id}/verifikasi`, tPetugas, {})).status, 409);
    assert.equal((await api('POST', `/api/surat/${id}/putusan`, tPetugas, { decision: 'disetujui' })).status, 403, 'Petugas tidak memutuskan.');
    assert.equal((await api('POST', `/api/surat/${id}/putusan`, admin, { decision: 'ditolak' })).status, 422, 'Penolakan wajib beralasan.');
    assert.equal((await api('POST', `/api/surat/${id}/putusan`, admin, { decision: 'disetujui', note: 'Sesuai.' })).status, 200);
    const arsip = await fetch(`${baseUrl}/api/surat/${id}/arsip.pdf`, { headers: { Authorization: `Bearer ${tA}` } });
    assert.equal(arsip.status, 200);
    assert.equal(arsip.headers.get('content-type'), 'application/pdf');
    assert.ok(Buffer.from(await arsip.arrayBuffer()).toString('latin1').startsWith('%PDF-1.4'));
    const rincian = await api('GET', `/api/surat/${id}`, tA);
    assert.deepEqual(rincian.body.events.map((e) => e.action), ['dibuat', 'verifikasi', 'persetujuan']);
    assert.equal(rincian.body.exitChecklist, null);

    // Pindaian dapat dibuka musyrif asramanya dan petugas, bukan musyrif lain atau wali.
    const buka = (token) => fetch(`${baseUrl}/api/files/${berkasA.id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await buka(tA)).status, 200);
    assert.equal((await buka(tPetugas)).status, 200);
    assert.equal((await buka(tB)).status, 403);
    assert.equal((await buka(tWali)).status, 403);

    // Permohonan pengunduran diri: daftar periksa dan pernyataan keluar.
    const ajukan = await api('POST', '/api/surat', tPetugas, { typeId: keluar.id, studentId: santriA.id, subject: 'Permohonan mundur Santri A', notes: 'Alasan keluarga.' });
    assert.equal(ajukan.status, 201);
    const kid = ajukan.body.id;
    const sebelum = await api('GET', `/api/surat/${kid}`, tA);
    assert.equal(sebelum.body.exitChecklist.items.length, 4);
    assert.ok(sebelum.body.exitChecklist.items.every((b) => b.status === 'belum'));
    assert.equal(sebelum.body.exitChecklist.canFinalize, false);
    const ubah = (token, kind, body) => api('PATCH', `/api/surat/${kid}/daftar-keluar/${kind}`, token, body);
    assert.equal((await ubah(tWali, 'dokumen', { status: 'beres' })).status, 403);
    assert.equal((await ubah(tA, 'ngawur', { status: 'beres' })).status, 404);
    assert.equal((await ubah(tA, 'dokumen', { status: 'mungkin' })).status, 422);
    assert.equal((await ubah(tA, 'inventaris', { status: 'bermasalah' })).status, 422, 'Bermasalah wajib bercatatan.');
    // Keluar sebelum disetujui atau beres: ditolak.
    assert.equal((await api('POST', `/api/surat/${kid}/proses-keluar`, admin, {})).status, 409);
    await api('POST', `/api/surat/${kid}/verifikasi`, tPetugas, {});
    assert.equal((await api('POST', `/api/surat/${kid}/putusan`, admin, { decision: 'disetujui' })).status, 200);
    const belumBeres = await api('POST', `/api/surat/${kid}/proses-keluar`, admin, {});
    assert.equal(belumBeres.status, 409);
    assert.match(belumBeres.body.error, /belum beres/);
    assert.equal((await ubah(tA, 'dokumen', { status: 'beres', note: 'Paspor dikembalikan.' })).status, 200);
    assert.equal((await ubah(tPetugas, 'tagihan', { status: 'beres' })).status, 200);
    assert.equal((await ubah(tA, 'inventaris', { status: 'bermasalah', note: 'Kunci lemari belum kembali.' })).status, 200);
    assert.equal((await api('POST', `/api/surat/${kid}/proses-keluar`, admin, {})).status, 409, 'Butir bermasalah menahan proses keluar.');
    assert.equal((await ubah(tA, 'inventaris', { status: 'beres', note: 'Kunci sudah kembali.' })).status, 200);
    assert.equal((await ubah(tA, 'refund-ac', { status: 'tidak-berlaku' })).status, 422, 'Tidak berlaku wajib bercatatan.');
    assert.equal((await ubah(tA, 'refund-ac', { status: 'tidak-berlaku', note: 'Kamar tanpa AC.' })).status, 200);
    const siap = await api('GET', `/api/surat/${kid}`, admin);
    assert.equal(siap.body.exitChecklist.canFinalize, true);
    assert.equal((await api('POST', `/api/surat/${kid}/proses-keluar`, tPetugas, {})).status, 403, 'Hanya admin.');
    const keluarHasil = await api('POST', `/api/surat/${kid}/proses-keluar`, admin, { reason: 'Pindah ke luar negeri.' });
    assert.equal(keluarHasil.status, 200, keluarHasil.teks);
    assert.ok(keluarHasil.body.exitCompletedAt);
    const siswa = await api('GET', `/api/students/${santriA.id}/profil`, admin);
    assert.equal(siswa.body.status.value, 'withdrawn');
    assert.equal(siswa.body.status.history[0].reason, 'Pindah ke luar negeri.');
    assert.equal((await api('POST', `/api/surat/${kid}/proses-keluar`, admin, {})).status, 409);
    assert.equal((await ubah(tA, 'dokumen', { status: 'belum' })).status, 404, 'Santri sudah keluar dari asrama, musyrif tidak lagi berwenang.');
    assert.equal((await ubah(admin, 'dokumen', { status: 'belum' })).status, 409, 'Daftar periksa terkunci setelah keluar.');

    console.log('letter archive tests passed');
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
