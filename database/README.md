# Database produksi

Schema dibangun dari file migrasi berurutan di folder ini. `001_initial_schema.sql` berisi schema awal seluruh modul (pendaftaran, akun, artikel, monitoring, LMS, invoice, visa, inventaris), dan `002_account_sessions.sql` menambahkan tabel sesi.

## Menjalankan migrasi

```powershell
npm run migrate
```

Runner mencatat setiap migrasi yang sudah diterapkan di tabel `schema_migrations`, sehingga perintah ini aman dijalankan berkali-kali: file yang sudah tercatat dilewati, file baru diterapkan satu per satu di dalam transaksi.

Sebelum membuka koneksi, runner memeriksa `APP_ENV`. Lingkungan kosong ditolak, dan `APP_ENV=production` membutuhkan konfirmasi `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND` yang diketik di terminal. Aturan lengkapnya ada di [PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md#pengaman-skrip-database).

Runner memakai `DATABASE_MIGRATION_URL` jika tersedia, jika tidak memakai `DATABASE_URL`. Untuk Supabase, isi `DATABASE_MIGRATION_URL` dengan koneksi session (port 5432) atau koneksi langsung, bukan pooler mode transaksi (port 6543).

## Database yang sudah ada sebelum runner (baseline)

Database yang schema-nya dulu diterapkan manual belum punya catatan migrasi. Runner akan berhenti dan meminta:

```powershell
npm run migrate -- --baseline
```

Mode ini **mencatat** migrasi yang seluruh tabelnya sudah ada, **tanpa menjalankan SQL-nya**. Kalau hanya sebagian tabel sebuah migrasi yang ada, runner berhenti supaya kondisinya diperiksa manusia. Setelah baseline selesai, jalankan `npm run migrate` seperti biasa untuk migrasi yang belum diterapkan.

## Memeriksa kondisi database

```powershell
npm run verify:database
```

Perintah ini gagal jika ada migrasi yang belum diterapkan, isi file migrasi berbeda dari yang tercatat, atau ada tabel yang hilang. Tabel yang belum memakai Row Level Security ditampilkan sebagai peringatan sampai Task 6.6 selesai.

Kontrak schema bisa diperiksa tanpa database:

```powershell
node database/validate-schema.js
```

## Aturan menulis migrasi

- Nama file: `NNN_nama_migrasi.sql`, tiga digit berurutan, huruf kecil dengan garis bawah. Nomor tidak boleh dipakai dua kali.
- **File yang sudah diterapkan tidak boleh diubah.** Checksum-nya dicatat, dan runner akan menolak. Perbaikan dilakukan lewat file migrasi baru.
- Jangan menulis `BEGIN`, `COMMIT`, atau `ROLLBACK` di dalam file. Runner sudah membungkus setiap file dalam satu transaksi.
- Jangan memakai `CREATE INDEX CONCURRENTLY` karena tidak bisa berjalan di dalam transaksi.
- Setiap tabel baru wajib disertai `ALTER TABLE <nama> ENABLE ROW LEVEL SECURITY;`.
- Checksum dihitung setelah akhiran baris dinormalkan, jadi file yang sama tetap dikenali di Windows maupun Linux.
