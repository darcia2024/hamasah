# Remediasi R8: Hasil (22 September 2026)

Pengerasan dan keputusan sisa. Cabang `remediasi-r7-distribusi`, satu commit per task. Keputusan diambil pemilik proyek pada 22 September 2026: KR5 (a), KR6 (a), K10 email sekarang dan WhatsApp di Phase 16, KR7 (a).

## Ringkasan tugas

| Task | Status | Commit |
|---|---|---|
| R8.1 Hapus prototipe lama (KR6 a) | Selesai | `70752a9` |
| R8.2 Worker pengingat visa | Selesai (belum terjadwal di hosting) | `4ed1c2e` |
| R8.3 Notifikasi peristiwa (K10) | Selesai untuk email | `bb33661` |
| R8.4 Parameter scrypt | Selesai | `7c69227` |
| R8.5 Mata uang (KR7 a) | Selesai (dicatat) | `b629c35` |
| R8.6 Halaman 404 | Selesai | `d968ea1` |
| R8.7 Audit ulang per role | **Menunggu pemilik proyek** | daftar periksa di bawah |

## R8.1: prototipe lama

- Dihapus: `index.html`, `styles.css`, `app.js`, `cinematic.css`, `proposal.css` di root, rute `/proposal` dan `/hamasah`, dan `vercel.json`. Keduanya kini 404 (diuji di `server/http/static.test.js`).
- **`.vercelignore` tidak dihapus, tetapi dijadikan tolak-semua.** Tanpa berkas itu, proyek Vercel yang masih tersambung akan menyajikan seluruh repo (server, database, docs) sebagai berkas statis. Akibatnya: **begitu ini di-push, deployment Vercel yang dulu menampilkan prototipe akan kosong.** Aplikasi sebenarnya butuh server Node dan database; hosting-nya menunggu K2.
- README bagian "Cara Mencoba Prototype" diganti petunjuk menjalankan aplikasi.

## R8.2: pengingat visa

- Bug inti diperbaiki: default `notify` dulu `async () => ({ ok: true })`, sehingga item ditandai terkirim tanpa dikirim. Sekarang tanpa pengirim putaran dilaporkan gagal, tidak ada yang ditandai, dan proses keluar dengan kode 1.
- `npm run worker:visa-reminders` memindai dokumen yang kedaluwarsa dalam `VISA_REMINDER_DAYS` hari (default 30) dan mengirim satu ringkasan per admin aktif. Isinya hanya jumlah dan tautan ke halaman operasional; nama santri dan tanggal dokumen tidak masuk ke kotak surat.
- State di tabel `visa_reminder_log` (migrasi 035). Kunci memuat tanggal kedaluwarsa, jadi dokumen yang diperpanjang tetap diingatkan lagi nanti.
- Penerima = admin aktif. Ini pilihan saya, konsisten dengan izin `visaReminders` (hanya admin/keuangan); ubah di `scripts/visa-reminder-worker.js` bila klien ingin penerima lain.
- Bukti: `server/visa-reminder-worker.test.js` (tanpa pengirim, pengirim gagal lalu pulih, integrasi PGlite: state bertahan melewati "restart", outbox tercatat `sent`, hanya admin aktif).
- **Belum:** scheduler (cron) di hosting, menunggu K2.

## R8.3: notifikasi peristiwa (email)

- Tiga jenis baru di outbox (migrasi 036): `registration-status`, `document-revision`, `payment-received`. Diantrekan dari titik perubahan yang sudah ada, setelah pencatatan audit, dengan payload terenkripsi; dikirim `npm run worker:notifications`.
- Penerima: email pendaftar dan email wali pada formulir (tanpa duplikat) untuk dua jenis pertama; wali aktif yang terhubung ke santri untuk pembayaran. Pendaftaran berstatus dibatalkan tidak dikirimi.
- Tanpa email ganda: `markInvoicePaid` kini mengembalikan `changed`; menandai lunas tagihan yang sudah lunas tidak mengantre email kedua (diuji).
- Gagal mengantre tidak menggagalkan perubahan yang sudah tersimpan; dicatat di log.
- Bukti: `server/event-notifications.test.js`, `server/app.test.js` (antre lalu terkirim worker, tanpa dobel pembayaran).
- **Belum:** preferensi penerima (tidak ada di sistem), WhatsApp (Phase 16, API resmi), dan worker notifikasi yang berjalan di hosting.

## R8.4: scrypt

| Parameter | Memori | Waktu per hash (laptop pengembangan) |
|---|---|---|
| N=2^14, r=8, p=1 (lama, default Node) | 16 MB | 28 ms |
| N=2^16, r=8, p=1 | 64 MB | 121 ms |
| **N=2^16, r=8, p=2 (dipakai)** | **64 MB** | **~225 ms** |
| N=2^17, r=8, p=1 (OWASP minimum) | 128 MB | 253 ms |

- N=2^16/p=2 adalah padanan OWASP untuk N=2^17/p=1 dengan separuh memori. N=2^17 tidak dipakai sebelum ukuran hosting diputuskan (10 login bersamaan = 1,3 GB).
- Format baru `scrypt$N=65536,r=8,p=2$<salt>$<kunci>`; format lama tanpa parameter tetap diverifikasi. Parameter dari hash tersimpan dibatasi supaya hash rusak tidak memicu alokasi besar.
- Hash lama tidak di-rehash saat login (store akun belum punya metode ganti-hash yang aman); terganti saat reset atau aktivasi berikutnya.
- Efek samping: `npm test` naik dari sekitar 26 detik ke sekitar 52 detik.
- Bukti: `server/password-hash.test.js`.

## R8.5: mata uang

Dicatat di `IMPLEMENTATION_STATUS.md` (Modul operasional): tagihan hanya rupiah, EGP dicatat manual dalam rupiah, ditinjau ulang saat ada transaksi EGP nyata.

## R8.6: halaman 404

- Penanda 404, CTA beranda dan "Hubungi kami" (ke formulir kontak yang berfungsi sejak R1.6), kartu di tengah.
- Temuan yang diperbaiki sekalian: 404 memakai path relatif, jadi di alamat bertingkat (`/a/b/c`) CSS-nya ikut 404 dan halaman tampil polos. Ditambah `<base href="/website/">` (diizinkan CSP `base-uri 'self'`).
- Bukti: pengukuran DOM pada 375 dan 1280 px di `/a/b/tidak-ada` (dua stylesheet termuat, tautan menuju `/website/...`), kontrak browser, kontras 0 pelanggaran. Screenshot 1280 px gagal diambil karena pane browser tidak menggambar; pengukurannya lewat DOM.

## R8.7: audit ulang per role (daftar periksa untuk pemilik proyek)

Tidak saya klaim selesai; ini harus ditelusuri manusia dengan sesi tiap role, bukan akses admin.

Persiapan: `npm run dev:reset`, lalu `npm run dev`; kredensial akun dev dicetak di terminal. Periksa setiap langkah di lebar 375 px dan 1280 px.

Untuk setiap role, catat empat hal: yang tidak berfungsi, yang kosong tanpa penjelasan, yang menampilkan data role lain, dan yang menampilkan klaim tanpa dasar.

| Role | Yang ditelusuri |
|---|---|
| Admin | Portal, Pendaftaran (daftar, detail, ubah status, review berkas, buka berkas), CMS artikel (buat, pratinjau Markdown, terbitkan, arsipkan), akun dan undangan, asrama, LMS, keuangan (tagihan, lunas, kuitansi PDF, koreksi, impor), visa dan inventaris, audit, monitoring |
| Petugas pendaftaran | Pendaftaran dan CMS artikel; pastikan menu keuangan, akun, audit tidak ada atau ditolak |
| Guru | LMS (materi, versi, arsip), rekam jejak santri yang diampu; pastikan tidak melihat keuangan |
| Pengawas | Monitoring asrama dan santri; pastikan batas data |
| Keuangan | Tagihan, kuitansi, laporan CSV, visa; pastikan tidak ada CMS dan akun |
| Wali | Portal wali: hanya santri miliknya, tagihan dan kuitansinya, laporan; coba buka ID santri lain di URL |
| Santri | Portal santri dan LMS; coba buka data santri lain |

Tombol yang sudah diketahui mati (temuan terbuka): "Pesan Broadcast" dan "Notifikasi Sistem" di topbar `portal.html`.

Tulis hasilnya sebagai dokumen audit terpisah dan buat phase lanjutan bila perlu.

## Temuan di luar lingkup (dicatat, tidak dikerjakan)

- `identityService.login` langsung menolak email yang tidak ada tanpa menjalankan scrypt, sehingga waktu respons membedakan email terdaftar dan tidak (enumerasi akun lewat waktu). Dengan scrypt ~225 ms perbedaannya kini lebih jelas. Perbaikannya: verifikasi terhadap hash tiruan saat akun tidak ada.
- Migrasi 035 dan 036 hanya diterapkan lokal, seperti 017 sampai 034.
