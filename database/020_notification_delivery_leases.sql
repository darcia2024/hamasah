ALTER TABLE notification_outbox
  DROP CONSTRAINT notification_outbox_status_check;

ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed'));

ALTER TABLE notification_outbox
  ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN claimed_at TIMESTAMPTZ,
  ADD COLUMN claim_token UUID;

CREATE INDEX notification_outbox_delivery_idx
  ON notification_outbox (status, next_attempt_at, created_at);
