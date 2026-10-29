-- Monitoring dokumen dan perizinan: batas peringatan paspor dan iqamah yang bisa diatur admin (misalnya paspor
-- kurang dari enam bulan), serta tiket tindak lanjut yang punya penanggung jawab, riwayat, dan bukti penyelesaian.
--
-- Nilai awal pengaturan sama dengan angka yang sebelumnya tertulis di kode (paspor 180/60 hari, iqamah 60/14 hari).
-- Lihat server/document-settings-service.js dan server/central-monitoring-service.js.
CREATE TABLE IF NOT EXISTS document_alert_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL,
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE document_alert_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO document_alert_settings (id, config) VALUES (1, '{ "passportWarningDays": 180, "passportUrgentDays": 60, "iqamahWarningDays": 60, "iqamahUrgentDays": 14 }'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE student_cases ADD COLUMN IF NOT EXISTS assignee_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE student_cases ADD COLUMN IF NOT EXISTS evidence_note TEXT NOT NULL DEFAULT '' CHECK (char_length(evidence_note) <= 500);
ALTER TABLE student_cases ADD COLUMN IF NOT EXISTS evidence_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS student_case_events (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES student_cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('dibuat', 'status', 'penanggung-jawab', 'catatan')),
  from_status TEXT,
  to_status TEXT,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_case_events_case_idx ON student_case_events (case_id, created_at DESC);

ALTER TABLE student_case_events ENABLE ROW LEVEL SECURITY;
