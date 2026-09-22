// Kuitansi PDF memakai nama santri, bukan ID internal.
const assert = require('node:assert/strict');
const { pdfLiteral } = require('./pdf.js');
const { createReceiptPdf, receiptFileName } = require('./receipt-pdf.js');

const invoice = {
  id: 'inv-1', number: 'INV/HI/2026/00001', receiptNumber: 'KWT/HI/2026/00001',
  studentId: '6f1c2d3e-0000-4000-8000-000000000001', studentName: 'Zahra Hélène (Putri)',
  description: 'SPP September', amount: 1500000, paidAt: '2026-09-08T07:22:00.000Z'
};
const text = createReceiptPdf(invoice, { generatedAt: new Date('2026-09-08T08:00:00Z') }).toString('latin1');
assert.ok(text.startsWith('%PDF-1.4'));
assert.ok(text.includes(pdfLiteral('Atas nama santri: Zahra Hélène (Putri)')), 'nama santri, huruf é dan kurung aman');
assert.ok(!text.includes(invoice.studentId), 'ID internal santri tidak dicetak');
assert.ok(text.includes(pdfLiteral('Nomor kuitansi: KWT/HI/2026/00001')));
assert.match(text, /Jumlah: Rp\240?1\.500\.000|Jumlah: Rp\s?1\.500\.000/);
assert.ok(text.includes(pdfLiteral('Tanggal dibayar: 8 September 2026 pukul 14.22 WIB')));
assert.ok(createReceiptPdf({ ...invoice, studentName: null }).toString('latin1').includes(pdfLiteral('Atas nama santri: Nama santri tidak tercatat')));
assert.equal(receiptFileName(invoice), 'KWT-HI-2026-00001.pdf');
console.log('receipt pdf tests passed');
