-- Inventaris asrama (celah notulen rapat): sumber dana, pemilik, dan bukti foto pemeriksaan bulanan.
--   dormitory_inventory.funding_source   : dari mana barang dibiayai ('' = belum diisi).
--   dormitory_inventory.owner_type       : 'asrama' (aset Hamasah/asrama) atau 'santri' (barang pribadi santri yang dicatat,
--                                          misalnya kasur atau lemari bawaan). Barang pribadi tidak dihitung sebagai nilai aset.
--   dormitory_inventory.owner_student_id : pemilik barang pribadi.
--   inventory_checks.proof_file_id       : foto bukti pemeriksaan bulanan, wajib saat pemeriksaan diselesaikan.
-- Lihat server/inventory-service.js.

ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS funding_source TEXT NOT NULL DEFAULT ''
  CHECK (funding_source IN ('', 'hamasah', 'kas-asrama', 'patungan', 'donasi', 'pribadi', 'lainnya'));
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'asrama'
  CHECK (owner_type IN ('asrama', 'santri'));
ALTER TABLE dormitory_inventory ADD COLUMN IF NOT EXISTS owner_student_id UUID REFERENCES students(id) ON DELETE SET NULL;

ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS proof_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL;
