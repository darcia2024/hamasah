'use strict';

// Kanvas PDF untuk dokumen bertata letak bebas (rapor gaya CV): teks dengan lebar huruf
// Helvetica yang sebenarnya, kotak, garis, lingkaran, dan gambar PNG. Tetap tanpa dependency.
// Isi halaman tidak dikompresi supaya teksnya bisa diperiksa tes; gambar memakai Flate.
const { pdfLiteral, winAnsiBytes } = require('./pdf.js');

// Lebar huruf (per 1000 satuan) untuk kode 32-126, dari metrik standar Helvetica.
const WIDTH_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const WIDTH_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];
const FONTS = Object.freeze({ regular: 'F1', bold: 'F2', italic: 'F3' });

function textWidth(text, size, font = 'regular', spacing = 0) {
  const table = font === 'bold' ? WIDTH_BOLD : WIDTH_REGULAR;
  const bytes = winAnsiBytes(text);
  const units = bytes.reduce((sum, byte) => sum + (byte >= 32 && byte <= 126 ? table[byte - 32] : 556), 0);
  return (units * size) / 1000 + spacing * Math.max(0, bytes.length - 1);
}

// Memenggal teks per kata menurut lebar sebenarnya; kata yang terlalu panjang dipotong.
function wrapWidth(text, size, font, maxWidth) {
  const lines = [];
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let piece = word;
      while (textWidth(piece, size, font) > maxWidth) {
        let cut = piece.length - 1;
        while (cut > 1 && textWidth(piece.slice(0, cut), size, font) > maxWidth) cut -= 1;
        if (line) { lines.push(line); line = ''; }
        lines.push(piece.slice(0, cut));
        piece = piece.slice(cut);
      }
      const candidate = line ? `${line} ${piece}` : piece;
      if (textWidth(candidate, size, font) <= maxWidth) line = candidate;
      else { lines.push(line); line = piece; }
    }
    lines.push(line);
  }
  return lines;
}

function color(hex) {
  const value = String(hex).replace('#', '');
  return [0, 2, 4].map((i) => (parseInt(value.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
}

const n = (value) => Number(value.toFixed(2));

class PdfCanvas {
  constructor({ width = 595, height = 842 } = {}) {
    this.width = width;
    this.height = height;
    this.pages = [];
    this.images = [];
    this.addPage();
  }

  addPage() {
    this.ops = [];
    this.pages.push(this.ops);
    return this.pages.length;
  }

  rect(x, y, w, h, fill) {
    this.ops.push(`${color(fill)} rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`);
  }

  line(x1, y1, x2, y2, stroke, width = 0.5) {
    this.ops.push(`${color(stroke)} RG ${width} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
  }

  circle(cx, cy, r, fill) {
    const k = r * 0.5523;
    this.ops.push(`${color(fill)} rg ${n(cx + r)} ${n(cy)} m ${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c ${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c ${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c ${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c f`);
  }

  // align: left | right | center terhadap x. spacing: jarak antarhuruf (untuk label kapital).
  text(x, y, value, { size = 10, font = 'regular', fill = '#1F1B10', align = 'left', spacing = 0 } = {}) {
    const width = textWidth(value, size, font, spacing);
    const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    this.ops.push(`BT ${color(fill)} rg /${FONTS[font]} ${size} Tf ${spacing} Tc ${n(left)} ${n(y)} Td (${pdfLiteral(value)}) Tj ET`);
    return width;
  }

  // image: hasil decodePng. Gambar yang sama cukup disimpan sekali.
  image(image, x, y, w, h) {
    let index = this.images.indexOf(image);
    if (index === -1) index = this.images.push(image) - 1;
    this.ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /Im${index + 1} Do Q`);
  }

  toBuffer() {
    // Objek: 1 katalog, 2 daftar halaman, 3-5 font, lalu pasangan gambar (SMask, RGB),
    // lalu pasangan halaman (halaman, isi).
    const objects = [];
    const imageStart = 6;
    const pageStart = imageStart + this.images.length * 2;
    const kids = this.pages.map((_, index) => `${pageStart + index * 2} 0 R`).join(' ');
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
    for (const base of ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique']) objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
    const binary = [];
    this.images.forEach((image, index) => {
      const mask = imageStart + index * 2;
      binary[mask] = image.alpha;
      binary[mask + 1] = image.rgb;
      objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.alpha.length} >>`);
      objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${mask} 0 R /Length ${image.rgb.length} >>`);
    });
    const xobjects = this.images.length ? ` /XObject << ${this.images.map((_, index) => `/Im${index + 1} ${imageStart + index * 2 + 1} 0 R`).join(' ')} >>` : '';
    this.pages.forEach((ops, index) => {
      const stream = ops.join('\n');
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xobjects} >> /Contents ${pageStart + index * 2 + 1} 0 R >>`);
      objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    });

    const chunks = [Buffer.from('%PDF-1.4\n', 'latin1')];
    let length = chunks[0].length;
    const offsets = [];
    const push = (chunk) => { chunks.push(chunk); length += chunk.length; };
    objects.forEach((object, index) => {
      offsets.push(length);
      const number = index + 1;
      if (binary[number]) {
        push(Buffer.from(`${number} 0 obj\n${object}\nstream\n`, 'latin1'));
        push(binary[number]);
        push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
      } else push(Buffer.from(`${number} 0 obj\n${object}\nendobj\n`, 'latin1'));
    });
    push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`, 'latin1'));
    return Buffer.concat(chunks);
  }
}

module.exports = { PdfCanvas, textWidth, wrapWidth };
