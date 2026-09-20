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
