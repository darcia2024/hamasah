-- Undangan akun disimpan di akun agar pembuatan akun dan token aktivasi selalu
-- berubah bersama dalam satu penyimpanan. Token hanya berupa hash, sehingga
-- tautan aktivasi tidak bisa dibangun ulang dari database.
ALTER TABLE accounts
  ADD COLUMN invitation_token_hash TEXT,
  ADD COLUMN invitation_expires_at TIMESTAMPTZ,
  ADD COLUMN invited_at TIMESTAMPTZ;

-- Outbox hanya menyimpan jejak pengiriman. Isi email dan token tidak disimpan
-- karena berisi tautan yang bersifat rahasia dan memiliki masa berlaku singkat.
CREATE TABLE notification_outbox (
  id UUID PRIMARY KEY,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('account-invitation', 'password-reset')),
  recipient_email TEXT NOT NULL CHECK (recipient_email = lower(recipient_email)),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE INDEX notification_outbox_recipient_created_idx
  ON notification_outbox (recipient_email, created_at DESC);
CREATE INDEX notification_outbox_status_created_idx
  ON notification_outbox (status, created_at DESC);
