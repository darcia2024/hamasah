-- KPI musyrif dan musyrifah: indikator yang dapat dikonfigurasi, penilaian bulanan berikut rekap tahunan, bukti pelaksanaan
-- dan komentar penilai, pencatatan pekerjaan tambahan, dan riwayat penghargaan (bila program reward dijalankan).
--
-- ATURAN: KPI tidak boleh otomatis turun hanya karena ada keluhan wali yang belum diverifikasi. Keluhan hanya berpengaruh bila
-- admin memverifikasinya dan menautkannya ke musyrif tertentu (kolom verified_* dan kpi_account_id di parent_feedback), dan
-- hanya lewat indikator "keluhan terverifikasi" yang nonaktif secara bawaan. Penilai tetap dapat menyesuaikan nilai dengan komentar.
-- Lihat server/kpi-service.js.
CREATE TABLE IF NOT EXISTS kpi_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL CHECK (code ~ '^[a-z0-9-]{3,60}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  source TEXT NOT NULL CHECK (source IN ('kegiatan', 'absensi-terisi', 'tiket', 'pekerjaan-tambahan', 'keluhan-terverifikasi', 'manual')),
  activity_type_id UUID REFERENCES activity_types(id) ON DELETE SET NULL,
  weight NUMERIC(6, 2) NOT NULL DEFAULT 10 CHECK (weight >= 0 AND weight <= 100),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order SMALLINT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kpi_indicators_code_idx ON kpi_indicators (code);

ALTER TABLE kpi_indicators ENABLE ROW LEVEL SECURITY;

INSERT INTO kpi_indicators (code, name, description, source, activity_type_id, weight, active, sort_order) VALUES
  ('halaqah', 'Pelaksanaan halaqah', 'Halaqah yang dipegang musyrif terlaksana sesuai jadwal.', 'kegiatan', (SELECT id FROM activity_types WHERE lower(name) = 'halaqah pagi'), 15, true, 10),
  ('sekolah', 'Pendampingan sekolah', 'Kegiatan sekolah atau kampus yang didampingi terlaksana.', 'kegiatan', (SELECT id FROM activity_types WHERE lower(name) = 'sekolah'), 10, true, 20),
  ('kajian', 'Pelaksanaan kajian', 'Kajian sore yang dipegang terlaksana sesuai jadwal.', 'kegiatan', (SELECT id FROM activity_types WHERE lower(name) = 'kajian sore'), 15, true, 30),
  ('lms', 'Pendampingan LMS malam', 'Belajar LMS malam yang didampingi terlaksana.', 'kegiatan', (SELECT id FROM activity_types WHERE lower(name) = 'lms malam'), 10, true, 40),
  ('kebersihan', 'Kebersihan asrama', 'Kegiatan kebersihan yang dipegang terlaksana.', 'kegiatan', (SELECT id FROM activity_types WHERE lower(name) = 'kebersihan'), 10, true, 50),
  ('absensi-lengkap', 'Kelengkapan absensi', 'Absensi kegiatan terisi lengkap untuk peserta yang menjadi tanggung jawabnya.', 'absensi-terisi', NULL, 15, true, 60),
  ('tugas-administratif', 'Tugas administratif', 'Tiket tindak lanjut yang ditugaskan selesai tepat waktu.', 'tiket', NULL, 15, true, 70),
  ('pekerjaan-tambahan', 'Pekerjaan tambahan', 'Pekerjaan di luar tugas rutin yang sudah diverifikasi (bonus; tidak mengurangi bila tidak ada).', 'pekerjaan-tambahan', NULL, 10, true, 80),
  ('keluhan-terverifikasi', 'Keluhan wali yang terverifikasi', 'Mengurangi nilai hanya bila admin memverifikasi keluhan dan menautkannya ke musyrif. Nonaktif secara bawaan.', 'keluhan-terverifikasi', NULL, 10, false, 90)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS kpi_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL,
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kpi_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO kpi_settings (id, config) VALUES (1, '{ "grades": { "A": 85, "B": 70 }, "extraWorkTarget": 2, "complaintPenalty": 20, "rewardEnabled": false, "confirmedAt": null }'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS kpi_evaluations (
  id UUID PRIMARY KEY,
  musyrif_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  snapshot JSONB NOT NULL,
  adjustments JSONB NOT NULL DEFAULT '{}'::jsonb,
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  computed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ,
  UNIQUE (musyrif_account_id, month)
);

ALTER TABLE kpi_evaluations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS kpi_evidence (
  id UUID PRIMARY KEY,
  musyrif_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  indicator_id UUID REFERENCES kpi_indicators(id) ON DELETE SET NULL,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 1000),
  file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewer_comment TEXT NOT NULL DEFAULT '' CHECK (char_length(reviewer_comment) <= 1000),
  reviewed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS kpi_evidence_musyrif_idx ON kpi_evidence (musyrif_account_id, month);

ALTER TABLE kpi_evidence ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS kpi_extra_work (
  id UUID PRIMARY KEY,
  musyrif_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('santri-sakit', 'pengadaan', 'institusi', 'kegiatan', 'lainnya')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 1000),
  file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan', 'diverifikasi', 'ditolak')),
  verified_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  verification_note TEXT NOT NULL DEFAULT '' CHECK (char_length(verification_note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kpi_extra_work_musyrif_idx ON kpi_extra_work (musyrif_account_id, work_date DESC);

ALTER TABLE kpi_extra_work ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS kpi_rewards (
  id UUID PRIMARY KEY,
  musyrif_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  awarded_on DATE NOT NULL,
  awarded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kpi_rewards ENABLE ROW LEVEL SECURITY;

ALTER TABLE parent_feedback ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE parent_feedback ADD COLUMN IF NOT EXISTS verified_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE parent_feedback ADD COLUMN IF NOT EXISTS verification_note TEXT NOT NULL DEFAULT '' CHECK (char_length(verification_note) <= 500);
ALTER TABLE parent_feedback ADD COLUMN IF NOT EXISTS kpi_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
