# Hamasah International: website dan portal

[![Test](https://github.com/darcia2024/hamasah/actions/workflows/test.yml/badge.svg)](https://github.com/darcia2024/hamasah/actions/workflows/test.yml)

Website publik dan portal internal Hamasah International (bimbingan studi Al-Azhar, Kairo):
pendaftaran calon santri, konsol petugas, portal wali dan santri, LMS, serta operasional
(tagihan, visa, asrama).

- **Menjalankan sistem di production:** [`RUNBOOK.md`](RUNBOOK.md)
- **Keputusan yang masih ditunggu dari pengurus:** [`docs/KEPUTUSAN_PEMILIK_2026-09-23.md`](docs/KEPUTUSAN_PEMILIK_2026-09-23.md)
- **Riwayat fitur per phase:** [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md)

## Isi

| Bagian | Untuk siapa | Halaman |
|---|---|---|
| Situs publik | Calon santri dan wali | Beranda, program, biaya, artikel (Pena Hamasah), kontak, formulir pendaftaran |
| Cek status pendaftaran | Calon santri | Progres berkas, catatan petugas, unggah ulang berkas, kloter keberangkatan |
| Konsol pendaftaran dan CMS | Petugas pendaftaran, admin | Pipeline pendaftar, pemeriksaan berkas, pesan WhatsApp siap kirim, artikel, pesan konsultasi |
| Portal wali dan santri | Wali, santri | Rekam pembinaan, sholat, hafalan, rapor PDF, tagihan dan kuitansi PDF |
| Monitoring | Musyrif, admin | Profil santri, presensi, evaluasi, catatan disiplin, export CSV |
| LMS | Guru, santri | Maddah, materi video/PDF/teks, tugas dan kuis dengan penilaian |
| Operasional | Admin, keuangan | Tagihan (`INV/HI/YYYY/NNNNN`), kuitansi, berkas visa, inventaris asrama, impor CSV |
| Audit | Admin | Catatan aktivitas petugas dan perubahan data penting |

Peran: admin, petugas pendaftaran, keuangan, musyrif, guru, wali, santri. Hak akses per peran ada
di `server/access-policy.js` dan diuji di `server/access-matrix.test.js`.

## Teknologi

- Node.js 22, tanpa framework dan tanpa langkah build. Satu dependency production: `pg`.
- PostgreSQL (Supabase di production). Migrasi berurutan di `database/`, dijalankan `npm run migrate`.
- Berkas pendaftar di Supabase Storage (bucket privat, tautan bertanda tangan).
- Frontend HTML, CSS, dan JavaScript biasa di `website/`, disajikan server yang sama.
- Deploy ke Vercel lewat `api/index.js`; `server.js` dan `Dockerfile` untuk server biasa.

## Struktur

```
api/index.js        Titik masuk Vercel
server.js           Titik masuk server biasa (dev, Docker)
server/             Aplikasi: route, service, store PostgreSQL, keamanan HTTP
database/           Migrasi SQL dan skrip migrate/verify
website/            Halaman dan skrip peramban
assets/             Gambar
scripts/            Dev server, seed, pemeriksaan rilis, worker
docs/               Catatan keputusan dan arsip (lihat docs/README.md)
```

## Menjalankan di laptop

Tidak butuh database luar maupun file `.env`:

```bash
npm install
npm run dev
```

`npm run dev` memakai PostgreSQL in-process (PGlite) di `data/dev-db`, menerapkan migrasi, dan
membuat akun contoh untuk setiap peran; kata sandinya dicetak di terminal. Buka alamat yang dicetak.
`npm run dev:reset` untuk mulai dari database kosong.

## Test

```bash
npm test
```

Seluruh test memakai PGlite, jadi tidak butuh database sungguhan atau secret. CI menjalankannya di
Node 22 dan 24 pada setiap pull request (`.github/workflows/test.yml`).

Setelah mengubah CSS atau JS di `website/`, jalankan `npm run stamp:assets` supaya versi aset di
HTML ikut berubah; test akan gagal kalau lupa.

## Konvensi

- Teks antarmuka, komentar, dan pesan commit dalam bahasa Indonesia.
- Tidak ada rahasia di repo. `.env` hanya untuk laptop dan tidak pernah di-commit.
- Skrip yang menulis ke database menolak production tanpa `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND`
  yang diset di terminal.
