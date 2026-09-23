-- Pembatas percobaan disimpan di database, bukan di memori proses.
--
-- Sebelumnya hitungan percobaan hidup di `new Map()` dalam satu proses Node. Itu
-- cukup selama aplikasi berjalan sebagai satu server yang menyala terus. Di
-- platform serverless setiap permintaan dapat dilayani instance berbeda dan
-- instance mati saat sepi, sehingga batas seperti "5 percobaan per 15 menit"
-- untuk menebak kode akses pendaftar praktis tidak berlaku.
--
-- Satu baris untuk satu percobaan. Barisnya dihapus saat jendela waktunya lewat,
-- jadi tabel ini tidak tumbuh tanpa batas.
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 200),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pola bacanya selalu "percobaan untuk bucket ini dalam rentang waktu terakhir".
CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_time ON rate_limit_hits(bucket, occurred_at);

-- Dipakai pembersih berkala untuk membuang baris kedaluwarsa dari seluruh bucket.
CREATE INDEX IF NOT EXISTS rate_limit_hits_time ON rate_limit_hits(occurred_at);

ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
