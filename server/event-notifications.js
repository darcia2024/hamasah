// Notifikasi peristiwa penting (Task R8.3, keputusan K10: email sekarang, WhatsApp di Phase 16).
//
// Dipanggil route SETELAH perubahan berhasil disimpan, di titik yang sama dengan pencatatan
// audit, jadi tidak ada jalur perubahan kedua. Item masuk notification_outbox (payload
// terenkripsi) dan dikirim worker notifikasi; kegagalan mengantre dicatat di log dan tidak
// menggagalkan perubahan yang sudah tersimpan.
//
// Aturan penerima:
//   - pendaftaran: email pendaftar dan email wali pada formulir (tanpa duplikat);
//   - pendaftaran berstatus dibatalkan tidak dikirimi apa pun;
//   - pembayaran: akun wali aktif yang terhubung ke santri pemilik tagihan.
// Belum ada preferensi penerima di sistem; bila ditambahkan, periksa di sini.
const registrationDomain = require('../website/registration-domain.js');
const { EVENT_TYPES } = require('./notification-templates.js');

const CANCELLED = registrationDomain.STATUSES.CANCELLED;

function createEventNotifier({ notificationService, registrationStore, database, logger = console } = {}) {
  const aktif = () => Boolean(notificationService && notificationService.canSend() && typeof notificationService.queueEvent === 'function');

  async function queueAll(notificationType, recipients, payload) {
    const unik = [...new Set(recipients.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))];
    for (const recipientEmail of unik) {
      await notificationService.queueEvent({ notificationType, recipientEmail, payload });
    }
    return unik.length;
  }

  async function guarded(label, work) {
    if (!aktif()) return 0;
    try {
      return await work();
    } catch (error) {
      logger.error(`[notifikasi] ${label} gagal diantrekan: ${error.message}`);
      return 0;
    }
  }

  async function registrationTarget(registrationId) {
    const record = await registrationStore.get(registrationId);
    if (!record || record.status === CANCELLED) return null;
    const applicant = record.applicant || {};
    return { record, emails: [applicant.email, applicant.guardianEmail], name: applicant.applicantName || '' };
  }

  return Object.freeze({
    registrationStatusChanged(registrationId) {
      return guarded('perubahan status pendaftaran', async () => {
        const target = await registrationTarget(registrationId);
        if (!target) return 0;
        return queueAll(EVENT_TYPES.REGISTRATION_STATUS, target.emails, {
          name: target.name, registrationId, status: target.record.status,
          statusLabel: registrationDomain.STATUS_LABELS[target.record.status] || target.record.status
        });
      });
    },
    documentRejected(registrationId, documentId) {
      return guarded('berkas perlu diperbaiki', async () => {
        const target = await registrationTarget(registrationId);
        if (!target) return 0;
        const document = (target.record.documents || []).find((item) => item.id === documentId);
        if (!document || document.reviewStatus !== 'rejected') return 0;
        return queueAll(EVENT_TYPES.DOCUMENT_REVISION, target.emails, { name: target.name, registrationId, note: document.reviewNote || '' });
      });
    },
    // Kloter ditetapkan atau dipindah. departure adalah bentuk untuk pendaftar (forApplicant).
    departureAssigned(registrationId, departure) {
      return guarded('kloter keberangkatan', async () => {
        if (!departure) return 0;
        const target = await registrationTarget(registrationId);
        if (!target) return 0;
        return queueAll(EVENT_TYPES.DEPARTURE_ASSIGNED, target.emails, {
          name: target.name, registrationId, departureName: departure.name, plannedDate: departure.plannedDate,
          origin: departure.origin, statusLabel: departure.statusLabel, note: departure.note
        });
      });
    },
    invoicePaid(invoice) {
      return guarded('pembayaran diterima', async () => {
        if (!invoice || !invoice.studentId) return 0;
        const { rows } = await database.query(
          `SELECT a.email, a.name, s.name AS student_name
           FROM student_parent_accounts pa
           JOIN accounts a ON a.id = pa.parent_account_id AND a.active = TRUE
           JOIN students s ON s.id = pa.student_id
           WHERE pa.student_id = $1`,
          [invoice.studentId]
        );
        let jumlah = 0;
        for (const wali of rows) {
          jumlah += await queueAll(EVENT_TYPES.PAYMENT_RECEIVED, [wali.email], {
            name: wali.name, studentName: wali.student_name, invoiceNumber: invoice.number,
            receiptNumber: invoice.receiptNumber, amount: invoice.amount
          });
        }
        return jumlah;
      });
    }
  });
}

module.exports = { createEventNotifier };
