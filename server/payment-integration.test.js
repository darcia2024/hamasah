// Integrasi pembayaran (persiapan): tautan pembayaran aman, daftar audit dan keputusan, mode rekonsiliasi bersyarat, dan rekonsiliasi
// transaksi eksternal lewat satu jalur pelunasan resmi (idempoten, tidak menimpa tagihan yang sudah lunas, nominal harus cocok).
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');
const { tautanAman } = require('./payment-integration-service.js');

const SANDI = 'kata-sandi-uji-pembayaran';

async function run() {
  assert.equal(tautanAman('http://bayar.contoh.id'), false, 'Hanya https.');
  assert.equal(tautanAman('javascript:alert(1)'), false);
  assert.equal(tautanAman('https://localhost'), false);
  assert.equal(tautanAman('https://bayar.hamasah.example/portal'), 'https://bayar.hamasah.example/portal');
  assert.equal(tautanAman(''), '');

  const database = await createTestDatabase();
  const app = createHamasahApp({ rootDirectory: path.resolve(__dirname, '..'), database, bootstrapKey: 'kunci-bootstrap-uji', appBaseUrl: 'https://hamasah.test', rateLimiter: createRelaxedRateLimiter() });
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
    const wali = await akun('Wali', 'wali@uji.test', 'parent');
    await akun('Keuangan', 'uang@uji.test', 'finance');
    await akun('Musyrif', 'musyrif@uji.test', 'supervisor');
    const anak = (await api('POST', '/api/students', admin, { name: 'Anak Satu', program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01' })).body.student;
    await api('PATCH', `/api/students/${anak.id}/accounts`, admin, { parentAccountIds: [wali.id] });
    const tUang = await masuk('uang@uji.test');
    const tMusyrif = await masuk('musyrif@uji.test');
    const tWali = await masuk('wali@uji.test');
    const tagihan = async (jumlah, deskripsi = 'SPP') => (await api('POST', '/api/operations/invoices', admin, { studentId: anak.id, description: deskripsi, amount: jumlah })).body.invoice;
    const i1 = await tagihan(1500000);
    const i2 = await tagihan(500000, 'Buku');
    // Hari ini menurut Jakarta, sama dengan pembanding di server; tanggal UTC tertinggal sehari antara 00.00 dan 07.00 WIB.
    const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

    // Hak akses.
    assert.equal((await api('GET', '/api/pembayaran/pengaturan', tMusyrif)).status, 403);
    assert.equal((await api('GET', '/api/pembayaran/transaksi', tWali)).status, 403);
    assert.equal((await api('PUT', '/api/pembayaran/pengaturan', tUang, { paymentUrl: 'https://bayar.hamasah.example' })).status, 403, 'Hanya admin mengubah pengaturan.');

    // Tautan pembayaran: kosong sampai diatur; dapat dibaca wali.
    assert.equal((await api('GET', '/api/pembayaran/tautan', tWali)).body.url, null);
    assert.equal((await api('GET', '/api/pembayaran/tautan', tMusyrif)).status, 403);
    assert.equal((await api('PUT', '/api/pembayaran/pengaturan', admin, { paymentUrl: 'http://tidak-aman.example' })).status, 422);
    assert.equal((await api('PUT', '/api/pembayaran/pengaturan', admin, { paymentUrl: 'javascript:alert(1)' })).status, 422);
    assert.equal((await api('PUT', '/api/pembayaran/pengaturan', admin, { paymentUrl: 'https://bayar.hamasah.example/wali', providerName: 'Xendit' })).status, 200);
    assert.equal((await api('GET', '/api/pembayaran/tautan', tWali)).body.url, 'https://bayar.hamasah.example/wali');

    // Tautan ikut dalam pesan pengingat WhatsApp.
    const pesan = await api('POST', `/api/pengingat-tagihan/wali/${wali.id}/pratinjau`, tUang, {});
    assert.match(pesan.body.message, /https:\/\/bayar\.hamasah\.example\/wali/);

    // Audit dan keputusan.
    const pengaturan = await api('GET', '/api/pembayaran/pengaturan', tUang);
    assert.equal(pengaturan.status, 200, pengaturan.teks);
    assert.equal(pengaturan.body.audit.length, 9);
    assert.equal(pengaturan.body.config.decision, 'belum-final');
    assert.equal(pengaturan.body.canEdit, false);
    assert.equal(pengaturan.body.automaticSync.available, false);
    assert.equal((await api('PUT', '/api/pembayaran/audit/api-tersedia', admin, { status: 'ngawur' })).status, 422);
    assert.equal((await api('PUT', '/api/pembayaran/audit/api-tersedia', admin, { status: 'tidak' })).status, 422, 'Catatan wajib.');
    assert.equal((await api('PUT', '/api/pembayaran/audit/tidak-ada', admin, { status: 'ya' })).status, 404);
    assert.equal((await api('PUT', '/api/pembayaran/audit/api-tersedia', tUang, { status: 'ya' })).status, 403);
    assert.equal((await api('PUT', '/api/pembayaran/audit/api-tersedia', admin, { status: 'perlu-konfirmasi', note: 'Menunggu dokumentasi dari tim IT.' })).status, 200);

    // Mode rekonsiliasi hanya setelah audit menyatakan akses sah dan pemetaan tagihan.
    assert.equal((await api('PUT', '/api/pembayaran/pengaturan', admin, { mode: 'rekonsiliasi' })).status, 409);
    assert.equal((await api('PUT', '/api/pembayaran/audit/akses-sah', admin, { status: 'ya' })).status, 200);
    assert.equal((await api('PUT', '/api/pembayaran/audit/pemetaan-tagihan', admin, { status: 'ya' })).status, 200);
    assert.equal((await api('PUT', '/api/pembayaran/pengaturan', admin, { mode: 'rekonsiliasi' })).status, 200);
    // Keputusan wajib berdasar catatan.
    assert.equal((await api('PUT', '/api/pembayaran/pengaturan', admin, { decision: 'integrasi' })).status, 422);
    assert.equal((await api('PUT', '/api/pembayaran/pengaturan', admin, { decision: 'integrasi', decisionNote: 'Disepakati dengan tim IT pada rapat Oktober.' })).status, 200);
    assert.equal((await api('GET', '/api/pembayaran/pengaturan', admin)).body.config.decidedAt !== null, true);
    // Mencabut syarat menurunkan mode kembali ke tautan.
    assert.equal((await api('PUT', '/api/pembayaran/audit/akses-sah', admin, { status: 'tidak', note: 'Akses dicabut pemilik.' })).status, 200);
    assert.equal((await api('GET', '/api/pembayaran/pengaturan', admin)).body.config.mode, 'tautan');

    // Rekonsiliasi: pencatatan idempoten dan validasi.
    const catat = (token, body) => api('POST', '/api/pembayaran/transaksi', token, { source: 'xendit', paidOn: hariIni, ...body });
    assert.equal((await catat(tMusyrif, { externalRef: 'SND-001', amount: 1500000 })).status, 403);
    assert.equal((await catat(tUang, { externalRef: 'x', amount: 1500000 })).status, 422);
    assert.equal((await catat(tUang, { externalRef: 'SND-001', amount: 0 })).status, 422);
    assert.equal((await catat(tUang, { externalRef: 'SND-001', amount: 1500000, paidOn: '2999-01-01' })).status, 422);
    const t1 = await catat(tUang, { externalRef: 'SND-001', amount: 1500000, invoiceNumber: i1.number, payerName: 'Bapak Wali' });
    assert.equal(t1.status, 201, t1.teks);
    assert.equal(t1.body.matchedInvoiceNumber, i1.number);
    assert.equal(t1.body.amountMatches, true);
    assert.equal((await catat(tUang, { externalRef: 'SND-001', amount: 1500000 })).status, 409, 'Referensi yang sama tidak dicatat dua kali.');
    const tSalah = await catat(tUang, { externalRef: 'SND-002', amount: 400000, invoiceNumber: i2.number });
    assert.equal(tSalah.body.amountMatches, false);
    const tTanpa = await catat(tUang, { externalRef: 'SND-003', amount: 500000, invoiceNumber: 'INV/HI/2026/99999' });
    assert.equal(tTanpa.body.matchedInvoiceId, null);

    // Penerapan: lewat jalur resmi (kuitansi), tidak ganda.
    assert.equal((await api('POST', `/api/pembayaran/transaksi/${tTanpa.body.id}/terapkan`, tUang, {})).status, 409, 'Harus dicocokkan dulu.');
    assert.equal((await api('PATCH', `/api/pembayaran/transaksi/${tTanpa.body.id}/tagihan`, tUang, { invoiceNumber: 'INV/HI/2026/99999' })).status, 404);
    assert.equal((await api('POST', `/api/pembayaran/transaksi/${tSalah.body.id}/terapkan`, tUang, {})).status, 409, 'Selisih nominal ditahan.');
    assert.equal((await api('POST', `/api/pembayaran/transaksi/${tSalah.body.id}/terapkan`, tUang, { allowMismatch: true, mismatchReason: 'Potongan disetujui' })).status, 409, 'Keuangan tidak boleh menerapkan selisih nominal.');
    const terapkan = await api('POST', `/api/pembayaran/transaksi/${t1.body.id}/terapkan`, tUang, {});
    assert.equal(terapkan.status, 200, terapkan.teks);
    assert.equal(terapkan.body.status, 'diterapkan');
    assert.match(terapkan.body.receiptNumber, /^KWT\/HI\/\d{4}\/\d{5}$/);
    assert.equal(terapkan.body.paid, undefined, 'Detail internal tidak bocor ke klien.');
    const tagihanAnak = (await api('GET', `/api/students/${anak.id}/invoices`, admin)).body.items;
    assert.equal(tagihanAnak.find((i) => i.id === i1.id).status, 'paid');
    assert.equal((await api('POST', `/api/pembayaran/transaksi/${t1.body.id}/terapkan`, tUang, {})).status, 409, 'Tidak diterapkan dua kali.');

    // Tagihan yang sudah lunas lewat jalur lain tidak ditimpa.
    assert.equal((await api('PATCH', `/api/operations/invoices/${i2.id}/paid`, admin, {})).status, 200);
    const tGanda = await catat(tUang, { externalRef: 'SND-004', amount: 500000, invoiceNumber: i2.number });
    const ganda = await api('POST', `/api/pembayaran/transaksi/${tGanda.body.id}/terapkan`, tUang, {});
    assert.equal(ganda.status, 409);
    assert.match(ganda.body.error, /sudah lunas lewat jalur lain/);
    assert.equal((await api('POST', `/api/pembayaran/transaksi/${tGanda.body.id}/tolak`, tUang, { reason: 'x' })).status, 422);
    assert.equal((await api('POST', `/api/pembayaran/transaksi/${tGanda.body.id}/tolak`, tUang, { reason: 'Pembayaran ganda, akan direfund oleh pihak pembayaran.' })).status, 200);

    // Nominal berbeda boleh diterapkan admin dengan alasan, selisihnya tercatat di catatan pelunasan.
    const i3 = await tagihan(750000, 'Seragam');
    const tBeda = await catat(tUang, { externalRef: 'SND-005', amount: 700000, invoiceNumber: i3.number });
    const adminTerapkan = await api('POST', `/api/pembayaran/transaksi/${tBeda.body.id}/terapkan`, admin, { allowMismatch: true, mismatchReason: 'Potongan 50 ribu disetujui bendahara' });
    assert.equal(adminTerapkan.status, 200, adminTerapkan.teks);

    // Impor massal: baris gagal dilaporkan, yang benar tetap masuk.
    const i4 = await tagihan(300000, 'Iuran');
    const impor = await api('POST', '/api/pembayaran/impor', tUang, { rows: [
      { source: 'xendit', externalRef: 'SND-010', amount: 300000, paidOn: hariIni, invoiceNumber: i4.number },
      { source: 'xendit', externalRef: 'SND-001', amount: 1, paidOn: hariIni },
      { source: 'xendit', externalRef: 'SND-011', amount: -5, paidOn: hariIni }
    ] });
    assert.equal(impor.status, 200, impor.teks);
    assert.equal(impor.body.imported, 1);
    assert.equal(impor.body.failed, 2);
    assert.equal((await api('POST', '/api/pembayaran/impor', tUang, { rows: [] })).status, 422);
    const baru = await api('GET', '/api/pembayaran/transaksi?status=baru', tUang);
    assert.ok(baru.body.items.some((t) => t.externalRef === 'SND-010'));
    assert.ok(baru.body.items.every((t) => t.status === 'baru'));

    console.log('payment integration tests passed');
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
