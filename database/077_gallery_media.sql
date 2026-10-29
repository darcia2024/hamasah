-- Galeri kegiatan asrama (item 18) diperluas dari migrasi 051:
--   media_type      : foto atau video (video hanya internal, tidak pernah ditampilkan publik).
--   category        : kategori kegiatan untuk penyaringan.
--   thumb_file_id   : thumbnail kecil dibuat di peramban (foto 360 px, video: bingkai poster) supaya daftar ringan.
--   audience        : 'asrama' (semua santri dan wali asrama itu) atau 'terpilih' (hanya santri yang ditandai dan walinya).
--   public_status   : internal | diajukan | dipublikasi | ditolak. Tampil publik hanya setelah ada catatan persetujuan
--                     (consent_note) DAN keputusan admin; keduanya tercatat siapa dan kapan.
--   dormitory_gallery_students : santri yang ditandai pada item ber-audience 'terpilih'.
-- Lihat server/dormitory-management-service.js.

ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'foto' CHECK (media_type IN ('foto', 'video'));
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'lainnya' CHECK (category IN ('belajar', 'ibadah', 'olahraga', 'kebersamaan', 'perjalanan', 'lainnya'));
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS thumb_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL;
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'asrama' CHECK (audience IN ('asrama', 'terpilih'));
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS public_status TEXT NOT NULL DEFAULT 'internal' CHECK (public_status IN ('internal', 'diajukan', 'dipublikasi', 'ditolak'));
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS consent_note TEXT NOT NULL DEFAULT '' CHECK (char_length(consent_note) <= 300);
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS consent_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS public_decision_note TEXT NOT NULL DEFAULT '' CHECK (char_length(public_decision_note) <= 300);
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS public_decided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE dormitory_gallery ADD COLUMN IF NOT EXISTS public_decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS dormitory_gallery_public_idx ON dormitory_gallery (public_status, created_at DESC) WHERE archived_at IS NULL AND public_status = 'dipublikasi';

CREATE TABLE IF NOT EXISTS dormitory_gallery_students (
  gallery_id UUID NOT NULL REFERENCES dormitory_gallery(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (gallery_id, student_id)
);

CREATE INDEX IF NOT EXISTS dormitory_gallery_students_student_idx ON dormitory_gallery_students (student_id);

ALTER TABLE dormitory_gallery_students ENABLE ROW LEVEL SECURITY;
