-- Pengingat visa dan paspor (Task R8.2).
--
-- Sebelumnya worker pengingat hanya menyimpan "sudah diingatkan" di memori, jadi setiap
-- restart mengirim ulang semuanya. Tabel ini menyimpan kunci pengingat yang sudah terkirim
-- (santri:dokumen:tanggal kedaluwarsa). Tanggal yang diperbarui menghasilkan kunci baru,
-- sehingga dokumen yang diperpanjang lalu mendekati kedaluwarsa lagi tetap diingatkan.
CREATE TABLE IF NOT EXISTS visa_reminder_log (
  reminder_key TEXT PRIMARY KEY CHECK (char_length(reminder_key) BETWEEN 3 AND 200),
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visa_reminder_log ENABLE ROW LEVEL SECURITY;

-- Jejak pengiriman ringkasan pengingat ikut tercatat di outbox seperti email lain.
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_notification_type_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_notification_type_check
  CHECK (notification_type IN ('account-invitation', 'password-reset', 'visa-reminder'));
