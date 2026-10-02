-- Roadmap studi dan santri teladan bulanan (Hall of Fame).
--
-- Disimpan di tabel sendiri, bukan kolom baru di students, supaya kode boleh online lebih
-- dulu daripada migrasi ini: selama tabelnya belum ada, roadmap dan Hall of Fame tidak
-- tampil dan penyimpanannya ditolak, sementara data santri lainnya tetap berjalan.
-- Lihat server/student-journey-service.js.

-- Fase studi santri saat ini. Nama fase ada di kode per kelompok program
-- (server/student-journey-service.js); yang disimpan hanya nomor urutnya.
CREATE TABLE IF NOT EXISTS student_study_phases (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  phase SMALLINT NOT NULL CHECK (phase BETWEEN 1 AND 20),
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Santri teladan per bulan, dipilih admin. Dilihat santri dan wali yang masuk portal,
-- tidak pernah di halaman publik.
CREATE TABLE IF NOT EXISTS student_honors (
  id UUID PRIMARY KEY,
  honor_month DATE NOT NULL CHECK (extract(day FROM honor_month) = 1),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 300),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (honor_month, student_id)
);

CREATE INDEX IF NOT EXISTS student_honors_month_idx ON student_honors (honor_month DESC);

ALTER TABLE student_study_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_honors ENABLE ROW LEVEL SECURITY;
