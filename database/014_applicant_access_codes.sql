ALTER TABLE registrations ADD COLUMN access_code_hash TEXT;

CREATE TABLE applicant_sessions (
  token_hash TEXT PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE applicant_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX applicant_sessions_expires_idx ON applicant_sessions (expires_at);
