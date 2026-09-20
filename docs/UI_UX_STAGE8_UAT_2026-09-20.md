# Tahap 8 UAT Visual dan Aksesibilitas

Tanggal: 2026-09-20
Environment: lokal `http://127.0.0.1:4273`

## Matriks viewport

Halaman publik dan enam workspace internal diuji pada lebar 360, 390, 768, 1024, dan 1440 px.

- Tidak ditemukan overflow horizontal dokumen.
- Drawer internal hadir dan tertutup pada 360 dan 390 px.
- Grid dan navigasi tetap terbaca pada 768 px.
- Layout desktop terukur normal pada 1024 dan 1440 px.
- Viewport dikembalikan setelah pengujian.

## Keyboard dan aksesibilitas

- Menu publik dapat dibuka dengan Enter dan Space.
- Escape menutup menu dan mengembalikan fokus ke tombol menu.
- Drawer internal dapat dibuka dengan Enter dan Space, lalu ditutup Escape.
- Tombol drawer memiliki label aksesibel.
- Input dan select yang terlihat memiliki label atau nama aksesibel.
- Heading ditemukan pada semua halaman yang diuji.
- Status async memakai elemen `role="status"` pada form dan workspace.
- Error state artikel tidak ditemukan tampil dengan CTA kembali ke katalog.
- Empty state katalog artikel dan empty state editorial dapat dibaca sebagai teks.

## State dan data ekstrem

- Katalog artikel dengan hasil pencarian 0 menampilkan pesan dan tombol reset.
- Detail artikel dengan slug tidak tersedia menampilkan state error yang jelas.
- CMS memiliki state awal draf, preview lokal, cover gagal, dan daftar editorial kosong.
- Monitoring dan LMS memiliki state awal tanpa pilihan santri.
- Metadata panjang dibatasi oleh layout responsif dan tidak memicu overflow.

## Role UAT

Automated synthetic role UAT lulus untuk admin, petugas pendaftaran, guru, pengawas, finance, wali, dan santri:

`npm run test:uat-roles`

Hasil: `synthetic role UAT passed (7 roles)`.

## Regression dan performance

- `npm test` lulus, termasuk validasi schema dan seluruh test Node.
- `npm run test:browser-contract` lulus untuk 16 halaman.
- `npm run test:performance` lulus.
- `npm run test:http-performance` lulus.
- `npm run security:check` lulus.

## Screenshot

Screenshot baseline dan final katalog artikel diambil pada viewport desktop 1440 × 900 selama sesi browser UAT. Keduanya menunjukkan header publik, filter artikel, state cover tidak tersedia, dan kartu artikel tetap terbaca. Screenshot ditampilkan inline pada sesi eksekusi, tidak disimpan sebagai asset repository.

## Temuan P1 dan P2

Tidak ada temuan P1 atau P2 baru dari UAT lokal ini. Temuan UI/UX yang tercatat pada audit sebelumnya sudah ditutup melalui Tahap 1 sampai Tahap 7, termasuk header publik, shell mobile, empty state, status editorial, dan overflow workspace.

## Batas sebelum staging

UAT screen reader dengan perangkat pembaca nyata, email/worker nyata, storage provider Supabase, domain HTTPS, dan persetujuan pemilik proses tetap harus dijalankan pada staging. Itu adalah verifikasi environment dan sign-off, bukan temuan UI P1/P2 lokal.
