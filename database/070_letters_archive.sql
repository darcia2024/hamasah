-- Surat masuk, surat keluar, dan arsip: formulir pendaftaran offline yang ditandatangani, pernyataan wali terhadap tata
-- tertib, permohonan pengunduran diri santri, dan pernyataan wali saat santri keluar. Setiap surat melewati verifikasi dan
-- persetujuan, lalu diarsipkan sebagai PDF. Permohonan pengunduran diri membawa daftar periksa keluar (dokumen, tagihan,
-- inventaris, kemungkinan refund AC) yang harus beres sebelum santri dinyatakan keluar.
--
-- Rapat menyebut empat jenis surat, tetapi daftar finalnya belum dikonfirmasi dari template asli. Karena itu keempat jenis
-- di bawah diberi tanda confirmed = false; admin dapat mengubah, menambah, lalu mengonfirmasi daftarnya.
-- Lihat server/letter-archive-service.js.
CREATE TABLE IF NOT EXISTS letter_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL CHECK (code ~ '^[a-z0-9-]{3,60}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  direction TEXT NOT NULL CHECK (direction IN ('masuk', 'keluar')),
  exit_flow BOOLEAN NOT NULL DEFAULT false,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order SMALLINT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS letter_types_code_idx ON letter_types (code);

ALTER TABLE letter_types ENABLE ROW LEVEL SECURITY;

INSERT INTO letter_types (code, name, direction, exit_flow, sort_order) VALUES
  ('formulir-pendaftaran-offline', 'Formulir pendaftaran offline (bertanda tangan)', 'masuk', false, 10),
  ('pernyataan-tata-tertib', 'Pernyataan persetujuan wali terhadap tata tertib', 'masuk', false, 20),
  ('permohonan-pengunduran-diri', 'Permohonan pengunduran diri santri', 'masuk', true, 30),
  ('pernyataan-wali-keluar', 'Pernyataan wali saat santri keluar', 'masuk', false, 40)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS letters (
  id UUID PRIMARY KEY,
  reference_no TEXT NOT NULL UNIQUE,
  type_id UUID NOT NULL REFERENCES letter_types(id),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 160),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  letter_date DATE NOT NULL,
  file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan', 'diverifikasi', 'disetujui', 'ditolak')),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  decided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT NOT NULL DEFAULT '' CHECK (char_length(decision_note) <= 500),
  exit_completed_at TIMESTAMPTZ,
  exit_completed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS letters_status_idx ON letters (status, created_at DESC);
CREATE INDEX IF NOT EXISTS letters_student_idx ON letters (student_id, created_at DESC);

ALTER TABLE letters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS letter_events (
  id UUID PRIMARY KEY,
  letter_id UUID NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('dibuat', 'verifikasi', 'persetujuan', 'penolakan', 'daftar-keluar', 'keluar')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS letter_events_letter_idx ON letter_events (letter_id, created_at);

ALTER TABLE letter_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS exit_checklist_items (
  letter_id UUID NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('dokumen', 'tagihan', 'inventaris', 'refund-ac')),
  status TEXT NOT NULL DEFAULT 'belum' CHECK (status IN ('belum', 'beres', 'bermasalah', 'tidak-berlaku')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  checked_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ,
  PRIMARY KEY (letter_id, kind)
);

ALTER TABLE exit_checklist_items ENABLE ROW LEVEL SECURITY;
