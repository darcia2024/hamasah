# Runbook rilis, backup, restore, dan insiden

> **Arsip.** Dokumen ini dicatat untuk riwayat dan tidak lagi menjadi pegangan kerja. Cara
> menjalankan sistem yang berlaku ada di `RUNBOOK.md` di akar repo.

Dokumen ini menjadi urutan operasional untuk staging dan production. Semua langkah yang menulis database harus dijalankan dari terminal yang diberi label `APP_ENV` dengan koneksi yang sesuai. Jangan menjalankan migrasi production dari laptop yang masih memakai `.env` tanpa pemeriksaan URL.

## Gate sebelum rilis

1. Jalankan `npm run release:check` pada environment target. Untuk staging/prod, pastikan `DATABASE_URL`, `STORAGE_BUCKET`, `APP_BASE_URL`, dan secret deployment sudah terpasang melalui secret manager.
2. Jalankan `npm test -- --test-concurrency=1` dan `npm run check:docker`.
3. Pastikan `npm run verify:database` menyatakan semua migrasi dan RLS siap.
4. Pastikan backup database terbaru memiliki timestamp, lokasi, pemilik akses, dan hasil checksum yang tercatat. Jangan menaruh backup atau secret di Git.
5. Pastikan worker notifikasi memiliki scheduler/restart policy terpisah dari proses web.

## Deploy staging

1. Buat backup sebelum migrasi dan simpan ID backup pada tiket rilis.
2. Set `APP_ENV=staging`, `DATABASE_URL` ke staging, dan `DATABASE_MIGRATION_URL` ke koneksi session/direct.
3. Jalankan `npm run migrate`, lalu `npm run verify:database`.
4. Deploy image yang sudah lolos `check:docker`; cek `/api/health` dan `/api/ready`.
5. Jalankan smoke/UAT: login, pendaftaran, upload/download file privat, artikel, konversi, LMS, dan worker notifikasi.
6. Jika gagal, hentikan promosi, simpan log dan revision ID. Rollback aplikasi ke image sebelumnya; rollback schema hanya memakai migrasi kompensasi yang telah ditinjau.

## Deploy production

1. Dapatkan persetujuan pemilik proses dan pastikan staging gate lulus.
2. Ambil backup database dan verifikasi restore rehearsal terakhir.
3. Jalankan migrasi dengan konfirmasi terminal satu kali: `$env:APP_ENV='production'; $env:ALLOW_PRODUCTION_WRITE='I_UNDERSTAND'; npm run migrate; Remove-Item Env:ALLOW_PRODUCTION_WRITE`.
4. Jalankan `npm run verify:database`, deploy image immutable, lalu cek health/readiness.
5. Jalankan smoke dengan akun uji yang tidak memakai data calon nyata. Hapus data uji sesuai prosedur retensi.
6. Aktifkan domain publik hanya setelah smoke dan monitoring stabil.

## Backup dan restore rehearsal

- Backup database memakai fitur provider PostgreSQL dengan PITR bila tersedia. Simpan retention minimal sesuai kebijakan Hamasah.
- Object storage privat dibackup atau direplikasi dengan versioning; daftar object dan metadata file harus ikut dicatat.
- Restore rehearsal dilakukan ke database dan bucket terpisah. Setelah restore, jalankan migrasi/verify, health/readiness, login uji, daftar artikel, satu pendaftaran uji, download file uji, dan query dashboard.
- Bandingkan jumlah tabel, migrasi, checksum file, relasi akun, dan audit event dengan manifest backup. Catat RTO/RPO aktual; jangan mengklaim berhasil hanya karena koneksi database hidup.

## Insiden dan rollback

1. Tetapkan incident owner, catat waktu mulai, revision, environment, dan dampak.
2. Jika hanya aplikasi bermasalah, rollback image ke revision terakhir yang lulus gate.
3. Jika schema bermasalah, hentikan worker/mutasi, pulihkan dengan backup ke environment pemulihan, dan gunakan migrasi kompensasi yang sudah direview. Jangan menghapus kolom/table secara manual di production.
4. Jika storage/email bermasalah, tampilkan fallback yang aman, hentikan retry tak terbatas, dan simpan job untuk diproses ulang setelah provider pulih.
5. Setelah pulih, jalankan health, readiness, smoke negatif authorization, dan verifikasi audit. Tutup insiden hanya setelah pemilik proses menerima dampaknya.

## Monitoring, retensi, dan rotasi

- Pantau `/api/health`, `/api/ready`, error rate, latency, database pool, storage failure, notification queue age, retry count, dan AI quota/provider failure.
- Alert bila readiness gagal berulang, queue melewati SLA, error rate naik, atau backup/restore job gagal.
- Retensi audit, dokumen, session, dan backup mengikuti keputusan tertulis Hamasah; hapus hanya lewat job terjadwal yang tercatat.
- Rotasi database, storage, email, bootstrap, notification payload, dan AI provider secret melalui secret manager. Cabut secret lama setelah verifikasi deployment baru.
