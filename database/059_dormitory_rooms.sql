-- Struktur lokasi, asrama, kamar, dan penempatan santri (28 Oktober 2026). Kondisi asrama tidak
-- seragam: jumlah penghuni, kapasitas, AC, dan musyrif penanggung jawabnya berbeda-beda, jadi
-- tiap kamar dicatat sendiri. Lihat server/dormitory-room-service.js.
--
--   locations           : lokasi (kota atau kawasan) beserta negaranya. Asrama menempel ke satu lokasi.
--   dormitory_rooms     : kamar milik satu asrama, dengan kapasitas, AC atau non-AC, dan musyrif
--                         penanggung jawab (opsional, harus musyrif yang memegang asrama itu).
--   students.room_id    : kamar tempat santri ditempatkan. Kamar hanya dianggap berlaku bila asrama
--                         kamar itu sama dengan asrama santri, jadi pemindahan asrama lewat jalur
--                         lama tidak meninggalkan kamar yang salah.
--   placement_history   : riwayat pemindahan santri antar kamar atau asrama. Nama asrama dan kamar
--                         disalin sebagai teks supaya riwayat tetap terbaca walau kamarnya dihapus.
-- Selama tabel ini belum ada, halaman Kelola Asrama menampilkan arahan ke halaman Pengaturan.

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  country TEXT NOT NULL DEFAULT 'Mesir' CHECK (country IN ('Mesir', 'Indonesia')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, country)
);

ALTER TABLE dormitories ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

-- Lokasi awal diambil dari kolom wilayah asrama yang sudah ada.
INSERT INTO locations (id, name, country)
SELECT gen_random_uuid(), area, country FROM (SELECT DISTINCT area, country FROM dormitories WHERE char_length(area) >= 2) AS wilayah
ON CONFLICT (name, country) DO NOTHING;
UPDATE dormitories d SET location_id = l.id FROM locations l WHERE l.name = d.area AND l.country = d.country AND d.location_id IS NULL;

CREATE TABLE IF NOT EXISTS dormitory_rooms (
  id UUID PRIMARY KEY,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 40),
  has_ac BOOLEAN NOT NULL DEFAULT false,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  supervisor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dormitory_id, name)
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES dormitory_rooms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS students_room_idx ON students (room_id) WHERE room_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS placement_history (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_dormitory_id UUID REFERENCES dormitories(id) ON DELETE SET NULL,
  from_room_id UUID REFERENCES dormitory_rooms(id) ON DELETE SET NULL,
  from_label TEXT NOT NULL DEFAULT '',
  to_dormitory_id UUID REFERENCES dormitories(id) ON DELETE SET NULL,
  to_room_id UUID REFERENCES dormitory_rooms(id) ON DELETE SET NULL,
  to_label TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  moved_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS placement_history_student_idx ON placement_history (student_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS placement_history_to_idx ON placement_history (to_dormitory_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS placement_history_from_idx ON placement_history (from_dormitory_id, moved_at DESC);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dormitory_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_history ENABLE ROW LEVEL SECURITY;
