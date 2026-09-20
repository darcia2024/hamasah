# Operasional dan export laporan

Konsol operasional memakai API terproteksi role. Export tidak menggantikan audit database; file hasil export harus diperlakukan sebagai salinan data dan mengikuti retensi Hamasah.

## Export yang tersedia

- `GET /api/students/:id/report?from=YYYY-MM-DD&to=YYYY-MM-DD` — CSV rekam jejak santri sesuai akses wali/pengawas.
- `GET /api/operations/report.csv` — CSV invoice, visa, dan inventaris untuk admin/finance/operations.
- `GET /api/operations/imports` — histori batch import dengan filter status/entity dan pagination.
- `GET /api/audit` — log audit untuk admin sesuai periode/filter.

## Prosedur petugas

1. Login memakai akun sesuai tugas; jangan memakai akun bersama.
2. Pilih periode sebelum export agar ukuran dan cakupan data terkendali.
3. Simpan file pada folder terenkripsi dengan nama yang mencantumkan tanggal dan environment.
4. Cocokkan jumlah baris dengan ringkasan UI dan catat request ID/tanggal export.
5. Hapus salinan setelah periode retensi, kecuali telah ditetapkan sebagai dokumen resmi.

## Kegagalan export

Jika API gagal, jangan membuat CSV dari data cache atau fixture. Periksa `/api/ready`, ulangi dengan periode lebih kecil, dan catat insiden. Akses wali ke laporan anak lain harus selalu menghasilkan 403.
