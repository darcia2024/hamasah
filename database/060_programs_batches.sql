-- Program pembinaan dan batch (28 Oktober 2026). Hamasah Indonesia memakai pola karantina; Mesir
-- memakai pembinaan dan hunian yang berkelanjutan. Batch BUKAN asrama: batch adalah rombongan
-- peserta dalam satu program pada rentang tanggal tertentu, sedangkan asrama adalah tempat tinggal.
-- Santri bisa mengikuti batch di Indonesia lebih dulu, lalu masuk asrama di Mesir; keduanya
-- tercatat terpisah dan sama-sama melekat pada santri. Lihat server/program-service.js.
--
--   location_staff     : petugas (musyrif atau petugas pendaftaran) yang ditugaskan ke satu lokasi.
--   programs           : master program pembinaan milik satu lokasi (karantina atau pembinaan).
--   program_batches    : batch sebuah program: tanggal mulai, tanggal selesai opsional, status.
--   batch_participants : peserta batch beserta statusnya. Riwayat peserta tidak dihapus saat
--                        batch selesai atau santri pindah; statusnya yang berubah.
-- Selama tabel ini belum ada, halaman Program menampilkan arahan ke halaman Pengaturan.

CREATE TABLE IF NOT EXISTS location_staff (
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  assigned_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, account_id)
);

CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  kind TEXT NOT NULL CHECK (kind IN ('karantina', 'pembinaan')),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, name)
);

CREATE TABLE IF NOT EXISTS program_batches (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  starts_on DATE NOT NULL,
  ends_on DATE,
  status TEXT NOT NULL DEFAULT 'direncanakan' CHECK (status IN ('direncanakan', 'berjalan', 'selesai', 'dibatalkan')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  UNIQUE (program_id, name)
);

CREATE INDEX IF NOT EXISTS program_batches_status_idx ON program_batches (status, starts_on DESC);

CREATE TABLE IF NOT EXISTS batch_participants (
  batch_id UUID NOT NULL REFERENCES program_batches(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'lulus', 'keluar', 'pindah')),
  joined_on DATE NOT NULL DEFAULT current_date,
  left_on DATE,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  added_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, student_id)
);

CREATE INDEX IF NOT EXISTS batch_participants_student_idx ON batch_participants (student_id, joined_on DESC);

ALTER TABLE location_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_participants ENABLE ROW LEVEL SECURITY;

-- Lokasi operasional: Mesir dan Indonesia. Lokasi ini yang punya asrama, petugas, program, dan
-- laporan sendiri. Asrama yang sudah ada dihubungkan ke lokasi sesuai negaranya; lokasi hasil
-- migrasi 059 yang kosong (tanpa asrama) dibersihkan supaya tidak menumpuk. Rincian kawasan tetap
-- tersimpan di kolom wilayah (area) tiap asrama.
INSERT INTO locations (id, name, country) VALUES
  (gen_random_uuid(), 'Hamasah Mesir', 'Mesir'),
  (gen_random_uuid(), 'Hamasah Indonesia', 'Indonesia')
ON CONFLICT (name, country) DO NOTHING;

UPDATE dormitories d SET location_id = l.id
FROM locations l
WHERE l.country = d.country AND l.name = 'Hamasah ' || d.country;

DELETE FROM locations l
WHERE l.name NOT IN ('Hamasah Mesir', 'Hamasah Indonesia')
  AND NOT EXISTS (SELECT 1 FROM dormitories d WHERE d.location_id = l.id)
  AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.location_id = l.id)
  AND NOT EXISTS (SELECT 1 FROM location_staff s WHERE s.location_id = l.id);