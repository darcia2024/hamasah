# Phase R1 — Hasil dan bukti

Tanggal: 20 September 2026
Rencana: `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md` Bagian 3
Temuan yang ditutup: A-01, A-02, C-01, G-05 pada `docs/AUDIT_LANJUTAN_DAN_RANCANGAN_PERBAIKAN_2026-09-20.md`

## Ringkasan

Tujuh dari delapan task selesai. Task R1.0 berlabel `[MANUSIA]` dan tidak dikerjakan di sini.

| Task | Status | Hasil |
|---|---|---|
| R1.0 `[MANUSIA]` | **Belum** | Putar kata sandi `tester@hamasah.test` dan periksa riwayat git |
| R1.1 | Selesai | Blok kredensial pengujian dicabut dari `portal.html` dan `portal.js` |
| R1.2 | Selesai | Empat elemen mati dihapus, bukan disembunyikan; state loading santri jadi berfungsi |
| R1.3 | Selesai | 108 atribut style di HTML internal + 57 di template string JS dipindah ke kelas |
| R1.4 | Selesai | 4 atribut style di halaman publik dipindah; textarea masuk sistem field |
| R1.5 | Selesai | Script inline `kontak.html` pindah ke `website/kontak.js` |
| R1.6 | Selesai | `POST /api/inquiries` + tabel + panel konsol petugas; slot WhatsApp menunggu nomor |
| R1.7 | Selesai | `scripts/csp-contract.test.js`, menutup 16 halaman + 19 skrip |

## Koreksi terhadap audit awal

Audit 20 September mencatat 126 atribut `style="..."`. Angka itu **hanya menghitung berkas HTML**.

Saat mengerjakan R1.3, pemeriksaan browser pada konsol CRM yang sudah login menunjukkan **85 pelanggaran CSP yang masih tersisa**. Sumbernya **57 atribut `style="..."` di dalam template string JavaScript** (`lms.js` 37, `portal.js` 20) yang dipasang lewat `innerHTML`. Atribut itu menjadi atribut style sungguhan di DOM, jadi ikut diblokir.

Total sebenarnya **183**, bukan 126.

Audit awal tidak menangkapnya karena sesi internal tidak berhasil dibuka (kredensial demo rusak, lihat C-01), sehingga konsol setelah login tidak pernah diperiksa. Ini persis batasan yang sudah dinyatakan pada Bagian 9 dokumen audit.

Catatan teknis: penulisan properti satu per satu (`element.style.width = '...'`) **tidak** diblokir CSP dan tidak termasuk hitungan di atas. Yang diblokir adalah atribut style di markup, `setAttribute('style', ...)`, dan `style.cssText`. Masih ada 88 penulisan properti runtime (`lms.js` 74, `portal.js` 13, `cek-status.js` 1); itu masalah kualitas kode, bukan CSP, dan bukan bagian dari Phase R1.

## Perubahan per task

### R1.1 — Kredensial pengujian dicabut

- Blok `Coba Cepat Akun Pengujian` dihapus dari `website/portal.html`.
- Empat handler beserta `tester@hamasah.test` / `TestingHamasah2026!` dan `kata-sandi-dev-hamasah` dihapus dari `website/portal.js`.
- Tidak diganti dengan versi "hanya development": berkas ini tetap ter-deploy. Kredensial akun contoh sudah dicetak ke terminal oleh `npm run dev`.

### R1.2 — Elemen mati dihapus, bukan disembunyikan

Komentar di `portal.html` menyatakan elemen dipertahankan untuk assertion test. **Pemeriksaan menunjukkan tidak ada satu pun test yang menyebut keempat id tersebut.**

| Elemen | Keputusan | Alasan |
|---|---|---|
| `.staff-intro` (`#portal-role-label`, `#portal-title`) | Dihapus | Shell CRM sudah menampilkan nama dan peran lewat `updateCrmUserBadges`; sapaan terpisah hanya membuat heading ganda |
| `#portal-students-header` | Dihapus | Salinannya menjelaskan pemilihan kartu santri yang sudah tidak ada; JS hanya pernah menyembunyikannya |
| `#portal-students-status` | Dipertahankan | JS menulis "Memuat data santri..." ke sini. Sekarang benar-benar tampil saat memuat dan menampilkan error saat gagal |
| `#portal-student-list` | Dipertahankan | Menampung empty state "Belum ada santri yang terhubung dengan akun ini." yang memang bisa tercapai; sekarang ditampilkan saat kosong |

Ditemukan juga bahwa `#crm-page-title` **tidak ada di berkas HTML mana pun**, sehingga enam assignment `crmPageTitle.textContent` menulis ke `null`. Variabel dan seluruh assignment-nya dihapus.

### R1.3 dan R1.4 — Style inline ke kelas

Kelas ditambahkan di `website/staff.css` (dimuat keenam halaman internal) dan `website/website.css` (halaman publik).

Yang perlu diperhatikan saat meninjau:

- **Grid form dua kolom sekarang punya breakpoint.** Sebelumnya `grid-template-columns: 1fr 1fr` ditulis tanpa media query, jadi dua kolom dipaksakan juga di mobile. Sekarang satu kolom di bawah 800px. Klaim Tahap 6 soal dua kolom baru benar-benar berlaku sekarang.
- **`#16A34A` tidak lagi ditulis langsung.** Dipindah menjadi token `--crm-status-online` di `portal.css`. Task R4.1 menyatukannya dengan token sukses global.
- **Textarea masuk sistem field.** `.field-group input, .field-group select` diperluas dengan `textarea`. Sebelumnya textarea tidak pernah tercakup selector itu; itulah sebabnya dulu ditulis inline.
- Tinggi kontrol yang dulu ditulis `height: 44px` / `46px` menjadi `min-height`, karena `.button` sudah menyediakan `min-height: 44px`.

### R1.5 dan R1.6 — Kanal masuk publik

Keputusan KR1: opsi (c), formulir dan WhatsApp.

Backend baru:

- `database/032_inquiries.sql` — tabel `inquiries` dengan constraint nama, topik, panjang pesan, status, dan RLS aktif.
- `server/postgres-inquiry-store.js` — validasi, normalisasi nomor ke E.164 memakai aturan yang sama dengan pendaftaran, dan **pagination sejak awal** supaya tidak mengulang temuan E-02.
- `server/routes/inquiries.js` — `POST /api/inquiries` publik dengan rate limit per IP, `GET /api/inquiries` dan `PATCH /api/inquiries/:id/status` dengan izin `inquiries.read` / `inquiries.manage`.
- Aturan rate limit baru `inquiry-create` (8 per jam per IP), terpisah dari `registration-create`.
- Aksi audit `inquiry.received` dan `inquiry.status-changed`. **Nama, nomor, dan isi pesan tidak masuk metadata audit**; hanya topik.

Frontend:

- `website/kontak.js` menggantikan script inline. State memuat, sukses, dan error benar. Tombol dinonaktifkan selama pengiriman. Error validasi ditempatkan dekat field dengan `aria-invalid`.
- **Pesan sukses palsu dihapus.** Handler lama membaca isian, membuangnya, lalu menampilkan "Pesan siap diproses" dengan kelas sukses. Sekarang sukses hanya muncul setelah server membalas 2xx.
- Panel `Pesan Konsultasi` di `website/staff.html` dengan filter status, pagination, dan aksi tandai.
- Saklar subtab konsol petugas dirapikan menjadi tabel `STAFF_TABS`; sebelumnya tiap tab menyembunyikan panel lain satu per satu.

Slot WhatsApp: konstanta `WHATSAPP_NUMBER` di `website/kontak.js`, saat ini kosong. Tombol tidak ditampilkan selama kosong. **Satu-satunya tempat nomor itu perlu ditulis.**

### R1.7 — Gerbang otomatis

`scripts/csp-contract.test.js` menolak, pada `website/`:

- atribut `style="..."` di HTML dan di dalam string HTML pada berkas JS
- elemen `<style>`
- `<script>` tanpa `src`
- handler atribut (`onclick`, `onsubmit`, dan 22 lainnya)
- `setAttribute('style', ...)` dan `style.cssText`

Terdaftar sebagai `npm run test:csp-contract` dan ikut berjalan pada `npm test`.

## Verifikasi

### Otomatis

```
npm test                       57 test, seluruhnya lulus
npm run test:csp-contract      16 halaman + 19 skrip, 0 style/script inline
node --check                   portal.js, lms.js, staff.js, kontak.js
```

Test baru:

- `server/postgres-inquiry-store.test.js` — validasi, normalisasi nomor, pagination, batas `pageSize`, perubahan status, 404.
- `server/inquiries-api.test.js` — pengiriman publik tanpa sesi, penolakan isian tidak valid, **401 tanpa sesi**, **403 untuk role tidak berhak**, alur petugas, dan pemeriksaan bahwa nomor serta isi pesan tidak bocor ke jejak audit.
- `server/access-matrix.test.js` diperbarui dengan dua izin baru. Gerbang di berkas itu menolak izin yang belum diuji, dan gerbang itu memang menangkap kekurangan ini saat pertama kali dijalankan.

### Browser

Server lokal `http://127.0.0.1:4273`, tab bersih untuk tiap pemeriksaan.

| Yang diperiksa | Sebelum | Sesudah |
|---|---|---|
| Pelanggaran CSP `kontak.html` | 2 | 0 |
| Pelanggaran CSP portal setelah login | 85 | 0 |
| Atribut style di DOM portal setelah login | 87 | 0 |
| Atribut style di DOM lms/monitoring/operations/audit | ada | 0 |
| Textarea kontak | `width: 177px`, `padding: 0px`, border native | `padding: 12px 16px`, border token, `min-height: 112px`, radius 8px |
| Heading ganda di portal | ada | tidak ada |
| Tombol kredensial demo | ada, dan kredensialnya sudah tidak cocok dengan seed | tidak ada |

Alur konsultasi diuji ujung ke ujung:

1. Kirim dengan pesan terlalu pendek: status error, field ditandai `aria-invalid`, halaman tidak reload.
2. Kirim valid: status sukses, form direset, tombol aktif kembali.
3. `GET /api/inquiries` sebagai admin: kedua pesan tersimpan, nomor ternormalisasi `+6281234567890`, label topik benar.
4. Panel petugas: badge menampilkan 2, tandai sudah dihubungi, daftar menyegar, badge turun ke 1.

## Yang belum selesai

- **R1.0 `[MANUSIA]`.** Putar kata sandi `tester@hamasah.test` jika akun itu ada di staging atau production, lalu jalankan `git log -S "TestingHamasah2026" --oneline --all` untuk menentukan apakah nilai lama pernah ter-push.
- **Nomor WhatsApp resmi `[KLIEN]`.** Isi `WHATSAPP_NUMBER` di `website/kontak.js`. Formulir sudah berfungsi penuh tanpanya.
- **Migrasi 032 ke staging dan production.** Baru diterapkan ke database lokal.
- **88 penulisan style runtime di JS** (`lms.js` 74, `portal.js` 13, `cek-status.js` 1). Tidak diblokir CSP, jadi tidak memblokir rilis, tetapi layak dibereskan saat Phase R4 menyentuh berkas yang sama.
