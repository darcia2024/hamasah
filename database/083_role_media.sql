-- Role baru: 'media' (Tim Media), pengelola dokumentasi kegiatan umum dan kelembagaan.
--
-- Hanya menyentuh Galeri beranda, jadi akun ini tidak membaca data santri atau keuangan.
-- Constraint lama dihapus lebih dulu karena CHECK tidak bisa diubah di tempat.

ALTER TABLE accounts DROP CONSTRAINT accounts_role_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_role_check
  CHECK (role IN ('admin', 'registration-officer', 'supervisor', 'teacher', 'finance', 'media', 'parent', 'student'));
