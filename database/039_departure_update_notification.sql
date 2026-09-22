-- Email ke anggota kloter saat tanggal, asal keberangkatan, atau status kloter berubah.
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_notification_type_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_notification_type_check
  CHECK (notification_type IN (
    'account-invitation', 'password-reset', 'visa-reminder',
    'registration-status', 'document-revision', 'payment-received',
    'departure-assigned', 'departure-updated'
  ));
