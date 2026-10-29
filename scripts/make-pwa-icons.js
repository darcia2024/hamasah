// Membuat ikon aplikasi (PWA) dari emblem Hamasah tanpa pustaka gambar: dekode PNG sumber (8 bit, tanpa interlace),
// skalakan dengan interpolasi bilinear ke kanvas berlatar krem, lalu tulis PNG. Jalankan: node scripts/make-pwa-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SUMBER = path.join(__dirname, '..', 'assets', 'logo-emblem-gold.png');
const KELUAR = path.join(__dirname, '..', 'assets', 'pwa');
const LATAR = [0xfb, 0xf7, 0xec, 0xff];

function dekode(buffer) {
  let pos = 8; let ihdr; let palet = null; let trns = null; const idat = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos); const tipe = buffer.toString('ascii', pos + 4, pos + 8); const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (tipe === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], warna: data[9], interlace: data[12] };
    if (tipe === 'IDAT') idat.push(data);
    if (tipe === 'PLTE') palet = data;
    if (tipe === 'tRNS') trns = data;
    pos += 12 + len;
  }
  if (ihdr.depth !== 8 || ihdr.interlace !== 0 || ![2, 3, 6].includes(ihdr.warna)) throw new Error(`Format PNG sumber tidak didukung: ${JSON.stringify(ihdr)}`);
  const kanal = ihdr.warna === 6 ? 4 : (ihdr.warna === 3 ? 1 : 3);
  const mentah = zlib.inflateSync(Buffer.concat(idat));
  const baris = ihdr.w * kanal; const piksel = Buffer.alloc(ihdr.w * ihdr.h * 4);
  let sebelum = Buffer.alloc(baris);
  for (let y = 0; y < ihdr.h; y += 1) {
    const filter = mentah[y * (baris + 1)]; const saring = mentah.subarray(y * (baris + 1) + 1, (y + 1) * (baris + 1)); const sekarang = Buffer.alloc(baris);
    for (let i = 0; i < baris; i += 1) {
      const a = i >= kanal ? sekarang[i - kanal] : 0; const b = sebelum[i]; const c = i >= kanal ? sebelum[i - kanal] : 0;
      let nilai = saring[i];
      if (filter === 1) nilai += a; else if (filter === 2) nilai += b; else if (filter === 3) nilai += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); nilai += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      sekarang[i] = nilai & 0xff;
    }
    for (let x = 0; x < ihdr.w; x += 1) {
      const o = (y * ihdr.w + x) * 4;
      if (ihdr.warna === 3) { const idx = sekarang[x]; piksel[o] = palet[idx * 3]; piksel[o + 1] = palet[idx * 3 + 1]; piksel[o + 2] = palet[idx * 3 + 2]; piksel[o + 3] = trns && idx < trns.length ? trns[idx] : 255; continue; }
      piksel[o] = sekarang[x * kanal]; piksel[o + 1] = sekarang[x * kanal + 1]; piksel[o + 2] = sekarang[x * kanal + 2]; piksel[o + 3] = kanal === 4 ? sekarang[x * kanal + 3] : 255;
    }
    sebelum = sekarang;
  }
  return { w: ihdr.w, h: ihdr.h, piksel };
}

function crc32(buf) {
  let c; let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}

function potong(tipe, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const isi = Buffer.concat([Buffer.from(tipe, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(isi));
  return Buffer.concat([len, isi, crc]);
}

function enkode(ukuran, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(ukuran, 0); ihdr.writeUInt32BE(ukuran, 4); ihdr[8] = 8; ihdr[9] = 6;
  const baris = ukuran * 4; const mentah = Buffer.alloc((baris + 1) * ukuran);
  for (let y = 0; y < ukuran; y += 1) { mentah[y * (baris + 1)] = 0; rgba.copy(mentah, y * (baris + 1) + 1, y * baris, (y + 1) * baris); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), potong('IHDR', ihdr), potong('IDAT', zlib.deflateSync(mentah, { level: 9 })), potong('IEND', Buffer.alloc(0))]);
}

// Emblem diletakkan di tengah dengan tinggi = skala * ukuran. Interpolasi bilinear pada piksel berbobot alfa.
function buatIkon(sumber, ukuran, skala) {
  const hasil = Buffer.alloc(ukuran * ukuran * 4);
  const tinggi = ukuran * skala; const lebar = tinggi * (sumber.w / sumber.h);
  const x0 = (ukuran - lebar) / 2; const y0 = (ukuran - tinggi) / 2;
  const ambil = (x, y) => { const cx = Math.min(sumber.w - 1, Math.max(0, x)); const cy = Math.min(sumber.h - 1, Math.max(0, y)); const o = (cy * sumber.w + cx) * 4; return [sumber.piksel[o], sumber.piksel[o + 1], sumber.piksel[o + 2], sumber.piksel[o + 3] / 255]; };
  for (let y = 0; y < ukuran; y += 1) {
    for (let x = 0; x < ukuran; x += 1) {
      const o = (y * ukuran + x) * 4;
      let r = LATAR[0]; let g = LATAR[1]; let b = LATAR[2];
      const sx = ((x + 0.5 - x0) / lebar) * sumber.w - 0.5; const sy = ((y + 0.5 - y0) / tinggi) * sumber.h - 0.5;
      if (sx > -1 && sy > -1 && sx < sumber.w && sy < sumber.h) {
        const ix = Math.floor(sx); const iy = Math.floor(sy); const fx = sx - ix; const fy = sy - iy;
        const p = [ambil(ix, iy), ambil(ix + 1, iy), ambil(ix, iy + 1), ambil(ix + 1, iy + 1)]; const w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
        let a = 0; let pr = 0; let pg = 0; let pb = 0;
        p.forEach((q, i) => { a += q[3] * w[i]; pr += q[0] * q[3] * w[i]; pg += q[1] * q[3] * w[i]; pb += q[2] * q[3] * w[i]; });
        if (a > 0) { r = Math.round(pr + r * (1 - a)); g = Math.round(pg + g * (1 - a)); b = Math.round(pb + b * (1 - a)); }
      }
      hasil[o] = r; hasil[o + 1] = g; hasil[o + 2] = b; hasil[o + 3] = 255;
    }
  }
  return enkode(ukuran, hasil);
}

const sumber = dekode(fs.readFileSync(SUMBER));
fs.mkdirSync(KELUAR, { recursive: true });
// Ikon biasa: emblem sekitar 62% kanvas. Maskable: emblem di zona aman 46% supaya tidak terpotong lingkaran atau squircle.
const daftar = [['icon-192.png', 192, 0.62], ['icon-512.png', 512, 0.62], ['icon-maskable-512.png', 512, 0.46], ['apple-touch-icon.png', 180, 0.62]];
daftar.forEach(([nama, ukuran, skala]) => { const png = buatIkon(sumber, ukuran, skala); fs.writeFileSync(path.join(KELUAR, nama), png); console.log(`${nama} ${ukuran}px ${png.length} byte`); });
