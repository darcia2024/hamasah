# Status Implementasi

## Phase 2: Website publik, CMS, dan pendaftaran

Pendaftaran dan konten artikel memakai PostgreSQL production saat `DATABASE_URL` tersedia. Repository pendaftaran menyimpan data calon, riwayat perubahan status, dan metadata dokumen dalam transaksi.

- `POST /api/registrations` membuat nomor registrasi dan token akses satu kali.
- `GET /api/registrations/:registrationId` membutuhkan Bearer token calon pendaftar.
- `POST /api/registrations/:registrationId/documents` menyimpan metadata berkas setelah otorisasi.
- `PATCH /api/registrations/:registrationId/status` tersedia bagi petugas pendaftaran dan admin.
- `GET` dan `POST /api/articles` menyajikan CMS artikel dengan akses tulis petugas.
- `POST /api/faq/ask` menjawab dari knowledge base yang terkontrol.
- `website/staff.html` menyediakan konsol petugas untuk status pendaftaran dan penerbitan artikel.
- `website/article.html` menampilkan artikel yang diterbitkan dari CMS.

## Phase 3: Akun dan role

Selesai sebagai fondasi otentikasi lokal.

- Kata sandi memakai `scrypt` dengan salt acak.
- Sesi memakai token acak yang disimpan sebagai hash dan berakhir dalam 12 jam.
- Role tersedia: admin, petugas pendaftaran, pengawas, wali, dan santri.
- Reset kata sandi menghasilkan token berlaku 30 menit. Pengiriman token ke email atau WhatsApp perlu adapter layanan pengiriman saat deployment.
- `website/portal.html` menyediakan login, ringkasan role, dashboard awal wali/santri, dan manajemen akun oleh admin.

## Phase 4: Portal monitoring

Selesai sebagai API data bersama untuk pengawas, wali, dan santri.

- Profil santri dan relasi akun wali/santri.
- Kegiatan, presensi, achievement, evaluasi, dan catatan disiplin.
- Hak akses membatasi wali dan santri hanya ke rekam jejak yang terhubung dengan akun mereka.
- `website/monitoring.html` memberi admin dan pengawas ruang untuk membuat profil santri, menghubungkan akun, mencatat pembinaan, dan mengunduh ringkasan CSV.

## Phase 5: LMS dan Study Partner

Selesai sebagai API pembelajaran inti.

- Maddah, materi video/PDF/teks/tugas/kuis, dan enrollment santri.
- Progress tercatat per materi yang diselesaikan.
- Study Partner memberikan rangkuman, poin penting, serta jawaban berdasarkan panduan materi yang diinput pengajar.
- `website/lms.html` menyediakan pengelolaan maddah bagi admin/pengawas dan ruang belajar bagi santri.

## Modul operasional

- Invoice memakai nomor `INV/HI/YYYY/NNNNN`; pembayaran membuat nomor kuitansi `KWT/HI/YYYY/NNNNN`.
- Status visa, catatan persiapan berkas, serta inventaris asrama tersimpan pada modul operasional.
- `website/operations.html` menyediakan konsol admin untuk tiga alur tersebut.

## Menjalankan secara lokal

```powershell
Copy-Item .env.example .env
# Sesuaikan APP_ENV dengan database yang dituju DATABASE_URL.
# Isi HAMASAH_BOOTSTRAP_KEY pada environment terminal Anda.
npm start
```

Buka `http://127.0.0.1:4273/website/`.

Halaman internal tersedia di `/website/staff.html`, `/website/portal.html`, `/website/monitoring.html`, `/website/lms.html`, dan `/website/operations.html`.

## Infrastruktur production

- Schema PostgreSQL seluruh modul telah dimigrasikan dan 19 tabel aplikasi sudah tervalidasi di Supabase.
- Seluruh tabel memakai Row Level Security tanpa policy (`003_enable_row_level_security.sql`), sehingga tertutup dari Data API Supabase. Aplikasi tetap berjalan karena terhubung sebagai pemilik tabel. Diterapkan ke database production pada 16 September 2026, hasil `npm run verify:database`: 3 migrasi diterapkan, 20 tabel tersedia, semua memakai Row Level Security.
- Database production sudah memakai catatan migrasi (`schema_migrations`) setelah dijalankan dalam mode baseline, jadi migrasi berikutnya cukup dengan `npm run migrate`.
- Nomor registrasi diambil dari tabel `document_counters` (`004_document_counters.sql`) dengan satu perintah atomik per jenis dokumen dan per tahun. Pendaftar baru disimpan memakai `INSERT`, sehingga nomor yang bentrok gagal keras dan tidak menimpa data pendaftar lain.
- Schema diterapkan lewat migration runner berversi (`npm run migrate`) yang mencatat setiap migrasi di tabel `schema_migrations`, menolak file migrasi yang sudah diterapkan lalu diubah, dan menyediakan mode `--baseline` untuk database yang dulu disiapkan manual. `npm run verify:database` memeriksa migrasi, tabel, dan status Row Level Security.
- `npm run seed:articles` menyinkronkan artikel publik ke PostgreSQL secara idempoten.
- Endpoint `GET /api/articles` dan `GET /api/articles/:slug` sudah membaca PostgreSQL saat `DATABASE_URL` tersedia.
- Pendaftaran, artikel, akun, dan sesi memakai PostgreSQL saat `DATABASE_URL` tersedia. Keempat store berbagi satu pool koneksi (`server/db.js`), dan penyimpanan pendaftaran memakai transaksi sungguhan pada satu koneksi.
- Endpoint monitoring, LMS, dan operasional masih menggunakan repository JSON sampai adapter PostgreSQL masing-masing selesai.
- Test store PostgreSQL berjalan offline di atas PGlite (`server/test-support/database.js`), termasuk test integrasi API di `server/app-postgres.test.js`.

## Sebelum go-live penuh

- Container Node tersedia melalui `Dockerfile`; jalankan pada platform yang menyediakan volume atau database terkelola.
- Validasi environment tersedia: `DATABASE_URL` selalu wajib, bucket privat wajib saat `APP_ENV=production`, dan bootstrap key diperiksa panjangnya jika diisi.
- Skrip yang menulis ke database (migrate, seed artikel, auth-live-check) menolak `APP_ENV` kosong, dan menolak production tanpa konfirmasi `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND` di terminal. Lihat `PRODUCTION_DEPLOYMENT.md`.
- Ganti repository JSON yang tersisa dengan adapter PostgreSQL dan object storage privat untuk dokumen.
- Hubungkan reset password ke email atau WhatsApp resmi.
- Simpan rahasia pada environment deployment, bukan file `.env` di repositori.
- Jika ingin jawaban generatif, hubungkan Study Partner ke provider AI melalui backend dengan konteks maddah yang dibatasi.
