-- Pesan konsultasi dari formulir publik di halaman kontak.
--
-- Sebelumnya formulir ini tidak pernah mengirim ke mana pun: handler-nya ditulis
-- sebagai script inline yang diblokir Content Security Policy, dan bahkan bila
-- berjalan ia hanya membuang isian lalu menampilkan pesan sukses. Tabel ini
-- membuat pesan yang masuk benar-benar tersimpan dan dapat ditindaklanjuti.

CREATE TABLE inquiries (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  phone_e164 TEXT NOT NULL,
  topic TEXT NOT NULL CHECK (topic IN ('kuliah', 'mahad', 'courses', 'biaya', 'asrama', 'lainnya')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  -- ON DELETE SET NULL supaya riwayat tindak lanjut tetap ada walau akun staf dihapus.
  handled_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- Konsol petugas selalu memfilter status lalu mengurutkan dari yang terbaru.
CREATE INDEX inquiries_status_created_idx ON inquiries (status, created_at DESC);
CREATE INDEX inquiries_created_idx ON inquiries (created_at DESC);
