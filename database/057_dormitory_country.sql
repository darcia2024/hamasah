-- Negara asrama (28 Oktober 2026), untuk saringan Monitoring pusat. Sebelumnya negara hanya
-- ditebak dari kolom wilayah. Hamasah berpusat di Mesir, jadi bawaannya Mesir; asrama yang
-- wilayahnya jelas menyebut Indonesia dipindahkan ke Indonesia. Selebihnya diatur admin di
-- Monitoring pusat. Lihat server/central-monitoring-service.js.

ALTER TABLE dormitories ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'Mesir' CHECK (country IN ('Mesir', 'Indonesia'));
UPDATE dormitories SET country = 'Indonesia' WHERE area ~* 'indonesia';
