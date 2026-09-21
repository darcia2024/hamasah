# Remediasi R5: Hasil (21 September 2026)

Cabang: `remediasi-r5-uji` (dari `main` sesudah R1 sampai R4). Satu commit atau lebih per tugas, id tugas di subjek.

## Ringkasan

| Tugas | Commit | Hasil |
|---|---|---|
| R5.1 | `2c9f549`, `c541b28` | `test:browser-contract` kini membuka 17 halaman x 5 lebar di Chrome/Edge sungguhan. Kontrak lama menjadi `test:static-contract`. |
| R5.2 | `a54a5e6` | `uat-roles.test.js` diganti `role-authorization.test.js`: tujuh role lewat HTTP, dengan batas data wali dan santri. |
| R5.3 | `eb9ccd5` | `security:check` memindai folder publik dan menjalankan `npm audit`. |
| R5.4 | commit R5.4 | `test:scale` mengukur query pendaftar dan berat portal. Angka awal di bawah. |

## R5.1: kontrak browser

**Rencana (butir 1 tugas):** browser dicari otomatis (Chrome atau Edge, atau `CHROME_PATH` / `--browser`), dinyalakan headless lewat DevTools Protocol, dengan aplikasi dinyalakan di dalam proses dan database in-memory. Perkakas ini sudah dibangun untuk `check:contrast` dan dipindah ke `scripts/browser-harness.js` supaya dipakai bersama, bukan disalin. Waktu: sekitar 1 sampai 3 menit untuk 85 pemeriksaan. Karena itu dipisah dua (butir 5 tugas): kontrak statis ikut `npm test`, kontrak browser dijalankan sebelum rilis.

**Yang diperiksa browser:** pelanggaran CSP (lewat domain Audits, karena atribut `style` yang diblokir tidak selalu muncul sebagai pesan console), galat JavaScript, `console.error`, respons HTTP 400 ke atas, sumber daya gagal muat, gulir horizontal pada 360/390/768/1024/1440 px, gambar rusak (gambar malas-muat dipaksa dimuat lebih dulu), dan kontrol interaktif tanpa nama aksesibel (dari pohon aksesibilitas browser, bukan tebakan). Halaman internal dibuka dengan sesi admin dan setiap tab diklik.

**Bukti tes ini bekerja:** menambahkan `style="color:red"` sementara pada `kontak.html` membuat kontrak gagal dengan `pelanggaran CSP: style-src-attr memblokir kInlineViolation [/website/kontak.html:46]`. Berkas dikembalikan. Percobaan pertama TIDAK menangkapnya (hanya mendengarkan console); itu sebabnya domain Audits ditambahkan.

**Temuan nyata dari kontrak baru, sudah diperbaiki:**
- Tombol "Perbarui Data" dan "Unduh Laporan CSV" kehilangan label teks pada 768 px ke bawah (span disembunyikan CSS), sehingga tombol ikon tanpa nama. Diberi `aria-label`.
- Empat `<select>` tanpa label: pilihan santri di monitoring dan LMS, dua filter import di staff.
- Sepuluh halaman tanpa `<link rel="icon">`, sehingga setiap kunjungan memicu 404 pada `/favicon.ico`.
- Kontrak statis lama tidak pernah membaca CSS yang benar; versi baru membaca stylesheet yang ditautkan tiap halaman. Halaman auth (`auth-pages.css`) ternyata tanpa breakpoint: lebarnya cair (`min(100%, 440px)`), dan browser membuktikan tidak ada gulir horizontal pada lima lebar.

Hasil akhir: 17 halaman x 5 lebar = 85 pemeriksaan, 0 gagal.

## R5.2: otorisasi per role

Assertion tautologis dihapus. Untuk tujuh role, satu GET yang diizinkan dan satu yang ditolak, dipilih dari `ROUTES` dan `PERMISSIONS` (tidak ada daftar kedua). Batas data:
- wali A hanya melihat anak sendiri; dashboard, laporan, dan maddah anak wali B ditolak 403 tanpa membocorkan nama;
- wali tidak bisa menulis, walau untuk anak sendiri;
- santri A tidak membuka santri B atau maddah yang tidak diikutinya;
- menandai materi selesai atas nama santri lain ditolak tanpa mengubah progres.

Batas asrama musyrif sudah diuji di `server/dormitory-access.test.js`; matriks setiap endpoint x setiap role di `server/access-matrix.test.js`.

Nama diganti dari `uat-roles` ke `test:role-authorization` karena ini uji otorisasi, bukan UAT. Catatan koreksi ditambahkan ke delapan dokumen Stage yang mengutipnya.

Temuan kecil: route LMS membalas penolakan akses dengan 422, route lain 403. Tidak diubah (di luar R5); ditandai di komentar tes.

## R5.3: security:check

Pemeriksaan lama dipertahankan, kini dengan berkas dan baris. Ditambah: email akun pengujian dan kata sandi literal di `website/` (placeholder dikecualikan), berkas `.test.js` / `.md` dan `require` modul server di folder publik, dan `npm audit --omit=dev` dengan ambang `high` (temuan di bawahnya dicatat, tidak memblokir; audit yang tidak bisa dijalankan dilaporkan sebagai temuan, tidak diam-diam lulus).

**Bukti (kriteria selesai tugas):** dijalankan pada pohon `35709b8` (sebelum R1.1) melaporkan `website/portal.js:1658` dan seterusnya (email dan kata sandi dev); pada `519e59d~1` (sebelum R2.1) melaporkan `website/registration-*.test.js` dan `DESIGN_DECISIONS.md` tersaji publik. Pada kondisi sekarang: lulus, `npm audit` 0 kerentanan.

## R5.4: angka awal sebelum R6

`npm run test:scale`, PGlite in-memory, pemuatan lewat HTTP:

| Ukuran | Nilai |
|---|---|
| GET /api/registrations, 20 pendaftar | 103 query, 69 ms |
| GET /api/registrations, 200 pendaftar | **1.003 query**, 707 ms |
| Pertumbuhan | 900 query untuk 180 pendaftar tambahan: 5 query per pendaftar (E-01) |
| portal.html + CSS + JS | **304 KB** di jaringan, tanpa kompresi (E-03; audit mencatat 266 KB, sudah tumbuh) |

Rincian berat: portal.html 12,3 KB, website.css 103,5, staff.css 34,4, portal.css 90,8, internal-shell.js 10,7, nav.js 8,1, portal.js 44,3.

Ambang: pertumbuhan query paling banyak 2 dari 20 ke 200 pendaftar, daftar 200 pendaftar paling lama 1.500 ms, berat portal paling besar 150 KB di jaringan. **Skrip ini sengaja gagal sekarang** pada ambang query dan ambang berat, sebagai bukti alatnya mendeteksi E-01 dan E-03. Bukan `.test.js` supaya `npm test` tetap hijau; jalankan ulang sesudah R6.1 dan R6.3 dan catat angkanya di dokumen R6.

## Sisa dan catatan

- `test:browser-contract` butuh Chrome atau Edge terpasang; tanpa itu keluar dengan kode 2 (bukan lulus).
- `check:contrast` dan `test:browser-contract` berbagi `scripts/browser-harness.js`; `check:contrast` diuji ulang setelah pemindahan.
- Belum ada CI di repo; kontrak browser dan `test:scale` dijalankan manual sebelum rilis.
