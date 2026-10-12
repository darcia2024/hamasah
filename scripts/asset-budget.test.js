// Anggaran ukuran gambar di assets/. Hosting gratis dibatasi bandwidth, dan gambar adalah
// bagian terbesar setiap halaman publik. Test ini gagal bila ada gambar yang masuk repo
// tanpa dikecilkan lebih dulu (lebar maksimal 1600 px, JPEG/WebP kualitas sekitar 72).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.join(__dirname, '..', 'assets');
const BATAS_PER_BERKAS = 230 * 1024;
const BATAS_TOTAL = 4 * 1024 * 1024;
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
const total = berkas.reduce((jumlah, item) => jumlah + item.ukuran, 0);
assert.ok(total <= BATAS_TOTAL, `Total gambar ${Math.round(total / 1024)} KB melebihi anggaran ${BATAS_TOTAL / 1024} KB.`);

console.log(`asset budget tests passed (${berkas.length} gambar, ${Math.round(total / 1024)} KB)`);
