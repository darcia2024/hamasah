ALTER TABLE registration_documents
  ADD COLUMN file_object_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected')),
  ADD COLUMN review_note TEXT,
  ADD COLUMN reviewed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ;

CREATE TABLE registration_notes (
  id UUID PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  author_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('internal', 'applicant')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE registration_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX registration_notes_registration_idx ON registration_notes (registration_id, created_at DESC);

CREATE TABLE registration_next_steps (
  id UUID PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  due_on DATE,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE registration_next_steps ENABLE ROW LEVEL SECURITY;
CREATE INDEX registration_next_steps_registration_idx ON registration_next_steps (registration_id, done_at, due_on);
