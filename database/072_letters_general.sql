-- Surat umum: surat masuk dan keluar untuk lembaga (undangan, surat dinas, korespondensi) yang tidak terikat pada satu santri.
-- Surat umum mencatat pengirim atau penerimanya (counterparty) dan hanya dikelola admin dan petugas pendaftaran.
-- Dua jenis surat umum ditambahkan sebagai bawaan dan, seperti empat jenis awal, belum dikonfirmasi dari template asli.
ALTER TABLE letters ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE letters ADD COLUMN IF NOT EXISTS counterparty TEXT NOT NULL DEFAULT '' CHECK (char_length(counterparty) <= 160);
ALTER TABLE letters DROP CONSTRAINT IF EXISTS letters_student_or_counterparty;
ALTER TABLE letters ADD CONSTRAINT letters_student_or_counterparty CHECK (student_id IS NOT NULL OR char_length(counterparty) >= 3);

INSERT INTO letter_types (code, name, direction, exit_flow, sort_order) VALUES
  ('surat-umum-masuk', 'Surat umum masuk (lembaga)', 'masuk', false, 110),
  ('surat-umum-keluar', 'Surat umum keluar (lembaga)', 'keluar', false, 120)
ON CONFLICT DO NOTHING;
