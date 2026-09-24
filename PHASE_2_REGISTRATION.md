# Phase 2: Fondasi Pendaftaran Calon Santri

> **Arsip.** Dokumen ini dicatat untuk riwayat dan tidak lagi menjadi pegangan kerja. Cara
> menjalankan sistem yang berlaku ada di `RUNBOOK.md` di akar repo.

## Tujuan

Membangun aturan proses pendaftaran yang dapat digunakan bersama oleh form publik, akun calon santri, dan dashboard petugas. Phase ini mengutamakan data dan logika, bukan tampilan baru.

## Yang sudah tersedia

- Kontrak data pendaftaran: calon peserta, wali, jalur program, pendidikan terakhir, kota, dan persetujuan.
- Normalisasi nomor WhatsApp Indonesia menjadi format internasional.
- Validasi data wajib sesuai jalur Kuliah, Ma'had, atau Hamasah Courses.
- Nomor registrasi yang konsisten, misalnya `HI-REG-2026-00018`.
- Status resmi: data dikirim, pemeriksaan berkas, perbaikan, persiapan akademik, siap keberangkatan, selesai, dan dibatalkan.
- Aturan perubahan status berbasis peran calon pendaftar, petugas pendaftaran, dan admin.
- Riwayat perubahan status yang tidak mengubah data sebelumnya.
- Service pendaftaran yang menyiapkan respons aman untuk calon pendaftar: nomor registrasi, progres, status, ringkasan berkas, dan riwayat tanpa nomor telepon, nama wali, atau lokasi penyimpanan berkas.
- Metadata berkas dengan validasi jenis berkas dan referensi penyimpanan, siap dihubungkan ke object storage privat.

## Kontrak backend yang akan dihubungkan

| Endpoint | Peran | Hasil |
| --- | --- | --- |
| `POST /api/registrations` | Publik | Membuat data awal, nomor registrasi, dan token akses satu kali |
| `GET /api/registrations/:registrationId` | Calon pendaftar terautentikasi | Melihat status dan daftar kebutuhan berkas dengan Bearer token |
| `PATCH /api/registrations/:registrationId/status` | Petugas atau admin | Mengubah status berdasarkan aturan domain |
| `POST /api/registrations/:registrationId/documents` | Calon pendaftar atau petugas | Menambah metadata berkas tanpa mengekspos berkas ke publik |

## Kriteria selesai sebelum backend produksi

- Database dan penyimpanan dokumen terenkripsi dipilih dan dikonfigurasi.
- Identitas calon pendaftar, wali, dan petugas terlindungi dengan autentikasi serta otorisasi berbasis peran.
- Selesai: nomor urut registrasi dibuat database lewat tabel `document_counters` dengan satu perintah atomik, bukan dihitung dari jumlah baris atau oleh browser. Tahun pada nomor mengikuti zona `Asia/Jakarta`, dan pendaftar baru disimpan dengan `INSERT` biasa sehingga nomor yang bentrok menghasilkan error, bukan menimpa data lama.
- Pengiriman formulir publik terhubung ke API dan memiliki halaman konfirmasi yang tidak membocorkan data pribadi.
- Petugas dapat meminta revisi berkas dengan catatan yang tercatat pada riwayat pendaftaran.
- Selesai: kunci API petugas sudah dihapus. Semua endpoint petugas memakai login akun berbasis role, dan setiap perubahan status mencatat akun pelakunya.

## Cara menguji aturan domain

Jalankan seluruh test dari root proyek. Perintah ini menjalankan semua file `*.test.js`, termasuk aturan domain, service pendaftaran, dan API.

```powershell
npm test
```

Untuk menjalankan satu berkas saja, misalnya saat menelusuri kegagalan:

```powershell
node website/registration-domain.test.js
```
