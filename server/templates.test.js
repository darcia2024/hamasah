// Template (halaman Template super admin): bawaan sama dengan teks lama, validasi isian,
// pemakaian di pesan WhatsApp, email, dan PDF, serta alur HTTP (izin, simpan, kembalikan).
const assert = require('node:assert/strict');
const path = require('node:path');
const { BAWAAN, BLOK, periksaBlok, dokumenWajib, isiTeks } = require('./templates.js');
const { eventMessage } = require('./notification-templates.js');
const { createReceiptPdf } = require('./receipt-pdf.js');
const { pdfLiteral } = require('./pdf.js');
const wa = require('../website/whatsapp-message.js');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const SANDI = 'kata-sandi-uji-template';

function salin(nilai) {
  return JSON.parse(JSON.stringify(nilai));
}

function ujiBawaan() {
  for (const blok of BLOK) {
    const hasil = periksaBlok(blok, salin(BAWAAN[blok]));
    assert.equal(hasil.ok, true, `BAWAAN ${blok} harus lolos validasi: ${hasil.error}`);
    assert.deepEqual(hasil.nilai, BAWAAN[blok], `BAWAAN ${blok} tidak berubah oleh validasi.`);
  }
  // Template WhatsApp bawaan di server sama dengan yang dipakai peramban.
  assert.deepEqual(BAWAAN.whatsapp.status, { ...wa.STATUS_MESSAGES });
  assert.deepEqual(BAWAAN.whatsapp, JSON.parse(JSON.stringify(wa.DEFAULT_TEMPLATE)));
  for (const [kunci, label] of Object.entries(wa.DOCUMENT_LABELS)) assert.equal(BAWAAN.dokumen[kunci].label, label);
  assert.deepEqual(dokumenWajib(BAWAAN.dokumen), ['passport', 'diploma', 'transcript', 'health-certificate', 'photo']);
}

function ujiValidasi() {
  const w = salin(BAWAAN.whatsapp);
  w.status.submitted = 'Halo {nma}, data sudah masuk.';
  const salah = periksaBlok('whatsapp', w);
  assert.equal(salah.ok, false);
  assert.equal(salah.bidang, 'status.submitted');
  assert.match(salah.error, /\{nma\} tidak dikenal.*\{nama\}, \{nomor\}/);
  assert.equal(periksaBlok('whatsapp', { ...salin(BAWAAN.whatsapp), cekStatus: 'Lihat di halaman cek status.' }).bidang, 'cekStatus', '{tautan} wajib.');

  const e = salin(BAWAAN.email);
  e.jenis['invoice-issued'].pembuka = 'Tagihan {nomor} terbit.';
  assert.equal(periksaBlok('email', e).bidang, 'jenis.invoice-issued.pembuka', 'Isian milik jenis lain ditolak.');

  const k = salin(BAWAAN.kop);
  k.rekening = [{ bank: 'BSI', nomor: '7123-abc', atasNama: 'Yayasan Hamasah' }];
  assert.equal(periksaBlok('kop', k).bidang, 'rekening.0.nomor');
  k.rekening = Array.from({ length: 5 }, () => ({ bank: 'BSI', nomor: '7123456789', atasNama: 'Yayasan Hamasah' }));
  assert.equal(periksaBlok('kop', k).bidang, 'rekening');

  const d = salin(BAWAAN.dokumen);
  Object.values(d).forEach((item) => { item.wajib = false; });
  assert.equal(periksaBlok('dokumen', d).ok, false, 'Minimal satu dokumen wajib.');

  assert.equal(isiTeks('Halo {nama}, {x}', { nama: 'A' }), 'Halo A, {x}');
}

function ujiPemakaian() {
  // Email bawaan tetap sama isinya dengan sebelum template ada.
  const lama = eventMessage('registration-status', { name: 'Calon', registrationId: 'HI-REG-2026-00001', status: 'document-review', statusLabel: 'Pemeriksaan berkas' }, 'https://app.test');
  assert.equal(lama.subject, 'Status pendaftaran HI-REG-2026-00001: Pemeriksaan berkas');
  assert.ok(lama.html.includes('Status pendaftaran <strong>HI-REG-2026-00001</strong> kini <strong>Pemeriksaan berkas</strong>.'));

  // Email dengan template admin: teks admin di-escape, nilai isian ditebalkan, rekening ikut.
  const email = salin(BAWAAN.email);
  email.salam = 'Yth. {nama},';
  email.jenis['invoice-issued'] = { judul: 'Tagihan {tagihan} <penting>', pembuka: 'Ada tagihan {keterangan}{atasNama} sebesar {jumlah}.' };
  const kop = { ...salin(BAWAAN.kop), rekening: [{ bank: 'BSI', nomor: '7123456789', atasNama: 'Yayasan Hamasah' }] };
  const tagihan = eventMessage('invoice-issued', { name: 'Wali <b>', studentName: 'Santri', invoiceNumber: 'INV/1', description: 'SPP', amount: 1500000 }, 'https://app.test', { email, kop });
  assert.equal(tagihan.subject, 'Tagihan INV/1 <penting>', 'Judul email teks biasa.');
  assert.ok(tagihan.html.includes('<p>Yth. Wali &lt;b&gt;,</p>'));
  assert.ok(tagihan.html.includes('Ada tagihan <strong>SPP</strong> atas nama Santri sebesar <strong>'));
  assert.ok(tagihan.html.includes('<li>BSI 7123456789 a.n. Yayasan Hamasah</li>'));

  // Pesan WhatsApp dengan template admin dan nama dokumen baru.
  const template = { ...salin(BAWAAN.whatsapp), salam: 'Salam {sapaan},', cekStatus: 'Cek di sini: {tautan}', tandaTangan: 'Tim Hamasah' };
  template.status['needs-revision'] = 'Berkas {nama} ({nomor}) perlu diperbaiki ya.';
  const dokumen = salin(BAWAAN.dokumen);
  dokumen.passport.label = 'Paspor (scan halaman depan)';
  const pesan = wa.registrationMessage({
    registrationId: 'HI-REG-2026-00002', status: 'needs-revision',
    applicant: { applicantName: 'Ahmad', guardianName: 'Hadi' },
    documents: [{ type: 'passport', reviewStatus: 'rejected', reviewNote: 'Buram' }]
  }, { recipient: 'guardian', statusUrl: 'https://app.test/cek', template, dokumen });
  assert.equal(pesan, [
    'Salam Bapak/Ibu Hadi,', '',
    'Berkas Ahmad (HI-REG-2026-00002) perlu diperbaiki ya.', '',
    'Berkas yang perlu diunggah ulang:', '- Paspor (scan halaman depan): Buram', '',
    'Cek di sini: https://app.test/cek', '',
    "Wassalamu'alaikum,", 'Tim Hamasah'
  ].join('\n'));

  // Kuitansi dengan kop admin.
  const pdf = createReceiptPdf({ receiptNumber: 'KWT/1', number: 'INV/1', studentName: 'S', description: 'SPP', amount: 1, paidAt: '2026-10-01T00:00:00Z' }, {
    kop: { ...kop, namaLembaga: 'Yayasan Hamasah', penandatanganNama: 'Ust. Aji', penandatanganJabatan: 'Direktur' }
  }).toString('latin1');
  for (const teks of ['Yayasan Hamasah', 'BSI 7123456789 a.n. Yayasan Hamasah', 'Ust. Aji', 'Direktur']) {
    assert.ok(pdf.includes(pdfLiteral(teks).slice(1, -1)) || pdf.includes(teks), `Kuitansi memuat ${teks}.`);
  }
}

async function ujiHttp() {
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
    return { status: response.status, body: teks.startsWith('{') ? JSON.parse(teks) : teks };
  }
  async function masuk(email) {
    const hasil = await api('POST', '/api/auth/login', null, { email, password: SANDI });
    assert.equal(hasil.status, 200);
    return hasil.body.accessToken;
  }
  const jumlahAudit = async (action) => (await database.query('SELECT count(*)::int AS n FROM audit_events WHERE action = $1', [action])).rows[0].n;

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    await api('POST', '/api/accounts', admin, { name: 'Petugas Uji', email: 'petugas@uji.test', role: 'registration-officer', password: SANDI });
    const petugas = await masuk('petugas@uji.test');

    const awal = await api('GET', '/api/admin/templates', admin);
    assert.equal(awal.status, 200);
    assert.deepEqual(awal.body.nilai, awal.body.bawaan);
    assert.equal((await api('GET', '/api/admin/templates', petugas)).status, 403);

    // Petugas membaca template WhatsApp; pendaftar membaca daftar dokumen tanpa login.
    const template = salin(BAWAAN.whatsapp);
    template.tandaTangan = 'Tim Pendaftaran Hamasah';
    assert.equal((await api('PUT', '/api/admin/templates/whatsapp', admin, { nilai: template })).status, 200);
    assert.equal((await api('PUT', '/api/admin/templates/whatsapp', petugas, { nilai: template })).status, 403);
    const dibaca = await api('GET', '/api/templates/whatsapp', petugas);
    assert.equal(dibaca.status, 200);
    assert.equal(dibaca.body.whatsapp.tandaTangan, 'Tim Pendaftaran Hamasah');
    assert.equal(dibaca.body.dokumen.passport.label, 'Paspor');

    const dokumen = salin(BAWAAN.dokumen);
    dokumen.transcript.wajib = false;
    dokumen.passport.petunjuk = 'Paspor, berlaku minimal 18 bulan dari tanggal berangkat';
    assert.equal((await api('PUT', '/api/admin/templates/dokumen', admin, { nilai: dokumen })).status, 200);
    const publik = await api('GET', '/api/templates/documents');
    assert.equal(publik.status, 200);
    assert.deepEqual(publik.body.items.map((item) => item.type), ['passport', 'diploma', 'transcript', 'health-certificate', 'photo', 'other']);
    assert.equal(publik.body.items[0].petunjuk, 'Paspor, berlaku minimal 18 bulan dari tanggal berangkat');
    assert.equal(publik.body.items[2].wajib, false);

    // Validasi dan audit.
    const salah = await api('PUT', '/api/admin/templates/email', admin, { nilai: { ...salin(BAWAAN.email), salam: 'Halo {namaa}' } });
    assert.equal(salah.status, 422);
    assert.ok(salah.body.errors.salam);
    assert.equal(await jumlahAudit('template.updated'), 2);
    const balik = await api('DELETE', '/api/admin/templates/whatsapp', admin);
    assert.equal(balik.status, 200);
    assert.equal(balik.body.isi.tersimpan.whatsapp, false);
    assert.equal((await api('GET', '/api/templates/whatsapp', petugas)).body.whatsapp.tandaTangan, BAWAAN.whatsapp.tandaTangan);
    assert.equal(await jumlahAudit('template.reset'), 1);

    // Template tidak mengotori halaman Pengaturan maupun Konten Website.
    assert.equal((await api('GET', '/api/admin/settings', admin)).body.terakhir, null);
    assert.equal(Object.values((await api('GET', '/api/admin/content', admin)).body.tersimpan).some(Boolean), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

async function run() {
  ujiBawaan();
  ujiValidasi();
  ujiPemakaian();
  await ujiHttp();
  console.log('template tests passed (bawaan, validasi isian, WhatsApp, email, kuitansi, HTTP)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
