-- Profil santri terintegrasi (28 Oktober 2026): profil menjadi pusat seluruh informasi santri, bukan
-- hanya biodata. Migrasi ini menambah yang belum tersimpan di mana pun. Lihat
-- server/student-profile-service.js.
--
--   students.status       : ditambah cuti (izin panjang), mengundurkan diri, dan arsip, di samping aktif,
--                           nonaktif, dan lulus (selesai). Semua status selain aktif tidak dihitung
--                           sebagai penghuni asrama (kode yang ada sudah memeriksa status = 'active').
--   student_profiles      : kontak, tempat lahir, jenjang dan lembaga pendidikan, status pendidikan,
--                           status paspor yang tidak bisa dihitung dari tanggal (hilang, rusak, sedang
--                           diurus), serta nomor paspor dan iqamah. Nomor identitas hanya dibuka penuh
--                           untuk admin; pihak lain melihatnya tersamar.
--   student_status_history: riwayat perubahan status santri beserta alasannya.
--   student_documents     : metadata dokumen pribadi santri. Isi berkas ada di object storage privat
--                           (file_objects, purpose student-document); visibilitasnya menentukan siapa
--                           yang boleh membuka: admin, staf asrama, atau keluarga.
-- Selama tabel ini belum ada, profil menampilkan data dasar dan arahan ke halaman Pengaturan.

ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE students ADD CONSTRAINT students_status_check
  CHECK (status IN ('active', 'inactive', 'graduated', 'leave', 'withdrawn', 'archived'));

CREATE TABLE IF NOT EXISTS student_profiles (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  birth_place TEXT NOT NULL DEFAULT '' CHECK (char_length(birth_place) <= 80),
  nationality TEXT NOT NULL DEFAULT '' CHECK (char_length(nationality) <= 60),
  phone TEXT NOT NULL DEFAULT '' CHECK (char_length(phone) <= 30),
  email TEXT NOT NULL DEFAULT '' CHECK (char_length(email) <= 120),
  home_address TEXT NOT NULL DEFAULT '' CHECK (char_length(home_address) <= 300),
  emergency_name TEXT NOT NULL DEFAULT '' CHECK (char_length(emergency_name) <= 80),
  emergency_phone TEXT NOT NULL DEFAULT '' CHECK (char_length(emergency_phone) <= 30),
  education_level TEXT NOT NULL DEFAULT '' CHECK (char_length(education_level) <= 60),
  institution TEXT NOT NULL DEFAULT '' CHECK (char_length(institution) <= 120),
  major TEXT NOT NULL DEFAULT '' CHECK (char_length(major) <= 120),
  study_year INTEGER CHECK (study_year IS NULL OR study_year BETWEEN 1 AND 12),
  education_status TEXT NOT NULL DEFAULT '' CHECK (education_status IN ('', 'aktif', 'cuti', 'bermasalah', 'lulus')),
  education_note TEXT NOT NULL DEFAULT '' CHECK (char_length(education_note) <= 300),
  passport_state TEXT NOT NULL DEFAULT '' CHECK (passport_state IN ('', 'hilang', 'rusak', 'diurus')),
  passport_number TEXT NOT NULL DEFAULT '' CHECK (char_length(passport_number) <= 40),
  iqamah_number TEXT NOT NULL DEFAULT '' CHECK (char_length(iqamah_number) <= 40),
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_status_history (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  changed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_status_history_student_idx ON student_status_history (student_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS student_documents (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  file_id UUID NOT NULL UNIQUE REFERENCES file_objects(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('paspor', 'iqamah', 'identitas', 'ijazah', 'surat', 'kesehatan', 'lainnya')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  visibility TEXT NOT NULL DEFAULT 'staf' CHECK (visibility IN ('admin', 'staf', 'keluarga')),
  uploaded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS student_documents_student_idx ON student_documents (student_id, created_at DESC);

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_documents ENABLE ROW LEVEL SECURITY;
