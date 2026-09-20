CREATE TABLE lms_submissions (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) >= 3),
  file_object_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'reviewed', 'returned')),
  score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  reviewer_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewer_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX lms_submission_active_unique ON lms_submissions(student_id, material_id) WHERE status <> 'returned';
ALTER TABLE lms_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX lms_submissions_course_idx ON lms_submissions(course_id, status, submitted_at DESC);
