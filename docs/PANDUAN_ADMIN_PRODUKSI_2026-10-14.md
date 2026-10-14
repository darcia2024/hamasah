# Panduan admin produksi, 14 Oktober 2026

Langkah ini harus dikerjakan admin sendiri, karena butuh login produksi, akses Vercel, dan akun email. Urutannya penting: kerjakan dari atas ke bawah.

## 1. Terapkan pembaruan database (migrasi 043 sampai 049)

Fitur baru belum aktif penuh sebelum migrasi ini diterapkan:

| Migrasi | Isi |
|---|---|
| 043 | Pengaturan aplikasi |
| 044 | Peta perjalanan santri dan prestasi |
| 045 | Kehidupan asrama: izin, pengumuman |
| 046 | Pesan keluarga (wali) |
| 047 | Pembayaran tagihan |
| 048 | Jenis email baru: keputusan izin dan pengumuman untuk wali |
| 049 | Toko kelas daring: harga kelas dan pesanan (halaman Kelas) |

**Cara termudah (dari aplikasi):**

1. Buat backup database dulu di Supabase: Database, lalu Backups.
2. Login sebagai admin di https://hamasah.vercel.app.
3. Buka **Pengaturan**, lalu bagian **Pembaruan database**.
4. Periksa daftar migrasi yang belum diterapkan, lalu tekan **Terapkan**.
5. Muat ulang halaman. Daftar migrasi tertunda harus kosong.

**Cara lain (dari terminal):** isi `DATABASE_URL` produksi di terminal itu saja, lalu jalankan:

```bash
ALLOW_PRODUCTION_WRITE=I_UNDERSTAND APP_ENV=production npm run migrate
```

## 2. Aktifkan pengiriman email

Tanpa langkah ini, undangan akun petugas, tagihan, reset kata sandi, dan email ke wali **tidak terkirim**. Pemberitahuan tetap harus manual lewat WhatsApp.

1. Buat akun di https://resend.com, lalu tambahkan domain pengirim (mis. `hamasahinternational.com`). Pasang catatan DNS yang diminta Resend sampai statusnya *Verified*.
2. Buat API key di Resend.
3. Di Vercel, buka Project, lalu Settings, lalu Environment Variables. Isi untuk *Production*:

   | Nama | Isi |
   |---|---|
   | `EMAIL_DRIVER` | `resend` |
   | `RESEND_API_KEY` | API key dari Resend |
   | `EMAIL_FROM` | mis. `Hamasah International <admin@hamasahinternational.com>` |
   | `APP_BASE_URL` | `https://hamasah.vercel.app` (atau domain resmi) |
   | `NOTIFICATION_PAYLOAD_KEY` | teks acak minimal 32 karakter; jangan diganti setelah dipakai |
   | `CRON_SECRET` | teks acak minimal 32 karakter (bila belum ada) |

4. Redeploy proyek supaya variabel baru terbaca.

### Penting: jadwalkan pengiriman antrean email

Di Vercel tidak ada proses yang menyala terus. Email masuk antrean dulu, lalu dikirim saat rute perawatan `/api/tasks/maintenance` dipanggil. Cron bawaan Vercel (paket Hobby) hanya memanggilnya **sekali sehari** (pukul 03.00 WIB). Akibatnya undangan atau email ke wali bisa telat sampai satu hari.

Supaya email terkirim dalam beberapa menit, buat jadwal di penjadwal luar yang gratis, mis. https://cron-job.org:

- URL: `https://hamasah.vercel.app/api/tasks/maintenance`
- Metode: `POST`
- Header: `Authorization: Bearer <isi CRON_SECRET>`
- Jadwal: tiap 5 menit

Hasil yang benar: status 200 dengan `"ok": true`. Angka `notifikasi` di jawabannya adalah jumlah email yang diproses.

## 3. Akun petugas

- **Admin pertama** (hanya bila belum ada admin sama sekali): isi `HAMASAH_BOOTSTRAP_KEY` di Vercel, redeploy, lalu buat admin lewat `/api/auth/bootstrap`. Hapus variabel itu setelah selesai.
- **Petugas lain**: login admin, buka **Kelola Akun**, lalu **Undang lewat email**. Pilih peran (Super Admin, Petugas Pendaftaran, Musyrif Asrama, Guru / Asatidz, Keuangan). Undangan dikirim ke email petugas, jadi langkah 2 harus sudah aktif. Tautan aktivasi hanya berlaku sementara; bila kedaluwarsa, kirim ulang undangan.
- Jangan membagikan satu akun untuk beberapa orang. Setiap tindakan tercatat di log audit atas nama akun.

## 4. Periksa konten yang tersimpan

Konten yang pernah diubah lewat **Konten Website** menimpa teks bawaan. Setelah pembaruan hari ini, periksa:

- **Nomor WhatsApp**: bila di Konten Website masih tersimpan nomor lama (0878-9759-1978), ganti dengan Admin 1 `6281288489997`. Nomor Admin 2 (0877-5861-9337) tampil di halaman Kontak dan Kebijakan Privasi.
- **Biaya** dan **Testimoni**: bila pernah disunting, pastikan isinya sesuai brosur 2026 dan ketentuan pengembalian dana (DP pemberkasan tidak dikembalikan: Rp 5 juta Ma'had, Rp 4,5 juta Kuliah; kelebihan di atas DP dikembalikan).
- **Template email**: di **Template**, ada dua jenis baru, *Izin santri diputuskan* dan *Pengumuman baru untuk wali*. Teks bawaannya sudah siap dipakai, boleh disesuaikan.

## 5. Menjual kelas daring (halaman Kelas)

Setelah migrasi 049 diterapkan:

1. **Isi rekening tujuan.** Buka **Pengaturan**, isi *Rekening pembayaran kelas daring*, misalnya `BSI 1234567890 a.n. PT Visi Berkah International`. Bila dikosongkan, pembeli diminta menanyakan rekening ke admin lewat WhatsApp.
2. **Terbitkan kelas.** Buka **LMS**, pilih maddah, tekan **Atur penjualan**. Isi harga, lalu pilih *Ya, bisa dibeli umum*. Kelas langsung tampil di `hamasah.vercel.app/website/kelas.html`.
3. **Alur pembeli:** daftar akun dengan email, lalu tekan *Beli kelas*. Sistem menerbitkan tagihan (INV/HI/…). Pembeli transfer, lalu menekan *Konfirmasi lewat WhatsApp*. Pesan berisi nama, kelas, nomor tagihan, dan jumlah otomatis terkirim ke WA Admin 1.
4. **Konfirmasi pembayaran.** Setelah bukti transfer dicek, buka **Keuangan**, cari nomor tagihannya, lalu **Tandai lunas**. Pembeli otomatis terdaftar di kelas itu dan bisa langsung belajar di **Ruang belajar**. Kuitansi terbit seperti tagihan biasa.

Pembeli tercatat sebagai santri dengan program *Hamasah Courses*, jadi muncul juga di daftar santri. Login dengan Google belum tersedia; butuh OAuth Client ID dari Google Cloud Console.

## 6. Cek akhir

- [ ] Pengaturan, bagian Pembaruan database: tidak ada migrasi tertunda.
- [ ] Undang satu akun uji ke email sendiri; email undangan sampai dalam 5 menit.
- [ ] Formulir Kontak: isi pertanyaan uji; WhatsApp Admin 1 terbuka, dan pertanyaannya muncul di kotak masuk konsol petugas.
- [ ] Menu **Visa & Paspor** dan **Inventaris** muncul di sidebar admin dan keuangan.
- [ ] Musyrif memutuskan satu izin uji; wali santri itu menerima email keputusan.
