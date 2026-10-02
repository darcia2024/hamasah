// Tagihan massal (POST /api/operations/invoices/massal): pratinjau tidak menerbitkan apa pun,
// hanya santri aktif yang ditagih, santri yang sudah punya tagihan dengan keterangan sama
// dilewati (klik ganda dan pengulangan aman), filter program, izin, dan jejak audit.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-tagihan-massal';
const MAHAD = "Ma'had Al-Azhar";
const KULIAH = 'Kuliah S1 Al-Azhar';

async function run() {
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'kunci-bootstrap-uji',
    rateLimiter: createRelaxedRateLimiter()
  });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, pathname, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const teks = await response.text();
    return { status: response.status, body: teks ? JSON.parse(teks) : null };
  }
  async function masuk(email) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password: SANDI });
    assert.equal(hasil.status, 200, `Login ${email}: ${JSON.stringify(hasil.body)}`);
    return hasil.body.accessToken;
  }
  async function jumlahInvoice() {
    return (await database.query('SELECT count(*)::int AS jumlah FROM invoices')).rows[0].jumlah;
  }
  async function jumlahAudit(action) {
    return (await database.query('SELECT count(*)::int AS jumlah FROM audit_events WHERE action = $1', [action])).rows[0].jumlah;
  }

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    await api('POST', '/api/accounts', admin, { name: 'Keuangan Uji', email: 'keuangan@uji.test', role: 'finance', password: SANDI });
    await api('POST', '/api/accounts', admin, { name: 'Musyrif Uji', email: 'musyrif@uji.test', role: 'supervisor', password: SANDI });
    const keuangan = await masuk('keuangan@uji.test');
    const musyrif = await masuk('musyrif@uji.test');

    async function santri(name, program) {
      const hasil = await api('POST', '/api/students', admin, { name, program, city: 'Kairo', joinDate: '2026-08-20', gender: 'putra' });
      assert.equal(hasil.status, 201, JSON.stringify(hasil.body));
      return hasil.body.student;
    }
    const ahmad = await santri('Ahmad Uji', MAHAD);
    const bilal = await santri('Bilal Uji', MAHAD);
    const candra = await santri('Candra Uji', KULIAH);
    const lulus = await santri('Lulus Uji', KULIAH);
    assert.equal((await api('PATCH', `/api/students/${lulus.id}`, admin, { status: 'graduated' })).status, 200);

    const SPP = { description: 'SPP Oktober 2026', amount: 1500000 };

    // ----------------------------------------------------------------- pratinjau
    const pratinjau = await api('POST', '/api/operations/invoices/massal', keuangan, SPP);
    assert.equal(pratinjau.status, 200, JSON.stringify(pratinjau.body));
    assert.deepEqual(pratinjau.body.sasaran.map((item) => item.name), ['Ahmad Uji', 'Bilal Uji', 'Candra Uji'], 'Santri lulus tidak ditagih.');
    assert.equal(pratinjau.body.total, 4500000);
    assert.deepEqual(pratinjau.body.dilewati, []);
    assert.equal(await jumlahInvoice(), 0, 'Pratinjau tidak menerbitkan tagihan.');

    // ---------------------------------------------------- tagihan satuan lebih dulu
    // Ahmad sudah ditagih manual dengan keterangan yang sama (beda huruf besar dan spasi).
    const manual = await api('POST', '/api/operations/invoices', admin, { studentId: ahmad.id, description: '  spp oktober 2026 ', amount: 1500000 });
    assert.equal(manual.status, 201);

    // -------------------------------------------------------------------- terbitkan
    const terbit = await api('POST', '/api/operations/invoices/massal', keuangan, { ...SPP, terbitkan: true });
    assert.equal(terbit.status, 201, JSON.stringify(terbit.body));
    assert.deepEqual(terbit.body.invoices.map((invoice) => invoice.studentId).sort(), [bilal.id, candra.id].sort());
    assert.deepEqual(terbit.body.dilewati.map((item) => item.studentId), [ahmad.id]);
    assert.ok(terbit.body.invoices.every((invoice) => invoice.status === 'unpaid' && invoice.amount === 1500000 && /^INV\/HI\/\d{4}\/\d{5}$/.test(invoice.number)));
    assert.equal(new Set(terbit.body.invoices.map((invoice) => invoice.number)).size, 2, 'Nomor invoice tidak kembar.');
    assert.equal(await jumlahInvoice(), 3);
    assert.equal(await jumlahAudit('invoice.bulk-created'), 1);
    assert.equal(await jumlahAudit('invoice.created'), 3, 'Satu tagihan manual dan dua tagihan massal, masing-masing tercatat.');

    // Mengulang tidak menagih dua kali.
    const ulang = await api('POST', '/api/operations/invoices/massal', keuangan, { ...SPP, terbitkan: true });
    assert.equal(ulang.status, 422);
    assert.match(ulang.body.error, /Tidak ada santri/);
    assert.equal(await jumlahInvoice(), 3);
    assert.equal(await jumlahAudit('invoice.bulk-created'), 1);

    // Tagihan yang dibatalkan boleh ditagih ulang.
    const batal = await api('PATCH', `/api/operations/invoices/${manual.body.invoice.id}/void`, admin, { reason: 'Nominal salah ketik' });
    assert.equal(batal.status, 200, JSON.stringify(batal.body));
    const setelahBatal = await api('POST', '/api/operations/invoices/massal', admin, SPP);
    assert.deepEqual(setelahBatal.body.sasaran.map((item) => item.studentId), [ahmad.id]);

    // ---------------------------------------------------------------- filter program
    const perProgram = await api('POST', '/api/operations/invoices/massal', admin, { description: 'Biaya kitab Kuliah', amount: 250000, program: KULIAH });
    assert.deepEqual(perProgram.body.sasaran.map((item) => item.studentId), [candra.id]);
    assert.equal(perProgram.body.program, KULIAH);

    // Kelompok program mencakup semua jurusannya.
    const jurusan = await santri('Dimas Uji', `${KULIAH} (Ushuluddin)`);
    const perKelompok = await api('POST', '/api/operations/invoices/massal', admin, { description: 'Biaya kitab Kuliah', amount: 250000, program: KULIAH });
    assert.deepEqual(perKelompok.body.sasaran.map((item) => item.studentId), [candra.id, jurusan.id]);
    const perJurusan = await api('POST', '/api/operations/invoices/massal', admin, { description: 'Biaya kitab Kuliah', amount: 250000, program: `${KULIAH} (Ushuluddin)` });
    assert.deepEqual(perJurusan.body.sasaran.map((item) => item.studentId), [jurusan.id]);

    const pilihan = await api('GET', '/api/operations/invoices/massal', keuangan);
    assert.equal(pilihan.status, 200);
    assert.equal(pilihan.body.activeStudents, 4);
    assert.deepEqual(pilihan.body.groups, [{ value: KULIAH, count: 2 }, { value: MAHAD, count: 2 }]);
    assert.deepEqual(pilihan.body.programs, [{ value: `${KULIAH} (Ushuluddin)`, count: 1 }]);
    assert.equal((await api('GET', '/api/operations/invoices/massal', musyrif)).status, 403);

    // ------------------------------------------------------------ validasi dan izin
    assert.equal((await api('POST', '/api/operations/invoices/massal', admin, { description: 'SP', amount: 1000 })).status, 422);
    assert.equal((await api('POST', '/api/operations/invoices/massal', admin, { description: 'SPP Nol', amount: 0 })).status, 422);
    assert.equal((await api('POST', '/api/operations/invoices/massal', admin, { description: 'SPP Pecahan', amount: 10.5 })).status, 422);
    assert.equal((await api('POST', '/api/operations/invoices/massal', musyrif, SPP)).status, 403);
    assert.equal((await api('POST', '/api/operations/invoices/massal', null, SPP)).status, 401);

    const ringkasan = (await database.query("SELECT metadata FROM audit_events WHERE action = 'invoice.bulk-created'")).rows[0].metadata;
    assert.equal(ringkasan.jumlah, 2);
    assert.equal(ringkasan.keterangan, 'SPP Oktober 2026');

    console.log('bulk invoice tests passed (pratinjau, terbit, dobel tagih, program, izin, audit)');
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
