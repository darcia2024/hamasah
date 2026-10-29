-- Integrasi sistem pembayaran (Sendit): persiapan yang aman sebelum keputusan teknis final.
--
-- Rekomendasi rapat: jangan membangun ulang payment gateway; audit website pembayaran yang sudah ada; periksa API, webhook, atau
-- akses integrasi yang sah; sinkronkan status tagihan dan pembayaran; hindari dua sistem yang sama-sama bisa menandai lunas tanpa
-- mekanisme sinkronisasi; sediakan tautan ke halaman pembayaran yang ada bila integrasi belum siap.
--
-- Karena API belum terverifikasi, yang dibangun di sini TIDAK menghubungi Sendit. Isinya: pengaturan tautan pembayaran, daftar
-- audit/keputusan yang diisi bersama tim IT, dan rekonsiliasi pembayaran eksternal: transaksi dari website pembayaran dicatat
-- (idempoten per nomor referensi) lalu diterapkan ke tagihan lewat SATU jalur resmi yang sama dengan pelunasan manual.
-- Lihat server/payment-integration-service.js.
CREATE TABLE IF NOT EXISTS payment_integration_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL,
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_integration_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO payment_integration_settings (id, config) VALUES (1, '{ "mode": "tautan", "providerName": "Sendit", "paymentUrl": "", "decision": "belum-final", "decisionNote": "", "decidedAt": null }'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS payment_audit_items (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z0-9-]{3,60}$'),
  title TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'belum' CHECK (status IN ('belum', 'ya', 'tidak', 'perlu-konfirmasi')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ
);

ALTER TABLE payment_audit_items ENABLE ROW LEVEL SECURITY;

INSERT INTO payment_audit_items (code, title, sort_order) VALUES
  ('website-diaudit', 'Website pembayaran yang sudah ada sudah diaudit (fitur, data, keamanan)', 10),
  ('api-tersedia', 'API website pembayaran tersedia dan terdokumentasi', 20),
  ('webhook-tersedia', 'Webhook notifikasi pembayaran tersedia', 30),
  ('akses-sah', 'Akses integrasi (kunci API, akun sandbox) diberikan secara sah oleh pemiliknya', 40),
  ('pemetaan-tagihan', 'Nomor tagihan dan nominal dapat dipetakan satu lawan satu ke tagihan Hamasah', 50),
  ('arah-sinkron', 'Arah sinkronisasi status lunas sudah disepakati (satu sumber kebenaran)', 60),
  ('pembayaran-ganda', 'Penanganan pembayaran ganda, gagal, dan refund sudah jelas', 70),
  ('biaya-keamanan', 'Biaya transaksi dan kepatuhan keamanan dikonfirmasi (data kartu tidak lewat Hamasah)', 80),
  ('keputusan-it', 'Keputusan integrasi atau migrasi penuh dibuat bersama tim IT Hamasah', 90)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS external_payments (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('sendit', 'manual')),
  external_ref TEXT NOT NULL CHECK (char_length(external_ref) BETWEEN 3 AND 80),
  amount_rupiah BIGINT NOT NULL CHECK (amount_rupiah > 0),
  paid_on DATE NOT NULL,
  payer_name TEXT NOT NULL DEFAULT '' CHECK (char_length(payer_name) <= 120),
  invoice_number_reported TEXT NOT NULL DEFAULT '' CHECK (char_length(invoice_number_reported) <= 40),
  matched_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'diterapkan', 'ditolak')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  UNIQUE (source, external_ref)
);

CREATE INDEX IF NOT EXISTS external_payments_status_idx ON external_payments (status, created_at DESC);

ALTER TABLE external_payments ENABLE ROW LEVEL SECURITY;
