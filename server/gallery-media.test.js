// Galeri kegiatan asrama (item 18): foto dan video, kategori, thumbnail, audiens (seluruh asrama atau santri terpilih,
// ditegakkan juga saat berkas diunduh), dan publikasi ke website yang butuh catatan persetujuan serta keputusan admin.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-galeri-media';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(16)]);

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
  async function unggah(token, purpose, entityId, tipe = 'image/jpeg', isi = JPEG) {
    const minta = await api('POST', '/api/uploads', token, { purpose, entityId, fileName: tipe === 'video/mp4' ? 'v.mp4' : 'f.jpg', contentType: tipe, size: isi.length });
    if (minta.status !== 201) return { gagal: minta.status };
    const kirim = await fetch(`${baseUrl}/api/uploads/${minta.body.upload.id}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipe }, body: isi });
    assert.equal(kirim.status < 300, true, `unggah ${purpose} ${kirim.status}`);
    return { id: minta.body.upload.id };
  }
  const berkas = async (token, id) => (await fetch(`${baseUrl}/api/files/${id}`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' })).status;

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    async function akun(name, email, role) {
      const hasil = await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI });
      assert.equal(hasil.status, 201, hasil.teks);
      return hasil.body.account;
    }
    const A = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Kairo', gender: 'putra', capacity: 6 })).body.dormitory;
    const B = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Kairo', gender: 'putra', capacity: 6 })).body.dormitory;
    const mA = await akun('Musyrif A', 'a@uji.test', 'supervisor');
    const mB = await akun('Musyrif B', 'b@uji.test', 'supervisor');
    const wali1 = await akun('Wali Satu', 'wali1@uji.test', 'parent');
    const wali2 = await akun('Wali Dua', 'wali2@uji.test', 'parent');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const mk = async (nama, asrama) => (await api('POST', '/api/students', admin, { name: nama, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: asrama.id })).body.student;
    const s1 = await mk('Santri Satu', A);
    const s2 = await mk('Santri Dua', A);
    const s3 = await mk('Santri Tiga', B);
    await database.query('INSERT INTO student_parent_accounts (student_id, parent_account_id) VALUES ($1, $2), ($3, $4)', [s1.id, wali1.id, s2.id, wali2.id]);
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tW1 = await masuk('wali1@uji.test');
    const tW2 = await masuk('wali2@uji.test');
    const tambah = (token, asrama, body) => api('POST', `/api/asrama/${asrama.id}/galeri`, token, body);

    // ------------------------------------------------------------ foto, video, kategori, thumbnail
    const foto = await unggah(tA, 'dormitory-photo', A.id);
    const kecil = await unggah(tA, 'dormitory-photo', A.id);
    const video = await unggah(tA, 'dormitory-video', A.id, 'video/mp4', MP4);
    assert.ok(foto.id && kecil.id && video.id);
    assert.ok((await unggah(tB, 'dormitory-video', A.id, 'video/mp4', MP4)).gagal, 'Musyrif asrama lain tidak boleh mengunggah video.');
    assert.ok((await unggah(tW1, 'dormitory-video', A.id, 'video/mp4', MP4)).gagal, 'Wali tidak boleh mengunggah.');
    assert.ok((await unggah(tA, 'dormitory-video', A.id, 'video/quicktime', MP4)).gagal, 'Hanya mp4 dan webm.');

    assert.equal((await tambah(tA, A, { fileId: foto.id, category: 'ngawur' })).status, 422);
    assert.equal((await tambah(tA, A, { fileId: video.id, mediaType: 'foto' })).status, 422, 'Video bukan foto: jenis berkas harus cocok.');
    assert.equal((await tambah(tA, A, { fileId: foto.id, mediaType: 'video' })).status, 422, 'Foto bukan video.');
    assert.equal((await tambah(tA, A, { fileId: foto.id, thumbFileId: video.id })).status, 422, 'Thumbnail harus foto asrama ini.');
    const satu = await tambah(tA, A, { fileId: foto.id, thumbFileId: kecil.id, caption: 'Rihlah', category: 'perjalanan', takenOn: '2026-10-10' });
    assert.equal(satu.status, 201, satu.teks);
    assert.deepEqual([satu.body.mediaType, satu.body.category, satu.body.thumbFileId, satu.body.audience, satu.body.publicStatus], ['foto', 'perjalanan', kecil.id, 'asrama', 'internal']);
    const vid = await tambah(tA, A, { fileId: video.id, mediaType: 'video', caption: 'Halaqah', category: 'belajar' });
    assert.equal(vid.status, 201, vid.teks);
    assert.equal(vid.body.mediaType, 'video');

    // ------------------------------------------------------------ audiens dan akses berkas
    const eksklusif = await unggah(tA, 'dormitory-photo', A.id);
    assert.equal((await tambah(tA, A, { fileId: eksklusif.id, audience: 'terpilih' })).status, 422, 'Audiens terpilih butuh santri.');
    assert.equal((await tambah(tA, A, { fileId: eksklusif.id, audience: 'terpilih', studentIds: [s3.id] })).status, 422, 'Santri asrama lain tidak bisa ditandai.');
    assert.equal((await tambah(tA, A, { fileId: eksklusif.id, audience: 'asrama', studentIds: [s1.id] })).status, 422);
    const terpilih = await tambah(tA, A, { fileId: eksklusif.id, audience: 'terpilih', studentIds: [s1.id], caption: 'Wisuda Santri Satu' });
    assert.equal(terpilih.status, 201, terpilih.teks);

    const lihat = async (token) => ((await api('GET', '/api/asrama-saya', token)).body.dormitories[0] || { gallery: [] }).gallery.map((f) => f.caption).sort();
    assert.deepEqual(await lihat(tW1), ['Halaqah', 'Rihlah', 'Wisuda Santri Satu'], 'Wali santri yang ditandai melihat semuanya.');
    assert.deepEqual(await lihat(tW2), ['Halaqah', 'Rihlah'], 'Wali lain tidak melihat item untuk santri terpilih.');
    const itemW1 = (await api('GET', '/api/asrama-saya', tW1)).body.dormitories[0].gallery;
    assert.ok(!itemW1.some((f) => 'consentNote' in f), 'Catatan persetujuan internal tidak dikirim ke keluarga.');

    assert.equal(await berkas(tW1, eksklusif.id), 200);
    assert.equal(await berkas(tW2, eksklusif.id), 403, 'Berkas item terpilih juga terkunci di unduhan, bukan hanya disembunyikan.');
    assert.equal(await berkas(tW2, foto.id), 200);
    assert.equal(await berkas(tW2, kecil.id), 200, 'Thumbnail ikut aturan item.');
    assert.equal(await berkas(tW2, video.id), 200);
    assert.equal(await berkas(tB, foto.id), 403, 'Musyrif asrama lain.');
    assert.equal(await berkas(admin, eksklusif.id), 200);
    // Berkas yang diunggah tapi belum ditautkan ke galeri tidak terlihat keluarga.
    const yatim = await unggah(tA, 'dormitory-photo', A.id);
    assert.equal(await berkas(tW1, yatim.id), 403);

    // Ditarik dari galeri: keluarga langsung tidak bisa membuka berkasnya.
    assert.equal((await api('DELETE', `/api/asrama/${A.id}/galeri/${vid.body.id}`, tA)).status, 200);
    assert.equal(await berkas(tW1, video.id), 403);

    // ------------------------------------------------------------ publikasi publik
    assert.deepEqual((await api('GET', '/api/galeri-publik')).body.items, []);
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/publikasi`, tA, { consentNote: 'ok' })).status, 422, 'Catatan persetujuan terlalu pendek.');
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/publikasi`, tB, { consentNote: 'Wali menyetujui lewat WhatsApp 10 Oktober.' })).status, 403);
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/publikasi`, tW1, { consentNote: 'Wali menyetujui lewat WhatsApp 10 Oktober.' })).status, 403);
    const ajukan = await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/publikasi`, tA, { consentNote: 'Wali menyetujui lewat WhatsApp 10 Oktober.' });
    assert.equal(ajukan.status, 200, ajukan.teks);
    assert.equal(ajukan.body.publicStatus, 'diajukan');
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/publikasi`, tA, { consentNote: 'Wali menyetujui lewat WhatsApp 10 Oktober.' })).status, 409, 'Sudah diajukan.');
    assert.deepEqual((await api('GET', '/api/galeri-publik')).body.items, [], 'Diajukan belum tampil publik.');
    assert.equal((await fetch(`${baseUrl}/media/galeri-kegiatan/${satu.body.id}.jpg`)).status, 404, 'Belum disetujui: tidak disajikan.');

    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/keputusan`, tA, { decision: 'dipublikasi' })).status, 403, 'Musyrif tidak memutuskan publikasi.');
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/keputusan`, admin, { decision: 'ditolak' })).status, 422, 'Penolakan butuh alasan.');
    const setuju = await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/keputusan`, admin, { decision: 'dipublikasi' });
    assert.equal(setuju.status, 200, setuju.teks);
    const publik = await api('GET', '/api/galeri-publik');
    assert.equal(publik.body.items.length, 1);
    assert.deepEqual(Object.keys(publik.body.items[0]).sort(), ['caption', 'category', 'categoryLabel', 'id', 'takenOn'], 'Publik hanya tahu keterangan, kategori, dan tanggal.');
    const besar = await fetch(`${baseUrl}/media/galeri-kegiatan/${satu.body.id}.jpg`);
    assert.equal(besar.status, 200);
    assert.equal(besar.headers.get('content-type'), 'image/jpeg');
    assert.equal((await fetch(`${baseUrl}/media/galeri-kegiatan/${satu.body.id}.jpg?u=kecil`)).status, 200, 'Thumbnail disajikan.');
    assert.equal((await fetch(`${baseUrl}/media/galeri-kegiatan/${terpilih.body.id}.jpg`)).status, 404, 'Item internal tidak pernah disajikan.');

    // Pencabutan oleh pengelola asrama langsung menutupnya.
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/cabut`, tB)).status, 403);
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${satu.body.id}/cabut`, tA)).status, 200);
    assert.deepEqual((await api('GET', '/api/galeri-publik')).body.items, []);
    assert.equal((await fetch(`${baseUrl}/media/galeri-kegiatan/${satu.body.id}.jpg`)).status, 404);

    // Pengajuan baru lewat unggah: catatan persetujuan langsung dibawa; penolakan admin tercatat dan bisa diajukan ulang.
    const baru = await unggah(tA, 'dormitory-photo', A.id);
    const langsung = await tambah(tA, A, { fileId: baru.id, caption: 'Olahraga pagi', category: 'olahraga', publicConsentNote: 'Seluruh wali menyetujui di rapat 5 Oktober.' });
    assert.equal(langsung.status, 201, langsung.teks);
    assert.equal(langsung.body.publicStatus, 'diajukan');
    const tolak = await api('POST', `/api/asrama/${A.id}/galeri/${langsung.body.id}/keputusan`, admin, { decision: 'ditolak', note: 'Ada wajah yang belum disetujui.' });
    assert.equal(tolak.body.publicStatus, 'ditolak');
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${langsung.body.id}/keputusan`, admin, { decision: 'dipublikasi' })).status, 409, 'Sudah diputuskan.');
    assert.equal((await api('POST', `/api/asrama/${A.id}/galeri/${langsung.body.id}/publikasi`, tA, { consentNote: 'Wajah sudah diperbaiki dan wali setuju.' })).status, 200, 'Boleh diajukan ulang setelah ditolak.');
    assert.equal((await tambah(tA, A, { fileId: (await unggah(tA, 'dormitory-video', A.id, 'video/mp4', MP4)).id, mediaType: 'video', publicConsentNote: 'Wali menyetujui semuanya.' })).status, 422, 'Video tidak dipublikasikan.');

    // Item yang ditarik dari galeri tidak lagi tampil publik walau pernah dipublikasikan.
    await api('POST', `/api/asrama/${A.id}/galeri/${langsung.body.id}/keputusan`, admin, { decision: 'dipublikasi' });
    assert.equal((await api('GET', '/api/galeri-publik')).body.items.length, 1);
    await api('DELETE', `/api/asrama/${A.id}/galeri/${langsung.body.id}`, tA);
    assert.deepEqual((await api('GET', '/api/galeri-publik')).body.items, []);

    console.log('gallery media tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
