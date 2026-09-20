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

module.exports = { createTextPdf };
