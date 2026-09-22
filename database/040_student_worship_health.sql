-- Catatan ibadah dan kesehatan santri yang terstruktur.
--
-- Sebelumnya "sholat berjamaah" hanya ditebak dari teks kategori presensi. Sekarang:
--   student_prayer_logs        satu baris per santri, tanggal, dan waktu sholat.
--   student_memorization_logs  setoran hafalan (ziyadah/murajaah) dengan penilaian musyrif.
--   student_health_logs        kondisi kesehatan. Data pribadi spesifik (UU PDP): wali hanya
--                              menerima kondisi dan catatan untuk wali; keluhan dan tindakan
--                              hanya untuk staf. Fitur ini dikunci HEALTH_RECORDS_ENABLED
--                              sampai kebijakan privasi memuatnya.
CREATE TABLE IF NOT EXISTS student_prayer_logs (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  prayer_date DATE NOT NULL,
  prayer TEXT NOT NULL CHECK (prayer IN ('subuh', 'dzuhur', 'ashar', 'maghrib', 'isya')),
  status TEXT NOT NULL CHECK (status IN ('berjamaah', 'munfarid', 'tidak', 'izin')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, prayer_date, prayer)
);

CREATE TABLE IF NOT EXISTS student_memorization_logs (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ziyadah', 'murajaah')),
  portion TEXT NOT NULL CHECK (char_length(portion) BETWEEN 2 AND 120),
  grade TEXT NOT NULL CHECK (grade IN ('lancar', 'kurang-lancar', 'ulang')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_health_logs (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('sehat', 'sakit-ringan', 'perlu-perhatian', 'dirujuk')),
  complaint TEXT CHECK (complaint IS NULL OR char_length(complaint) <= 500),
  action_taken TEXT CHECK (action_taken IS NULL OR char_length(action_taken) <= 500),
  parent_note TEXT CHECK (parent_note IS NULL OR char_length(parent_note) <= 500),
  recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_prayer_logs_student_date_idx ON student_prayer_logs (student_id, prayer_date DESC);
CREATE INDEX IF NOT EXISTS student_memorization_logs_student_idx ON student_memorization_logs (student_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS student_health_logs_student_idx ON student_health_logs (student_id, occurred_on DESC);

ALTER TABLE student_prayer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_memorization_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_health_logs ENABLE ROW LEVEL SECURITY;
