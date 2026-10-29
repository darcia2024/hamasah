// Inventaris asrama yang diperluas (kode otomatis, riwayat, pemeriksaan bulanan, dashboard) dan AC patungan (kontribusi dibedakan antara
// pembelian dan pemasangan, ketentuan pengembalian, refund hanya untuk santri yang berkontribusi, persetujuan dan bukti pencairan).
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-inventaris';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
// Tanggal Jakarta, sama dengan layanan; tanggal UTC tertinggal sehari pukul 00.00-07.00 WIB.
const HARI = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const BULAN = HARI.slice(0, 7);

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
  async function unggah(token, purpose, entityId) {
    const minta = await api('POST', '/api/uploads', token, { purpose, entityId, fileName: 'berkas.pdf', contentType: 'application/pdf', size: PDF.length });
    if (minta.status !== 201) return { gagal: minta.status };
    const kirim = await fetch(`${baseUrl}/api/uploads/${minta.body.upload.id}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: PDF });
    assert.equal(kirim.status < 300, true);
    return { id: minta.body.upload.id };
  }

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
    await akun('Keuangan', 'uang@uji.test', 'finance');
    await akun('Wali', 'wali@uji.test', 'parent');
    await api('POST', `/api/dormitories/${A.id}/staff/${mA.id}`, admin);
    await api('POST', `/api/dormitories/${B.id}/staff/${mB.id}`, admin);
    const mk = async (nama, asrama) => (await api('POST', '/api/students', admin, { name: nama, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01', dormitoryId: asrama.id })).body.student;
    const donatur = await mk('Santri Donatur', A);
    const donatur2 = await mk('Santri Donatur Dua', A);
    const teman = await mk('Santri Sekamar', A);
    const tA = await masuk('a@uji.test');
    const tB = await masuk('b@uji.test');
    const tUang = await masuk('uang@uji.test');
    const tWali = await masuk('wali@uji.test');

    // ------------------------------------------------------------ inventaris
    assert.equal((await api('GET', '/api/inventaris/asrama', tUang)).status, 403);
    assert.equal((await api('GET', '/api/inventaris/asrama', tWali)).status, 403);
    assert.deepEqual((await api('GET', '/api/inventaris/asrama', tA)).body.items.map((d) => d.name), ['Asrama A'], 'Musyrif hanya melihat asramanya.');
    assert.equal((await api('GET', `/api/inventaris/asrama/${A.id}/aset`, tB)).status, 403);

    const foto = await unggah(tA, 'inventory-file', A.id);
    assert.ok(foto.id, 'Musyrif A mengunggah foto aset asramanya.');
    assert.ok((await unggah(tB, 'inventory-file', A.id)).gagal, 'Musyrif B tidak boleh mengunggah ke asrama A.');
    assert.ok((await unggah(tWali, 'inventory-file', A.id)).gagal);
    const fotoB = await unggah(tB, 'inventory-file', B.id);

    const buat = (token, asrama, body) => api('POST', `/api/inventaris/asrama/${asrama.id}/aset`, token, body);
    assert.equal((await buat(tA, A, { name: 'K', quantity: 1 })).status, 422);
    assert.equal((await buat(tA, A, { name: 'Kipas angin', quantity: -2 })).status, 422);
    assert.equal((await buat(tA, A, { name: 'Kipas angin', quantity: 2, category: 'ngawur' })).status, 422);
    assert.equal((await buat(tA, A, { name: 'Kipas angin', quantity: 2, purchasedOn: '2999-01-01' })).status, 422);
    assert.equal((await buat(tA, A, { name: 'Kipas angin', quantity: 2, photoFileId: fotoB.id })).status, 422, 'Foto asrama lain ditolak.');
    assert.equal((await buat(tB, A, { name: 'Kipas angin', quantity: 2 })).status, 403);
    const kipas = await buat(tA, A, { name: 'Kipas angin', quantity: 4, category: 'elektronik', location: 'Kamar 1', purchasedOn: '2026-03-01', unitPrice: 250000, photoFileId: foto.id, proofFileId: foto.id });
    assert.equal(kipas.status, 201, kipas.teks);
    assert.equal(kipas.body.code, 'ELK-001', 'Kode aset otomatis per kategori.');
    assert.equal(kipas.body.value, 1000000);
    const lemari = await buat(tA, A, { name: 'Lemari', quantity: 6, category: 'furnitur' });
    assert.equal(lemari.body.code, 'FRN-001');
    const kipas2 = await buat(tA, A, { name: 'Kipas dinding', quantity: 1, category: 'elektronik' });
    assert.equal(kipas2.body.code, 'ELK-002');
    assert.equal((await buat(tA, A, { name: 'Setrika', quantity: 1, category: 'elektronik', code: 'elk-001' })).status, 409, 'Kode kembar ditolak.');
    const buatKode = await buat(tA, A, { name: 'Setrika', quantity: 1, category: 'elektronik', code: 'ELK-900' });
    assert.equal(buatKode.body.code, 'ELK-900');
    const asetB = await buat(tB, B, { name: 'Rak sepatu', quantity: 3, category: 'furnitur' });
    assert.equal(asetB.status, 201);

    // Daftar dan saringan.
    const daftar = await api('GET', `/api/inventaris/asrama/${A.id}/aset?category=elektronik`, tA);
    assert.equal(daftar.body.items.length, 3);
    assert.equal((await api('GET', `/api/inventaris/asrama/${A.id}/aset?q=lemari`, tA)).body.items.length, 1);
    assert.equal(daftar.body.totals.value >= 1000000, true);

    // Riwayat: kejadian dan perubahan kondisi tercatat.
    const aset = (id, bagian = '') => `/api/inventaris/asrama/${A.id}/aset/${id}${bagian}`;
    let riwayat = await api('GET', aset(kipas.body.id, '/riwayat'), tA);
    assert.equal(riwayat.body.events.length, 1, 'Pembelian tercatat saat aset dibuat.');
    assert.equal(riwayat.body.events[0].kind, 'pembelian');
    assert.equal((await api('POST', aset(kipas.body.id, '/riwayat'), tA, { kind: 'ngawur', note: 'Catatan yang cukup panjang.' })).status, 422);
    assert.equal((await api('POST', aset(kipas.body.id, '/riwayat'), tA, { kind: 'perawatan', note: 'x' })).status, 422);
    assert.equal((await api('POST', aset(kipas.body.id, '/riwayat'), tB, { kind: 'perawatan', note: 'Servis rutin kipas.' })).status, 403);
    assert.equal((await api('POST', aset(kipas.body.id, '/riwayat'), tA, { kind: 'perawatan', note: 'Servis rutin kipas.', costRupiah: 50000, occurredOn: HARI })).status, 201);
    const rusak = await api('POST', aset(kipas.body.id, '/riwayat'), tA, { kind: 'kerusakan', note: 'Baling-baling patah di kamar 1.' });
    assert.equal(rusak.body.condition, 'rusak', 'Kejadian kerusakan mengubah kondisi aset.');
    const baik = await api('PATCH', aset(kipas.body.id), tA, { condition: 'baik', eventNote: 'Sudah diganti baling-balingnya.' });
    assert.equal(baik.status, 200, baik.teks);
    riwayat = await api('GET', aset(kipas.body.id, '/riwayat'), tA);
    assert.deepEqual(riwayat.body.events.map((e) => e.kind).sort(), ['kerusakan', 'pembelian', 'perawatan', 'perbaikan']);

    // Pemeriksaan bulanan oleh musyrif.
    assert.equal((await api('POST', `/api/inventaris/asrama/${A.id}/pemeriksaan`, tB, { month: BULAN })).status, 403);
    assert.equal((await api('POST', `/api/inventaris/asrama/${A.id}/pemeriksaan`, tA, { month: '2999-01' })).status, 422);
    const cek = await api('POST', `/api/inventaris/asrama/${A.id}/pemeriksaan`, tA, { month: BULAN });
    assert.equal(cek.status, 201, cek.teks);
    assert.equal(cek.body.total, 4);
    assert.equal(cek.body.checked, 0);
    assert.equal((await api('POST', `/api/inventaris/asrama/${A.id}/pemeriksaan`, tA, { month: BULAN })).body.id, cek.body.id, 'Pemeriksaan bulan yang sama dibuka kembali, bukan digandakan.');
    assert.equal((await api('POST', `/api/inventaris/pemeriksaan/${cek.body.id}/selesai`, tA, {})).status, 409, 'Belum semua aset diperiksa.');
    assert.equal((await api('PUT', `/api/inventaris/pemeriksaan/${cek.body.id}`, tB, { entries: [] })).status, 404);
    assert.equal((await api('PUT', `/api/inventaris/pemeriksaan/${cek.body.id}`, tA, { entries: [{ itemId: kipas.body.id, foundQuantity: -1, foundCondition: 'baik' }] })).status, 422);
    assert.equal((await api('PUT', `/api/inventaris/pemeriksaan/${cek.body.id}`, tA, { entries: [{ itemId: kipas.body.id, foundQuantity: 3, foundCondition: 'hilang' }] })).status, 422, 'Hilang tapi ditemukan?');
    const entri = cek.body.items.map((i) => {
      if (i.itemId === kipas.body.id) return { itemId: i.itemId, foundQuantity: 3, foundCondition: 'baik', note: 'Satu kipas tidak ada.' };
      if (i.itemId === lemari.body.id) return { itemId: i.itemId, foundQuantity: 6, foundCondition: 'rusak', note: 'Pintu lemari lepas.' };
      return { itemId: i.itemId, foundQuantity: i.expectedQuantity, foundCondition: i.expectedCondition };
    });
    const simpan = await api('PUT', `/api/inventaris/pemeriksaan/${cek.body.id}`, tA, { entries: entri });
    assert.equal(simpan.status, 200, simpan.teks);
    assert.equal(simpan.body.checked, 4);
    const selesai = await api('POST', `/api/inventaris/pemeriksaan/${cek.body.id}/selesai`, tA, { note: 'Pemeriksaan rutin.' });
    assert.equal(selesai.status, 200, selesai.teks);
    assert.equal(selesai.body.adjusted, 2);
    assert.equal(selesai.body.status, 'selesai');
    const sesudah = (await api('GET', `/api/inventaris/asrama/${A.id}/aset`, tA)).body.items;
    assert.equal(sesudah.find((i) => i.id === kipas.body.id).quantity, 3, 'Jumlah disesuaikan dengan hasil pemeriksaan.');
    assert.equal(sesudah.find((i) => i.id === lemari.body.id).condition, 'rusak');
    const riwayatKipas = await api('GET', aset(kipas.body.id, '/riwayat'), tA);
    assert.ok(riwayatKipas.body.events.some((e) => e.kind === 'kehilangan' && /Pemeriksaan/.test(e.note)));
    assert.equal((await api('PUT', `/api/inventaris/pemeriksaan/${cek.body.id}`, tA, { entries: entri })).status, 409, 'Pemeriksaan selesai terkunci.');
    assert.equal((await api('GET', `/api/inventaris/asrama/${A.id}/pemeriksaan/${BULAN}`, tA)).body.status, 'selesai');

    // Pengarsipan: butuh alasan, hanya musyrif asrama itu, aset hilang dari daftar tetapi tidak dihapus.
    const sementara = await buat(tA, A, { name: 'Cermin salah catat', category: 'lainnya', quantity: 1 });
    assert.equal(sementara.status, 201, sementara.teks);
    assert.equal((await api('POST', aset(sementara.body.id, '/arsip'), tA, { reason: 'x' })).status, 422);
    assert.equal((await api('POST', aset(sementara.body.id, '/arsip'), tB, { reason: 'Salah catat dobel.' })).status, 403);
    assert.equal((await api('POST', aset(sementara.body.id, '/arsip'), tA, { reason: 'Salah catat dobel.' })).status, 200);
    assert.equal((await api('POST', aset(sementara.body.id, '/arsip'), tA, { reason: 'Salah catat dobel.' })).status, 404, 'Sudah diarsipkan.');
    assert.ok(!(await api('GET', `/api/inventaris/asrama/${A.id}/aset`, tA)).body.items.some((i) => i.id === sementara.body.id));
    assert.equal((await database.query('SELECT count(*)::int AS n FROM inventory_events WHERE item_id = $1', [sementara.body.id])).rows[0].n, 1, 'Riwayat tetap tersimpan.');
    assert.equal((await api('GET', `/api/inventaris/asrama/${A.id}/pemeriksaan/${BULAN}`, tB)).status, 403);

    // Dashboard per asrama, terbatas pada cakupan.
    const dasbor = await api('GET', '/api/inventaris/dashboard', admin);
    assert.equal(dasbor.status, 200);
    const barisA = dasbor.body.items.find((i) => i.name === 'Asrama A');
    assert.equal(barisA.itemTypes, 4);
    assert.equal(barisA.damaged, 6);
    assert.equal(barisA.thisMonthCheck, 'selesai');
    assert.equal(barisA.checkDue, false);
    assert.equal(dasbor.body.items.find((i) => i.name === 'Asrama B').checkDue, true, 'Asrama B belum diperiksa bulan ini.');
    assert.deepEqual((await api('GET', '/api/inventaris/dashboard', tB)).body.items.map((i) => i.name), ['Asrama B']);

    // ------------------------------------------------------------ AC patungan
    assert.equal((await api('GET', '/api/ac/unit', tWali)).status, 403);
    assert.equal((await api('POST', '/api/ac/unit', tA, { dormitoryId: A.id, label: 'AC Kamar 1', ownership: 'hamasah' })).status, 403, 'Musyrif tidak membuat AC.');
    assert.equal((await api('POST', '/api/ac/unit', tUang, { dormitoryId: A.id, label: 'AC Kamar 1', ownership: 'patungan', purchaseTotal: 4000000 })).status, 422, 'AC patungan wajib memuat ketentuan pengembalian.');
    const bukti = await unggah(tUang, 'ac-proof', A.id);
    assert.ok(bukti.id);
    assert.ok((await unggah(tA, 'ac-proof', A.id)).gagal, 'Musyrif tidak mengunggah bukti keuangan AC.');
    const unit = await api('POST', '/api/ac/unit', tUang, { dormitoryId: A.id, label: 'AC Kamar 1', ownership: 'patungan', purchaseTotal: 4000000, installTotal: 600000, purchasedOn: '2026-05-01', proofFileId: bukti.id, refundPurchase: true, refundInstall: false, terms: 'Kontribusi pembelian dikembalikan penuh bila santri keluar sebelum 12 bulan. Biaya pemasangan tidak dikembalikan.' });
    assert.equal(unit.status, 201, unit.teks);
    const milikHamasah = await api('POST', '/api/ac/unit', admin, { dormitoryId: A.id, label: 'AC Ruang Tamu', ownership: 'hamasah', purchaseTotal: 5000000 });
    assert.equal(milikHamasah.status, 201);
    assert.equal(milikHamasah.body.ownership, 'hamasah');

    // Musyrif melihat daftar AC asramanya tanpa data keuangan per santri.
    const lihatMusyrif = await api('GET', '/api/ac/unit', tA);
    assert.equal(lihatMusyrif.status, 200);
    assert.equal(lihatMusyrif.body.items.length, 2);
    assert.equal(lihatMusyrif.body.canManage, false);
    assert.equal(lihatMusyrif.body.items[0].purchaseCollected, undefined);
    assert.equal((await api('GET', `/api/ac/unit/${unit.body.id}/kontribusi`, tA)).status, 403);
    assert.equal((await api('GET', '/api/ac/unit', tB)).body.items.length, 0);

    // Kontribusi: dibedakan antara pembelian dan pemasangan, hanya AC patungan, hanya penghuni asrama itu.
    const kontribusi = (token, id, body) => api('POST', `/api/ac/unit/${id}/kontribusi`, token, body);
    assert.equal((await kontribusi(tA, unit.body.id, { studentId: donatur.id, kind: 'pembelian', amount: 100, paidOn: HARI })).status, 403);
    assert.equal((await kontribusi(tUang, milikHamasah.body.id, { studentId: donatur.id, kind: 'pembelian', amount: 100000, paidOn: HARI })).status, 409);
    assert.equal((await kontribusi(tUang, unit.body.id, { studentId: donatur.id, kind: 'lain', amount: 100000, paidOn: HARI })).status, 422);
    assert.equal((await kontribusi(tUang, unit.body.id, { studentId: donatur.id, kind: 'pembelian', amount: 0, paidOn: HARI })).status, 422);
    assert.equal((await kontribusi(tUang, unit.body.id, { studentId: asetB.body.id, kind: 'pembelian', amount: 100000, paidOn: HARI })).status, 422);
    const santriB = await mk('Santri Asrama B', B);
    assert.equal((await kontribusi(tUang, unit.body.id, { studentId: santriB.id, kind: 'pembelian', amount: 100000, paidOn: HARI })).status, 422, 'Santri asrama lain tidak berkontribusi.');
    assert.equal((await kontribusi(tUang, unit.body.id, { studentId: donatur.id, kind: 'pembelian', amount: 5000000, paidOn: HARI })).status, 422, 'Melebihi total pembelian.');
    const k1 = await kontribusi(tUang, unit.body.id, { studentId: donatur.id, kind: 'pembelian', amount: 1500000, paidOn: '2026-05-02', proofFileId: bukti.id });
    assert.equal(k1.status, 201, k1.teks);
    assert.equal((await kontribusi(tUang, unit.body.id, { studentId: donatur.id, kind: 'pemasangan', amount: 200000, paidOn: '2026-05-02' })).status, 201);
    assert.equal((await kontribusi(tUang, unit.body.id, { studentId: donatur2.id, kind: 'pembelian', amount: 1000000, paidOn: '2026-05-03' })).status, 201);
    const rinci = await api('GET', `/api/ac/unit/${unit.body.id}/kontribusi`, tUang);
    assert.equal(rinci.body.items.length, 3);
    assert.equal(rinci.body.unit.purchaseCollected, 2500000);
    assert.equal(rinci.body.unit.installCollected, 200000);
    assert.equal(rinci.body.unit.contributors, 2);

    // Hak refund: hanya yang berkontribusi; santri aktif belum bisa; teman sekamar tidak berhak.
    const preview = await api('GET', `/api/ac/santri/${donatur.id}/refund`, tUang);
    assert.equal(preview.body.left, false);
    assert.equal(preview.body.entitlements[0].eligibleAmount, 1500000, 'Hanya pembelian yang dikembalikan menurut ketentuan; pemasangan tidak.');
    const temanPreview = await api('GET', `/api/ac/santri/${teman.id}/refund`, tUang);
    assert.equal(temanPreview.body.entitlements.length, 0);
    assert.match(temanPreview.body.note, /tidak otomatis berhak/);
    assert.equal((await api('POST', `/api/ac/santri/${donatur.id}/refund`, tUang, {})).status, 409, 'Santri masih aktif.');
    // Santri keluar (mengundurkan diri) lewat pengubahan status oleh admin.
    assert.equal((await api('PATCH', `/api/students/${donatur.id}`, admin, { status: 'withdrawn' })).status, 200);
    assert.equal((await api('PATCH', `/api/students/${teman.id}`, admin, { status: 'withdrawn' })).status, 200);
    const temanRefund = await api('POST', `/api/ac/santri/${teman.id}/refund`, tUang, {});
    assert.equal(temanRefund.status, 409);
    assert.match(temanRefund.body.error, /tidak berhak atas pengembalian dana/);
    assert.equal((await api('POST', `/api/ac/santri/${donatur.id}/refund`, tA, {})).status, 403);
    const ajukan = await api('POST', `/api/ac/santri/${donatur.id}/refund`, tUang, {});
    assert.equal(ajukan.status, 201, ajukan.teks);
    assert.equal(ajukan.body.items.length, 1);
    assert.equal(ajukan.body.items[0].eligibleAmount, 1500000);
    assert.equal(ajukan.body.items[0].status, 'diajukan');
    assert.equal((await api('POST', `/api/ac/santri/${donatur.id}/refund`, tUang, {})).status, 409, 'Tidak diajukan dua kali.');
    const refundId = ajukan.body.items[0].id;
    assert.equal((await api('POST', `/api/ac/unit/${unit.body.id}/kontribusi`, tUang, { studentId: donatur2.id, kind: 'pembelian', amount: 100000, paidOn: HARI })).status, 201);
    const batalKontribusi = await api('POST', `/api/ac/kontribusi/${k1.body.id}/batal`, tUang, { reason: 'Salah catat santri.' });
    assert.equal(batalKontribusi.status, 409, 'Kontribusi yang sudah diajukan refund tidak bisa dibatalkan.');

    // Persetujuan oleh admin dengan batas hak; pencairan butuh bukti.
    assert.equal((await api('POST', `/api/ac/refund/${refundId}/cairkan`, tUang, { disbursedOn: HARI, proofFileId: bukti.id })).status, 409, 'Harus disetujui dulu.');
    assert.equal((await api('POST', `/api/ac/refund/${refundId}/putusan`, tUang, { decision: 'disetujui' })).status, 403, 'Hanya admin menyetujui.');
    assert.equal((await api('POST', `/api/ac/refund/${refundId}/putusan`, admin, { decision: 'disetujui', approvedAmount: 2000000 })).status, 422, 'Tidak boleh melebihi hak.');
    assert.equal((await api('POST', `/api/ac/refund/${refundId}/putusan`, admin, { decision: 'disetujui', approvedAmount: 1000000 })).status, 422, 'Nominal lebih kecil wajib beralasan.');
    const setuju = await api('POST', `/api/ac/refund/${refundId}/putusan`, admin, { decision: 'disetujui', approvedAmount: 1200000, note: 'Dipotong biaya pemakaian 300 ribu sesuai ketentuan.' });
    assert.equal(setuju.status, 200, setuju.teks);
    assert.equal(setuju.body.approvedAmount, 1200000);
    assert.equal((await api('POST', `/api/ac/refund/${refundId}/putusan`, admin, { decision: 'ditolak', note: 'Sudah diputuskan.' })).status, 409);
    assert.equal((await api('POST', `/api/ac/refund/${refundId}/cairkan`, tUang, { disbursedOn: HARI })).status, 422, 'Bukti pencairan wajib.');
    const cair = await api('POST', `/api/ac/refund/${refundId}/cairkan`, tUang, { disbursedOn: HARI, proofFileId: bukti.id });
    assert.equal(cair.status, 200, cair.teks);
    assert.equal(cair.body.status, 'dicairkan');
    assert.equal((await api('GET', '/api/ac/refund?status=dicairkan', tUang)).body.items.length, 1);

    // Daftar periksa keluar (surat dan arsip): refund AC tidak boleh dilewati bila santri punya hak yang belum diajukan.
    const jenisSurat = (await api('GET', '/api/surat/jenis', admin)).body.items.find((j) => j.exitFlow);
    const suratDonatur2 = await api('POST', '/api/surat', admin, { typeId: jenisSurat.id, studentId: donatur2.id, subject: 'Permohonan mundur Donatur Dua' });
    assert.equal(suratDonatur2.status, 201, suratDonatur2.teks);
    const detailDonatur2 = await api('GET', `/api/surat/${suratDonatur2.body.id}`, admin);
    const petunjukAc = detailDonatur2.body.exitChecklist.items.find((b) => b.kind === 'refund-ac');
    assert.match(petunjukAc.hint, /berkontribusi pada 1 AC patungan/);
    const lewati = await api('PATCH', `/api/surat/${suratDonatur2.body.id}/daftar-keluar/refund-ac`, admin, { status: 'tidak-berlaku', note: 'Dianggap tidak berlaku.' });
    assert.equal(lewati.status, 409);
    assert.match(lewati.body.error, /hak refund yang belum diajukan/);
    const suratTeman = await api('POST', '/api/surat', admin, { typeId: jenisSurat.id, studentId: teman.id, subject: 'Permohonan mundur Teman Sekamar' });
    const tanpaHak = await api('PATCH', `/api/surat/${suratTeman.body.id}/daftar-keluar/refund-ac`, admin, { status: 'tidak-berlaku', note: 'Tidak berkontribusi AC.' });
    assert.equal(tanpaHak.status, 200, 'Santri tanpa kontribusi boleh dinyatakan tidak berlaku.');
    assert.match((await api('GET', `/api/surat/${suratTeman.body.id}`, admin)).body.exitChecklist.items.find((b) => b.kind === 'refund-ac').hint, /tidak punya kontribusi AC patungan/);

    console.log('inventory and ac tests passed');
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
