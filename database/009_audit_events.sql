-- Catatan kejadian penting: siapa melakukan apa, kapan.
--
-- Dipakai untuk menjawab pertanyaan yang pasti muncul suatu saat: siapa yang
-- mengubah status pendaftaran ini, siapa yang menandai tagihan ini lunas, dan
-- apakah ada yang mencoba menebak kata sandi.
--
-- Isi metadata sengaja dibatasi: tidak boleh memuat kata sandi, token, isi dokumen,
-- atau nomor telepon lengkap. Alamat IP disimpan sebagai HMAC, bukan apa adanya,
-- supaya catatan ini tidak berubah menjadi arsip lokasi orang.

CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX audit_events_occurred_idx ON audit_events (occurred_at DESC);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_account_id, occurred_at DESC);
