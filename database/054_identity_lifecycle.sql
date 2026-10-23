ALTER TABLE accounts ADD COLUMN lifecycle TEXT;
ALTER TABLE accounts ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
-- Existing inactive rows with invitation evidence are pending; all others are blocked.
UPDATE accounts SET lifecycle = CASE WHEN active THEN 'active'
  WHEN invitation_token_hash IS NOT NULL THEN 'pending' ELSE 'blocked' END;
ALTER TABLE accounts ALTER COLUMN lifecycle SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN lifecycle SET DEFAULT 'active';
ALTER TABLE accounts ADD CONSTRAINT accounts_lifecycle_check
  CHECK ((lifecycle = 'active' AND active) OR (lifecycle IN ('pending', 'blocked') AND NOT active));
