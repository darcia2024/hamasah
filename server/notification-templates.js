// Isi email untuk notifikasi peristiwa (Task R8.3). Dipakai worker notifikasi saat item
// outbox dikirim. Semua nilai dari payload di-escape.
//
// Salam, penutup, judul, dan kalimat utama tiap email bisa diubah super admin di halaman
// Template (server/templates.js, blok "email"); rincian seperti daftar perubahan kloter tetap
// disusun di sini. Rekening resmi dari blok "kop" ikut dicantumkan di email tagihan.
const { escapeHtml } = require('./seo.js');
const { BAWAAN, barisRekening, isiTeks } = require('./templates.js');

const EVENT_TYPES = Object.freeze({
  REGISTRATION_STATUS: 'registration-status',
  DOCUMENT_REVISION: 'document-revision',
  PAYMENT_RECEIVED: 'payment-received',
  DEPARTURE_ASSIGNED: 'departure-assigned',
  DEPARTURE_UPDATED: 'departure-updated',
  INVOICE_ISSUED: 'invoice-issued',
  INVOICE_REMINDER: 'invoice-reminder'
});

const LABEL_PERUBAHAN = Object.freeze({ plannedDate: 'Rencana berangkat', origin: 'Berangkat dari', status: 'Status kloter' });
const STATUS_KLOTER = Object.freeze({ planned: 'Direncanakan', confirmed: 'Terkonfirmasi', departed: 'Sudah berangkat', cancelled: 'Dibatalkan' });

function nilaiPerubahan(field, value) {
  if (field === 'plannedDate') return tanggalPanjang(value);
  if (field === 'status') return STATUS_KLOTER[value] || value || '-';
  return value || 'belum ditetapkan';
}

function tanggalPanjang(value) {
  if (!value) return 'belum ditetapkan';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
}

function rupiah(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

// Nilai isian untuk satu jenis email. atasNama sudah berupa potongan kalimat (" atas nama X").
function nilaiIsian(payload) {
  return {
    nomor: payload.registrationId || '',
    status: payload.statusLabel || '',
    kloter: payload.departureName || '',
    tagihan: payload.invoiceNumber || '',
    kuitansi: payload.receiptNumber || '',
    keterangan: payload.description || '',
    jumlah: rupiah(payload.amount),
    atasNama: payload.studentName ? ` atas nama ${payload.studentName}` : ''
  };
}

// Template teks biasa menjadi HTML: teks admin di-escape, nilai isian ditebalkan (kecuali
// atasNama dan nama, yang menyatu dengan kalimat).
function kalimatHtml(template, nilai) {
  return escapeHtml(template).replace(/\{([^{}\s]+)\}/g, (cocok, nama) => {
    if (!Object.prototype.hasOwnProperty.call(nilai, nama)) return cocok;
    const isi = escapeHtml(nilai[nama]);
    return nama === 'atasNama' || nama === 'nama' ? isi : `<strong>${isi}</strong>`;
  });
}

// templates: { email, kop } dari halaman Template; tanpa itu dipakai bawaan.
function eventMessage(type, payload, appBaseUrl, templates = {}) {
  const email = templates.email || BAWAAN.email;
  const kop = templates.kop || BAWAAN.kop;
  const jenis = email.jenis && email.jenis[type];
  if (!jenis) return null;

  const nilai = nilaiIsian(payload);
  const salam = `<p>${kalimatHtml(email.salam, { nama: payload.name || '' })}</p>`;
  const penutup = `<p>${escapeHtml(email.penutup)}</p>`;
  const pembuka = `<p>${kalimatHtml(jenis.pembuka, nilai)}</p>`;
  const subject = isiTeks(jenis.judul, nilai);
  const cekStatus = `${appBaseUrl}/website/cek-status.html`;

  if (type === EVENT_TYPES.REGISTRATION_STATUS) {
    const revisi = payload.status === 'needs-revision'
      ? '<p>Ada berkas yang perlu diperbaiki. Buka halaman cek status untuk melihat catatan petugas dan mengunggah ulang berkas.</p>'
      : '';
    return {
      subject,
      html: `${salam}${pembuka}${revisi}<p><a href="${escapeHtml(cekStatus)}">Cek status pendaftaran</a> dengan nomor pendaftaran dan kode akses Anda.</p>${penutup}`
    };
  }
  if (type === EVENT_TYPES.DOCUMENT_REVISION) {
    const catatan = payload.note ? `<p>Catatan petugas: ${escapeHtml(payload.note)}</p>` : '';
    return {
      subject,
      html: `${salam}${pembuka}${catatan}<p><a href="${escapeHtml(cekStatus)}">Buka halaman cek status</a> untuk mengunggah berkas pengganti.</p>${penutup}`
    };
  }
  if (type === EVENT_TYPES.DEPARTURE_ASSIGNED) {
    const catatan = payload.note ? `<p>Catatan dari tim: ${escapeHtml(payload.note)}</p>` : '';
    return {
      subject,
      html: `${salam}${pembuka}<ul><li>Rencana berangkat: ${escapeHtml(tanggalPanjang(payload.plannedDate))}</li><li>Berangkat dari: ${escapeHtml(payload.origin || 'belum ditetapkan')}</li><li>Status kloter: ${escapeHtml(payload.statusLabel || '')}</li></ul>${catatan}<p>Jadwal dapat berubah; informasi terbaru selalu ada di <a href="${escapeHtml(cekStatus)}">halaman cek status</a>.</p>${penutup}`
    };
  }
  if (type === EVENT_TYPES.DEPARTURE_UPDATED) {
    const daftar = (payload.changes || []).map((change) => `<li>${escapeHtml(LABEL_PERUBAHAN[change.field] || change.field)}: ${escapeHtml(nilaiPerubahan(change.field, change.from))} menjadi <strong>${escapeHtml(nilaiPerubahan(change.field, change.to))}</strong></li>`).join('');
    const dibatalkan = (payload.changes || []).some((change) => change.field === 'status' && change.to === 'cancelled')
      ? '<p>Kloter ini dibatalkan. Tim Hamasah akan menghubungi Anda mengenai jadwal pengganti.</p>'
      : '';
    return {
      subject,
      html: `${salam}${pembuka}<ul>${daftar}</ul>${dibatalkan}<p>Informasi terbaru selalu ada di <a href="${escapeHtml(cekStatus)}">halaman cek status</a>.</p>${penutup}`
    };
  }
  if (type === EVENT_TYPES.PAYMENT_RECEIVED) {
    return {
      subject,
      html: `${salam}${pembuka}<p>Nomor kuitansi: <strong>${escapeHtml(payload.receiptNumber)}</strong>. Kuitansi dapat diunduh di <a href="${escapeHtml(`${appBaseUrl}/website/portal.html`)}">portal wali</a>.</p>${penutup}`
    };
  }
  // INVOICE_ISSUED dan INVOICE_REMINDER
  const portal = `${appBaseUrl}/website/portal.html`;
  const sudahBayar = type === EVENT_TYPES.INVOICE_REMINDER
    ? '<p>Bila pembayaran sudah dilakukan, mohon abaikan email ini atau kabari bagian keuangan agar segera kami catat.</p>'
    : '';
  const rekening = barisRekening(kop.rekening);
  const bagianRekening = rekening.length
    ? `<p>Pembayaran hanya ke rekening resmi berikut:</p><ul>${rekening.map((baris) => `<li>${escapeHtml(baris)}</li>`).join('')}</ul>`
    : '';
  return {
    subject,
    html: `${salam}${pembuka}${sudahBayar}${bagianRekening}<p>Rincian tagihan dapat dilihat di <a href="${escapeHtml(portal)}">portal wali</a>.</p>${penutup}`
  };
}

module.exports = { EVENT_TYPES, eventMessage };
