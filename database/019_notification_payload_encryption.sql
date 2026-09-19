ALTER TABLE notification_outbox
  ADD COLUMN payload_ciphertext TEXT,
  ADD COLUMN payload_nonce TEXT,
  ADD COLUMN payload_tag TEXT;
