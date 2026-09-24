# Panduan rilis ke hosting (22 September 2026)

> **Arsip.** Dokumen ini dicatat untuk riwayat dan tidak lagi menjadi pegangan kerja. Cara
> menjalankan sistem yang berlaku ada di `RUNBOOK.md` di akar repo.

Panduan langkah demi langkah dari repo sampai situs Hamasah International online: staging dulu, lalu production. Dokumen ini melengkapi, bukan menggantikan:

- `PRODUCTION_DEPLOYMENT.md`: pengaman skrip database, Row Level Security, pembatas laju, header keamanan.
- `docs/RUNBOOK_RELEASE_DAN_RESTORE_2026-09-20.md`: gate rilis, backup, restore rehearsal, insiden, dan rollback.

Semua perintah di sini dijalankan manusia dari terminal yang lingkungannya jelas (`APP_ENV`). Tidak ada langkah yang boleh dijalankan otomatis ke production.

---

## 0. Yang harus diputuskan sebelum mulai

| Keputusan | Kenapa memblokir | Rekomendasi |
|---|---|---|
| **K2 hosting** | Menentukan cara menjalankan container, worker, cron, dan domain. | Platform container dengan **satu instance** yang selalu hidup, cron/scheduled job, HTTPS, dan domain kustom: Railway, Render, atau Fly.io; atau VPS dengan Docker. **Bukan** Vercel/Netlify (serverless): aplikasi ini proses Node yang hidup terus dengan timer latar. |
| **Jumlah instance** | Pembatas laju dan kuota AI disimpan di memori proses. | Tetap **satu instance**. Lebih dari satu wajib memindahkan state ke Redis dulu (lihat `PRODUCTION_DEPLOYMENT.md`). |
| **K4 domain dan email pengirim** | `APP_BASE_URL`, `EMAIL_FROM`, tautan di email, sitemap, dan tag bagikan memakai domain ini. | Misalnya `https://hamasahinternational.com` dan `noreply@hamasahinternational.com`. |
| **K5 penyedia email** | Worker notifikasi butuh pengirim sungguhan. | Resend (sudah didukung, `EMAIL_DRIVER=resend`). |

Materi klien yang belum ada **tidak** memblokir rilis staging, tetapi memblokir pembukaan untuk publik (Gerbang 1):

- Teks kebijakan privasi final (termasuk bagian data pembinaan dan kesehatan), lalu cabut `noindex` di `website/kebijakan-privasi.html`.
- Nomor WhatsApp resmi untuk `WHATSAPP_NUMBER` di `website/kontak.js`.
- Konfirmasi alamat Hay Asyir / Madinat Nasr (K16) di beranda, biaya, kontak, dan cek status.
- Minimal enam artikel nyata dengan cover dan alt text (R7.6).

Tugas manusia yang juga harus selesai sebelum publik: **R1.0** (putar kredensial yang pernah tersaji publik) dan **R8.7** (audit ulang per role, daftar periksanya di `docs/REMEDIASI_R8_HASIL_2026-09-22.md`).

---

## 1. Arsitektur yang dijalankan

```
                 ┌────────────────────────────── platform hosting ─────────────────────────────┐
 pengunjung ──►  │  web (container, 1 instance)  node server.js       health: /api/health         │
   HTTPS         │     └─ worker notifikasi di dalam proses (NOTIFICATION_WORKER_IN_PROCESS=true) │
                 │  cron harian                  node scripts/visa-reminder-worker.js --once      │
                 └─────────────────────────────────────────────────────────────────────────────┘
                         │ PostgreSQL (TLS)                │ Storage API              │ HTTPS
                         ▼                                 ▼                          ▼
                 Supabase Postgres               Supabase Storage (bucket privat)    Resend
```

Image Docker yang sama dipakai untuk web dan cron. Sejak commit `cf1f059` image menyertakan `scripts/notification-worker.js` dan `scripts/visa-reminder-worker.js`.

**Worker notifikasi (email undangan, reset kata sandi, status pendaftaran, berkas, pembayaran, kloter).** Dua pilihan:

- **A (disarankan untuk satu instance):** `NOTIFICATION_WORKER_IN_PROCESS=true` di proses web. Tidak perlu layanan kedua.
- **B:** layanan terpisah dari image yang sama dengan perintah `node scripts/notification-worker.js` (berjalan terus, jeda `NOTIFICATION_WORKER_INTERVAL_MS`, default 30 detik). Klaim outbox memakai lease, jadi A dan B aman berjalan bersamaan.

Tanpa salah satunya, email hanya menumpuk di `notification_outbox` dan tidak pernah terkirim.

**Pengingat visa.** Cron harian, misalnya pukul 07.00 WIB (`0 0 * * *` UTC), menjalankan `node scripts/visa-reminder-worker.js --once`. Bila ada pengingat baru tetapi pengirim email belum dikonfigurasi atau tidak ada admin aktif, proses keluar dengan kode 1 tanpa menandai apa pun terkirim (dicoba lagi besok); pasang notifikasi kegagalan cron di platform.

---

## 2. Siapkan akun dan layanan

Lakukan dua kali: satu set untuk **staging**, satu set untuk **production**. Jangan pernah memakai database production untuk staging.

1. **Supabase**: buat dua project (staging, production), region terdekat dengan pengguna (Singapura).
   - Salin **connection string pooler** untuk aplikasi (`DATABASE_URL`) dan **connection string session/direct port 5432** untuk migrasi (`DATABASE_MIGRATION_URL`). Migrasi tidak boleh lewat pooler mode transaksi.
   - Buat bucket **privat** untuk berkas pendaftaran (`STORAGE_BUCKET`, misalnya `hamasah-private-documents`). Jangan dibuat publik.
   - Salin `SUPABASE_URL` dan **service role key** (`SUPABASE_SERVICE_ROLE_KEY`). Service role key hanya untuk server; jangan pernah ditaruh di `website/` atau di Git.
   - Aktifkan backup harian / PITR di production.
2. **Resend**: tambahkan domain pengirim, pasang DNS SPF dan DKIM yang diminta Resend sampai status *verified*, lalu buat API key (`RESEND_API_KEY`).
3. **Domain**: arahkan `staging.<domain>` ke layanan staging dan `<domain>` ke production setelah production siap (langkah 5.7).
4. **Rahasia acak** (buat baru untuk setiap lingkungan, jangan dipakai ulang):

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Buat masing-masing untuk `IP_HASH_SECRET`, `NOTIFICATION_PAYLOAD_KEY`, dan `HAMASAH_BOOTSTRAP_KEY`.

---

## 3. Variabel lingkungan

Isi di secret manager platform, bukan di berkas `.env` yang ikut ter-deploy. Aplikasi menolak start di staging/production bila variabel wajib kosong atau salah bentuk (`server/production-config.js`).

### Wajib

| Variabel | Isi | Catatan |
|---|---|---|
| `APP_ENV` | `staging` atau `production` | Menentukan pengaman skrip, HSTS (hanya production), dan `noindex` (selain production). |
| `DATABASE_URL` | Connection string pooler Supabase | Harus `postgresql://`; `pglite:` ditolak di staging/production. |
| `DATABASE_MIGRATION_URL` | Connection string session/direct (5432) | Hanya dipakai `npm run migrate`. |
| `APP_BASE_URL` | `https://staging.<domain>` / `https://<domain>` | Wajib sejak R7.1. Production harus HTTPS. Tanpa garis miring di akhir. |
| `IP_HASH_SECRET` | Rahasia acak ≥ 32 karakter | Untuk hash IP di jejak audit. |
| `STORAGE_BUCKET` | Nama bucket privat | |
| `SUPABASE_URL` | URL project Supabase | Storage driver default di staging/production adalah Supabase; `STORAGE_DRIVER=local` ditolak. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Rahasia server. |
| `EMAIL_DRIVER` | `resend` | `console` ditolak di staging/production; `disabled` membuat semua email tidak terkirim. |
| `RESEND_API_KEY` | API key Resend | Wajib bila `EMAIL_DRIVER=resend`. |
| `EMAIL_FROM` | `Hamasah International <noreply@<domain>>` | Domain harus sudah terverifikasi di Resend. |
| `NOTIFICATION_PAYLOAD_KEY` | Rahasia acak ≥ 32 karakter | Mengenkripsi isi antrean email. Bila kosong memakai `IP_HASH_SECRET`; lebih baik dipisah. **Jangan diganti** selama masih ada email tertunda di antrean. |
| `NOTIFICATION_WORKER_IN_PROCESS` | `true` | Bila memilih pilihan A di bagian 1. |
| `TRUST_PROXY` | `true` | Hanya bila di belakang proxy platform (Railway, Render, Fly.io, Cloud Run). |

### Sementara

| Variabel | Isi | Catatan |
|---|---|---|
| `HAMASAH_BOOTSTRAP_KEY` | Rahasia acak ≥ 32 karakter | Hanya sampai akun admin pertama dibuat (langkah 4.5), lalu **hapus**. |

### Opsional

| Variabel | Bawaan | Catatan |
|---|---|---|
| `PORT` | `4273` | Ikuti port yang diminta platform. |
| `DATABASE_POOL_MAX` | `5` | Jangan melebihi batas koneksi pooler Supabase. |
| `AUDIT_RETENTION_DAYS` | `365` | Sesuaikan dengan keputusan retensi (K14). |
| `NOTIFICATION_WORKER_INTERVAL_MS` | `5000` (dalam proses) / `30000` (worker terpisah) | |
| `VISA_REMINDER_DAYS` | `30` | Jangkauan pengingat visa. |
| `HEALTH_RECORDS_ENABLED` | `false` | **Biarkan `false`** sampai kebijakan privasi memuat data kesehatan. |
| `AI_MAX_REQUESTS_PER_HOUR`, `AI_TIMEOUT_MS` | | Baru relevan bila provider AI disambungkan. |

---

## 4. Rilis staging

### 4.1 Pemeriksaan di laptop (kode yang akan dirilis)

```bash
git checkout main
git pull
npm ci
npm test
npm run test:browser-contract
npm run check:contrast
npm run security:check
npm run check:docker
```

Semua harus lulus. `npm test` jalankan tanpa server pratinjau hidup (bentrok port di `http-performance`). CI GitHub hanya menjalankan `npm test`; empat pemeriksaan lain wajib manual.

### 4.2 Migrasi database staging

Migrasi `001` sampai `040` belum pernah diterapkan ke Supabase. Jalankan dari terminal dengan variabel staging (bukan `.env` production):

```bash
APP_ENV=staging DATABASE_URL="<pooler staging>" DATABASE_MIGRATION_URL="<session staging>" npm run migrate
APP_ENV=staging DATABASE_URL="<pooler staging>" npm run verify:database
```

PowerShell:

```powershell
$env:APP_ENV = 'staging'
$env:DATABASE_URL = '<pooler staging>'
$env:DATABASE_MIGRATION_URL = '<session staging>'
npm run migrate
npm run verify:database
Remove-Item Env:DATABASE_URL, Env:DATABASE_MIGRATION_URL
```

`verify:database` harus menyatakan semua migrasi tercatat dan RLS aktif. Setiap migrasi berjalan dalam satu transaksi; bila satu gagal, perbaiki penyebabnya lalu ulangi perintah yang sama.

Setelah itu buka Supabase → Advisors → Security dan pastikan tidak ada peringatan RLS.

### 4.3 Deploy image

1. Hubungkan platform ke repo `darcia2024/hamasah` cabang `main`, build dari `Dockerfile`.
2. Isi variabel lingkungan staging (bagian 3), termasuk `HAMASAH_BOOTSTRAP_KEY`.
3. Health check platform: `GET /api/health` (hanya memeriksa proses). Jangan pakai `/api/ready` sebagai health check restart, karena gangguan database akan membuat container terus dimatikan.
4. Pastikan hanya satu instance.

### 4.4 Cron pengingat visa

Buat scheduled job dari image yang sama:

- Perintah: `node scripts/visa-reminder-worker.js --once`
- Jadwal: `0 0 * * *` (07.00 WIB)
- Variabel lingkungan: sama dengan web.

### 4.5 Akun admin pertama

```bash
curl -X POST https://staging.<domain>/api/auth/bootstrap \
  -H "Authorization: Bearer <HAMASAH_BOOTSTRAP_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"<nama admin>","email":"<email admin>","password":"<kata sandi kuat>"}'
```

Jawaban `201` berarti admin dibuat. Endpoint ini hanya berlaku sekali. **Hapus `HAMASAH_BOOTSTRAP_KEY` dari environment lalu redeploy.** Akun staf lain dibuat lewat undangan dari portal (email aktivasi dikirim worker).

### 4.6 Smoke test

```bash
SMOKE_BASE_URL=https://staging.<domain> \
SMOKE_ADMIN_EMAIL=<email admin> \
SMOKE_ADMIN_PASSWORD=<kata sandi admin> \
node scripts/smoke.js
```

Skrip ini membuat data uji sungguhan (akun, santri, invoice, pendaftaran, berkas). Setelah selesai, laporkan lalu hapus:

```bash
APP_ENV=staging DATABASE_URL="<pooler staging>" node scripts/cleanup-smoke-data.js
APP_ENV=staging DATABASE_URL="<pooler staging>" CONFIRM_DELETE=I_UNDERSTAND node scripts/cleanup-smoke-data.js
```

### 4.7 Pemeriksaan manual di staging

- [ ] `https://staging.<domain>/api/health` → 200; `/api/ready` → `{"ok":true}`.
- [ ] Beranda, biaya, kontak, artikel, cek status terbuka tanpa galat console.
- [ ] Kirim formulir pendaftaran dari beranda; pendaftaran muncul di konsol pendaftaran; unggah dan buka satu berkas.
- [ ] Email undangan akun sampai ke kotak masuk dan tautan aktivasinya bekerja (bukti worker notifikasi hidup).
- [ ] Minta reset kata sandi; email sampai dalam ± 1 menit.
- [ ] Ubah status pendaftaran uji; email status sampai ke email pendaftar.
- [ ] Terbitkan invoice, tandai lunas, unduh kuitansi PDF dari halaman keuangan dan dari portal wali.
- [ ] Rapor PDF wali terunduh dan berisi data santri uji.
- [ ] `https://staging.<domain>/robots.txt` dan `/sitemap.xml` memakai domain staging. (Staging mengirim `X-Robots-Tag: noindex`, jadi tidak terindeks.)
- [ ] Tempel tautan artikel ke WhatsApp: pratinjau menampilkan judul, deskripsi, dan gambar (tag Open Graph, R7.1).
- [ ] Jalankan cron pengingat visa sekali secara manual dari platform; periksa lognya.
- [ ] Audit per role (R8.7) dengan akun setiap peran.

Bila ada yang gagal: hentikan, simpan log dan revision, perbaiki di kode, ulangi dari 4.1. Rollback aplikasi ke image sebelumnya; skema hanya dipulihkan lewat migrasi kompensasi (runbook).

---

## 5. Rilis production

Lanjutkan hanya bila staging lulus seluruh bagian 4.7 dan pemilik proyek menyetujui.

1. **Backup.** Buat backup database production (walau masih kosong) dan catat ID-nya di tiket rilis.
2. **Migrasi** dengan konfirmasi satu kali di terminal (tidak pernah dibaca dari `.env`):

   ```powershell
   $env:APP_ENV = 'production'
   $env:DATABASE_URL = '<pooler production>'
   $env:DATABASE_MIGRATION_URL = '<session production>'
   $env:ALLOW_PRODUCTION_WRITE = 'I_UNDERSTAND'
   npm run migrate
   Remove-Item Env:ALLOW_PRODUCTION_WRITE
   npm run verify:database
   Remove-Item Env:DATABASE_URL, Env:DATABASE_MIGRATION_URL
   ```

3. **Deploy** image yang sama dengan staging (revision yang sudah lulus), variabel production, satu instance, health check `/api/health`.
4. **Cron** pengingat visa seperti 4.4.
5. **Admin pertama** lewat bootstrap seperti 4.5, lalu hapus `HAMASAH_BOOTSTRAP_KEY` dan redeploy.
6. **Smoke** seperti 4.6 dengan akun uji, lalu bersihkan data uji (production butuh `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND` untuk skrip pembersih).
7. **Domain.** Arahkan DNS domain utama ke production setelah smoke lulus. Production mengirim HSTS; pastikan HTTPS sudah benar sebelum diumumkan.
8. **Search Console.** Daftarkan domain dan kirim `https://<domain>/sitemap.xml`.
9. Pantau `/api/ready`, log galat, dan umur antrean email selama 24 jam pertama.

---

## 6. Menyalakan fitur setelah materi klien masuk

| Materi | Yang diubah | Cara |
|---|---|---|
| Teks kebijakan privasi final | Ganti placeholder di `website/kebijakan-privasi.html`, cabut `<meta name="robots" content="noindex">`, naikkan `PRIVACY_POLICY_VERSION` di `website/registration-domain.js` | Commit, `npm run stamp:assets`, uji, rilis ulang. Sitemap otomatis memuatnya begitu `noindex` dicabut. |
| Kebijakan privasi memuat data kesehatan | `HEALTH_RECORDS_ENABLED=true` | Ubah variabel lingkungan lalu redeploy; tidak perlu rilis kode. |
| Nomor WhatsApp resmi | `WHATSAPP_NUMBER` di `website/kontak.js` | Commit dan rilis ulang; tombol WhatsApp muncul otomatis. |
| Alamat final (K16) | Teks di beranda, biaya, kontak, cek status | Commit dan rilis ulang. |
| Artikel nyata | Terbitkan lewat CMS di konsol pendaftaran | Tanpa rilis kode. |

---

## 7. Rilis berikutnya

1. Kode baru lolos 4.1.
2. Bila ada migrasi baru (nomor berikutnya `041`): staging dulu (4.2), lalu production dengan backup dan konfirmasi (5.1–5.2).
3. Deploy ke staging, periksa, lalu promosikan revision yang sama ke production.
4. Rollback aplikasi = deploy ulang revision sebelumnya. Skema tidak pernah dimundurkan dengan menghapus tabel/kolom manual; gunakan migrasi kompensasi yang ditinjau (runbook).

---

## 8. Daftar periksa ringkas

Staging:

- [ ] Keputusan K2, K4, K5 diambil
- [ ] Supabase staging, bucket privat, Resend domain terverifikasi
- [ ] Variabel lingkungan wajib terisi
- [ ] `npm test`, kontrak browser, kontras, security, `check:docker` lulus
- [ ] `npm run migrate` + `verify:database` staging
- [ ] Deploy satu instance, health check `/api/health`
- [ ] Worker notifikasi (A atau B) dan cron pengingat visa
- [ ] Admin pertama, bootstrap key dihapus
- [ ] Smoke test dan pembersihan data uji
- [ ] Pemeriksaan manual 4.7, termasuk R8.7

Production:

- [ ] Persetujuan pemilik proyek
- [ ] Backup + ID tercatat
- [ ] Migrasi dengan `ALLOW_PRODUCTION_WRITE`, `verify:database`
- [ ] Deploy revision yang sama dengan staging
- [ ] Worker dan cron
- [ ] Admin pertama, bootstrap key dihapus
- [ ] Smoke test dan pembersihan
- [ ] DNS domain utama, HTTPS, Search Console
- [ ] Pemantauan 24 jam

Sebelum dibuka untuk publik (Gerbang 1): kebijakan privasi final, nomor WhatsApp, alamat K16, artikel nyata, R1.0, dan R8.7.

---

## Lampiran: rilis ke Vercel (23 September 2026)

Keputusan K2 jatuh ke Vercel. Vercel tidak menjalankan proses yang menyala terus, jadi tiga
bagian aplikasi diubah lebih dulu. Semuanya sudah ada di repo dan ada tesnya.

### Apa yang berubah karena Vercel

| Bagian | Di server biasa | Di Vercel |
|---|---|---|
| Pembatas percobaan login | memori proses | tabel `rate_limit_hits` (migrasi 041) |
| Pembersih sesi, audit, unggahan | timer di dalam proses | cron harian ke `/api/tasks/maintenance` |
| Titik masuk | `server.js` menyalakan server | `api/index.js` mengekspor satu penangan |
| Unggah berkas | byte lewat server | peramban langsung ke Supabase, server memeriksa hasilnya |
| Email notifikasi | worker di proses atau terpisah | tidak dipakai; pemberitahuan manual lewat WhatsApp |

### Langkah

1. **Terapkan migrasi 041** ke database yang dituju:

   ```bash
   ALLOW_PRODUCTION_WRITE=I_UNDERSTAND npm run migrate
   ```

2. **Hubungkan repo ke Vercel.** Framework preset: Other. Tidak ada build command; `vercel.json`
   sudah mengarahkan seluruh permintaan ke `api/index.js` dan menyertakan berkas yang dibaca
   saat berjalan (`website`, `assets`, `data`, `database`).

3. **Isi environment variable** di Project Settings → Environment Variables:

   | Variabel | Isi | Catatan |
   |---|---|---|
   | `DATABASE_URL` | connection string Supabase | **pakai port 6543** (pooler mode transaksi). Port 5432 membuka satu koneksi per instance dan cepat habis. |
   | `APP_ENV` | `production` | |
   | `APP_BASE_URL` | alamat penuh situs | dipakai tautan aktivasi, sitemap, dan tag bagikan |
   | `IP_HASH_SECRET` | 32 karakter acak | |
   | `CRON_SECRET` | 32 karakter acak | Vercel mengirimkannya sendiri ke cron; endpoint perawatan memeriksanya |
   | `STORAGE_DRIVER` | `supabase` | |
   | `STORAGE_BUCKET` | nama bucket privat | |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | dari dashboard Supabase | dipakai membuat tautan unggah dan unduh |
   | `TRUST_PROXY` | `true` | |

   **Jangan** mengisi `RESEND_API_KEY` selama pemberitahuan masih manual lewat WhatsApp. Tanpa
   kunci itu sistem tidak mengirim dan tidak mengantre apa pun, dan konsol petugas menyatakannya
   apa adanya.

4. **Periksa cron.** `vercel.json` menjadwalkan `/api/tasks/maintenance` sekali sehari pukul 20.00
   UTC (03.00 WIB). Jalankan sekali secara manual dari dashboard, lalu periksa lognya.

5. **Uji unggah berkas sungguhan.** Jalur unggah langsung sudah diuji dengan penyimpanan tiruan
   (`server/direct-upload.test.js`), tetapi belum pernah melawan Supabase sungguhan. Setelah
   deploy, unggah satu berkas besar (5 MB) dari halaman cek status, lalu pastikan statusnya
   menjadi terverifikasi dan berkasnya dapat diunduh petugas.

### Yang tetap tidak ada di Vercel

- **Pengingat visa harian** (`scripts/visa-reminder-worker.js`) butuh pengirim email. Selama
  email belum dipakai, pengingat ini tidak berjalan dan penjagaannya dilakukan manual.
- **Worker notifikasi** juga tidak berjalan, dengan alasan yang sama.

Kalau nanti email diaktifkan, dua pekerjaan itu perlu cron tambahan, dan pada paket Hobby cron
hanya dapat berjalan sekali sehari.
