ALTER TABLE courses ADD COLUMN IF NOT EXISTS owner_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX courses_owner_idx ON courses(owner_account_id, updated_at DESC);
