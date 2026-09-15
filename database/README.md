# Database produksi

`001_initial_schema.sql` adalah schema PostgreSQL untuk seluruh modul: pendaftaran, akun, artikel, monitoring, LMS, invoice, visa, dan inventaris.

Setelah dependensi terpasang dan file `.env` tersedia, gunakan database kosong lalu jalankan:

```powershell
npm run migrate
```

Runner akan menerapkan schema dalam transaksi lalu memastikan tabel `accounts` tersedia. Nilai rahasia tidak dicetak ke terminal.

Setelah database tersedia, repository JSON pada `server/` perlu diganti dengan adapter PostgreSQL secara bertahap. Validasi kontrak schema secara lokal memakai:

```powershell
node database/validate-schema.js
```
