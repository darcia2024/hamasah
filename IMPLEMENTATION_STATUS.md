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
- Fondasi adapter AI tersedia dengan quota per akun, timeout provider, prompt-injection guard, konteks materi terbatas, metrik agregat, dan fallback deterministik. Provider/model produksi sengaja belum dikonfigurasi sampai keputusan biaya dan kebijakan data disetujui.
- `website/lms.html` menyediakan pengelolaan maddah bagi admin/pengawas dan ruang belajar bagi santri.

## Modul operasional

- Invoice memakai nomor `INV/HI/YYYY/NNNNN`; pembayaran membuat nomor kuitansi `KWT/HI/YYYY/NNNNN`.
- Status visa, catatan persiapan berkas, serta inventaris asrama tersimpan pada modul operasional.
- `website/operations.html` menyediakan konsol admin untuk tiga alur tersebut.

## Menjalankan secara lokal

Cara termudah, tanpa database luar dan tanpa file `.env`:

```powershell
npm install
npm run dev
```

`npm run dev` memakai PostgreSQL in-process (PGlite) di folder `data/dev-db`, menerapkan seluruh migrasi, lalu mengisi akun contoh untuk setiap role. Kata sandi akun contoh dicetak di terminal. Gunakan `npm run dev:reset` untuk mulai dari database kosong.

Untuk menjalankan aplikasi terhadap database PostgreSQL sungguhan (staging atau production):

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
- Riwayat perubahan status dan unggahan berkas mencatat akun pelaku (`005_actor_accounts.sql`). Peran diambil dari sesi login, bukan dari isi request, dan kunci API petugas (`HAMASAH_STAFF_API_KEY`) sudah dihapus sepenuhnya.
- Nomor registrasi diambil dari tabel `document_counters` (`004_document_counters.sql`) dengan satu perintah atomik per jenis dokumen dan per tahun. Pendaftar baru disimpan memakai `INSERT`, sehingga nomor yang bentrok gagal keras dan tidak menimpa data pendaftar lain.
- Schema diterapkan lewat migration runner berversi (`npm run migrate`) yang mencatat setiap migrasi di tabel `schema_migrations`, menolak file migrasi yang sudah diterapkan lalu diubah, dan menyediakan mode `--baseline` untuk database yang dulu disiapkan manual. `npm run verify:database` memeriksa migrasi, tabel, dan status Row Level Security.
- `npm run seed:articles` menyinkronkan artikel publik ke PostgreSQL secara idempoten.
- Endpoint `GET /api/articles` dan `GET /api/articles/:slug` sudah membaca PostgreSQL saat `DATABASE_URL` tersedia.
- Pendaftaran, artikel, akun, dan sesi memakai PostgreSQL saat `DATABASE_URL` tersedia. Keempat store berbagi satu pool koneksi (`server/db.js`), dan penyimpanan pendaftaran memakai transaksi sungguhan pada satu koneksi.
- Seluruh endpoint (pendaftaran, akun, monitoring santri, LMS, dan operasional) membaca dan menulis ke PostgreSQL lewat satu koneksi bersama. Tidak ada lagi penyimpanan berkas JSON di runtime.
- Test store PostgreSQL berjalan offline di atas PGlite (`server/test-support/database.js`), termasuk test integrasi API di `server/app-postgres.test.js`.

## Remediasi Phase R1 (20 September 2026)

Rencana: `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md`. Hasil dan bukti: `docs/REMEDIASI_R1_HASIL_2026-09-20.md`.

- Seluruh style dan script inline di `website/` dihapus. Content Security Policy memakai `style-src 'self'` tanpa `'unsafe-inline'`, sehingga 183 atribut `style="..."` (126 di HTML, 57 di template string JavaScript) dan 1 blok `<script>` inline sebelumnya diblokir browser dan tidak pernah berlaku. Konsol CRM setelah login yang sebelumnya menghasilkan 85 pelanggaran CSP kini bersih.
- Formulir konsultasi di halaman kontak sekarang benar-benar mengirim. `POST /api/inquiries` menyimpan ke tabel `inquiries` (migrasi `032_inquiries.sql`), dengan rate limit per IP dan pencatatan audit tanpa nomor maupun isi pesan. Petugas pendaftaran menindaklanjutinya lewat tab `Pesan Konsultasi` di konsol. Sebelumnya handler formulir ditulis inline, diblokir CSP, dan bahkan bila berjalan hanya menampilkan pesan sukses tanpa menyimpan apa pun.
- Tombol kredensial pengujian beserta alamat email dan kata sandi literal dicabut dari `website/portal.html` dan `website/portal.js`, yang disajikan publik.
- Elemen DOM yang dipertahankan hanya demi assertion test dihapus dari `portal.html`. Tidak ada test yang benar-benar menyebutnya.
- Gerbang `npm run test:csp-contract` menolak style dan script inline baru pada 16 halaman dan 19 skrip, dan ikut berjalan pada `npm test`.

Menunggu tindakan manusia: memutar kata sandi `tester@hamasah.test` bila akun itu ada di staging atau production, mengisi nomor WhatsApp resmi pada `WHATSAPP_NUMBER` di `website/kontak.js`, dan menerapkan migrasi `032` ke staging lalu production.

## Remediasi Phase R2 (21 September 2026)

Rencana: `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md` Bagian 4. Hasil dan bukti: `docs/REMEDIASI_R2_HASIL_2026-09-21.md`.

- Berkas sisi server tidak lagi dapat diunduh publik. `registration-service.js`, dua berkas test, `DESIGN_DECISIONS.md`, dan enam berkas `*.metadata.json` dipindah atau dihapus dari `website/`. `registration-domain.js` sengaja tetap di sana karena dipakai browser dan server sekaligus, dan alasannya ditulis di kepala berkas.
- Penyajian berkas statis memakai daftar-izin ekstensi. Sebelumnya `MIME_TYPES` hanya menentukan `Content-Type`, dan berkas apa pun yang ekstensinya tidak terdaftar tetap disajikan sebagai `application/octet-stream`, sehingga satu berkas `.env` atau `.sql` yang salah tempat langsung dapat diunduh. Di atasnya ada daftar-tolak nama untuk `*.test.js`, `*.metadata.json`, dan berkas berawalan titik. Jawabannya 404, bukan 403.
- Rekam jejak santri menyimpan pencatatnya. Migrasi `033_student_record_actor.sql` menambahkan `recorded_by_account_id` ke lima tabel catatan; nilainya diambil dari sesi yang sedang login dan tidak dapat disetel lewat body request. Konsol monitoring kini menampilkan daftar rekam jejak beserta pencatatnya, yang sebelumnya tidak ada sama sekali.
- Formulir pendaftaran meminta persetujuan pemrosesan data pribadi secara terpisah dan wajib, dengan tautan ke `website/kebijakan-privasi.html`. Versi kebijakan distempel server saat persetujuan diberikan, tidak lagi memakai default `'v1'` yang menunjuk dokumen tidak pernah ada, dan tidak berubah karena penyuntingan profil.
- Versi cache-busting `?v=` dinaikkan untuk seluruh berkas yang berubah sejak Phase R1. Sebelumnya R1 memindahkan 183 atribut style ke stylesheet tanpa menaikkan satu pun versinya, yang pada rilis membuat pengunjung dengan cache lama menerima halaman tanpa tata letak.

**Menunggu pihak Hamasah:** isi tujuh bagian kebijakan privasi. Sampai materi itu turun, `website/kebijakan-privasi.html` berstatus draf, diberi `noindex`, tidak masuk sitemap, dan situs belum boleh dirilis ke publik.

## LMS: tugas dan kuis ditunda (21 September 2026)

Keputusan KR3 pada `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md`, dikerjakan sebagai Task R3.6 opsi (b).

Tipe materi `assignment` dan `quiz` **tidak lagi dapat dipilih** saat guru membuat materi. Alasannya: backend-nya sudah lengkap (tabel `lms_attempts` di migrasi 025, `lms_submissions` di migrasi 026, beserta empat endpoint-nya), tetapi tidak ada satu pun UI untuk mengerjakannya di sisi santri maupun menilainya di sisi guru. Sebelum ini, guru dapat membuat tugas yang tidak bisa dikerjakan siapa pun.

Yang tidak diubah: `MATERIAL_TYPES` di `server/lms-service.js` tetap memuat kedua tipe, dan API tetap menerimanya. Materi lama bertipe itu tetap terbaca di daftar materi. Yang dicabut hanya pilihannya di formulir, sehingga alurnya tinggal dipasang kembali tanpa migrasi data saat UI-nya dibangun.

**Jangan menuliskannya sebagai fitur yang tersedia** pada materi pemasaran maupun dokumen serah terima sampai alur pengerjaan dan penilaiannya benar-benar ada.

## Sebelum go-live penuh

- Runbook rilis, backup/restore, rollback, insiden, monitoring, retensi, dan rotasi akses tersedia di `docs/RUNBOOK_RELEASE_DAN_RESTORE_2026-09-20.md`. `npm run release:check` memeriksa env staging/production dan artefak rilis tanpa menulis database.
- Panduan role dan lembar UAT tersedia di `docs/PANDUAN_ROLE_DAN_UAT_2026-09-20.md`; pengisian serta sign-off pemilik proses tetap dilakukan manual pada environment staging.
- Scheduler adapter visa, PDF kuitansi teks, export laporan operasional CSV, archive materi LMS, cover media artikel, kontrak browser publik, performance smoke, dan harness evaluasi AI tersedia untuk validasi lokal.

- Container Node tersedia melalui `Dockerfile` dan sudah diperiksa dengan `npm run check:docker`: dependency production terpasang, seluruh modul lengkap, server start, dan proses berhenti rapi saat menerima SIGTERM.
- Pemeriksaan kesehatan dipisah: `GET /api/health` untuk liveness (tanpa database) dan `GET /api/ready` untuk readiness (memeriksa database, batas waktu 2 detik). Platform hosting sebaiknya memakai `/api/health` sebagai health check container.
- Validasi environment tersedia: `DATABASE_URL` selalu wajib, bucket privat wajib saat `APP_ENV=production`, dan bootstrap key diperiksa panjangnya jika diisi.
- Skrip yang menulis ke database (migrate, seed artikel, auth-live-check) menolak `APP_ENV` kosong, dan menolak production tanpa konfirmasi `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND` di terminal. Lihat `PRODUCTION_DEPLOYMENT.md`.
- Pindahkan penyimpanan dokumen (paspor, ijazah, surat kesehatan) ke object storage privat dengan tautan bertanda tangan.
- Hubungkan reset password ke email atau WhatsApp resmi.
- Simpan rahasia pada environment deployment, bukan file `.env` di repositori.
- Jika ingin jawaban generatif, pilih provider/model, biaya, retensi data, dan sumber FAQ; lalu pasang adapter provider melalui `config.aiProvider`/secret deployment dan jalankan evaluasi pengajar. Adapter backend sudah siap dan tetap fallback lokal saat provider tidak tersedia.
