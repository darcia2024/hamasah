-- Kapan sebuah sesi terakhir dipakai.
--
-- Dipakai untuk memperpanjang sesi wali dan santri selama mereka masih aktif,
-- tanpa memperpanjang sesi yang sudah lama ditinggalkan. Sesi staf tetap pendek
-- dan tidak diperpanjang, karena akun staf memegang data banyak orang.

ALTER TABLE account_sessions ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Untuk pembersihan sesi kedaluwarsa yang berjalan harian.
CREATE INDEX account_sessions_expires_idx ON account_sessions (expires_at);
