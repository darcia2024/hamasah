'use strict';

// Membaca PNG (8 bit, tanpa interlace) menjadi dua aliran Flate untuk PDF: warna RGB dan
// transparansi (dipakai sebagai SMask). Cukup untuk logo di rapor; tanpa dependency.
const zlib = require('node:zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = Object.freeze({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Bukan berkas PNG.');
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  for (let pos = 8; pos < buffer.length;) {
    const length = buffer.readUInt32BE(pos);
    const name = buffer.toString('latin1', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (name === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (name === 'PLTE') palette = data;
    else if (name === 'tRNS') trns = data;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    pos += 12 + length;
  }
  const channels = CHANNELS[type];
  if (depth !== 8 || interlace || !channels || (type === 3 && !palette)) throw new Error('Format PNG tidak didukung.');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? pixels[row + x - channels] : 0;
      const b = y ? pixels[row - stride + x] : 0;
      const c = x >= channels && y ? pixels[row - stride + x - channels] : 0;
      const value = raw[source + x];
      const predictor = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0;
      pixels[row + x] = (value + predictor) & 0xff;
    }
  }

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height, 0xff);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * channels;
    let r;
    let g;
    let b;
    if (type === 3) {
      const index = pixels[p];
      [r, g, b] = [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
      if (trns && index < trns.length) alpha[i] = trns[index];
    } else if (type === 0 || type === 4) {
      r = g = b = pixels[p];
      if (type === 4) alpha[i] = pixels[p + 1];
    } else {
      [r, g, b] = [pixels[p], pixels[p + 1], pixels[p + 2]];
      if (type === 6) alpha[i] = pixels[p + 3];
    }
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return { width, height, rgb: zlib.deflateSync(rgb), alpha: zlib.deflateSync(alpha) };
}

module.exports = { decodePng };
