# Rencana Remediasi Phase R1 sampai R8

Dokumen kerja untuk menutup temuan di `docs/AUDIT_LANJUTAN_DAN_RANCANGAN_PERBAIKAN_2026-09-20.md`.

Formatnya sengaja mengikuti `PANDUAN_BUILD.md` supaya bisa dipakai dengan alur kerja dan template prompt yang sama.

## Daftar Isi

- [0. Ringkasan: berapa phase remediasi?](#0-ringkasan-berapa-phase-remediasi)
- [1. Cara Pakai Dokumen Ini](#1-cara-pakai-dokumen-ini)
- [2. Keputusan yang Harus Diambil Manusia](#2-keputusan-yang-harus-diambil-manusia)
- [3. Phase R1: Fondasi Render dan Kanal Masuk](#3-phase-r1-fondasi-render-dan-kanal-masuk)
- [4. Phase R2: Data, Privasi, dan Jejak](#4-phase-r2-data-privasi-dan-jejak)
- [5. Phase R3: UI untuk Backend yang Sudah Ada](#5-phase-r3-ui-untuk-backend-yang-sudah-ada)
- [6. Phase R4: Kebenaran Tampilan dan Identitas](#6-phase-r4-kebenaran-tampilan-dan-identitas)
- [7. Phase R5: Alat Uji yang Jujur](#7-phase-r5-alat-uji-yang-jujur)
- [8. Phase R6: Skalabilitas](#8-phase-r6-skalabilitas)
- [9. Phase R7: Distribusi dan Konten](#9-phase-r7-distribusi-dan-konten)
- [10. Phase R8: Pengerasan dan Keputusan Sisa](#10-phase-r8-pengerasan-dan-keputusan-sisa)
- [11. Gerbang Rilis](#11-gerbang-rilis)
- [12. Pelacak Progres](#12-pelacak-progres)

---

## 0. Ringkasan: berapa phase remediasi?

**8 phase, 50 task.** Hanya Phase R1 yang memblokir rilis.

Penomoran memakai awalan `R` supaya tidak tertukar dengan Phase 6 sampai 16 di `PANDUAN_BUILD.md` dan dengan Tahap 0 sampai 8 di dokumen UI/UX.

| Phase | Nama | Task | Hasil utama | Temuan yang ditutup | Estimasi | Gerbang |
|---|---|---:|---|---|---|---|
| R1 | Fondasi Render dan Kanal Masuk | 8 | Tidak ada style/script inline, portal tidak ganda, kredensial dicabut, kanal kontak hidup | A-01, A-02, C-01, G-05 | 2 sampai 3 hari | **Blokir rilis** |
| R2 | Data, Privasi, dan Jejak | 4 | Berkas server tidak tersaji publik, kebijakan privasi ada, pencatat rekam jejak tercatat | C-02, C-03, D-09 | 1 sampai 2 hari + materi klien | Blokir rilis publik |
| R3 | UI untuk Backend yang Sudah Ada | 7 | Tujuh fitur operasional, pembukaan berkas, alur tugas/kuis, logout semua perangkat | B-01 sampai B-04 | 3 sampai 4 hari | |
| R4 | Kebenaran Tampilan dan Identitas | 8 | Palet merek benar, kontras terukur, status sesi jujur, landing lebih padat | D-01 sampai D-04, D-06 sampai D-08 | 2 sampai 3 hari | |
| R5 | Alat Uji yang Jujur | 4 | Test yang benar-benar menguji yang diklaim | G-01 sampai G-04 | 1 sampai 2 hari | **Prasyarat R6 dan R7** |
| R6 | Skalabilitas | 6 | Query konstan, pagination, cache, index | E-01 sampai E-04, C-04 | 2 sampai 3 hari | |
| R7 | Distribusi dan Konten | 6 | Pratinjau WhatsApp, sitemap valid, artikel dapat ditemukan, byline nyata | F-01 sampai F-03, D-05 | 2 hari + konten klien | |
| R8 | Pengerasan dan Keputusan Sisa | 7 | Prototipe lama, worker visa, notifikasi, scrypt, mata uang | B-05, B-06, C-05, C-06, D-10 | 1 sampai 2 hari | |

**Total: sekitar 14 sampai 21 hari kerja efektif**, di luar waktu tunggu keputusan dan materi dari klien.

**Urutan wajib:**

- **R1 lebih dulu, tanpa kecuali.** Selama CSP memblokir style inline, setiap perbaikan visual diverifikasi di atas fondasi yang salah, dan hasil verifikasinya tidak bisa dipercaya.
- **R5 sebelum R6 dan R7.** Tanpa alat uji yang benar, hasil kedua phase itu tidak dapat dibuktikan.
- R2 boleh jalan paralel dengan R3 karena tidak bersentuhan file.
- R4 setelah R1 selesai, karena banyak style pindahan dari R1 mendarat di file yang sama.

Label prioritas sama seperti `PANDUAN_BUILD.md`:

- **[INTI]** wajib agar fitur yang sudah dijanjikan benar-benar berfungsi.
- **[PENYEMPURNA]** boleh ditunda, tetap dicatat.

---

## 1. Cara Pakai Dokumen Ini

### 1.1 Label

Sama persis dengan `PANDUAN_BUILD.md` Bagian 1.2.

| Label | Arti |
|---|---|
| `[MANUSIA]` | Dikerjakan manusia. Sonnet tidak boleh mengerjakan atau mensimulasikannya. |
| `[KLIEN]` | Butuh data, konten, atau persetujuan dari pihak Hamasah. |
| `[KEPUTUSAN KRn]` | Butuh keputusan nomor KRn di Bagian 2. Jika belum diputuskan, Sonnet berhenti dan bertanya. |
| `[KOMPLEKS]` | Sonnet wajib menulis rencana lalu menunggu persetujuan sebelum mengubah kode. |
| `[INTI]` / `[PENYEMPURNA]` | Prioritas. |

### 1.2 Git

- Satu branch per phase: `remediasi-r1-render`, `remediasi-r2-privasi`, dan seterusnya. Satu PR per phase ke `main`.
- Commit kecil per task. Format: `<type>(<scope>): <ringkasan> [Task R1.3]`.
- Push hanya dilakukan manusia.

### 1.3 Definition of Done

Berlaku untuk semua task di dokumen ini, menambah DoD di `PANDUAN_BUILD.md` Bagian 2.5:

- [ ] Semua kriteria "Selesai jika" di task terpenuhi.
- [ ] `npm test` lulus dan jumlah file test tidak berkurang.
- [ ] **Console browser bersih dari pelanggaran CSP** pada setiap halaman yang disentuh.
- [ ] Halaman yang disentuh diperiksa pada 375 px dan 1280 px, keempat state (kosong, memuat, error, berisi) tampil benar.
- [ ] `git diff` dicek: tidak ada secret, data pribadi asli, atau file tak berhubungan.
- [ ] Task dicentang di Bagian 12 beserta hash commit.

### 1.4 Aturan khusus remediasi

1. **Jangan menambahkan `'unsafe-inline'` ke CSP.** Itu membatalkan pertahanan XSS demi kenyamanan menulis. Setiap task yang tergoda melakukannya harus berhenti dan bertanya.
2. **Jangan menyembunyikan elemen mati, hapus elemennya.** Jika sebuah elemen hanya ada supaya assertion lulus, yang diperbaiki adalah test-nya.
3. **Jangan menampilkan pesan sukses untuk aksi yang tidak terjadi.** Ini akar A-02 dan tidak boleh terulang di fitur mana pun.
4. **Jangan mengubah klaim menjadi lebih kuat dari yang bisa dibuktikan UI.** Berlaku untuk status sesi, status sinkronisasi, dan angka ringkasan.
5. Setiap task yang mengubah CSS bersama wajib memverifikasi ulang seluruh 16 halaman, bukan hanya halaman tempat perubahan ditulis.

### 1.5 Template prompt untuk Sonnet

```text
Kamu mengerjakan proyek Hamasah International.
1. Baca PANDUAN_BUILD.md Bagian 2 (Aturan Kerja) dan Bagian 3 (Konteks Teknis).
2. Baca RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md Bagian 1 dan HANYA Task <RX.Y>.
3. Baca temuan yang dirujuk task itu di AUDIT_LANJUTAN_DAN_RANCANGAN_PERBAIKAN_2026-09-20.md.
4. Baca semua file di daftar "Baca dulu".
5. Tulis rencana singkat (maksimal 10 poin) dan daftar file yang akan diubah.
   Jika task berlabel [KOMPLEKS], berhenti dan tunggu persetujuan saya.
6. Kerjakan sampai tuntas. Jangan tinggalkan TODO atau placeholder tanpa menyebutkannya.
7. Jalankan `npm test` dan semua langkah "Verifikasi" di task.
8. Centang task di Bagian 12, commit sesuai format, lalu laporkan:
   ringkasan, file yang berubah, output test, dan hal yang butuh keputusan saya.
Jangan mengerjakan task lain.
```

---

## 2. Keputusan yang Harus Diambil Manusia

Isi kolom **Status** dengan `Diputuskan: <pilihan> (tanggal)`. Sonnet hanya boleh mengerjakan task yang bergantung pada keputusan berstatus "Diputuskan".

| ID | Keputusan | Pilihan | Rekomendasi | Dibutuhkan sebelum | Status |
|---|---|---|---|---|---|
| KR1 | Kanal masuk publik | (a) `POST /api/inquiries` + tabel + konsol petugas; (b) tautan `wa.me` ke nomor resmi; (c) keduanya | **(c)**, dengan (a) sebagai sumber kebenaran dan (b) sebagai jalan cepat | Task R1.6 | **Diputuskan: (c) keduanya; nomor WhatsApp belum tersedia (20 Sep 2026)** |
| KR2 | Isi kebijakan privasi dan retensi | Data apa, tujuan, retensi, hak subjek data, penanganan calon di bawah umur | Selaras dengan K14 di `PANDUAN_BUILD.md` (anonimkan setelah 12 bulan) | Task R2.3 | Belum |
| KR3 | Alur tugas dan kuis LMS | (a) bangun sekarang; (b) tunda dan sembunyikan tipe materi `tugas`/`kuis` dari form | **(b)** jika Rilis C belum dekat; janji UI harus turun bersamaan | Task R3.6 | Belum |
| KR4 | Pencarian global CRM | (a) implementasi lintas modul; (b) persempit jadi pencarian santri; (c) hapus | **(c)** untuk sekarang, (b) saat ada waktu | Task R4.6 | Belum |
| KR5 | Format isi artikel | (a) Markdown terbatas; (b) editor kaya dengan sanitasi; (c) tetap teks polos | **(a)** Markdown terbatas: heading, daftar, tebal, miring, tautan, kutipan | Task R7.5 | Diputuskan 22 Sep 2026: (a) Markdown terbatas |
| KR6 | Nasib prototipe lama di root | (a) hapus; (b) pertahankan dan ikut diaudit; (c) pindahkan ke repo terpisah | **(a)** jika sudah tidak dipakai review klien | Task R8.1 | Diputuskan 22 Sep 2026: (a) hapus |
| KR7 | Mata uang | (a) tetap rupiah saja; (b) tambah kolom mata uang dan kurs | **(a)** sampai ada transaksi EGP nyata yang harus dicatat | Task R8.5 | Diputuskan 22 Sep 2026: (a) rupiah saja |

Keputusan yang sudah ada di `PANDUAN_BUILD.md` dan dipakai lagi di sini: **K4** (domain dan email pengirim), **K5** (provider email), **K10** (WhatsApp), **K14** (retensi data), **K16** (klaim dan konten publik).

---

## 3. Phase R1: Fondasi Render dan Kanal Masuk

**Tujuan:** tidak ada satu pun style atau script inline di `website/`, portal tidak menampilkan elemen ganda, kredensial pengujian tidak lagi tersaji publik, dan situs publik punya kanal masuk yang benar-benar berfungsi.

**Kenapa ini memblokir rilis:** CSP di `server/http/security-headers.js` memakai `style-src 'self'` dan `script-src 'self'` tanpa `'unsafe-inline'`. Semua 126 atribut `style="..."` dan 1 blok `<script>` inline diblokir browser. Sebagian perbaikan Tahap 6 tidak pernah aktif, portal menampilkan heading ganda, dan formulir kontak mati padahal itu satu-satunya kanal masuk yang tersisa.

**Selesai jika:**
- [ ] Task R1.0 sampai R1.7 dicentang.
- [ ] `grep -c 'style="' website/*.html` mengembalikan 0 untuk semua halaman.
- [ ] Tidak ada `<script>` tanpa atribut `src` di `website/`.
- [ ] Console browser bersih dari pelanggaran CSP pada 16 halaman.
- [ ] Tidak ada email atau kata sandi literal di `website/`.
- [ ] Ada minimal satu kanal kontak yang dapat dipakai dan menghasilkan efek yang dapat diperiksa.

---

### Task R1.0 `[MANUSIA]` `[INTI]` Putar kredensial yang tersaji publik

Menutup C-01 dari sisi yang tidak boleh dikerjakan Sonnet.

Dikerjakan manusia:

1. Periksa apakah akun `tester@hamasah.test` ada di staging atau production. Jika ada, ganti kata sandinya. Nilai lama `TestingHamasah2026!` harus dianggap bocor.
2. Periksa apakah kata sandi itu atau pola `kata-sandi-dev-hamasah` dipakai di tempat lain (akun Supabase, email, hosting). Jika ya, ganti.
3. Periksa riwayat git untuk memutuskan apakah nilai lama pernah ter-push ke remote:
   ```bash
   git log -S "TestingHamasah2026" --oneline --all
   ```
   Jika ada di commit yang sudah ter-push, catat dan putuskan apakah perlu pembersihan riwayat. Jangan menulis ulang riwayat tanpa rencana tertulis.
4. Catat hasilnya di Bagian 12.

**Selesai jika:** kata sandi lama tidak berlaku di environment mana pun, dan status riwayat git sudah diketahui serta dicatat.

**Jangan:** menulis kata sandi baru ke dalam repo, termasuk ke dokumen ini.

---

### Task R1.1 `[INTI]` Cabut blok kredensial pengujian dari portal

**Masalah:** `website/portal.html:63-81` menampilkan blok `Coba Cepat Akun Pengujian` dengan empat tombol, dan `website/portal.js:1641-1671` mengisi field login dengan alamat email serta kata sandi literal. `portal.js` disajikan publik tanpa autentikasi. Tombolnya juga sudah rusak karena `scripts/seed-dev.js` membuat `admin@hamasah.test`, bukan `tester@hamasah.test`.

**Baca dulu:** `website/portal.html:60-84`, `website/portal.js:1638-1675`, `scripts/seed-dev.js:14-26`.

**Langkah:**
1. Hapus seluruh blok `<!-- Quick Demo Switcher Buttons -->` dari `website/portal.html`, termasuk keempat tombol dan pembungkusnya.
2. Hapus deklarasi `btnStudent`, `btnParent`, `btnMusyrif`, `btnAdmin` dan keempat listener-nya dari `website/portal.js`. Biarkan `emailInput` dan `passInput` jika masih dipakai bagian lain; jika tidak, hapus juga.
3. Jangan menggantinya dengan versi yang "hanya muncul saat development". Kredensial tetap berada di berkas yang ter-deploy. Jika pengisian cepat masih dibutuhkan saat mengembangkan, pakai autofill browser atau bookmarklet lokal yang tidak masuk repo.
4. Pastikan `scripts/seed-dev.js` tetap mencetak kredensial contoh ke terminal saat `npm run dev`, karena itu jalur yang benar untuk mengetahui akun uji.

**Verifikasi:**
```bash
grep -rnE "@hamasah\.(test|id|com)" website/ | grep -v "placeholder"
grep -rniE "password|kata-sandi|sandi" website/*.js | grep -vE "type=|autocomplete|minlength|passInput|Input\.value = ''"
```
Keduanya tidak boleh menampilkan kredensial literal.

**Selesai jika:**
- [ ] Tidak ada alamat email akun nyata atau kata sandi literal di seluruh `website/`.
- [ ] Halaman portal tetap bisa login dengan pengisian manual.
- [ ] `npm test` lulus.

**Jangan:** memindahkan kredensial ke file lain di `website/`, atau menyimpannya di `localStorage`.

---

### Task R1.2 `[KOMPLEKS]` `[INTI]` Hapus elemen DOM mati di portal dan perbaiki test-nya

**Masalah:** `website/portal.html:153` berisi komentar `Preserved in DOM for test assertions, hidden visually in CRM`. Empat elemen disembunyikan dengan `style="display: none;"`: `.staff-intro` (heading `Selamat datang.` dan `#portal-role-label`), `#portal-students-header` (heading `Santri yang Dapat Anda Pantau`), `#portal-students-status`, dan `#portal-student-list`. Karena CSP memblokir style inline, keempatnya tampil di browser sehingga portal menampilkan heading ganda dan grid santri versi lama berdampingan dengan dashboard CRM.

Ini dua masalah sekaligus: kerusakan tampilan (A-01) dan pola test yang memberi rasa aman palsu (G-05).

**Baca dulu:** `website/portal.html:150-180`, `website/portal.js` (cari referensi keempat id tersebut), seluruh `*.test.js` yang menyebut id tersebut, `scripts/browser-contract.test.js`.

**Langkah:**
1. Untuk setiap dari keempat elemen, tentukan lebih dulu statusnya:
   - **Masih dipakai kode?** Cari referensinya di `website/portal.js`. Jika dipakai, elemen tetap ada; penyembunyian dipindahkan ke atribut `hidden` atau kelas CSS yang punya nama bermakna, bukan `display:none` inline.
   - **Hanya ada untuk test?** Hapus elemennya, lalu perbaiki assertion yang mengandalkannya supaya memeriksa elemen yang benar-benar dipakai UI.
2. Tulis hasil penentuan itu sebagai tabel di rencana yang diajukan sebelum mengubah kode.
3. Khusus `#portal-student-list`: jika ia masih berfungsi sebagai fallback, jadikan state eksplisit dengan atribut `hidden` yang ditoggle dari JavaScript, dan beri komentar yang menjelaskan kapan fallback itu dipakai.
4. Pastikan setelah perubahan, portal hanya menampilkan satu heading peran dan satu daftar santri.

**Verifikasi:** buka `/website/portal.html`, login sebagai admin, dan periksa di DOM bahwa tidak ada dua elemen dengan teks heading yang sama tampil bersamaan.

**Selesai jika:**
- [ ] Tidak ada elemen di `portal.html` yang keberadaannya hanya dibenarkan oleh test.
- [ ] Tidak ada `style="display: none"` tersisa di `portal.html`.
- [ ] Portal tidak menampilkan heading atau daftar santri ganda.
- [ ] `npm test` lulus dengan assertion yang sudah diperbarui.

**Jangan:** memindahkan `display:none` ke file CSS sebagai jalan pintas untuk elemen yang sebenarnya mati.

---

### Task R1.3 `[KOMPLEKS]` `[INTI]` Pindahkan style inline halaman internal ke CSS

**Masalah:** 122 atribut `style="..."` tersebar di enam halaman internal dan semuanya diblokir CSP. Yang paling berdampak: `display: grid; grid-template-columns: 1fr 1fr` pada form (klaim dua kolom Tahap 6 tidak pernah aktif), `height: 44px` pada CTA (klaim tinggi kontrol minimum tidak terpenuhi), dan `max-width: 1200px; margin: 20px auto 36px` pada header.

Sebaran: `portal.html` 28 (dikurangi yang sudah ditangani R1.2), `monitoring.html` 27, `lms.html` 23, `audit.html` 16, `staff.html` 15, `operations.html` 13.

**Baca dulu:** keenam halaman internal, `website/portal.css`, `website/staff.css`, output `grep -noE 'style="[^"]*"' website/*.html`.

**Langkah:**
1. Kelompokkan 122 atribut itu menjadi pola berulang. Dari pemeriksaan awal setidaknya ada enam pola yang muncul di banyak halaman:
   - header internal `max-width: 1200px; margin: 20px auto 36px`
   - brand row `display: flex; align-items: center; gap: 14px; margin-bottom: 20px`
   - logo `object-fit: contain; flex-shrink: 0; filter: drop-shadow(...)`
   - CTA penuh `width: 100%; justify-content: center; height: 46px`
   - grid form `display: grid; grid-template-columns: 1fr 1fr; gap: 12px|14px|16px|20px`
   - titik status `background: #16A34A` dan `font-size: 15px; color: #16A34A`
2. Buat kelas bernama untuk setiap pola di `website/portal.css` atau `website/staff.css`. Nama mengikuti konvensi yang sudah dipakai di file itu, jangan memperkenalkan sistem penamaan baru.
3. Untuk nilai yang benar-benar unik dan hanya dipakai sekali, tetap buat kelas; jangan menyisakan satu pun atribut inline.
4. Grid form dua kolom wajib punya breakpoint: satu kolom di bawah 800 px, dua kolom di atasnya. Ini yang dimaksud Tahap 6 tetapi tidak pernah aktif.
5. Tinggi kontrol yang semula ditulis 44 px dan 46 px dipertahankan sebagai nilai minimum di kelasnya.
6. Warna `#16A34A` yang ditulis langsung dipindahkan menjadi token sukses, jangan disalin sebagai hex di CSS. Koordinasikan namanya dengan Task R4.1 supaya tidak dibuat dua kali.
7. Kerjakan satu halaman per commit supaya mudah ditinjau dan mudah dibalik.

**Verifikasi per halaman:**
```bash
grep -c 'style="' website/<halaman>.html   # harus 0
```
Lalu buka halaman tersebut di 375 px dan 1280 px, dan periksa console browser tidak memuat pelanggaran CSP.

**Selesai jika:**
- [ ] Keenam halaman internal mengembalikan 0 pada perintah di atas.
- [ ] Grid form dua kolom benar-benar tampil dua kolom di desktop dan satu kolom di 375 px.
- [ ] Tidak ada kontrol yang tingginya turun dibanding sebelum perubahan.
- [ ] Tidak ada pelanggaran CSP di console pada keenam halaman.

**Jangan:** menambahkan `!important` baru. `portal.css` sudah memuat 192 buah; menambah lagi memperparah masalah yang akan ditangani R4.

---

### Task R1.4 `[INTI]` Pindahkan style inline halaman publik ke CSS

**Masalah:** empat atribut inline tersisa di `index.html`, `kontak.html`, `cek-status.html`, dan `404.html`. Yang paling merusak ada di `kontak.html:220` pada `#inquiry-message`: nilai computed yang benar-benar dipakai browser adalah `width: 177px`, `padding: 0px`, `border: 1px solid rgb(118, 118, 118)`, sehingga textarea tampil sebagai kontrol native sempit.

**Baca dulu:** keempat halaman, `website/website.css` bagian field dan form.

**Langkah:**
1. Untuk `#inquiry-message`, jangan membuat kelas baru. Pakai kelas field yang sudah dipakai input lain di halaman yang sama, supaya textarea konsisten dengan sistem form, bukan sekadar pulih.
2. Pindahkan tiga atribut sisanya ke kelas di `website/website.css`.
3. Periksa apakah ada elemen lain di halaman publik yang tampil beda dari rancangan karena hal serupa, lalu catat temuannya jika ada.

**Verifikasi:**
```bash
grep -c 'style="' website/index.html website/kontak.html website/cek-status.html website/404.html
```

**Selesai jika:**
- [ ] Keempat halaman mengembalikan 0.
- [ ] `#inquiry-message` tampil dengan tinggi, border, radius, dan focus ring yang sama dengan field lain di halaman kontak.
- [ ] Tidak ada pelanggaran CSP di console pada keempat halaman.

---

### Task R1.5 `[INTI]` Pindahkan script inline kontak ke berkas terpisah

**Masalah:** handler formulir konsultasi ditulis sebagai `<script>` inline di `website/kontak.html:288-306` dan diblokir CSP. Karena `e.preventDefault()` tidak pernah terpasang dan `<form>` tidak punya `action` maupun `method`, penekanan tombol memicu submit native GET: halaman reload, isian hilang, tanpa pesan apa pun.

Task ini hanya memindahkan script supaya berjalan. Membuat formulirnya benar-benar mengirim ke suatu tempat adalah Task R1.6.

**Baca dulu:** `website/kontak.html:185-310`, `website/public-header.js` sebagai contoh struktur berkas script halaman publik.

**Langkah:**
1. Buat `website/kontak.js` berisi isi blok inline tersebut.
2. Muat dari `kontak.html` dengan `<script src="kontak.js?v=1" defer></script>`, mengikuti pola halaman publik lain.
3. Hapus blok `<script>` inline.
4. **Jangan** mempertahankan pesan sukses palsu. Untuk sementara, sampai R1.6 selesai, ubah pesannya menjadi pernyataan jujur bahwa pengiriman daring belum tersedia, atau nonaktifkan tombol submit dengan penjelasan. Pesan `Pesan siap diproses` untuk aksi yang tidak mengirim apa pun tidak boleh bertahan satu commit pun setelah task ini.

**Selesai jika:**
- [ ] `kontak.html` tidak memuat `<script>` tanpa `src`.
- [ ] Console browser bersih dari pelanggaran CSP pada halaman kontak.
- [ ] Tidak ada pesan sukses untuk aksi yang tidak terjadi.

---

### Task R1.6 `[KEPUTUSAN KR1]` `[KLIEN]` `[INTI]` Hidupkan kanal masuk publik

**Masalah:** Tahap 2 menghapus nomor telepon, alamat, dan jam layanan dari konten publik lalu mengarahkan CTA kontak ke formulir konsultasi. Formulir itu tidak mengirim ke mana pun, dan tidak ada endpoint `POST /api/inquiries` di `server/routes/`. Pemeriksaan `mailto:`, `tel:`, dan `wa.me` di seluruh `website/*.html` mengembalikan nol hasil. Artinya saat ini **tidak ada satu pun kanal masuk yang berfungsi di seluruh situs publik**.

Bergantung pada KR1. Juga bergantung pada K16 (`PANDUAN_BUILD.md`) untuk nomor resmi yang boleh ditampilkan.

**Baca dulu:** `website/kontak.html`, `website/kontak.js` (hasil R1.5), `server/routes/registrations.js` sebagai contoh route publik dengan rate limit, `server/rate-limit.js`, `database/` untuk pola migrasi terbaru.

**Langkah untuk opsi (a) dan (c):**
1. Migrasi baru `032_inquiries.sql`:
   ```sql
   CREATE TABLE inquiries (
     id UUID PRIMARY KEY,
     name TEXT NOT NULL CHECK (char_length(name) >= 2),
     phone_e164 TEXT NOT NULL,
     topic TEXT NOT NULL,
     message TEXT NOT NULL CHECK (char_length(message) >= 10),
     status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
     handled_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
   CREATE INDEX inquiries_status_created_idx ON inquiries (status, created_at DESC);
   ```
2. Store PostgreSQL mengikuti pola `server/postgres-article-store.js`, dengan pagination sejak awal (jangan mengulang E-02).
3. `POST /api/inquiries` tanpa sesi, dengan `rateLimit` per IP. Tambahkan aturan baru di `server/rate-limit.js`, jangan memakai ulang aturan `registration-create`.
4. `GET /api/inquiries` dan `PATCH /api/inquiries/:id/status` dengan permission petugas pendaftaran, plus panel di `website/staff.html`.
5. Validasi nomor telepon memakai helper yang sudah dipakai pendaftaran, supaya formatnya konsisten.
6. UI: state memuat, sukses, dan error yang benar. Tombol dinonaktifkan selama pengiriman supaya tidak terkirim ganda.
7. Catat ke audit log lewat `server/audit-service.js` mengikuti pola aksi yang sudah ada.

**Langkah untuk opsi (b) dan (c):**
1. Tampilkan nomor WhatsApp resmi yang sudah dikonfirmasi klien sebagai tautan `https://wa.me/<nomor>` di halaman kontak dan footer seluruh halaman publik.
2. Tautan harus berfungsi tanpa JavaScript.
3. Jika K16 belum diputuskan, task berhenti di sini dan menunggu. Jangan menampilkan nomor contoh.

**Selesai jika:**
- [ ] Mengirim formulir menghasilkan efek yang dapat diperiksa: baris baru di database, atau perpindahan ke WhatsApp.
- [ ] Kegagalan jaringan menampilkan pesan error, bukan sukses.
- [ ] Ada minimal satu kanal kontak yang dapat dipakai tanpa JavaScript.
- [ ] Endpoint baru punya test otorisasi negatif dan test rate limit.
- [ ] `npm test` lulus.

**Jangan:** menampilkan nomor, alamat, atau jam layanan yang belum dikonfirmasi klien. Itu mengulang masalah yang sudah dibereskan Tahap 2.

---

### Task R1.7 `[INTI]` Gerbang otomatis anti style dan script inline

**Masalah:** tanpa gerbang, 126 atribut inline akan tumbuh lagi. Akar masalahnya bukan style yang terlanjur ditulis, melainkan tidak adanya alat yang menolaknya.

**Baca dulu:** `scripts/security-local-check.js` sebagai pola skrip pemeriksa, `package.json`.

**Langkah:**
1. Buat `scripts/csp-contract.test.js` yang memeriksa seluruh `website/*.html`:
   - tidak ada atribut `style="`
   - tidak ada `<script>` tanpa atribut `src`
   - tidak ada handler atribut inline (`onclick=`, `onsubmit=`, `onload=`, dan sejenisnya)
2. Pesan kegagalan menyebut nama berkas dan nomor baris, supaya langsung bisa diperbaiki.
3. Daftarkan sebagai `"test:csp-contract"` di `package.json`. Karena `npm test` memakai `node --test`, berkas berakhiran `.test.js` otomatis ikut terjalankan.
4. Jalankan dan pastikan lulus setelah R1.2 sampai R1.5 selesai.

**Selesai jika:**
- [ ] `npm run test:csp-contract` lulus untuk 16 halaman.
- [ ] Menambahkan satu `style="color:red"` sementara ke salah satu halaman membuat test gagal dengan pesan yang menyebut berkas dan baris. Hapus lagi setelah diuji.
- [ ] `npm test` ikut menjalankan test ini.

---

## 4. Phase R2: Data, Privasi, dan Jejak

**Tujuan:** berkas server tidak lagi dapat diunduh publik, pengumpulan data pribadi punya dasar yang sah, dan rekam jejak santri mencatat siapa yang menulisnya.

**Selesai jika:**
- [ ] Task R2.1 sampai R2.4 dicentang.
- [ ] Enam URL di tabel C-02 mengembalikan 404.
- [ ] Kebijakan privasi ada, tertaut dari formulir dan footer, dan versinya tersimpan saat persetujuan diberikan.
- [ ] Rekam jejak santri baru menyimpan akun pencatat.

---

### Task R2.1 `[INTI]` Pindahkan berkas server keluar dari `website/`

**Masalah:** `server/http/static.js` mengizinkan awalan `website/` untuk semua jenis berkas di `MIME_TYPES` tanpa daftar-putih nama. Akibatnya berkas berikut dapat diunduh publik: `registration-service.js` (19.129 B, modul sisi server berisi aturan transisi status, penanganan token akses, dan `listForStaff`), `registration-domain.js`, `registration-service.test.js`, `registration-domain.test.js`, `DESIGN_DECISIONS.md`, dan enam berkas `*.metadata.json`.

Dari semuanya, hanya `registration-domain.js` yang benar-benar dimuat browser, yaitu oleh `index.html`.

**Baca dulu:** `server/http/static.js`, `website/index.html` bagian `<script>`, `server/app.js` bagian wiring service, seluruh `require` yang menunjuk ke `website/registration-*`.

**Langkah:**
1. Pindahkan `registration-service.js` ke `server/`. Perbarui setiap `require` yang menunjuknya.
2. Pindahkan `registration-service.test.js` dan `registration-domain.test.js` ke lokasi yang sama dengan test lain, yaitu di samping modul yang diujinya.
3. `registration-domain.js` dipakai browser **dan** server. Tentukan satu lokasi kanonis dan satu jalur muat. Jika modul ini memang harus dibagi dua sisi, dokumentasikan alasannya di komentar berkas; jangan menyalin isinya ke dua tempat.
4. Pindahkan `website/DESIGN_DECISIONS.md` ke `docs/`.
5. Hapus enam berkas `*.metadata.json` jika tidak ada yang membacanya. Verifikasi dulu dengan `grep -rn "metadata.json" --include="*.js" .`
6. Jalankan `npm test` setelah setiap pemindahan, jangan menumpuk semuanya lalu baru menguji.

**Verifikasi:**
```bash
for p in registration-service.js registration-service.test.js registration-domain.test.js DESIGN_DECISIONS.md article.html.metadata.json; do
  printf "%-36s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:4273/website/$p"
done
```
Semua harus 404.

**Selesai jika:**
- [ ] Kelima URL di atas mengembalikan 404.
- [ ] `index.html` tetap berjalan dan formulir pendaftaran tetap memvalidasi seperti sebelumnya.
- [ ] `npm test` lulus dengan jumlah file test yang sama atau lebih.

---

### Task R2.2 `[INTI]` Daftar tolak di penyajian berkas statis

**Masalah:** R2.1 memindahkan berkas yang salah tempat, tetapi tidak mencegah kesalahan berikutnya. Pertahanan berlapis dibutuhkan supaya satu berkas server yang tidak sengaja jatuh ke `website/` tidak langsung menjadi eksposur.

**Baca dulu:** `server/http/static.js`, `server/http/static.test.js`.

**Langkah:**
1. Tambahkan daftar tolak di `serveStaticFile` untuk pola di bawah `website/`: berakhiran `.test.js`, `.md`, `.metadata.json`, dan nama berawalan titik.
2. Permintaan yang cocok mengembalikan 404, bukan 403, supaya tidak mengonfirmasi keberadaan berkas.
3. Tambahkan test di `server/http/static.test.js` untuk setiap pola.
4. Periksa juga apakah ada jenis berkas lain di `MIME_TYPES` yang sebaiknya tidak pernah disajikan dari `website/`.

**Selesai jika:**
- [ ] Permintaan ke `/website/apa-pun.test.js` mengembalikan 404 meski berkasnya ada.
- [ ] Permintaan ke `/website/apa-pun.md` mengembalikan 404.
- [ ] Halaman, CSS, JS, dan gambar yang sah tetap tersaji normal.
- [ ] Test baru ada dan `npm test` lulus.

---

### Task R2.3 `[KEPUTUSAN KR2]` `[KLIEN]` `[INTI]` Kebijakan privasi dan persetujuan yang sah

**Masalah:** migrasi `013_registration_profile_fields.sql` menyimpan `privacy_policy_version TEXT NOT NULL DEFAULT 'v1'`, tetapi dokumen "v1" tidak ada. Tidak ada halaman kebijakan privasi di `website/`, dan tidak ada tautan ke dokumen semacam itu dari formulir pendaftaran.

Dua checkbox yang ada di `index.html:711-723` adalah persetujuan **dihubungi**, bukan persetujuan **pemrosesan data pribadi**:

- `Saya mendapat persetujuan wali untuk mengikuti proses pendaftaran ini.`
- `Saya bersedia dihubungi kembali oleh konsultan Hamasah International terkait tindak lanjut informasi pendaftaran.`

Yang dikumpulkan jauh lebih luas: nama, tanggal lahir, jenis kelamin, email, nomor telepon calon dan wali, asal sekolah, kota, serta unggahan paspor, ijazah, dan surat kesehatan, sebagian dari calon di bawah umur.

Ini butuh materi dan keputusan dari pihak Hamasah, bukan hanya implementasi. Sonnet menyiapkan kerangka dan menunggu isi.

**Baca dulu:** `website/index.html:709-724`, `database/013_registration_profile_fields.sql`, `PANDUAN_BUILD.md` Bagian 5.4 dan keputusan K14.

**Langkah:**
1. `[KLIEN]` Kumpulkan dari pihak Hamasah: data apa yang dikumpulkan dan untuk apa, berapa lama disimpan, siapa yang dapat mengaksesnya, cara subjek data mencabut persetujuan dan meminta penghapusan, penanggung jawab pelindungan data, dan penanganan khusus calon di bawah umur.
2. Buat `website/kebijakan-privasi.html` memakai layout halaman publik yang sudah ada.
3. Tambahkan checkbox terpisah untuk persetujuan pemrosesan data pribadi, dengan tautan ke halaman tersebut. Checkbox ini berbeda dari checkbox bersedia dihubungi, dan wajib dicentang.
4. Persetujuan wali diubah menjadi persetujuan pemrosesan data oleh wali, bukan sekadar "mendapat izin ikut mendaftar".
5. Isi `privacy_policy_version` dengan versi dokumen yang benar-benar berlaku saat persetujuan diberikan, jangan biarkan memakai default.
6. Tautkan kebijakan privasi dari footer seluruh halaman publik.
7. Tambahkan ke `website/sitemap.xml`. Koordinasikan dengan Task R7.2 supaya formatnya sudah benar.

**Selesai jika:**
- [ ] Halaman kebijakan privasi ada dan berisi materi yang disetujui klien, bukan teks contoh.
- [ ] Formulir pendaftaran menolak kirim jika persetujuan pemrosesan data belum dicentang.
- [ ] Versi kebijakan yang tersimpan cocok dengan dokumen yang berlaku pada saat itu.
- [ ] Tertaut dari formulir dan footer.

**Jangan:** menulis isi kebijakan privasi sendiri lalu menyatakannya final. Isi dokumen ini adalah komitmen hukum lembaga.

---

### Task R2.4 `[INTI]` Jejak pelaku pada rekam jejak santri

**Masalah:** `student_activities`, `student_attendance`, `student_achievements`, `student_evaluations`, dan `student_violations` (`database/001_initial_schema.sql:81-125`) tidak menyimpan siapa yang mencatat. Hanya koreksinya yang menyimpan, lewat `student_record_corrections.actor_account_id` di migrasi 024.

Untuk `student_violations`, catatan pelanggaran santri, ketiadaan jejak pembuat adalah masalah tata kelola. Bandingkan dengan `registration_status_events` yang sudah punya `changed_by_account_id` sejak migrasi 005.

**Baca dulu:** `database/001_initial_schema.sql:81-125`, `database/005_actor_accounts.sql` sebagai pola, `server/postgres-student-store.js`, `server/routes/students.js:143-155`.

**Langkah:**
1. Migrasi baru menambahkan `recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL` ke kelima tabel. Nullable, supaya baris lama tetap terbaca. `ON DELETE SET NULL` supaya riwayat bertahan meski akun staf dihapus, mengikuti alasan yang sudah ditulis di migrasi 005.
2. Isi kolom dari sesi yang sedang login, **jangan dari isi request**. Ikuti pola yang sudah dipakai `registration_status_events`.
3. Tampilkan pencatat di UI monitoring pada daftar rekam jejak.
4. Tambahkan test yang memastikan nilai diambil dari sesi dan bukan dari body request yang dipalsukan.

**Selesai jika:**
- [ ] Migrasi berjalan pada database kosong dan pada database yang sudah berisi data.
- [ ] Catatan baru menyimpan akun pencatat; baris lama tetap terbaca dengan nilai kosong.
- [ ] UI monitoring menampilkan pencatat.
- [ ] Test menolak upaya menyetel pencatat lewat body request.
- [ ] `npm run verify:database` lulus.

---

## 5. Phase R3: UI untuk Backend yang Sudah Ada

**Tujuan:** menyelesaikan fitur yang backend-nya sudah jadi, sudah bermigrasi, sudah punya test, tetapi tidak punya satu pun kontrol di UI.

Phase ini tidak menulis fitur baru. Ia menyelesaikan yang sudah dibayar.

**Selesai jika:**
- [ ] Task R3.1 sampai R3.7 dicentang.
- [ ] Setiap endpoint di `server/routes/` punya UI, atau tercatat sengaja tanpa UI beserta alasannya.
- [ ] Setiap aksi yang tidak dapat dibatalkan punya konfirmasi eksplisit dan alasan wajib.

---

### Task R3.1 `[INTI]` Konsol operasional: export laporan dan kuitansi PDF

**Masalah:** `GET /api/operations/report.csv` dan `GET /api/operations/invoices/:id/receipt.pdf` sudah selesai dan tercatat di `docs/OPERASIONAL_DAN_EXPORT_2026-09-20.md` serta `IMPLEMENTATION_STATUS.md`, tetapi tidak pernah dipanggil dari UI mana pun. `website/operations.js` hanya 6,4 KB dan berisi tiga form, satu tombol muat ulang, dan logout.

**Baca dulu:** `server/routes/operations.js:7-30`, `server/pdf.js`, `website/operations.html`, `website/operations.js`.

**Langkah:**
1. Tambahkan tombol unduh laporan CSV di area aksi konsol operasional. Sertakan filter periode jika endpoint mendukungnya; periksa dulu parameter yang diterima route.
2. Tambahkan tombol kuitansi PDF pada setiap invoice berstatus `paid`. Jangan tampilkan tombol itu pada invoice `unpaid` atau `voided`.
3. Unduhan memakai `Authorization` header yang sama dengan permintaan lain. Karena `<a download>` biasa tidak mengirim header, unduh lewat `fetch` lalu buat object URL, dan bebaskan URL-nya setelah selesai.
4. Tampilkan state memuat selama berkas disiapkan, dan pesan error yang jelas jika gagal.
5. Nama berkas unduhan harus bermakna, misalnya memuat nomor kuitansi atau periode laporan.

**Selesai jika:**
- [ ] Laporan CSV dapat diunduh dan isinya cocok dengan data yang tampil di layar.
- [ ] Kuitansi PDF dapat diunduh untuk invoice lunas dan tidak tersedia untuk yang lain.
- [ ] Kegagalan menampilkan error, bukan berkas kosong.
- [ ] Object URL dibebaskan setelah unduhan.

---

### Task R3.2 `[INTI]` Konsol operasional: koreksi dan pembatalan invoice

**Masalah:** `PATCH /api/operations/invoices/:id/correction` dan `PATCH /api/operations/invoices/:id/void` sudah ada, dengan tabel `invoice_corrections` dan kolom `voided_at`, `void_reason` sejak migrasi 022. Tidak ada UI-nya. Bagian keuangan tidak bisa membetulkan invoice yang salah.

**Baca dulu:** `server/routes/operations.js:127-148`, `database/022_operations_controls.sql:1-20`, `website/operations.html`, `website/operations.js`.

**Langkah:**
1. Tambahkan aksi `Koreksi` dan `Batalkan` pada setiap invoice, dengan visibilitas mengikuti permission `finance.manage`.
2. Keduanya wajib meminta alasan. Constraint database menuntut minimal 5 karakter (`CHECK (char_length(reason) >= 5)`); validasi di UI harus mencerminkan itu, jangan menyerahkannya ke error database.
3. Keduanya wajib punya konfirmasi eksplisit yang menyebut nomor invoice dan nominalnya, dan menjelaskan bahwa aksi tercatat di jejak audit.
4. Setelah berhasil, tampilkan riwayat koreksi pada invoice tersebut, supaya jejaknya terlihat, bukan hanya tersimpan.
5. Invoice yang sudah `voided` tidak boleh menampilkan aksi koreksi.

**Selesai jika:**
- [ ] Koreksi dan pembatalan berjalan dan tercatat di `invoice_corrections` serta jejak audit.
- [ ] Alasan kosong atau kurang dari 5 karakter ditolak di UI sebelum permintaan dikirim.
- [ ] Konfirmasi menyebut invoice yang terdampak.
- [ ] Riwayat koreksi terlihat di UI.

---

### Task R3.3 `[INTI]` Konsol operasional: panel visa dan berkas visa

**Masalah:** `GET /api/operations/visa-reminders` dan `POST /api/operations/visa-documents` tidak pernah dipanggil. Tabel `visa_documents` sudah ada sejak migrasi 022 dengan tipe `passport`, `visa`, `residence`, `other` dan kolom `expires_at`. Saat ini peringatan visa tidak terlihat siapa pun.

**Baca dulu:** `server/routes/operations.js:83-92, 159-169`, `database/022_operations_controls.sql:22-40`, `server/operations-service.js`, `website/operations.html` tab visa.

**Langkah:**
1. Panel `Visa mendekati kedaluwarsa` di bagian atas tab visa, memakai `GET /api/operations/visa-reminders`. Tampilkan sisa hari dan santri terkait.
2. Urutkan dari yang paling mendesak. Bedakan secara visual antara yang sudah lewat dan yang akan lewat, tanpa mengandalkan warna saja.
3. Form unggah berkas visa memakai alur unggah yang sudah ada (`POST /api/uploads` lalu `PUT /api/uploads/:id/content`), kemudian `POST /api/operations/visa-documents` dengan `fileObjectId` yang dihasilkan.
4. Tampilkan daftar berkas visa per santri beserta tanggal kedaluwarsa.
5. Empty state yang menjelaskan kapan data akan muncul, mengikuti pola yang sudah dipakai Tahap 6.

**Selesai jika:**
- [ ] Panel peringatan menampilkan data dari endpoint, bukan angka statis.
- [ ] Berkas visa dapat diunggah dan muncul di daftar.
- [ ] Pembedaan sudah lewat dan akan lewat tidak bergantung warna saja.
- [ ] Empty state terbaca saat belum ada data.

---

### Task R3.4 `[PENYEMPURNA]` Konsol operasional: ledger inventaris

**Masalah:** `POST /api/operations/inventory/:id/movements` tidak pernah dipanggil. Tabel `inventory_movements` sudah ada sejak migrasi 022. Inventaris hanya bisa dibuat, tidak bisa dicatat pergerakannya, sehingga jumlahnya tidak pernah berubah setelah dibuat.

**Baca dulu:** `server/routes/operations.js:179-188`, `database/022_operations_controls.sql:42-52`, `website/operations.html` tab inventaris.

**Langkah:**
1. Aksi `Catat pergerakan` pada setiap item inventaris: masuk atau keluar, jumlah, catatan.
2. Tampilkan jumlah saat ini sebagai hasil ledger, bukan sebagai angka yang disimpan terpisah, supaya tidak ada dua sumber kebenaran.
3. Tampilkan riwayat pergerakan per item.
4. Tolak pergerakan keluar yang membuat jumlah menjadi negatif, dengan pesan yang jelas.

**Selesai jika:**
- [ ] Pergerakan tercatat dan jumlah di layar berubah sesuai ledger.
- [ ] Riwayat per item terlihat.
- [ ] Pergerakan yang membuat stok negatif ditolak dengan pesan yang jelas.

---

### Task R3.5 `[INTI]` Pembukaan berkas dari konsol review

**Masalah:** `GET /api/files/:id` tidak pernah dipanggil dari UI. `website/staff.js` dan `website/cek-status.js` mengunggah dokumen dan menampilkan metadata serta catatan review, tetapi tidak ada tautan untuk **melihat** berkasnya.

Artinya petugas pendaftaran menyetujui atau menolak paspor, ijazah, dan surat kesehatan tanpa bisa membukanya dari konsol. Alur review dokumen tidak dapat dijalankan sebagaimana dirancang.

**Baca dulu:** `server/routes/files.js:75-95`, `server/file-service.js`, `server/storage/upload-policies.js`, `website/staff.js:240-260`, `website/cek-status.js` bagian daftar dokumen.

**Langkah:**
1. **Periksa otorisasi endpoint lebih dulu, sebelum memasang UI.** Pastikan `GET /api/files/:id` memvalidasi hak akses **per berkas**, bukan hanya per role. Seorang pendaftar hanya boleh membuka berkas miliknya sendiri. Jika validasinya belum per berkas, perbaiki di task ini dan tambahkan test negatifnya.
2. Tambahkan tautan buka pada setiap dokumen di daftar `staff.html` dan `cek-status.html`.
3. Karena permintaan butuh header otorisasi, unduh lewat `fetch` lalu buka sebagai object URL, dan bebaskan setelah selesai.
4. Untuk PDF dan gambar, pertimbangkan pratinjau di tempat. Untuk tipe lain, cukup unduh.
5. Tambahkan test otorisasi negatif: pendaftar A tidak boleh membuka berkas pendaftar B.

**Selesai jika:**
- [ ] Petugas dapat membuka berkas yang diunggah sebelum menyetujui atau menolaknya.
- [ ] Pendaftar hanya dapat membuka berkas miliknya sendiri.
- [ ] Percobaan akses silang mengembalikan 403 atau 404, dan ada test yang membuktikannya.
- [ ] Object URL dibebaskan setelah dipakai.

**Jangan:** memasang UI sebelum otorisasi per berkas terbukti benar.

---

### Task R3.6 `[KEPUTUSAN KR3]` `[INTI]` LMS: alur tugas dan kuis

**Masalah:** tabel `lms_attempts` (migrasi 025) dan `lms_submissions` (migrasi 026) sudah lengkap dengan constraint dan index. Empat endpoint tersedia dan tidak satu pun dipanggil: `attempts`, `submission`, `submissions/:id/review`, dan `materials/:mid/archive` serta `materials/:mid` untuk sunting.

Sementara itu `website/lms.html:259` menyediakan tipe materi `tugas` dan `kuis` pada form pembuatan materi. Guru bisa membuat tugas yang tidak bisa dikerjakan siapa pun.

Bergantung pada KR3.

**Baca dulu:** `server/routes/lms.js:98-133`, `database/025_lms_assessments.sql`, `database/026_lms_submissions.sql`, `server/lms-service.js`, `website/lms.html:180-215`, `website/lms.js`.

**Langkah untuk opsi (a), bangun sekarang:**
1. Sisi santri di `#panel-course-detail`: form pengumpulan tugas dan form pengerjaan kuis, muncul sesuai tipe materi.
2. Perhatikan constraint `lms_submission_active_unique` yang melarang lebih dari satu submission aktif per santri per materi kecuali berstatus `returned`. UI harus mencerminkan aturan itu, bukan menabraknya lalu menampilkan error database.
3. Sisi guru: daftar submission yang menunggu nilai, dengan aksi nilai dan kembalikan beserta catatan.
4. Sunting dan arsip materi memakai `PATCH` yang sudah ada.
5. Setiap state punya tampilan jelas: belum dikumpulkan, menunggu nilai, dinilai, dikembalikan.

**Langkah untuk opsi (b), tunda:**
1. Sembunyikan tipe `tugas` dan `kuis` dari `#material-type` di `website/lms.html`.
2. Materi lama bertipe itu tetap terbaca, tetapi tidak bisa dibuat yang baru.
3. Catat di `IMPLEMENTATION_STATUS.md` bahwa alurnya ditunda beserta alasannya, supaya tidak terbaca sebagai fitur yang tersedia.

**Selesai jika (a):**
- [ ] Santri dapat mengumpulkan tugas dan mengerjakan kuis.
- [ ] Guru dapat menilai dan mengembalikan.
- [ ] Constraint submission aktif dihormati UI.
- [ ] Keempat state tampil benar.

**Selesai jika (b):**
- [ ] Tipe materi yang tidak dapat dikerjakan tidak lagi bisa dipilih.
- [ ] Dokumen status diperbarui dan tidak mengklaim fitur yang belum ada.

---

### Task R3.7 `[PENYEMPURNA]` Keluar dari semua perangkat

**Masalah:** `POST /api/auth/logout-all` dan `POST /api/applicant/logout` tidak pernah dipanggil. Tidak ada cara mengakhiri sesi di perangkat lain.

**Baca dulu:** `server/routes/auth.js:91-105`, `server/routes/registrations.js:75-84`, `website/portal.js` bagian logout.

**Langkah:**
1. Aksi `Keluar dari semua perangkat` di area profil, dengan konfirmasi yang menjelaskan bahwa sesi di perangkat lain akan berakhir.
2. Setelah berhasil, sesi saat ini juga berakhir dan pengguna kembali ke layar login.
3. Aksi serupa untuk sesi pendaftar di halaman cek status.

**Selesai jika:**
- [ ] Aksi tersedia dan berfungsi.
- [ ] Sesi di perangkat lain benar-benar berakhir, dibuktikan dengan dua sesi di dua browser.
- [ ] Ada konfirmasi sebelum aksi dijalankan.

---

## 6. Phase R4: Kebenaran Tampilan dan Identitas

**Tujuan:** warna sesuai identitas merek, kontras terukur dan memenuhi target, klaim di layar sesuai kenyataan, dan halaman publik tidak terlalu panjang.

**Prasyarat:** Phase R1 selesai. Banyak style yang dipindahkan R1 mendarat di file yang sama dengan yang disentuh phase ini.

**Selesai jika:**
- [ ] Task R4.1 sampai R4.8 dicentang.
- [ ] Token warna memakai emas `#E7B10C` dan charcoal `#363638`.
- [ ] Seluruh pasangan teks/latar diukur skrip: normal minimal 4,5 : 1, besar minimal 3 : 1.
- [ ] Tidak ada klaim status yang tidak berasal dari state nyata.

---

### Task R4.1 `[KOMPLEKS]` `[INTI]` Kembalikan palet ke identitas merek

**Masalah:** `website/website.css:6-57` diberi judul `Gold-Seeded Palette: #E7B10C`, tetapi token yang dipakai bukan itu:

| Token | Nilai sekarang | Warna sebenarnya |
|---|---|---|
| `--md-sys-color-primary` | `#B45309` | Oranye bakar, bukan emas logo |
| `--md-sys-color-inverse-surface` | `#1E293B` | Slate biru, bukan charcoal |
| `--charcoal` | `var(--md-sys-color-inverse-surface)` | Ikut slate biru |
| `--md-sys-color-on-surface` | `#0F172A` | Slate 900 |
| `--md-sys-color-outline` | `#64748B` | Slate 500 |
| `--md-sys-color-tertiary` | `#059669` | Emerald sebagai warna tersier umum |

Seluruh keluarga netral adalah palet Slate biru-abu. Emas logo hanya muncul sebagai `--md-sys-color-inverse-primary: #FBBF24` dan sebagai `rgba(231, 177, 12, …)` pada beberapa border.

**Baca dulu:** `website/website.css:1-120`, `assets/logo-emblem-gold.png`, `assets/logo-hamasah.png`, `DESIGN.md`, `docs/AUDIT_LANJUTAN_DAN_RANCANGAN_PERBAIKAN_2026-09-20.md` bagian D-01.

**Langkah:**
1. **Ambil nilai emas dan charcoal dari berkas logo, jangan menebak.** Buka `assets/logo-emblem-gold.png` dan ukur pikselnya.
2. Tulis rencana berisi tabel token lama ke token baru, lengkap dengan turunan yang perlu ikut berubah, dan ajukan sebelum mengubah kode.
3. Ganti keluarga netral dari Slate ke netral hangat yang berbasis charcoal. Ini menyentuh banyak nilai turunan; kerjakan sebagai satu perubahan token, bukan tambal per komponen.
4. Pindahkan hijau `--md-sys-color-tertiary` menjadi token sukses saja. Merah tetap untuk error. Emas adalah warna utama, bukan warna peringatan.
5. Koordinasikan dengan Task R1.3 yang memindahkan `#16A34A` dari style inline; pastikan hanya ada satu token hijau, bukan dua.
6. **Setelah token berubah, jalankan Task R4.3 dan ukur ulang seluruh pasangan teks/latar.** Mengubah primary tanpa mengukur kontras hanya memindahkan masalah.

**Selesai jika:**
- [ ] `--md-sys-color-primary` memakai emas dari logo.
- [ ] Keluarga netral berbasis charcoal, bukan Slate.
- [ ] Hijau hanya dipakai untuk status sukses.
- [ ] Skrip pengukur kontras (R4.3) lulus untuk 16 halaman.
- [ ] Tidak ada regresi visual pada halaman yang sebelumnya sudah baik.

**Jangan:** mengubah token sambil memperbaiki komponen dalam commit yang sama. Pisahkan supaya mudah dibalik jika hasilnya tidak diinginkan.

---

### Task R4.2 `[INTI]` Batalkan override outline yang merusak kontras

**Masalah:** `website/website.css:2943-2954` menambahkan override menyeluruh:

```css
.image-badge, .pricing-card-badge, .trust-pill-item,
.office-badge, .level-pill, .m3-category-chip, .m3-status-chip {
  background: transparent !important;
  border: 1px solid currentColor !important;
  border-radius: 10px !important;
  box-shadow: none !important;
}
```

`.image-badge` semula punya `background: rgba(30, 27, 22, 0.88)` dengan `backdrop-filter: blur(8px)` dan teks krem `#FEF3C7`. Override menghapus latar gelapnya tetapi mempertahankan teks krem. Hasil pengukuran di viewport 375 px:

| Teks | Rasio terukur | Minimum |
|---|---:|---:|
| `Pendampingan Belajar Talaqqi` | 1,06 : 1 | 4,5 : 1 |
| `Ibadah & Talaqqi` | 1,11 : 1 | 4,5 : 1 |
| `Mengikuti tahapan pendaftaran Al-Azhar` | 1,13 : 1 | 4,5 : 1 |

Ini regresi yang diperkenalkan pass "Outline UI" (`docs/UI_UX_OUTLINE_STYLE_2026-09-20.md`), yang membatalkan perbaikan kontras UI-04 dari audit sebelumnya.

Catatan: untuk dua teks pertama, latar sesungguhnya adalah foto di belakang elemen. Yang pasti benar adalah scrim gelapnya hilang, sehingga keterbacaan bergantung pada terang-gelapnya foto, bukan pada desain.

**Baca dulu:** `website/website.css:810-822, 2943-2960`, `docs/UI_UX_OUTLINE_STYLE_2026-09-20.md`, `website/index.html:199-201, 112-116`.

**Langkah:**
1. Keluarkan `.image-badge` dari daftar selektor override. Badge yang berada di atas foto wajib punya scrim buram; gaya outline tidak cocok untuk latar yang tidak dapat diprediksi.
2. Periksa keenam selektor lain satu per satu. Untuk masing-masing, tentukan apakah latarnya dapat diprediksi. Jika ya dan kontrasnya terukur memadai, gaya outline boleh bertahan. Jika tidak, keluarkan juga.
3. Kurangi pemakaian `!important`. Jika override masih dibutuhkan, naikkan spesifisitas selektornya, jangan menambah `!important`.
4. Perbarui `docs/UI_UX_OUTLINE_STYLE_2026-09-20.md` dengan catatan koreksi, supaya dokumen itu tidak terus dibaca sebagai keputusan yang masih berlaku penuh.

**Selesai jika:**
- [ ] Ketiga teks di tabel mencapai minimal 4,5 : 1.
- [ ] Tidak ada teks krem di atas permukaan terang atau di atas foto tanpa scrim.
- [ ] Jumlah `!important` di `website.css` tidak bertambah.
- [ ] Dokumen pass outline diperbarui.

---

### Task R4.3 `[INTI]` Skrip pengukur kontras otomatis

**Masalah:** D-02 lolos karena pass outline hanya meninjau screenshot tanpa mengukur. Penilaian mata tidak menangkap rasio 1,06 : 1 ketika teks masih terbaca samar di layar developer.

**Baca dulu:** `scripts/browser-contract.test.js`, `scripts/csp-contract.test.js` (hasil R1.7).

**Langkah:**
1. Buat `scripts/contrast-check.js` yang membuka setiap halaman di browser, menelusuri elemen teks, menghitung luminансi relatif teks dan latar buram terdekat, lalu melaporkan pasangan yang di bawah target.
2. Target: teks normal 4,5 : 1; teks besar (24 px, atau 18,66 px bila tebal) 3 : 1.
3. Laporkan teks, warna, ukuran, bobot, rasio, dan target, supaya hasilnya langsung bisa ditindaklanjuti.
4. Untuk elemen yang latarnya foto atau gradien, tandai sebagai `perlu tinjau manual` alih-alih mengklaim angka yang menyesatkan. Skrip tidak boleh berpura-pura tahu warna piksel foto.
5. Daftarkan sebagai `"check:contrast"` di `package.json`.

**Selesai jika:**
- [ ] Skrip berjalan untuk 16 halaman dan melaporkan pelanggaran beserta detailnya.
- [ ] Elemen di atas foto atau gradien ditandai untuk tinjau manual, bukan diberi angka palsu.
- [ ] Menjalankan skrip pada kondisi sebelum R4.2 melaporkan ketiga temuan D-02. Ini bukti skripnya bekerja.

---

### Task R4.4 `[INTI]` Status sesi yang jujur dan penanganan 401 terpusat

**Masalah:** teks `Sesi Terverifikasi Aman` tertulis statis di enam halaman internal (`portal.html:121`, `staff.html:94`, `lms.html:81`, `monitoring.html:81`, `operations.html:81`, `audit.html:81`) dan tidak pernah diperbarui dari state sesi.

Terbukti berbahaya saat sesi kedaluwarsa di tengah pemakaian. Pada pengujian browser, setelah `/api/me` mengembalikan **401**, konsol CRM tetap ter-render penuh: sidebar lengkap, nama `Admin Dev`, badge `SUPER ADMIN`, ringkasan `4 Santri Binaan aktif terdaftar`, dan label `Sesi Terverifikasi Aman`.

Guard saat pemuatan halaman sudah benar dan tidak boleh diubah: memuat ulang dengan token palsu menghasilkan konsol tersembunyi, form login muncul, pesan `Sesi tidak ditemukan.`, dan sessionStorage dibersihkan. Ini bukan bypass autentikasi, API tetap menolak. Yang kurang adalah penanganan 401 setelah konsol terbuka.

**Baca dulu:** enam halaman internal baris yang disebut, `website/portal.js:1550-1560, 1670-1685`, `website/internal-shell.js`, `website/nav.js`.

**Langkah:**
1. Buat satu pembungkus permintaan bersama yang dipakai seluruh halaman internal. Tempat yang paling masuk akal adalah `website/internal-shell.js` karena sudah dimuat keenam halaman.
2. Pembungkus itu menangani 401 secara terpusat: bersihkan sesi, kembalikan ke layar login, dan jelaskan bahwa sesi berakhir. Jangan biarkan tiap modul menanganinya sendiri-sendiri.
3. Ganti `Sesi Terverifikasi Aman` dengan status yang berasal dari state nyata, atau hapus. Jangan menampilkan jaminan keamanan sebagai dekorasi.
4. Pastikan pesan yang muncul membedakan `sesi berakhir` dari `kredensial salah`. Keduanya berbeda arti bagi pengguna.
5. Verifikasi dengan menyetel token palsu ke sessionStorage lalu memicu aksi yang memanggil API, tanpa memuat ulang halaman.

**Selesai jika:**
- [ ] Sesi yang kedaluwarsa di tengah pemakaian mengembalikan pengguna ke layar login dengan pesan yang tepat.
- [ ] Tidak ada teks yang menyatakan sesi aman tanpa dasar state nyata.
- [ ] Guard saat pemuatan halaman tetap bekerja seperti sebelumnya.
- [ ] Keenam halaman internal memakai pembungkus yang sama.

---

### Task R4.5 `[INTI]` Keluarkan data bisnis belum terkonfirmasi dari kode

**Masalah:** `website/portal.js:917` menyusun ringkasan role admin dengan lokasi yang ditulis keras:

```js
`Super Admin · Markaz Utama Hay Asyir & Dokki · ${students.length} Santri Binaan aktif terdaftar.`
```

dan `:919` untuk pengawas: `Asrama Hay Asyir Madinat Nasr · …`.

Ini kelas yang sama dengan alamat dan telepon yang sudah dihapus dari konten publik pada Tahap 2; pass itu tidak menyentuh portal.

**Baca dulu:** `website/portal.js:910-950`, `docs/UI_UX_STAGE2_CONTENT_2026-09-20.md`, `PANDUAN_BUILD.md` keputusan K16.

**Langkah:**
1. Cari seluruh nama lokasi, angka, dan klaim yang ditulis keras di `website/*.js`, bukan hanya dua baris di atas.
2. Untuk masing-masing: ambil dari data jika sumbernya ada, atau hilangkan sampai dikonfirmasi klien.
3. Jangan mengganti dengan nama lokasi contoh lain. Itu memindahkan masalah.

**Verifikasi:**
```bash
grep -rnE "Hay Asyir|Madinat Nasr|Dokki|Markaz" website/*.js website/*.html
```
Setiap hasil harus dapat dipertanggungjawabkan sebagai konten yang sudah dikonfirmasi, atau dihapus.

**Selesai jika:**
- [ ] Tidak ada nama lokasi operasional yang ditulis keras di JavaScript.
- [ ] Ringkasan role tetap bermakna tanpa data yang belum dikonfirmasi.

---

### Task R4.6 `[KEPUTUSAN KR4]` `[PENYEMPURNA]` Pencarian global CRM

**Masalah:** `website/portal.html:135` menyediakan `<input id="crm-global-search" placeholder="Cari santri, berkas, maddah, atau tagihan...">`. Pencarian `crm-global-search` di seluruh `website/*.js` mengembalikan nol hasil. Kontrol ini murni dekoratif dan menjanjikan kemampuan lintas modul yang tidak ada.

Bergantung pada KR4.

**Langkah untuk opsi (c), hapus:**
1. Hapus input dan pembungkusnya dari `portal.html`.
2. Periksa apakah CSS `.crm-search-bar` masih dipakai; hapus jika tidak.

**Langkah untuk opsi (b), persempit:**
1. Ubah placeholder menjadi janji yang sesuai kemampuan, misalnya pencarian santri saja.
2. Sambungkan ke endpoint yang sudah ada.
3. Tampilkan state tidak ada hasil.

**Selesai jika:**
- [ ] Tidak ada kontrol pencarian yang tidak berfungsi.
- [ ] Jika diimplementasikan, placeholder tidak menjanjikan lebih dari yang dilakukan.

---

### Task R4.7 `[PENYEMPURNA]` Padatkan halaman publik di mobile

**Masalah:** tinggi dokumen `index.html` pada viewport 375 × 812 adalah **18.871 px**, sekitar 23 layar. Baseline Tahap 0 mencatat 18.363 px, jadi setelah delapan tahap perbaikan halaman justru bertambah 508 px.

Tidak ada overflow horizontal (`scrollWidth 375 = clientWidth 375`), jadi perbaikan Tahap 5 dan 8 bertahan. Masalahnya kepadatan informasi, bukan layout.

**Baca dulu:** `website/index.html`, `website/website.css` bagian ritme vertikal antarseksi, `docs/UI_UX_BASELINE_2026-09-20.md`.

**Langkah:**
1. Ukur kontribusi tinggi per seksi supaya tahu mana yang paling besar, jangan memangkas berdasarkan perasaan.
2. Cari seksi yang menyampaikan pesan yang sama dua kali dan gabungkan.
3. Rapatkan ritme vertikal antarseksi di mobile. Jangan memperkecil ukuran teks; itu memindahkan masalah ke keterbacaan.
4. Target di bawah 12.000 px di 375 px.
5. Verifikasi bahwa tidak ada overflow horizontal yang muncul kembali pada 360, 390, 768, 1024, dan 1440 px.

**Selesai jika:**
- [ ] Tinggi dokumen mobile di bawah target.
- [ ] Tidak ada ukuran teks yang turun di bawah nilai sebelumnya.
- [ ] Tidak ada overflow horizontal di lima ukuran uji.

---

### Task R4.8 `[PENYEMPURNA]` Seksi kegiatan santri

**Masalah:** `index.html:452-476` berisi empat `.activity-card`. Hanya kartu pertama yang punya gambar (`cairo-skyline.jpg`); tiga sisanya hanya badge ikon dan teks. Tangkapan layar pada `scrollY = 9900` di viewport 375 × 812 menghasilkan layar putih polos. Digabung dengan D-02, seksi ini praktis tidak menyampaikan apa pun di mobile.

**Baca dulu:** `website/index.html:445-480`, `website/website.css:1301-1375`, `assets/`.

**Langkah:**
1. Pilih satu dari dua arah, jangan campur: beri ketiga kartu perlakuan visual yang berfungsi tanpa foto, atau sediakan fotonya.
2. Jika memilih tanpa foto, kartu harus punya latar dan kontras yang terukur, bukan mengandalkan gambar yang tidak ada.
3. Jika memilih dengan foto, `[KLIEN]` mintakan foto kegiatan nyata. Jangan memakai stok yang menggambarkan kegiatan yang tidak pernah terjadi.
4. Verifikasi seksi ini di 375 px setelah R4.2 selesai, karena scrim badge memengaruhi hasilnya.

**Selesai jika:**
- [ ] Seksi terbaca di 375 px tanpa area kosong besar.
- [ ] Kontras seluruh teks di seksi ini lulus `check:contrast`.
- [ ] Tidak ada gambar yang gagal muat.

---

## 7. Phase R5: Alat Uji yang Jujur

**Tujuan:** alat yang dipakai sebagai bukti kelulusan benar-benar menguji hal yang namanya klaim.

**Kenapa phase ini sebelum R6 dan R7:** tanpa alat yang benar, hasil kedua phase itu tidak dapat dibuktikan. Ini juga akar dari banyak temuan audit: masalah lolos bukan karena tidak diperiksa, melainkan karena alat pemeriksanya memeriksa hal lain.

**Selesai jika:**
- [ ] Task R5.1 sampai R5.4 dicentang.
- [ ] Setiap skrip yang namanya menjanjikan sesuatu benar-benar mengujinya.
- [ ] Tidak ada elemen DOM yang dipertahankan hanya demi assertion.

---

### Task R5.1 `[KOMPLEKS]` `[INTI]` Jadikan `test:browser-contract` benar-benar menguji browser

**Masalah:** `scripts/browser-contract.test.js` tidak membuka browser sama sekali. Ia membaca berkas HTML dan menjalankan regex: ada `<meta name="viewport">`, ada `<main>` pada halaman publik, ada `skip-link`. Lalu:

```js
const css = fs.readFileSync(path.join(root, '..', 'styles.css'), 'utf8')
          + fs.readFileSync(path.join(root, '..', 'cinematic.css'), 'utf8');
assert.match(css, /@media\s*\(/i, 'CSS harus memiliki breakpoint responsive.');
```

Ia memeriksa `styles.css` dan `cinematic.css` **di root**, berkas milik prototipe lama. Halaman di `website/` memakai `website.css`, `portal.css`, dan `staff.css`, yang tidak pernah dibaca skrip ini.

Skrip ini dikutip sebagai bukti lulus di Tahap 2, 3, 4, 5, 6, 7, dan 8 dengan kalimat "lulus, 16 halaman". Ia tidak mungkin menangkap A-01, A-02, C-01, D-02, atau D-08.

**Baca dulu:** `scripts/browser-contract.test.js`, `scripts/http-performance.test.js` sebagai contoh skrip yang menjalankan server, `.claude/launch.json`.

**Langkah:**
1. Tulis rencana lebih dulu: bagaimana browser dijalankan di CI dan di mesin lokal, dan berapa lama test akan makan waktu. Ajukan sebelum mengubah kode.
2. Skrip baru menjalankan server, membuka setiap halaman, dan memeriksa minimal:
   - tidak ada pelanggaran CSP di console
   - tidak ada error JavaScript di console
   - tidak ada `scrollWidth > clientWidth` pada 360, 390, 768, 1024, dan 1440 px
   - tidak ada gambar yang gagal muat
   - setiap kontrol interaktif punya nama aksesibel
3. Perbaiki pembacaan CSS yang salah sasaran: baca `website/website.css`, `website/portal.css`, `website/staff.css`, bukan berkas prototipe.
4. Pertahankan pemeriksaan statis yang sudah ada (viewport, landmark, skip link); tambahkan, jangan ganti.
5. Jika menjalankan browser di CI terlalu berat, pisahkan menjadi dua skrip: kontrak statis yang selalu jalan, dan kontrak browser yang jalan sebelum rilis. Yang penting, **jangan mengutip kontrak statis sebagai bukti hal yang hanya bisa dibuktikan browser**.

**Selesai jika:**
- [ ] Skrip membuka 16 halaman di browser dan melaporkan pelanggaran CSP jika ada.
- [ ] Skrip membaca CSS yang benar-benar dipakai halaman.
- [ ] Menambahkan satu `style="color:red"` sementara membuat test gagal. Hapus setelah diuji.
- [ ] Dokumen yang mengutip skrip ini diperbarui supaya klaimnya sesuai dengan yang benar-benar diuji.

---

### Task R5.2 `[INTI]` Jadikan `test:uat-roles` menguji matriks izin

**Masalah:** `scripts/uat-roles.test.js` diklaim di Tahap 8 sebagai "Automated synthetic role UAT lulus untuk admin, petugas pendaftaran, guru, pengawas, finance, wali, dan santri". Isinya sebenarnya:

```js
const roles = ['admin', 'registration-officer', 'teacher', 'supervisor', 'finance', 'parent', 'student'];
assert.deepEqual(roles.sort(), ['admin', 'finance', 'parent', ...].sort());
```

Baris itu membandingkan array dengan dirinya sendiri, selalu lulus, tidak menguji apa pun. Sisanya menjalankan dua service dengan actor `admin`, `finance`, dan `student` saja. Role `teacher`, `supervisor`, `parent`, dan `registration-officer` tidak pernah dipakai sebagai actor. Batas izin antar-role tidak diuji.

**Baca dulu:** `scripts/uat-roles.test.js`, `server/access-matrix.test.js`, `server/access-policy.js`, `server/app.test.js` sebagai contoh test lewat HTTP.

**Langkah:**
1. Hapus assertion tautologis.
2. Untuk setiap dari tujuh role, uji **lewat lapisan HTTP** dengan sesi role tersebut: minimal satu aksi yang seharusnya diizinkan dan satu yang seharusnya ditolak.
3. `server/access-matrix.test.js` sudah menguji kebijakan di level fungsi. Yang kurang adalah pembuktian bahwa route benar-benar menerapkannya. Pakai itu sebagai sumber daftar aksi, jangan menulis daftar kedua yang bisa menyimpang.
4. Sertakan pengujian batas data, bukan hanya batas role: wali A tidak boleh melihat santri wali B, pengawas hanya melihat santri di asrama yang ditugaskan (K7 sudah diputuskan).
5. Nama skrip diubah jika perlu supaya tidak menjanjikan UAT. Ini test otorisasi, bukan UAT.

**Selesai jika:**
- [ ] Tujuh role diuji lewat HTTP dengan sesi masing-masing.
- [ ] Setiap role punya minimal satu kasus izin dan satu kasus tolak.
- [ ] Batas data antar-pengguna diuji, bukan hanya batas role.
- [ ] Tidak ada assertion yang membandingkan nilai dengan dirinya sendiri.
- [ ] Dokumen yang mengutip skrip ini diperbarui.

---

### Task R5.3 `[INTI]` Perluas `security:check`

**Masalah:** `scripts/security-local-check.js` memeriksa tiga hal: `package-lock.json` ada dan punya `packages`, tidak ada `console.log` yang mencetak password/secret/token di `server/*.js`, dan `security-headers.js` menyebut `X-Content-Type-Options`.

Ia hanya memindai `server/`, jadi kredensial di `website/portal.js` (C-01) tidak akan pernah terdeteksi. Tidak ada `npm audit`, tidak ada pemindaian berkas yang tersaji publik.

**Baca dulu:** `scripts/security-local-check.js`, `server/http/static.js`.

**Langkah:**
1. Tambahkan pemindaian `website/` untuk pola alamat email akun dan kata sandi literal. Kecualikan `placeholder` dan contoh yang jelas-jelas bukan kredensial.
2. Tambahkan pemeriksaan bahwa tidak ada berkas berakhiran `.test.js`, `.md`, atau modul yang me-`require` modul server di bawah `website/`.
3. Tambahkan `npm audit --omit=dev` sebagai gerbang, dengan ambang keparahan yang disepakati.
4. Pertahankan ketiga pemeriksaan yang sudah ada.
5. Pesan kegagalan menyebut berkas dan baris.

**Selesai jika:**
- [ ] Menjalankan skrip pada kondisi sebelum R1.1 melaporkan kredensial di `portal.js`. Ini bukti skripnya bekerja.
- [ ] Menjalankan pada kondisi sebelum R2.1 melaporkan berkas server di `website/`.
- [ ] `npm audit` ikut dijalankan dan hasilnya memblokir bila melewati ambang.

---

### Task R5.4 `[PENYEMPURNA]` Ukuran performa yang relevan

**Masalah:** `scripts/performance-smoke.test.js` menjalankan 500 pemanggilan fallback AI dan 100 pembuatan invoice di dalam proses dengan store memori: tidak ada HTTP, tidak ada database, tidak ada halaman. `scripts/http-performance.test.js` memanggil `/api/health` 30 kali, dan endpoint itu sengaja tidak menyentuh database, jadi ia mengukur throughput HTTP kosong.

Tidak ada satu pun yang akan mendeteksi E-01 (1.001 query) atau E-03 (266 KB tanpa kompresi).

**Baca dulu:** kedua skrip, `server/test-support/database.js`.

**Langkah:**
1. Ukur jumlah query dan waktu `GET /api/registrations` pada dataset berisi minimal 200 pendaftar, memakai harness PGlite yang sudah ada.
2. Ukur total ukuran transfer halaman portal, termasuk CSS dan JS.
3. Tetapkan ambang yang masuk akal dan buat test gagal jika terlampaui.
4. Jalankan sebelum R6 untuk merekam angka awal, lalu sesudahnya untuk membuktikan perbaikan.

**Selesai jika:**
- [ ] Angka sebelum dan sesudah R6 tercatat di dokumen.
- [ ] Test gagal jika jumlah query tumbuh mengikuti jumlah pendaftar.
- [ ] Test gagal jika ukuran transfer halaman portal melewati ambang.

---

## 8. Phase R6: Skalabilitas

**Tujuan:** beban permintaan tidak tumbuh mengikuti jumlah data, aset tidak diunduh ulang setiap navigasi, dan jalur query yang sering dipakai punya index.

**Prasyarat:** Phase R5 selesai, supaya perbaikannya dapat dibuktikan.

**Selesai jika:**
- [ ] Task R6.1 sampai R6.6 dicentang.
- [ ] Jumlah query untuk satu halaman daftar tidak bergantung pada jumlah baris.
- [ ] Aset statis mengirim `Cache-Control`, `ETag`, dan terkompresi.

---

### Task R6.1 `[KOMPLEKS]` `[INTI]` Daftar pendaftaran: satu query berpaginasi

**Masalah:** `server/postgres-registration-store.js:183-186`:

```js
async list() {
  const { rows } = await database.query('SELECT registration_id FROM registrations ORDER BY updated_at DESC');
  return Promise.all(rows.map((row) => get(row.registration_id)));
}
```

`get()` menjalankan **lima query** per pendaftar: data utama, dokumen, riwayat status, catatan, dan tindak lanjut.

`website/registration-service.js:213-231` (`listForStaff`) memanggil `store.list()` tanpa argumen, lalu mengurutkan, memfilter pencarian dan status, dan memotong halaman, semuanya di JavaScript.

Jadi setiap pembukaan konsol petugas menjalankan `1 + (N × 5)` query dan memuat seluruh pendaftar beserta dokumen dan riwayatnya ke memori, meski UI hanya menampilkan 20 baris. Pada 200 pendaftar itu sekitar **1.001 query per permintaan**. Pencarian dan filter yang dikirim UI tidak pernah sampai ke SQL.

Masalah tambahan: `listForStaff` mengembalikan **tipe berbeda** tergantung argumen, array bila `options` kosong dan objek bila tidak (`:230`). Ini rawan salah pakai.

**Baca dulu:** `server/postgres-registration-store.js:150-200`, `website/registration-service.js:200-235` (atau lokasi barunya setelah R2.1), `server/routes/registrations.js:117-125`, `website/staff.js:365-385`, `server/postgres-audit-store.js:51-80` sebagai pola pagination yang sudah benar.

**Langkah:**
1. Tulis rencana lebih dulu, termasuk bentuk query baru dan daftar pemanggil yang terdampak. Ajukan sebelum mengubah kode.
2. Ganti `store.list()` dengan `store.list({ search, status, page, pageSize })` yang menjalankan satu query dengan `WHERE`, `ORDER BY`, `LIMIT`, `OFFSET`, ditambah satu query `COUNT`.
3. Daftar tidak perlu memuat dokumen, catatan, dan tindak lanjut. Itu hanya diperlukan saat satu pendaftar dibuka. Kirim ringkasan yang cukup untuk kartu daftar.
4. Jika kartu daftar memang butuh jumlah dokumen, ambil dengan agregasi dalam query yang sama, bukan dengan query terpisah per baris.
5. Rapikan tipe kembalian `listForStaff` menjadi satu bentuk konsisten. Perbarui seluruh pemanggil.
6. Batasi `pageSize` seperti yang sudah dilakukan `postgres-audit-store.js`.
7. Tambahkan test yang membuktikan jumlah query tidak tumbuh mengikuti jumlah pendaftar.

**Selesai jika:**
- [ ] Jumlah query untuk satu halaman daftar konstan, tidak bergantung jumlah pendaftar.
- [ ] Pencarian dan filter status berjalan di SQL.
- [ ] Ukuran respons tidak tumbuh mengikuti total pendaftar.
- [ ] `listForStaff` mengembalikan satu bentuk untuk semua pemanggilan.
- [ ] Test jumlah query ada dan lulus.

---

### Task R6.2 `[INTI]` Pagination untuk daftar lain

**Masalah:** hanya tiga store yang punya `LIMIT`/`OFFSET`: `postgres-audit-store.js`, `postgres-notification-store.js`, dan `listImportBatches` di `postgres-operations-store.js`. Tanpa pagination: artikel, akun, santri, invoice, visa, inventaris, maddah, dan materi.

`GET /api/articles` juga mengembalikan **`body` lengkap setiap artikel** pada respons katalog, padahal katalog hanya perlu judul dan ringkasan.

**Baca dulu:** `server/postgres-article-store.js:25-45`, `server/postgres-account-store.js`, `server/postgres-student-store.js`, `server/postgres-operations-store.js`, `server/postgres-lms-store.js`, `server/postgres-audit-store.js:51-80` sebagai pola.

**Langkah:**
1. Terapkan pola pagination yang sama dengan `postgres-audit-store.js` ke setiap store yang belum punya. Jangan membuat bentuk respons baru; ikuti `{ items, total, limit, offset }` yang sudah dipakai.
2. Keluarkan `body` dari respons katalog artikel. Detail artikel tetap mengembalikannya.
3. Perbarui UI yang terdampak supaya menampilkan kontrol halaman. Beberapa sudah punya, seperti daftar pendaftar.
4. Kerjakan satu store per commit.

**Selesai jika:**
- [ ] Setiap endpoint daftar menerima `limit` dan `offset` atau `page` dan `pageSize`, dengan batas atas.
- [ ] `GET /api/articles` tidak lagi mengirim `body`.
- [ ] UI yang menampilkan daftar panjang punya kontrol halaman.
- [ ] Test pagination ada untuk setiap store baru.

---

### Task R6.3 `[INTI]` Cache dan kompresi aset statis

**Masalah:** pemeriksaan header respons untuk `/website/portal.css` menunjukkan status 200, ukuran 82.201 B, tanpa `cache-control`, tanpa `etag`, tanpa `content-encoding`. `server/http/static.js` hanya menulis `Content-Type` dan `X-Content-Type-Options`.

Setiap halaman internal memuat tiga stylesheet dan dua sampai tiga script:

| Berkas | Ukuran |
|---|---:|
| `website.css` | 90.340 B |
| `portal.css` | 82.201 B |
| `staff.css` | 17.453 B |
| `portal.js` | 76.213 B |
| **Total** | **sekitar 266 KB tanpa kompresi, tiap navigasi** |

Memperparah: `index.html` memuat `website.css?v=21` sedangkan halaman internal memuat `website.css?v=18`. Berkas yang sama diunduh dua kali sebagai dua URL berbeda.

**Baca dulu:** `server/http/static.js`, `server/http/static.test.js`, seluruh `<link>` dan `<script>` di `website/*.html`.

**Langkah:**
1. Tambahkan `ETag` berbasis mtime dan ukuran, serta tangani `If-None-Match` dengan 304.
2. Tambahkan `Cache-Control`. Berkas ber-query versi boleh cache panjang; HTML harus selalu divalidasi ulang.
3. Tambahkan gzip atau brotli sesuai `Accept-Encoding`. Jangan mengompresi yang sudah terkompresi seperti PNG dan JPEG.
4. Satukan skema versioning aset. Satu sumber versi untuk seluruh halaman supaya `website.css` tidak pernah diminta sebagai dua URL.
5. Tambahkan test untuk 304, untuk kehadiran header, dan untuk perilaku tanpa `Accept-Encoding`.

**Selesai jika:**
- [ ] `/website/portal.css` mengirim `Cache-Control`, `ETag`, dan terkompresi.
- [ ] Permintaan kedua dengan `If-None-Match` mengembalikan 304.
- [ ] Seluruh halaman memuat `website.css` dengan versi yang sama.
- [ ] Test baru ada dan `npm test` lulus.

---

### Task R6.4 `[PENYEMPURNA]` Pecah bundle internal

**Masalah:** `portal.css` 82 KB dan `portal.js` 76 KB dimuat penuh oleh setiap halaman internal, termasuk halaman yang hanya memakai sebagian kecilnya.

**Baca dulu:** `website/portal.css`, `website/portal.js`, keenam halaman internal.

**Langkah:**
1. Ukur dulu bagian mana yang benar-benar dipakai tiap halaman. Jangan memecah berdasarkan tebakan.
2. Pisahkan bagian bersama dari bagian khusus halaman.
3. Jangan memperkenalkan bundler baru. Proyek ini sengaja tanpa build step; pemecahan dilakukan sebagai berkas terpisah.
4. Verifikasi tidak ada gaya yang hilang di keenam halaman setelah pemecahan.

**Selesai jika:**
- [ ] Setiap halaman internal memuat lebih sedikit byte dibanding sebelumnya.
- [ ] Tidak ada regresi visual di keenam halaman.
- [ ] Tidak ada build step baru.

---

### Task R6.5 `[INTI]` Index database untuk jalur query yang sering dipakai

**Masalah:**

| Tabel | Kekurangan | Query yang terdampak |
|---|---|---|
| `student_parent_accounts` | PK `(student_id, parent_account_id)`, tidak ada index pada `parent_account_id` | Wali membuka portal |
| `course_enrollments` | PK `(student_id, course_id)`, tidak ada index pada `course_id` | Daftar santri per maddah |
| `student_achievements` | Tidak ada index `student_id` | Dashboard santri |
| `student_evaluations` | Tidak ada index `student_id` | Dashboard santri |
| `student_violations` | Tidak ada index `student_id` | Dashboard santri |

`student_activities` dan `student_attendance` sudah punya index sejak `001_initial_schema.sql:195-196`; tiga tabel rekam jejak lain terlewat.

**Baca dulu:** `database/001_initial_schema.sql:75-162`, `server/postgres-student-store.js`, `server/postgres-lms-store.js`.

**Langkah:**
1. Migrasi baru menambahkan kelima index. Sertakan kolom pengurutan seperti pola yang sudah ada, misalnya `(student_id, occurred_at DESC)`.
2. Periksa dulu query sebenarnya di store, jangan menebak kolom pengurutannya.
3. Jalankan `npm run verify:database` setelah migrasi.
4. Catat di `IMPLEMENTATION_STATUS.md` bahwa migrasi ini perlu diterapkan ke staging lalu production.

**Selesai jika:**
- [ ] Migrasi berjalan pada database kosong dan berisi.
- [ ] `npm run verify:database` lulus.
- [ ] Kolom pengurutan index cocok dengan `ORDER BY` di store.

---

### Task R6.6 `[PENYEMPURNA]` Rate limit dan kuota bersama

**Masalah:** `server/rate-limit.js:38` memakai `const buckets = new Map()` di memori proses. Batas login lima percobaan per 15 menit berlaku per instance; dua instance berarti sepuluh percobaan, dan setiap deploy mengembalikan hitungan ke nol. `server/ai-service.js` memakai pola sama untuk kuota AI per akun.

Selain itu, `POST /api/auth/invitations/accept` dan `POST /api/auth/password-reset` tidak punya `rateLimit` sama sekali (`server/routes/auth.js:146, 162`). Dampaknya terbatas karena token memakai 32 byte acak, jadi tebakan tidak realistis, tetapi endpoint ini tetap dapat dipakai menghabiskan sumber daya karena setiap permintaan memicu verifikasi scrypt.

**Baca dulu:** `server/rate-limit.js`, `server/ai-service.js:30-50`, `server/routes/auth.js:140-175`, keputusan K2 di `PANDUAN_BUILD.md`.

**Langkah:**
1. Tambahkan `rateLimit` pada kedua endpoint auth yang belum punya. Ini bagian yang tidak bergantung keputusan hosting dan bisa dikerjakan sekarang.
2. Untuk state bersama: keputusannya bergantung K2. Jika deployment akan memakai satu instance, catat batasannya di dokumen dan hentikan di sini. Jika lebih dari satu, pindahkan state ke penyimpanan bersama.
3. Jangan memindahkan ke penyimpanan bersama sebelum K2 diputuskan; itu menambah dependensi yang mungkin tidak dibutuhkan.

**Selesai jika:**
- [ ] Kedua endpoint auth punya rate limit dan test-nya.
- [ ] Batasan state per-proses tercatat di dokumen, atau state sudah dipindahkan sesuai K2.

---

## 9. Phase R7: Distribusi dan Konten

**Tujuan:** tautan yang dibagikan menampilkan pratinjau, artikel dapat ditemukan mesin pencari, dan CMS punya kemampuan editorial yang layak.

**Prasyarat:** Phase R5 selesai.

**Selesai jika:**
- [ ] Task R7.1 sampai R7.6 dicentang.
- [ ] Tautan yang dibagikan ke WhatsApp menampilkan judul, deskripsi, dan gambar.
- [ ] `sitemap.xml` memakai URL absolut dan memuat artikel terbit.

---

### Task R7.1 `[INTI]` Open Graph dan Twitter Card

**Masalah:** pemeriksaan `property="og:` dan `name="twitter:` pada seluruh 16 halaman mengembalikan **nol**. Untuk lembaga yang distribusinya bertumpu pada WhatsApp dan media sosial, setiap tautan yang dibagikan muncul tanpa judul, deskripsi, atau gambar.

`website/article.html` bahkan punya tombol `#btn-share-wa`, jadi berbagi ke WhatsApp memang alur yang dirancang, dan hasilnya pratinjau kosong.

**Baca dulu:** seluruh `<head>` halaman publik, `assets/`, `server/production-config.js` untuk `appBaseUrl`.

**Langkah:**
1. Tambahkan `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `og:locale`, dan padanan Twitter pada halaman publik.
2. Siapkan gambar bagikan default berukuran 1200 × 630 di `assets/`.
3. `og:url` dan `og:image` harus absolut. Ambil host dari konfigurasi, jangan tulis keras.
4. Untuk `article.html`, nilai harus mencerminkan artikel yang dibuka, yang berarti tidak bisa statis. Ini ditangani Task R7.3.
5. Halaman internal tidak perlu tag ini.

**Selesai jika:**
- [ ] Halaman publik punya tag lengkap dengan URL absolut.
- [ ] Gambar bagikan default ada dan ukurannya benar.
- [ ] Menempel tautan ke WhatsApp menampilkan pratinjau lengkap.

---

### Task R7.2 `[INTI]` Sitemap dan robots yang benar

**Masalah:** `website/sitemap.xml` memakai URL relatif:

```xml
<url><loc>/website/</loc></url>
```

Protokol Sitemap mewajibkan URL absolut lengkap dengan skema dan host. Google akan menolak berkas ini. Isinya juga hanya lima halaman statis, tanpa satu pun URL artikel, tanpa `lastmod`, dan tanpa mekanisme menambahkan artikel baru saat diterbitkan lewat CMS.

`website/robots.txt` memakai `Sitemap: /sitemap.xml` yang juga relatif, dan melarang `staff`, `portal`, `monitoring`, `audit`, tetapi **tidak** melarang `lms.html` dan `operations.html`.

**Baca dulu:** `website/sitemap.xml`, `website/robots.txt`, `server/routes/articles.js`, `server/production-config.js`.

**Langkah:**
1. Ubah sitemap menjadi dihasilkan server, bukan berkas statis, supaya artikel terbit ikut masuk. Sajikan di `/sitemap.xml`.
2. URL absolut memakai host dari konfigurasi.
3. Sertakan `lastmod` dari `updated_at` artikel.
4. Tambahkan `lms.html` dan `operations.html` ke `Disallow`. Pertimbangkan melarang seluruh halaman internal dengan pola, bukan satu per satu, supaya halaman internal baru otomatis terlindungi.
5. Tambahkan `kebijakan-privasi.html` dari Task R2.3.
6. Periksa bahwa `robots.txt` dan `sitemap.xml` dapat diakses di akar domain, bukan hanya di bawah `/website/`.

**Selesai jika:**
- [ ] Sitemap memakai URL absolut dan lolos validator.
- [ ] Artikel terbit muncul di sitemap; artikel draft dan arsip tidak.
- [ ] Seluruh halaman internal tercakup `Disallow`.
- [ ] Keduanya dapat diakses di akar domain.

---

### Task R7.3 `[KOMPLEKS]` `[INTI]` Artikel dapat ditemukan dan dibagikan

**Masalah:** `website/article.js` mengambil artikel lewat `fetch` lalu menyuntik HTML. Crawler yang tidak menjalankan JavaScript hanya melihat kerangka kosong. Judul dokumen baru diubah setelah data tiba (`article.js:24`). Digabung dengan F-01, artikel CMS praktis tidak dapat ditemukan dan tidak dapat dibagikan.

**Baca dulu:** `website/article.js`, `website/article.html`, `server/http/static.js`, `server/routes/articles.js`.

**Langkah:**
1. Tulis rencana lebih dulu. Proyek ini sengaja tanpa build step dan tanpa framework; pilih pendekatan yang tidak melanggar itu. Ajukan sebelum mengubah kode.
2. Pendekatan yang disarankan: server menangani `/artikel/<slug>` dan menyajikan HTML dengan `<title>`, `<meta name="description">`, dan tag Open Graph yang sudah terisi dari database, plus isi artikel dalam bentuk dasar. Render kaya di klien tetap boleh di atasnya.
3. Jaga agar URL lama `article.html?slug=...` tetap bekerja atau dialihkan, supaya tautan yang sudah beredar tidak putus.
4. Lolos escaping HTML untuk seluruh nilai yang berasal dari database. `article.js` sudah punya `escapeHtml`; sisi server butuh yang setara.
5. Perbarui sitemap (R7.2) supaya memakai URL kanonis yang sama.

**Selesai jika:**
- [ ] Mengambil halaman artikel tanpa menjalankan JavaScript menghasilkan judul, deskripsi, dan isi.
- [ ] Tag Open Graph mencerminkan artikel yang dibuka.
- [ ] URL lama tetap bekerja atau dialihkan.
- [ ] Tidak ada celah injeksi HTML dari isi artikel.
- [ ] Tidak ada build step baru.

---

### Task R7.4 `[INTI]` Byline penulis yang sebenarnya

**Masalah:** kolom `articles.author_account_id` ada di skema sejak `001_initial_schema.sql:60`, tetapi `server/postgres-article-store.js:29, 37` tidak pernah men-`SELECT` kolom itu. API tidak pernah mengembalikan penulis, sehingga `website/article.js:47` menuliskan byline tetap `Tim Redaksi Hamasah International` dan lokasi tetap `Kairo, Mesir` untuk semua artikel. Kolomnya mati.

`article.js:22` juga memakai fallback tanggal literal `'September 2026'` ketika `publishedAt` kosong, menampilkan tanggal karangan sebagai fakta.

**Baca dulu:** `server/postgres-article-store.js:20-50`, `website/article.js:17-55`, `website/staff.js` bagian form artikel.

**Langkah:**
1. Sertakan `author_account_id` pada `SELECT`, dan gabungkan dengan `accounts` untuk mendapatkan nama penulis.
2. Isi kolom itu saat artikel dibuat, dari sesi yang sedang login.
3. Tampilkan nama penulis sebenarnya di byline. Jika artikel lama tidak punya penulis, tampilkan `Tim Redaksi Hamasah International` sebagai fallback yang jujur untuk data lama, bukan untuk semua artikel.
4. Hapus lokasi `Kairo, Mesir` yang ditulis keras, atau ambil dari data jika memang ada sumbernya.
5. Ganti fallback tanggal `'September 2026'` dengan penanganan tanggal kosong yang jujur. Artikel draft memang belum punya tanggal terbit; katakan begitu.

**Selesai jika:**
- [ ] Byline menampilkan penulis sebenarnya untuk artikel baru.
- [ ] Artikel lama tanpa penulis menampilkan fallback yang jelas sebagai fallback.
- [ ] Tidak ada tanggal karangan yang ditampilkan sebagai fakta.

---

### Task R7.5 `[KEPUTUSAN KR5]` `[INTI]` Format isi artikel

**Masalah:** `website/article.js:31-34` me-render isi dengan memecah pada baris kosong lalu membungkus tiap bagian dalam `<p>`. Tidak ada heading, daftar, penekanan, tautan, atau gambar dalam isi. Editor tidak punya format apa pun. Untuk seksi editorial yang dipromosikan di landing page, ini membuat tulisan yang layak tidak mungkin dimuat.

Bergantung pada KR5.

**Baca dulu:** `website/article.js:28-40`, `website/staff.html:236-262`, `server/postgres-article-store.js`.

**Langkah untuk opsi (a), Markdown terbatas:**
1. Dukung subset: heading level 2 dan 3, daftar berurutan dan tidak berurutan, tebal, miring, tautan, dan kutipan. Jangan dukung HTML mentah.
2. Render di sisi yang sama dengan R7.3, supaya hasil crawler dan hasil klien sama.
3. **Sanitasi keluaran.** Ini isi yang ditulis manusia lalu ditampilkan ke publik; perlakukan sebagai tidak tepercaya.
4. Tambahkan bantuan format ringkas di form CMS, dan pratinjau yang memakai renderer yang sama dengan halaman publik, bukan renderer kedua yang bisa menyimpang.

**Selesai jika:**
- [ ] Subset format yang disepakati berfungsi di editor, pratinjau, dan halaman publik.
- [ ] HTML mentah dari isi artikel tidak pernah dieksekusi.
- [ ] Pratinjau memakai renderer yang sama dengan halaman publik.
- [ ] Artikel lama berformat teks polos tetap tampil benar.

---

### Task R7.6 `[KLIEN]` `[PENYEMPURNA]` Isi konten nyata

**Masalah:** `GET /api/articles` pada instance yang berjalan mengembalikan satu item, `pendampingan-santri-di-kairo`, dengan `body` dua kalimat. Landing page mempromosikan "Pena Hamasah" sebagai pusat wawasan dan kabar.

**Langkah:**
1. `[KLIEN]` Mintakan minimal enam artikel nyata dari pihak Hamasah, dengan foto dan alt text.
2. Terbitkan lewat CMS, bukan lewat seed, supaya alur editorial sekaligus teruji.
3. Verifikasi katalog tampil baik pada 0, 1, dan banyak artikel. Audit sebelumnya mencatat bahwa katalog dengan satu artikel menyisakan dua pertiga grid kosong.

**Selesai jika:**
- [ ] Ada konten nyata yang cukup untuk mengisi katalog.
- [ ] Katalog tampil baik pada 0, 1, dan banyak artikel.
- [ ] Setiap artikel punya cover dengan alt text.

---

## 10. Phase R8: Pengerasan dan Keputusan Sisa

**Tujuan:** menutup sisa temuan dan mengambil keputusan yang tertunda.

**Selesai jika:**
- [ ] Task R8.1 sampai R8.7 dicentang.
- [ ] Tidak ada lagi stub yang tercatat sebagai fitur tersedia.

---

### Task R8.1 `[KEPUTUSAN KR6]` `[PENYEMPURNA]` Nasib prototipe lama

**Masalah:** `server/http/static.js:60-78` melayani `/proposal/` dan `/hamasah/` dari berkas root: `index.html` (208.309 B), `styles.css` (194 KB), `app.js` (96 KB), `cinematic.css`, `proposal.css`. Permintaan ke `/proposal/` mengembalikan 200 dengan 208.309 B.

Prototipe ini tidak pernah masuk audit mana pun. Isinya, klaimnya, angkanya, dan kontaknya tidak diverifikasi. `.vercelignore` menunjukkan bahwa justru prototipe inilah yang di-deploy ke Vercel, bukan aplikasi di `website/`.

Bergantung pada KR6.

**Baca dulu:** `.vercelignore`, `vercel.json`, `server/http/static.js:60-78`, `scripts/browser-contract.test.js` yang masih membaca `styles.css` dan `cinematic.css`.

**Langkah untuk opsi (a), hapus:**
1. Hapus rute `/proposal/` dan `/hamasah/` dari `static.js` beserta test-nya.
2. Hapus `index.html`, `styles.css`, `app.js`, `cinematic.css`, `proposal.css` di root.
3. Perbarui `.vercelignore` supaya Vercel men-deploy aplikasi yang sebenarnya, atau hapus konfigurasi Vercel jika hosting sudah pindah sesuai K2.
4. Pastikan Task R5.1 sudah tidak lagi membaca berkas itu sebelum menghapusnya.

**Selesai jika:**
- [ ] `/proposal/` dan `/hamasah/` mengembalikan 404, atau tercatat sengaja dipertahankan beserta alasannya.
- [ ] Tidak ada skrip atau test yang masih membaca berkas prototipe.
- [ ] Konfigurasi deployment menunjuk ke aplikasi yang benar.

---

### Task R8.2 `[INTI]` Sambungkan worker pengingat visa

**Masalah:** `scripts/visa-reminder-worker.js` yang dijalankan `npm run worker:visa-reminders` tidak melakukan apa pun:

```js
if (process.argv.includes('--once')) {
  console.log('[visa-reminder-worker] adapter siap; sambungkan operationsService dan notification provider di deployment.');
  return;
}
```

`server/visa-reminder-worker.js` berisi logika yang benar, tetapi default `notify` adalah fungsi kosong yang mengembalikan `{ ok: true }`, sehingga item **ditandai sudah dikirim** padahal tidak ada yang dikirim. Default `stateStore` adalah `null`, sehingga state hanya di memori dan seluruh pengingat terkirim ulang setiap restart.

`IMPLEMENTATION_STATUS.md` mencantumkan "Scheduler adapter visa" sebagai tersedia, yang mudah dibaca sebagai fitur yang berjalan.

**Baca dulu:** `scripts/visa-reminder-worker.js`, `server/visa-reminder-worker.js`, `scripts/notification-worker.js` sebagai contoh worker yang sudah tersambung, `server/notification-service.js`.

**Langkah:**
1. **Ubah default `notify` supaya tidak menandai terkirim ketika tidak ada pengirim.** Ini bug, bukan sekadar wiring yang belum selesai. Tanpa pengirim, worker harus melaporkan bahwa tidak ada yang dikirim, bukan menelan item.
2. Sambungkan `scripts/visa-reminder-worker.js` ke `operationsService` dan notification service nyata, mengikuti pola `scripts/notification-worker.js`.
3. Berikan `stateStore` yang persisten supaya pengingat tidak terkirim ulang setiap restart.
4. Perbarui `IMPLEMENTATION_STATUS.md` supaya statusnya akurat.

**Selesai jika:**
- [ ] `npm run worker:visa-reminders` benar-benar memindai dan mengirim.
- [ ] Tanpa pengirim terkonfigurasi, worker melaporkan gagal, bukan sukses.
- [ ] State bertahan melewati restart.
- [ ] Dokumen status akurat.

---

### Task R8.3 `[KEPUTUSAN K10]` `[PENYEMPURNA]` Notifikasi peristiwa penting

**Masalah:** `server/notification-service.js` hanya mengenal `account-invitation` dan `password-reset`. Tidak ada notifikasi untuk perubahan status pendaftaran, dokumen perlu revisi, pembayaran diterima, visa mendekati kedaluwarsa, atau tugas LMS dinilai. Justru peristiwa itulah yang penting bagi pendaftar dan wali.

Pengirim yang tersedia hanya Resend, console, dan disabled. Tidak ada kanal WhatsApp, padahal seluruh formulir publik meminta nomor WhatsApp dan pasar utamanya Indonesia.

Kanal WhatsApp bergantung K10 dan Phase 16 di `PANDUAN_BUILD.md`.

**Baca dulu:** `server/notification-service.js`, `server/notification-worker.js`, `database/012_notifications_and_invitations.sql`, keputusan K5 dan K10.

**Langkah:**
1. Tambahkan jenis notifikasi untuk perubahan status pendaftaran, dokumen perlu revisi, dan pembayaran diterima. Ketiganya berjalan lewat email yang sudah ada dan tidak bergantung K10.
2. Hubungkan ke titik perubahan status yang sudah ada, jangan membuat jalur kedua.
3. Hormati preferensi penerima jika ada, dan jangan mengirim ke pendaftar yang sudah membatalkan.
4. Kanal WhatsApp tetap di Phase 16 sesuai K10. Jangan memakai gateway tidak resmi.

**Selesai jika:**
- [ ] Ketiga jenis notifikasi terkirim pada peristiwa yang benar.
- [ ] Notifikasi tercatat di `notification_outbox` dengan status yang benar.
- [ ] Tidak ada notifikasi ganda untuk satu peristiwa.

---

### Task R8.4 `[PENYEMPURNA]` Perkuat parameter scrypt

**Masalah:** `server/identity-service.js:77` memanggil `crypto.scrypt(password, salt, 64, ...)` tanpa opsi. Node memakai N=16384, r=8, p=1, sekitar 16 MB memori. Rekomendasi OWASP untuk scrypt lebih tinggi. Bukan kerentanan langsung, tetapi layak dinaikkan sebelum menyimpan kata sandi pengguna nyata.

**Baca dulu:** `server/identity-service.js:70-100`, `server/identity-service.test.js`.

**Langkah:**
1. Naikkan parameter dan sertakan `maxmem` yang sesuai, karena default Node akan menolak N yang lebih besar.
2. Format hash yang tersimpan sudah memuat prefiks `scrypt$`. Sertakan parameter di dalamnya supaya hash lama tetap dapat diverifikasi dan hash baru memakai parameter baru.
3. Ukur dampaknya terhadap waktu login. Jika terlalu lambat, turunkan sampai seimbang, dan catat angkanya.
4. Tambahkan test yang memverifikasi hash format lama masih bisa diverifikasi.

**Selesai jika:**
- [ ] Hash baru memakai parameter yang lebih kuat.
- [ ] Hash lama tetap dapat diverifikasi.
- [ ] Waktu login terukur dan tercatat.

---

### Task R8.5 `[KEPUTUSAN KR7]` `[PENYEMPURNA]` Mata uang

**Masalah:** `invoices.amount_rupiah BIGINT` dan `invoice_corrections.corrected_amount_rupiah`. Lembaga beroperasi di Mesir dan `website/biaya.html:252` sudah menyebut EGP. Tidak ada kolom mata uang maupun kurs.

Bergantung pada KR7. Jika keputusannya (a), task ini hanya mencatat batasan di dokumen dan selesai.

**Langkah untuk opsi (b):**
1. Migrasi menambahkan kolom mata uang dan kurs pada invoice.
2. Tentukan kapan kurs dikunci: saat invoice dibuat atau saat dibayar. Ini keputusan akuntansi, bukan teknis; tanyakan ke bagian keuangan.
3. Tampilkan mata uang di UI dan di kuitansi.

**Selesai jika (a):** batasan satu mata uang tercatat di `IMPLEMENTATION_STATUS.md`.

**Selesai jika (b):** invoice menyimpan mata uang dan kurs, dan kuitansi menampilkannya.

---

### Task R8.6 `[PENYEMPURNA]` Halaman 404

**Masalah:** audit sebelumnya mencatat konten 404 menempel ke bagian atas dengan sebagian besar viewport kosong, dan tidak memakai komposisi halaman bantuan yang konsisten. Halaman ini juga punya satu atribut style inline yang ditangani R1.4.

**Langkah:**
1. Beri container dengan ruang vertikal wajar, penanda 404, dan CTA ke beranda serta kontak.
2. CTA kontak menunjuk ke kanal yang benar-benar berfungsi hasil R1.6.
3. Tetap sederhana; halaman ini tidak perlu komposisi berat.

**Selesai jika:**
- [ ] Halaman terbaca di 375 px dan 1280 px tanpa area kosong besar.
- [ ] CTA menunjuk ke tujuan yang berfungsi.

---

### Task R8.7 `[MANUSIA]` `[INTI]` Audit ulang per role

**Masalah:** audit yang menghasilkan dokumen ini **tidak berhasil membuka sesi internal**. Kredensial demo di halaman portal tidak cocok dengan seed, dan kata sandi seed juga ditolak pada instance yang sedang berjalan. Isi workspace setelah login, yaitu tab monitoring, LMS, operasional, dan audit, belum pernah ditelusuri.

Temuan internal dalam dokumen audit berasal dari sumber kode dan dari shell yang ter-render sebelum guard sesi bekerja, bukan dari penelusuran penuh tiap tab dan modal.

**Prasyarat:** Task R1.0 dan R1.1 selesai sehingga akun uji jelas dan kredensialnya tidak lagi di kode.

**Langkah:**
1. Jalankan `npm run dev:reset` lalu `npm run dev` untuk mendapatkan seed bersih dengan kredensial yang dicetak ke terminal.
2. Masuk sebagai **masing-masing** dari tujuh role: admin, petugas pendaftaran, guru, pengawas, keuangan, wali, santri.
3. Untuk setiap role, telusuri setiap tab, modal, dan aksi yang terlihat. Catat: yang tidak berfungsi, yang tampil kosong tanpa penjelasan, yang menampilkan data role lain, dan yang menampilkan klaim tanpa dasar.
4. Periksa pada 375 px dan 1280 px.
5. Tulis hasilnya sebagai dokumen audit terpisah dengan format yang sama, lalu buat phase remediasi lanjutan jika perlu.

**Selesai jika:**
- [ ] Tujuh role ditelusuri pada sesi masing-masing, bukan dengan akses admin.
- [ ] Dokumen hasil audit per role ada.
- [ ] Temuan baru dimasukkan ke pelacak atau ke phase baru.

---

## 11. Gerbang Rilis

Melengkapi Bagian 17 `PANDUAN_BUILD.md`.

### Gerbang 1: boleh dilihat orang luar

- [ ] Phase R1 selesai seluruhnya.
- [ ] Phase R2 selesai seluruhnya.
- [ ] Task R8.7 selesai dan temuannya ditangani atau dijadwalkan.

Tanpa ketiganya, situs menampilkan layout yang rusak, tidak punya kanal masuk yang berfungsi, membocorkan logika bisnis dan konvensi kredensial, dan mengumpulkan data pribadi tanpa dasar yang sah.

### Gerbang 2: boleh dipakai staf untuk pekerjaan nyata

- [ ] Gerbang 1 terpenuhi.
- [ ] Phase R3 selesai, khususnya R3.5 (pembukaan berkas) karena tanpa itu review dokumen tidak dapat dijalankan.
- [ ] Phase R5 selesai, supaya kelulusan berikutnya dapat dipercaya.

### Gerbang 3: boleh menerima trafik nyata

- [ ] Gerbang 2 terpenuhi.
- [ ] Phase R4, R6, dan R7 selesai.
- [ ] Angka performa sebelum dan sesudah R6 tercatat.

### Aturan yang berlaku di semua gerbang

- Tidak ada pesan sukses untuk aksi yang tidak terjadi.
- Tidak ada klaim status, angka, atau jaminan yang tidak berasal dari state nyata.
- Tidak ada kredensial di berkas yang ter-deploy.
- Setiap skrip yang dikutip sebagai bukti benar-benar menguji yang diklaim.

---

## 12. Pelacak Progres

Sonnet mencentang task setelah Definition of Done terpenuhi, lalu menambahkan hash commit. Contoh: `- [x] R1.3 Style inline halaman internal (a1b2c3d)`.

**Phase R1: Fondasi Render dan Kanal Masuk** — selesai 20 September 2026, kecuali R1.0
- [ ] R1.0 `[MANUSIA]` Putar kredensial yang tersaji publik
- [x] R1.1 Cabut blok kredensial pengujian dari portal
- [x] R1.2 `[KOMPLEKS]` Hapus elemen DOM mati di portal dan perbaiki test
- [x] R1.3 `[KOMPLEKS]` Style inline halaman internal ke CSS (diperluas: 108 di HTML + 57 di template string JS)
- [x] R1.4 Style inline halaman publik ke CSS
- [x] R1.5 Script inline kontak ke berkas terpisah
- [x] R1.6 `[KEPUTUSAN KR1]` `[KLIEN]` Hidupkan kanal masuk publik (opsi c; nomor WhatsApp menunggu klien)
- [x] R1.7 Gerbang otomatis anti style dan script inline (diperluas ke berkas JS)

**Phase R2: Data, Privasi, dan Jejak**
- [ ] R2.1 Pindahkan berkas server keluar dari `website/`
- [ ] R2.2 Daftar tolak di penyajian berkas statis
- [ ] R2.3 `[KEPUTUSAN KR2]` `[KLIEN]` Kebijakan privasi dan persetujuan yang sah
- [ ] R2.4 Jejak pelaku pada rekam jejak santri

**Phase R3: UI untuk Backend yang Sudah Ada**
- [ ] R3.1 Export laporan dan kuitansi PDF
- [ ] R3.2 Koreksi dan pembatalan invoice
- [ ] R3.3 Panel visa dan berkas visa
- [ ] R3.4 Ledger inventaris
- [ ] R3.5 Pembukaan berkas dari konsol review
- [ ] R3.6 `[KEPUTUSAN KR3]` LMS: alur tugas dan kuis
- [ ] R3.7 Keluar dari semua perangkat

**Phase R4: Kebenaran Tampilan dan Identitas**
- [ ] R4.1 `[KOMPLEKS]` Kembalikan palet ke identitas merek
- [ ] R4.2 Batalkan override outline yang merusak kontras
- [ ] R4.3 Skrip pengukur kontras otomatis
- [ ] R4.4 Status sesi jujur dan penanganan 401 terpusat
- [ ] R4.5 Keluarkan data bisnis belum terkonfirmasi dari kode
- [ ] R4.6 `[KEPUTUSAN KR4]` Pencarian global CRM
- [ ] R4.7 Padatkan halaman publik di mobile
- [ ] R4.8 Seksi kegiatan santri

**Phase R5: Alat Uji yang Jujur**
- [ ] R5.1 `[KOMPLEKS]` `test:browser-contract` benar-benar menguji browser
- [ ] R5.2 `test:uat-roles` menguji matriks izin
- [ ] R5.3 Perluas `security:check`
- [ ] R5.4 Ukuran performa yang relevan

**Phase R6: Skalabilitas**
- [ ] R6.1 `[KOMPLEKS]` Daftar pendaftaran: satu query berpaginasi
- [ ] R6.2 Pagination untuk daftar lain
- [ ] R6.3 Cache dan kompresi aset statis
- [ ] R6.4 Pecah bundle internal
- [ ] R6.5 Index database
- [ ] R6.6 Rate limit dan kuota bersama

**Phase R7: Distribusi dan Konten** — 22 September 2026, kecuali R7.6 (lihat `docs/REMEDIASI_R7_HASIL_2026-09-22.md`)
- [x] R7.1 Open Graph dan Twitter Card (b6d9e7d)
- [x] R7.2 Sitemap dan robots yang benar (725bcc5)
- [x] R7.3 `[KOMPLEKS]` Artikel dapat ditemukan dan dibagikan (12756ff)
- [x] R7.4 Byline penulis yang sebenarnya (c17d8c0, ad94f11)
- [x] R7.5 `[KEPUTUSAN KR5]` Format isi artikel, opsi a (2a84bbc)
- [ ] R7.6 `[KLIEN]` Isi konten nyata (kerangka permintaan di dokumen hasil R7)

**Phase R8: Pengerasan dan Keputusan Sisa** — 22 September 2026, kecuali R8.7 (lihat `docs/REMEDIASI_R8_HASIL_2026-09-22.md`)
- [x] R8.1 `[KEPUTUSAN KR6]` Nasib prototipe lama, opsi a (70752a9)
- [x] R8.2 Sambungkan worker pengingat visa (4ed1c2e; scheduler di hosting menunggu K2)
- [x] R8.3 `[KEPUTUSAN K10]` Notifikasi peristiwa penting, email (bb33661; WhatsApp di Phase 16)
- [x] R8.4 Perkuat parameter scrypt (7c69227)
- [x] R8.5 `[KEPUTUSAN KR7]` Mata uang, opsi a (b629c35)
- [x] R8.6 Halaman 404 (d968ea1)
- [ ] R8.7 `[MANUSIA]` Audit ulang per role (daftar periksa di dokumen hasil R8)

**Sisa pekerjaan manusia:** R1.0 (putar kredensial, periksa riwayat git), R8.7 (audit ulang per role).

**Sisa Phase R1 yang menunggu klien:** nomor WhatsApp resmi untuk `WHATSAPP_NUMBER` di `website/kontak.js`. Selama kosong, tombol WhatsApp tidak ditampilkan dan formulir tetap berfungsi penuh.

**Menunggu keputusan:** KR5, KR6, KR7 dan bagian email K10 diputuskan 22 September 2026. Masih terbuka: K2 (hosting), K4, K5, K14, K16 di `PANDUAN_BUILD.md`, dan kanal WhatsApp K10 (Phase 16).

**Menunggu materi klien:** R1.6 (nomor resmi), R2.3 (isi kebijakan privasi), R4.8 (foto kegiatan), R7.6 (artikel).
