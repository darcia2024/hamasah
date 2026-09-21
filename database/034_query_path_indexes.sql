-- Index untuk jalur query yang sering dipakai (Task R6.5).
--
-- Migrasi ini hanya menambah index; tidak mengubah data atau kolom. IF NOT EXISTS, jadi aman
-- dijalankan ulang. Tabel-tabel ini kecil di awal, sehingga penambahan index tidak
-- mengunci lama. Kolom pengurutan dicocokkan dengan ORDER BY di store, bukan ditebak.

-- Wali membuka portal: PK-nya (student_id, parent_account_id) tidak membantu mencari
-- "santri milik wali ini". Dipakai oleh daftar santri (EXISTS ... parent_account_id = $1).
CREATE INDEX IF NOT EXISTS student_parent_accounts_parent_idx
  ON student_parent_accounts (parent_account_id);

-- Daftar santri per maddah: PK-nya (student_id, course_id) hanya membantu arah sebaliknya.
CREATE INDEX IF NOT EXISTS course_enrollments_course_idx
  ON course_enrollments (course_id);

-- Dashboard santri membaca tiga tabel rekam jejak ini dengan
--   WHERE student_id = $1 ORDER BY occurred_at DESC, created_at DESC
-- (postgres-student-store.js byStudent). student_activities dan student_attendance sudah punya
-- index sejak migrasi 001; tiga tabel ini terlewat.
CREATE INDEX IF NOT EXISTS achievements_student_idx
  ON student_achievements (student_id, occurred_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS evaluations_student_idx
  ON student_evaluations (student_id, occurred_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS violations_student_idx
  ON student_violations (student_id, occurred_at DESC, created_at DESC);

-- Daftar berpaginasi yang ditambahkan Task R6.1 dan R6.2 mengurutkan tanpa filter:
--   registrations ORDER BY updated_at DESC, id      (index status+updated_at tidak melayani ini)
--   invoices      ORDER BY issued_at DESC, id
--   students      ORDER BY name ASC, id
CREATE INDEX IF NOT EXISTS registrations_updated_idx
  ON registrations (updated_at DESC, id);
CREATE INDEX IF NOT EXISTS invoices_issued_idx
  ON invoices (issued_at DESC, id);
CREATE INDEX IF NOT EXISTS students_name_idx
  ON students (name, id);
