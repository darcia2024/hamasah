-- Galeri asrama: video kegiatan lewat tautan YouTube (unlisted), bukan berkas besar di storage (sesuai notulen rapat:
-- "video kegiatan dan LMS sebaiknya di hosting video eksternal"). Video yang sudah terlanjur diunggah tetap tersimpan
-- dan bisa diputar; unggahan video baru tidak diterima lagi.
--   youtube_id : 11 karakter id video YouTube. Item video baru memakai kolom ini dan tidak punya file_id.

ALTER TABLE dormitory_gallery ALTER COLUMN file_id DROP NOT NULL;
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS youtube_id TEXT CHECK (youtube_id IS NULL OR youtube_id ~ '^[A-Za-z0-9_-]{11}$');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dormitory_gallery_sumber_check') THEN
    ALTER TABLE dormitory_gallery ADD CONSTRAINT dormitory_gallery_sumber_check CHECK (file_id IS NOT NULL OR youtube_id IS NOT NULL);
  END IF;
END $$;
