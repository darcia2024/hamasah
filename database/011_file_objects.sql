-- Catatan berkas yang diunggah: paspor, ijazah, surat kesehatan, bukti bayar, dan
-- lampiran maddah.
--
-- Isi berkasnya sendiri TIDAK disimpan di database, melainkan di object storage.
-- Tabel ini menyimpan siapa mengunggah apa, untuk keperluan siapa, dan di kunci
-- penyimpanan mana. Pemeriksaan izin unduh berangkat dari baris di tabel ini.
--
-- storage_key sengaja tidak pernah memuat nama asli berkas. Nama asli berasal dari
-- pengguna dan bisa memuat apa saja, termasuk karakter yang berbahaya untuk jalur
-- berkas. Nama asli tetap disimpan terpisah, hanya untuk ditampilkan.

CREATE TABLE file_objects (
  id UUID PRIMARY KEY,
  bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'deleted')),
  uploaded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE file_objects ENABLE ROW LEVEL SECURITY;

CREATE INDEX file_objects_entity_idx ON file_objects (entity_type, entity_id);
-- Untuk membersihkan baris pending yang isinya tidak pernah dikirim.
CREATE INDEX file_objects_status_created_idx ON file_objects (status, created_at);
