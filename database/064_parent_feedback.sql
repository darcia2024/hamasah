-- Portal wali: kritik, saran, apresiasi, dan keluhan privat dari wali.
--
-- Keluhan selalu privat: hanya admin yang membacanya, tidak sampai ke musyrif. Kritik, saran, dan
-- apresiasi dibaca admin dan musyrif asrama santri yang dimaksud (bila menyebut ananda). Wali hanya
-- melihat kirimannya sendiri beserta status dan balasannya.
-- Tabel sendiri seperti migrasi 046: selama belum ada, formulir tidak tampil dan pengiriman ditolak
-- dengan arahan ke halaman Pengaturan. Lihat server/parent-feedback-service.js.
CREATE TABLE IF NOT EXISTS parent_feedback (
  id UUID PRIMARY KEY,
  parent_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('kritik', 'saran', 'apresiasi', 'keluhan')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 120),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'dibaca', 'ditindaklanjuti')),
  reply TEXT CHECK (reply IS NULL OR char_length(reply) BETWEEN 2 AND 1000),
  handled_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parent_feedback_parent_idx ON parent_feedback (parent_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS parent_feedback_open_idx ON parent_feedback (created_at DESC) WHERE status <> 'ditindaklanjuti';

ALTER TABLE parent_feedback ENABLE ROW LEVEL SECURITY;
