ALTER TABLE students
  ADD COLUMN registration_id UUID UNIQUE REFERENCES registrations(id) ON DELETE SET NULL,
  ADD COLUMN birth_date DATE,
  ADD COLUMN media_consent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX students_registration_idx ON students (registration_id) WHERE registration_id IS NOT NULL;
