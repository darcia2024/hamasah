CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  name TEXT NOT NULL CHECK (char_length(name) >= 2),
  role TEXT NOT NULL CHECK (role IN ('admin', 'registration-officer', 'supervisor', 'parent', 'student')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT NOT NULL,
  reset_token_hash TEXT,
  reset_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE registrations (
  id UUID PRIMARY KEY,
  registration_id TEXT NOT NULL UNIQUE CHECK (registration_id ~ '^HI-REG-[0-9]{4}-[0-9]{5}$'),
  applicant_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  guardian_name TEXT,
  guardian_phone_e164 TEXT,
  program TEXT NOT NULL CHECK (program IN ('kuliah-al-azhar', 'mahad-al-azhar', 'hamasah-courses')),
  education_level TEXT,
  city TEXT,
  consented_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'document-review', 'needs-revision', 'academic-preparation', 'ready-for-departure', 'completed', 'cancelled')),
  progress SMALLINT NOT NULL CHECK (progress BETWEEN 0 AND 100),
  access_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE registration_status_events (
  id UUID PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  changed_by_role TEXT NOT NULL,
  note TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE registration_documents (
  id UUID PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('passport', 'diploma', 'transcript', 'health-certificate', 'photo', 'other')),
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  uploaded_by_role TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE articles (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 8 AND 140),
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE TABLE students (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) >= 2),
  program TEXT NOT NULL,
  city TEXT NOT NULL,
  join_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated')),
  student_account_id UUID UNIQUE REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_parent_accounts (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, parent_account_id)
);

CREATE TABLE student_activities (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_attendance (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'late', 'excused', 'absent')),
  category TEXT NOT NULL,
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_achievements (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_evaluations (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  note TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_violations (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  note TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE course_materials (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  material_type TEXT NOT NULL CHECK (material_type IN ('video', 'pdf', 'text', 'assignment', 'quiz')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  study_guide JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE course_enrollments (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, course_id)
);

CREATE TABLE course_completions (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, material_id)
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE CHECK (invoice_number ~ '^INV/HI/[0-9]{4}/[0-9]{5}$'),
  receipt_number TEXT UNIQUE CHECK (receipt_number IS NULL OR receipt_number ~ '^KWT/HI/[0-9]{4}/[0-9]{5}$'),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  amount_rupiah BIGINT NOT NULL CHECK (amount_rupiah > 0),
  status TEXT NOT NULL CHECK (status IN ('unpaid', 'paid')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE visa_tracking (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not-started', 'collecting-documents', 'legalization', 'submitted', 'approved', 'expired')),
  passport_expires_at DATE,
  visa_expires_at DATE,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX registrations_status_updated_idx ON registrations(status, updated_at DESC);
CREATE INDEX registration_events_registration_idx ON registration_status_events(registration_id, changed_at DESC);
CREATE INDEX registration_documents_registration_idx ON registration_documents(registration_id, uploaded_at DESC);
CREATE INDEX activities_student_idx ON student_activities(student_id, occurred_at DESC);
CREATE INDEX attendance_student_idx ON student_attendance(student_id, occurred_at DESC);
CREATE INDEX materials_course_idx ON course_materials(course_id, created_at ASC);
CREATE INDEX invoices_student_idx ON invoices(student_id, issued_at DESC);
