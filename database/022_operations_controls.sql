-- Kontrol operasional: koreksi berjejak, dokumen visa, dan ledger inventaris.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('unpaid', 'paid', 'voided'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE TABLE invoice_corrections (
  id UUID PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) >= 5),
  previous_description TEXT NOT NULL,
  previous_amount_rupiah BIGINT NOT NULL,
  corrected_description TEXT NOT NULL,
  corrected_amount_rupiah BIGINT NOT NULL CHECK (corrected_amount_rupiah > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE visa_documents (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  file_object_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('passport', 'visa', 'residence', 'other')),
  expires_at DATE,
  note TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX visa_documents_student_idx ON visa_documents(student_id, uploaded_at DESC);

CREATE TABLE visa_status_history (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not-started', 'collecting-documents', 'legalization', 'submitted', 'approved', 'expired')),
  note TEXT,
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX visa_status_history_student_idx ON visa_status_history(student_id, changed_at DESC);

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out', 'correction')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL CHECK (char_length(reason) >= 3),
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_item_idx ON inventory_movements(inventory_item_id, created_at DESC);

ALTER TABLE dormitories ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0);
CREATE TABLE student_dormitory_history (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  dormitory_id UUID REFERENCES dormitories(id) ON DELETE SET NULL,
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX student_dormitory_history_student_idx ON student_dormitory_history(student_id, changed_at DESC);

ALTER TABLE invoice_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_dormitory_history ENABLE ROW LEVEL SECURITY;
