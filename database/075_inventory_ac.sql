-- Inventaris asrama dan kontribusi AC patungan.
--
-- Inventaris: data aset diperluas (kode, kategori, lokasi, foto, bukti pembelian, tanggal dan harga beli), riwayat perawatan,
-- kerusakan, dan kehilangan per aset, serta pemeriksaan bulanan oleh musyrif yang menyesuaikan jumlah dan kondisi secara berjejak.
-- AC patungan: AC ditandai milik Hamasah sepenuhnya atau hasil patungan; kontribusi santri dicatat terpisah antara pembelian dan
-- pemasangan beserta nominal dan bukti; ketentuan pengembalian disimpan per AC. Pengajuan refund dibuat ketika santri keluar dan
-- hanya untuk santri yang BENAR-BENAR berkontribusi: tinggal di kamar AC tidak otomatis berhak atas pengembalian dana.
-- Lihat server/inventory-service.js dan server/ac-contribution-service.js.
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '' CHECK (char_length(code) <= 30);
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'lainnya' CHECK (category IN ('elektronik', 'furnitur', 'perlengkapan-tidur', 'kebersihan', 'dapur', 'ac', 'lainnya'));
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '' CHECK (char_length(location) <= 80);
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS purchased_on DATE;
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS unit_price_rupiah BIGINT CHECK (unit_price_rupiah IS NULL OR unit_price_rupiah >= 0);
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS photo_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL;
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS proof_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL;
ALTER TABLE dormitory_inventory DROP CONSTRAINT IF EXISTS dormitory_inventory_condition_check;
ALTER TABLE dormitory_inventory ADD CONSTRAINT dormitory_inventory_condition_check CHECK (condition IN ('baik', 'perawatan', 'rusak', 'hilang'));
CREATE UNIQUE INDEX IF NOT EXISTS dormitory_inventory_code_idx ON dormitory_inventory (dormitory_id, code) WHERE code <> '' AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_events (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES dormitory_inventory(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pembelian', 'perawatan', 'kerusakan', 'perbaikan', 'kehilangan', 'temuan', 'catatan')),
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 3 AND 500),
  cost_rupiah BIGINT CHECK (cost_rupiah IS NULL OR cost_rupiah >= 0),
  occurred_on DATE NOT NULL,
  file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_events_item_idx ON inventory_events (item_id, occurred_on DESC, created_at DESC);

ALTER TABLE inventory_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inventory_checks (
  id UUID PRIMARY KEY,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status TEXT NOT NULL DEFAULT 'berjalan' CHECK (status IN ('berjalan', 'selesai')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  started_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE (dormitory_id, month)
);

ALTER TABLE inventory_checks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inventory_check_items (
  check_id UUID NOT NULL REFERENCES inventory_checks(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES dormitory_inventory(id) ON DELETE CASCADE,
  expected_quantity INTEGER NOT NULL,
  expected_condition TEXT NOT NULL,
  found_quantity INTEGER CHECK (found_quantity IS NULL OR found_quantity >= 0),
  found_condition TEXT CHECK (found_condition IS NULL OR found_condition IN ('baik', 'perawatan', 'rusak', 'hilang')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  PRIMARY KEY (check_id, item_id)
);

ALTER TABLE inventory_check_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS dormitory_ac_units (
  id UUID PRIMARY KEY,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  room_id UUID REFERENCES dormitory_rooms(id) ON DELETE SET NULL,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  ownership TEXT NOT NULL CHECK (ownership IN ('hamasah', 'patungan')),
  purchase_total_rupiah BIGINT NOT NULL DEFAULT 0 CHECK (purchase_total_rupiah >= 0),
  install_total_rupiah BIGINT NOT NULL DEFAULT 0 CHECK (install_total_rupiah >= 0),
  purchased_on DATE,
  proof_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  refund_purchase BOOLEAN NOT NULL DEFAULT true,
  refund_install BOOLEAN NOT NULL DEFAULT false,
  terms TEXT NOT NULL DEFAULT '' CHECK (char_length(terms) <= 1000),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dormitory_ac_units_dorm_idx ON dormitory_ac_units (dormitory_id) WHERE archived_at IS NULL;

ALTER TABLE dormitory_ac_units ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ac_contributions (
  id UUID PRIMARY KEY,
  ac_id UUID NOT NULL REFERENCES dormitory_ac_units(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('pembelian', 'pemasangan')),
  amount_rupiah BIGINT NOT NULL CHECK (amount_rupiah > 0),
  paid_on DATE NOT NULL,
  proof_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  void_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(void_reason) <= 300)
);

CREATE INDEX IF NOT EXISTS ac_contributions_student_idx ON ac_contributions (student_id);
CREATE INDEX IF NOT EXISTS ac_contributions_ac_idx ON ac_contributions (ac_id);

ALTER TABLE ac_contributions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ac_refunds (
  id UUID PRIMARY KEY,
  ac_id UUID NOT NULL REFERENCES dormitory_ac_units(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  letter_id UUID REFERENCES letters(id) ON DELETE SET NULL,
  eligible_amount_rupiah BIGINT NOT NULL CHECK (eligible_amount_rupiah >= 0),
  basis TEXT NOT NULL DEFAULT '' CHECK (char_length(basis) <= 800),
  status TEXT NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan', 'disetujui', 'ditolak', 'dicairkan')),
  approved_amount_rupiah BIGINT CHECK (approved_amount_rupiah IS NULL OR approved_amount_rupiah >= 0),
  decision_note TEXT NOT NULL DEFAULT '' CHECK (char_length(decision_note) <= 500),
  decided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  disbursed_on DATE,
  disbursed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  disbursement_proof_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ac_refunds_open_idx ON ac_refunds (ac_id, student_id) WHERE status IN ('diajukan', 'disetujui', 'dicairkan');

ALTER TABLE ac_refunds ENABLE ROW LEVEL SECURITY;
