-- Notifikasi peristiwa penting lewat email (Task R8.3, keputusan K10: email sekarang,
-- WhatsApp menunggu Phase 16). Tiga jenis baru di outbox: perubahan status pendaftaran,
-- berkas perlu diperbaiki, dan pembayaran diterima. Isinya dienkripsi di payload seperti
-- pemulihan kode akses, lalu dirender dan dikirim worker notifikasi.
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_notification_type_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_notification_type_check
  CHECK (notification_type IN (
    'account-invitation', 'password-reset', 'visa-reminder',
    'registration-status', 'document-revision', 'payment-received'
  ));
