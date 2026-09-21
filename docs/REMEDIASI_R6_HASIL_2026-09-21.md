# Remediasi R6: Hasil (21 September 2026)

Cabang: `remediasi-r6-skala` (dari `main` lokal yang sudah memuat R5). Satu commit atau lebih per tugas.

## Angka sebelum dan sesudah

Diukur dengan `npm run test:scale` (skrip yang sama dari R5.4), PGlite in-memory, lewat HTTP.

| Ukuran | Sebelum R6 | Sesudah R6 |
|---|---|---|
| GET /api/registrations, 20 pendaftar | 103 query, 69 ms | 8 query, sekitar 20 ms |
| GET /api/registrations, 200 pendaftar | **1.003 query**, 707 ms | **8 query**, sekitar 20 ms (tidak tumbuh) |
| portal.html + CSS + JS, tanpa kompresi | 304,0 KB | 219,5 KB |
| portal.html + CSS + JS, di jaringan | 304,0 KB | **45,6 KB** (brotli) |
| Kunjungan berikutnya | 304 KB diunduh ulang | HTML 304, CSS/JS dari cache (0 byte) |
| `test:scale` | gagal (E-01, E-03) | lulus |

## Ringkasan tugas

| Tugas | Hasil |
|---|---|
| R6.1 | Daftar pendaftar: satu halaman disaring di SQL, empat query anak per halaman (bukan per baris). `listForStaff` selalu `{ items, total, page, pageSize }`. |
| R6.2 | Pagination untuk **pendaftaran, artikel, santri, tagihan** (cakupan diputuskan pengguna). Lihat "Cakupan R6.2". |
| R6.3 | ETag, Cache-Control, 304, brotli/gzip; versi aset = sidik isi (`npm run stamp:assets`). |
| R6.4 | `website.css` dipecah: `website-core.css` (14 KB) dan `website-public.css` (90 KB). |
| R6.5 | Migrasi 034: delapan index. |
| R6.6 | Rate limit untuk dua endpoint token; batasan state per-proses tercatat. |

## R6.1: daftar pendaftar

Rencana bentuk query (butir 1): satu `SELECT count(*)` dan satu `SELECT * ... ORDER BY updated_at DESC, id LIMIT/OFFSET` dengan `WHERE` untuk status dan pencarian (`ILIKE` pada nomor pendaftaran, nama, telepon; `%` dan `_` dari pengguna dianggap huruf biasa). Dokumen, riwayat, catatan, dan tindak lanjut diambil dengan **empat** query `= ANY($1)` untuk baris halaman itu saja, lalu dikelompokkan di JavaScript. Total enam query berapa pun jumlah pendaftar.

Kartu daftar di konsol petugas menampilkan dokumen, catatan, dan tindak lanjut langsung di kartu, jadi ringkasan tanpa anak akan mengubah UI. Karena halaman dibatasi (10 di UI, paling banyak 100), respons tidak tumbuh mengikuti total, dan UI tidak berubah. Tipe kembalian `listForStaff` dulu array bila tanpa argumen; kini satu bentuk. Diuji di `server/registration-list.test.js` (query sama pada 5 dan 60 pendaftar, anak menempel ke induk yang benar, filter, pencarian, batas `pageSize`).

## R6.2: cakupan

Keputusan pengguna: **santri dan tagihan saja** dari enam daftar yang tersisa, ditambah artikel (yang dicantumkan tugas). Aturan bersama di `server/pagination.js`, bentuk `{ items, total, limit, offset }`, batas 100.

- **Artikel:** katalog tanpa `body`, filter kategori dan pencarian di SQL, "Muat lebih banyak" di halaman publik, daftar editorial berpaginasi, isi artikel diambil saat Edit lewat `GET /api/staff/articles/:slug` (route baru, masuk matriks akses).
- **Santri:** `GET /api/my-students` berpaginasi dengan `search`. Cakupan akses (admin, musyrif per asrama, wali, santri) kini diterapkan di SQL, dan **diuji setara dengan `canView()`** untuk sembilan aktor (gabungan semua halaman = daftar penuh). `listForActor` tetap ada untuk pemeriksaan kepemilikan di dalam proses. Dropdown santri di LMS, monitoring, dan operasional diganti pemilih dengan kotak cari (`website/student-picker.js`), karena `<select>` yang diisi satu halaman diam-diam memotong daftar. Portal punya pencarian dan "Muat lebih banyak". Tautan langsung ke santri (`#student=`) kini tidak lagi bergantung pada halaman pertama.
- **Tagihan:** `GET /api/operations/invoices` (status, search, limit, offset) dengan nama santri dari tabel `students`. `/api/operations` hanya membawa halaman pertama tagihan; ekspor CSV tetap penuh. **Efek samping yang menutup temuan R4:** peran keuangan tidak lagi melihat UUID di baris tagihan dan visa.

**Tidak dikerjakan (sesuai keputusan):** akun, visa, inventaris, maddah, dan materi masih mengembalikan seluruh daftar. Ukurannya kecil dan tumbuh lambat (puluhan sampai ratusan baris); dicatat sebagai batas, bukan diam-diam dianggap beres. Bila salah satunya mulai tumbuh, polanya sudah ada di `server/pagination.js`.

## R6.3: cache dan kompresi

- HTML: `no-cache` + ETag (304 bila sama). CSS/JS dengan `?v=`: `public, max-age=31536000, immutable`. CSS/JS tanpa versi: `no-cache`. Gambar: cache sehari + ETag.
- Brotli (kualitas 5) bila diterima, lalu gzip; variasi terkompresi disimpan di memori per versi berkas; berkas di bawah 512 B dan gambar tidak dikompresi.
- **Satu sumber versi:** `scripts/stamp-assets.js` memasang `?v=<sidik isi 10 hex>` ke semua CSS/JS lokal di semua halaman. Cache setahun aman hanya karena versinya mengikuti isi. `scripts/asset-versions.test.js` (ikut `npm test`) gagal bila ada versi usang atau satu berkas diminta lewat dua URL. Sebelumnya `website.css` diminta sebagai dua URL berbeda.
- **Aturan kerja baru:** setelah mengubah CSS atau JS di `website/`, jalankan `npm run stamp:assets`; bila lupa, `npm test` gagal dan menyebut berkasnya.

## R6.4: pemecahan bundle

Diukur dulu (butir 1), tidak ditebak: dengan coverage CSS browser pada enam halaman internal (semua tab, 390 dan 1280 px), halaman internal hanya memakai **8% dari website.css** (8,7 dari 103,5 KB; sisanya bagian publik). `portal.css` dipakai 23 sampai 36% per halaman (46% gabungan) dan `staff.css` 16 sampai 29%; keduanya **tidak dipecah**: ruginya (aturan status hover/dialog yang tidak terlihat coverage, dan risiko urutan cascade) lebih besar daripada untungnya (sekitar 3 KB brotli), dan JS sudah per halaman.

Pemecahan `website.css`: analisis statis konservatif. Sebuah aturan tetap di core kecuali semua kelas/id pada setiap pemilihnya tidak pernah disebut di HTML atau JS internal (awalan dinamis seperti `article-status-` dihitung). Hasil: core 14,1 KB, public 89,8 KB; `website.css` dihapus (tidak ada dua sumber kebenaran). Halaman publik memuat core lalu public; halaman internal hanya core. Tanpa build step: kedua berkas adalah sumber yang disunting tangan.

**Bukti tidak ada regresi (kriteria selesai):** jepretan computed style setiap elemen (hash semua properti non-tata-letak) untuk 17 halaman x 390/1440 px x setiap tab internal = 72 keadaan, 21.180 elemen: **0 perbedaan** sebelum vs sesudah. Baseline diuji dua kali terhadap dirinya sendiri (identik) setelah dua sumber derau dibuang (urutan properti kustom dan port acak dalam URL). Ditambah `check:contrast` 0 pelanggaran dan kontrak browser 85/85. Batas bukti: jepretan hanya keadaan diam (tanpa hover/fokus/dialog); aturan seperti itu aman karena pemilahan berdasarkan nama kelas, bukan keadaan.

Aturan kerja: aturan CSS yang dipakai halaman internal masuk ke `website-core.css` (atau `portal.css`/`staff.css`); yang hanya untuk halaman publik masuk `website-public.css`. Halaman internal tidak memuat public.

## R6.5: index

Migrasi `034_query_path_indexes.sql` (IF NOT EXISTS, hanya penambahan): `student_parent_accounts(parent_account_id)`, `course_enrollments(course_id)`, tiga tabel rekam jejak `(student_id, occurred_at DESC, created_at DESC)` sesuai `ORDER BY` di `byStudent`, dan tiga index untuk urutan daftar berpaginasi baru (`registrations(updated_at DESC, id)`, `invoices(issued_at DESC, id)`, `students(name, id)`). `database/query-path-indexes.test.js`: indexnya ada, migrasi idempoten pada database berisi, dan dengan seq scan/bitmap/sort dimatikan planner memakai index tanpa `Sort` (kolom pengurutan cocok). **Perlu diterapkan ke staging lalu production** (bersama 017 sampai 033). `npm run verify:database` terhadap `.env` produksi tetap gagal karena migrasi belum diterapkan di sana (tindakan rilis).

## R6.6: rate limit

Aturan baru `token-redeem` (10 per 15 menit per IP) untuk `POST /api/auth/invitations/accept` dan `POST /api/auth/password-reset`; `server/token-rate-limit.test.js` membuktikan 429 pada permintaan ke-11 untuk keduanya. State bersama **tidak dibangun**: keputusan K2 (hosting) belum diambil dan plan melarang memindahkannya lebih dulu. Batasan (per proses, hilang saat restart, kuota AI sama) dicatat di `PRODUCTION_DEPLOYMENT.md`, termasuk bahwa bila K2 memilih lebih dari satu instance, pekerjaan ini wajib sebelum go-live.

## Sisa dan catatan

- `test:scale` kini lulus; ambangnya (pertumbuhan query <= 2, daftar 200 pendaftar <= 1,5 detik, portal <= 150 KB di jaringan) tetap dijaga.
- Kontrak browser dan `test:scale` masih manual (tidak ada CI).
- Alat jepretan gaya (`style-snapshot`) hanya ada di scratchpad sesi; bila pemecahan CSS diulang, tulis ulang dari deskripsi di atas.
