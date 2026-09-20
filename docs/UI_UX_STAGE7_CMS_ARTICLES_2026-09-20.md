# Tahap 7 UI/UX: CMS dan Artikel

Tanggal: 2026-09-20

## Perubahan

- Form CMS sekarang memilih **Simpan sebagai draf** sebagai keadaan awal.
- Tombol submit mengikuti pilihan status: `Simpan sebagai draf` atau `Terbitkan setelah ditinjau`.
- Ditambahkan tombol **Pratinjau** yang hanya menyusun preview lokal dan tidak menyimpan artikel.
- Cover menggunakan URL HTTPS karena backend saat ini belum menyediakan upload cover artikel lokal.
- Ditambahkan validasi URL cover dan alt text. Alt text wajib jika cover digunakan.
- Ditambahkan preview cover, pesan cover gagal dimuat, dan fallback `Cover tidak tersedia`.
- Artikel editorial menampilkan badge visual untuk Draf, Terbit, dan Diarsipkan.
- Daftar editorial memiliki empty state yang menjelaskan langkah berikutnya dan metadata yang lebih ringkas.
- Katalog serta halaman detail publik memakai alt text cover dan fallback saat media gagal dimuat.
- Database menyimpan alt text cover melalui migrasi `031_article_cover_alt_text.sql`.

## Verifikasi

- `node --check website/staff.js`
- `node --check website/articles.js`
- `node --check website/article.js`
- `node --check server/postgres-article-store.js`
- `node server/postgres-article-store.test.js`
- `npm run test:browser-contract` (16 halaman)
- `git diff --check`
- Browser lokal memastikan nilai awal status `draft`, tombol `Pratinjau`, pesan backend cover URL, dan field alt text tersedia.

## Batas backend saat ini

Upload file lokal khusus cover artikel belum tersedia pada route file upload. UI dengan sengaja tidak menampilkan kontrol upload yang belum didukung. Saat endpoint cover artikel sudah disiapkan, input URL dapat diganti atau dilengkapi tanpa mengubah alur editorial draf dan preview.
