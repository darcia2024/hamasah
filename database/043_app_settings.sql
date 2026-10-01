-- Pengaturan aplikasi yang diubah super admin dari halaman Pengaturan.
--
-- Satu baris untuk satu kunci (misalnya pendaftaran.dibuka). Nilainya JSON supaya satu
-- tabel cukup untuk saklar, angka, dan teks. Kunci yang belum pernah disimpan memakai
-- nilai bawaan dari server/settings-service.js, jadi tabel ini boleh kosong.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 3 AND 80),
  value JSONB NOT NULL,
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
