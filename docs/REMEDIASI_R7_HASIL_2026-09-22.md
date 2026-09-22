# Remediasi R7: Hasil (22 September 2026)

Distribusi dan konten. Cabang `remediasi-r7-distribusi` (bertumpu di atas R6). Satu commit per task.

## Ringkasan tugas

| Task | Status | Commit |
|---|---|---|
| R7.1 Open Graph dan Twitter Card | Selesai | `b6d9e7d` |
| R7.2 Sitemap dan robots | Selesai | `725bcc5` |
| R7.3 Artikel dirender server | Selesai | `12756ff` |
| R7.4 Byline penulis sebenarnya | Selesai | `c17d8c0`, susulan katalog `ad94f11` |
| R7.5 Markdown terbatas (KR5 opsi a) | Selesai | `2a84bbc` |
| R7.6 Isi konten nyata | **Menunggu klien** | kerangka di bawah |

Sebelum R7 ada dua perbaikan alat: `9bc8879` dan `e626dea`. Versi aset di HTML hasil R6 tidak cocok dengan isi CSS/JS di commit (`asset-versions.test.js` gagal begitu cabang di-checkout ulang), dan sidik dihitung dari byte mentah sehingga berubah antara CRLF (Windows, `core.autocrlf=true`) dan LF. Sidik kini dihitung setelah akhir baris dinormalkan, dan versi dipasang ulang. Commit pertama (`9bc8879`) sempat menulis CR/LF literal ke dalam regex sehingga skrip crash; saya awalnya salah membaca crash itu sebagai lulus. Diperbaiki di `e626dea`.

## R7.1: tag bagikan

- `server/seo.js` menyisipkan `og:*` dan `twitter:*` saat halaman publik disajikan. Judul dan deskripsi diambil dari `<title>` dan `<meta name="description">` halaman itu sendiri, jadi HTML tidak menulis dua kali. Canonical dijadikan absolut (cek-status yang tadinya tanpa canonical kini punya).
- Host dari `APP_BASE_URL`. **`APP_BASE_URL` kini wajib di staging dan production** (`server/production-config.js`); di development/test tanpa nilai itu dipakai host permintaan dengan pola ketat.
- Gambar default `assets/og-default.jpg`, 1200 x 630, dibuat dari `cairo-skyline.jpg` dan logo. Ukurannya diuji dari header JPEG.
- ETag halaman yang dihias dihitung dari isi hasil; 304 dan brotli tetap bekerja (dicek lewat server pratinjau).
- Bukti: `server/seo.test.js` (semua halaman publik, 12 tag wajib, URL absolut, escaping).
- **Belum diuji:** menempel tautan ke WhatsApp sungguhan. Itu butuh domain publik; dilakukan setelah deploy.

## R7.2: robots dan sitemap

- `/robots.txt` dan `/sitemap.xml` (juga di bawah `/website/`) dihasilkan server. Berkas statis lama dihapus.
- Halaman internal = setiap HTML di `website/` yang tidak ada di daftar publik, jadi `lms.html`, `operations.html`, `aktivasi.html`, dan halaman internal berikutnya otomatis masuk `Disallow`. `/api/` juga dilarang.
- Sitemap: halaman publik tanpa `noindex` plus artikel terbit dengan `lastmod` dari `updated_at`. `kebijakan-privasi.html` otomatis keluar selama masih ber-`noindex`, dan otomatis masuk begitu `noindex` dicabut. Halaman statis sengaja tanpa `lastmod`: waktu ubah berkas berganti setiap checkout, bukan tanggal isi.
- Bukti: `server/app-postgres.test.js` (URL absolut, artikel terbit masuk, draf dan arsip tidak, Disallow untuk delapan halaman internal).
- **Belum diuji:** validator Google Search Console (butuh domain).

## R7.3: artikel dirender server

- Rencana meminta usulan dulu. Pendekatan yang dipakai sama dengan yang disarankan rencana, dengan satu penyesuaian: URL kanonis tetap `article.html?slug=...` (bukan `/artikel/<slug>`), supaya tautan yang sudah beredar dan semua tautan relatif di template tetap bekerja tanpa redirect. Tidak ada build step.
- `server/article-page.js` mengisi `<title>`, description, canonical, tag bagikan (`og:type=article`, cover sebagai `og:image` bila ada), `article:published_time`, breadcrumb, dan isi artikel dari database. Ini satu-satunya renderer; `website/article.js` tinggal tombol bagikan dan fallback cover.
- Artikel tidak ada, draf, atau arsip dijawab 404 dengan `noindex` dan tanpa tag bagikan.
- Semua nilai di-escape dan disisipkan lewat fungsi pengganti, karena `String.replace` menafsirkan `$&`/`$1` pada string pengganti; judul berisi `$` tadinya akan merusak halaman.
- Bukti: `server/article-page.test.js` (tanpa JavaScript, injeksi, pola `$`, 404), `server/app.test.js` dan `app-postgres.test.js` lewat HTTP, kontrak browser (artikel diberi slug nyata di `scripts/browser-contract.js`).

## R7.4: byline

- Kolom `author_account_id` sudah ada sejak migrasi 001, jadi **tidak perlu migrasi baru** (serah terima menyebut 035; tidak diperlukan). Kolom diisi dari sesi saat artikel dibuat dan di-join ke `accounts.name` di detail dan katalog.
- Artikel lama tanpa penulis: "Tim Redaksi Hamasah International" dengan keterangan "Penulis tidak tercatat". Lokasi "Kairo, Mesir" dihapus. Fallback tanggal "September 2026" diganti "Tanggal terbit belum tercatat" (halaman) dan "Tanggal belum tercatat" (katalog).
- Susulan `ad94f11`: kartu katalog `articles.js` masih menulis "Tim Hamasah Kairo" dan fallback "September 2026"; ditemukan saat memeriksa katalog di browser.
- Catatan jujur: commit `c17d8c0` dibuat setelah hanya menjalankan tes integrasi; `postgres-article-store.test.js` gagal di commit itu dan diperbaiki di commit R7.3.

## R7.5: Markdown terbatas

- `server/article-markdown.js`: `##`, `###`, daftar `-`/`*` dan `1.`, kutipan `>`, `**tebal**`, `*miring*`/`_miring_`, `[teks](https://...)`. Teks di-escape lebih dulu; HTML mentah tampil sebagai teks; tautan hanya http, https, mailto. Item daftar yang dipisah baris kosong digabung menjadi satu daftar.
- Pratinjau CMS memanggil `POST /api/staff/articles/preview` (izin `articles.write`, masuk `access-matrix.test.js`) yang memakai renderer yang sama dengan halaman publik. Bantuan format ringkas di bawah kolom isi.
- Teks polos lama tetap tampil sama (`2 * 3`, `nama_file` tidak diformat).
- Bukti: `server/article-markdown.test.js` (subset, delapan pola serangan), pemeriksaan di browser: halaman publik dan panel pratinjau staf menampilkan heading, daftar, kutipan, tautan, dan `<img onerror>` sebagai teks.

## R7.6: konten nyata (menunggu klien)

Tidak bisa dikerjakan tanpa klien. Yang perlu diminta dari Hamasah:

1. Minimal enam artikel nyata: judul (8 sampai 140 karakter), ringkasan 1 sampai 2 kalimat, isi (boleh memakai format Markdown terbatas di atas), kategori.
2. Untuk setiap artikel: foto cover dengan URL HTTPS dan alt text (maksimal 160 karakter). Upload lokal belum ada di backend.
3. Diterbitkan lewat CMS oleh akun staf yang sebenarnya, supaya byline dan alur editorial ikut teruji.

Yang sudah diperiksa: katalog dengan satu artikel tampil sebagai satu kartu di grid dua kolom (separuh baris kosong pada 1280 px). Keadaan 0 dan banyak artikel belum diperiksa ulang di R7; lakukan saat konten masuk.

## Temuan di luar lingkup (dicatat, tidak dikerjakan)

- `npm run check:contrast` mencetak "1 langkah data contoh gagal": seed presensi kena `student_attendance_session_unique`. Hasil kontras tetap 0 pelanggaran, tetapi halaman terkait terukur dengan data lebih sedikit.
- Panel pratinjau artikel di CMS berada di bawah daftar editorial, jauh dari tombol "Pratinjau".
