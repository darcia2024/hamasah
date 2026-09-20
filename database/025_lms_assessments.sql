-- Attempt kuis tersimpan sebagai rekam nilai server-side.
CREATE TABLE lms_attempts (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  passed BOOLEAN NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, material_id, attempt_number)
);
ALTER TABLE lms_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX lms_attempts_student_material_idx ON lms_attempts(student_id, material_id, submitted_at DESC);
