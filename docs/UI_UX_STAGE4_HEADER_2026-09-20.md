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

---

**Koreksi (21 September 2026, Task R5.1/R5.2):** kutipan `npm run test:browser-contract` ("lulus, 16 halaman") dan `npm run test:uat-roles` di dokumen ini tidak membuktikan apa yang tampaknya dibuktikan. Kontrak lama hanya membaca HTML dengan regex dan memeriksa CSS prototipe di root, tanpa membuka browser. Skrip uat-roles membandingkan array dengan dirinya sendiri dan tidak pernah memakai empat dari tujuh role. Keduanya sudah diganti: pemeriksaan statis kini `npm run test:static-contract`, pembuktian browser `npm run test:browser-contract` (browser sungguhan, 17 halaman x 5 lebar), dan otorisasi per role lewat HTTP `npm run test:role-authorization`. Lihat `docs/REMEDIASI_R5_HASIL_2026-09-21.md`.
