// Isi email untuk notifikasi peristiwa (Task R8.3). Dipakai worker notifikasi saat item
// outbox dikirim. Semua nilai dari payload di-escape.
const { escapeHtml } = require('./seo.js');

const EVENT_TYPES = Object.freeze({
  REGISTRATION_STATUS: 'registration-status',
  DOCUMENT_REVISION: 'document-revision',
  PAYMENT_RECEIVED: 'payment-received'
});

function rupiah(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

function eventMessage(type, payload, appBaseUrl) {
  const salam = `<p>Assalamu'alaikum ${escapeHtml(payload.name || '')},</p>`;
  const penutup = '<p>Email ini dikirim otomatis oleh Hamasah International. Hubungi tim kami lewat halaman kontak bila ada pertanyaan.</p>';
  const cekStatus = `${appBaseUrl}/website/cek-status.html`;
  if (type === EVENT_TYPES.REGISTRATION_STATUS) {
    const revisi = payload.status === 'needs-revision'
      ? '<p>Ada berkas yang perlu diperbaiki. Buka halaman cek status untuk melihat catatan petugas dan mengunggah ulang berkas.</p>'
      : '';
    return {
      subject: `Status pendaftaran ${payload.registrationId}: ${payload.statusLabel}`,
      html: `${salam}<p>Status pendaftaran <strong>${escapeHtml(payload.registrationId)}</strong> kini <strong>${escapeHtml(payload.statusLabel)}</strong>.</p>${revisi}<p><a href="${escapeHtml(cekStatus)}">Cek status pendaftaran</a> dengan nomor pendaftaran dan kode akses Anda.</p>${penutup}`
    };
  }
  if (type === EVENT_TYPES.DOCUMENT_REVISION) {
    const catatan = payload.note ? `<p>Catatan petugas: ${escapeHtml(payload.note)}</p>` : '';
    return {
      subject: `Berkas pendaftaran ${payload.registrationId} perlu diperbaiki`,
      html: `${salam}<p>Salah satu berkas pada pendaftaran <strong>${escapeHtml(payload.registrationId)}</strong> belum dapat diterima dan perlu diunggah ulang.</p>${catatan}<p><a href="${escapeHtml(cekStatus)}">Buka halaman cek status</a> untuk mengunggah berkas pengganti.</p>${penutup}`
    };
  }
  if (type === EVENT_TYPES.PAYMENT_RECEIVED) {
    const atasNama = payload.studentName ? ` atas nama ${escapeHtml(payload.studentName)}` : '';
    return {
      subject: `Pembayaran diterima: ${payload.invoiceNumber}`,
      html: `${salam}<p>Pembayaran untuk tagihan <strong>${escapeHtml(payload.invoiceNumber)}</strong>${atasNama} sebesar <strong>${escapeHtml(rupiah(payload.amount))}</strong> sudah kami terima.</p><p>Nomor kuitansi: <strong>${escapeHtml(payload.receiptNumber)}</strong>. Kuitansi dapat diunduh di <a href="${escapeHtml(`${appBaseUrl}/website/portal.html`)}">portal wali</a>.</p>${penutup}`
    };
  }
  return null;
}

module.exports = { EVENT_TYPES, eventMessage };
