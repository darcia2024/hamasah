-- Kehidupan santri: peta hafalan 30 juz, pengumuman, dan pengajuan izin.
--
-- Tabel sendiri, seperti migrasi 044, supaya kode boleh online lebih dulu: selama tabel
-- belum ada, ketiga fitur ini tidak tampil dan penyimpanannya ditolak dengan arahan ke
-- halaman Pengaturan. Lihat server/student-life-service.js.

-- Status hafalan per juz. Juz tanpa baris berarti belum dihafal.
CREATE TABLE IF NOT EXISTS student_juz_progress (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  juz SMALLINT NOT NULL CHECK (juz BETWEEN 1 AND 30),
  status TEXT NOT NULL CHECK (status IN ('sedang', 'hafal')),
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, juz)
);

-- Pengumuman dari admin (semua asrama atau satu asrama) dan musyrif (asrama yang dia
-- pegang). audience: santri, wali, atau keduanya.
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  audience TEXT NOT NULL CHECK (audience IN ('santri', 'wali', 'semua')),
  dormitory_id UUID REFERENCES dormitories(id) ON DELETE CASCADE,
  expires_on DATE,
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_created_idx ON announcements (created_at DESC);

-- Pengajuan izin dari santri, diputuskan musyrif asramanya atau admin. Izin yang disetujui
-- juga dicatat sebagai kehadiran berstatus izin (student_attendance), lihat attendance_id.
CREATE TABLE IF NOT EXISTS student_leave_requests (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('keluar-asrama', 'sakit', 'lainnya')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 500),
  status TEXT NOT NULL CHECK (status IN ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 300),
  decided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  attendance_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_leave_requests_student_idx ON student_leave_requests (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS student_leave_requests_status_idx ON student_leave_requests (status, created_at DESC);

ALTER TABLE student_juz_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_leave_requests ENABLE ROW LEVEL SECURITY;
