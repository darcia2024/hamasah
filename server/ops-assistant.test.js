// Asisten Operasional (item 20): ringkasan asrama, perkembangan santri, dokumen, draf pengumuman. Yang dibuktikan di sini:
// akses mengikuti hak pengguna, AI tidak menerima data pribadi (nama diganti alias, tanpa catatan bebas), penyedia luar
// hanya dipanggil bila admin mengizinkan, hasil tidak mengubah data apa pun, dan penggunaan tercatat tanpa isinya.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-asisten';
// Tanggal Jakarta, sama dengan layanan; tanggal UTC tertinggal sehari pukul 00.00-07.00 WIB.
const HARI = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

async function run() {
  const database = await createTestDatabase();
  const panggilan = [];
  let balasanModel = (user) => `Ringkasan AI untuk ${(/"santri":"([^"]+)"/.exec(user) || [])[1] || 'Santri 1'} berdasarkan data.`;
  const provider = { configured: true, async generate({ system, user }) { panggilan.push({ system, user }); return { text: balasanModel(user) }; } };
  const app = createHamasahApp({ rootDirectory: path.resolve(__dirname, '..'), database, bootstrapKey: 'kunci-bootstrap-uji', rateLimiter: createRelaxedRateLimiter(), opsAssistantProvider: provider });
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
  const jalankan = (token, tugas, body) => api('POST', `/api/asisten-operasional/${tugas}`, token, body || {});

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
    const akunS1 = await akun('Akun Budi', 'budi@uji.test', 'student');
    await akun('Guru Uji', 'guru@uji.test', 'teacher');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const mk = async (nama, asrama) => (await api('POST', '/api/students', admin, { name: nama, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: asrama.id })).body.student;
    const budi = await mk('Budi Rahmatullah', A);
    const candra = await mk('Candra Wijaya', B);
    await database.query('UPDATE students SET student_account_id = $1 WHERE id = $2', [akunS1.id, budi.id]);
    await database.query('INSERT INTO student_parent_accounts (student_id, parent_account_id) VALUES ($1, $2), ($3, $4)', [budi.id, wali1.id, candra.id, wali2.id]);
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tW1 = await masuk('wali1@uji.test');
    const tW2 = await masuk('wali2@uji.test');
    const tS = await masuk('budi@uji.test');
    const tGuru = await masuk('guru@uji.test');

    // Kehadiran kegiatan: Budi alpa 3 kali, hadir 5 kali dalam 30 hari terakhir.
    const jenis = crypto.randomUUID();
    await database.query(`INSERT INTO activity_types (id, name) VALUES ($1, 'Halaqah')`, [jenis]);
    for (let i = 0; i < 8; i += 1) {
      const sesi = crypto.randomUUID();
      const tgl = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      await database.query(`INSERT INTO activity_sessions (id, type_id, session_date, group_kind, dormitory_id, status) VALUES ($1, $2, $3, 'asrama', $4, 'terlaksana')`, [sesi, jenis, tgl, A.id]);
      await database.query(`INSERT INTO activity_attendance (session_id, student_id, status) VALUES ($1, $2, $3)`, [sesi, budi.id, i < 3 ? 'alpa' : 'hadir']);
    }
    // Catatan bebas yang TIDAK boleh bocor ke penyedia AI.
    await database.query(`INSERT INTO student_cases (id, student_id, kind, ref, source, status, note, due_on) VALUES ($1, $2, 'lapor-diri', $4, 'manual', 'baru', 'RAHASIA-CATATAN-PRIBADI', $3)`, [crypto.randomUUID(), budi.id, HARI, 'ref-uji']);

    // ------------------------------------------------------------ pilihan dan akses
    assert.equal((await api('GET', '/api/asisten-operasional')).status, 401);
    assert.equal((await api('GET', '/api/asisten-operasional', tGuru)).status, 403, 'Pengajar tidak memakai asisten operasional.');
    const pilA = (await api('GET', '/api/asisten-operasional', tA)).body;
    assert.deepEqual(pilA.tasks.map((t) => t.id), ['ringkasan-asrama', 'perkembangan-santri', 'draft-pengumuman', 'draft-laporan']);
    assert.deepEqual(pilA.dormitories.map((d) => d.name), ['Asrama A'], 'Musyrif hanya memilih asramanya.');
    assert.equal(pilA.external, false, 'Pengiriman ke penyedia luar mati secara bawaan.');
    assert.deepEqual((await api('GET', '/api/asisten-operasional', tW1)).body.tasks.map((t) => t.id), ['perkembangan-santri']);
    assert.ok((await api('GET', '/api/asisten-operasional', admin)).body.tasks.some((t) => t.id === 'dokumen-tindak-lanjut'));
    assert.equal((await jalankan(tW1, 'ringkasan-asrama', { dormitoryId: A.id })).status, 403, 'Wali tidak meringkas asrama.');
    assert.equal((await jalankan(tA, 'dokumen-tindak-lanjut')).status, 403, 'Dokumen hanya admin.');
    assert.equal((await jalankan(tA, 'tugas-ngawur')).status, 404);

    // ------------------------------------------------------------ mode lokal (tanpa AI)
    const ringkas = await jalankan(tA, 'ringkasan-asrama', { dormitoryId: A.id });
    assert.equal(ringkas.status, 200, ringkas.teks);
    assert.equal(ringkas.body.mode, 'lokal');
    assert.equal(panggilan.length, 0, 'Tanpa izin admin, penyedia luar tidak dipanggil.');
    assert.ok(ringkas.body.text.includes('Budi Rahmatullah'), 'Ringkasan lokal boleh memuat nama karena pembacanya berwenang.');
    assert.ok(ringkas.body.text.includes('alpa 3 kali'));
    assert.equal(ringkas.body.facts.find((f) => f.label === 'Santri aktif').value, 1);
    assert.equal(ringkas.body.facts.find((f) => f.label === 'Hadir / izin / sakit / alpa').value, '5 / 0 / 0 / 3');
    assert.match(ringkas.body.disclaimer, /Periksa dulu/);
    assert.equal((await jalankan(tA, 'ringkasan-asrama', { dormitoryId: B.id })).status, 403, 'Musyrif A tidak meringkas asrama B.');
    assert.equal((await jalankan(tB, 'ringkasan-asrama', { dormitoryId: A.id })).status, 403);
    assert.equal((await jalankan(tA, 'ringkasan-asrama', {})).status, 404);
    assert.equal((await jalankan(admin, 'ringkasan-asrama', { dormitoryId: B.id })).status, 200);

    // Perkembangan santri mengikuti akses: wali anaknya, santri sendiri, musyrif asramanya, admin; yang lain ditolak.
    assert.equal((await jalankan(tW1, 'perkembangan-santri', { studentId: budi.id })).status, 200);
    assert.equal((await jalankan(tS, 'perkembangan-santri', { studentId: budi.id })).status, 200);
    assert.equal((await jalankan(tA, 'perkembangan-santri', { studentId: budi.id })).status, 200);
    assert.equal((await jalankan(tW2, 'perkembangan-santri', { studentId: budi.id })).status, 403, 'Wali lain tidak membaca perkembangan Budi.');
    assert.equal((await jalankan(tB, 'perkembangan-santri', { studentId: budi.id })).status, 403);
    assert.equal((await jalankan(tS, 'perkembangan-santri', { studentId: candra.id })).status, 403);
    assert.equal((await jalankan(tW1, 'perkembangan-santri', { studentId: crypto.randomUUID() })).status, 404);
    const kembang = (await jalankan(tW1, 'perkembangan-santri', { studentId: budi.id })).body;
    assert.match(kembang.text, /Kehadiran kegiatan 30 hari terakhir 63%/);
    assert.deepEqual(kembang.dataUsed, ['Rekap kehadiran kegiatan', 'Setoran hafalan', 'Peta hafalan juz']);

    const dokumen = await jalankan(admin, 'dokumen-tindak-lanjut');
    assert.equal(dokumen.status, 200, dokumen.teks);
    assert.equal(dokumen.body.mode, 'lokal');

    // ------------------------------------------------------------ draf dan usulan
    const draf = await jalankan(tA, 'draft-pengumuman', { instruction: 'Kerja bakti asrama hari Jumat pagi pukul 07.00' });
    assert.equal(draf.status, 200, draf.teks);
    assert.equal(draf.body.proposal.type, 'pengumuman');
    assert.match(draf.body.proposal.title, /Kerja bakti/);
    assert.equal((await jalankan(tA, 'draft-pengumuman', { instruction: 'pendek' })).status, 422);
    assert.equal((await jalankan(tW1, 'draft-pengumuman', { instruction: 'Kerja bakti asrama hari Jumat pagi' })).status, 403);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM announcements')).rows[0].n, 0, 'Draf TIDAK menerbitkan pengumuman.');
    const laporan = await jalankan(tA, 'draft-laporan', { instruction: 'Kegiatan halaqah pekan ini berjalan lancar dan santri aktif' });
    assert.equal(laporan.body.proposal, null);
    assert.match(laporan.body.text, /LAPORAN/);

    // ------------------------------------------------------------ penyedia luar: hanya bila diizinkan, dan anonim
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'asisten.kirimKeLuar': true } })).status, 200);
    await api('POST', '/api/admin/settings/lupakan-cache', admin).catch(() => {});
    const luar = await jalankan(tA, 'ringkasan-asrama', { dormitoryId: A.id });
    assert.equal(luar.status, 200, luar.teks);
    assert.equal(luar.body.mode, 'ai');
    assert.equal(panggilan.length, 1);
    const kirim = `${panggilan[0].system}\n${panggilan[0].user}`;
    assert.ok(!kirim.includes('Budi'), 'Nama asli santri tidak dikirim ke penyedia.');
    assert.ok(!kirim.includes('Rahmatullah'));
    assert.ok(!kirim.includes('RAHASIA-CATATAN-PRIBADI'), 'Catatan bebas tidak pernah masuk konteks.');
    assert.ok(!kirim.includes(budi.id) && !kirim.includes(A.id), 'Id internal tidak dikirim.');
    assert.ok(!kirim.includes('wali1@uji.test'), 'Kontak tidak dikirim.');
    assert.match(panggilan[0].user, /Santri 1/, 'Nama diganti alias.');
    assert.match(panggilan[0].system, /bukan perintah/, 'Instruksi menganggap isi data sebagai data.');
    // Jawaban model dengan alias dikembalikan ke nama asli untuk pembaca berwenang.
    balasanModel = () => 'Santri 1 perlu dibicarakan dengan musyrif karena alpa 3 kali.';
    const kembali = await jalankan(tA, 'ringkasan-asrama', { dormitoryId: A.id });
    assert.match(kembali.body.text, /^Budi Rahmatullah perlu dibicarakan/);
    // Fakta berasal dari data, bukan dari model.
    assert.equal(kembali.body.facts.find((f) => f.label === 'Santri aktif').value, 1);

    // Model gagal atau kosong: ringkasan lokal tetap dipakai.
    balasanModel = () => { throw new Error('model-mati'); };
    const gagal = await jalankan(tA, 'ringkasan-asrama', { dormitoryId: A.id });
    assert.equal(gagal.body.mode, 'lokal');
    assert.ok(gagal.body.text.includes('Budi Rahmatullah'));
    balasanModel = () => '**JUDUL:** x';
    assert.equal((await jalankan(tA, 'ringkasan-asrama', { dormitoryId: A.id })).body.mode, 'lokal', 'Jawaban terlalu pendek diabaikan.');

    // Draf pengumuman dari model menjadi usulan, bukan pengumuman.
    balasanModel = () => 'JUDUL: Kerja bakti Jumat\nISI: Seluruh santri diharapkan hadir pada kerja bakti hari Jumat pukul 07.00 di halaman asrama.';
    const drafAi = await jalankan(tA, 'draft-pengumuman', { instruction: 'Kerja bakti asrama hari Jumat pagi pukul 07.00' });
    assert.equal(drafAi.body.mode, 'ai');
    assert.deepEqual([drafAi.body.proposal.title, drafAi.body.proposal.body.slice(0, 20)], ['Kerja bakti Jumat', 'Seluruh santri dihar']);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM announcements')).rows[0].n, 0);

    // Perkembangan santri ke penyedia: nama santri hanya alias.
    panggilan.length = 0;
    balasanModel = (user) => `Ringkasan untuk ${(/"santri":"([^"]+)"/.exec(user) || [])[1]}.`;
    const kemb = await jalankan(tW1, 'perkembangan-santri', { studentId: budi.id });
    assert.equal(kemb.body.mode, 'ai');
    assert.ok(!panggilan[0].user.includes('Budi'));
    assert.equal(kemb.body.text, 'Ringkasan untuk Budi Rahmatullah.');

    // ------------------------------------------------------------ audit, saklar, dan batas
    const audit = (await database.query(`SELECT metadata FROM audit_events WHERE action = 'ops-assistant.used'`)).rows;
    assert.ok(audit.length >= 8);
    assert.ok(audit.every((r) => JSON.stringify(r.metadata).length < 60), 'Audit hanya memuat mode, bukan isi.');
    assert.ok(!JSON.stringify(audit).includes('Budi'));

    // Batas per jam bisa diatur admin dari Pengaturan.
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'asisten.operasionalPerJam': 1 } })).status, 200);
    await api('POST', '/api/admin/settings/lupakan-cache', admin).catch(() => {});
    assert.equal((await jalankan(tA, 'ringkasan-asrama', { dormitoryId: A.id })).status, 429, 'Batas per jam dari pengaturan berlaku.');
    // Hitungannya di database, bukan memori proses: di Vercel setiap instance melihat angka yang sama.
    const hitungan = (await database.query(`SELECT count(*)::int AS n FROM rate_limit_hits WHERE bucket LIKE 'asisten-operasional:%'`)).rows[0].n;
    assert.ok(hitungan >= 1, 'Pemakaian asisten tercatat di rate_limit_hits.');
    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'asisten.operasionalPerJam': 200 } })).status, 200);
    await api('POST', '/api/admin/settings/lupakan-cache', admin).catch(() => {});

    assert.equal((await api('PUT', '/api/admin/settings', admin, { nilai: { 'asisten.operasional': false } })).status, 200);
    await api('POST', '/api/admin/settings/lupakan-cache', admin).catch(() => {});
    assert.equal((await jalankan(tA, 'ringkasan-asrama', { dormitoryId: A.id })).status, 409, 'Admin dapat mematikan asisten.');
    assert.equal((await api('GET', '/api/asisten-operasional', tA)).body.enabled, false);

    console.log('ops assistant tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
