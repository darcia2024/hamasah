// Masukan wali: wali menulis dan hanya melihat miliknya; keluhan privat hanya sampai ke admin;
// musyrif hanya melihat masukan tentang santri di asramanya; wali tidak bisa menyebut anak orang lain.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-masukan';

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
    const wali = await akun('Wali Satu', 'wali1@uji.test', 'parent');
    const wali2 = await akun('Wali Dua', 'wali2@uji.test', 'parent');
    const musyrifA = await akun('Musyrif A', 'musyrif-a@uji.test', 'supervisor');
    const musyrifB = await akun('Musyrif B', 'musyrif-b@uji.test', 'supervisor');
    assert.equal((await api('POST', `/api/dormitories/${A.id}/staff/${musyrifA.id}`, admin)).status < 300, true);
    assert.equal((await api('POST', `/api/dormitories/${B.id}/staff/${musyrifB.id}`, admin)).status < 300, true);
    const anak = (await api('POST', '/api/students', admin, { name: 'Anak Satu', program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: A.id })).body.student;
    const anakLain = (await api('POST', '/api/students', admin, { name: 'Anak Lain', program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: A.id })).body.student;
    await api('PATCH', `/api/students/${anak.id}/accounts`, admin, { parentAccountIds: [wali.id] });
    await api('PATCH', `/api/students/${anakLain.id}/accounts`, admin, { parentAccountIds: [wali2.id] });
    const tWali = await masuk('wali1@uji.test');
    const tWali2 = await masuk('wali2@uji.test');
    const tA = await masuk('musyrif-a@uji.test');
    const tB = await masuk('musyrif-b@uji.test');

    // Validasi.
    assert.equal((await api('POST', '/api/masukan', tWali, { kind: 'lain', subject: 'Judul', body: 'Isi yang cukup panjang.' })).status, 422);
    assert.equal((await api('POST', '/api/masukan', tWali, { kind: 'saran', subject: 'ab', body: 'Isi yang cukup panjang.' })).status, 422);
    assert.equal((await api('POST', '/api/masukan', tWali, { kind: 'saran', subject: 'Judul', body: 'pendek' })).status, 422);
    // Tidak boleh menyebut anak orang lain.
    assert.equal((await api('POST', '/api/masukan', tWali, { kind: 'saran', subject: 'Judul', body: 'Isi yang cukup panjang.', studentId: anakLain.id })).status, 403);

    const saran = await api('POST', '/api/masukan', tWali, { kind: 'saran', subject: 'Jadwal laporan', body: 'Mohon laporan bulanan dikirim lebih awal.', studentId: anak.id });
    assert.equal(saran.status, 201, saran.teks);
    const keluhan = await api('POST', '/api/masukan', tWali, { kind: 'keluhan', subject: 'Masalah pribadi', body: 'Ini keluhan yang bersifat sangat privat.', studentId: anak.id });
    assert.equal(keluhan.status, 201, keluhan.teks);
    assert.equal(keluhan.body.private, true);
    const umum = await api('POST', '/api/masukan', tWali2, { kind: 'apresiasi', subject: 'Terima kasih', body: 'Terima kasih atas bimbingan musyrif.' });
    assert.equal(umum.status, 201);

    // Wali hanya melihat miliknya.
    const milik = await api('GET', '/api/masukan/saya', tWali);
    assert.equal(milik.status, 200);
    assert.equal(milik.body.items.length, 2);
    assert.ok(milik.body.items.every((item) => item.status === 'baru'));
    assert.equal((await api('GET', '/api/masukan/saya', tWali2)).body.items.length, 1);

    // Musyrif A melihat saran tentang santrinya, bukan keluhan, bukan yang tanpa santri.
    const kotakA = await api('GET', '/api/masukan', tA);
    assert.equal(kotakA.status, 200);
    assert.deepEqual(kotakA.body.items.map((item) => item.id), [saran.body.id]);
    assert.equal(kotakA.body.items[0].parentName, 'Wali Satu');
    assert.equal((await api('GET', '/api/masukan', tB)).body.items.length, 0, 'Musyrif asrama lain tidak melihat.');
    assert.equal((await api('GET', '/api/masukan', admin)).body.items.length, 3);

    // Musyrif tidak bisa menangani keluhan atau masukan asrama lain; admin bisa.
    assert.equal((await api('PATCH', `/api/masukan/${keluhan.body.id}`, tA, { status: 'dibaca' })).status, 404);
    assert.equal((await api('PATCH', `/api/masukan/${saran.body.id}`, tB, { status: 'dibaca' })).status, 404);
    assert.equal((await api('PATCH', `/api/masukan/${saran.body.id}`, tA, { status: 'selesai' })).status, 422);
    const balas = await api('PATCH', `/api/masukan/${saran.body.id}`, tA, { status: 'ditindaklanjuti', reply: 'Terima kasih, akan kami perbaiki.' });
    assert.equal(balas.status, 200, balas.teks);
    assert.equal((await api('PATCH', `/api/masukan/${keluhan.body.id}`, admin, { status: 'dibaca', reply: 'Kami hubungi Bapak/Ibu.' })).status, 200);

    // Wali melihat status dan balasan; kotak masuk terbuka tidak lagi memuat yang selesai.
    const sesudah = (await api('GET', '/api/masukan/saya', tWali)).body.items;
    const s = sesudah.find((item) => item.id === saran.body.id);
    assert.equal(s.status, 'ditindaklanjuti');
    assert.equal(s.reply, 'Terima kasih, akan kami perbaiki.');
    assert.equal((await api('GET', '/api/masukan', tA)).body.items.length, 0);
    assert.equal((await api('GET', '/api/masukan?status=semua', tA)).body.items.length, 1);

    // Peran lain tidak bisa mengirim; wali tidak membuka kotak staf.
    assert.equal((await api('POST', '/api/masukan', tA, { kind: 'saran', subject: 'Judul', body: 'Isi yang cukup panjang.' })).status, 403);
    assert.equal((await api('GET', '/api/masukan', tWali)).status, 403);

    // Batas harian.
    for (let i = 0; i < 2; i += 1) assert.equal((await api('POST', '/api/masukan', tWali, { kind: 'saran', subject: `Saran ${i}`, body: 'Isi yang cukup panjang untuk uji.' })).status, 201);
    assert.equal((await api('POST', '/api/masukan', tWali, { kind: 'saran', subject: 'Terlalu banyak', body: 'Isi yang cukup panjang untuk uji.' })).status, 201);
    assert.equal((await api('POST', '/api/masukan', tWali, { kind: 'saran', subject: 'Kelebihan', body: 'Isi yang cukup panjang untuk uji.' })).status, 429);

    // Wali melihat urusan administrasi anaknya tanpa catatan internal.
    const profil = await api('GET', `/api/students/${anak.id}/profil`, tWali);
    assert.equal(profil.status, 200);
    assert.ok(Array.isArray(profil.body.administrativeCases));
    assert.deepEqual(profil.body.status.history, []);

    console.log('parent feedback tests passed');
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
