-- Presensi unik untuk satu santri, sesi, dan tanggal operasional Jakarta.
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS session_date DATE;
UPDATE student_attendance SET session_date = (occurred_at AT TIME ZONE 'Asia/Jakarta')::date WHERE session_date IS NULL;
ALTER TABLE student_attendance ALTER COLUMN session_date SET NOT NULL;
CREATE UNIQUE INDEX student_attendance_session_unique ON student_attendance(student_id, session_date, category);

CREATE TABLE student_record_corrections (
  id UUID PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('activities', 'achievements', 'attendance', 'evaluations', 'violations')),
  record_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) >= 5),
  previous_value JSONB NOT NULL,
  corrected_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE student_record_corrections ENABLE ROW LEVEL SECURITY;
CREATE INDEX student_record_corrections_student_idx ON student_record_corrections(student_id, created_at DESC);
