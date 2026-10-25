'use strict';

// Membaca font TrueType (.ttf, kerangka glyf) untuk ditanam di PDF sebagai font sederhana
// WinAnsi: lebar huruf kode 32-255, ukuran kotak huruf, dan isi berkasnya (Flate).
// Cukup untuk huruf Latin; tanpa subset dan tanpa dependency.
const zlib = require('node:zlib');

// Kode WinAnsi 0x80-0x9F yang bukan Latin-1.
const WIN_ANSI_EXTRA = Object.freeze({
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178
});

function tables(buffer) {
  const count = buffer.readUInt16BE(4);
  const result = {};
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    result[buffer.toString('latin1', at, at + 4)] = buffer.readUInt32BE(at + 8);
  }
  return result;
}

// cmap format 4 (Windows Unicode BMP): kode Unicode ke nomor glyph.
function cmapLookup(buffer, cmapAt) {
  const count = buffer.readUInt16BE(cmapAt + 2);
  let sub = -1;
  for (let i = 0; i < count; i += 1) {
    const at = cmapAt + 4 + i * 8;
    if (buffer.readUInt16BE(at) === 3 && buffer.readUInt16BE(at + 2) === 1) sub = cmapAt + buffer.readUInt32BE(at + 4);
  }
  if (sub < 0 || buffer.readUInt16BE(sub) !== 4) throw new Error('cmap format 4 tidak ditemukan.');
  const segments = buffer.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const offsets = deltas + segments * 2;
  return (code) => {
    for (let i = 0; i < segments; i += 1) {
      if (code > buffer.readUInt16BE(ends + i * 2)) continue;
      const start = buffer.readUInt16BE(starts + i * 2);
      if (code < start) return 0;
      const delta = buffer.readInt16BE(deltas + i * 2);
      const rangeAt = offsets + i * 2;
      const range = buffer.readUInt16BE(rangeAt);
      if (!range) return (code + delta) & 0xffff;
      const glyph = buffer.readUInt16BE(rangeAt + range + (code - start) * 2);
      return glyph ? (glyph + delta) & 0xffff : 0;
    }
    return 0;
  };
}

function parseTrueType(buffer, baseName) {
  const t = tables(buffer);
  if (!t.head || !t.hhea || !t.hmtx || !t.cmap || !t.glyf) throw new Error('Bukan font TrueType yang didukung.');
  const unitsPerEm = buffer.readUInt16BE(t.head + 18);
  const scale = (value) => Math.round((value * 1000) / unitsPerEm);
  const bbox = [36, 38, 40, 42].map((offset) => scale(buffer.readInt16BE(t.head + offset)));
  const ascent = scale(buffer.readInt16BE(t.hhea + 4));
  const descent = scale(buffer.readInt16BE(t.hhea + 6));
  const metrics = buffer.readUInt16BE(t.hhea + 34);
  const capHeight = t['OS/2'] && buffer.readUInt16BE(t['OS/2']) >= 2 ? scale(buffer.readInt16BE(t['OS/2'] + 88)) : ascent;
  const italicAngle = t.post ? buffer.readInt32BE(t.post + 4) / 65536 : 0;
  const glyphOf = cmapLookup(buffer, t.cmap);
  const advance = (glyph) => buffer.readUInt16BE(t.hmtx + Math.min(glyph, metrics - 1) * 4);
  const widths = [];
  for (let code = 32; code <= 255; code += 1) {
    const unicode = code >= 0x80 && code <= 0x9f ? WIN_ANSI_EXTRA[code] : code;
    widths.push(unicode ? scale(advance(glyphOf(unicode))) : 0);
  }
  return {
    baseName, widths, bbox, ascent, descent, capHeight, italicAngle,
    file: zlib.deflateSync(buffer), length1: buffer.length
  };
}

module.exports = { parseTrueType };
