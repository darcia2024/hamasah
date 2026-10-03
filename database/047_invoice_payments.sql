-- Rincian pembayaran tagihan dan pengingat tagihan ke wali.
--
-- invoice_payments: tanggal bayar sebenarnya (bisa berbeda dari hari dicatat), metode,
-- dan catatan, diisi saat keuangan menandai tagihan lunas. Ikut tercetak di kuitansi.
-- invoice_reminders: catatan setiap pengingat email ke wali, dipakai juga untuk membatasi
-- satu pengingat per tagihan per 24 jam.
-- Tabel sendiri seperti migrasi 044-046: selama belum ada, tagihan tetap bisa ditandai
-- lunas tanpa rincian, dan tombol pengingat ditolak dengan arahan ke halaman Pengaturan.
-- Lihat server/operations-service.js.
CREATE TABLE IF NOT EXISTS invoice_payments (
  invoice_id UUID PRIMARY KEY REFERENCES invoices(id) ON DELETE CASCADE,
  paid_on DATE NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('transfer', 'tunai', 'lainnya')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_reminders (
  id UUID PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  recipients INTEGER NOT NULL DEFAULT 0 CHECK (recipients >= 0),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_reminders_invoice_idx ON invoice_reminders (invoice_id, sent_at DESC);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;

-- Email tagihan baru dan pengingat tagihan ke wali.
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_notification_type_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_notification_type_check
  CHECK (notification_type IN (
    'account-invitation', 'password-reset', 'visa-reminder',
    'registration-status', 'document-revision', 'payment-received',
    'departure-assigned', 'departure-updated',
    'invoice-issued', 'invoice-reminder'
  ));
