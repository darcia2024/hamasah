-- Rekam jejak santri tidak menyimpan siapa yang mencatat.
--
-- student_activities, student_attendance, student_achievements, student_evaluations,
-- dan student_violations dibuat di migrasi 001 tanpa kolom pelaku. Hanya koreksinya
-- yang punya jejak, lewat student_record_corrections.actor_account_id di migrasi 024.
-- Untuk student_violations, yaitu catatan pelanggaran santri, ketiadaan jejak pembuat
-- adalah masalah tata kelola: catatan bisa muncul tanpa dapat ditelusuri siapa yang
-- menulisnya. Bandingkan dengan registration_status_events yang sudah punya
-- changed_by_account_id sejak migrasi 005.
--
-- Nullable, supaya baris yang sudah ada tetap terbaca tanpa perlu ditebak pelakunya.
-- ON DELETE SET NULL, supaya riwayat bertahan meski akun staf dihapus, mengikuti
-- alasan yang sudah ditulis di migrasi 005.

ALTER TABLE student_activities
  ADD COLUMN recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE student_attendance
  ADD COLUMN recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE student_achievements
  ADD COLUMN recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE student_evaluations
  ADD COLUMN recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE student_violations
  ADD COLUMN recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
