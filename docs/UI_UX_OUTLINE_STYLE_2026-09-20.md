# Outline UI pass

Tanggal: 2026-09-20

## Perubahan

- Menghapus em dash dari teks UI dan mengganti fallback kosong dengan copy yang jelas.
- Menghapus karakter emoji dari renderer ikon portal.
- Mengganti badge status, role, kategori, statistik, dan cover metadata menjadi gaya outline dengan border tipis dan tanpa fill dekoratif.
- Mengganti panah dekoratif berbasis karakter dengan ikon outline CSS.
- Mengganti simbol cek dan titik dekoratif pada workspace internal dengan SVG atau lingkaran outline.
- Menjaga ikon fungsional berbasis SVG tetap dapat dibaca screen reader melalui label atau `aria-hidden`.

## Validasi

- Tidak ada em dash atau karakter emoji yang tersisa pada HTML, JavaScript, dan CSS UI.
- `node --check` untuk renderer portal, website, artikel, monitoring, dan navigasi lulus.
- `npm run test:browser-contract` lulus untuk 16 halaman.
- `git diff --check` lulus.
- Screenshot mobile dan desktop ditinjau setelah perubahan.

## Koreksi (Task R4.2, 21 September 2026)

Dokumen ini tidak lagi dapat dibaca sebagai keputusan yang berlaku penuh. Bagian
"Validasi" di atas hanya menyatakan bahwa screenshot ditinjau. Tidak ada satu pun
rasio kontras yang diukur, dan itulah sebabnya regresi berikut lolos.

**Yang salah.** Override `background: transparent !important` diterapkan pada
sebelas selektor tanpa memeriksa apa yang ada di belakang masing-masing. Untuk
elemen di atas foto, latar transparan menghapus scrim gelap yang menjamin
keterbacaan, sementara warna teks krem dipertahankan. Hasil ukur (viewport 375 px):

| Teks | Elemen | Rasio |
|---|---|---:|
| `Pendampingan Belajar Talaqqi` | `.image-badge` | 1,06 : 1 |
| `Ibadah & Talaqqi` | `.card-label` di kartu kegiatan | 1,11 : 1 |
| `Mengikuti tahapan pendaftaran Al-Azhar` | `.hero-floating-badge` | 1,13 : 1 |

Pemeriksaan tambahan menemukan `.pricing-card-badge` ("Program utama") berwarna
putih di atas latar transparan di atas kartu putih, yaitu teks yang tidak terlihat
sama sekali.

**Yang dikoreksi.** Empat selektor dikeluarkan dari gaya outline karena berada di
atas foto atau menempel di tepi kartu, tempat latar transparan berarti teks
bergantung pada foto: `.image-badge`, `.hero-floating-badge`,
`.hero-floating-chip`, dan `.pricing-card-badge`. Keenam yang lain (`.hero-badge`,
`.trust-pill-item`, `.office-badge`, `.level-pill`, `.m3-category-chip`,
`.m3-status-chip`) berada di atas permukaan solid yang dapat diprediksi dan tetap
bergaya outline.

Scrim kartu kegiatan juga diperbaiki secara terpisah: gradiennya dulu mulai dari
alfa 0 padahal label duduk di 32 px pertama, dan judulnya berwarna gelap karena
`.activity-card h3` mengalahkan `.activity-card-content h3` pada spesifisitas yang
sama. Alfa terendah scrim kini 66%, batas terendah yang membuat teks tetap di atas
4,5 : 1 bahkan di atas foto putih polos.

Seluruh `!important` pada override dibuang. Alasan aslinya nyata: aturan dasar
`.trust-pill-item` dan `.office-badge` ditulis setelah blok override sehingga menang
di cascade. Blok dipindah ke akhir berkas, sehingga urutan yang menyelesaikannya,
bukan `!important`. Snapshot style terhitung sebelum dan sesudah dibandingkan pada
empat halaman publik: satu-satunya perbedaan ada pada empat selektor yang sengaja
dikeluarkan, dan enam selektor yang bertahan tidak berubah sama sekali.

**Pelajaran.** Sebuah perubahan visual menyeluruh harus diukur, bukan hanya
ditinjau. `npm run check:contrast` (Task R4.3) ada untuk itu.

---

**Koreksi (21 September 2026, Task R5.1/R5.2):** kutipan `npm run test:browser-contract` ("lulus, 16 halaman") dan `npm run test:uat-roles` di dokumen ini tidak membuktikan apa yang tampaknya dibuktikan. Kontrak lama hanya membaca HTML dengan regex dan memeriksa CSS prototipe di root, tanpa membuka browser. Skrip uat-roles membandingkan array dengan dirinya sendiri dan tidak pernah memakai empat dari tujuh role. Keduanya sudah diganti: pemeriksaan statis kini `npm run test:static-contract`, pembuktian browser `npm run test:browser-contract` (browser sungguhan, 17 halaman x 5 lebar), dan otorisasi per role lewat HTTP `npm run test:role-authorization`. Lihat `docs/REMEDIASI_R5_HASIL_2026-09-21.md`.
