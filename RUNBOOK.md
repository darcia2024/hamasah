# Runbook operasional

Pegangan yang **berlaku sekarang** untuk menjalankan sistem Hamasah International di production.
Kalau dokumen lain di repo bertentangan dengan dokumen ini, yang benar dokumen ini. Dokumen lama
dicatat di `docs/README.md` sebagai arsip.

Terakhir diperbarui: 24 September 2026.

---

## 1. Bentuk sistem saat ini

| Bagian | Dipakai | Catatan |
|---|---|---|
| Aplikasi | Vercel, satu fungsi `api/index.js` | Semua permintaan diarahkan ke fungsi ini (`vercel.json`). Node 22. Framework Preset harus **Other**: `vercel.json` memaksanya lewat `"framework": null`. Preset **Node** membuat Vercel menyalakan `server.js` sebagai server utuh dan semua halaman selain `/` menjadi 404 (kejadian 1 Oktober 2026). |
| Database | Supabase PostgreSQL | Migrasi `001` sampai `041` sudah diterapkan ke production (23 September 2026). **`042` (nama penulis artikel) belum.** Aman di-deploy sebelum migrasinya: artikel tetap tampil, hanya isian "Nama penulis" di CMS yang menolak sampai 042 diterapkan (bagian 4). Setelah itu aktif sendiri tanpa deploy ulang. |
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
| `HEALTH_RECORDS_ENABLED` | tidak | Pengurus menyetujui (C6). Isi `true` bersamaan dengan pemasangan kebijakan privasi resmi yang memuat data kesehatan. |
| `DATABASE_POOL_MAX` | tidak | Bawaan 5. |
| `OPENROUTER_API_KEY` | tidak | Kunci OpenRouter untuk asisten landing page. Kosong: asisten memakai jawaban lokal. Disetujui pengurus; kebijakan privasi 2026-10-01 sudah memuatnya. |
| `OPENROUTER_MODEL` | tidak | Bawaan `openai/gpt-5-nano` (ChatGPT termurah per 30 September 2026). |
| `ASSISTANT_DAILY_LIMIT` | tidak | Batas jawaban AI per hari per instans. Bawaan 1000. |
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

## 5a. Data demo

`scripts/demo-data.js` mengisi data contoh yang terasa seperti data sungguhan, supaya pengurus
bisa mencoba aplikasi dari sisi setiap peran: 9 akun (petugas, musyrif, musyrifah, guru,
keuangan, 2 wali, 2 santri), 2 asrama, 12 santri dengan presensi, sholat, hafalan, kesehatan,
dan catatan pembinaan, tagihan dan kuitansi, visa, inventaris, 12 pendaftar di semua tahap,
3 kloter, pesan konsultasi, dan 2 maddah LMS lengkap dengan progres belajar. Akun admin tidak
dibuat dan tidak disentuh.

Semua data fiktif dan bertanda: email `@demo.hamasah.test` (domain `.test` tidak bisa menerima
email) dan nomor WhatsApp `0800-0000-xxxx` (bukan nomor seluler).

**Akun demo adalah akun sungguhan dengan hak sesuai perannya.** Petugas demo melihat semua
pendaftar, keuangan demo melihat semua tagihan. Hapus data demo sebelum aplikasi dipakai untuk
data sungguhan.

### Lewat dashboard (cara utama)

Masuk sebagai admin di `/portal.html`. Kartu **Data demo** ada di kolom kanan dashboard:

- **Isi data demo**: berjalan langkah demi langkah dengan penanda kemajuan. Di akhir, kata sandi
  semua akun demo dan kode akses pendaftar (untuk `/cek-status.html`) tampil **sekali** di
  dialog, lengkap dengan tombol Salin semua. Bila terhenti di tengah, tekan **Lanjutkan
  pengisian**; langkah yang sudah selesai tidak diulang.
- **Kata sandi baru**: membuat kata sandi dan kode akses baru. Sesi akun demo yang lama berakhir.
- **Hapus data demo**: ketik `HAPUS` untuk mengonfirmasi. Kloter, asrama, dan inventaris yang
  sudah dipakai data sungguhan dilewati. Penomoran pendaftaran, invoice, dan kuitansi
  dikembalikan, sehingga data sungguhan pertama tetap mulai dari 00001.

Ketiganya tercatat di jejak audit. Kartu memperingatkan bila database berjarak lebih dari 60 ms
dari server, karena setiap langkah bisa melambat.

### Lewat terminal

Di laptop (hentikan preview dulu):

```bash
npm run demo:isi                                  # kata sandi semua akun: kata-sandi-demo-hamasah
npm run demo:hapus                                # laporan saja
CONFIRM_DELETE=I_UNDERSTAND npm run demo:hapus    # menghapus
```

Ke production, dari folder proyek di PowerShell. `DATABASE_URL` sama dengan yang dipakai Vercel
(Supabase, Connect, Session pooler). Prosesnya 2 sampai 10 menit tergantung jarak ke server
database.

```powershell
$env:APP_ENV="production"; $env:ALLOW_PRODUCTION_WRITE="I_UNDERSTAND"; $env:DATABASE_URL="<connection string>"
node scripts/demo-data.js
```

- Kata sandi akun demo dibuat acak dan **hanya ditampilkan sekali** di terminal, bersama nomor
  pendaftaran dan kode akses pendaftar demo (untuk `/cek-status.html`). Semua akun masuk lewat
  `/portal.html`.
- Lupa kata sandi atau kode akses: jalankan lagi dengan `--sandi-baru`. Sesi lama ikut diakhiri.
- Menghapus: `node scripts/demo-data.js --hapus` menampilkan laporan. Bila sudah benar, ulangi
  dengan `$env:CONFIRM_DELETE="I_UNDERSTAND"`. Kloter, asrama, dan inventaris yang sudah dipakai
  data sungguhan dilewati dan disebut di laporan. Penomoran pendaftaran, invoice, dan kuitansi
  dikembalikan, sehingga data sungguhan pertama tetap mulai dari 00001.
- Bila akun demo sempat mengunggah berkas, penghapusan juga memerlukan `SUPABASE_URL` dan
  `SUPABASE_SERVICE_ROLE_KEY` di terminal yang sama.
- Tutup terminal setelah selesai, karena `DATABASE_URL` berisi kata sandi database.

---

## 5b. Konten website publik

Super admin mengubah isi website dari konsol, menu **Konten Website** (`konten.html`): kontak
(nomor WhatsApp, alamat, media sosial), biaya per program, ringkasan program, testimoni, pertanyaan
umum di beranda, dan pita pengumuman.

- Isi disimpan di tabel `app_settings` dengan kunci `konten.<bagian>`. Tidak ada migrasi khusus,
  tetapi migrasi 043 harus sudah diterapkan (menu **Pengaturan**, Pembaruan database).
- Halaman HTML tetap memuat isi bawaannya. Bagian yang bisa diubah ditandai
  `<!--konten:...--> ... <!--/konten:...-->`, dan server mengganti isinya sebelum halaman dikirim
  (`server/site-content.js`). Bagian yang belum pernah disimpan tampil persis seperti di HTML.
- Saat mengubah teks bawaan di HTML, ubah juga `BAWAAN` di `server/site-content.js`.
  `server/site-content.test.js` gagal bila keduanya berbeda.
- CDN Vercel menyimpan halaman paling lama sekitar 5 menit, jadi perubahan bisa butuh beberapa
  menit sampai tampil di semua pengunjung.
- Foto testimoni hanya bisa dipilih dari berkas di `assets/` (daftar `FOTO_TESTIMONI`), karena CSP
  hanya mengizinkan gambar dari domain sendiri. Foto baru ditambahkan pengembang ke folder dan
  daftar itu.
- Tombol **Kembalikan ke isi bawaan** menghapus isi tersimpan untuk satu bagian.
- **Galeri**: admin mengunggah foto langsung dari tab Galeri. Foto dikecilkan di peramban (sisi
  terpanjang 1600 px, JPEG), disimpan di Supabase Storage dengan tujuan `gallery-photo`, dan
  disajikan dari domain sendiri lewat `/media/galeri/<id>.jpg` karena CSP `img-src` hanya
  mengizinkan `'self'`. Foto bawaan tetap di `assets/galeri/`. Foto yang dihapus dari galeri
  tidak ikut dihapus dari storage.
- Unggahan dari peramban dikirim langsung ke Supabase. Karena itu, bila `STORAGE_DRIVER=supabase`,
  origin `SUPABASE_URL` otomatis masuk `connect-src` CSP (`server/app.js`).

---

## 5c. Template pesan, email, PDF, dan dokumen

Super admin mengubah teks baku dari konsol, menu **Template** (`template.html`):

- **Pesan WhatsApp**: salam, kalimat per status pendaftaran, dan penutup untuk tombol "Kabari
  lewat WhatsApp" petugas. Isian: `{sapaan}`, `{nama}`, `{nomor}`, `{tautan}`.
- **Email notifikasi**: salam, penutup, judul dan kalimat utama tiap jenis email. Rincian (tanggal
  kloter, daftar perubahan, tautan) tetap disusun sistem.
- **Kop & rekening PDF**: nama lembaga, alamat, kontak, rekening resmi, catatan, dan penandatangan
  di kuitansi; catatan di akhir rapor. Rekening juga dicantumkan di email tagihan.
- **Dokumen pendaftar**: nama, keterangan, dan status wajib tiap jenis berkas. Jenis berkas sendiri
  tetap enam; menambah jenis baru butuh perubahan kode dan database.

Disimpan di `app_settings` dengan kunci `template.<bagian>` (`server/templates.js`). Isian yang
tidak dikenal (misalnya `{nma}`) ditolak saat menyimpan. Template baru langsung dipakai untuk
pesan, email, dan PDF berikutnya; email yang sudah terkirim tidak berubah.

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

Daftar lengkap, jawaban pengurus 24 September 2026, dan statusnya:
`docs/KEPUTUSAN_PEMILIK_2026-09-23.md`. Yang masih menahan situs dibuka untuk umum: dokumen
kebijakan privasi resmi (A1), kontak penanggung jawab data (A6), dan artikel asli (A5).
