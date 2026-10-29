-- LMS internal khusus santri Hamasah (item 17): maddah dikelompokkan per program dan jenjang, hak akses
-- mengikuti keanggotaan program (opsional per maddah), dan musyrif mencatat kehadiran sesi belajar bersama.
--
--   courses.program_id / level / auto_access : pengelompokan dan hak akses otomatis berdasarkan peserta batch aktif.
--   course_enrollments.source               : 'manual' (didaftarkan staf) atau 'program' (disinkronkan dari batch).
--                                             Hanya baris 'program' yang dicabut otomatis saat santri keluar dari program.
--   course_sessions / course_session_attendance : sesi belajar bersama dan kehadirannya. Riwayat tidak dihapus.
-- Lihat server/lms-program-service.js.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT '' CHECK (char_length(level) <= 60);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS auto_access BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'program'));

CREATE INDEX IF NOT EXISTS courses_program_idx ON courses (program_id) WHERE program_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS course_sessions (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  material_id UUID,
  dormitory_id UUID REFERENCES dormitories(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  held_on DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS course_sessions_course_idx ON course_sessions (course_id, held_on DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS course_session_attendance (
  session_id UUID NOT NULL REFERENCES course_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('hadir', 'izin', 'sakit', 'alpa')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS course_session_attendance_student_idx ON course_session_attendance (student_id);

ALTER TABLE course_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_session_attendance ENABLE ROW LEVEL SECURITY;
