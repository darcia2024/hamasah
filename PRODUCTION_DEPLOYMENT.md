# Deployment production

## Prasyarat

- PostgreSQL terkelola dan `DATABASE_URL` dengan akses TLS.
- Bucket object storage privat untuk berkas pendaftaran.
- `HAMASAH_BOOTSTRAP_KEY` acak minimal 32 karakter.
- Domain dan environment variables pada platform deployment.

## Urutan deploy

1. Buat database PostgreSQL kosong.
2. Terapkan [schema database](database/001_initial_schema.sql) dengan `psql $env:DATABASE_URL -f database/001_initial_schema.sql`.
3. Isi `DATABASE_URL`, `STORAGE_BUCKET`, dan `HAMASAH_BOOTSTRAP_KEY` pada environment deployment.
4. Jalankan `npm test` sebelum release.
5. Build container dari `Dockerfile`, deploy, lalu jalankan smoke test ke `/api/health` dan halaman publik.
6. Buat akun admin pertama melalui endpoint bootstrap yang hanya aktif sekali.

## Batas implementasi saat ini

Runtime masih memakai repository JSON lokal. Schema, validasi environment, dan container sudah siap, tetapi adapter PostgreSQL hanya dapat diuji dan diaktifkan setelah tersedia `DATABASE_URL` yang dapat diakses. Jangan memakai file JSON lokal untuk data santri production.
