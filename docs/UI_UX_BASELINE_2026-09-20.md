# Baseline visual UI/UX — Tahap 0

Tanggal pemeriksaan: 20 September 2026  
Server: `http://127.0.0.1:4273`  
Status: baseline sebelum perbaikan

## Tujuan

Dokumen ini mengunci kondisi awal sebelum perbaikan UI/UX. Baseline dipakai untuk membandingkan hasil Tahap 1 dan seterusnya. Pada tahap ini tidak ada kode, data, konfigurasi, atau state aplikasi yang diubah.

## Ukuran yang digunakan

| Profil | Viewport |
|---|---:|
| Mobile utama | 390 × 844 |
| Desktop utama | 1440 × 900 |

Ukuran tambahan yang wajib dipakai saat verifikasi setelah implementasi: 360 px, 768 px, 1024 px, zoom 200%, portrait, dan landscape.

## Halaman yang dikunci

| Kelompok | Halaman |
|---|---|
| Publik | `/website/index.html`, `/website/biaya.html`, `/website/kontak.html`, `/website/articles.html`, `/website/article.html?slug=pendampingan-santri-di-kairo`, `/website/cek-status.html` |
| Internal | `/website/portal.html`, `/website/staff.html`, `/website/monitoring.html`, `/website/lms.html`, `/website/operations.html`, `/website/audit.html` |
| Akses akun | `/website/aktivasi.html`, `/website/lupa-password.html`, `/website/reset-password.html` |
| Fallback | `/website/404.html` |

Landing page `/` mengarah ke tampilan yang sama dengan `index.html` pada server lokal ini.

## Baseline terukur

Angka `scrollWidth` yang lebih kecil dari viewport pada halaman publik terjadi karena scrollbar vertikal browser. Anomali dicatat hanya bila dokumen lebih lebar dari viewport.

| Halaman | Mobile tinggi dokumen | Mobile menu | Mobile overflow | Desktop tinggi dokumen |
|---|---:|---:|---|---:|
| index | 18.363 px | ada | tidak terkonfirmasi | 9.643 px |
| biaya | 8.356 px | tidak ada | tidak terkonfirmasi | 3.909 px |
| kontak | 4.281 px | tidak ada | tidak terkonfirmasi | 2.131 px |
| articles | 2.413 px | tidak ada | tidak terkonfirmasi | 1.449 px |
| article | 2.660 px | tidak ada | tidak terkonfirmasi | 1.690 px |
| cek-status | 4.146 px | tidak ada | tidak terkonfirmasi | 2.432 px |
| portal | 2.931 px | — | **403 px > 390 px** | 1.120 px |
| staff | 3.969 px | — | tidak terkonfirmasi | 1.923 px |
| monitoring | 1.459 px | — | tidak terkonfirmasi | 900 px |
| lms | 1.475 px | — | tidak terkonfirmasi | 900 px |
| operations | 1.892 px | — | tidak terkonfirmasi | 948 px |
| audit | 6.461 px | — | **443 px > 390 px** | 2.855 px |
| aktivasi | 844 px | — | tidak terkonfirmasi | 900 px |
| lupa-password | 844 px | — | tidak terkonfirmasi | 900 px |
| reset-password | 844 px | — | tidak terkonfirmasi | 900 px |
| 404 | 844 px | — | tidak terkonfirmasi | 900 px |

Catatan: halaman internal menggunakan sidebar, bukan menu publik. Pada mobile kondisi awal sidebar masih terbuka dan menghabiskan area layar sebelum konten utama.

## Temuan baseline yang dapat diverifikasi ulang

1. Header mobile hanya memiliki tombol Menu pada landing page. Biaya, kontak, katalog artikel, detail artikel, dan cek status tidak menampilkan toggle navigasi yang setara.
2. Portal memiliki `scrollWidth` 403 px pada viewport 390 px; audit memiliki 443 px. Keduanya menunjukkan overflow horizontal dokumen.
3. Portal menampilkan `Tester Hamasah` pada topbar dan `Admin Dev` pada kartu profil sidebar.
4. Teks empty state portal “Program akan muncul setelah maddah dan materi dipublikasikan oleh pembina.” menggunakan warna computed `rgb(214, 207, 190)` dengan ukuran 13 px, sehingga tampak terlalu pucat pada permukaan terang.
5. Cek status menampilkan tombol `Contoh Data` dan CTA utama membungkus pada mobile.
6. Internal staff, monitoring, LMS, operations, dan audit menampilkan tombol refresh bergaya native yang berbeda dari sistem tombol lain.
7. Landing page memiliki badge kredibilitas di area gambar hero yang terpotong oleh frame lengkung.
8. CMS staff diamati dengan status editorial awal `Terbitkan`; daftar editorial mencampur status `published` dengan copy Bahasa Indonesia.
9. Submit kosong pada form pendaftaran berhasil menampilkan error inline dan fokus ke field bermasalah. Ini dicatat sebagai perilaku yang perlu dipertahankan.

## Capture visual yang ditinjau

Capture viewport berikut ditinjau selama sesi baseline:

- Landing page desktop 1440 × 900.
- Landing page mobile 390 × 844.
- Portal desktop 1440 × 900.
- Portal mobile 390 × 844.

Screenshot tidak disimpan sebagai asset repository pada tahap ini; kondisi dan ukuran dicatat di dokumen agar baseline tidak bergantung pada file sementara browser.

## Aturan pembanding setelah perbaikan

- Tidak boleh ada overflow dokumen pada ukuran 360–1440 px. Scroll horizontal hanya boleh berada pada komponen tab yang memang memerlukannya.
- Semua halaman publik harus memiliki navigasi mobile yang bisa dibuka, ditutup dengan Escape, dan dipakai dengan keyboard.
- Identitas akun di topbar dan sidebar harus sama.
- Teks sekunder, placeholder, badge, dan empty state harus memiliki kontras yang dapat dibaca; target normal text minimal 4.5:1.
- Tombol dan field harus memiliki tinggi praktis minimal 44 px serta tidak memotong teks ketika label membungkus.
- Setiap perubahan bersama harus diverifikasi kembali pada 16 halaman, bukan hanya halaman tempat CSS pertama diubah.
- State kosong, loading, error, sukses, data panjang, dan daftar 0/1/banyak harus dibandingkan ulang sebelum baseline dianggap tergantikan.

## Status Tahap 0

Baseline desktop/mobile sudah dikunci secara terukur dan temuan utama sudah dicatat. Tahap berikutnya adalah Tahap 1: token warna/kontras, tipografi, spacing, dan komponen kontrol bersama.
