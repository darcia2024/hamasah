-- Monitoring pusat (28 Oktober 2026): masalah santri yang perlu ditindaklanjuti admin, dengan
-- status "baru", "diproses", dan "selesai". Lihat server/central-monitoring-service.js.
--
-- Dua jenis baris:
--   otomatis : paspor dan iqamah. Masalahnya dihitung dari visa_tracking, jadi barisnya baru
--              dibuat ketika admin mengubah statusnya. ref berisi tanggal habis yang sedang
--              berlaku; saat tanggalnya diperbarui, masalah muncul lagi sebagai "baru".
--   manual   : lapor diri, lapor pendidikan, dan status pendidikan bermasalah. Dicatat admin,
--              ref berisi id baris itu sendiri sehingga satu santri boleh punya beberapa.
-- Selama tabel ini belum ada, dashboard tetap menampilkan paspor dan iqamah dengan status
-- "baru", dan perubahan status ditolak dengan arahan ke halaman Pengaturan.

CREATE TABLE IF NOT EXISTS student_cases (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('paspor', 'iqamah', 'lapor-diri', 'lapor-pendidikan', 'status-pendidikan')),
  ref TEXT NOT NULL DEFAULT '' CHECK (char_length(ref) <= 40),
  source TEXT NOT NULL CHECK (source IN ('otomatis', 'manual')),
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'diproses', 'selesai')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  due_on DATE,
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, kind, ref)
);

CREATE INDEX IF NOT EXISTS student_cases_status_idx ON student_cases (status, kind);

ALTER TABLE student_cases ENABLE ROW LEVEL SECURITY;
