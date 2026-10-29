// CMS landing page dan artikel (item 21-22): testimoni bisa dinonaktifkan tanpa dihapus, rubrik artikel dikelola dari
// Konten Website (validasi, tampil di filter, pilihan editor), dan isi fasilitas pada halaman biaya sesuai keputusan rapat.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BAWAAN, periksaBlok, renderHalaman } = require('./site-content.js');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { createRelaxedRateLimiter } = require('./test-support/rate-limit.js');

const ROOT = path.resolve(__dirname, '..');

function galat(blok, nilai) {
  const hasil = periksaBlok(blok, nilai);
  assert.equal(hasil.ok, false, `${blok} seharusnya ditolak`);
  return hasil.error || hasil.pesan || JSON.stringify(hasil);
}

async function run() {
  // ------------------------------------------------------------ testimoni: nonaktifkan, urutkan
  const t = JSON.parse(JSON.stringify(BAWAAN.testimoni));
  t[1].aktif = false;
  const ok = periksaBlok('testimoni', t);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.nilai.map((x) => x.aktif), [true, false, true]);
  assert.equal(periksaBlok('testimoni', t.map(({ aktif, ...sisa }) => sisa)).nilai.every((x) => x.aktif === true), true, 'Data lama tanpa kolom aktif dianggap aktif.');
  assert.match(galat('testimoni', t.map((x) => ({ ...x, aktif: false }))), /Minimal satu testimoni/);
  const html = renderHalaman('<div class="lp-testimonials"><!--konten:testimoni--><!--/konten:testimoni--></div>', { nilai: { ...BAWAAN, testimoni: ok.nilai }, tersimpan: { testimoni: true } });
  assert.equal((html.match(/class="lp-testi/g) || []).length >= 2, true);
  assert.ok(!html.includes('Ayah dan ibu dari Aruna'), 'Testimoni nonaktif tidak tampil.');
  assert.ok(html.includes('Ghazalba') && html.includes('Khafidzah'));
  const terurut = [t[2], t[0], { ...t[1], aktif: true }];
  assert.deepEqual(periksaBlok('testimoni', terurut).nilai.map((x) => x.nama.slice(0, 12)), [t[2].nama.slice(0, 12), t[0].nama.slice(0, 12), t[1].nama.slice(0, 12)], 'Urutan mengikuti daftar.');

  // ------------------------------------------------------------ rubrik artikel
  assert.equal(BAWAAN.rubrik.length, 4);
  const r = JSON.parse(JSON.stringify(BAWAAN.rubrik));
  r.push({ nama: 'Berita Alumni', label: '', deskripsi: 'Kabar alumni Hamasah.', aktif: true });
  r[0].aktif = false;
  const rubrik = periksaBlok('rubrik', r);
  assert.equal(rubrik.ok, true, JSON.stringify(rubrik));
  assert.equal(rubrik.nilai[4].label, 'Berita Alumni', 'Label kosong memakai nama rubrik.');
  assert.match(galat('rubrik', [...r, { nama: 'berita alumni', aktif: true }]), /dua kali/);
  assert.match(galat('rubrik', r.map((x) => ({ ...x, aktif: false }))), /Minimal satu rubrik/);
  assert.match(galat('rubrik', []), /./);
  assert.match(galat('rubrik', [{ nama: 'A', aktif: true }]), /./);
  const artikel = renderHalaman(fs.readFileSync(path.join(ROOT, 'website', 'articles.html'), 'utf8'), { nilai: { ...BAWAAN, rubrik: rubrik.nilai }, tersimpan: { rubrik: true } });
  assert.ok(artikel.includes('data-category="Berita Alumni"'), 'Rubrik baru tampil di filter.');
  assert.ok(!artikel.includes('data-category="Keilmuan Islam"'), 'Rubrik nonaktif disembunyikan dari filter.');
  assert.ok(artikel.includes('data-category="all"'), 'Tombol semua kategori tetap ada.');

  // ------------------------------------------------------------ isi halaman biaya sesuai keputusan rapat
  const biaya = fs.readFileSync(path.join(ROOT, 'website', 'biaya.html'), 'utf8');
  for (const kata of ['Fasilitas kamar', 'Fasilitas bersama', 'AC: fasilitas opsional', 'siang dan sore', 'Wi-Fi, air minum, listrik', 'Tahfidz, kajian, pendampingan musyrif, dan LMS', 'Dauroh atau seminar, organisasi santri, dan olahraga']) {
    assert.ok(biaya.includes(kata), `biaya.html memuat "${kata}"`);
  }
  assert.match(biaya, /AC bersifat opsional dan tidak otomatis/);
  for (const halaman of fs.readdirSync(path.join(ROOT, 'website')).filter((f) => f.endsWith('.html') && f !== 'rapat.html')) {
    assert.ok(!/laundry/i.test(fs.readFileSync(path.join(ROOT, 'website', halaman), 'utf8')), `${halaman} tidak menyebut laundry sebagai layanan`);
  }

  // ------------------------------------------------------------ endpoint rubrik publik
  const database = await createTestDatabase();
  const app = createHamasahApp({ rootDirectory: ROOT, database, bootstrapKey: 'kunci-bootstrap-uji', rateLimiter: createRelaxedRateLimiter() });
  const server = app.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const awal = await (await fetch(`${base}/api/rubrik`)).json();
    assert.deepEqual(awal.items.map((i) => i.name), ['Keilmuan Islam', 'Panduan Hidup', 'Kegiatan', 'Keberangkatan']);
    assert.equal(awal.items[2].label, 'Kegiatan Santri');
    const halamanArtikel = await (await fetch(`${base}/articles`)).text();
    assert.ok(halamanArtikel.includes('data-category="Keberangkatan"'));
    const staff = await (await fetch(`${base}/staff`)).text();
    assert.match(staff, /id="article-category-options"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    await database.close();
  }
  console.log('cms landing tests passed');
}

run().catch((error) => { console.error(error); process.exit(1); });
