-- Buku setoran tahfidz digital: setiap setoran tercatat dengan tanggal, surat dan rentang ayat, jenis (hafalan baru
-- atau murajaah), kualitas, penguji, dan catatan perbaikan.
--
-- Penghitungan ganda dicegah di server/tahfidz-service.js: kemajuan hafalan dihitung dari himpunan ayat UNIK yang pernah
-- disetor sebagai hafalan baru (ziyadah). Menyetor ulang ayat yang sama, atau murajaah, tidak menambah kemajuan.
-- Setoran tidak dihapus; kesalahan dibatalkan dengan alasan (voided_*) dan tetap tersimpan sebagai jejak.
CREATE TABLE IF NOT EXISTS tahfidz_entries (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ziyadah', 'murajaah')),
  surah SMALLINT NOT NULL CHECK (surah BETWEEN 1 AND 114),
  ayah_from SMALLINT NOT NULL CHECK (ayah_from >= 1),
  ayah_to SMALLINT NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('lancar', 'kurang-lancar', 'ulang')),
  examiner TEXT NOT NULL DEFAULT '' CHECK (char_length(examiner) <= 80),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  voided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  void_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(void_reason) <= 300),
  CHECK (ayah_to >= ayah_from)
);

CREATE INDEX IF NOT EXISTS tahfidz_entries_student_idx ON tahfidz_entries (student_id, entry_date DESC, created_at DESC);

ALTER TABLE tahfidz_entries ENABLE ROW LEVEL SECURITY;
