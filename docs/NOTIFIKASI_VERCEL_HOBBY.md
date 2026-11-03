# Kanal saat ini: WhatsApp manual

Sejak perubahan komunikasi 23 Oktober 2026, kanal bawaan adalah `whatsapp-manual`.
Panduan scheduler email di bawah hanya untuk mode email lama; tidak diperlukan untuk
presentasi atau pengiriman WhatsApp manual. Lihat [KOMUNIKASI_WHATSAPP_MANUAL.md](KOMUNIKASI_WHATSAPP_MANUAL.md).

# Pengiriman email pada Vercel Hobby

Email baru tetap disimpan di outbox terenkripsi. Adaptor Vercel menggunakan `@vercel/functions` waitUntil setelah respons API selesai untuk mengirim antrean tanpa menunda respons reset/pendaftaran. Worker mengklaim satu pesan setiap langkah dan berhenti sebelum budget 20 detik habis; pesan yang belum diklaim tetap siap diproses. Maintenance harian tetap menjadi cadangan.

Workflow GitHub untuk retry tiap lima menit sudah dihapus (3 November 2026) karena kanal yang dipakai WhatsApp manual dan workflow itu gagal terus. Bila mode email diaktifkan lagi, retry saat website tidak menerima kunjungan membutuhkan scheduler baru yang memanggil endpoint di bawah. Sebelum itu, antrean hanya diproses saat ada permintaan API dan oleh maintenance harian.

Endpoint `POST /api/tasks/notifications` memerlukan bearer kunci penjadwal (`MAINTENANCE_KEY` atau `CRON_SECRET`, minimal 32 karakter), tidak menerima penerima/payload dari pemanggil, dan hanya memproses antrean yang sudah disimpan.

Referensi: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package dan https://vercel.com/docs/cron-jobs/usage-and-pricing.
