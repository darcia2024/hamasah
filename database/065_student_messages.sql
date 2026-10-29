-- Portal santri: pesan personal dari musyrif atau petugas berwenang, dan pengaturan catatan pembinaan
-- yang boleh dilihat santri.
--
-- Aturan privasi (ditegakkan di server/student-message-service.js, bukan sekadar disembunyikan di layar):
--   * Pesan personal bersifat PRIVAT antara staf dan santri. Wali tidak pernah melihatnya otomatis;
--     wali hanya melihat pesan yang secara sengaja DIBAGIKAN oleh staf (shared_with_parent), dan
--     pembagian itu tercatat siapa dan kapan.
--   * Catatan evaluasi tampil ke santri kecuali ditandai disembunyikan; catatan disiplin disembunyikan
--     dari santri kecuali staf menandainya boleh tampil. Pengaturannya di student_note_visibility.
-- Tabel sendiri seperti migrasi 046: selama belum ada, fitur tidak tampil dan penulisan ditolak dengan
-- arahan ke halaman Pengaturan.
CREATE TABLE IF NOT EXISTS student_personal_messages (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  author_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('evaluasi', 'pengingat', 'apresiasi', 'lainnya')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 120),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 5 AND 2000),
  read_at TIMESTAMPTZ,
  shared_with_parent BOOLEAN NOT NULL DEFAULT false,
  shared_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  shared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_personal_messages_student_idx ON student_personal_messages (student_id, created_at DESC);

ALTER TABLE student_personal_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS student_note_visibility (
  record_type TEXT NOT NULL CHECK (record_type IN ('evaluations', 'violations')),
  record_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_visible BOOLEAN NOT NULL,
  set_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (record_type, record_id)
);

CREATE INDEX IF NOT EXISTS student_note_visibility_student_idx ON student_note_visibility (student_id);

ALTER TABLE student_note_visibility ENABLE ROW LEVEL SECURITY;
