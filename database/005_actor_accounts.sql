-- Riwayat status dan berkas pendaftaran sebelumnya hanya mencatat peran pelaku,
-- sehingga tidak bisa dipakai menelusuri siapa yang melakukan perubahan.
-- Kolom berikut mencatat akun pelaku. ON DELETE SET NULL dipakai agar riwayat tetap ada
-- walaupun akun staf dihapus.

ALTER TABLE registration_status_events
  ADD COLUMN changed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE registration_documents
  ADD COLUMN uploaded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
