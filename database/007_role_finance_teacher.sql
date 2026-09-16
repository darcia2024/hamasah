-- Dua role baru: 'teacher' (guru maddah) dan 'finance' (bagian keuangan).
--
-- Sebelumnya admin merangkap keuangan dan musyrif merangkap guru. Memisahkannya
-- berarti akun yang menerbitkan tagihan tidak otomatis bisa mengubah data santri,
-- dan sebaliknya. Constraint lama dihapus lebih dulu karena CHECK tidak bisa diubah
-- di tempat.

ALTER TABLE accounts DROP CONSTRAINT accounts_role_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_role_check
  CHECK (role IN ('admin', 'registration-officer', 'supervisor', 'teacher', 'finance', 'parent', 'student'));
