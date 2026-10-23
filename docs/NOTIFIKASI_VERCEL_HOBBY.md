# Pengiriman email pada Vercel Hobby

Email baru tetap disimpan di outbox terenkripsi. Adaptor Vercel menggunakan `@vercel/functions` waitUntil setelah respons API selesai untuk mengirim antrean tanpa menunda respons reset/pendaftaran. Worker mengklaim satu pesan setiap langkah dan berhenti sebelum budget 20 detik habis; pesan yang belum diklaim tetap siap diproses. Maintenance harian tetap menjadi cadangan.

Retry ketika website tidak menerima kunjungan membutuhkan scheduler. Repo menyediakan `.github/workflows/notification-retry.yml`, dijadwalkan setiap lima menit dan dapat dijalankan manual. GitHub dapat menunda jadwal sehingga ini bukan jaminan tepat lima menit. Tidak diperlukan peningkatan paket Vercel.

Aktivasi setelah perubahan dipush ke default branch:

1. Pastikan email provider produksi aktif dan `APP_BASE_URL` benar di Vercel.
2. Gunakan kunci acak minimal 32 karakter untuk `MAINTENANCE_KEY` di Vercel. Bila sudah menggunakan `CRON_SECRET`, secret workflow harus sama dengan nilai yang dipilih server (MAINTENANCE_KEY didahulukan). Jangan tulis nilainya ke file/repo.
3. Di GitHub repository Settings → Secrets and variables → Actions, buat variable `HAMASAH_APP_BASE_URL` berisi origin HTTPS website, dan secret `HAMASAH_MAINTENANCE_KEY` berisi kunci yang sama.
4. Aktifkan workflow dan jalankan manual. Pastikan job berhasil dan outbox beralih ke sent dengan satu email uji milik operator.
5. Pantau antrean failed/dead dan waktu tunggu. Untuk kebutuhan delivery dengan SLA ketat, gunakan worker terus berjalan atau scheduler/queue khusus.

Endpoint `POST /api/tasks/notifications` memerlukan bearer kunci penjadwal, tidak menerima penerima/payload dari pemanggil, dan hanya memproses antrean yang sudah disimpan. Kunci tidak ditulis ke output workflow. Scheduler tidak dapat dinyatakan aktif hanya karena file workflow sudah dibuat: repository variable/secret dan eksekusi hosting perlu diverifikasi oleh pemilik.

Referensi: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package dan https://vercel.com/docs/cron-jobs/usage-and-pricing.
