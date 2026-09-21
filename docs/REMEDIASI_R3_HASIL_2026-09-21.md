# Phase R3 — Hasil dan bukti

Tanggal: 21 September 2026
Rencana: `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md` Bagian 5
Keputusan yang diambil: KR3 opsi (b), tunda alur tugas dan kuis

## Ringkasan

Ketujuh task selesai.

| Task | Status | Hasil |
|---|---|---|
| R3.1 | Selesai | Export CSV dan kuitansi PDF, plus aksi tandai lunas yang menjadi prasyaratnya |
| R3.2 | Selesai | Koreksi dan pembatalan invoice, berikut jalur baca riwayatnya |
| R3.3 | Selesai | Panel peringatan visa dan berkas visa, plus isian tanggal dan purpose unggahan yang menjadi prasyaratnya |
| R3.4 | Selesai | Ledger inventaris dengan riwayat mutasi |
| R3.5 | Selesai | Pembukaan berkas dari konsol review dan halaman cek status |
| R3.6 | Selesai (opsi b) | Tipe materi tugas dan kuis dicabut dari formulir |
| R3.7 | Selesai | Keluar dari semua perangkat, untuk akun internal dan sesi pendaftar |

## Pola yang berulang di seluruh phase ini

Tiga task berturut-turut menemukan hal yang sama: **tabelnya ditulis, tidak pernah dibaca.**

| Tabel | Sejak | Ditulis oleh | Dibaca oleh |
|---|---|---|---|
| `invoice_corrections` | Migrasi 022 | `correctInvoice` | tidak ada |
| `visa_documents` | Migrasi 022 | `saveVisaDocument` | tidak ada, meski `visa_documents_student_idx` sudah dibuat untuk query yang belum ditulis siapa pun |
| `inventory_movements` | Migrasi 022 | `applyInventoryMovement` | tidak ada |

Ketiganya melewati review, punya migrasi, punya constraint, dan sebagian punya index untuk pembacaan yang tidak pernah ada. Jejak yang tidak bisa dilihat tidak menjalankan fungsinya sebagai jejak. Phase ini menambahkan jalur bacanya: tiga metode store, tiga metode service, dan tiga endpoint baru.

## Prasyarat tersembunyi yang ikut dikerjakan

Dua task punya kriteria selesai yang mustahil dipenuhi tanpa menambah sesuatu yang tidak tertulis di rencana.

**R3.1 — kuitansi hanya terbit untuk invoice lunas, tetapi konsol tidak punya cara menandai lunas.** `PATCH /api/operations/invoices/:id/paid` ada dan tidak pernah dipanggil. Tanpa aksi itu, tidak ada satu pun invoice yang bisa mencapai status yang membuat tombol kuitansi muncul. Aksi "Tandai Lunas" karena itu ikut dikerjakan, lengkap dengan konfirmasi yang menyebut nomor invoice dan nominalnya.

**R3.3 — panel peringatan visa membaca tanggal kedaluwarsa yang tidak punya isian di mana pun.** `saveVisa` menerima `passportExpiresAt` dan `visaExpiresAt`, dan `visaReminders` membacanya, tetapi formulir status visa tidak punya kedua isian itu. Panel peringatan karena itu tidak akan pernah berisi apa pun. Dua isian tanggal ditambahkan.

**R3.3 juga tidak punya purpose unggahan untuk berkas visa.** `upload-policies.js` hanya mengenal enam purpose, tidak satu pun untuk visa. Purpose `visa-document` ditambahkan: entityType `student`, private, PDF/JPG/PNG, batas 5 MB, unggah untuk `operations.manage`, unduh untuk `operations.read`. **Wali dan santri sengaja tidak diberi akses**; memperlihatkan berkas keimigrasian kepada mereka adalah keputusan pihak Hamasah, bukan efek samping sebuah task.

## Catatan per task

### R3.5 — otorisasi diperiksa lebih dulu, dan hasilnya sudah benar

Rencana melarang memasang UI sebelum otorisasi per berkas terbukti benar. Pemeriksaan menunjukkan otorisasinya **sudah** per berkas: `prepareDownload` meneruskan `record.entityId` milik berkas itu sendiri ke `policy.canDownload`, dan `isCandidate` mencocokkan token pendaftaran terhadap pendaftaran pemilik berkas.

Yang belum ada adalah buktinya. Test lama hanya menutup peran yang salah dan permintaan tanpa sesi. Kasus paling tajam tidak diuji: **pendaftar lain yang tokennya sah**. Kalau suatu saat `isCandidate` dilonggarkan menjadi "token ini milik pendaftaran mana pun", seluruh assertion lama tetap hijau sementara berkas orang lain terbuka. Dua test ditambahkan untuk menutup lubang itu.

PDF sengaja diunduh, bukan dipratinjau dalam `<iframe>` atau `<object>`: CSP halaman ini tidak punya `frame-src` sehingga `blob:` jatuh ke `default-src 'self'`, dan `object-src` bernilai `'none'`. Melonggarkan keduanya demi pratinjau berarti membatalkan sebagian pengetatan Phase R1. Gambar tetap dipratinjau di tempat karena `img-src` memang sudah mengizinkan `blob:`.

### R3.6 — yang dicabut hanya pilihannya, bukan dukungannya

`MATERIAL_TYPES` di `server/lms-service.js` tetap memuat `assignment` dan `quiz`, API tetap menerimanya, dan materi lama bertipe itu tetap terbaca. Yang dicabut hanya pilihannya di formulir, sehingga alurnya tinggal dipasang kembali tanpa migrasi data. Keterangan di bawah field menjelaskan alasannya, bukan menghilang tanpa penjelasan.

### R3.7 — label mengikuti apa yang benar-benar dilakukan

Akun internal memakai `logout-all` yang mencabut seluruh sesi akun. Sesi pendaftar memakai `applicantService.logout` yang **hanya** mencabut token yang sedang dipakai. Karena itu labelnya berbeda: "Keluar dari Semua Perangkat" untuk yang pertama, "Keluar dari Sesi Ini" untuk yang kedua. Menyeragamkan labelnya akan menjanjikan sesuatu yang tidak dilakukan.

## Bug yang ditemukan saat verifikasi

Pembersihan object URL semula digantungkan pada event `close` milik `<dialog>`. Pada mesin render yang dipakai memverifikasi phase ini, `showModal()` dan `close()` bekerja tetapi `close` maupun `cancel` **tidak pernah menyala sama sekali**, sehingga blob dan elemen dialognya menumpuk diam-diam.

Pembersihan diubah menjadi fungsi idempoten yang dipanggil langsung dari setiap jalan keluar, ditambah listener `keydown` untuk Escape yang merupakan peristiwa DOM biasa dan bukan bagian dari mesin event `<dialog>`. Dialog koreksi invoice dan mutasi inventaris ikut diberi jalur yang sama.

## Sapuan endpoint

Kriteria selesai phase ini menuntut setiap endpoint punya UI atau tercatat alasannya. Seluruh 88 rute di `server/routes/` disapu.

**Tanpa UI, dan memang disengaja:**

| Endpoint | Alasan |
|---|---|
| `GET /api/health`, `GET /api/ready` | Endpoint pemantauan, dibaca mesin, bukan manusia |
| `POST /api/auth/bootstrap` | Pembuatan admin pertama, hanya dipakai saat penyiapan awal |
| `POST /api/students/.../submission`, `PATCH /api/lms/submissions/review` | Alur tugas dan kuis, ditunda oleh keputusan KR3 pada R3.6 |

**Tanpa UI, dan bukan karena disengaja:**

`POST /api/accounts/invitations` tidak pernah dipanggil dari mana pun. Jalur yang lebih aman untuk membuat akun staf, yaitu mengundang lewat email tanpa admin perlu mengarang kata sandi untuk orang lain, sudah lengkap dari ujung ke ujung: halaman penerimaannya ada dan berfungsi (`website/aktivasi.html` memanggil `POST /api/auth/invitations/accept`). Yang tidak ada hanya tombol untuk memulainya. Satu-satunya jalur pembuatan akun di UI saat ini adalah `POST /api/accounts` lewat `website/portal.js`, yang mengharuskan admin mengetikkan kata sandi untuk pengguna lain.

Ini **bukan** bagian dari task R3.1 sampai R3.7 mana pun, jadi tidak dikerjakan di phase ini dan tidak pantas dicatat sebagai "sengaja tanpa UI". Dicatat sebagai temuan terbuka.

## Verifikasi

### Otomatis

```
npm test                            57 test, seluruhnya lulus
npm run test:csp-contract           17 halaman + 18 skrip, 0 style/script inline
```

Test baru dan yang diperluas:

- `server/postgres-operations-store.test.js` — riwayat koreksi invoice lengkap dengan nilai sebelum dan sesudah, penolakan koreksi pada invoice lunas dan yang sudah dibatalkan, daftar berkas visa per santri, serta ledger inventaris termasuk mutasi keluar melebihi stok yang ditolak dan tidak meninggalkan jejak.
- `server/file-upload.test.js` — kebijakan berkas visa (admin boleh, wali dan santri 403), dan dua test silang pendaftar: membuka berkas pendaftar lain ditolak 403, mengunggah ke pendaftaran orang lain ditolak 403.

### Server lokal

| Yang diperiksa | Hasil |
|---|---|
| Invoice ditandai lunas | Nomor kuitansi KWT/HI/2026/00001 terbit, badge berubah, tombol kuitansi muncul |
| Unduhan CSV dan PDF | 200, seluruh object URL yang dibuat terbukti dibebaskan |
| Kuitansi untuk invoice tidak ada | "Kuitansi belum tersedia." dengan kelas `is-error`, nol object URL dibuat |
| Alasan koreksi tiga karakter | Ditolak di UI, **nol permintaan PATCH terkirim** |
| Koreksi invoice | Riwayat terbuka sendiri: "SPP Uji Koreksi Rp1.200.000 → SPP Uji Koreksi (revisi) Rp1.350.000" oleh Admin Dev |
| Pembatalan invoice | Badge "Dibatalkan", aksi koreksi dan tandai lunas hilang |
| Panel visa sebelum ada tanggal | Empty state menjelaskan kapan data akan muncul |
| Panel visa setelah tanggal disimpan | Dua peringatan berurutan: "Sudah lewat 5 hari" dan "12 hari lagi" |
| Unggah berkas visa | POST /api/uploads → PUT content → POST visa-documents, berkas muncul di daftar |
| Mutasi keluar 9 unit dari stok 4 | Ditolak di UI dengan menyebut angka sebenarnya, **nol permintaan POST terkirim** |
| Mutasi masuk 3 unit | Jumlah 4 → 7 mengikuti ledger, riwayat terbuka sendiri |
| Buka berkas dari konsol petugas | Pasfoto tampil sebagai pratinjau, paspor PDF terunduh |
| Buka berkas dari cek status | Sama, untuk berkas milik pendaftar sendiri |
| Dialog pratinjau ditutup | Hilang dari DOM baik lewat tombol Tutup maupun Escape |
| Tipe materi LMS | Tinggal video, pdf, dan teks; keterangan alasannya tampil |
| Keluar dari semua perangkat | Dua sesi terpisah untuk akun yang sama: 200 dan 200 sebelum, **401 dan 401** sesudah |
| Keluar sesi pendaftar | 200 sebelum, 401 sesudah, halaman kembali ke formulir pencarian |

## Yang belum selesai

- **`POST /api/accounts/invitations` tanpa UI.** Lihat sapuan endpoint di atas. Sudah dicatat sebagai pekerjaan terpisah.
- **Alur tugas dan kuis LMS.** Ditunda oleh keputusan KR3. Backend dan datanya utuh; yang belum ada adalah UI pengerjaan dan penilaiannya.
- **Nama santri pada baris invoice untuk peran finance.** Peran itu tidak punya izin `students.read`, sehingga baris invoice menampilkan UUID. Melebarkan izin adalah keputusan akses, bukan pekerjaan task ini.
- **Isi kebijakan privasi dan nomor WhatsApp resmi.** Warisan Phase R2, masih menunggu pihak Hamasah.
- **`npm test` bentrok dengan server dev yang sedang hidup.** Warisan Phase R2, sudah dicatat sebagai pekerjaan terpisah.
