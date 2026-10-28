// Impor santri massal: pratinjau memvalidasi dan menandai duplikat, konfirmasi menyimpan yang sah,
// akun hanya diundang (tanpa kata sandi bersama), dan hasilnya dilaporkan tanpa tautan aktivasi.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { bacaTanggal, bacaJenis } = require('./student-import-service.js');

const SANDI = 'kata-sandi-uji-impor';

async function run() {
  assert.deepEqual(bacaTanggal('38625'), { iso: '2005-09-30' }, 'Nomor seri tanggal Excel.');
  assert.deepEqual(bacaTanggal('30/09/2005'), { iso: '2005-09-30' });
  assert.deepEqual(bacaTanggal('9 Oktober 2005'), { iso: '2005-10-09' });
  assert.deepEqual(bacaTanggal(''), { iso: null });
  assert.ok(bacaTanggal('31/02/2005').galat);
  assert.ok(bacaTanggal('besok').galat);
  assert.equal(bacaJenis('L').value, 'putra');
  assert.equal(bacaJenis('Perempuan').value, 'putri');
  assert.ok(bacaJenis('x').galat);

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
  async function masuk(email, sandi = SANDI) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password: sandi });
    return hasil;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = (await masuk('admin@uji.test')).body.accessToken;
    async function akun(name, email, role) {
      const hasil = await api('POST', '/api/accounts', admin, { name, email, role, password: SANDI });
      assert.equal(hasil.status, 201, hasil.teks);
      return hasil.body.account;
    }
    const A = (await api('POST', '/api/dormitories', admin, { name: 'Asrama A', area: 'Kairo', gender: 'putra', capacity: 3 })).body.dormitory;
    const P = (await api('POST', '/api/dormitories', admin, { name: 'Asrama Putri', area: 'Kairo', gender: 'putri', capacity: 10 })).body.dormitory;
    assert.ok(A.id && P.id);
    await akun('Guru Uji', 'sudah@uji.test', 'teacher');
    const waliAda = await akun('Wali Lama', 'wali-ada@uji.test', 'parent');
    await akun('Musyrif Uji', 'musyrif@uji.test', 'supervisor');
    const tMusyrif = (await masuk('musyrif@uji.test')).body.accessToken;
    const lama = (await api('POST', '/api/students', admin, { name: 'Santri Lama', program: 'Kuliah S1', city: 'Kairo', joinDate: '2025-09-01', gender: 'putra', birthDate: '2004-05-05' })).body.student;
    assert.ok(lama.id);

    const baris = [
      { name: 'Ahmad Fauzi', gender: 'L', birthDate: '2005-09-30', program: 'Kuliah S1 Al-Azhar', city: 'Bogor', dormitory: 'Asrama A', email: 'ahmad@uji.test', phone: '+20 100 000 0001', guardianName: 'Bapak Fauzi', guardianEmail: 'wali-fauzi@uji.test', guardianPhone: '+62 811 000 001' },
      { name: 'Bilal Fauzi', gender: 'L', birthDate: '38625', program: 'Ma’had Al-Azhar', city: 'Bogor', dormitory: 'asrama a', guardianName: 'Bapak Fauzi', guardianEmail: 'WALI-FAUZI@uji.test' },
      { name: 'Citra Lestari', gender: 'P', birthDate: '12/03/2006', program: 'Kursus Bahasa', city: 'Depok', dormitory: 'Asrama Putri' },
      { name: 'Dani Salah Tanggal', gender: 'L', birthDate: '31/02/2005', program: 'Kuliah S1', city: 'Bekasi', dormitory: 'Asrama Hantu' },
      { name: 'Eko Salah Asrama', gender: 'L', program: 'Kuliah S1', city: 'Solo', dormitory: 'Asrama Putri' },
      { name: 'Santri Lama', gender: 'L', birthDate: '2004-05-05', program: 'Kuliah S1', city: 'Kairo' },
      { name: 'Ahmad Fauzi', gender: 'L', birthDate: '2005-09-30', program: 'Kuliah S1', city: 'Bogor' },
      { name: 'Fikri Email Bentrok', gender: 'L', program: 'Kuliah S1', city: 'Kairo', email: 'sudah@uji.test' },
      { name: 'Gilang Wali Bentrok', gender: 'L', program: 'Kuliah S1', city: 'Kairo', guardianName: 'Wali Gilang', guardianEmail: 'sudah@uji.test' },
      { name: 'Hasan Penuh Ketiga', gender: 'L', program: 'Kuliah S1', city: 'Kairo', dormitory: 'Asrama A', guardianName: 'Ayah Hasan', guardianEmail: 'wali-ada@uji.test' },
      { name: 'Ibrahim Kapasitas', gender: 'L', program: 'Kuliah S1', city: 'Kairo', dormitory: 'Asrama A' },
      { name: 'Jamal Email Salah', gender: 'L', program: 'Kuliah S1', city: 'Kairo', email: 'bukan-email' }
    ];

    // Hanya admin; jumlah baris dibatasi.
    assert.equal((await api('POST', '/api/impor-santri/pratinjau', tMusyrif, { rows: baris })).status, 403);
    assert.equal((await api('POST', '/api/impor-santri/pratinjau', admin, { rows: [] })).status, 422);
    assert.equal((await api('POST', '/api/impor-santri/pratinjau', admin, { rows: Array.from({ length: 501 }, (_, i) => ({ name: `S${i}` })) })).status, 422);
    assert.equal((await api('GET', '/api/impor-santri', tMusyrif)).status, 403);

    // Pratinjau: belum ada yang dibuat.
    const jumlahSebelum = (await database.query('SELECT count(*)::int AS n FROM students')).rows[0].n;
    const pratinjau = await api('POST', '/api/impor-santri/pratinjau', admin, { fileName: 'santri.xlsx', rows: baris });
    assert.equal(pratinjau.status, 201, pratinjau.teks);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM students')).rows[0].n, jumlahSebelum, 'Pratinjau tidak membuat santri.');
    const batch = pratinjau.body;
    const status = (nomor) => batch.rows.find((b) => b.row === nomor).status;
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(status), ['siap', 'siap', 'peringatan', 'bermasalah', 'bermasalah', 'duplikat', 'duplikat', 'bermasalah', 'bermasalah', 'siap', 'bermasalah', 'bermasalah']);
    const baris1 = batch.rows[0];
    assert.equal(baris1.data.gender, 'putra');
    assert.equal(baris1.data.dormitoryName, 'Asrama A');
    assert.equal(baris1.data.guardian, 'baru');
    assert.equal(batch.rows[1].data.birthDate, '2005-09-30', 'Nomor seri Excel dibaca sebagai tanggal.');
    assert.equal(batch.rows[1].data.guardian, 'tautkan', 'Wali yang sama dalam berkas dipakai bersama.');
    assert.equal(batch.rows[1].data.guardianEmail, 'wali-fauzi@uji.test', 'Email dinormalkan huruf kecil.');
    assert.match(batch.rows[2].warnings.join(' '), /Kursus Bahasa/);
    assert.match(batch.rows[2].warnings.join(' '), /Wali belum diisi/);
    assert.match(batch.rows[3].errors.join(' '), /tidak ada di kalender/);
    assert.match(batch.rows[3].errors.join(' '), /Asrama Hantu/);
    assert.match(batch.rows[4].errors.join(' '), /untuk putri/);
    assert.equal(batch.rows[5].duplicates[0].jenis, 'sudah-ada');
    assert.equal(batch.rows[6].duplicates[0].jenis, 'dalam-berkas');
    assert.match(batch.rows[7].errors.join(' '), /sudah dipakai akun lain/);
    assert.match(batch.rows[8].errors.join(' '), /bukan akun wali/);
    assert.equal(batch.rows[9].data.guardian, 'tautkan', 'Wali yang sudah punya akun ditautkan.');
    assert.match(batch.rows[10].errors.join(' '), /Kapasitas Asrama A sudah penuh/);
    assert.match(batch.rows[11].errors.join(' '), /Email santri belum valid/);
    assert.deepEqual(
      { total: batch.summary.total, ready: batch.summary.ready, warning: batch.summary.warning, problem: batch.summary.problem, duplicate: batch.summary.duplicate },
      { total: 12, ready: 3, warning: 1, problem: 6, duplicate: 2 }
    );
    assert.equal(batch.summary.newGuardianAccounts, 1);
    assert.equal(batch.summary.linkedGuardians, 2);
    assert.equal(batch.summary.newStudentAccounts, 1);

    // Konfirmasi: baris 3 dikecualikan admin, duplikat dalam berkas (baris 7) tetap dibuat.
    const sebelumAkun = (await database.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n;
    const konfirmasi = await api('POST', `/api/impor-santri/${batch.id}/konfirmasi`, admin, { exclude: [3], force: [7] });
    assert.equal(konfirmasi.status, 200, konfirmasi.teks);
    const hasil = konfirmasi.body;
    assert.equal(hasil.status, 'committed');
    assert.deepEqual([hasil.summary.created, hasil.summary.failed], [4, 0]);
    // Yang dibuat: 1, 2, 7 (duplikat yang dipaksa admin), dan 10 (wali lama). Baris 3 dikecualikan admin.
    const dibuat = hasil.results.filter((r) => r.ok).map((r) => r.row).sort((a, b) => a - b);
    assert.deepEqual(dibuat, [1, 2, 7, 10]);
    assert.equal(hasil.results.find((r) => r.row === 3).reason, 'Dikecualikan admin.');
    assert.equal(hasil.results.find((r) => r.row === 6).reason, 'Duplikat, dilewati.');
    assert.equal(hasil.results.find((r) => r.row === 4).reason, 'Bermasalah, tidak diimpor.');

    // Santri, asrama, dan profil tersimpan.
    const penempatan = (await database.query(`SELECT s.name, d.name AS asrama FROM students s JOIN dormitories d ON d.id = s.dormitory_id WHERE s.name IN ('Ahmad Fauzi', 'Bilal Fauzi', 'Hasan Penuh Ketiga') ORDER BY s.name`)).rows.map((s) => [s.name, s.asrama]);
    assert.deepEqual(penempatan, [['Ahmad Fauzi', 'Asrama A'], ['Bilal Fauzi', 'Asrama A'], ['Hasan Penuh Ketiga', 'Asrama A']]);
    assert.equal((await database.query(`SELECT count(*)::int AS n FROM students WHERE name = 'Ahmad Fauzi'`)).rows[0].n, 2, 'Duplikat yang dipaksa admin ikut dibuat.');
    const profil = (await database.query(`SELECT p.phone, p.emergency_name, p.emergency_phone FROM student_profiles p JOIN students s ON s.id = p.student_id WHERE s.name = 'Ahmad Fauzi' AND p.phone <> ''`)).rows[0];
    assert.deepEqual([profil.phone, profil.emergency_name, profil.emergency_phone], ['+20 100 000 0001', 'Bapak Fauzi', '+62 811 000 001']);

    // Akun: hanya diundang. Tidak aktif, belum punya kata sandi yang dikenal, dan wali saudara dipakai bersama.
    const akunBaru = (await database.query(`SELECT email, role, lifecycle, active FROM accounts WHERE email IN ('ahmad@uji.test', 'wali-fauzi@uji.test') ORDER BY email`)).rows;
    assert.deepEqual(akunBaru.map((a) => [a.email, a.role, a.lifecycle, a.active]), [['ahmad@uji.test', 'student', 'pending', false], ['wali-fauzi@uji.test', 'parent', 'pending', false]]);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, sebelumAkun + 2, 'Hanya dua akun baru: satu santri dan satu wali (dipakai dua bersaudara).');
    assert.equal((await masuk('wali-fauzi@uji.test', SANDI)).status, 401, 'Tidak ada kata sandi bawaan.');
    assert.equal((await masuk('wali-fauzi@uji.test', 'password')).status, 401);
    const tautan = (await database.query(`SELECT s.name, a.email FROM student_parent_accounts sp JOIN students s ON s.id = sp.student_id JOIN accounts a ON a.id = sp.parent_account_id WHERE s.name IN ('Ahmad Fauzi', 'Bilal Fauzi', 'Hasan Penuh Ketiga') ORDER BY s.name, a.email`)).rows;
    assert.ok(tautan.some((t) => t.name === 'Bilal Fauzi' && t.email === 'wali-fauzi@uji.test'));
    assert.ok(tautan.some((t) => t.name === 'Hasan Penuh Ketiga' && t.email === 'wali-ada@uji.test'), 'Wali lama ditautkan, bukan dibuat ulang.');
    assert.equal((await database.query(`SELECT count(*)::int AS n FROM accounts WHERE email = 'wali-ada@uji.test'`)).rows[0].n, 1);
    assert.ok(waliAda.id);

    // Laporan tidak memuat tautan aktivasi atau token.
    assert.ok(!/token|aktivasi|invitationToken/i.test(JSON.stringify(hasil)), 'Laporan tanpa tautan aktivasi.');
    assert.equal(hasil.summary.invitedAccounts, 2);
    assert.equal(hasil.summary.guardiansLinked, 2);
    assert.equal((await database.query(`SELECT count(*)::int AS n FROM audit_events WHERE action = 'student-import.committed'`)).rows[0].n, 1);
    const audit = (await database.query(`SELECT metadata FROM audit_events WHERE action IN ('student-import.previewed', 'student-import.committed')`)).rows;
    assert.ok(!audit.some((a) => /@uji\.test|Fauzi/.test(JSON.stringify(a.metadata))), 'Audit tanpa data pribadi.');

    // Konfirmasi ulang tidak menggandakan apa pun.
    const hitungSantri = (await database.query('SELECT count(*)::int AS n FROM students')).rows[0].n;
    const ulang = await api('POST', `/api/impor-santri/${batch.id}/konfirmasi`, admin, { exclude: [], force: [4] });
    assert.equal(ulang.status, 200);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM students')).rows[0].n, hitungSantri);
    assert.equal((await api('POST', `/api/impor-santri/${batch.id}/batal`, admin)).status, 409);
    assert.equal((await api('GET', `/api/impor-santri/${batch.id}`, tMusyrif)).status, 403);
    assert.equal((await api('GET', `/api/impor-santri/${batch.id}`, admin)).body.results.length, 12);
    assert.equal((await api('GET', '/api/impor-santri', admin)).body.items[0].status, 'committed');

    // Konfirmasi yang terhenti bisa dilanjutkan, dan yang sedang diproses ditolak.
    const dua = await api('POST', '/api/impor-santri/pratinjau', admin, { fileName: 'lanjut.csv', rows: [{ name: 'Kamil Lanjutan', gender: 'L', program: 'Kuliah S1', city: 'Kairo' }, { name: 'Luthfi Lanjutan', gender: 'L', program: 'Kuliah S1', city: 'Kairo' }] });
    assert.equal(dua.status, 201);
    await database.query(`UPDATE student_import_batches SET status = 'committing', locked_at = now() WHERE id = $1`, [dua.body.id]);
    assert.equal((await api('POST', `/api/impor-santri/${dua.body.id}/konfirmasi`, admin, {})).status, 409, 'Sedang diproses.');
    await database.query(`UPDATE student_import_batches SET locked_at = now() - interval '20 minutes' WHERE id = $1`, [dua.body.id]);
    const lanjut = await api('POST', `/api/impor-santri/${dua.body.id}/konfirmasi`, admin, {});
    assert.equal(lanjut.status, 200, lanjut.teks);
    assert.equal(lanjut.body.summary.created, 2);

    // Batal: impor yang belum dikonfirmasi bisa dibatalkan dan tidak bisa dikonfirmasi.
    const tiga = await api('POST', '/api/impor-santri/pratinjau', admin, { rows: [{ name: 'Maulana Batal', gender: 'L', program: 'Kuliah S1', city: 'Kairo' }] });
    assert.equal((await api('POST', `/api/impor-santri/${tiga.body.id}/batal`, admin)).status, 200);
    assert.equal((await api('POST', `/api/impor-santri/${tiga.body.id}/konfirmasi`, admin, {})).status, 409);
    assert.equal((await database.query(`SELECT count(*)::int AS n FROM students WHERE name = 'Maulana Batal'`)).rows[0].n, 0);

    // Baris dengan galat saat diproses dilaporkan, tidak menghentikan yang lain: email santri direbut akun lain sesudah pratinjau.
    const empat = await api('POST', '/api/impor-santri/pratinjau', admin, { rows: [{ name: 'Nashir Gagal Akun', gender: 'L', program: 'Kuliah S1', city: 'Kairo', email: 'rebutan@uji.test' }, { name: 'Omar Berhasil', gender: 'L', program: 'Kuliah S1', city: 'Kairo' }] });
    await akun('Perebut', 'rebutan@uji.test', 'teacher');
    const sisa = await api('POST', `/api/impor-santri/${empat.body.id}/konfirmasi`, admin, {});
    assert.equal(sisa.status, 200);
    assert.equal(sisa.body.summary.created, 2, 'Baris pertama tetap dibuat walau akunnya gagal.');
    assert.match(sisa.body.results.find((r) => r.row === 1).notes.join(' '), /Akun santri belum dibuat/);

    // Sebelum migrasi: pratinjau ditolak dengan arahan, daftar tidak jatuh.
    await database.query('DROP TABLE student_import_batches');
    assert.equal((await api('GET', '/api/impor-santri', admin)).body.available, false);
    assert.equal((await api('POST', '/api/impor-santri/pratinjau', admin, { rows: [{ name: 'Pascal Belum Migrasi' }] })).status, 409);

    console.log('student import tests passed');
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
