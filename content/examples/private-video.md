# Video privat LMS

Materi baru di studio menggunakan berkas MP4 (H.264 disarankan) atau WebM, maksimal 100 MB. Unggah lewat **Kelola maddah → Tambah materi → Video privat**, tambahkan bacaan dan modul PDF opsional, lalu simpan. Materi YouTube lama tetap dapat dibaca; mengunggah video pada materi tersebut mengganti sumbernya tanpa menghapus modul PDF.

Video berada di bucket privat. Unggahan memerlukan admin atau guru pemilik kelas. Referensi berkas pada materi harus siap, bertujuan `course-video`, dan berasal dari kelas yang sama. Santri harus terdaftar di kelas; admin dan guru pemilik kelas dapat melihat pratinjau.

Pemutar meminta sesi melalui POST yang diautentikasi. Sesi video menggunakan cookie HttpOnly, SameSite=Strict, host-only, terbatas pada jalur video; Secure digunakan pada HTTPS. URL pemutar tidak memuat token. Setiap permintaan rentang memeriksa kembali sesi dan hak kelas. Logout/pencabutan sesi membuat permintaan berikutnya ditolak. Cookie tidak memberikan akses di luar hak akun asal.

Byte video diproksikan melalui origin aplikasi, bukan melalui URL storage bertanda tangan yang dapat dibagikan. Respons memiliki `Cache-Control: private, no-store` dan dibatasi maksimal 1 MB per rentang. Driver Supabase harus mendukung respons Range 206 yang tepat; driver lokal memakai stream disk. Tidak ada endpoint unduhan generik untuk video privat. Bucket Supabase harus tetap privat, bukan public.

Kontrol: putar/jeda, seek, volume, fullscreen bawaan browser; tombol mundur/maju 10 detik; kecepatan 0.5–2×; picture-in-picture ketika didukung. Resolusi mengikuti berkas sumber; transcoding adaptif, DRM, dan subtitle unggahan belum disediakan. Ini pembatasan akses akun, bukan jaminan anti-rekam atau anti-ekstraksi oleh pengguna yang sah. Menyembunyikan tombol download bukan kontrol keamanan.

Video YouTube pihak lain tidak disalin atau diunduh. Untuk memigrasikan kelas contoh, pengajar perlu menyediakan rekaman yang dimiliki atau diizinkan untuk digunakan. Video uji otomatis berdurasi empat detik dibuat sendiri dan hanya digunakan untuk memverifikasi pemutar.

Untuk pratinjau lokal yang bisa dicoba melalui akun santri, jalankan `node scripts/build-private-video-demo.js` lalu `node scripts/seed-private-video-demo.js`. Script pertama menghasilkan video visual orisinal 30 detik tanpa audio di folder data lokal yang diabaikan Git; script kedua membuat kelas **Contoh Pemutar Video Privat** pada localhost saja. Tidak ada rekaman pelajaran lama yang ditimpa. Akses sesi pemutaran dicatat pada audit berkas.

## Format bacaan

Editor mendukung `# Judul 1`, `## Judul 2`, `### Judul 3`, daftar dengan `-`, daftar bernomor, `**tebal**`, dan kutipan `>`. HTML diperlakukan sebagai teks biasa. Contoh Arab dipisahkan otomatis dan diberi arah RTL. Pratinjau menggunakan renderer yang sama dengan ruang belajar santri.
