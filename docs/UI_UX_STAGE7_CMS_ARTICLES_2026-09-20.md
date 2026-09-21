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

---

**Koreksi (21 September 2026, Task R5.1/R5.2):** kutipan `npm run test:browser-contract` ("lulus, 16 halaman") dan `npm run test:uat-roles` di dokumen ini tidak membuktikan apa yang tampaknya dibuktikan. Kontrak lama hanya membaca HTML dengan regex dan memeriksa CSS prototipe di root, tanpa membuka browser. Skrip uat-roles membandingkan array dengan dirinya sendiri dan tidak pernah memakai empat dari tujuh role. Keduanya sudah diganti: pemeriksaan statis kini `npm run test:static-contract`, pembuktian browser `npm run test:browser-contract` (browser sungguhan, 17 halaman x 5 lebar), dan otorisasi per role lewat HTTP `npm run test:role-authorization`. Lihat `docs/REMEDIASI_R5_HASIL_2026-09-21.md`.
