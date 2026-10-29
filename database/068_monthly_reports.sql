-- Rapor bulanan santri: pengaturan penilaian yang bisa diubah admin, dan rapor per santri per bulan dengan alur
-- susun (draft) -> tinjau (review) -> terbitkan (published). Wali dan santri hanya melihat yang sudah terbit.
--
-- Bobot indikator, batas nilai A/B/C, target, dan siapa yang berhak menerbitkan TIDAK ditulis mati di kode: semuanya ada di
-- report_card_settings. Nilai awal di bawah hanya bawaan yang bisa diubah admin dari halaman Kegiatan dan Rapor.
-- Setiap rapor menyimpan salinan pengaturan yang dipakai (snapshot), jadi riwayat tidak berubah saat pengaturan diganti.
-- Lihat server/report-card-service.js.
CREATE TABLE IF NOT EXISTS report_card_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL,
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE report_card_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO report_card_settings (id, config) VALUES (1, '{
  "weights": { "attendance": 30, "tahfidz": 35, "discipline": 20, "participation": 15 },
  "grades": { "A": 85, "B": 70 },
  "tahfidzTargetAyat": 40,
  "participationTarget": 4,
  "disciplinePenalty": { "ringan": 5, "sedang": 10, "berat": 20 },
  "publishRoles": ["admin"],
  "pdfEnabled": true
}'::jsonb) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS monthly_reports (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  snapshot JSONB NOT NULL,
  musyrif_note TEXT NOT NULL DEFAULT '' CHECK (char_length(musyrif_note) <= 2000),
  recommendation TEXT NOT NULL DEFAULT '' CHECK (char_length(recommendation) <= 1000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  generated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  published_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  UNIQUE (student_id, month)
);

CREATE INDEX IF NOT EXISTS monthly_reports_month_idx ON monthly_reports (month, status);

ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;
