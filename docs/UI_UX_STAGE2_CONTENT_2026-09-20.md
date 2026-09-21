# Tahap 2 — Konsistensi konten dan status

Tanggal: 2026-09-20

## Perubahan yang diterapkan

- Statistik hero, portal, dan aktivitas santri yang sebelumnya terlihat seperti angka operasional diganti dengan deskripsi kemampuan sistem.
- Klaim `realtime`, `24/7`, `terakreditasi`, `jaminan`, dan verifikasi pembayaran diperhalus menjadi copy yang hanya menyatakan alur yang dapat didukung UI saat ini.
- Nomor telepon, alamat, jam layanan, dan SLA 1×24 jam yang belum dikonfirmasi dihapus dari konten publik. Tautan kontak diarahkan ke formulir konsultasi sampai kanal resmi ditetapkan.
- Kartu biaya memakai label `Estimasi` dan menjelaskan bahwa nominal mengikuti program, periode, dan kesepakatan. Sumber resmi juga menyebut biaya dapat berubah, sehingga angka tidak ditampilkan sebagai tarif final.
- Identitas topbar dan sidebar portal memakai sumber akun yang sama melalui `updateCrmUserBadges`; fallback awalnya juga konsisten.
- Badge angka statis di sidebar dihapus agar tidak dibaca sebagai jumlah item aktif. Nilai dinamis harus berasal dari API sebelum ditampilkan.
- Status artikel `published` ditampilkan sebagai `Terbit`, sedangkan nilai internal API tetap dipertahankan untuk kompatibilitas.

## Konfirmasi manual sebelum publikasi

Tim Hamasah tetap perlu mengisi sumber resmi untuk alamat, telepon/WhatsApp, jam layanan, SLA respons, daftar akreditasi, serta nominal biaya per periode. Setelah data tersebut disetujui, copy netral dapat diganti dengan data yang sudah memiliki pemilik dan tanggal berlaku.

## Validasi

- `npm run test:browser-contract` — lulus, 16 halaman.
- `git diff --check` — lulus; hanya ada peringatan normal konversi akhir baris Git.

---

**Koreksi (21 September 2026, Task R5.1/R5.2):** kutipan `npm run test:browser-contract` ("lulus, 16 halaman") dan `npm run test:uat-roles` di dokumen ini tidak membuktikan apa yang tampaknya dibuktikan. Kontrak lama hanya membaca HTML dengan regex dan memeriksa CSS prototipe di root, tanpa membuka browser. Skrip uat-roles membandingkan array dengan dirinya sendiri dan tidak pernah memakai empat dari tujuh role. Keduanya sudah diganti: pemeriksaan statis kini `npm run test:static-contract`, pembuktian browser `npm run test:browser-contract` (browser sungguhan, 17 halaman x 5 lebar), dan otorisasi per role lewat HTTP `npm run test:role-authorization`. Lihat `docs/REMEDIASI_R5_HASIL_2026-09-21.md`.
