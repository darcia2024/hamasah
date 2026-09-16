# Langkah Manual Setelah Phase 7

Daftar ini berisi semua pekerjaan yang **harus dikerjakan manusia**, bukan Sonnet, karena menyentuh kredensial, remote git, atau database staging dan production. Urutannya sudah disusun: kerjakan dari atas ke bawah.

Perintah ditulis untuk PowerShell di Windows. Variabel lingkungan yang berisi kredensial hanya diset di terminal, **tidak pernah disimpan di file**.

---

## 1. Amankan kredensial dan repo (Task 6.0, masih tertunda)

Ini paling mendesak karena repo bersifat publik.

1. Cabut token GitHub yang pernah bocor di URL remote: buka <https://github.com/settings/tokens>, cari token yang diawali `ghp_`, klik **Delete**.
2. Bersihkan URL remote supaya tidak lagi menyimpan token:

```bash
git remote set-url origin https://github.com/<pemilik>/<nama-repo>.git
```

3. Simpan kredensial lewat Git Credential Manager (akan diminta sekali saat push pertama), atau pakai SSH.
4. Ganti kata sandi database Supabase kalau pernah ikut tertulis di tempat yang bisa dibaca orang lain (Dashboard Supabase > Project Settings > Database > Reset database password), lalu perbarui `.env` lokal.
5. Buat project Supabase kedua sebagai **staging**, terpisah dari production. Catat connection string-nya untuk `.env` staging.

---

## 2. Dorong commit Phase 7 ke remote

Kerjakan setelah langkah 1 selesai, supaya push tidak memakai token lama.

```bash
git push origin main
```

Isi commit tersebut: mode dev PGlite, konversi tiga service menjadi async, store PostgreSQL untuk santri, LMS, dan operasional, migrasi `006_course_material_position.sql`, serta penghapusan seluruh penyimpanan JSON di runtime.

---

## 3. Terapkan migrasi 006 ke staging (Task 7.9)

> Migrasi 006 sudah diterapkan ke production pada 16 Sep 2026 (6 migrasi, 21 tabel, semua ber-RLS).
>
> Migrasi 007 (role `teacher` dan `finance`) juga sudah diterapkan ke production pada 16 Sep 2026. Verifikasi: 7 migrasi, 21 tabel, semua ber-RLS.
>
> **Masih menunggu:** migrasi `008_dormitories.sql` (asrama dan penugasan musyrif), `009_audit_events.sql` (catatan audit), dan `010_session_last_seen.sql` (durasi sesi per role). Ketiganya diterapkan sekaligus dengan perintah yang sama persis seperti bagian 5 di bawah. Semuanya menambah tabel atau kolom baru yang boleh kosong, jadi data yang sudah ada tidak berubah.
>
> **Satu variabel environment baru wajib diisi sebelum deploy berikutnya:** `IP_HASH_SECRET`, minimal 32 karakter acak. Dipakai mengacak alamat IP di catatan audit. Tanpa ini, `npm start` akan berhenti dengan pesan jelas di staging dan production. Buat nilainya dengan perintah di bawah, lalu simpan di `.env` server (bukan di repo):
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
>
> Setelah migrasi 008 diterapkan, **perhatikan ini:** musyrif yang belum ditugaskan ke asrama tidak akan melihat santri mana pun. Jadi begitu ada akun musyrif, admin harus membuat daftar asrama dan menugaskan musyrifnya lewat halaman Monitoring, lalu menempatkan setiap santri ke asramanya.
>
> Bagian di bawah ini berlaku untuk project staging begitu dibuat.

Migrasi 006 menambah kolom `position` pada `course_materials` dan mengisi urutan materi lama. Migrasi 001 sampai 005 sudah diterapkan ke production pada 16 September 2026.

1. Isi `.env` dengan connection string **staging**. Gunakan port sesi `5432` untuk `DATABASE_MIGRATION_URL` (bukan pooler `6543`), karena migrasi memakai advisory lock.
2. Jalankan:

```bash
$env:APP_ENV="staging"; npm run migrate
```

3. Periksa hasilnya:

```bash
$env:APP_ENV="staging"; npm run verify:database
```

`verify:database` gagal kalau ada migrasi tertunda, checksum berubah, tabel hilang, atau ada tabel tanpa Row Level Security.

---

## 4. Smoke test staging

> Jangan menjalankan daftar periksa ini di production. Alurnya membuat santri, invoice, dan pendaftaran contoh; data fiktif tidak boleh masuk ke database yang dipakai keluarga sungguhan. Tunggu project staging dari langkah 1.

Jalankan aplikasi ke staging, lalu periksa alur berikut lewat browser:

```bash
$env:APP_ENV="staging"; npm start
```

Daftar periksa:

- [ ] `GET /api/health` membalas 200, `GET /api/ready` membalas 200 dengan `database: "siap"`.
- [ ] Login admin berhasil.
- [ ] Membuat akun wali dan akun santri berhasil.
- [ ] Membuat santri, lalu menghubungkan akun wali ke santri tersebut.
- [ ] Mencatat presensi dan kegiatan, lalu dashboard santri menampilkannya.
- [ ] Wali A **tidak bisa** membuka dashboard santri milik wali B (403).
- [ ] Membuat maddah, menambah dua materi, dan urutannya sesuai urutan penambahan.
- [ ] Membuat invoice, lalu menandainya lunas. Nomor invoice `INV/HI/2026/00001`, kuitansi `KWT/HI/2026/00001`.
- [ ] Menekan tombol lunas dua kali tidak membuat nomor kuitansi kedua.
- [ ] Mengirim pendaftaran publik dari formulir, lalu mengubah statusnya sebagai petugas.

Kalau ada yang gagal, hentikan di sini dan jangan lanjut ke production.

---

## 5. Terapkan migrasi 006 ke production (selesai 16 Sep 2026)

1. **Backup dulu.** Dashboard Supabase > Database > Backups, atau `supabase db dump` dengan Supabase CLI. Jangan lewati langkah ini.
2. Isi `.env` dengan connection string production.
3. Jalankan dengan konfirmasi yang hanya diset di terminal itu:

```bash
$env:APP_ENV="production"; $env:ALLOW_PRODUCTION_WRITE="I_UNDERSTAND"; npm run migrate
```

4. Periksa:

```bash
$env:APP_ENV="production"; npm run verify:database
```

5. Tutup terminal setelah selesai, supaya `ALLOW_PRODUCTION_WRITE` tidak tertinggal aktif.

---

## 6. Catatan penting tentang data lama

Aplikasi tidak lagi membaca berkas JSON. Kalau di server ada `data/registrations.json`, `data/accounts.json`, `data/students.json`, `data/lms.json`, atau `data/operations.json` yang **berisi data sungguhan**, isinya tidak otomatis pindah ke PostgreSQL. Periksa isinya dulu sebelum menghapus berkas itu; kalau ada data nyata di dalamnya, kabari supaya dibuatkan skrip pemindahan.

Di repo ini berkas tersebut tidak pernah ikut git, jadi kemungkinan besar hanya ada di komputer lokal.

---

## 7. Menjalankan lokal (kapan saja, tanpa menyentuh Supabase)

```bash
npm run dev
```

Perintah ini memakai PostgreSQL in-process di `data/dev-db`, menerapkan seluruh migrasi, lalu mengisi data contoh. Akun contoh: `admin@`, `petugas@`, `musyrif@`, `wali@`, dan `santri@hamasah.test`, semuanya dengan kata sandi `kata-sandi-dev-hamasah` (khusus pengembangan). Untuk mulai dari nol:

```bash
npm run dev:reset
```
