-- Email ke wali saat izin santri diputuskan dan saat ada pengumuman baru untuk wali.
-- Hanya menambah jenis item di antrean notifikasi; tidak ada tabel baru.
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_notification_type_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_notification_type_check
  CHECK (notification_type IN (
    'account-invitation', 'password-reset', 'visa-reminder',
    'registration-status', 'document-revision', 'payment-received',
    'departure-assigned', 'departure-updated',
    'invoice-issued', 'invoice-reminder',
    'leave-decided', 'announcement-published'
  ));
