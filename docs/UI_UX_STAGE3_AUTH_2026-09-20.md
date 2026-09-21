# Tahap 3 — Auth dan pendaftaran

Tanggal: 2026-09-20

## Perubahan

- Halaman aktivasi dan reset kata sandi memakai state tautan terpisah: memeriksa, valid, tidak valid, kedaluwarsa, sudah digunakan, dan berhasil.
- Tautan invalid/expired/used menyembunyikan form kata sandi dan menampilkan CTA `Minta tautan baru`.
- Kolom kata sandi memiliki tombol tampilkan/sembunyikan.
- Error reset email dan Kode Akses ditempatkan dekat field yang bermasalah, dengan `aria-invalid`.
- Cek status menggunakan istilah `Kode Akses` secara konsisten dan tidak lagi memiliki tombol `Contoh Data`.
- Lookup memiliki state loading/sukses/error serta CTA recovery.
- Field recovery email memakai tinggi, border, focus ring, dan jarak yang sama dengan field cek status.
- Form pendaftaran publik dikelompokkan menjadi Data calon, Pendidikan dan program, Data wali, serta Persetujuan.
- Backend auth mengembalikan kode publik `TOKEN_INVALID`, `TOKEN_EXPIRED`, dan `TOKEN_USED` tanpa membocorkan token.

## Validasi

- `node --test server/identity-service.test.js` — lulus.
- `npm run test:browser-contract` — lulus, 16 halaman.
- `git diff --check` — lulus; peringatan yang muncul hanya konversi akhir baris Git.

---

**Koreksi (21 September 2026, Task R5.1/R5.2):** kutipan `npm run test:browser-contract` ("lulus, 16 halaman") dan `npm run test:uat-roles` di dokumen ini tidak membuktikan apa yang tampaknya dibuktikan. Kontrak lama hanya membaca HTML dengan regex dan memeriksa CSS prototipe di root, tanpa membuka browser. Skrip uat-roles membandingkan array dengan dirinya sendiri dan tidak pernah memakai empat dari tujuh role. Keduanya sudah diganti: pemeriksaan statis kini `npm run test:static-contract`, pembuktian browser `npm run test:browser-contract` (browser sungguhan, 17 halaman x 5 lebar), dan otorisasi per role lewat HTTP `npm run test:role-authorization`. Lihat `docs/REMEDIASI_R5_HASIL_2026-09-21.md`.
