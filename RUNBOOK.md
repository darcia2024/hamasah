# Runbook operasional

Pegangan yang **berlaku sekarang** untuk menjalankan sistem Hamasah International di production.
Kalau dokumen lain di repo bertentangan dengan dokumen ini, yang benar dokumen ini. Dokumen lama
dicatat di `docs/README.md` sebagai arsip.

Terakhir diperbarui: 24 September 2026.

---

## 1. Bentuk sistem saat ini

| Bagian | Dipakai | Catatan |
|---|---|---|
| Aplikasi | Vercel, satu fungsi `api/index.js` | Semua permintaan diarahkan ke fungsi ini (`vercel.json`). Node 22. |
| Database | Supabase PostgreSQL | Migrasi `database/001` sampai `041` sudah diterapkan ke production (23 September 2026). |
| Berkas pendaftar | Supabase Storage, bucket privat | Peramban mengunggah langsung ke Supabase, server memeriksa hasilnya. |
| Tugas berkala | Cron Vercel harian 20.00 UTC (03.00 WIB) ke `/api/tasks/maintenance` | Membersihkan sesi kedaluwarsa, catatan audit lama, unggahan tertunda, dan baris pembatas laju. |
| Pemantau | GitHub Actions `Uptime`, setiap 30 menit | Lihat bagian 6. |
| Email | **Tidak dipakai** | Pemberitahuan ke pendaftar dikirim manual lewat tombol "Kabari lewat WhatsApp" di konsol petugas. |

Yang **tidak berjalan** di Vercel: worker notifikasi email dan pengingat visa harian. Paspor dan
visa yang akan kedaluwarsa dipantau manual dari konsol Operasional (daftar 30 hari ke depan).

---

## 2. Environment variable

Diatur di Vercel: Project Settings, Environment Variables. **Jangan** simpan nilai rahasia di repo.

| Variabel | Wajib | Isi |
|---|---|---|
| `APP_ENV` | ya | `production` (atau `staging` untuk project staging) |
| `DATABASE_URL` | ya | Connection string Supabase lewat pooler mode transaksi, **port 6543** |
| `APP_BASE_URL` | ya | Alamat penuh situs tanpa `/` di akhir, misalnya `https://app.contoh.com` |
| `IP_HASH_SECRET` | ya | Acak, minimal 32 karakter |
| `CRON_SECRET` | ya | Acak, minimal 32 karakter. Vercel mengirimkannya sendiri ke cron. |
| `STORAGE_DRIVER` | ya | `supabase` |
| `STORAGE_BUCKET` | ya | Nama bucket privat |
| `SUPABASE_URL` | ya | Dari dashboard Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Dari dashboard Supabase. Melewati RLS: hanya di server. |
| `TRUST_PROXY` | ya | `true` |
| `HAMASAH_BOOTSTRAP_KEY` | sementara | Hanya sampai admin pertama dibuat (bagian 5), lalu **hapus**. |
| `HEALTH_RECORDS_ENABLED` | tidak | Biarkan kosong (mati) sampai kebijakan privasi memuat data kesehatan. |
| `DATABASE_POOL_MAX` | tidak | Bawaan 5. |
| `RESEND_API_KEY`, `EMAIL_DRIVER`, `EMAIL_FROM` | **jangan diisi** | Selama pemberitahuan masih manual lewat WhatsApp. |

Kalau ada yang kurang atau salah, setiap permintaan dijawab 503 "Layanan belum siap" dengan kode
`HI-...`, dan log Vercel mencatat `startup_failed` beserta nama variabel yang bermasalah.

Untuk menjalankan migrasi dari laptop dibutuhkan juga `DATABASE_MIGRATION_URL`: koneksi session
(port 5432) atau koneksi langsung, bukan pooler mode transaksi.

---

## 3. Rilis perubahan

1. Pastikan CI (`Test`, Node 22.x dan 24.x) hijau di pull request.
2. **Kalau ada file baru di `database/`**, terapkan migrasi ke production lebih dulu (bagian 4).
   Migrasi di repo ini selalu menambah, jadi aman diterapkan sebelum kode barunya online.
3. Merge ke `main`. Vercel men-deploy otomatis.
4. Periksa: `https://<situs>/api/health` dan `https://<situs>/api/ready` menjawab 200, lalu buka
   beranda dan konsol petugas.

**Membatalkan rilis:** Vercel, tab Deployments, pilih deployment terakhir yang sehat, menu titik
tiga, **Promote to Production** (atau Instant Rollback). Tidak menyentuh database.

---

## 4. Migrasi database

Dari terminal di laptop, setelah backup (bagian 8):

```bash
export APP_ENV=production
export DATABASE_URL="<koneksi session port 5432>"
ALLOW_PRODUCTION_WRITE=I_UNDERSTAND npm run migrate
npm run verify:database
```

`ALLOW_PRODUCTION_WRITE` sengaja tidak pernah dibaca dari file `.env`. Setiap migrasi berjalan
dalam satu transaksi; kalau gagal di tengah, tidak ada yang tercatat dan perintahnya bisa diulang.

---

## 5. Akun admin pertama

Hanya sekali, saat database masih tanpa admin.

1. Isi `HAMASAH_BOOTSTRAP_KEY` (acak, minimal 32 karakter) di Vercel, lalu redeploy.
2. Kirim permintaan:

   ```bash
   curl -X POST https://<situs>/api/auth/bootstrap \
     -H "Authorization: Bearer <HAMASAH_BOOTSTRAP_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"name":"Nama Admin","email":"admin@lembaga","password":"minimal 12 karakter"}'
   ```

3. **Hapus** `HAMASAH_BOOTSTRAP_KEY` dari Vercel dan redeploy.
4. Akun lain dibuat admin dari konsol (Portal, bagian akun).

---

## 6. Pemantauan

### Uptime

Workflow `.github/workflows/uptime.yml` memanggil `/api/health` dan `/api/ready` setiap 30 menit.
Kalau situs mati, workflow gagal (GitHub mengirim email ke pemilik repo) dan membuka satu issue
berlabel `uptime`; saat pulih, issue itu ditutup otomatis.

Menyalakannya sekali saja: GitHub, Settings, Secrets and variables, Actions, tab **Variables**,
buat `UPTIME_URL` berisi alamat situs. Jadwal GitHub hanya berjalan dari branch `main`.

Karena `/api/ready` menyentuh database, pemanggilan ini juga membuat project Supabase paket gratis
tidak dijeda karena dianggap menganggur.

### Cek rutin

| Kapan | Apa |
|---|---|
| Setiap hari kerja | Konsol pendaftaran: pendaftar baru dan berkas yang perlu dibalas lewat WhatsApp. |
| Setiap hari kerja | Konsol Operasional: paspor atau visa yang kedaluwarsa dalam 30 hari. |
| Setiap minggu | Tidak ada issue `uptime` yang terbuka. |
| Setiap minggu | Log Vercel: cari `request_failed` dan `startup_failed`. |
| Setiap minggu | Log Vercel: cron `/api/tasks/maintenance` menjawab 200. |
| Setiap bulan | Backup database dibuat dan disimpan (bagian 8). |

---

## 7. Menelusuri laporan error

Setiap respons membawa header `X-Request-Id`. Kalau terjadi error, pengguna melihat pesan seperti:

> Terjadi kendala pada layanan. Sebutkan kode HI-7K2M9QXA saat melapor ke petugas.

1. Minta kodenya dari pelapor.
2. Vercel, tab Logs, cari kode itu.
3. Barisnya berbentuk JSON satu baris: `event`, `method`, `path` (tanpa query string), `error`,
   `stack`, dan `platformId` (nomor permintaan dari Vercel).

---

## 8. Backup dan restore

**Kondisi sekarang:** database berada di paket gratis Supabase, yang tidak menyediakan backup
harian yang bisa dipulihkan sendiri. Sampai ada keputusan paket berbayar, backup dibuat manual
**minimal sebulan sekali dan sebelum setiap migrasi**. Isinya data pribadi pendaftar: selalu
dienkripsi dan tidak pernah disimpan di repo, email, atau grup WhatsApp.

Membuat backup (butuh `pg_dump` dengan versi mayor sama atau lebih baru dari PostgreSQL Supabase):

```bash
pg_dump "$DATABASE_MIGRATION_URL" --schema=public --format=custom --no-owner --no-privileges \
  --file=hamasah-$(date +%F).dump
gpg --symmetric --cipher-algo AES256 hamasah-$(date +%F).dump
rm hamasah-$(date +%F).dump
```

Simpan berkas `.dump.gpg` di penyimpanan milik lembaga; kata sandi gpg disimpan terpisah.

Memulihkan, **selalu ke database baru dulu**, bukan menimpa production:

```bash
gpg --decrypt hamasah-YYYY-MM-DD.dump.gpg > pulih.dump
pg_restore --no-owner --no-privileges --dbname="<database kosong>" pulih.dump
APP_ENV=staging DATABASE_URL="<database kosong>" npm run verify:database
```

Lalu arahkan project staging ke database itu dan periksa login, daftar pendaftar, dan satu unduhan
berkas. Berkas di Supabase Storage **tidak** ikut dalam dump; unduh isi bucket secara terpisah bila
diperlukan.

---

## 9. Situs mati

| Gejala | Penyebab yang paling mungkin | Langkah |
|---|---|---|
| `/api/health` 503 "Layanan belum siap" | Environment variable kurang atau salah | Cari `startup_failed` di log Vercel, perbaiki variabelnya, redeploy. |
| `/api/health` 200, `/api/ready` 503 | Database tidak terjangkau | Buka dashboard Supabase: project dijeda (klik Restore), kuota habis, atau password berubah. |
| Semua 500 setelah rilis | Kode baru bermasalah | Rollback (bagian 3), lalu telusuri `request_failed` di log. |
| Unggah berkas gagal | Supabase Storage atau bucket | Periksa `STORAGE_BUCKET` dan `SUPABASE_SERVICE_ROLE_KEY`, status Supabase. |
| Tidak bisa login, "terlalu banyak percobaan" | Pembatas laju | Tunggu 15 menit. Hitungannya disimpan di tabel `rate_limit_hits`. |

---

## 10. Rotasi rahasia

Ganti di Vercel, redeploy, lalu cabut yang lama di penyedianya.

| Rahasia | Efek mengganti |
|---|---|
| Password database | Perbarui `DATABASE_URL` di Vercel dan di laptop yang menjalankan migrasi. |
| `SUPABASE_SERVICE_ROLE_KEY` | Tidak ada efek ke pengguna. |
| `CRON_SECRET` | Tidak ada efek ke pengguna. |
| `IP_HASH_SECRET` | Hash IP di catatan audit lama tidak bisa dicocokkan lagi dengan yang baru. Juga dipakai sebagai kunci enkripsi isi notifikasi bila `NOTIFICATION_PAYLOAD_KEY` kosong, jadi antrean notifikasi lama tidak terbaca (tidak berpengaruh selama email tidak dipakai). |

Kalau ada akun yang dicurigai bocor, nonaktifkan dari konsol admin; sesinya ikut tidak berlaku.

---

## 11. Yang masih menunggu keputusan pengurus

Daftar lengkap dan tempat dampaknya di kode: `docs/KEPUTUSAN_PEMILIK_2026-09-23.md`. Enam butir
(A1-A6: kebijakan privasi, nomor WhatsApp resmi, alamat kantor, jatah makan, tulisan asli,
penanggung jawab data) menahan situs dibuka untuk umum.
