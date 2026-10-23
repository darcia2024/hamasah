'use strict';
const { whatsappUrl } = require('../website/whatsapp-message.js');
const { NOMOR_WA_BAWAAN } = require('./site-content.js');

function draft(message, { phone = '', recipientName = '' } = {}) {
  return { channel: 'whatsapp-manual', recipientName, message,
    requiresContactSelection: !phone,
    url: phone ? whatsappUrl(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`,
    sent: false };
}

function invitationDraft(account, activationUrl) {
  return draft(`Assalamu'alaikum ${account.name},\n\nAkun Hamasah International untuk ${account.email} sudah disiapkan. Silakan buat kata sandi melalui tautan berikut:\n${activationUrl}\n\nTautan ini bersifat pribadi dan memiliki masa berlaku terbatas. Jangan bagikan kepada orang lain.\n\nWassalamu'alaikum,\nTim Hamasah International`, { recipientName: account.name });
}

async function supportDraft(services, purpose) {
  let phone = NOMOR_WA_BAWAAN;
  try { const content = await services.siteContentService.untukHalaman(); phone = content.nilai.kontak.whatsapp || phone; } catch {}
  return draft(`Assalamu'alaikum, admin Hamasah International. Saya memerlukan bantuan ${purpose}. Mohon panduan verifikasi identitas melalui kanal resmi.`, { phone, recipientName: 'Admin Hamasah International' });
}

async function invoiceDrafts(database, invoice, appBaseUrl) {
  const { rows } = await database.query(`SELECT a.name, a.email, s.name AS student_name,
      CASE WHEN lower(a.email) = lower(r.guardian_email) THEN r.guardian_phone_e164 ELSE NULL END AS phone
    FROM student_parent_accounts pa JOIN accounts a ON a.id=pa.parent_account_id AND a.active=TRUE AND a.role='parent'
    JOIN students s ON s.id=pa.student_id LEFT JOIN registrations r ON r.id=s.registration_id
    WHERE pa.student_id=$1 ORDER BY a.name`, [invoice.studentId]);
  const amount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(invoice.amount);
  return rows.map(row => draft(`Assalamu'alaikum Bapak/Ibu ${row.name},\n\n${invoice.status === 'paid' ? 'Pembayaran telah diterima' : 'Informasi tagihan'} untuk ananda ${row.student_name}.\nNomor tagihan: ${invoice.number}\nKeterangan: ${invoice.description}\nNominal: ${amount}\nStatus: ${invoice.status === 'paid' ? 'Lunas' : 'Belum dibayar'}${invoice.receiptNumber ? `\nNomor kuitansi: ${invoice.receiptNumber}` : ''}\n\nRincian terbaru tersedia di ${appBaseUrl}/portal.\n\nWassalamu'alaikum,\nTim Keuangan Hamasah International`, { phone: row.phone || '', recipientName: row.name }));
}

module.exports = { draft, invitationDraft, invoiceDrafts, supportDraft };
