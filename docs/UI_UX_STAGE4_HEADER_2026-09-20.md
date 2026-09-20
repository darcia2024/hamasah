# Tahap 4 — Header dan navigasi publik

Tanggal: 2026-09-20

## Perubahan

- Header publik sekarang memakai `public-header.js` bersama di beranda, biaya, kontak, daftar artikel, detail artikel, dan cek status.
- Semua halaman tersebut memiliki tombol menu mobile dengan label aksesibel, `aria-expanded`, dan `aria-controls`.
- Link halaman aktif diberi `aria-current="page"`; detail artikel mengikuti menu Pena Hamasah.
- Menu bisa dibuka melalui tombol keyboard/native button, memindahkan fokus ke link pertama, ditutup lewat klik link, klik luar, atau Escape.
- Escape mengembalikan fokus ke tombol menu.
- Anchor section diberi `scroll-margin-top` agar tidak tertutup sticky header.

## Verifikasi browser

Lima halaman wajib (`biaya`, `kontak`, `articles`, `article`, `cek-status`) masing-masing memiliki satu tombol menu, satu navigasi `#site-nav`, script header bersama, dan halaman aktif yang benar. Pada viewport 390×844, menu terbuka, fokus berpindah ke link pertama, lalu Escape menutup menu dan mengembalikan fokus ke tombol.

## Validasi otomatis

- `npm run test:browser-contract` — lulus, 16 halaman.
- `node --check website/public-header.js` — lulus.
- `git diff --check` — lulus; peringatan yang muncul hanya konversi akhir baris Git.
