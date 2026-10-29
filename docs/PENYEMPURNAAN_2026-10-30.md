# Penyempurnaan setelah audit, 30 Oktober 2026 (catatan developer)

Lanjutan `docs/AUDIT_ULANG_2026-10-25.md`. Isinya: apa yang digabung, ditambah, dan diperbaiki setelah audit repo
dan audit situs live hamasah.vercel.app pada 30 Oktober. Item 14–23 (LMS per program, galeri, pengumuman terarah,
asisten, PWA, menu berkelompok) sudah ada di riwayat commit `ac1b487`..`e06b112`.

## Ringkasan

| Pemeriksaan | Hasil |
|---|---|
| Suite tes penuh (`npm test`) | 395 dari 395 lulus |
| Database production | Migrasi 054–079 sudah diterapkan dan tercatat (dicek lewat `schema_migrations`) |
| Migrasi baru di rilis ini | 080 (pengumuman musyrif), 081 (pemilik, sumber dana, foto pemeriksaan inventaris) |
| Situs live sebelum rilis ini | 21 halaman staf dan 18 halaman publik tanpa satu pun API gagal |

Setelah rilis ini di-deploy: buka Pengaturan, lalu Pembaruan database, dan terapkan 080 dan 081. Kalau lewat SQL
Editor Supabase, buat SQL gabungannya dengan `node .claude/checks/supabase-bundle.cjs 080 <berkas>`.

## Digabung (satu sumber, satu aturan)

- **Paspor dan iqamah.** Tanggalnya dicatat di satu tempat, Keuangan > Visa & Paspor (`visa_tracking`). Kartu di
  sana, dasbor admin (`admin-overview-service.js`), Monitoring Pusat, dan profil santri sekarang memakai batas
  peringatan yang sama dari Pengaturan (`document-settings-service.js`). Sebelumnya Visa & Paspor memakai 30 hari
  tetap dan dasbor admin memakai angka sendiri, sehingga paspor sisa 141 hari tertulis "Aman" di satu halaman dan
  "hampir kedaluwarsa" di halaman lain. Butir paspor dan iqamah di Monitoring Pusat punya tombol "Ubah tanggal di
  Visa & Paspor" yang membuka formulir berisi data santri itu.
- **Tanggal operasional asrama.** "Hari ini" untuk presensi asrama, tugas musyrif, dan "Absensi hari ini" di
  Monitoring Pusat mengikuti tanggal Kairo. Sebelumnya halaman Presensi memakai tanggal WIB, jadi Isya pukul 20.00
  Kairo tercatat di hari berikutnya dan tidak muncul di absensi hari ini. Keuangan, tagihan, dan tenggat dokumen
  tetap memakai tanggal Jakarta.
- **Kartu iqamah.** Bila paspor kurang dari batas minimal, status utama kartu menjadi "Perpanjang paspor", bukan
  "Masih aman".

## Ditambah

- **Pengumuman untuk musyrif** (migrasi 080). Admin memilih penerima "Musyrif" di tab Pengumuman, untuk semua
  asrama atau satu asrama. Tampil di kartu Tugas hari ini milik musyrif dengan tombol "Sudah dibaca"; admin melihat
  siapa yang sudah membaca. Santri dan wali tidak pernah melihatnya, dan tidak ada email ke wali.
- **Inventaris** (migrasi 081): sumber dana per aset; pemilik (aset asrama atau barang pribadi santri, dengan nama
  santrinya). Barang pribadi tidak dihitung sebagai nilai aset asrama. Menyelesaikan pemeriksaan bulanan wajib
  melampirkan foto bukti.
- **Kontak**: tautan "Buka lokasi di Google Maps" di bawah alamat kedua kantor, dibuat dari alamat yang diatur di
  Konten Website. Email sudah bisa diisi di Konten Website dan tampil otomatis bila diisi.
- **Batas pemakaian AI** disimpan di database (`rate_limit_hits`), jadi berlaku sama di semua instance Vercel.

## Diperbaiki

- Pencatatan transaksi pembayaran menolak tanggal hari ini antara pukul 00.00 dan 07.00 WIB (perbandingan UTC).
- Gerbang PIN mengembalikan pengunjung ke `/?__path=` karena parameter rewrite Vercel tidak dibuang.
- Kontras `.ananda-stat__note` di dasbor wali (3,4:1 menjadi sekitar 5,3:1); `/cek-status` tidak lagi punya dua `h1`.
- Anggaran gambar: folder presentasi (`assets/pitch`, `assets/internal`, `assets/qohiroh`) dianggarkan terpisah,
  6 MB per folder; situs utama tetap 5 MB dan batas 230 KB per berkas tetap berlaku untuk semua.

## Masih menunggu keputusan pemilik

- Data kontak resmi (D11): email lembaga, dan nomor WhatsApp yang dipakai. Diisi di Konten Website.
- Data asli: production baru berisi 2 santri aktif dan 1 asrama (target sekitar 108 santri, 9 asrama).
- PIN pratinjau 0001 masih aktif; isi `SITE_PIN=off` di Vercel saat siap rilis publik.
- Pekerjaan teknis yang lebih besar: satu endpoint ringkasan untuk dasbor wali, JS dan CSS per peran, beranda HP
  yang lebih ringkas.
