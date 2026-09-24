# Status Implementasi

> **Status terkini (24 September 2026).** Hosting: Vercel (K2). Migrasi 001-041 sudah diterapkan
> ke production pada 23 September 2026 (042, nama penulis artikel, belum), jadi catatan "belum diterapkan" di bagian-bagian lama di
> bawah sudah tidak berlaku. CI berjalan di setiap pull request (Node 22 dan 24). Email tidak
> dipakai; pemberitahuan dikirim manual lewat WhatsApp dari konsol petugas. Cara menjalankan
> production ada di `RUNBOOK.md`. Bagian di bawah adalah riwayat per phase.

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
- **Notifikasi peristiwa (R8.3, K10: email sekarang, WhatsApp di Phase 16).** Perubahan status pendaftaran dan berkas ditolak mengantrekan email ke pendaftar dan wali pada formulir (bukan untuk pendaftaran yang dibatalkan); tagihan yang baru lunas mengantrekan email ke wali aktif santri. Semua lewat `notification_outbox` (migrasi 036, sudah diterapkan) dan baru terkirim bila `npm run worker:notifications` berjalan. Di Vercel worker ini tidak berjalan dan email tidak dipakai (lihat `RUNBOOK.md`). Belum ada preferensi penerima.
- **Batasan satu mata uang (KR7, diputuskan 22 September 2026: opsi a).** Tagihan dan koreksinya hanya dalam rupiah (`invoices.amount_rupiah`, `invoice_corrections.corrected_amount_rupiah`); tidak ada kolom mata uang maupun kurs. Biaya yang dibayar dalam EGP di Mesir harus dicatat dalam rupiah secara manual. Ditinjau ulang begitu ada transaksi EGP nyata yang harus dicatat apa adanya; saat itu bagian keuangan perlu memutuskan kapan kurs dikunci (saat tagihan dibuat atau saat dibayar).

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

## Remediasi Phase R3 (21 September 2026)

Rencana: `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md` Bagian 5. Hasil dan bukti: `docs/REMEDIASI_R3_HASIL_2026-09-21.md`.

Phase ini tidak menulis fitur baru. Ia menyelesaikan fitur yang backend-nya sudah jadi, sudah bermigrasi, sudah punya test, tetapi tidak punya satu pun kontrol di UI.

- Konsol operasional: unduh laporan CSV, kuitansi PDF, tandai invoice lunas, koreksi dan pembatalan invoice beserta riwayat koreksinya, panel visa mendekati kedaluwarsa, unggah dan daftar berkas visa, serta ledger inventaris beserta riwayat mutasinya.
- Konsol petugas dan halaman cek status dapat membuka berkas yang diunggah. Sebelumnya petugas menyetujui atau menolak paspor, ijazah, dan surat kesehatan tanpa bisa membukanya.
- Aksi keluar dari semua perangkat untuk akun internal, dan keluar dari sesi ini untuk pendaftar.

Tiga tabel ternyata hanya ditulis dan tidak pernah dibaca dari mana pun sejak migrasi 022: `invoice_corrections`, `visa_documents`, dan `inventory_movements`. Jalur bacanya ditambahkan di phase ini.

**Temuan terbuka:** `POST /api/accounts/invitations` tidak dipanggil dari UI mana pun. Jalur pembuatan akun lewat undangan, yang membuat admin tidak perlu mengarang kata sandi untuk orang lain, lengkap dari ujung ke ujung kecuali tombol untuk memulainya. Bukan bagian dari task R3 mana pun.

## Remediasi Phase R4 (21 September 2026)

Kontras dan kejujuran tampilan. Palet logo emas/charcoal dipulihkan; pelanggaran kontras 117 → 0 (alat `npm run check:contrast`); status sesi jujur dengan penanganan 401 terpusat; data karangan dihapus dari portal; pencarian global dihapus; tinggi mobile index 19.115 → 16.001 px (target 12.000 tidak tercapai, diterima). Rincian dan temuan terbuka: `docs/REMEDIASI_R4_HASIL_2026-09-21.md`.

## Remediasi Phase R5 (21 September 2026)

Alat uji yang jujur. `test:browser-contract` membuka 17 halaman x 5 lebar di browser sungguhan (CSP, galat JS, gulir horizontal, gambar, nama aksesibel); kontrak lama menjadi `test:static-contract`. `uat-roles` diganti `test:role-authorization` (tujuh role lewat HTTP plus batas data wali/santri). `security:check` memindai folder publik dan menjalankan `npm audit`. `test:scale` mencatat angka awal E-01 (1.003 query untuk 200 pendaftar) dan E-03 (304 KB portal) dan sengaja gagal sampai R6. Rincian: `docs/REMEDIASI_R5_HASIL_2026-09-21.md`.

## Remediasi Phase R6 (21 September 2026)

Skalabilitas. Daftar pendaftar 1.003 query -> 8 (tidak tumbuh); pagination untuk pendaftaran, artikel (tanpa body), santri (cakupan akses di SQL, diuji setara canView), dan tagihan (dengan nama santri); ETag/Cache-Control/304/brotli untuk aset statis dengan versi dari sidik isi (`npm run stamp:assets` wajib setelah mengubah CSS/JS); `website.css` dipecah jadi core (internal) dan public; portal 304 KB -> 45,6 KB di jaringan; rate limit token undangan/reset. Migrasi 034 (index) sudah diterapkan ke production. Akun, visa, inventaris, maddah belum berpaginasi (keputusan cakupan). Rincian: `docs/REMEDIASI_R6_HASIL_2026-09-21.md`.

## Remediasi Phase R7 (22 September 2026)

Distribusi dan konten. Tag Open Graph/Twitter disisipkan server untuk halaman publik dengan URL absolut dari `APP_BASE_URL` (**kini wajib di staging/production**); gambar bagikan `assets/og-default.jpg` 1200 x 630. `/robots.txt` dan `/sitemap.xml` dihasilkan server (halaman internal otomatis Disallow, artikel terbit dengan lastmod). `article.html?slug=...` dirender server (judul, meta, tag bagikan, isi; 404 noindex untuk draf/arsip). Byline dari akun pembuat; tanpa lokasi dan tanggal karangan. Isi artikel memakai Markdown terbatas (KR5 a) dengan satu renderer server untuk halaman dan pratinjau CMS. **R7.6 (artikel nyata) menunggu klien.** Rincian: `docs/REMEDIASI_R7_HASIL_2026-09-22.md`.

## Remediasi Phase R8 (22 September 2026)

Pengerasan. Prototipe lama dan rute `/proposal`, `/hamasah` dihapus (KR6 a); `.vercelignore` tolak-semua, **deployment Vercel lama akan kosong setelah push**. Worker pengingat visa tersambung (migrasi 035). Notifikasi email untuk status pendaftaran, berkas perlu diperbaiki, dan pembayaran diterima (migrasi 036). scrypt N=2^16 r=8 p=2 (~225 ms), hash lama tetap sah. 404 dengan CTA dan base href. Mata uang tetap rupiah (KR7 a). **R8.7 (audit per role) menunggu pemilik proyek.** Migrasi 035 dan 036 sudah diterapkan ke production. Rincian: `docs/REMEDIASI_R8_HASIL_2026-09-22.md`.

## Rapor digital PDF untuk wali (22 September 2026)

`GET /api/students/:id/report.pdf?from=&to=` (izin `students.read`, akses sama dengan dashboard: wali hanya santrinya sendiri; diaudit sebagai ekspor). Tombol "Unduh Rapor (PDF)" di tab "Rapor & Ringkasan" portal, mengikuti periode yang diterapkan. Isi hanya catatan nyata: identitas, kehadiran dengan rincian status, progres maddah, prestasi, kegiatan (20 terbaru), evaluasi pembina, catatan disiplin; bagian kosong dinyatakan kosong, tanpa nilai atau predikat. Generator PDF multi-halaman tanpa dependency (`server/pdf.js`, Helvetica WinAnsi; huruf di luar Latin-1 seperti Arab menjadi "?"). Progres maddah untuk wali (diputuskan pemilik proyek 22 September 2026): ringkasan saja lewat `GET /api/students/:id/course-progress` (judul, jumlah materi, jumlah selesai, persen), hanya untuk santri yang terhubung; isi materi LMS (`/courses`) tetap tertutup untuk wali. Tab Maddah portal dan rapor PDF memakai ringkasan ini.

## Tagihan dan kuitansi untuk wali (22 September 2026)

Tab "Tagihan & Kuitansi" di portal (wali dan admin). `GET /api/students/:id/invoices` dan `GET /api/students/:id/invoices/:invoiceId/receipt.pdf`: service hanya meloloskan wali santri yang terhubung dan admin; wali tidak menerima alasan pembatalan dan versi internal; kuitansi hanya untuk tagihan lunas milik santri di URL; unduhan diaudit sebagai `invoice.receipt-downloaded`. Endpoint keuangan `/api/operations/invoices/:id/receipt.pdf` tetap khusus keuangan. Kuitansi memakai nama santri (bukan ID), rupiah, dan tanggal WIB.

## Jadwal keberangkatan per kloter (22 September 2026)

Petugas pendaftaran dan admin (izin baru `departures.manage`) membuat kloter di konsol pendaftaran (nama, tanggal rencana, kota/bandara asal, status, catatan untuk pendaftar) dan menugaskan pendaftar dari kartunya. Halaman cek status menampilkan kloter pendaftar; tanpa kloter atau tanpa tanggal tertulis "belum ditetapkan". Kloter dibatalkan tidak menerima pendaftar baru. Perubahan diaudit. Migrasi 037 sudah diterapkan ke production. Email ke pendaftar dan wali saat kloter ditetapkan atau dipindah (tipe outbox `departure-assigned`, migrasi 038); tidak dikirim saat kloter yang sama disimpan ulang, saat dilepas, atau untuk pendaftaran dibatalkan. Perubahan tanggal, asal, atau status kloter mengirim email ke setiap anggota (tipe `departure-updated`, migrasi 039) berisi nilai lama dan baru; mengubah nama atau catatan saja tidak mengirim email. Konsol menampilkan jumlah email yang diantrekan.

## Ibadah dan kesehatan terstruktur (22 September 2026)

Migrasi 040. Musyrif/admin mencatat di halaman monitoring: presensi sholat 5 waktu per tanggal (berjamaah/munfarid/tidak/izin), setoran hafalan (ziyadah/murajaah, penilaian), dan kesehatan (kondisi, keluhan, tindakan, catatan untuk wali). Portal: tab Sholat Berjamaah kini dari data terstruktur (rekap dan tabel per hari), setoran hafalan di tab Talaqqi & Tahfidz, tab Kesehatan bila aktif. Rapor PDF memuat sholat, hafalan, dan kesehatan versi wali. Akses memakai aturan rekam jejak (musyrif hanya asramanya). **Kesehatan dikunci `HEALTH_RECORDS_ENABLED` (default mati)** sampai kebijakan privasi memuat data kesehatan; wali hanya melihat kondisi dan catatan untuk wali, detail medis hanya staf dan tidak masuk audit. Presensi sholat lama yang ditebak dari teks kategori tetap tampil sebagai cadangan bila ringkasan gagal dimuat.

## Gerbang rilis setelah R1 sampai R8 (22 September 2026)

- **Gerbang 1 (boleh dilihat orang luar): tertahan.** R1 dan R2 selesai (kecuali R1.0 putar kredensial, tugas manusia). R8.7 belum dilakukan. Konten publik juga masih menunggu klien: alamat Hay Asyir/Madinat Nasr (K16), teks kebijakan privasi, nomor WhatsApp resmi.
- **Gerbang 2 (boleh dipakai staf): tertahan pada Gerbang 1.** R3 dan R5 selesai.
- **Gerbang 3 (trafik nyata): tertahan.** R4 dan R6 selesai, angka performa R6 tercatat; R7 selesai kecuali R7.6 (artikel nyata dari klien). Di luar rencana saat itu: hosting (K2), penerapan migrasi ke Supabase, scheduler worker, dan CI. Per 23-24 September: K2 Vercel, migrasi 001-041 diterapkan, CI dan pemantau uptime ada; worker email tidak dipakai.

## LMS: tugas dan kuis (23 September 2026)

Keputusan KR3 opsi (b) dicabut: alurnya kini lengkap dari ujung ke ujung, sehingga tipe
materi `assignment` dan `quiz` dapat dipilih kembali saat guru membuat materi.

- **Guru menyusun.** Tipe kuis memunculkan penyusun pertanyaan (pertanyaan dan kunci
  jawaban, bisa ditambah dan dihapus); isinya disimpan sebagai JSON pada kolom `content`,
  bentuk yang sama dengan yang dibaca `submitQuiz`. Tipe tugas memakai kolom isi materi
  sebagai instruksi.
- **Santri mengerjakan.** Kuis tampil sebagai daftar isian dengan keterangan batas tiga
  percobaan dan nilai lulus 70; penilaian dikerjakan server. Tugas dikirim sekali, lalu
  kartunya berubah menjadi menunggu penilaian, dan setelah dinilai menampilkan nilai serta
  catatan pengajar.
- **Guru menilai.** `GET /api/courses/:id/submissions` (izin `courses.manage`, hanya maddah
  milik guru bersangkutan) menampilkan kiriman beserta nama santri dan judul materi. Nama
  santri diambil di server lewat `studentNameOf`, karena guru tidak memiliki izin
  `students.read`. Penilaian memakai `PATCH /api/lms/submissions/:id/review`; nilai 70 ke
  atas menandai materi selesai.
- **Kunci jawaban tidak pernah dikirim ke peramban santri.** Sebelumnya `content` kuis
  dikirim apa adanya, sehingga kunci jawaban dapat dibaca dari respons API. Kini santri
  hanya menerima daftar pertanyaan, batas percobaan, dan ambang kelulusan; riwayat
  percobaan serta status kiriman tugasnya sendiri ikut disertakan.
- Migrasi tidak berubah: `lms_attempts` (025) dan `lms_submissions` (026) sudah ada sejak
  awal. Yang ditambahkan hanya satu jalur baca `listSubmissionsByCourse` pada store.

## Sebelum go-live penuh

- Runbook yang berlaku: `RUNBOOK.md` (menggantikan `docs/RUNBOOK_RELEASE_DAN_RESTORE_2026-09-20.md`). `npm run release:check` memeriksa env staging/production dan artefak rilis tanpa menulis database.
- Panduan role dan lembar UAT tersedia di `docs/PANDUAN_ROLE_DAN_UAT_2026-09-20.md`; pengisian serta sign-off pemilik proses tetap dilakukan manual pada environment staging.
- Worker pengingat visa (`npm run worker:visa-reminders`, dijalankan scheduler sekali sehari) tersambung sejak R8.2: memindai dokumen, mengirim ringkasan ke admin aktif, state di `visa_reminder_log` (migrasi 035, sudah diterapkan); tanpa pengirim email ia gagal, bukan pura-pura terkirim. Di Vercel tidak dijadwalkan karena email tidak dipakai; daftar kedaluwarsa 30 hari dipantau manual di konsol Operasional.
- PDF kuitansi teks, export laporan operasional CSV, archive materi LMS, cover media artikel, kontrak browser publik, performance smoke, dan harness evaluasi AI tersedia untuk validasi lokal.

- Container Node tersedia melalui `Dockerfile` dan sudah diperiksa dengan `npm run check:docker`: dependency production terpasang, seluruh modul lengkap, server start, dan proses berhenti rapi saat menerima SIGTERM.
- Pemeriksaan kesehatan dipisah: `GET /api/health` untuk liveness (tanpa database) dan `GET /api/ready` untuk readiness (memeriksa database, batas waktu 2 detik). Platform hosting sebaiknya memakai `/api/health` sebagai health check container.
- Validasi environment tersedia: `DATABASE_URL` selalu wajib, bucket privat wajib saat `APP_ENV=production`, dan bootstrap key diperiksa panjangnya jika diisi.
- Skrip yang menulis ke database (migrate, seed artikel, auth-live-check) menolak `APP_ENV` kosong, dan menolak production tanpa konfirmasi `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND` di terminal. Lihat `PRODUCTION_DEPLOYMENT.md`.
- ~~Pindahkan penyimpanan dokumen ke object storage privat dengan tautan bertanda tangan.~~ Selesai: Supabase Storage, bucket privat, unggah langsung dari peramban.
- Hubungkan reset password ke email atau WhatsApp resmi.
- Simpan rahasia pada environment deployment, bukan file `.env` di repositori.
- Jika ingin jawaban generatif, pilih provider/model, biaya, retensi data, dan sumber FAQ; lalu pasang adapter provider melalui `config.aiProvider`/secret deployment dan jalankan evaluasi pengajar. Adapter backend sudah siap dan tetap fallback lokal saat provider tidak tersedia.
