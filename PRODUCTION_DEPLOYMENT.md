# Deployment production

## Prasyarat

- PostgreSQL terkelola dan `DATABASE_URL` dengan akses TLS.
- Bucket object storage privat untuk berkas pendaftaran.
- `HAMASAH_BOOTSTRAP_KEY` acak minimal 32 karakter, hanya sampai akun admin pertama dibuat.
- Domain dan environment variables pada platform deployment.

## Urutan deploy

1. Buat database PostgreSQL kosong.
2. Isi `APP_ENV=production`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `STORAGE_BUCKET`, dan `HAMASAH_BOOTSTRAP_KEY` pada environment deployment. Isi `DATABASE_MIGRATION_URL` dengan koneksi session (port 5432) atau koneksi langsung, bukan pooler mode transaksi.
3. Terapkan schema dengan `npm run migrate` (lihat [pengaman skrip database](#pengaman-skrip-database) untuk konfirmasi production). Untuk database yang schema-nya dulu diterapkan manual, jalankan `npm run migrate -- --baseline` lebih dulu, lalu `npm run migrate`.
4. Periksa hasilnya dengan `npm run verify:database`, lalu jalankan `npm test` sebelum release.
5. Build container dari `Dockerfile`, deploy, lalu jalankan smoke test ke `/api/health`, `/api/ready`, dan halaman publik. Isi health check platform dengan `/api/health` supaya gangguan database tidak membuat container terus dihidupkan ulang.
6. Buat akun admin pertama melalui endpoint bootstrap yang hanya aktif sekali, lalu hapus `HAMASAH_BOOTSTRAP_KEY` dari environment.

## Row Level Security

Supabase menyajikan schema `public` lewat Data API. Tanpa Row Level Security, seluruh tabel dapat dibaca dan ditulis oleh siapa pun yang memegang anon key, termasuk `accounts` (hash kata sandi) dan `registrations` (nomor telepon calon santri dan wali). Migrasi `003_enable_row_level_security.sql` mengaktifkan RLS pada semua tabel tanpa policy, sehingga akses lewat Data API ditolak.

Aplikasi tidak terpengaruh karena terhubung sebagai pemilik tabel, dan pemilik tabel melewati RLS selama `FORCE ROW LEVEL SECURITY` tidak diaktifkan.

Urutan penerapan:

1. Terapkan di staging (`npm run migrate`), lalu jalankan smoke test: login, buat pendaftaran dari halaman publik, buka daftar artikel, dan buat invoice.
2. Jika muncul error `permission denied` atau error terkait RLS, batalkan sementara dengan `ALTER TABLE <nama> DISABLE ROW LEVEL SECURITY;` lalu laporkan sebelum melanjutkan.
3. Buka Dashboard Supabase, menu Advisors, bagian Security, lalu pastikan peringatan RLS sudah hilang.
4. Jika aplikasi tidak memakai Data API sama sekali, pertimbangkan mengeluarkan schema `public` dari daftar Exposed schemas pada pengaturan API.
5. Ulangi di production setelah backup.

## Pengaman skrip database

Skrip yang menulis ke database (`npm run migrate`, `npm run seed:articles`, dan `database/auth-live-check.js`) memeriksa `APP_ENV` sebelum membuka koneksi:

| `APP_ENV` | Hasil |
| --- | --- |
| Kosong | Ditolak. Tentukan dulu lingkungan yang dituju. |
| `development`, `test`, `staging` | Diizinkan. |
| `production` | Ditolak, kecuali `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND` diset di terminal. |
| Nilai lain | Ditolak. |

`APP_ENV` harus sesuai dengan database yang dituju `DATABASE_URL`. Jika `.env` di laptop masih mengarah ke database production, isi `APP_ENV=production` agar pengaman aktif.

`ALLOW_PRODUCTION_WRITE` sengaja **tidak pernah dibaca dari file `.env`**. Set hanya untuk satu sesi terminal, setelah backup dibuat:

```powershell
$env:APP_ENV = 'production'
$env:ALLOW_PRODUCTION_WRITE = 'I_UNDERSTAND'
npm run migrate
Remove-Item Env:ALLOW_PRODUCTION_WRITE
```

`npm run verify:database` hanya membaca, jadi tidak membutuhkan konfirmasi ini.

Setiap migrasi berjalan dalam satu transaksi dan tercatat di tabel `schema_migrations`. Kalau satu migrasi gagal di tengah, seluruh perubahannya dibatalkan dan tidak tercatat, sehingga perintah bisa diulang setelah penyebabnya diperbaiki. Tetap buat backup sebelum menjalankan migrasi di production.

## Batas implementasi saat ini

Seluruh data aplikasi berada di PostgreSQL. `server.js` menolak start jika `DATABASE_URL` kosong, bukan `postgresql://`, atau memakai `pglite:` di staging dan production, karena database sementara hilang begitu proses berhenti. Terapkan migrasi dengan `npm run migrate` lalu periksa dengan `npm run verify:database` sebelum aplikasi dijalankan.
