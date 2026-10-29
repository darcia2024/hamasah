-- Pengumuman untuk musyrif (celah notulen rapat: "pengumuman ke musyrif belum didukung").
--   audience 'musyrif' : untuk akun musyrif, ditulis admin. dormitory_id kosong = semua musyrif; terisi = musyrif yang
--                        memegang asrama itu. Santri dan wali tidak pernah melihatnya.
-- Lihat server/student-life-service.js.

ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_audience_check CHECK (audience IN ('santri', 'wali', 'semua', 'musyrif'));
