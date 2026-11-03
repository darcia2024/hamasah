-- Hadiah dan apresiasi santri berprestasi (dokumen "Follow up Website"). Wujudnya ditetapkan Direktur Asrama dan harus
-- mendidik. Catatan tidak dihapus: pembatalan disimpan dengan alasan supaya riwayatnya tetap utuh.
-- Lihat server/student-reward-service.js.
CREATE TABLE IF NOT EXISTS student_rewards (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('buku', 'piagam', 'fasilitas', 'lainnya')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  awarded_on DATE NOT NULL,
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  void_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(void_reason) <= 300),
  voided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS student_rewards_student_idx ON student_rewards (student_id, awarded_on DESC);

ALTER TABLE student_rewards ENABLE ROW LEVEL SECURITY;
