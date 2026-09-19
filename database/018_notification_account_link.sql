ALTER TABLE notification_outbox
  ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX notification_outbox_account_idx
  ON notification_outbox (account_id, status, created_at DESC);
