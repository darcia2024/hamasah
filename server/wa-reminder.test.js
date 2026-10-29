// Pengingat tagihan WhatsApp: hanya tagihan belum lunas, filter periode dan jatuh tempo, templat yang bisa diedit, chat dicatat
// "dibuka" (bukan terkirim), target per bulan dan jarak minimum antar pengingat, tagihan yang sudah dibayar keluar dari pesan.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-pengingat';

async function run() {
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
    const wali1 = await akun('Wali Satu', 'wali1@uji.test', 'parent');
    const wali2 = await akun('Wali Dua', 'wali2@uji.test', 'parent');
    await akun('Keuangan', 'uang@uji.test', 'finance');
    await akun('Musyrif', 'musyrif@uji.test', 'supervisor');
    const mk = async (nama, wali) => {
      const s = (await api('POST', '/api/students', admin, { name: nama, program: 'Kuliah S1', city: 'Kairo', joinDate: '2026-01-01' })).body.student;
      await api('PATCH', `/api/students/${s.id}/accounts`, admin, { parentAccountIds: [wali.id] });
      return s;
    };
    const anak1 = await mk('Anak Satu', wali1);
    const anak2 = await mk('Anak Dua', wali2);
    const tUang = await masuk('uang@uji.test');
    const tMusyrif = await masuk('musyrif@uji.test');
    const tWali = await masuk('wali1@uji.test');

    const buat = async (studentId, deskripsi, jumlah) => (await api('POST', '/api/operations/invoices', admin, { studentId, description: deskripsi, amount: jumlah })).body.invoice;
    const i1 = await buat(anak1.id, 'SPP Oktober', 1500000);
    const i2 = await buat(anak1.id, 'Biaya buku', 250000);
    const i3 = await buat(anak2.id, 'SPP Oktober', 1500000);
    assert.ok(i1 && i2 && i3);

    // Hak akses.
    assert.equal((await api('GET', '/api/pengingat-tagihan', tMusyrif)).status, 403);
    assert.equal((await api('GET', '/api/pengingat-tagihan', tWali)).status, 403);
    assert.equal((await api('POST', `/api/pengingat-tagihan/wali/${wali1.id}/buka`, tMusyrif, {})).status, 403);

    // Daftar wali dengan tagihan belum lunas.
    const daftar = await api('GET', '/api/pengingat-tagihan', tUang);
    assert.equal(daftar.status, 200, daftar.teks);
    assert.equal(daftar.body.items.length, 2);
    const w1 = daftar.body.items.find((w) => w.parentId === wali1.id);
    assert.equal(w1.invoices.length, 2);
    assert.equal(w1.total, 1750000);
    assert.equal(w1.remindersThisMonth, 0);
    assert.equal(w1.quotaRemaining, 3);
    assert.equal(w1.hasPhone, false);

    // Jatuh tempo: bawaan terbit + 14 hari; dapat diatur; filter.
    assert.equal((await api('GET', '/api/pengingat-tagihan?due=lewat', tUang)).body.items.length, 0, 'Belum ada yang lewat jatuh tempo.');
    assert.equal((await api('GET', '/api/pengingat-tagihan?due=belum-diatur', tUang)).body.items.length, 2);
    assert.equal((await api('PATCH', `/api/pengingat-tagihan/tagihan/${i1.id}/jatuh-tempo`, tMusyrif, { dueOn: '2026-01-01' })).status, 403);
    assert.equal((await api('PATCH', `/api/pengingat-tagihan/tagihan/${i1.id}/jatuh-tempo`, tUang, { dueOn: '2026-02-31' })).status, 422);
    assert.equal((await api('PATCH', `/api/pengingat-tagihan/tagihan/${i1.id}/jatuh-tempo`, tUang, { dueOn: '2026-01-10' })).status, 200);
    const lewat = await api('GET', '/api/pengingat-tagihan?due=lewat', tUang);
    assert.equal(lewat.body.items.length, 1);
    assert.equal(lewat.body.items[0].parentId, wali1.id);
    assert.equal(lewat.body.items[0].invoices.length, 1, 'Hanya tagihan yang lewat yang masuk saringan.');
    assert.ok(lewat.body.items[0].maxDaysLate > 0);
    const periodeIni = new Date().toISOString().slice(0, 7);
    assert.equal((await api('GET', `/api/pengingat-tagihan?period=${periodeIni}`, tUang)).body.items.length, 2);
    assert.equal((await api('GET', '/api/pengingat-tagihan?period=2020-01', tUang)).body.items.length, 0);
    assert.equal((await api('GET', '/api/pengingat-tagihan?period=oktober', tUang)).status, 422);
    assert.equal((await api('GET', '/api/pengingat-tagihan?q=dua', tUang)).body.items.length, 1);

    // Templat: dapat diedit dan divalidasi.
    const aturan = await api('GET', '/api/pengingat-tagihan/pengaturan', tUang);
    assert.ok(aturan.body.config.template.includes('{daftar_tagihan}'));
    assert.equal((await api('PUT', '/api/pengingat-tagihan/pengaturan', tUang, { template: 'Pesan tanpa rincian tagihan sama sekali ya.' })).status, 422);
    assert.equal((await api('PUT', '/api/pengingat-tagihan/pengaturan', tUang, { template: 'Halo {nama_wali}, ada {rahasia} tagihan: {daftar_tagihan}' })).status, 422, 'Variabel asing ditolak.');
    assert.equal((await api('PUT', '/api/pengingat-tagihan/pengaturan', tUang, { monthlyTarget: 0 })).status, 422);
    assert.equal((await api('PUT', '/api/pengingat-tagihan/pengaturan', tUang, { template: 'Assalamu\'alaikum {nama_wali}, tagihan {nama_santri}:\n{daftar_tagihan}\nTotal {total}. {jatuh_tempo} Bayar di {tautan_bayar}', minGapDays: 7, monthlyTarget: 3 })).status, 200);

    // Pratinjau tidak mencatat apa pun; isi pesan sesuai tagihan.
    const lihat = await api('POST', `/api/pengingat-tagihan/wali/${wali1.id}/pratinjau`, tUang, {});
    assert.equal(lihat.status, 200, lihat.teks);
    assert.match(lihat.body.message, /Wali Satu/);
    assert.match(lihat.body.message, /SPP Oktober/);
    assert.match(lihat.body.message, /Biaya buku/);
    assert.match(lihat.body.message, /Rp\s?1\.750\.000/);
    assert.match(lihat.body.message, /sudah melewati jatuh tempo/);
    assert.match(lihat.body.message, /https:\/\/hamasah\.test\/portal/);
    assert.equal((await api('GET', '/api/pengingat-tagihan/riwayat', tUang)).body.items.length, 0, 'Pratinjau tidak dicatat.');

    // Buka chat: dicatat "dibuka", bukan terkirim.
    const buka = await api('POST', `/api/pengingat-tagihan/wali/${wali1.id}/buka`, tUang, {});
    assert.equal(buka.status, 200, buka.teks);
    assert.match(buka.body.url, /^https:\/\/wa\.me\//);
    assert.equal(buka.body.requiresContactSelection, true, 'Tanpa nomor, petugas memilih kontak sendiri.');
    assert.equal(buka.body.invoiceCount, 2);
    const riwayat = await api('GET', '/api/pengingat-tagihan/riwayat', tUang);
    assert.equal(riwayat.body.items.length, 1);
    assert.equal(riwayat.body.items[0].status, 'dibuka');
    assert.equal(riwayat.body.items[0].statusLabel, 'Chat dibuka');
    // Jarak minimum: pengingat kedua langsung ditolak; admin boleh memaksa.
    const lagi = await api('POST', `/api/pengingat-tagihan/wali/${wali1.id}/buka`, tUang, {});
    assert.equal(lagi.status, 429);
    assert.match(lagi.body.error, /Tunggu/);
    assert.equal((await api('POST', `/api/pengingat-tagihan/wali/${wali1.id}/buka`, tUang, { force: true })).status, 429, 'Keuangan tidak boleh memaksa.');
    assert.equal((await api('POST', `/api/pengingat-tagihan/wali/${wali1.id}/buka`, admin, { force: true })).status, 200, 'Admin boleh melampaui jarak minimum.');
    const sesudah = (await api('GET', '/api/pengingat-tagihan', tUang)).body.items.find((w) => w.parentId === wali1.id);
    assert.equal(sesudah.remindersThisMonth, 2);
    assert.equal(sesudah.quotaRemaining, 1);
    assert.equal(sesudah.allowed, false);
    assert.ok(sesudah.lastReminderAt);

    // Konfirmasi terkirim oleh petugas.
    assert.equal((await api('POST', `/api/pengingat-tagihan/riwayat/${buka.body.batchId}/terkirim`, tMusyrif)).status, 403);
    assert.equal((await api('POST', `/api/pengingat-tagihan/riwayat/${buka.body.batchId}/terkirim`, tUang)).status, 200);
    assert.equal((await api('POST', `/api/pengingat-tagihan/riwayat/${buka.body.batchId}/terkirim`, tUang)).status, 404, 'Sudah dikonfirmasi.');
    assert.equal((await api('GET', `/api/pengingat-tagihan/riwayat?parentId=${wali1.id}`, tUang)).body.items.find((r) => r.batchId === buka.body.batchId).status, 'terkirim-dikonfirmasi');

    // Tagihan yang sudah dibayar keluar dari daftar dan pesan.
    assert.equal((await api('PATCH', `/api/operations/invoices/${i2.id}/paid`, admin, {})).status, 200);
    const setelahBayar = (await api('GET', '/api/pengingat-tagihan', tUang)).body.items.find((w) => w.parentId === wali1.id);
    assert.equal(setelahBayar.invoices.length, 1);
    assert.equal(setelahBayar.total, 1500000);
    const pesanBaru = await api('POST', `/api/pengingat-tagihan/wali/${wali1.id}/pratinjau`, tUang, { invoiceIds: [i1.id, i2.id] });
    assert.doesNotMatch(pesanBaru.body.message, /Biaya buku/, 'Tagihan lunas tidak ikut dalam pesan walau diminta.');
    // Semua lunas: tidak ada yang diingatkan.
    assert.equal((await api('PATCH', `/api/operations/invoices/${i1.id}/paid`, admin, {})).status, 200);
    assert.equal((await api('GET', '/api/pengingat-tagihan', tUang)).body.items.some((w) => w.parentId === wali1.id), false);
    const kosong = await api('POST', `/api/pengingat-tagihan/wali/${wali1.id}/buka`, admin, { force: true });
    assert.equal(kosong.status, 409);
    assert.match(kosong.body.error, /tidak punya tagihan yang belum lunas/);

    // Wali kedua masih punya kuota penuh; target per bulan ditegakkan.
    for (let i = 0; i < 3; i += 1) {
      const hasil = await api('POST', `/api/pengingat-tagihan/wali/${wali2.id}/buka`, admin, { force: true });
      assert.equal(hasil.status, 200, hasil.teks);
    }
    const penuh = await api('POST', `/api/pengingat-tagihan/wali/${wali2.id}/buka`, tUang, {});
    assert.equal(penuh.status, 429);
    assert.match(penuh.body.error, /3 kali bulan ini/);

    console.log('wa reminder tests passed');
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
