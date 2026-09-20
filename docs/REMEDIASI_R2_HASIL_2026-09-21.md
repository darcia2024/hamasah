# Phase R2 — Hasil dan bukti

Tanggal: 21 September 2026
Rencana: `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md` Bagian 4
Temuan yang disentuh: C-02, F-01, dan sebagian F-02 pada `docs/AUDIT_LANJUTAN_DAN_RANCANGAN_PERBAIKAN_2026-09-20.md`

## Ringkasan

Tiga dari empat task selesai penuh. R2.3 selesai pada sisi teknisnya dan menunggu materi dari pihak Hamasah.

| Task | Status | Hasil |
|---|---|---|
| R2.1 | Selesai | Berkas server dipindah keluar dari `website/`; enam URL kini 404 |
| R2.2 | Selesai | Penyajian statis memakai daftar-izin ekstensi ditambah daftar-tolak nama |
| R2.3 `[KLIEN]` | **Kerangka selesai, isi menunggu** | Halaman, checkbox wajib, pencatatan versi, tautan footer sudah berfungsi; teks pasalnya draf |
| R2.4 | Selesai | `recorded_by_account_id` pada lima tabel, diisi dari sesi, tampil di konsol |

## Koreksi terhadap dokumen audit

Audit menyatakan `server/http/static.js` "mengizinkan awalan `website/` untuk semua jenis berkas di `MIME_TYPES`". **Kenyataannya lebih longgar dari itu.**

`MIME_TYPES` hanya menentukan `Content-Type`. Berkas yang ekstensinya tidak terdaftar tetap disajikan, dengan `application/octet-stream`. Jadi bukan hanya `.md` dan `.metadata.json` yang dapat diunduh, melainkan juga `.env`, `.sql`, `.pem`, `.bak`, dan apa pun yang kebetulan berada di `website/` atau `assets/`.

Karena itu R2.2 dikerjakan sebagai **daftar-izin ekstensi**, bukan sekadar daftar-tolak seperti yang tertulis di rencana. Daftar-tolak nama tetap ada di atasnya, untuk pola yang lolos ekstensi tetapi tidak boleh publik.

## Perubahan per task

### R2.1 — Berkas server keluar dari folder publik

Yang dipindah atau dihapus:

| Berkas | Tindakan |
|---|---|
| `registration-service.js` (19.129 B) | Pindah ke `server/`. Cabang UMD untuk browser dicabut, karena tidak ada halaman yang memuatnya lewat `<script>` |
| `registration-service.test.js`, `registration-domain.test.js` | Pindah ke `server/`, tempat test lain berada |
| `DESIGN_DECISIONS.md` | Pindah ke `docs/` |
| Enam `*.metadata.json` | Dihapus. Isinya catatan scratch bertimestamp, tidak ada kode yang membacanya |

**`registration-domain.js` sengaja tetap di `website/`.** Berkas itu dipakai browser dan server sekaligus. `index.html` memuatnya lewat tag script, dan proyek ini tidak punya langkah build, jadi satu-satunya cara browser mendapatkannya adalah dari folder yang disajikan statis. Menaruh kanonisnya di `server/` berarti menambah rute penyajian khusus; menyalinnya ke dua tempat berarti dua sumber kebenaran untuk aturan validasi yang sama. Alasan ini ditulis di kepala berkasnya, beserta syaratnya: isinya harus tetap aman dibaca publik.

Konsekuensinya `registration-domain.test.js` me-require modulnya lewat `../website/`, bukan berada di sampingnya. Itu lebih baik daripada meninggalkan berkas test di folder publik.

### R2.2 — Gerbang penyajian statis

Dua lapis, dipasang setelah `normalizedPath` final (yaitu sesudah pemetaan ulang permintaan tanpa awalan `/website/`) dan sebelum berkas dicari di disk:

1. **Daftar-izin ekstensi.** Hanya ekstensi di `MIME_TYPES` yang tersaji. Seluruh isi `website/` dan `assets/` saat ini hanya css, html, js, txt, xml, jpg, dan png, jadi tidak ada yang sah terputus.
2. **Daftar-tolak nama.** Berakhiran `.test.js`, berakhiran `.metadata.json`, dan setiap segmen jalur berawalan titik.

Jawabannya **404, bukan 403**. Test membuktikan status dan isi respons untuk berkas yang ada tetapi dilarang persis sama dengan berkas yang tidak ada, sehingga server tidak membocorkan keberadaan berkas lewat selisih jawaban.

### R2.3 — Kebijakan privasi: yang selesai dan yang belum

**Selesai:**

- `website/kebijakan-privasi.html` memakai layout halaman publik yang ada, tujuh bagian sesuai pertanyaan yang perlu dijawab klien.
- Checkbox persetujuan pemrosesan data pribadi, **terpisah dan wajib**, berlaku untuk semua jalur program termasuk Hamasah Courses.
- Persetujuan wali diubah dari "mendapat persetujuan wali untuk mengikuti proses pendaftaran" menjadi persetujuan wali atas pemrosesan data pribadi calon santri.
- `PRIVACY_POLICY_VERSION` menjadi konstanta. Server menstempelnya saat pendaftaran dibuat dan **mengabaikan nilai apa pun yang dititipkan di body**.
- Penyuntingan profil meneruskan versi yang sudah tersimpan apa adanya. Tanpa itu, menyunting nomor telepon akan diam-diam mencatat persetujuan terhadap kebijakan yang belum pernah dibaca pendaftar.
- Versi yang ditampilkan di halaman dibaca dari konstanta yang sama, bukan diketik ulang di HTML.
- Tautan kebijakan privasi di footer tujuh halaman publik.

**Belum, dan tidak bisa diselesaikan dari sisi teknis:**

Isi tujuh bagian menunggu materi dari pihak Hamasah:

1. Data pribadi yang dikumpulkan dan tujuan masing-masing
2. Dasar persetujuan
3. Berapa lama data disimpan
4. Siapa yang dapat mengakses, termasuk pihak ketiga
5. Cara mencabut persetujuan dan meminta penghapusan
6. Penanggung jawab pelindungan data
7. Perlakuan bagi calon santri di bawah umur

Selama itu, halaman diberi `meta robots noindex`, blok draf ditampilkan mencolok di atas, dan entri sitemap disiapkan tetapi masih dikomentari.

**Sebelum rilis, tiga hal harus dikerjakan dalam satu commit:** ganti isi tujuh bagian, ganti `PRIVACY_POLICY_VERSION` dari `draft-2026-09-21` menjadi versi dokumen yang berlaku sambil menghapus blok draf dan `noindex`, lalu aktifkan entri sitemap.

**Catatan untuk tinjauan hukum:** yang tercatat saat ini adalah **versi** dokumen yang disetujui, bukan stempel waktu persetujuannya sendiri. `guardian_consent_at` ada; padanan untuk persetujuan pemrosesan data belum. Tambahkan bila pihak yang meninjau menghendakinya.

### R2.4 — Jejak pelaku pada rekam jejak santri

Migrasi `033_student_record_actor.sql` menambahkan `recorded_by_account_id` ke `student_activities`, `student_attendance`, `student_achievements`, `student_evaluations`, dan `student_violations`. Nullable, `ON DELETE SET NULL`, mengikuti pola migrasi 005.

Nilainya ditulis **setelah** record selesai dibentuk di `student-portal-service`, sehingga field bernama sama yang dititipkan di body request tidak punya kesempatan menggantikannya.

`correctRecord` ikut membaca kolomnya supaya hasil koreksi memuat pencatat asli, tetapi kolom itu tidak pernah masuk daftar `allowed`, jadi koreksi tidak dapat memindahkan jejak pelaku ke orang lain.

**Temuan saat mengerjakan UI:** konsol monitoring sebelumnya sama sekali tidak menampilkan daftar rekam jejak. Yang ada hanya tiga angka ringkasan dan satu baris "Kegiatan terakhir". Rencana meminta pencatat ditampilkan "pada daftar rekam jejak", sehingga daftarnya sendiri harus dibuat lebih dulu. Bagian "Rekam Jejak Terakhir" menggabungkan kelima koleksi menjadi satu daftar berurut waktu.

Catatan tanpa pencatat ditandai "Pencatat tidak tersimpan", bukan dikosongkan, supaya selisih antara catatan yang dapat ditelusuri dan yang tidak terlihat jelas.

## Perbaikan di luar rencana R2

### Versi cache-busting yang tidak pernah dinaikkan

Phase R1 memindahkan 183 atribut style inline ke `staff.css`, `portal.css`, dan `website.css`, lalu mengubah empat berkas JS. **Tidak satu pun rujukan `?v=` dinaikkan.**

Pada rilis, pengunjung yang masih menyimpan `staff.css?v=2` atau `portal.css?v=4` akan menerima HTML baru yang seluruh tampilannya kini bergantung pada kelas, bersama stylesheet lama yang belum punya kelas itu. Halamannya tidak hanya berbeda, tetapi kehilangan tata letaknya.

Ditemukan juga `website.css` tersebar di empat angka berbeda antar halaman (v=1, v=18, v=21, v=22), yang artinya sebagian halaman sudah lama menyajikan versi berbeda dari berkas yang sama. Seluruhnya disatukan.

## Verifikasi

### Otomatis

```
npm test                            57 test, seluruhnya lulus
npm run test:csp-contract           17 halaman + 17 skrip, 0 style/script inline
node database/validate-schema.js    lulus
```

Test baru dan yang diperluas:

- `server/http/static.test.js` — tujuh pola terlarang memakai berkas yang benar-benar dibuat di sandbox, jadi yang diuji adalah gerbangnya menolak dan bukan berkasnya kebetulan tidak ada; ditambah pemeriksaan bahwa 404 "dilarang" identik dengan 404 "tidak ada".
- `server/postgres-student-store.test.js` — pencatat tersimpan, namanya terbaca lewat JOIN, baris tanpa pencatat tetap terbaca, catatan bertahan setelah akun staf dihapus.
- `server/student-portal-service.test.js` — body yang menitipkan pencatat kalah dari actor sesi.
- `server/app-postgres.test.js` — `privacyPolicyVersion` palsu di body diabaikan, dan kiriman tanpa `dataProcessingConsent` ditolak 422.
- `server/registration-domain.test.js` dan `server/registration-service.test.js` — kedua persetujuan berdiri sendiri; versi distempel saat create dan dipertahankan saat penyuntingan profil.

### Server lokal

| Yang diperiksa | Hasil |
|---|---|
| Enam URL berkas server di `/website/` | 404 |
| `/registration-service.js` tanpa awalan | 404 |
| `index.html`, CSS, JS, gambar, robots.txt, sitemap.xml | 200, tanpa error di console |
| `HamasahRegistrationDomain` setelah pemindahan | `validateApplicant` menolak isian kosong, `normalizePhone` tetap menghasilkan `+6281234567890` |
| POST violations dengan `recordedByAccountId` palsu di body | Tersimpan dengan id akun sesi |
| Daftar rekam jejak di konsol | "Dicatat oleh Admin Dev" untuk catatan baru, "Pencatat tidak tersimpan" untuk catatan seed lama |
| Formulir pendaftaran tanpa centang persetujuan data | Nol permintaan POST terkirim, error muncul dekat field dengan `aria-invalid` |
| Formulir pendaftaran setelah dicentang | Pendaftaran dibuat, nomor registrasi terbit |
| Halaman kebijakan privasi | Versi `draft-2026-09-21` terbaca dari konstanta, `noindex` aktif, tujuh bagian tampil |

Migrasi 033 diterapkan pada database dev yang sudah berisi data tanpa kehilangan baris, dan pada database kosong saat `npm run dev:reset` lalu `npm run dev` membangunnya ulang dari 001 sampai 033.

## Yang belum selesai

- **Isi kebijakan privasi `[KLIEN]`.** Tujuh bagian di atas. Ini yang menahan R2 dinyatakan tutup.
- **`npm run verify:database` masih gagal.** Perintah itu memeriksa database yang ditunjuk `.env`, yaitu Supabase dengan `APP_ENV=production`, dan database itu tertinggal 17 migrasi (017 sampai 033). Ini bukan akibat perubahan R2: 032 dari Phase R1 pun belum diterapkan di sana. Penerapan migrasi ke staging dan production adalah tindakan rilis, bukan perubahan kode, dan tidak dikerjakan dari sini.
- **Nomor WhatsApp resmi `[KLIEN]`.** Masih kosong di `website/kontak.js`, warisan R1.6.
- **`npm test` bentrok dengan server dev yang sedang hidup.** `scripts/http-performance.test.js` men-spawn `scripts/dev.js`, yang membuka folder PGlite `data/dev-db` yang sama dengan `npm run dev`. Dua proses tidak bisa membukanya bersamaan, sehingga tes gagal bila server dev sedang jalan, dan folder itu sempat rusak sampai perlu `npm run dev:reset`. Sudah dicatat sebagai pekerjaan terpisah.
