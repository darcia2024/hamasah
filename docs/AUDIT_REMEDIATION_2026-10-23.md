# Perbaikan audit, 23 Oktober 2026

## Status

Kelima kelompok perbaikan yang diminta telah diimplementasikan. Suite akhir `node --test --test-concurrency=2` lulus **185/185**, tanpa skip. Pemeriksaan schema, versi aset, dan diff juga dijalankan. Browser otomatis pada 1440 dan 390 px membuktikan navigasi Visa/Inventaris tetap berfungsi ketika API inventaris sengaja gagal, lalu tombol coba lagi memulihkan panel, tanpa overflow horizontal.

Ini hasil pengujian regresi implementasi pada fixture dummy/PGlite dan browser lokal, bukan sertifikasi keamanan menyeluruh atau bukti konfigurasi produksi.

## Akses dan siklus hidup akun

- Koreksi catatan mengikat studentId dan recordId pada pemeriksaan serta query transaksi store.
- Review tugas memeriksa pengelola kelas submission sebelum perubahan/penambahan completion.
- Aksi completion, kuis, dan tugas hanya dilakukan identitas santri yang terhubung; preview staf tetap tersedia.
- Unggah PDF memeriksa kepemilikan kelas seperti video; ID kelas cacat ditolak sebelum query UUID.
- Akun memiliki lifecycle pending/active/blocked. Undangan hanya untuk pending; pemblokiran membersihkan token dan sesi.
- Perubahan email/peran membatalkan token pemulihan/undangan dan sesi.
- Narrow CAS patches/version mencegah snapshot lama menimpa role/active/password yang lebih baru; konversi pendaftar mengikuti lifecycle yang sama.

## Pemulihan dan notifikasi

- Respons pendaftaran baru menggunakan sesi pendaftar yang berumur terbatas dan dapat dicabut. Fallback bearer awal persisten dihapus.
- Pemulihan pendaftar menyiapkan payload email terenkripsi, mengganti hash kode, mencabut sesi lama, dan memasukkan outbox dalam satu transaksi. Kegagalan persiapan/commit mempertahankan kode lama.
- Login diserialisasi dengan recovery pada row registration; kode yang diverifikasi sebelum recovery tidak dapat membuat sesi baru setelah pencabutan.
- Adaptor Vercel memakai waitUntil untuk mengirim outbox setelah respons API. Batch berbudget mengklaim satu pesan setiap langkah, bukan mengklaim 50 pesan lalu terputus.
- Worker CLI memakai template tersimpan dan tidak menumpuk batch interval yang belum selesai.
- Retry berkala saat website sepi disediakan melalui endpoint berkunci dan workflow GitHub Actions. **Belum aktif di produksi:** repository variable/secret dan deployment perlu disiapkan, lihat [NOTIFIKASI_VERCEL_HOBBY.md](NOTIFIKASI_VERCEL_HOBBY.md). Jadwal Actions dapat tertunda; tidak ada klaim SLA lima menit.

## Pembayaran dan kelas

- Retry invoice paid mengisi detail pembayaran yang tertinggal dan kembali merekonsiliasi enrollment, tanpa mengirim ulang notifikasi pembayaran.
- Pembelian diserialisasi per santri; invoice, counter, dan pesanan dibuat dalam satu transaksi.
- Admin/finance memiliki endpoint dan tombol **Periksa akses kelas** untuk invoice paid tanpa enrollment.
- Status dan tombol mulai belajar pada toko kelas mengikuti enrollment nyata; paid saja tidak disebut aktif.

## Data operasional

- Jalur simpan aset tidak bisa mengganti jumlah aset lama; semua perubahan stok memakai mutasi.
- Saldo awal, signed delta, jumlah sebelum dan sesudah dicatat. Riwayat lama yang tidak memiliki informasi saldo tidak direkayasa.
- Persetujuan izin dan presensi satu transaksi; sesi berbeda ditolak, sesi kompatibel dapat dipakai kembali.
- Rentang dashboard menggunakan hari kalender Jakarta, sama dengan kebijakan tanggal sesi presensi.
- Ringkasan tugas kesehatan memilih kondisi terbaru sebelum menyaring kondisi yang membutuhkan perhatian.
- Filter/status tindak lanjut diterapkan sebelum limit; total dan paging tersedia serta digunakan frontend, dengan pemeriksaan lingkup asrama.

## Penanganan error dan CMS

- Navigasi operasional dipasang sebelum fetch; error dan retry tampil per panel.
- Receipt pendaftaran tetap muncul ketika storage browser/pop-up gagal; opsi validasi profil frontend/server sama dan field error dipetakan.
- Cek status mempertahankan credential saat jaringan/server gagal; menghapusnya hanya saat autentikasi ditolak.
- Artikel membedakan error dari hasil kosong, menjaga pagination/retry, dan mengumumkan filter terpilih.
- /daftar dan artikel server-render menggunakan sumber nomor WhatsApp CMS; headline harga program mengikuti sumber biaya yang sama. Rincian lama yang tidak lagi sesuai headline CMS tidak ditampilkan sebagai angka terkini.

## Migrasi dan rilis

Migrasi baru: `054_identity_lifecycle.sql`, `055_finance_integrity.sql`.

Terapkan migrasi dengan prosedur backup dan jendela rilis yang menghindari dua versi aplikasi melakukan mutasi bersamaan. Jangan mengandalkan tombol pembaruan dari UI yang sudah menjalankan kode baru di schema lama: autentikasi baru memerlukan kolom lifecycle/version. Jalankan migration runner dengan konfigurasi database tujuan yang benar sebelum membuka aplikasi versi baru kepada pengguna. Tidak ada migrasi produksi yang dijalankan dari sesi ini, dan tidak ada commit/push/deploy.

Periksa klasifikasi akun inactive lama saat migrasi: bukti token undangan lama dipakai untuk mengenali pending; riwayat blokir lama perlu ditinjau operator bila token masih tertinggal dari versi sebelumnya.

## Localhost dan data lama

Saat restart aman, database development lama menolak migrasi dengan konflik katalog PGlite (`pg_attribute_relid_attnam_index`); katalog tabel inventory_movements juga tidak konsisten. Tidak dilakukan reset, penghapusan, atau rekonstruksi data aplikasi lama.

Backup lokal: `D:/Project Coding/Hamasah International/.claude/backups/dev-db-before-audit-fixes-20261023`. Percobaan perbaikan indeks hanya pada salinan disposable terpisah dan tidak berhasil; salinan tidak menggantikan database asli.

Agar hasil implementasi bisa diperiksa, localhost:4273 berjalan menggunakan **database preview baru dengan data demo**, bukan database lama:

- Database preview: `D:/Project Coding/Hamasah International/.claude/previews/audit-fixed-db-20261023`
- Launcher: `D:/Project Coding/Hamasah International/.claude/checks/start-audit-fixed-preview.cjs`
- Akun admin preview: `admin@hamasah.test`, memakai kata sandi development yang biasa.
- Database asli `hamasah/data/dev-db` dipertahankan, tetapi pemulihannya belum selesai. `npm run dev` masih menunjuk database lama; jangan reset/hapus folder untuk mengatasi error.

Log pengujian: `D:/Project Coding/Hamasah International/.claude/checks/audit-fixes-final-tests.log`. Bukti browser: `audit-fixes-operations-1440.png`, `audit-fixes-operations-390.png`, dan `audit-fixes-preview.png` di folder checks yang sama.
