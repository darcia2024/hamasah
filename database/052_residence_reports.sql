-- Iqamah santri (17 Oktober 2026). Tanggal habis iqamah yang sudah dicek tetap disimpan di
-- visa_tracking.visa_expires_at ("visa atau iqamah"), supaya halaman Visa, pengingat admin,
-- dan dashboard memakai satu sumber. Migrasi ini menambah dua hal:
--   residence_reports  : laporan tanggal iqamah baru dari santri, menunggu dicek musyrif
--                        atau admin sebelum dipakai.
--   residence_renewals : penanda bahwa perpanjangan sedang diurus, supaya musyrif tahu
--                        santri yang sudah lewat batas mulai mengurus memang sedang jalan.
-- Lihat server/residence-service.js. Selama tabel belum ada, kartu iqamah menampilkan
-- tanggal dari visa_tracking saja dan laporan ditolak dengan arahan ke halaman Pengaturan.

CREATE TABLE IF NOT EXISTS residence_reports (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires_on DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  status TEXT NOT NULL CHECK (status IN ('menunggu', 'diterima', 'ditolak')),
  reported_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 300)
);

CREATE INDEX IF NOT EXISTS residence_reports_student_idx ON residence_reports (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS residence_reports_pending_idx ON residence_reports (status) WHERE status = 'menunggu';

CREATE TABLE IF NOT EXISTS residence_renewals (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  started_on DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE residence_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE residence_renewals ENABLE ROW LEVEL SECURITY;
