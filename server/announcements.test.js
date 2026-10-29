// Pengumuman dan pesan (item 19): kelompok penerima (asrama, batch, santri tertentu), notifikasi belum dibaca, daftar penerima
// beserta status baca, dan kotak pesan yang membedakan pengumuman umum, pesan pembinaan pribadi, dan masukan wali.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-pengumuman';

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
    const A = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Kairo', gender: 'putra', capacity: 6 })).body.dormitory;
    const B = (await api('POST', '/api/dormitories', admin, { name: 'Asrama B', area: 'Kairo', gender: 'putra', capacity: 6 })).body.dormitory;
    const mA = await akun('Musyrif A', 'a@uji.test', 'supervisor');
    const mB = await akun('Musyrif B', 'b@uji.test', 'supervisor');
    const wali1 = await akun('Wali Satu', 'wali1@uji.test', 'parent');
    const wali2 = await akun('Wali Dua', 'wali2@uji.test', 'parent');
    const wali3 = await akun('Wali Tiga', 'wali3@uji.test', 'parent');
    const akunS1 = await akun('Akun Santri Satu', 'santri1@uji.test', 'student');
    const akunS2 = await akun('Akun Santri Dua', 'santri2@uji.test', 'student');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const mk = async (nama, asrama) => (await api('POST', '/api/students', admin, { name: nama, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: asrama.id })).body.student;
    const s1 = await mk('Santri Satu', A);
    const s2 = await mk('Santri Dua', A);
    const s3 = await mk('Santri Tiga', B);
    await database.query('UPDATE students SET student_account_id = $1 WHERE id = $2', [akunS1.id, s1.id]);
    await database.query('UPDATE students SET student_account_id = $1 WHERE id = $2', [akunS2.id, s2.id]);
    await database.query('INSERT INTO student_parent_accounts (student_id, parent_account_id) VALUES ($1, $2), ($3, $4), ($5, $6)', [s1.id, wali1.id, s2.id, wali2.id, s3.id, wali3.id]);
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tW1 = await masuk('wali1@uji.test');
    const tW2 = await masuk('wali2@uji.test');
    const tW3 = await masuk('wali3@uji.test');
    const tS1 = await masuk('santri1@uji.test');
    const tS2 = await masuk('santri2@uji.test');

    const lokasi = (await database.query(`SELECT id FROM locations WHERE name = 'Hamasah Mesir'`)).rows[0];
    const program = crypto.randomUUID();
    const batch = crypto.randomUUID();
    await database.query(`INSERT INTO programs (id, location_id, name, kind) VALUES ($1, $2, 'Program Uji', 'pembinaan')`, [program, lokasi.id]);
    await database.query(`INSERT INTO program_batches (id, program_id, name, starts_on, status) VALUES ($1, $2, 'Batch 1', '2026-01-01', 'berjalan')`, [batch, program]);
    await database.query(`INSERT INTO batch_participants (batch_id, student_id) VALUES ($1, $2), ($1, $3)`, [batch, s2.id, s3.id]);

    const judul = async (token) => (await api('GET', '/api/announcements?limit=50', token)).body.items.map((a) => a.title).sort();
    const buat = (token, body) => api('POST', '/api/announcements', token, { audience: 'semua', body: 'Isi pengumuman yang cukup panjang untuk uji.', ...body });

    // ------------------------------------------------------------ kelompok penerima
    assert.equal((await buat(admin, { title: 'Umum semua' })).status, 201);
    assert.equal((await buat(tA, { title: 'Khusus asrama A', dormitoryId: A.id })).status, 201);
    assert.equal((await buat(admin, { title: 'Campur', dormitoryId: A.id, batchId: batch })).status, 422, 'Satu kelompok penerima saja.');
    assert.equal((await buat(admin, { title: 'Campur dua', dormitoryId: A.id, studentIds: [s1.id] })).status, 422);
    assert.equal((await buat(tA, { title: 'Batch oleh musyrif', batchId: batch })).status, 403, 'Batch hanya admin.');
    assert.equal((await buat(admin, { title: 'Batch ngawur', batchId: crypto.randomUUID() })).status, 422);
    assert.equal((await buat(tA, { title: 'Santri asrama lain', studentIds: [s3.id] })).status, 403, 'Musyrif hanya santri asramanya.');
    assert.equal((await buat(admin, { title: 'Santri ngawur', studentIds: [crypto.randomUUID()] })).status, 422);
    const untukS1 = await buat(tA, { title: 'Untuk Santri Satu saja', studentIds: [s1.id] });
    assert.equal(untukS1.status, 201, untukS1.teks);
    assert.equal(untukS1.body.announcement.studentCount, 1);
    const untukBatch = await buat(admin, { title: 'Untuk batch', batchId: batch });
    assert.equal(untukBatch.status, 201, untukBatch.teks);
    const targets = (await api('GET', '/api/announcements/asrama', admin)).body;
    assert.deepEqual(targets.batches.map((b) => b.name), ['Batch 1 · Program Uji']);
    assert.equal(targets.students.length, 3);
    assert.deepEqual((await api('GET', '/api/announcements/asrama', tA)).body.students.map((s) => s.name).sort(), ['Santri Dua', 'Santri Satu'], 'Musyrif hanya memilih santri asramanya.');

    assert.deepEqual(await judul(tS1), ['Khusus asrama A', 'Umum semua', 'Untuk Santri Satu saja'], 'Santri Satu: umum, asrama, dan yang ditujukan kepadanya.');
    assert.deepEqual(await judul(tW1), ['Khusus asrama A', 'Umum semua', 'Untuk Santri Satu saja']);
    assert.deepEqual(await judul(tS2), ['Khusus asrama A', 'Umum semua', 'Untuk batch'], 'Santri Dua ada di batch tetapi bukan sasaran pengumuman Santri Satu.');
    assert.deepEqual(await judul(tW2), ['Khusus asrama A', 'Umum semua', 'Untuk batch']);
    assert.deepEqual(await judul(tW3), ['Umum semua', 'Untuk batch'], 'Wali Santri Tiga: batch ya, asrama A dan santri lain tidak.');
    assert.deepEqual(await judul(tA), ['Khusus asrama A', 'Umum semua', 'Untuk Santri Satu saja', 'Untuk batch'], 'Musyrif A: miliknya sendiri, dan batch karena Santri Dua (asramanya) ada di dalamnya.');
    assert.deepEqual(await judul(tB), ['Umum semua', 'Untuk batch'], 'Musyrif B tidak melihat pengumuman untuk santri asrama A.');
    assert.equal((await judul(admin)).length, 4, 'Admin melihat semuanya.');
    // Batch: peserta yang keluar tidak lagi melihatnya.
    await database.query(`UPDATE batch_participants SET status = 'keluar' WHERE student_id = $1`, [s2.id]);
    assert.ok(!(await judul(tS2)).includes('Untuk batch'));
    await database.query(`UPDATE batch_participants SET status = 'aktif' WHERE student_id = $1`, [s2.id]);

    // Hapus: pemilik pengumuman santri-tertentu boleh walau tidak terikat satu asrama; musyrif lain tidak.
    assert.equal((await api('DELETE', `/api/announcements/${untukS1.body.announcement.id}`, tB)).status, 403);
    const sementara = await buat(tA, { title: 'Akan dihapus', studentIds: [s2.id] });
    assert.equal((await api('DELETE', `/api/announcements/${sementara.body.announcement.id}`, tA)).status, 204);

    // ------------------------------------------------------------ pengumuman untuk musyrif (migrasi 080)
    assert.equal((await buat(tA, { title: 'Musyrif oleh musyrif', audience: 'musyrif', dormitoryId: A.id })).status, 403, 'Hanya admin.');
    assert.equal((await buat(admin, { title: 'Musyrif ke santri', audience: 'musyrif', studentIds: [s1.id] })).status, 422, 'Bukan untuk santri tertentu.');
    const rapatSemua = await buat(admin, { title: 'Rapat semua musyrif', audience: 'musyrif' });
    assert.equal(rapatSemua.status, 201, rapatSemua.teks);
    const rapatA = await buat(admin, { title: 'Rapat musyrif A', audience: 'musyrif', dormitoryId: A.id });
    assert.equal(rapatA.status, 201, rapatA.teks);
    const judulMusyrif = async (token) => (await api('GET', '/api/announcements?limit=50', token)).body.items.filter((a) => a.audience === 'musyrif').map((a) => a.title).sort();
    assert.deepEqual(await judulMusyrif(tA), ['Rapat musyrif A', 'Rapat semua musyrif']);
    assert.deepEqual(await judulMusyrif(tB), ['Rapat semua musyrif'], 'Musyrif B tidak melihat pengumuman untuk musyrif asrama A.');
    for (const t of [tS1, tW1, tS2, tW3]) assert.deepEqual(await judulMusyrif(t), [], 'Santri dan wali tidak pernah melihat pengumuman musyrif.');
    const daftarA = (await api('GET', '/api/announcements?limit=50', tA)).body.items;
    assert.ok(daftarA.filter((a) => a.audience === 'musyrif').every((a) => a.canDelete === false), 'Musyrif tidak menghapus pengumuman dari admin.');
    assert.equal((await api('DELETE', `/api/announcements/${rapatA.body.announcement.id}`, tA)).status, 403);
    assert.equal((await api('POST', `/api/announcements/${rapatA.body.announcement.id}/dibaca`, tB)).status, 404, 'Musyrif B bukan penerimanya.');
    assert.equal((await api('POST', `/api/announcements/${rapatA.body.announcement.id}/dibaca`, tA)).status, 200);
    const penerimaRapat = await api('GET', `/api/announcements/${rapatSemua.body.announcement.id}/penerima`, admin);
    assert.deepEqual([penerimaRapat.body.total, penerimaRapat.body.read], [2, 0], 'Semua musyrif aktif menjadi penerima.');
    const penerimaRapatA = await api('GET', `/api/announcements/${rapatA.body.announcement.id}/penerima`, admin);
    assert.deepEqual(penerimaRapatA.body.items.map((i) => [i.name, i.role, Boolean(i.readAt)]), [['Musyrif A', 'musyrif', true]]);
    assert.equal((await api('GET', `/api/announcements/${rapatA.body.announcement.id}/penerima`, tA)).status, 404, 'Daftar penerima pengumuman musyrif hanya untuk admin.');

    // ------------------------------------------------------------ notifikasi belum dibaca
    const daftarS1 = (await api('GET', '/api/announcements?limit=50', tS1)).body;
    assert.equal(daftarS1.unread, 3);
    assert.ok(daftarS1.items.every((a) => a.read === false && a.kind === 'umum'));
    assert.deepEqual(daftarS1.items.find((a) => a.title === 'Untuk Santri Satu saja').target, { type: 'santri', label: '1 santri terpilih' });
    const idUmum = daftarS1.items.find((a) => a.title === 'Umum semua').id;
    const idBatch = untukBatch.body.announcement.id;
    assert.equal((await api('POST', `/api/announcements/${idUmum}/dibaca`, tS1)).status, 200);
    assert.equal((await api('POST', `/api/announcements/${idBatch}/dibaca`, tS1)).status, 404, 'Tidak bisa menandai pengumuman yang tidak ditujukan kepadanya.');
    assert.equal((await api('GET', '/api/announcements?limit=50', tS1)).body.unread, 2);
    assert.equal((await api('GET', '/api/announcements?limit=50', tW1)).body.unread, 3, 'Status baca per akun: wali tidak ikut terbaca.');
    const semuaBaca = await api('POST', '/api/announcements/dibaca-semua', tS1);
    assert.equal(semuaBaca.body.marked, 2);
    assert.equal((await api('GET', '/api/announcements?limit=50', tS1)).body.unread, 0);

    // ------------------------------------------------------------ penerima dan status baca
    const idS1 = untukS1.body.announcement.id;
    const penerima = await api('GET', `/api/announcements/${idS1}/penerima`, tA);
    assert.equal(penerima.status, 200, penerima.teks);
    assert.equal(penerima.body.total, 2, 'Santri Satu dan walinya.');
    assert.equal(penerima.body.read, 1, 'Santri Satu sudah membaca; walinya belum.');
    assert.deepEqual(penerima.body.items.map((i) => [i.role, !!i.readAt]), [['wali', false], ['santri', true]]);
    assert.equal((await api('GET', `/api/announcements/${idS1}/penerima`, tB)).status, 404, 'Musyrif B bukan pihak yang berwenang.');
    assert.equal((await api('GET', `/api/announcements/${idS1}/penerima`, tW1)).status, 403);
    const penerimaBatch = await api('GET', `/api/announcements/${idBatch}/penerima`, admin);
    assert.equal(penerimaBatch.body.total, 3, 'Akun santri Dua dan wali Dua serta wali Tiga (Santri Tiga belum punya akun); tanpa santri di luar batch.');
    const penerimaBatchA = await api('GET', `/api/announcements/${idBatch}/penerima`, tA);
    assert.equal(penerimaBatchA.status, 200, penerimaBatchA.teks);
    assert.equal(penerimaBatchA.body.total, 2, 'Musyrif A hanya melihat penerima dari asramanya: Santri Dua dan walinya.');

    // Notifikasi email hanya ke wali yang menjadi sasaran, bukan ke seluruh wali.
    const antre = (await database.query(`SELECT recipient_email FROM notification_outbox WHERE notification_type = 'announcement-published'`)).rows.map((r) => r.recipient_email);
    const hitungEmail = (e) => antre.filter((x) => x === e).length;
    assert.deepEqual([hitungEmail('wali1@uji.test'), hitungEmail('wali2@uji.test'), hitungEmail('wali3@uji.test')], [3, 4, 2], 'Pengumuman terarah hanya dikirim ke wali sasaran.');
    // ------------------------------------------------------------ kotak pesan: tiga jenis dibedakan
    const pesan = await api('POST', `/api/students/${s1.id}/pesan`, tA, { kind: 'evaluasi', subject: 'Evaluasi pekan ini', body: 'Santri Satu sudah baik dalam hafalan pekan ini.' });
    assert.equal(pesan.status, 201, pesan.teks);
    const pesanDua = await api('POST', `/api/students/${s1.id}/pesan`, tA, { kind: 'pengingat', subject: 'Pengingat piket', body: 'Jangan lupa piket kamar hari Kamis.' });
    assert.equal(pesanDua.status, 201);
    assert.equal((await api('PATCH', `/api/pesan/${pesanDua.body.id}/bagikan`, tA, { shared: true })).status, 200);
    const masukan = await api('POST', '/api/masukan', tW1, { kind: 'saran', subject: 'Usul jadwal', body: 'Mohon jadwal halaqah diatur lebih pagi.', studentId: s1.id });
    assert.equal(masukan.status, 201, masukan.teks);
    const idMasukan = (masukan.body.feedback || masukan.body).id;

    const kotakS1 = await api('GET', '/api/kotak-pesan', tS1);
    assert.equal(kotakS1.status, 200, kotakS1.teks);
    assert.deepEqual(kotakS1.body.items.filter((i) => i.kind === 'pembinaan').map((i) => i.title).sort(), ['Evaluasi pekan ini', 'Pengingat piket']);
    assert.equal(kotakS1.body.items.filter((i) => i.kind === 'masukan').length, 0, 'Masukan wali tidak pernah sampai ke santri.');
    assert.equal(kotakS1.body.unread.pembinaan, 2);
    assert.deepEqual(kotakS1.body.kinds.map((k) => k.id), ['umum', 'pembinaan']);

    const kotakW1 = await api('GET', '/api/kotak-pesan', tW1);
    assert.deepEqual(kotakW1.body.items.filter((i) => i.kind === 'pembinaan').map((i) => i.title), ['Pengingat piket'], 'Wali hanya melihat pesan yang dibagikan staf.');
    assert.equal(kotakW1.body.unread.pembinaan, 0, 'Status baca pesan pembinaan milik santri, bukan wali.');
    assert.equal(kotakW1.body.unread.masukan, 0, 'Belum ada balasan.');
    assert.deepEqual(kotakW1.body.kinds.map((k) => k.id), ['umum', 'pembinaan', 'masukan']);
    assert.equal((await api('GET', '/api/kotak-pesan', tW2)).body.items.filter((i) => i.kind === 'pembinaan').length, 0, 'Wali lain tidak melihat pesan santri ini.');

    // Balasan masukan menjadi notifikasi belum dibaca bagi wali.
    assert.equal((await api('PATCH', `/api/masukan/${idMasukan}`, admin, { status: 'ditindaklanjuti', reply: 'Terima kasih, jadwal akan kami tinjau.' })).status, 200);
    const sesudahBalas = await api('GET', '/api/kotak-pesan', tW1);
    assert.equal(sesudahBalas.body.unread.masukan, 1);
    assert.equal((await api('POST', `/api/kotak-pesan/masukan/${idMasukan}/dibaca`, tW2)).status, 404, 'Balasan wali lain tidak bisa ditandai.');
    assert.equal((await api('POST', `/api/kotak-pesan/masukan/${idMasukan}/dibaca`, tW1)).status, 200);
    assert.equal((await api('GET', '/api/kotak-pesan', tW1)).body.unread.masukan, 0);
    // Balasan kedua dihitung belum dibaca lagi.
    await api('PATCH', `/api/masukan/${idMasukan}`, admin, { status: 'ditindaklanjuti', reply: 'Tambahan: jadwal baru berlaku bulan depan.' });
    assert.equal((await api('GET', '/api/kotak-pesan', tW1)).body.unread.masukan, 1);

    // Pesan pembinaan: hanya santri penerima yang menandai.
    const idPesan = kotakS1.body.items.find((i) => i.title === 'Evaluasi pekan ini').id;
    assert.equal((await api('POST', `/api/kotak-pesan/pembinaan/${idPesan}/dibaca`, tS2)).status, 404, 'Santri lain tidak bisa menandai.');
    assert.equal((await api('POST', `/api/kotak-pesan/pembinaan/${idPesan}/dibaca`, tS1)).status, 200);
    assert.equal((await api('GET', '/api/kotak-pesan', tS1)).body.unread.pembinaan, 1);
    const semuaKotak = await api('POST', '/api/kotak-pesan/dibaca-semua', tS1);
    assert.equal(semuaKotak.status, 200);
    assert.equal((await api('GET', '/api/kotak-pesan', tS1)).body.unread.total, 0);

    // Staf tidak memakai kotak pesan keluarga; admin hanya mendapat kotak kosong.
    assert.equal((await api('GET', '/api/kotak-pesan', tA)).status, 403);
    assert.deepEqual((await api('GET', '/api/kotak-pesan', admin)).body.items, []);
    assert.equal((await api('GET', '/api/kotak-pesan')).status, 401);

    console.log('announcements tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
