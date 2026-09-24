-- Nama penulis yang ditampilkan pada artikel, bila berbeda dari akun yang menginput.
-- Kosong berarti memakai nama akun pembuat artikel (author_account_id), seperti sebelumnya.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_display_name TEXT;
