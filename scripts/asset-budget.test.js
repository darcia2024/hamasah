// Anggaran ukuran gambar di assets/. Hosting gratis dibatasi bandwidth, dan gambar adalah
// bagian terbesar setiap halaman publik. Test ini gagal bila ada gambar yang masuk repo
// tanpa dikecilkan lebih dulu (lebar maksimal 1600 px, JPEG/WebP kualitas sekitar 72).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.join(__dirname, '..', 'assets');
const BATAS_PER_BERKAS = 230 * 1024;
// Total repo dinaikkan dari 4 MB ke 5 MB (15 Oktober 2026) untuk galeri kegiatan Kairo dan
// Hamasah Indonesia. Yang dimuat pengunjung tetap kecil: galeri memuat versi 640 px secara
// lazy, dan batas per berkas di atas tidak berubah.
const BATAS_TOTAL = 5 * 1024 * 1024;
// Halaman presentasi mandiri (/pitch, /internal, /qohiroh) berisi tangkapan layar aplikasi dan tidak dimuat pengunjung
// situs utama, jadi punya anggaran sendiri per folder (30 Oktober 2026). Batas per berkas tetap berlaku untuk semuanya.
const FOLDER_PRESENTASI = Object.freeze(['pitch', 'internal', 'qohiroh']);
const BATAS_PER_PRESENTASI = 6 * 1024 * 1024;
const GAMBAR = /\.(jpe?g|png|webp|gif|avif)$/i;

function daftar(direktori) {
  return fs.readdirSync(direktori, { withFileTypes: true }).flatMap((entri) => {
    const lokasi = path.join(direktori, entri.name);
    return entri.isDirectory() ? daftar(lokasi) : GAMBAR.test(entri.name) ? [lokasi] : [];
  });
}

const berkas = daftar(ASSETS).map((lokasi) => ({ lokasi: path.relative(ASSETS, lokasi), ukuran: fs.statSync(lokasi).size }));
const terlaluBesar = berkas.filter((item) => item.ukuran > BATAS_PER_BERKAS);
assert.deepEqual(
  terlaluBesar.map((item) => `${item.lokasi} (${Math.round(item.ukuran / 1024)} KB)`),
  [],
  `Gambar di atas ${BATAS_PER_BERKAS / 1024} KB harus dikecilkan sebelum masuk repo.`
);
const folderAtas = (item) => item.lokasi.split(path.sep)[0];
const situs = berkas.filter((item) => !FOLDER_PRESENTASI.includes(folderAtas(item)));
const total = situs.reduce((jumlah, item) => jumlah + item.ukuran, 0);
assert.ok(total <= BATAS_TOTAL, `Total gambar situs ${Math.round(total / 1024)} KB melebihi anggaran ${BATAS_TOTAL / 1024} KB.`);
for (const folder of FOLDER_PRESENTASI) {
  const ukuran = berkas.filter((item) => folderAtas(item) === folder).reduce((jumlah, item) => jumlah + item.ukuran, 0);
  assert.ok(ukuran <= BATAS_PER_PRESENTASI, `Gambar assets/${folder} ${Math.round(ukuran / 1024)} KB melebihi anggaran presentasi ${BATAS_PER_PRESENTASI / 1024} KB.`);
}

console.log(`asset budget tests passed (${situs.length} gambar situs, ${Math.round(total / 1024)} KB; presentasi dianggarkan terpisah)`);
