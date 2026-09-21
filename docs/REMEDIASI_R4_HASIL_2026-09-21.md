# Remediasi R4 — Hasil (21 September 2026)

Cabang: `remediasi-r1-render` (lokal, belum di-push). Setiap tugas satu atau lebih commit dengan id tugas di subjek.

## Ringkasan

| Tugas | Isi | Status |
|---|---|---|
| R4.1 | Palet kembali ke emas #E7B10C + charcoal #363638 dari logo; satu hijau (sukses); kontras diperbaiki di komponen | Selesai |
| R4.2 | Blok override di website.css dipindah ke akhir tanpa `!important`; lencana lama dihapus | Selesai |
| R4.3 | Alat ukur kontras `npm run check:contrast` (browser headless + matematika WCAG) | Selesai |
| R4.4 | Status sesi jujur; 401 setelah konsol terbuka menutup konsol dan menampilkan dialog | Selesai |
| R4.5 | Data karangan dan nama lokasi yang ditulis keras dihapus dari portal.js dan HTML | Selesai |
| R4.6 | Pencarian global dihapus (keputusan KR4) | Selesai |
| R4.7 | Tinggi halaman mobile index.html | Sebagian: 19.115 → 16.001 px, target 12.000 tidak tercapai (diterima pengguna) |
| R4.8 | Kartu kegiatan tanpa foto mendapat perlakuan visual (`.activity-card--gold`) | Selesai |

## Bukti kontras

- Sebelum R4 (`docs/KONTRAS_BASELINE_SEBELUM_R4_2026-09-21.txt`): 11.141 elemen teks, **117 pelanggaran**.
- Sesudah R4: **0 pelanggaran, 0 tinjau manual** pada 17 halaman / 30 skenario (peran admin, wali, santri; tab diklik; 375 dan 1280 px).
- Pemeriksaan akhir setelah R4.6: 6.264 elemen (daftar skenario bawaan), 0 pelanggaran.
- Batas jujur alat: latar foto/gradien dihitung dengan batas terburuk/terbaik; lulus = terjamin, pelanggaran = kasus terbaik pun gagal, sisanya "tinjau manual".

## Token warna

| Token | Nilai | Pemakaian |
|---|---|---|
| primary (isi) | #E7B10C | latar tombol, lencana; teks di atasnya `on-primary` (charcoal) |
| `--gold-dark` | #856000 | teks emas di atas terang |
| `--gold-large` | #A87900 | teks emas ukuran besar saja |
| charcoal | #363638 | teks utama, panel gelap |
| tertiary | satu hijau | sukses; merah hanya untuk peringatan |

Codemod: 391 penggantian mekanis hex Slate/amber → token (warna teks vs isi ditentukan per konteks), lalu 32 aturan teks emas → gold-dark/gold-large dan 10 putih-di-atas-emas → on-primary. Jumlah kurung kurawal diverifikasi tidak berubah. Kesalahan yang ditemukan alat dan diperbaiki: judul hero portal charcoal di atas charcoal (1,18:1) akibat spesifisitas, dan subjudul hero yang menjadi 2,54:1.

## R4.7 — mengapa 12.000 px tidak tercapai

Semua penghematan yang aman (jarak, padding seksi, kartu pintasan ringkas, kartu kegiatan satu kolom, footer 2 kolom) sudah diambil tanpa mengubah ukuran huruf. Sisanya butuh keputusan editorial/UX: karusel (perkiraan hemat 2.000–2.500 px), menggabung bagian program yang berulang, akordeon. Pengguna memilih berhenti di 16.001 px. Tidak ada overflow horizontal pada 360/390/768/1024/1440.

## Temuan terbuka (bukan bagian R4, perlu keputusan)

1. Salinan publik menyebut Hay Asyir / Madinat Nasr / Markaz (12 kemunculan di index, biaya, kontak termasuk blok alamat, cek-status). Menunggu konfirmasi klien (K16); blok alamat bertentangan dengan Stage 2.
2. Gambar hero `loading="lazy"` di atas lipatan (merugikan LCP) dan atribut width/height 900×1050 tidak cocok dengan gambar asli 1200×800.
3. Tombol topbar mati "Pesan Broadcast" dan "Notifikasi Sistem" di `portal.html` (tidak ada fungsinya).
4. Migrasi 017–033 belum diterapkan ke Supabase (tindakan rilis).
5. Teks kebijakan privasi dan nomor WhatsApp resmi menunggu klien.
6. Sesi lain mengerjakan UI akun undangan: kemungkinan konflik merge di `portal.js`.
7. Baris tagihan di operations menampilkan UUID untuk peran keuangan.
8. Alat kontras: 1 langkah data contoh (presensi) gagal karena batas unik ganda; tidak memengaruhi hasil.
9. `npm test` bagian http-performance gagal bila server preview (port 4291) hidup; 58/58 lulus dengan server mati.

## Catatan alat

`npm run check:contrast [--page --viewport --strict --verbose --json --browser]`; kode keluar 0 bersih, 1 ada pelanggaran, 2 galat alat. Transisi dibekukan saat mengukur agar tidak membaca warna di tengah animasi.
