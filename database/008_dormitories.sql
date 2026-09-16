-- Asrama dan penugasan musyrif.
--
-- Sebelum ini setiap musyrif melihat seluruh santri. Untuk lembaga dengan beberapa
-- asrama, itu berarti catatan pelanggaran dan evaluasi santri putri terbuka bagi
-- musyrif putra, dan sebaliknya. Setelah migrasi ini, musyrif hanya melihat santri
-- di asrama yang ditugaskan kepadanya.
--
-- Nama asrama TIDAK ditanam di sini. Daftar asrama diisi admin lewat halaman
-- monitoring, karena nama dan jumlahnya milik lembaga, bukan milik aplikasi.

CREATE TABLE dormitories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) >= 2),
  area TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('putra', 'putri')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE dormitories ENABLE ROW LEVEL SECURITY;

-- Kolom dibiarkan boleh kosong: santri yang sudah ada belum punya data ini, dan
-- mengisinya adalah pekerjaan admin, bukan tebakan migrasi.
ALTER TABLE students ADD COLUMN gender TEXT CHECK (gender IN ('putra', 'putri'));
ALTER TABLE students ADD COLUMN dormitory_id UUID REFERENCES dormitories(id) ON DELETE SET NULL;

CREATE TABLE staff_dormitory_assignments (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, dormitory_id)
);
ALTER TABLE staff_dormitory_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX students_dormitory_id_idx ON students (dormitory_id);
