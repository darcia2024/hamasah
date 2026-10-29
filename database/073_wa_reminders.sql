-- Pengingat tagihan lewat WhatsApp (klik untuk chat): daftar wali dengan tagihan belum lunas, jatuh tempo, templat pesan yang
-- bisa diedit, dan catatan bahwa chat DIBUKA. Membuka chat tidak berarti pesan terkirim; petugas dapat menandainya terkirim sendiri.
--
-- invoices.due_on: jatuh tempo tagihan (opsional). Tagihan lama tanpa jatuh tempo memakai batas bawaan (terbit + defaultDueDays).
-- wa_reminder_log menyimpan satu baris per tagihan per kali chat dibuka; kolom channel dan status disiapkan bila kelak memakai API
-- (antrean, histori, status respons). Pembatasan frekuensi sudah berlaku: target per bulan dan jarak minimum antar pengingat.
-- Lihat server/whatsapp-reminder-service.js.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_on DATE;

CREATE TABLE IF NOT EXISTS wa_reminder_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL,
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE wa_reminder_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO wa_reminder_settings (id, config) VALUES (1, jsonb_build_object(
  'defaultDueDays', 14,
  'monthlyTarget', 3,
  'minGapDays', 7,
  'template', E'Assalamu''alaikum Bapak/Ibu {nama_wali},\n\nKami dari tim keuangan Hamasah International menginformasikan tagihan ananda {nama_santri} yang belum lunas:\n{daftar_tagihan}\nTotal: {total}\n{jatuh_tempo}\nRincian dan cara pembayaran: {tautan_bayar}\n\nBila sudah membayar, mohon abaikan pesan ini. Terima kasih.\n\nWassalamu''alaikum,\nTim Keuangan Hamasah International'
)) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS wa_reminder_log (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL,
  parent_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp-manual' CHECK (channel IN ('whatsapp-manual', 'whatsapp-api')),
  status TEXT NOT NULL DEFAULT 'dibuka' CHECK (status IN ('dibuka', 'terkirim-dikonfirmasi', 'gagal')),
  no_phone BOOLEAN NOT NULL DEFAULT false,
  opened_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wa_reminder_log_parent_idx ON wa_reminder_log (parent_account_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS wa_reminder_log_batch_idx ON wa_reminder_log (batch_id);

ALTER TABLE wa_reminder_log ENABLE ROW LEVEL SECURITY;
