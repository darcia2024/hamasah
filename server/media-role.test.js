// Peran Tim Media: mengelola Galeri beranda, dan tidak bisa membuka apa pun selain itu.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BAWAAN } = require('./site-content.js');
const { createHamasahApp } = require('./app.js');
const { createLocalStorage } = require('./storage/local.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-tim-media';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

async function run() {
  const database = await createTestDatabase();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-media-'));
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'kunci-bootstrap-uji',
    rateLimiter: createRelaxedRateLimiter(),
    storage: createLocalStorage({ rootDirectory: folder })
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, pathname, token, body, raw) {
    const headers = raw ? { 'Content-Type': 'image/jpeg' } : { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: raw || (body === undefined ? undefined : JSON.stringify(body)) });
    const teks = await response.text();
    return { status: response.status, body: teks.startsWith('{') ? JSON.parse(teks) : teks };
  }
  const masuk = async (email) => (await api('POST', '/api/auth/login', null, { email, password: SANDI })).body.accessToken;

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    const dibuat = await api('POST', '/api/accounts', admin, { name: 'Tim Media Uji', email: 'media@uji.test', role: 'media', password: SANDI });
    assert.equal(dibuat.status, 201, JSON.stringify(dibuat.body));
    const media = await masuk('media@uji.test');

    const saya = await api('GET', '/api/me', media);
    assert.deepEqual(saya.body.permissions, ['gallery.manage'], 'Tim Media hanya memegang satu izin.');

    // Hanya bagian galeri yang dikirim, bukan isian website lain.
    const konten = await api('GET', '/api/media/konten', media);
    assert.equal(konten.status, 200);
    assert.deepEqual(Object.keys(konten.body.nilai), ['galeri']);
    assert.deepEqual(konten.body.blok.map((b) => b.kunci), ['galeri']);

    // Unggah foto, simpan ke galeri, lalu tampil dari domain sendiri.
    const minta = await api('POST', '/api/uploads', media, { purpose: 'gallery-photo', entityId: 'galeri', fileName: 'galeri.jpg', contentType: 'image/jpeg', size: JPEG.length });
    assert.equal(minta.status, 201, JSON.stringify(minta.body));
    const id = minta.body.upload.id;
    assert.equal((await api('PUT', `/api/uploads/${id}/content`, media, undefined, JPEG)).status, 200);
    const baru = { foto: `unggah/${id}.jpg`, lebar: 1600, tinggi: 1200, keterangan: 'Kegiatan bersama santri di Kairo', alt: 'Santri berkumpul di halaman' };
    const simpan = await api('PUT', '/api/media/konten/galeri', media, { nilai: [baru, ...JSON.parse(JSON.stringify(BAWAAN.galeri))] });
    assert.equal(simpan.status, 200, JSON.stringify(simpan.body));
    assert.deepEqual(Object.keys(simpan.body.isi.nilai), ['galeri'], 'Balasan simpan juga hanya memuat galeri.');
    assert.equal(simpan.body.isi.nilai.galeri[0].foto, baru.foto);
    assert.equal((await fetch(`${baseUrl}/media/galeri/${id}.jpg`)).status, 200);
    assert.equal((await api('GET', '/api/admin/content', admin)).body.nilai.galeri[0].foto, baru.foto, 'Admin melihat galeri yang sama.');

    // Foto karangan ditolak, seperti di jalur admin.
    const karangan = { ...baru, foto: 'unggah/00000000-0000-4000-8000-000000000000.jpg' };
    assert.equal((await api('PUT', '/api/media/konten/galeri', media, { nilai: [karangan] })).status, 422);

    // Perubahan tercatat atas nama Tim Media.
    const jejak = await database.query(`SELECT count(*)::int AS n FROM audit_events WHERE action = 'site-content.updated' AND actor_role = 'media'`);
    assert.ok(jejak.rows[0].n >= 1, 'Perubahan galeri tercatat di jejak audit.');

    // Bisa mengembalikan galeri ke bawaan.
    const pulih = await api('DELETE', '/api/media/konten/galeri', media);
    assert.equal(pulih.status, 200);
    assert.deepEqual(Object.keys(pulih.body.isi.nilai), ['galeri']);

    // Di luar galeri semuanya ditutup.
    const ditolak = [
      ['GET', '/api/admin/content'], ['PUT', '/api/admin/content/kontak'], ['DELETE', '/api/admin/content/pengumuman'], ['PUT', '/api/admin/content/galeri'],
      ['POST', '/api/students'], ['GET', '/api/accounts'], ['GET', '/api/admin/settings'], ['GET', '/api/admin/templates'], ['GET', '/api/ac/unit'], ['GET', '/api/inventaris/asrama']
    ];
    for (const [method, alamat] of ditolak) {
      const hasil = await api(method, alamat, media, method === 'GET' || method === 'DELETE' ? undefined : { nilai: {} });
      assert.equal(hasil.status, 403, `${method} ${alamat}`);
    }

    // Peran lain tidak bisa memakai jalur Tim Media.
    await api('POST', '/api/accounts', admin, { name: 'Keuangan Uji', email: 'uang@uji.test', role: 'finance', password: SANDI });
    assert.equal((await api('GET', '/api/media/konten', await masuk('uang@uji.test'))).status, 403);
    assert.equal((await api('GET', '/api/media/konten')).status, 401);

    console.log('media role tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
