-- Batch import operasional: preview menyimpan snapshot, commit/rollback tetap dapat diaudit.
CREATE TABLE operation_import_batches (
  id UUID PRIMARY KEY,
  entity TEXT NOT NULL CHECK (entity IN ('inventory', 'visa')),
  status TEXT NOT NULL CHECK (status IN ('previewed', 'committed', 'rolled-back')),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  valid_count INTEGER NOT NULL CHECK (valid_count >= 0),
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ
);
ALTER TABLE operation_import_batches ENABLE ROW LEVEL SECURITY;
CREATE INDEX operation_import_batches_actor_idx ON operation_import_batches(actor_account_id, created_at DESC);
