-- Pengumuman dan pesan (item 19):
--   announcements.batch_id    : pengumuman untuk peserta aktif satu batch program.
--   announcement_students     : pengumuman untuk santri tertentu (dan wali mereka). Tanpa baris di sini dan tanpa batch,
--                               pengumuman mengikuti aturan lama (semua asrama atau satu asrama).
--   announcement_reads        : status baca per akun penerima, supaya notifikasi belum dibaca dan daftar penerima dapat tampil.
--   parent_feedback.reply_read_at : kapan wali membuka balasan atas masukannya (untuk notifikasi balasan baru).
-- Lihat server/student-life-service.js dan server/inbox-service.js.

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES program_batches(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS announcement_students (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, student_id)
);

CREATE INDEX IF NOT EXISTS announcement_students_student_idx ON announcement_students (student_id);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, account_id)
);

CREATE INDEX IF NOT EXISTS announcement_reads_account_idx ON announcement_reads (account_id);

ALTER TABLE announcement_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

ALTER TABLE parent_feedback ADD COLUMN IF NOT EXISTS reply_read_at TIMESTAMPTZ;
