// Unggah foto galeri dari halaman Konten Website: izin unggah, foto disajikan dari domain
// sendiri lewat /media/galeri/<id>, id karangan ditolak, dan CSP mengizinkan unggah
// langsung ke Supabase Storage bila storage-nya Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BAWAAN } = require('./site-content.js');
const { createHamasahApp } = require('./app.js');
const { createLocalStorage } = require('./storage/local.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-galeri';
// JPEG terkecil yang sah cukup untuk pemeriksaan tanda tangan byte (FF D8 FF).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

function salin(nilai) {
  return JSON.parse(JSON.stringify(nilai));
}

async function run() {
  const database = await createTestDatabase();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-galeri-'));
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
  async function masuk(email) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password: SANDI });
    assert.equal(hasil.status, 200);
    return hasil.body.accessToken;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    await api('POST', '/api/accounts', admin, { name: 'Petugas Uji', email: 'petugas@uji.test', role: 'registration-officer', password: SANDI });
    const petugas = await masuk('petugas@uji.test');

    const permintaan = { purpose: 'gallery-photo', entityId: 'galeri', fileName: 'galeri.jpg', contentType: 'image/jpeg', size: JPEG.length };
    assert.equal((await api('POST', '/api/uploads', petugas, permintaan)).status, 403, 'Hanya pemegang content.manage.');
    assert.equal((await api('POST', '/api/uploads', null, permintaan)).status, 403, 'Tanpa sesi ditolak.');
    assert.equal((await api('POST', '/api/uploads', admin, { ...permintaan, contentType: 'application/pdf' })).status, 422, 'Bukan gambar ditolak.');

    const dibuat = await api('POST', '/api/uploads', admin, permintaan);
    assert.equal(dibuat.status, 201, JSON.stringify(dibuat.body));
    const id = dibuat.body.upload.id;

    // Sebelum isinya dikirim, foto belum bisa disajikan maupun dipakai.
    assert.equal((await fetch(`${baseUrl}/media/galeri/${id}.jpg`)).status, 404);
    const galeri = [{ foto: `unggah/${id}.jpg`, lebar: 1600, tinggi: 1200, keterangan: 'Wisuda santri angkatan 2026', alt: 'Santri berfoto memakai toga di aula' }, ...salin(BAWAAN.galeri)];
    const belumSiap = await api('PUT', '/api/admin/content/galeri', admin, { nilai: galeri });
    assert.equal(belumSiap.status, 422);
    assert.ok(belumSiap.body.errors['0.foto']);

    assert.equal((await api('PUT', `/api/uploads/${id}/content`, admin, undefined, Buffer.from('bukan foto'))).status, 422, 'Isi bukan JPEG ditolak.');
    assert.equal((await api('PUT', `/api/uploads/${id}/content`, admin, undefined, JPEG)).status, 200);

    const media = await fetch(`${baseUrl}/media/galeri/${id}.jpg`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'image/jpeg');
    assert.match(media.headers.get('cache-control'), /immutable/);
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), JPEG);
    assert.equal((await fetch(`${baseUrl}/media/galeri/00000000-0000-4000-8000-000000000000.jpg`)).status, 404);

    // Disimpan ke galeri: tampil pertama di beranda.
    const simpan = await api('PUT', '/api/admin/content/galeri', admin, { nilai: galeri });
    assert.equal(simpan.status, 200, JSON.stringify(simpan.body));
    const beranda = await (await fetch(`${baseUrl}/website/index.html`)).text();
    const pertama = beranda.indexOf(`/media/galeri/${id}.jpg`);
    assert.ok(pertama > 0, 'Foto unggahan tampil di beranda.');
    assert.ok(pertama < beranda.indexOf('../assets/galeri/founder-rektor-al-azhar.jpg'), 'Urutan mengikuti isian admin.');
    assert.ok(beranda.includes('Wisuda santri angkatan 2026'));

    // Id karangan dan foto di luar daftar ditolak.
    const karangan = await api('PUT', '/api/admin/content/galeri', admin, { nilai: [{ ...galeri[0], foto: 'unggah/00000000-0000-4000-8000-000000000000.jpg' }] });
    assert.equal(karangan.status, 422);
    assert.equal((await api('PUT', '/api/admin/content/galeri', admin, { nilai: [{ ...galeri[1], foto: 'galeri/../../.env' }] })).status, 422);
    assert.equal((await api('PUT', '/api/admin/content/galeri', admin, { nilai: [] })).status, 422, 'Galeri minimal satu foto.');

    // Berkas pribadi tidak bisa dibuka lewat jalur media publik.
    const pribadi = await database.query("SELECT id FROM file_objects WHERE purpose <> 'gallery-photo' LIMIT 1");
    if (pribadi.rows.length) assert.equal((await fetch(`${baseUrl}/media/galeri/${pribadi.rows[0].id}.jpg`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
    fs.rmSync(folder, { recursive: true, force: true });
  }

  // CSP: origin Supabase masuk connect-src hanya bila storage-nya Supabase.
  const dbCsp = await createTestDatabase();
  for (const [opsi, harap] of [
    [{ storageDriver: 'supabase', supabaseUrl: 'https://contoh.supabase.co/' }, true],
    [{}, false]
  ]) {
    const appCsp = createHamasahApp({ rootDirectory: path.resolve(__dirname, '..'), database: dbCsp, rateLimiter: createRelaxedRateLimiter(), storage: createLocalStorage({ rootDirectory: os.tmpdir() }), ...opsi });
    const srv = appCsp.createServer();
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const csp = (await fetch(`http://127.0.0.1:${srv.address().port}/website/cek-status.html`)).headers.get('content-security-policy');
    assert.equal(/connect-src 'self' https:\/\/contoh\.supabase\.co(;|$)/.test(csp), harap, csp);
    await new Promise((resolve) => srv.close(resolve));
    await appCsp.close();
  }
  await dbCsp.close();

  console.log('gallery upload tests passed (izin, isi, media publik, simpan galeri, id karangan, CSP Supabase)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
