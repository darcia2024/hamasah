# Daftar akhir pekerjaan manual dan keputusan bisnis

Dokumen ini adalah daftar akhir yang dikumpulkan dari Tahap 0 sampai Tahap 4. Pekerjaan kode tetap dilanjutkan dengan adapter lokal/test selama item di bawah belum tersedia.

## Keputusan yang harus dibuat pemilik Hamasah

- Sahkan nama program, syarat usia, dokumen, alur seleksi, dan status minimum sebelum pendaftar dikonversi menjadi santri.
- Sahkan nominal biaya, paket asrama/non-asrama, biaya bulanan, tahapan pembayaran, refund, rekening tujuan, dan tanggal berlaku.
- Sahkan alur mediator keberangkatan: pihak yang bertanggung jawab untuk verifikasi Al-Azhar/Markaz, Tahdid Mustawa, visa, Kemenag, Kedutaan, tiket, penjemputan, dan daftar ulang.
- Sahkan nomor WhatsApp, alamat kantor, jam layanan, kontak darurat, domain resmi, dan nama pengirim email.
- Sahkan siapa yang boleh melihat catatan wali, pelanggaran, kehadiran, laporan santri, dan media kegiatan.
- Sahkan consent foto/video, masa simpan dokumen pendaftaran, masa simpan audit, dan prosedur penghapusan.
- Putuskan provider email, storage, AI, dan media; tetapkan anggaran, wilayah data, batas penggunaan, serta fallback.
- Tunjuk pemilik konten dan penanggung jawab insiden/rollback saat launch.

## Tindakan manual yang harus dilakukan user/admin

1. **Rahasia dan akses:** ganti credential yang pernah dibagikan, isi env privat melalui secret manager, cabut akses lama, dan pastikan nilai rahasia tidak masuk Git atau log.
2. **Email:** pilih provider/domain pengirim, buat API key terbatas, pasang DNS provider, tunggu verifikasi, isi env, lalu uji aktivasi, reset password, recovery pendaftaran, expiry, dan retry.
3. **Database:** buat staging terpisah, batasi akses, backup database, jalankan restore rehearsal, terapkan migrasi staging, lalu ulangi runbook pada production setelah disetujui.
4. **Storage:** buat bucket privat `hamasah-private-documents`, pasang env bucket/provider, uji upload/download sebagai pendaftar dan akun lain, lalu uji signed URL kedaluwarsa.
5. **Konten:** isi atau revisi artikel dari CMS, simpan konten yang belum disahkan sebagai draft, dan publikasikan hanya setelah pemilik menyetujui copy program, biaya, kontak, dan kebijakan.
6. **Domain/deployment:** atur DNS dan HTTPS, isi `APP_BASE_URL`, cek link email di domain akhir, jalankan smoke test dan browser UAT di domain tersebut.
7. **Launch:** pastikan monitoring, alert, backup, rollback, worker notifikasi, pemilik respons insiden, dan keputusan buka akses publik sudah disetujui.

## Bukti wajib sebelum production

- `npm test` hijau.
- Migrasi berhasil dari database staging versi sebelumnya dan database kosong.
- Backup dapat dipulihkan.
- UAT publik: mobile, keyboard, form valid/invalid, jaringan gagal, artikel draft/publish/archive, 404, pendaftaran, upload, recovery, dan otorisasi negatif.
- Email, storage, domain, monitoring, dan worker diuji pada URL deployment sebenarnya.
- Persetujuan tertulis untuk konten, biaya, consent, retensi, dan pembukaan akses publik.
