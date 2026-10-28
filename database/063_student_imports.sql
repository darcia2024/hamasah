-- Impor santri secara massal (29 Oktober 2026): sekitar 108 santri existing dimasukkan dari Excel atau
-- Google Sheets tanpa diketik satu per satu. Alurnya: unggah dan petakan kolom (di peramban), pratinjau
-- dan validasi di server, tinjau, konfirmasi, lalu laporan hasil. Lihat server/student-import-service.js.
--
-- Tabel ini menyimpan satu baris per impor: hasil pratinjau (rows), keputusan admin saat konfirmasi
-- (decisions), dan hasil tiap baris sesudah konfirmasi (results). Konfirmasi bisa dilanjutkan bila
-- terhenti di tengah: baris yang sudah selesai tidak diproses ulang. Akun wali dan santri hanya dibuat
-- sebagai undangan (tanpa kata sandi bersama), dan tautan aktivasinya tidak disimpan di sini.
-- Selama tabel ini belum ada, halaman Impor Santri menampilkan arahan ke halaman Pengaturan.

CREATE TABLE IF NOT EXISTS student_import_batches (
  id UUID PRIMARY KEY,
  file_name TEXT NOT NULL DEFAULT '' CHECK (char_length(file_name) <= 200),
  status TEXT NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed', 'committing', 'committed', 'cancelled')),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS student_import_batches_created_idx ON student_import_batches (created_at DESC);

ALTER TABLE student_import_batches ENABLE ROW LEVEL SECURITY;
