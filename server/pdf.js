'use strict';

function pdfText(value) { return String(value || '').replace(/[\\()\r\n]/g, (c) => c === '\\' ? '\\\\' : c === '(' ? '\\(' : c === ')' ? '\\)' : ' '); }

// PDF satu halaman tanpa dependency native; cukup untuk kuitansi dan laporan teks.
function createTextPdf({ title, lines = [] } = {}) {
  const content = [`BT /F1 18 Tf 50 780 Td (${pdfText(title || 'Hamasah International')}) Tj /F1 10 Tf`, ...lines.slice(0, 48).map((line) => `0 -18 Td (${pdfText(line)}) Tj`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`
  ];
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, 'utf8')); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output, 'utf8'); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'utf8');
}

// ---------------------------------------------------------------------------------------
// Dokumen PDF multi-halaman (rapor wali). Tetap tanpa dependency: font standar Helvetica
// dengan WinAnsiEncoding, baris dipenggal berdasarkan perkiraan lebar huruf, halaman baru
// otomatis. Karakter di luar Latin-1 (mis. huruf Arab) tidak bisa digambar font standar,
// jadi diganti "?" alih-alih menghasilkan byte rusak.

const PAGE = Object.freeze({ width: 595, height: 842, margin: 50 });
// Pengganti untuk tanda baca tipografis yang ada di WinAnsi tetapi tidak di Latin-1.
const WIN_ANSI = Object.freeze({ '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80 });

function winAnsiBytes(value) {
  const bytes = [];
  for (const character of String(value ?? '').normalize('NFC')) {
    const code = character.codePointAt(0);
    if (WIN_ANSI[character]) bytes.push(WIN_ANSI[character]);
    else if (code === 0x09 || code === 0x0a || code === 0x0d) bytes.push(0x20);
    else if (code >= 0x20 && code <= 0x7e) bytes.push(code);
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
    else bytes.push(0x3f);
  }
  return bytes;
}

// Literal string PDF dari byte WinAnsi: ( ) \ di-escape, byte di atas 0x7e ditulis oktal
// supaya seluruh berkas tetap ASCII.
function pdfLiteral(value) {
  return winAnsiBytes(value).map((byte) => {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) return `\\${String.fromCharCode(byte)}`;
    if (byte > 0x7e) return `\\${byte.toString(8).padStart(3, '0')}`;
    return String.fromCharCode(byte);
  }).join('');
}

// Perkiraan lebar rata-rata Helvetica (per satuan ukuran huruf). Cukup untuk memenggal
// teks agar tidak keluar margin; sedikit lebih lebar dari aslinya supaya aman.
function wrapText(text, fontSize, bold, maxWidth) {
  const perChar = fontSize * (bold ? 0.58 : 0.53);
  const maxChars = Math.max(10, Math.floor(maxWidth / perChar));
  const lines = [];
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let piece = word;
      while (piece.length > maxChars) {
        if (line) { lines.push(line); line = ''; }
        lines.push(piece.slice(0, maxChars));
        piece = piece.slice(maxChars);
      }
      if (!line) line = piece;
      else if (line.length + 1 + piece.length <= maxChars) line += ` ${piece}`;
      else { lines.push(line); line = piece; }
    }
    lines.push(line);
  }
  return lines;
}

// blocks: [{ kind: 'title'|'subtitle'|'heading'|'text'|'muted'|'item'|'space'|'rule', text }]
function createDocumentPdf({ blocks = [], footer = '' } = {}) {
  const styles = {
    title: { size: 18, bold: true, gap: 8 },
    subtitle: { size: 10, bold: false, gap: 4 },
    heading: { size: 12, bold: true, gap: 6, before: 12 },
    text: { size: 10, bold: false, gap: 3 },
    muted: { size: 9, bold: false, gap: 3, gray: true },
    item: { size: 10, bold: false, gap: 3, indent: 12 }
  };
  const usable = PAGE.width - PAGE.margin * 2;
  const bottom = PAGE.margin + 24;
  const pages = [];
  let ops = [];
  let y = PAGE.height - PAGE.margin;

  function newPage() {
    if (ops.length) pages.push(ops);
    ops = [];
    y = PAGE.height - PAGE.margin;
  }
  function ensure(height) { if (y - height < bottom) newPage(); }

  for (const block of blocks) {
    if (block.kind === 'space') { y -= block.size || 8; continue; }
    if (block.kind === 'rule') {
      ensure(10);
      ops.push(`0.8 0.8 0.8 RG 0.5 w ${PAGE.margin} ${y - 4} m ${PAGE.width - PAGE.margin} ${y - 4} l S`);
      y -= 12;
      continue;
    }
    const style = styles[block.kind] || styles.text;
    const indent = style.indent || 0;
    const lines = wrapText(block.kind === 'item' ? `- ${block.text}` : block.text, style.size, style.bold, usable - indent);
    const lineHeight = style.size * 1.35;
    if (style.before) y -= style.before;
    // Judul bagian tidak boleh sendirian di dasar halaman.
    ensure(lineHeight * Math.min(lines.length, 2) + (block.kind === 'heading' ? lineHeight * 2 : 0));
    lines.forEach((line, index) => {
      ensure(lineHeight);
      y -= lineHeight;
      const x = PAGE.margin + indent + (block.kind === 'item' && index > 0 ? 8 : 0);
      const color = style.gray ? '0.4 0.4 0.4 rg' : '0.21 0.21 0.22 rg';
      ops.push(`BT ${color} /${style.bold ? 'F2' : 'F1'} ${style.size} Tf ${x} ${y.toFixed(2)} Td (${pdfLiteral(line)}) Tj ET`);
    });
    y -= style.gap;
  }
  if (ops.length || pages.length === 0) pages.push(ops);

  const total = pages.length;
  const pageStreams = pages.map((pageOps, index) => {
    const foot = `Halaman ${index + 1} dari ${total}${footer ? `  |  ${footer}` : ''}`;
    return [...pageOps, `BT 0.4 0.4 0.4 rg /F1 8 Tf ${PAGE.margin} ${PAGE.margin - 10} Td (${pdfLiteral(foot)}) Tj ET`].join('\n');
  });

  // Objek: 1 katalog, 2 daftar halaman, 3-4 font, lalu pasangan (halaman, isi).
  const objects = [];
  const kids = pageStreams.map((_, index) => `${5 + index * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${total} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pageStreams.forEach((stream, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  });

  let output = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, 'latin1')); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'latin1');
}

module.exports = { createDocumentPdf, createTextPdf, pdfLiteral, wrapText };
