-- "Kirim doa untuk ananda": pesan atau doa dari wali untuk musyrif asrama anaknya.
--
-- Hanya dibaca musyrif asrama santri itu dan admin; santri sendiri tidak membacanya.
-- Tabel sendiri seperti migrasi 044 dan 045: selama belum ada, fitur ini tidak tampil
-- dan pengirimannya ditolak dengan arahan ke halaman Pengaturan.
-- Lihat server/student-life-service.js.
CREATE TABLE IF NOT EXISTS family_messages (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 5 AND 1000),
  read_at TIMESTAMPTZ,
  read_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_messages_student_idx ON family_messages (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS family_messages_unread_idx ON family_messages (created_at DESC) WHERE read_at IS NULL;

ALTER TABLE family_messages ENABLE ROW LEVEL SECURITY;
