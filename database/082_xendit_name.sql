-- Penyedia pembayaran Hamasah adalah Xendit. Migrasi 074 menyebutnya Sendit karena salah dengar di rapat.
-- Yang diperbaiki: nilai sumber transaksi dan nama penyedia di pengaturan. Tidak ada data yang hilang.
ALTER TABLE external_payments DROP CONSTRAINT IF EXISTS external_payments_source_check;
UPDATE external_payments SET source = 'xendit' WHERE source = 'sendit';
ALTER TABLE external_payments ADD CONSTRAINT external_payments_source_check CHECK (source IN ('xendit', 'manual'));

UPDATE payment_integration_settings
   SET config = jsonb_set(config, '{providerName}', '"Xendit"')
 WHERE config ->> 'providerName' = 'Sendit';
