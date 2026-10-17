-- Galeri asrama (17 Oktober 2026): foto kegiatan per asrama. Musyrif asrama itu dan admin
-- mengunggah lewat Kelola Asrama; santri dan wali asrama itu melihatnya di beranda.
-- Foto disimpan sebagai unggahan berjenis 'dormitory-photo' (file_objects) dan baris di
-- sini hanya menautkannya ke asrama beserta keterangan. Foto yang ditarik diarsipkan.
-- Seperti migrasi 050, selama tabel belum ada galeri tampil kosong dan penyimpanan
-- ditolak dengan arahan ke halaman Pengaturan.

CREATE TABLE IF NOT EXISTS dormitory_gallery (
  id UUID PRIMARY KEY,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES file_objects(id) ON DELETE CASCADE,
  caption TEXT NOT NULL DEFAULT '' CHECK (char_length(caption) <= 160),
  taken_on DATE,
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dormitory_gallery_dorm_idx ON dormitory_gallery (dormitory_id, created_at DESC) WHERE archived_at IS NULL;

ALTER TABLE dormitory_gallery ENABLE ROW LEVEL SECURITY;
