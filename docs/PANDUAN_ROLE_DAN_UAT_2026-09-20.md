# Panduan role dan lembar UAT

Dokumen ini dipakai saat onboarding petugas dan penandatanganan UAT. Data UAT harus memakai akun dan data uji, bukan data produksi.

## Panduan singkat per role

| Role | Tugas utama | Pemeriksaan akses |
|---|---|---|
| Admin | Akun, seluruh course, operasional, audit, dan konfigurasi | Tidak boleh membagikan bootstrap key; semua perubahan penting diaudit |
| Petugas pendaftaran | Review pendaftar, dokumen, revisi, dan konversi | Tidak dapat membaca fungsi admin/LMS yang tidak ditugaskan |
| Guru/Pembina | Course miliknya, materi, tugas, kuis, dan review | Tidak dapat mengubah course milik guru lain |
| Pengawas/Musyrif | Monitoring santri yang ditugaskan dan evaluasi | Tidak dapat melihat keluarga/asrama di luar penugasan |
| Wali | Dashboard anak yang terhubung, kegiatan, capaian, dan dokumen | Wali lain harus menerima 403 dan tidak boleh mendapat metadata anak |
| Santri | Profil sendiri, LMS yang di-enroll, submission, dan study-help | Tanpa enrollment atau mencoba ID santri lain harus ditolak |

## Checklist UAT yang ditandatangani

- [ ] Login, logout, aktivasi, reset, dan sesi kedaluwarsa.
- [ ] Pendaftaran publik, validasi, upload/download dokumen, revisi, dan status.
- [ ] Review petugas dan konversi pendaftar ke akun santri/wali.
- [ ] Artikel publik, FAQ, navigasi keyboard, mobile sempit, 404, dan metadata.
- [ ] Dashboard wali dengan sibling, periode, presensi, achievement, dan isolasi akun.
- [ ] LMS: course → enrollment → materi → kuis/tugas → review → completion.
- [ ] Operasional: invoice, kuitansi, visa, inventaris, import preview/commit/rollback.
- [ ] Notifikasi, retry worker, storage privat, dan fallback provider.
- [ ] AI: jawaban berbasis materi, fallback, quota, prompt injection, dan handoff FAQ.
- [ ] Health/readiness, backup/restore rehearsal, rollback, dan monitoring alert.

## Bukti wajib per flow

Catat tanggal, environment, akun uji, langkah, expected/actual, screenshot atau response ID, dan hasil. Temuan P1/P2 harus punya owner dan keputusan sebelum launch.

**Persetujuan pemilik proses**

- Nama pemilik proses: ____________________
- Environment dan revision: ____________________
- Tanggal UAT: ____________________
- Known limitations yang diterima: ____________________
- Keputusan: [ ] diterima untuk staging  [ ] diterima untuk production  [ ] ditunda
- Tanda tangan/catatan: ____________________
