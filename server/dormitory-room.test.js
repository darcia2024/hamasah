// Struktur kamar dan penempatan santri: kapasitas, AC, pemindahan dengan riwayat, dan batas akses
// musyrif (hanya asrama yang dipegang; antar asrama perlu memegang kedua-duanya).
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { keadaanKamar } = require('./dormitory-room-service.js');

const SANDI = 'kata-sandi-uji-kamar';

async function run() {
  assert.equal(keadaanKamar(0, 4), 'kosong');
  assert.equal(keadaanKamar(2, 4), 'sebagian');
  assert.equal(keadaanKamar(4, 4), 'penuh');
  assert.equal(keadaanKamar(5, 4), 'melebihi');

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
    const asrama = async (name, area, gender) => (await api('POST', '/api/dormitories', admin, { name, area, gender, capacity: 20 })).body.dormitory;
    const A = await asrama('Asrama A', 'Hay Asyir, Kairo', 'putra');
    const B = await asrama('Asrama B', 'Hay Sabi, Kairo', 'putra');
    const P = await asrama('Asrama Putri', 'Hay Asyir, Kairo', 'putri');
    const musyrif = await akun('Musyrif A', 'musyrif-a@uji.test', 'supervisor');
    const musyrifB = await akun('Musyrif B', 'musyrif-b@uji.test', 'supervisor');
    assert.equal((await api('POST', `/api/dormitories/${A.id}/staff/${musyrif.id}`, admin)).status, 201);
    assert.equal((await api('POST', `/api/dormitories/${B.id}/staff/${musyrifB.id}`, admin)).status, 201);
    const tMusyrif = await masuk('musyrif-a@uji.test');
    const tMusyrifB = await masuk('musyrif-b@uji.test');
    const akunWali = await akun('Wali Uji', 'wali@uji.test', 'parent');
    assert.ok(akunWali.id);
    const tWali = await masuk('wali@uji.test');

    async function santri(name, dormitoryId, gender = 'putra') {
      const dibuat = (await api('POST', '/api/students', admin, { name, program: 'Kuliah S1 Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', gender })).body.student;
      assert.equal((await api('PATCH', `/api/students/${dibuat.id}/placement`, admin, { dormitoryId, gender })).status, 200);
      return dibuat;
    }
    const ahmad = await santri('Ahmad', A.id);
    const bilal = await santri('Bilal', A.id);
    const citra = await santri('Citra', P.id, 'putri');
    const dani = await santri('Dani', B.id);

    // Kamar: dibuat musyrif asramanya, kapasitas dan AC tercatat.
    const kamar1 = await api('POST', `/api/asrama/${A.id}/kamar`, tMusyrif, { name: '101', capacity: 2, hasAc: true, supervisorId: musyrif.id });
    assert.equal(kamar1.status, 201, JSON.stringify(kamar1.body));
    const kamar2 = await api('POST', `/api/asrama/${A.id}/kamar`, tMusyrif, { name: '102', capacity: 3, hasAc: false });
    assert.equal(kamar2.status, 201);
    assert.equal((await api('POST', `/api/asrama/${A.id}/kamar`, tMusyrif, { name: '101', capacity: 2 })).status, 409, 'Nama kamar tidak kembar.');
    assert.equal((await api('POST', `/api/asrama/${A.id}/kamar`, tMusyrif, { name: '103', capacity: 0 })).status, 422);
    assert.equal((await api('POST', `/api/asrama/${A.id}/kamar`, tMusyrif, { name: '103', capacity: 2, supervisorId: musyrifB.id })).status, 422, 'Penanggung jawab harus memegang asrama ini.');
    assert.equal((await api('POST', `/api/asrama/${B.id}/kamar`, tMusyrif, { name: 'X', capacity: 2 })).status, 403, 'Musyrif tidak mengelola asrama lain.');
    assert.equal((await api('POST', `/api/asrama/${A.id}/kamar`, tWali, { name: 'X', capacity: 2 })).status, 403);

    // Penempatan: isi kamar sampai penuh, lalu tolak yang berikutnya.
    const tempatkan = (token, studentId, dormitoryId, roomId, reason = '') => api('POST', `/api/students/${studentId}/kamar`, token, { dormitoryId, roomId, reason });
    assert.equal((await tempatkan(tMusyrif, ahmad.id, A.id, kamar1.body.id)).status, 200);
    assert.equal((await tempatkan(tMusyrif, bilal.id, A.id, kamar1.body.id)).status, 200);
    const lain = await santri('Eko', A.id);
    const penuh = await tempatkan(tMusyrif, lain.id, A.id, kamar1.body.id);
    assert.equal(penuh.status, 409, 'Kamar yang penuh menolak.');
    assert.match(penuh.body.error, /penuh/);

    let gambaran = (await api('GET', `/api/asrama/${A.id}/kamar`, tMusyrif)).body;
    assert.equal(gambaran.available, true);
    const k1 = gambaran.rooms.find((k) => k.name === '101');
    assert.deepEqual([k1.occupied, k1.free, k1.state, k1.hasAc, k1.supervisorName], [2, 0, 'penuh', true, 'Musyrif A']);
    const k2 = gambaran.rooms.find((k) => k.name === '102');
    assert.deepEqual([k2.occupied, k2.free, k2.state, k2.hasAc], [0, 3, 'kosong', false]);
    assert.deepEqual(gambaran.summary, { rooms: 2, capacity: 5, occupied: 2, free: 3, empty: 1, full: 1, withAc: 1, withoutAc: 1, held: 0, unplaced: 1 });
    assert.deepEqual(gambaran.unplaced.map((s) => s.name), ['Eko']);
    assert.deepEqual(gambaran.supervisors.map((s) => s.name), ['Musyrif A']);
    assert.equal(gambaran.location, null, 'Asrama baru belum menempel ke lokasi sampai admin mengaturnya.');

    // Pemindahan antar kamar dicatat riwayatnya.
    assert.equal((await tempatkan(tMusyrif, bilal.id, A.id, kamar2.body.id, 'Pindah ke kamar tanpa AC atas permintaan sendiri.')).status, 200);
    assert.equal((await tempatkan(tMusyrif, bilal.id, A.id, kamar2.body.id)).status, 409, 'Sudah di tempat itu.');
    gambaran = (await api('GET', `/api/asrama/${A.id}/kamar`, tMusyrif)).body;
    assert.equal(gambaran.history[0].studentName, 'Bilal');
    assert.equal(gambaran.history[0].from, 'Asrama A, kamar 101');
    assert.equal(gambaran.history[0].to, 'Asrama A, kamar 102');
    assert.equal(gambaran.history[0].movedBy, 'Musyrif A');
    assert.equal(gambaran.history[0].reason, 'Pindah ke kamar tanpa AC atas permintaan sendiri.');

    // Batas akses: antar asrama perlu memegang kedua asrama; jenis kelamin harus cocok.
    const keB = await api('POST', `/api/asrama/${B.id}/kamar`, tMusyrifB, { name: 'B1', capacity: 4 });
    assert.equal(keB.status, 201);
    assert.equal((await tempatkan(tMusyrif, ahmad.id, B.id, keB.body.id)).status, 403, 'Tujuan di luar asrama yang dipegang.');
    assert.equal((await tempatkan(tMusyrifB, ahmad.id, B.id, keB.body.id)).status, 403, 'Asal di luar asrama yang dipegang.');
    assert.equal((await tempatkan(tMusyrif, citra.id, A.id, kamar2.body.id)).status, 403, 'Santri asrama lain.');
    assert.equal((await tempatkan(admin, citra.id, A.id, kamar2.body.id)).status, 422, 'Santri putri tidak masuk asrama putra.');
    assert.equal((await tempatkan(tMusyrif, ahmad.id, A.id, keB.body.id)).status, 404, 'Kamar harus milik asrama tujuan.');
    // Admin memindahkan antar asrama; musyrif B kini melihat Ahmad sebagai penghuninya.
    const lintas = await tempatkan(admin, ahmad.id, B.id, keB.body.id, 'Tukar asrama.');
    assert.equal(lintas.status, 200);
    assert.equal(lintas.body.crossDormitory, true);
    assert.deepEqual((await api('GET', `/api/asrama/${B.id}/kamar`, tMusyrifB)).body.rooms.find((k) => k.name === 'B1').occupants.map((s) => s.name), ['Ahmad']);
    assert.equal((await api('GET', `/api/asrama/${A.id}/kamar`, tMusyrifB)).status, 403);
    // Izin tambahan = penugasan asrama tambahan oleh admin.
    assert.equal((await api('POST', `/api/dormitories/${B.id}/staff/${musyrif.id}`, admin)).status, 201);
    assert.equal((await tempatkan(tMusyrif, ahmad.id, A.id, kamar2.body.id, 'Kembali.')).status, 200, 'Memegang kedua asrama: boleh.');

    // Kamar: kapasitas tidak bisa di bawah penghuni, dan kamar berpenghuni tidak bisa dihapus.
    assert.equal((await api('PATCH', `/api/asrama/${A.id}/kamar/${kamar2.body.id}`, tMusyrif, { capacity: 1 })).status, 409);
    assert.equal((await api('PATCH', `/api/asrama/${A.id}/kamar/${kamar2.body.id}`, tMusyrif, { capacity: 4, hasAc: true })).status, 200);
    assert.equal((await api('DELETE', `/api/asrama/${A.id}/kamar/${kamar2.body.id}`, tMusyrif)).status, 409);
    assert.equal((await api('DELETE', `/api/asrama/${A.id}/kamar/${kamar1.body.id}`, tMusyrif)).status, 200);

    // Cuti menahan kamar: tetap terhitung dalam kapasitas dan tampil sebagai penghuni yang cuti.
    assert.equal((await api('PATCH', `/api/students/${bilal.id}`, admin, { status: 'leave' })).status, 200);
    const saatCuti = (await api('GET', `/api/asrama/${A.id}/kamar`, tMusyrif)).body;
    const kamarCuti = saatCuti.rooms.find((k) => k.id === kamar2.body.id);
    assert.ok(kamarCuti.occupants.some((s) => s.name === 'Bilal' && s.onLeave === true));
    assert.equal(saatCuti.summary.held, 1);
    assert.equal((await api('PATCH', `/api/students/${bilal.id}`, admin, { status: 'active' })).status, 200);
    assert.ok((await api('GET', `/api/asrama/${A.id}/kamar`, tMusyrif)).body.rooms.find((k) => k.id === kamar2.body.id).occupants.some((s) => s.name === 'Bilal' && !s.onLeave), 'Setelah aktif kembali, kamar yang sama tetap miliknya.');
    // Mengundurkan diri melepas kamarnya, dan kamar lama tidak hidup lagi bila ditempatkan kembali di asrama yang sama.
    assert.equal((await api('PATCH', `/api/students/${bilal.id}`, admin, { status: 'withdrawn' })).status, 200);
    assert.equal((await api('PATCH', `/api/students/${bilal.id}`, admin, { status: 'active' })).status, 200);
    assert.equal((await api('PATCH', `/api/students/${bilal.id}/placement`, admin, { dormitoryId: A.id, gender: 'putra' })).status, 200);
    assert.ok(!(await api('GET', `/api/asrama/${A.id}/kamar`, tMusyrif)).body.rooms.some((k) => k.occupants.some((s) => s.name === 'Bilal')), 'Kamar lama tidak kembali sendiri.');
    assert.equal((await tempatkan(tMusyrif, bilal.id, A.id, kamar2.body.id)).status, 200);
    // Pemindahan lewat jalur lama (ganti asrama) tidak meninggalkan kamar yang salah.
    assert.equal((await api('PATCH', `/api/students/${bilal.id}/placement`, admin, { dormitoryId: B.id, gender: 'putra' })).status, 200);
    const setelahJalurLama = (await api('GET', `/api/asrama/${A.id}/kamar`, tMusyrif)).body;
    assert.ok(!setelahJalurLama.rooms.some((k) => k.occupants.some((s) => s.name === 'Bilal')), 'Bilal tidak lagi tampil di kamar asrama lama.');
    const bBilal = (await api('GET', `/api/asrama/${B.id}/kamar`, tMusyrifB)).body;
    assert.ok(bBilal.unplaced.some((s) => s.name === 'Bilal'), 'Di asrama baru ia belum berkamar.');

    // Masalah administrasi hanya penghuni asrama itu.
    const masalah = await api('GET', `/api/asrama/${A.id}/masalah`, tMusyrif);
    assert.equal(masalah.status, 200);
    assert.ok(masalah.body.items.every((item) => item.dormitory === 'Asrama A'));
    assert.equal(masalah.body.canChangeStatus, false);
    assert.equal((await api('GET', `/api/asrama/${P.id}/masalah`, tMusyrif)).status, 403);
    assert.equal((await api('GET', `/api/asrama/${P.id}/masalah`, admin)).body.canChangeStatus, true);

    // Lokasi: admin saja; menempel ke asrama mengikuti negaranya.
    assert.equal((await api('POST', '/api/lokasi', tMusyrif, { name: 'Bogor', country: 'Indonesia' })).status, 403);
    const bogor = await api('POST', '/api/lokasi', admin, { name: 'Bogor', country: 'Indonesia' });
    assert.equal(bogor.status, 201);
    assert.equal((await api('POST', '/api/lokasi', admin, { name: 'Bogor', country: 'Indonesia' })).status, 409);
    assert.equal((await api('POST', '/api/lokasi', admin, { name: 'Bogor', country: 'Narnia' })).status, 422);
    assert.equal((await api('PUT', `/api/asrama/${P.id}/lokasi`, tMusyrif, { locationId: bogor.body.id })).status, 403);
    assert.equal((await api('PUT', `/api/asrama/${P.id}/lokasi`, admin, { locationId: bogor.body.id })).status, 200);
    const negara = (await database.query('SELECT country FROM dormitories WHERE id = $1', [P.id])).rows[0].country;
    assert.equal(negara, 'Indonesia');
    assert.equal((await api('GET', `/api/asrama/${P.id}/kamar`, admin)).body.location.name, 'Bogor');
    const daftarLokasi = (await api('GET', '/api/lokasi', admin)).body.locations;
    assert.ok(daftarLokasi.some((l) => l.name === 'Bogor' && l.dormitories === 1));

    // Sebelum migrasi: pembacaan tidak jatuh, penyimpanan ditolak dengan arahan.
    await database.query('DROP TABLE placement_history');
    await database.query('DROP TABLE dormitory_rooms CASCADE');
    const belum = await api('GET', `/api/asrama/${B.id}/kamar`, tMusyrifB);
    assert.equal(belum.status, 200);
    assert.equal(belum.body.available, false);
    assert.equal((await api('POST', `/api/asrama/${B.id}/kamar`, tMusyrifB, { name: 'Z', capacity: 2 })).status, 409);

    console.log('dormitory room tests passed');
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
