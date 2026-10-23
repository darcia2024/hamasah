# Komunikasi WhatsApp manual

Kanal bawaan deployment sekarang `NOTIFICATION_CHANNEL=whatsapp-manual`. Tidak membutuhkan token WhatsApp Business atau layanan email. Pesan disiapkan di sistem; petugas memeriksa penerima lalu membuka WhatsApp dan menekan Kirim sendiri.

## Alur petugas

- Pendaftaran: tombol WhatsApp pada detail memakai status yang telah tersimpan dan catatan berkas yang ditolak.
- Undangan akun: Kelola Akun → Siapkan undangan WhatsApp. Tautan aktivasi pribadi ditampilkan kepada admin, tanpa mengirim email. Akun pending dapat dibuatkan undangan kembali. Petugas pendaftaran hanya dapat menyiapkan undangan santri/wali dari hasil konversi, bukan akun staf atau admin.
- Konversi pendaftar: data santri, akun, dan hubungan wali tetap dibuat dalam transaksi yang sama. Undangan ditampilkan sebagai pesan WhatsApp; tidak dimasukkan ke antrean email.
- Tagihan: tombol Kabari wali lewat WhatsApp menyiapkan informasi tagihan terbaru. Setelah lunas, tombol pelunasan memakai nomor kuitansi yang tersimpan. Menyiapkan pesan tidak menandai tagihan lunas atau mencatat pengingat sebagai terkirim.
- Nomor wali hanya dipilih otomatis bila akun wali aktif terhubung ke santri dan emailnya cocok dengan email wali pada pendaftaran asal. Jika tidak ada pemetaan yang cocok, WhatsApp membuka pemilih kontak; petugas harus memilih pemilik akun yang sesuai. Tidak menebak nomor.
- Monitoring: Kabari wali lewat WhatsApp mengarahkan wali membaca pembaruan di portal, tanpa memasukkan keluhan atau tindakan kesehatan internal ke pesan.
- Lupa kata sandi/Kode Akses: pemohon diarahkan ke nomor admin dari CMS. Respons tidak mengungkap keberadaan akun dan tidak mengubah kredensial. Admin memverifikasi identitas sebelum memproses pemulihan.
- Pemulihan Kode Akses oleh petugas: detail pendaftaran → Siapkan Kode Akses baru lewat WhatsApp. Wajib mengonfirmasi verifikasi pemilik. Penggantian hash kode, pembatalan token lama, dan pencabutan seluruh sesi pendaftar dilakukan satu transaksi. Kode baru hanya dikembalikan kepada petugas yang berhak.
- Pemulihan akun oleh admin: gunakan Kata sandi sementara di Kelola Akun setelah memverifikasi pemilik. Pesan WhatsApp berisi akses sementara, dan pemilik diminta segera menggantinya sendiri.

## Status kirim dan sinkronisasi

Sistem tidak dapat memastikan apakah petugas benar-benar menekan Kirim di WhatsApp. Respons persiapan menyatakan `sent: false`; tidak ada label terkirim otomatis atau bukti pengiriman palsu. Data sumber tetap di database Hamasah dan tidak menunggu WhatsApp berhasil dibuka.

Kanal manual mematikan pengiriman email di aplikasi, perawatan terjadwal, dan kedua worker CLI. Antrean email historis tetap disimpan, tidak dikirim atau dihapus. Scheduler retry email lama menjadi tidak diperlukan; endpoint perawatan tetap boleh berjalan untuk pembersihan sesi/audit.

Tidak ada migrasi baru untuk perubahan kanal ini. Produksi harus sudah memiliki 55 migrasi yang diverifikasi sebelumnya. `APP_BASE_URL` tetap wajib dan nomor admin mengikuti Konten Website.

Mode email lama hanya tersedia bila secara eksplisit memilih `NOTIFICATION_CHANNEL=email`; itu bukan mode presentasi saat ini.

## Batas verifikasi

Pengujian menggunakan data dummy dan pengirim tiruan: kontrol akses, isolasi penerima, tidak ada pengiriman email, token/sesi pemulihan, dan tidak adanya perubahan status pembayaran saat pesan disiapkan. Ini bukan klaim bahwa semua kemungkinan kegagalan atau konfigurasi produksi sudah tercakup. Pesan WhatsApp nyata tidak dikirim otomatis selama pengujian.
