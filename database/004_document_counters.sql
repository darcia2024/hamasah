-- Penghitung nomor dokumen resmi per jenis dan per tahun.
-- Nomor diambil dengan satu perintah atomik (INSERT ... ON CONFLICT DO UPDATE ... RETURNING),
-- bukan dihitung dari jumlah baris, supaya dua permintaan bersamaan tidak mendapat nomor sama.
-- Dipakai untuk nomor registrasi, dan nanti untuk invoice serta kuitansi.

CREATE TABLE document_counters (
  scope TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, year)
);
ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;

-- Database yang sudah berisi pendaftaran melanjutkan dari nomor tertinggi yang sudah dipakai,
-- supaya nomor tidak mundur dan tidak menimpa data lama.
INSERT INTO document_counters (scope, year, last_value)
SELECT 'registration',
       CAST(substring(registration_id FROM 8 FOR 4) AS INTEGER),
       MAX(CAST(right(registration_id, 5) AS INTEGER))
FROM registrations
GROUP BY 2
ON CONFLICT (scope, year) DO NOTHING;
