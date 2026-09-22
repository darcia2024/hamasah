// Kuitansi pembayaran PDF. Dulu baris "Santri" berisi ID internal (UUID) dan tanggal bayar
// berupa string ISO mentah; kini nama santri dan tanggal yang terbaca, dengan generator PDF
// dokumen yang aman untuk huruf non-ASCII.
const { createDocumentPdf } = require('./pdf.js');

const ZONA = 'Asia/Jakarta';

function rupiah(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

function waktu(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : `${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: ZONA }).format(date)} WIB`;
}

function createReceiptPdf(invoice, { generatedAt = new Date() } = {}) {
  const blocks = [
    { kind: 'title', text: 'Kuitansi Pembayaran' },
    { kind: 'subtitle', text: 'Hamasah International' },
    { kind: 'rule' },
    { kind: 'text', text: `Nomor kuitansi: ${invoice.receiptNumber}` },
    { kind: 'text', text: `Nomor tagihan: ${invoice.number}` },
    { kind: 'text', text: `Atas nama santri: ${invoice.studentName || 'Nama santri tidak tercatat'}` },
    { kind: 'text', text: `Untuk pembayaran: ${invoice.description}` },
    { kind: 'text', text: `Jumlah: ${rupiah(invoice.amount)}` },
    { kind: 'text', text: `Tanggal dibayar: ${waktu(invoice.paidAt)}` },
    { kind: 'space', size: 14 },
    { kind: 'rule' },
    { kind: 'muted', text: `Dicetak dari sistem Hamasah International pada ${waktu(generatedAt)}.` }
  ];
  return createDocumentPdf({ blocks, footer: invoice.receiptNumber });
}

// Nomor seperti KWT/HI/2026/00001 tidak boleh memakai "/" di nama berkas.
function receiptFileName(invoice) {
  return `${String(invoice.receiptNumber || 'kuitansi').replace(/[^\w.-]+/g, '-')}.pdf`;
}

module.exports = { createReceiptPdf, receiptFileName };
