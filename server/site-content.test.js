// Konten website publik: nilai bawaan sama dengan HTML, validasi, render ke halaman,
// dan alur HTTP halaman Konten Website (izin, simpan, kembalikan, jejak audit).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BAWAAN, BLOK, RENDER, formatWhatsapp, pengumumanTampil, periksaBlok, renderHalaman, sesuaikanTeksKontak
} = require('./site-content.js');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const WEBSITE = path.join(__dirname, '..', 'website');
const SANDI = 'kata-sandi-uji-konten';

function salin(nilai) {
  return JSON.parse(JSON.stringify(nilai));
}

// Teks yang terbaca pengunjung: tanpa tag dan komentar, entitas umum diurai, spasi dirapikan.
function teksTerbaca(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function isiWilayah(html, id) {
  const cocok = html.match(new RegExp(`<!--konten:${id.replace(/\./g, '\\.')}-->([\\s\\S]*?)<!--/konten:${id.replace(/\./g, '\\.')}-->`));
  return cocok ? cocok[1] : null;
}

function halaman(nama) {
  return fs.readFileSync(path.join(WEBSITE, nama), 'utf8');
}

// Wilayah yang isi bawaannya sengaja berbeda bentuk dari render (alamat satu baris di
// kebijakan privasi), atau kosong sampai diisi admin.
const BOLEH_BEDA = new Set(['kontak.privasiIndonesia', 'kontak.privasiMesir', 'kontak.sosial', 'pengumuman']);

function ujiBawaanSamaDenganHtml() {
  const semuaHtml = fs.readdirSync(WEBSITE).filter((nama) => nama.endsWith('.html')).map((nama) => [nama, halaman(nama)]);
  let diperiksa = 0;
  for (const blok of BLOK) {
    for (const [id, isi] of RENDER[blok](BAWAAN[blok], new Date())) {
      const tempat = semuaHtml.filter(([, html]) => html.includes(`<!--konten:${id}-->`));
      assert.ok(tempat.length, `Wilayah ${id} tidak ditemukan di halaman mana pun.`);
      if (BOLEH_BEDA.has(id)) continue;
      for (const [nama, html] of tempat) {
        assert.equal(teksTerbaca(isiWilayah(html, id)), teksTerbaca(isi), `Isi bawaan ${id} di ${nama} berbeda dengan BAWAAN di site-content.js.`);
        diperiksa += 1;
      }
    }
  }
  // Tombol dan sumber jawaban FAQ beranda harus sama jumlahnya dengan BAWAAN.faq.
  const beranda = halaman('index.html');
  assert.equal((isiWilayah(beranda, 'faq.tombol').match(/<button/g) || []).length, BAWAAN.faq.length);
  assert.equal((isiWilayah(beranda, 'faq.sumber').match(/data-answer=/g) || []).length, BAWAAN.faq.length);
  return diperiksa;
}

function ujiValidasi() {
  for (const blok of BLOK) {
    const hasil = periksaBlok(blok, salin(BAWAAN[blok]));
    assert.equal(hasil.ok, true, `BAWAAN ${blok} harus lolos validasi: ${hasil.error}`);
    assert.deepEqual(hasil.nilai, BAWAAN[blok], `BAWAAN ${blok} tidak berubah oleh validasi.`);
  }
  const kontak = salin(BAWAAN.kontak);
  assert.equal(periksaBlok('kontak', { ...kontak, whatsapp: '0812-3456-7890' }).nilai.whatsapp, '6281234567890', 'Awalan 0 menjadi 62.');
  assert.equal(periksaBlok('kontak', { ...kontak, whatsapp: '12' }).ok, false);
  assert.equal(periksaBlok('kontak', { ...kontak, email: 'bukan-email' }).bidang, 'email');
  assert.equal(periksaBlok('kontak', { ...kontak, instagram: 'https://www.instagram.com/hamasah.intl/' }).nilai.instagram, 'hamasah.intl');
  assert.equal(periksaBlok('kontak', { ...kontak, youtube: 'https://contoh.test/kanal' }).ok, false);
  assert.equal(formatWhatsapp('6287897591978'), '+62 878-9759-1978');

  const pengumuman = { aktif: true, teks: 'Gelombang 2 dibuka.', tautanTeks: 'Daftar', tautanUrl: 'javascript:alert(1)', mulai: '', selesai: '' };
  assert.equal(periksaBlok('pengumuman', pengumuman).bidang, 'tautanUrl', 'Tautan javascript: ditolak.');
  assert.equal(periksaBlok('pengumuman', { ...pengumuman, tautanUrl: '#pendaftaran' }).ok, true);
  assert.equal(periksaBlok('pengumuman', { ...pengumuman, tautanUrl: 'https://hamasah.test/a' }).ok, true);
  assert.equal(periksaBlok('pengumuman', { ...pengumuman, tautanUrl: '#x', mulai: '2026-10-10', selesai: '2026-10-01' }).bidang, 'selesai');
  assert.equal(periksaBlok('pengumuman', { ...pengumuman, tautanUrl: '#x', mulai: '2026-02-30' }).bidang, 'mulai');

  assert.equal(periksaBlok('faq', []).ok, false, 'FAQ minimal satu.');
  assert.equal(periksaBlok('testimoni', [{ ...BAWAAN.testimoni[0], foto: '../../.env' }]).ok, false, 'Foto di luar daftar ditolak.');
  assert.equal(periksaBlok('biaya', { ...salin(BAWAAN.biaya), program: { ...salin(BAWAAN.biaya.program), kuliah: { ...BAWAAN.biaya.program.kuliah, fasilitas: [] } } }).ok, false);

  // Tanggal pengumuman dihitung WIB.
  const p = { aktif: true, teks: 'Ada kabar', mulai: '2026-10-07', selesai: '2026-10-07' };
  assert.equal(pengumumanTampil(p, new Date('2026-10-06T18:00:00Z')), true, '01.00 WIB tanggal 7 sudah masuk.');
  assert.equal(pengumumanTampil(p, new Date('2026-10-06T16:00:00Z')), false, '23.00 WIB tanggal 6 belum.');
  assert.equal(pengumumanTampil({ ...p, aktif: false }, new Date('2026-10-07T03:00:00Z')), false);
}

function ujiRender() {
  const asli = halaman('biaya.html');
  const tanpaSimpan = { nilai: salin(BAWAAN), tersimpan: Object.fromEntries(BLOK.map((b) => [b, false])) };
  const polos = renderHalaman(asli, tanpaSimpan);
  assert.equal(polos.replace('<meta name="hamasah-whatsapp" content="6287897591978" />', ''), asli, 'Tanpa konten tersimpan, halaman tidak berubah selain meta nomor.');

  const biaya = salin(BAWAAN.biaya);
  biaya.program.kuliah.harga = 'Rp 45 juta <script>alert(1)</script>';
  biaya.program.kuliah.fasilitas = ['Asrama Al-Azhar & katering'];
  biaya.faq = [];
  const konten = { nilai: { ...salin(BAWAAN), biaya, kontak: { ...BAWAAN.kontak, whatsapp: '6281234567890' } }, tersimpan: { ...tanpaSimpan.tersimpan, biaya: true, kontak: true } };
  const hasil = renderHalaman(asli, konten);
  assert.ok(hasil.includes('Rp 45 juta &lt;script&gt;alert(1)&lt;/script&gt;'), 'Teks admin di-escape.');
  assert.ok(!hasil.includes('<script>alert(1)'), 'Tidak ada skrip yang lolos.');
  assert.ok(hasil.includes(`${'</svg></span>'} Asrama Al-Azhar &amp; katering</li>`), 'Butir fasilitas tanpa span tambahan.');
  assert.ok(!hasil.includes('Pengurusan berkas Kemenag'), 'Fasilitas lama diganti.');
  assert.ok(!hasil.includes('Apakah biaya pendaftaran awal dapat diangsur?'), 'FAQ biaya kosong berarti tidak ada kartu.');
  assert.ok(!hasil.includes('6287897591978'), 'Nomor WhatsApp lama tidak tersisa.');
  const kontakBaru = renderHalaman(halaman('kontak.html'), konten);
  assert.ok(kontakBaru.includes('wa.me/6281234567890') && !kontakBaru.includes('6287897591978'), 'Nomor WhatsApp diganti di seluruh halaman.');
  assert.ok(hasil.includes('<meta name="hamasah-whatsapp" content="6281234567890" />'));
  assert.ok(hasil.includes('Dikonfirmasi saat konsultasi'), 'Program lain tetap.');

  const teks = sesuaikanTeksKontak('WhatsApp admin: +62 878-9759-1978. Kantor Mesir: Sheikh Taha Dinary, Imarah 32, Lantai 1, Syaqqah 3, Hay Sabi, Nasr City, Kairo.', {
    ...BAWAAN.kontak, whatsapp: '6281234567890', alamatMesir: 'Jalan Baru 5\nKairo'
  });
  assert.equal(teks, 'WhatsApp admin: +62 812-3456-7890. Kantor Mesir: Jalan Baru 5, Kairo.');
}

async function ujiHttp() {
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'kunci-bootstrap-uji',
    rateLimiter: createRelaxedRateLimiter(),
    siteContentService: undefined
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
    assert.equal(hasil.status, 200);
    return hasil.body.accessToken;
  }
  const html = async (pathname) => (await fetch(`${baseUrl}${pathname}`)).text();
  const jumlahAudit = async (action) => (await database.query('SELECT count(*)::int AS n FROM audit_events WHERE action = $1', [action])).rows[0].n;

  try {
    await api('POST', '/api/auth/bootstrap', 'kunci-bootstrap-uji', { name: 'Admin Uji', email: 'admin@uji.test', password: SANDI });
    const admin = await masuk('admin@uji.test');
    await api('POST', '/api/accounts', admin, { name: 'Petugas Uji', email: 'petugas@uji.test', role: 'registration-officer', password: SANDI });
    const petugas = await masuk('petugas@uji.test');

    const awal = await api('GET', '/api/admin/content', admin);
    assert.equal(awal.status, 200);
    assert.equal(awal.body.tersedia, true);
    assert.deepEqual(awal.body.nilai, awal.body.bawaan);
    assert.equal(awal.body.whatsappTampil, '+62 878-9759-1978');
    assert.equal((await api('GET', '/api/admin/content', petugas)).status, 403);

    const halamanAwal = await html('/website/biaya.html');
    assert.ok(halamanAwal.includes('Dikonfirmasi saat konsultasi'));
    assert.ok(halamanAwal.includes('name="hamasah-whatsapp" content="6287897591978"'));

    // Simpan biaya: halaman langsung memakai nilai baru.
    const biaya = salin(BAWAAN.biaya);
    biaya.program.mahad.harga = 'Rp 52.000.000';
    biaya.program.mahad.keterangan = 'Untuk keberangkatan Agustus 2027';
    const simpan = await api('PUT', '/api/admin/content/biaya', admin, { nilai: biaya });
    assert.equal(simpan.status, 200, JSON.stringify(simpan.body));
    assert.equal(simpan.body.berubah, true);
    assert.equal(simpan.body.konten.tersimpan.biaya, true);
    assert.equal(simpan.body.konten.terakhir.biaya.oleh, 'Admin Uji');
    assert.ok((await html('/website/biaya.html')).includes('Rp 52.000.000'));
    assert.equal(await jumlahAudit('site-content.updated'), 1);

    // Menyimpan isi yang sama tidak menambah jejak audit.
    assert.equal((await api('PUT', '/api/admin/content/biaya', admin, { nilai: biaya })).body.berubah, false);
    assert.equal(await jumlahAudit('site-content.updated'), 1);

    // Validasi dan izin.
    const salah = await api('PUT', '/api/admin/content/kontak', admin, { nilai: { ...BAWAAN.kontak, whatsapp: 'abc' } });
    assert.equal(salah.status, 422);
    assert.ok(salah.body.errors.whatsapp);
    assert.equal((await api('PUT', '/api/admin/content/biaya', petugas, { nilai: biaya })).status, 403);
    assert.equal((await api('PUT', '/api/admin/content/tidak-ada', admin, { nilai: {} })).status, 404);

    // Kontak: nomor baru tampil di semua halaman publik dan jawaban FAQ.
    await api('PUT', '/api/admin/content/kontak', admin, { nilai: { ...BAWAAN.kontak, whatsapp: '6281111222333', instagram: '@hamasah.intl' } });
    const kontak = await html('/website/kontak.html');
    assert.ok(kontak.includes('wa.me/6281111222333') && !kontak.includes('wa.me/6287897591978'));
    assert.ok(kontak.includes('+62 811-1122-2333'));
    assert.ok(kontak.includes('instagram.com/hamasah.intl/'));
    assert.ok((await html('/website/kebijakan-privasi.html')).includes('wa.me/6281111222333'));
    const faq = await api('POST', '/api/faq/ask', null, { question: 'nomor whatsapp admin?' });
    assert.ok(faq.body.answer.includes('+62 811-1122-2333'), faq.body.answer);

    // FAQ dan pengumuman beranda.
    await api('PUT', '/api/admin/content/faq', admin, { nilai: [{ tanya: 'Kapan gelombang 2?', topik: 'Jadwal', judul: 'Gelombang 2 dibuka Januari.', jawab: 'Pendaftaran gelombang 2 dibuka 5 Januari 2027.' }] });
    await api('PUT', '/api/admin/content/pengumuman', admin, { nilai: { aktif: true, teks: 'Gelombang 2 sudah dibuka.', tautanTeks: 'Daftar sekarang', tautanUrl: '#pendaftaran', mulai: '', selesai: '' } });
    const beranda = await html('/website/index.html');
    assert.ok(beranda.includes('data-answer="faq-1"') && beranda.includes('Kapan gelombang 2?'));
    assert.ok(!beranda.includes('data-answer="faq-2"'), 'Hanya FAQ yang disimpan.');
    assert.ok(beranda.includes('class="lp-announce"') && beranda.includes('Gelombang 2 sudah dibuka.'));
    assert.ok((await html('/')).includes('Gelombang 2 sudah dibuka.'), 'Alamat akar memakai beranda yang sama.');

    // Kembalikan ke bawaan.
    const balik = await api('DELETE', '/api/admin/content/biaya', admin);
    assert.equal(balik.status, 200);
    assert.equal(balik.body.berubah, true);
    assert.ok(!(await html('/website/biaya.html')).includes('Rp 52.000.000'));
    assert.equal(await jumlahAudit('site-content.reset'), 1);
    assert.equal((await api('DELETE', '/api/admin/content/biaya', admin)).body.berubah, false);

    // Konten tidak mengotori halaman Pengaturan.
    assert.equal((await api('GET', '/api/admin/settings', admin)).body.terakhir, null);

    // Halaman konsol tidak ikut diubah.
    assert.ok(!(await html('/website/portal.html')).includes('hamasah-whatsapp'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
}

async function run() {
  const diperiksa = ujiBawaanSamaDenganHtml();
  ujiValidasi();
  ujiRender();
  await ujiHttp();
  console.log(`site content tests passed (${diperiksa} wilayah bawaan cocok dengan HTML, validasi, render, HTTP)`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
