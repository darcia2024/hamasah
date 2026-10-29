-- Sistem absensi kegiatan: jenis kegiatan yang bisa ditambah admin, sesi kegiatan (jadwal, lokasi, kelompok
-- peserta, petugas), dan absensi per santri.
--
-- Dua hal sengaja dipisahkan:
--   * status SESI (terjadwal, terlaksana, tidak-terlaksana, dibatalkan): keputusan eksplisit petugas, tidak pernah
--     disimpulkan dari ketidakhadiran santri. Kegiatan yang tidak terlaksana tidak menghukum siapa pun.
--   * status ABSENSI santri (hadir, izin, sakit, alpa). "Belum dicatat" berarti belum ada baris.
-- Setiap perubahan absensi sesudah dicatat disimpan di activity_attendance_log lengkap dengan alasan dan pelakunya.
-- Lihat server/activity-attendance-service.js.
CREATE TABLE IF NOT EXISTS activity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_types_name_idx ON activity_types (lower(name));

ALTER TABLE activity_types ENABLE ROW LEVEL SECURITY;

INSERT INTO activity_types (name, description) VALUES
  ('Halaqah pagi', 'Halaqah Al-Qur''an setiap pagi'),
  ('Sekolah', 'Kegiatan belajar di sekolah atau kampus'),
  ('Kajian sore', 'Kajian kitab sore hari'),
  ('LMS malam', 'Belajar di ruang belajar online pada malam hari'),
  ('Kegiatan Jumat', 'Kegiatan khusus hari Jumat'),
  ('Kebersihan', 'Kerja bakti dan kebersihan asrama'),
  ('Acara khusus', 'Acara di luar jadwal rutin')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS activity_sessions (
  id UUID PRIMARY KEY,
  type_id UUID NOT NULL REFERENCES activity_types(id),
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  session_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT NOT NULL DEFAULT '' CHECK (char_length(location) <= 120),
  group_kind TEXT NOT NULL CHECK (group_kind IN ('semua', 'asrama')),
  dormitory_id UUID REFERENCES dormitories(id) ON DELETE CASCADE,
  staff_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'terjadwal' CHECK (status IN ('terjadwal', 'terlaksana', 'tidak-terlaksana', 'dibatalkan')),
  status_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(status_reason) <= 300),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (group_kind <> 'asrama' OR dormitory_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS activity_sessions_date_idx ON activity_sessions (session_date DESC);
CREATE INDEX IF NOT EXISTS activity_sessions_dormitory_idx ON activity_sessions (dormitory_id, session_date DESC);

ALTER TABLE activity_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS activity_attendance (
  session_id UUID NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('hadir', 'izin', 'sakit', 'alpa')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS activity_attendance_student_idx ON activity_attendance (student_id);

ALTER TABLE activity_attendance ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS activity_attendance_log (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  changed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_attendance_log_idx ON activity_attendance_log (session_id, student_id, changed_at DESC);

ALTER TABLE activity_attendance_log ENABLE ROW LEVEL SECURITY;
