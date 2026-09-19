-- Mencegah snapshot registrasi lama menimpa perubahan yang baru disimpan.
ALTER TABLE registrations
  ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1
  CHECK (row_version > 0);
