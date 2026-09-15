# Database produksi

`001_initial_schema.sql` adalah schema PostgreSQL untuk seluruh modul: pendaftaran, akun, artikel, monitoring, LMS, invoice, visa, dan inventaris.

Setelah dependensi terpasang dan file `.env` tersedia, gunakan database kosong lalu jalankan:

```powershell
npm run migrate
```

Runner akan menerapkan schema dalam transaksi lalu memastikan tabel `accounts` tersedia. Nilai rahasia tidak dicetak ke terminal.

Runner menolak berjalan jika `APP_ENV` kosong, dan menolak `APP_ENV=production` tanpa konfirmasi `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND` di terminal. Aturan lengkapnya ada di [PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md#pengaman-skrip-database).

Setelah database tersedia, repository JSON pada `server/` perlu diganti dengan adapter PostgreSQL secara bertahap. Validasi kontrak schema secara lokal memakai:

```powershell
node database/validate-schema.js
```
