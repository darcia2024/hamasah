// Kuitansi pembayaran PDF. Dulu baris "Santri" berisi ID internal (UUID) dan tanggal bayar
// berupa string ISO mentah; kini nama santri dan tanggal yang terbaca, dengan generator PDF
// dokumen yang aman untuk huruf non-ASCII.
const { createDocumentPdf } = require('./pdf.js');
const { BAWAAN, barisRekening } = require('./templates.js');

const ZONA = 'Asia/Jakarta';

function rupiah(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

function waktu(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : `${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: ZONA }).format(date)} WIB`;
}

const METODE = Object.freeze({ transfer: 'Transfer bank', tunai: 'Tunai', lainnya: 'Lainnya' });

// Tanggal bayar (YYYY-MM-DD) tanpa jam.
function tanggal(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

// Nama lembaga, alamat, dan kontak di bawah judul dokumen (kop dari halaman Template).
function kepalaKop(kop) {
  return [
    { kind: 'subtitle', text: kop.namaLembaga },
    ...(kop.alamat ? [{ kind: 'muted', text: kop.alamat.split('\n').join(', ') }] : []),
    ...(kop.kontak ? [{ kind: 'muted', text: kop.kontak }] : [])
  ];
}

// kop: blok "kop" dari halaman Template. Tanpa itu dipakai bawaan (hanya nama lembaga).
function createReceiptPdf(invoice, { generatedAt = new Date(), kop = BAWAAN.kop } = {}) {
  const rekening = barisRekening(kop.rekening);
  const blocks = [
    { kind: 'title', text: 'Kuitansi Pembayaran' },
    ...kepalaKop(kop),
    { kind: 'rule' },
    { kind: 'text', text: `Nomor kuitansi: ${invoice.receiptNumber}` },
    { kind: 'text', text: `Nomor tagihan: ${invoice.number}` },
    { kind: 'text', text: `Atas nama santri: ${invoice.studentName || 'Nama santri tidak tercatat'}` },
    { kind: 'text', text: `Untuk pembayaran: ${invoice.description}` },
    { kind: 'text', text: `Jumlah: ${rupiah(invoice.amount)}` },
    ...(invoice.payment
      ? [
        { kind: 'text', text: `Tanggal dibayar: ${tanggal(invoice.payment.paidOn)}` },
        { kind: 'text', text: `Metode pembayaran: ${METODE[invoice.payment.method] || invoice.payment.method}` },
        ...(invoice.payment.note ? [{ kind: 'text', text: `Catatan: ${invoice.payment.note}` }] : []),
        { kind: 'text', text: `Dicatat lunas: ${waktu(invoice.paidAt)}` }
      ]
      : [{ kind: 'text', text: `Tanggal dibayar: ${waktu(invoice.paidAt)}` }]),
    ...(rekening.length ? [{ kind: 'heading', text: 'Rekening resmi pembayaran' }, ...rekening.map((baris) => ({ kind: 'item', text: baris }))] : []),
    ...(kop.catatanKuitansi ? [{ kind: 'space', size: 8 }, { kind: 'muted', text: kop.catatanKuitansi }] : []),
    ...(kop.penandatanganNama
      ? [
        { kind: 'space', size: 18 },
        { kind: 'text', text: 'Hormat kami,' },
        { kind: 'space', size: 28 },
        { kind: 'text', text: kop.penandatanganNama },
        ...(kop.penandatanganJabatan ? [{ kind: 'muted', text: kop.penandatanganJabatan }] : [])
      ]
      : []),
    { kind: 'space', size: 14 },
    { kind: 'rule' },
    { kind: 'muted', text: `Dicetak dari sistem ${kop.namaLembaga} pada ${waktu(generatedAt)}.` }
  ];
  return createDocumentPdf({ blocks, footer: invoice.receiptNumber });
}

// Nomor seperti KWT/HI/2026/00001 tidak boleh memakai "/" di nama berkas.
function receiptFileName(invoice) {
  return `${String(invoice.receiptNumber || 'kuitansi').replace(/[^\w.-]+/g, '-')}.pdf`;
}

module.exports = { createReceiptPdf, kepalaKop, receiptFileName };
