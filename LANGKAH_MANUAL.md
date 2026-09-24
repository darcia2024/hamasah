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

> **Status per 16 Sep 2026:**
> - **Production**: migrasi 001–007 diterapkan (7 migrasi, 21 tabel, semua ber-RLS). Migrasi 008–011 **belum** diterapkan ke production.
> - **Staging**: migrasi 001–011 sudah diterapkan dan diverifikasi (11 migrasi, 25 tabel aplikasi, semua ber-RLS). Ini mencakup `008_dormitories.sql` (asrama dan penugasan musyrif), `009_audit_events.sql` (catatan audit), `010_session_last_seen.sql` (durasi sesi per role), dan `011_file_objects.sql` (penyimpanan berkas). Semuanya aditif — tidak ada data lama yang berubah.
>
> Langkah-langkah di bagian ini (3) sudah selesai untuk staging. **Smoke test staging di bagian 4 sudah lulus 12/12** lewat `npm run smoke-test`, termasuk unggah-unduh berkas ke Supabase Storage sungguhan — driver storage-nya terbukti benar-benar tersambung, bukan cuma lolos test lawan server tiruan. Lanjut ke migrasi 008–011 ke **production** di bagian 5.
>
> **Sempat gagal, sudah diperbaiki:** `npm run verify:database` awalnya menolak dengan pesan "SUPABASE_URL harus diisi", padahal skrip migrasi tidak ada urusan dengan penyimpanan berkas sama sekali. Itu bug di sisi kode (perbaikan sudah di-commit) — bukan sesuatu yang perlu Anda ubah di konfigurasi.
>
> **Variabel environment yang wajib diisi sebelum `npm start` di staging atau production** (migrasi sendiri tidak butuh ini, tapi menjalankan aplikasinya butuh):
> - `IP_HASH_SECRET`, minimal 32 karakter acak, dipakai mengacak alamat IP di catatan audit. Anda sudah membuat satu nilai di terminal — **simpan nilai itu ke `.env` staging sekarang juga** sebelum hilang, dan buat nilai terpisah untuk `.env` production nanti:
>   ```bash
>   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
>   ```
> - `STORAGE_DRIVER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET`, `STORAGE_PUBLIC_BUCKET` — lihat bagian 9 di bawah. Belum diisi berarti `npm start` (bukan `npm run migrate`) akan berhenti dengan pesan jelas di staging dan production.
>
> **Perhatikan ini soal asrama:** musyrif yang belum ditugaskan ke asrama tidak akan melihat santri mana pun. Begitu ada akun musyrif, admin harus membuat daftar asrama dan menugaskan musyrifnya lewat halaman Monitoring, lalu menempatkan setiap santri ke asramanya.

Migrasi 006 menambah kolom `position` pada `course_materials` dan mengisi urutan materi lama. Migrasi 001 sampai 005 sudah diterapkan ke production pada 16 September 2026. Perintah di bawah ini yang dipakai untuk menerapkan migrasi ke staging (sudah dijalankan untuk migrasi 001–011); simpan untuk referensi migrasi berikutnya.

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

Jalankan aplikasi ke staging (di terminal terpisah, biarkan tetap menyala):

```bash
$env:APP_ENV="staging"; npm start
```

### Cara cepat: skrip otomatis

`scripts/smoke.js` (dipanggil lewat `npm run smoke-test`) menjalankan seluruh daftar periksa di bawah lewat HTTP, termasuk uji unggah/unduh berkas. Skrip ini **tidak pernah dijalankan otomatis oleh Sonnet** — menjalankannya berarti membuat data sungguhan (akun, santri, invoice, pendaftaran, berkas) di lingkungan target, jadi ini murni tugas Anda. Di terminal lain (server staging tetap menyala di terminal pertama):

```bash
$env:SMOKE_BASE_URL="http://127.0.0.1:4273"
$env:SMOKE_ADMIN_EMAIL="admin@hamasah.test"
$env:SMOKE_ADMIN_PASSWORD="<kata sandi admin staging Anda>"
npm run smoke-test
```

Kalau akun admin ini belum pernah dibuat di staging (baru pertama kali), tambahkan satu baris lagi sebelum `npm run smoke-test`, isi dengan nilai `HAMASAH_BOOTSTRAP_KEY` dari `.env` staging:

```bash
$env:SMOKE_BOOTSTRAP_KEY="<HAMASAH_BOOTSTRAP_KEY dari .env staging>"
```

Skrip mencetak ✔/✖ per langkah dan berhenti dengan exit code bukan-nol kalau ada yang gagal — sudah diuji berperilaku benar di kedua arah (lulus semua, dan sengaja digagalkan dengan kata sandi salah) terhadap server dev lokal sebelum diserahkan.

### Atau manual lewat browser

Kalau lebih nyaman mengecek satu-satu sambil melihat tampilannya:

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
- [ ] Mengunggah satu PDF sebagai dokumen pendaftaran, lalu mengunduhnya kembali.

Kalau ada yang gagal (lewat skrip atau manual), hentikan di sini dan jangan lanjut ke production.

---

## 5. Terapkan migrasi ke production

> Migrasi 001–007 sudah diterapkan ke production (terakhir 16 Sep 2026). Migrasi **008–011 belum**. Perintah di bawah ini yang sama dipakai lagi untuk menyusulkan 008–011, setelah smoke test staging di bagian 4 lulus — jangan lewati smoke test, karena 008–011 mengubah otorisasi (asrama), audit, sesi, dan penyimpanan berkas sekaligus.

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

---

## 8. Aktifkan branch protection (setelah push pertama)

Begitu commit terdorong, GitHub akan menjalankan workflow `Test` secara otomatis. Supaya CI benar-benar berguna, hasilnya harus menjadi syarat merge:

1. Buka **Settings > Branches > Add branch protection rule** pada repo.
2. Branch name pattern: `main`.
3. Centang **Require status checks to pass before merging**, lalu pilih check `Node 22.x` dan `Node 24.x` (dulu `Node 20.x`; ganti kalau aturan lama masih memakainya).
4. Centang juga **Require a pull request before merging** kalau nanti ada lebih dari satu orang yang menulis kode.

Badge status di README akan menampilkan hasil run terakhir di `main`. Selama belum pernah ada push, badge itu tampil sebagai "no status" dan itu wajar.

---

## 9. Siapkan penyimpanan berkas (sebelum staging dipakai)

Paspor, ijazah, dan surat kesehatan santri disimpan di object storage, bukan di database dan bukan di disk server.

1. Di project Supabase, buka **Storage** lalu buat dua bucket:
   - `hamasah-private` — **Public bucket: OFF**. Berisi dokumen pribadi.
   - `hamasah-public` — Public bucket: ON. Hanya untuk gambar sampul artikel.
2. Pada masing-masing bucket, atur batas ukuran berkas (20 MB cukup) dan daftar tipe MIME yang diizinkan.
3. Salin **Project URL** dan **service_role key** dari Settings > API.
4. Isi `.env` server dengan:

```bash
STORAGE_DRIVER=supabase
SUPABASE_URL=<project url>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
STORAGE_BUCKET=hamasah-private
STORAGE_PUBLIC_BUCKET=hamasah-public
```

**`service_role key` melewati seluruh aturan Row Level Security.** Kunci ini hanya boleh ada di environment server. Jangan pernah menaruhnya di kode frontend, di repo, atau mengirimkannya lewat chat.

Saat smoke test staging, tambahkan satu langkah: unggah satu PDF sebagai dokumen pendaftaran, lalu unduh kembali. Driver Supabase ditulis tanpa memakai paket resmi dan belum pernah diuji terhadap Supabase sungguhan, jadi inilah pembuktiannya.
