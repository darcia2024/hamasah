-- Field tambahan dibuat nullable supaya pendaftaran lama tetap bisa dibaca.
-- Formulir v2 mengisinya dan validasi domain akan memastikan nilainya lengkap.
ALTER TABLE registrations
  ADD COLUMN email TEXT,
  ADD COLUMN birth_date DATE,
  ADD COLUMN gender TEXT CHECK (gender IN ('putra', 'putri')),
  ADD COLUMN school_origin TEXT,
  ADD COLUMN program_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN referral_source TEXT,
  ADD COLUMN privacy_policy_version TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN guardian_email TEXT,
  ADD COLUMN guardian_consent_at TIMESTAMPTZ;

CREATE INDEX registrations_email_idx ON registrations (email) WHERE email IS NOT NULL;
