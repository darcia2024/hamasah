-- Jadwal keberangkatan per kloter (rombongan). Petugas membuat kloter lalu menugaskan
-- pendaftar ke dalamnya; halaman cek status menampilkan kloter pendaftar tersebut.
-- Tanggal rencana boleh kosong: pendaftar melihat "belum ditetapkan", bukan tanggal karangan.
CREATE TABLE IF NOT EXISTS departure_groups (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  planned_date DATE,
  origin TEXT CHECK (origin IS NULL OR char_length(origin) <= 80),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed', 'departed', 'cancelled')),
  applicant_note TEXT CHECK (applicant_note IS NULL OR char_length(applicant_note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu pendaftaran paling banyak di satu kloter.
CREATE TABLE IF NOT EXISTS registration_departures (
  registration_id TEXT PRIMARY KEY REFERENCES registrations(registration_id) ON DELETE CASCADE,
  departure_group_id UUID NOT NULL REFERENCES departure_groups(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS registration_departures_group_idx ON registration_departures (departure_group_id);

ALTER TABLE departure_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_departures ENABLE ROW LEVEL SECURITY;
