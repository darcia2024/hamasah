# Lanjutan Remediasi: Serah Terima untuk Sesi Baru (21 September 2026)

Dokumen ini untuk memulai sesi Claude baru dan melanjutkan dari titik terakhir tanpa membaca ulang seluruh percakapan. Baca dari atas ke bawah sekali, lalu kerjakan R7 dan R8.

## 1. Konteks singkat

Proyek: aplikasi Node di `C:\Users\ASUS\OneDrive\Documents\Hamasah International` (`server/`, `website/`, `scripts/`, `database/`, `docs/`). Rencana aktif adalah remediasi R1 sampai R8 di `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md` (bukan `PANDUAN_BUILD.md`). Bahasa kerja: Indonesia, santai.

**Status:** R1 sampai R6 selesai. **Sisa: R7 dan R8.**

| Phase | Status | Dokumen hasil |
|---|---|---|
| R1 Fondasi render dan kanal masuk | Selesai | `docs/REMEDIASI_R1_HASIL_2026-09-20.md` |
| R2 Data, privasi, jejak | Selesai | `docs/REMEDIASI_R2_HASIL_2026-09-21.md` |
| R3 UI untuk backend yang ada | Selesai | `docs/REMEDIASI_R3_HASIL_2026-09-21.md` |
| R4 Kebenaran tampilan dan identitas | Selesai | `docs/REMEDIASI_R4_HASIL_2026-09-21.md` |
| R5 Alat uji yang jujur | Selesai | `docs/REMEDIASI_R5_HASIL_2026-09-21.md` |
| R6 Skalabilitas | Selesai | `docs/REMEDIASI_R6_HASIL_2026-09-21.md` |
| R7 Distribusi dan konten | **Belum** | plan bagian 9 |
| R8 Pengerasan dan keputusan sisa | **Belum** | plan bagian 10 |

## 2. Keadaan git (periksa dulu dengan `git status` dan `git branch -a`)

- `origin` = `https://github.com/darcia2024/penawaran-konsep-mediator.git`.
- **R1 sampai R4 sudah di-push ke `origin/main`** (commit `093274f`).
- **R5** ada di cabang lokal `remediasi-r5-uji`, **R6** di `remediasi-r6-skala` (bertumpu di atas R5). `main` lokal sudah di-fast-forward sampai R5 tetapi **belum di-push**. Tidak ada yang dari R5 dan R6 yang sudah sampai ke GitHub.
- Langkah pertama yang disarankan: merge `remediasi-r6-skala` ke `main` (fast-forward, karena R6 turunan R5), jalankan `npm test`, lalu push. Push ke `main` hanya bila pemilik proyek memintanya di sesi itu.
- Cabang kerja baru untuk R7: `git checkout -b remediasi-r7-distribusi`.
- Satu sesi lain (bukan sesi ini) mengerjakan UI akun undangan; kemungkinan konflik merge di `website/portal.js`. Cek `git log --all --oneline` sebelum merge.

## 3. Cara kerja yang dipakai di seluruh remediasi (ikuti)

1. Baca bagian phase di rencana, kerjakan **task demi task**.
2. **Satu commit per task**, id task di subjek: `feat(area): ringkasan [R7.1]`. Akhiri pesan commit dengan atribusi yang diminta lingkungan sesi.
3. Verifikasi sebelum commit: `npm test`, dan bila menyentuh halaman: `npm run test:browser-contract`, `npm run check:contrast`. Verifikasi di browser sungguhan untuk perubahan tampilan.
4. Di akhir phase: tulis `docs/REMEDIASI_R<n>_HASIL_<tanggal>.md` (apa dilakukan, bukti, koreksi atas klaim audit, yang masih terbuka), tambah bagian di `IMPLEMENTATION_STATUS.md`, perbarui memori.
5. **Laporkan jujur.** Jangan menulis "lulus" untuk hal yang tidak diuji. Bila sebuah tes gagal, sebutkan. Temuan di luar lingkup dicatat, bukan diam-diam dikerjakan atau diabaikan.
6. Task berlabel `[KEPUTUSAN ...]` atau `[KLIEN]` atau `[MANUSIA]` **butuh jawaban pemilik proyek**, jangan diputuskan sendiri. Tanyakan dengan pilihan dan rekomendasi.
7. Prinsip tampilan jujur: tidak ada data karangan; keadaan kosong menggantikan angka palsu.

## 4. Perintah penting

```bash
npm test                          # 65 tes; jalankan tanpa server preview hidup (bentrok port di http-performance)
npm run test:csp-contract         # tidak boleh ada style/script inline
npm run test:static-contract      # struktur halaman (viewport, landmark, CSS yang ditautkan)
npm run test:browser-contract     # BROWSER SUNGGUHAN, 17 halaman x 5 lebar, 1-3 menit, butuh Chrome/Edge
npm run test:role-authorization   # tujuh role lewat HTTP + batas data wali/santri
npm run check:contrast            # kontras WCAG di browser; harus 0 pelanggaran
npm run test:scale                # query pendaftar + berat portal; harus lulus (ambang di scripts/scale-check.js)
npm run security:check            # pindai folder publik + npm audit
npm run stamp:assets              # WAJIB setelah mengubah CSS/JS di website/
npm run dev:reset                 # bila database dev PGlite rusak ("Aborted()")
```

Server pratinjau: konfigurasi `hamasah-dev-r4` di `.claude/launch.json` (port 4291, database in-memory berisi data contoh). Login internal memakai akun dev (`admin@hamasah.test` dan lain-lain; kata sandi `DEV_PASSWORD` di `scripts/seed-dev.js`).

## 5. Aturan teknis yang sering menjebak

- **Versi aset:** versi CSS/JS di HTML adalah sidik isi berkas, dipasang `npm run stamp:assets`. Cache setahun (immutable) hanya aman karena itu. Lupa menjalankannya membuat `scripts/asset-versions.test.js` gagal.
- **CSS terpecah:** `website.css` sudah **tidak ada**. Ada `website-core.css` (dimuat semua halaman) dan `website-public.css` (hanya halaman publik). Aturan yang dipakai halaman internal masuk `website-core.css`, `portal.css`, atau `staff.css`; yang hanya untuk publik masuk `website-public.css`. Halaman auth memakai `auth-pages.css`.
- **CSP ketat:** `style-src 'self'`, tanpa style/script inline dan tanpa `onclick`. Gunakan kelas CSS dan `addEventListener`.
- **Tidak ada build step, tidak ada bundler.** Jangan memperkenalkannya.
- **Warna merek:** emas `#E7B10C` (isi), `--gold-dark` `#856000` (teks emas), charcoal `#363638`. Hijau hanya untuk sukses, merah hanya untuk peringatan. Teks harus lolos `check:contrast`.
- **Pagination:** aturan bersama di `server/pagination.js`, bentuk `{ items, total, limit, offset }`, batas 100. Daftar berpaginasi: pendaftaran, artikel (tanpa `body`), santri, tagihan. Akun, visa, inventaris, maddah sengaja belum.
- **Izin:** semua izin ada di `server/access-policy.js`. Route baru dengan `permission` **harus** ditambahkan ke `server/access-matrix.test.js`, kalau tidak tesnya gagal.
- **Migrasi:** nomor berikutnya `035`. Migrasi 017 sampai 034 hanya diterapkan lokal. `.env` menunjuk ke Supabase produksi, jadi `npm run verify:database` terhadapnya gagal **secara sengaja**; menerapkan migrasi ke sana adalah tindakan rilis, tidak pernah dari sesi coding.
- **Berkas server tidak boleh di `website/`** (`security:check` menolaknya). Kredensial literal di `website/` juga ditolak.
- Skrip ber-nama `*.test.js` di `scripts/` dan `server/` ikut `npm test`. Skrip yang berat atau butuh browser sengaja tidak bernama `.test.js`.

## 6. Pekerjaan yang tersisa

### R7: Distribusi dan konten (rencana bagian 9)

Baca `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md` mulai "9. Phase R7". Ringkasan:

- **R7.1** Open Graph dan Twitter Card. Perhatikan gambar OG memerlukan URL absolut; cek `APP_BASE_URL` di `server/environment.js`.
- **R7.2** Sitemap dan robots yang benar. Sudah ada `website/robots.txt` dan `website/sitemap.xml` (dibuat sebelumnya); rencana meminta isinya benar dan dinamis untuk artikel. `kebijakan-privasi.html` sengaja `noindex` sampai teksnya final.
- **R7.3** Artikel dapat ditemukan dan dibagikan. Katalog sekarang berpaginasi tanpa `body` (R6.2); detail lewat `GET /api/articles/:slug`.
- **R7.4** Byline penulis yang sebenarnya. Sekarang halaman artikel menulis "Tim Hamasah Kairo" tetap. Memerlukan kolom penulis; migrasi `035`.
- **R7.5** `[KEPUTUSAN KR5]` Format isi artikel (teks biasa, Markdown terbatas, atau lainnya). **Tanyakan dulu.**
- **R7.6** `[KLIEN]` Isi konten nyata. Tidak bisa dikerjakan tanpa klien; siapkan kerangka dan tandai jelas.

Saat menambah rute atau berkas statis publik, ingat daftar-izin ekstensi di `server/http/static.js`.

### R8: Pengerasan dan keputusan sisa (rencana bagian 10)

- **R8.1** `[KEPUTUSAN KR6]` Nasib prototipe lama (folder `proposal/`, `styles.css`, `cinematic.css`, `app.js` di root, disajikan lewat `/proposal` dan `/hamasah`). **Tanyakan dulu.**
- **R8.2** Sambungkan worker pengingat visa: `scripts/visa-reminder-worker.js` sudah ada beserta tesnya; belum terhubung ke penjadwalan/notifikasi.
- **R8.3** `[KEPUTUSAN K10]` Notifikasi peristiwa penting. **Tanyakan dulu.**
- **R8.4** Perkuat parameter scrypt (kompatibel mundur untuk hash lama).
- **R8.5** `[KEPUTUSAN KR7]` Mata uang. **Tanyakan dulu.**
- **R8.6** Halaman 404 (`website/404.html` sudah ada dan disajikan lewat `notFound` di `static.js`; periksa kelengkapannya terhadap rencana).
- **R8.7** `[MANUSIA]` Audit ulang per role, dilakukan pemilik proyek. Siapkan daftar periksa, jangan klaim selesai.

Urutan yang disarankan: R7.1 sampai R7.4, lalu R8.2, R8.4, R8.6 (murah dan tanpa keputusan), lalu ajukan pertanyaan keputusan (KR5, KR6, K10, KR7) sekaligus dalam satu pertanyaan.

## 7. Temuan terbuka (bukan bagian phase; catat, jangan lupa)

1. Teks publik menyebut **Hay Asyir / Madinat Nasr / Markaz** (12 kemunculan di `index`, `biaya`, `kontak` termasuk blok alamat, `cek-status`). Menunggu konfirmasi klien (K16). Blok alamat di kontak bertentangan dengan Stage 2.
2. Gambar hero di `index.html` memakai `loading="lazy"` padahal di atas lipatan (memperlambat LCP), dan atribut `width`/`height` tidak cocok dengan gambar asli.
3. Tombol topbar mati "Pesan Broadcast" dan "Notifikasi Sistem" di `website/portal.html`.
4. Teks kebijakan privasi (tujuh bagian) dan nomor WhatsApp resmi (`WHATSAPP_NUMBER` di `website/kontak.js`) menunggu klien; `kebijakan-privasi.html` adalah draf ber-`noindex`.
5. Migrasi 017 sampai 034 belum diterapkan ke Supabase (staging dulu, lalu production).
6. K2 (hosting) belum diputuskan: bila lebih dari satu instance, rate limit dan kuota AI (`server/rate-limit.js`, `server/ai-service.js`) harus pindah ke state bersama. Dicatat di `PRODUCTION_DEPLOYMENT.md`.
7. Route LMS membalas penolakan akses dengan 422, route lain 403 (tidak konsisten).
8. R4.7 berhenti di 16.001 px tinggi mobile untuk `index.html` (target 12.000 tidak tercapai; pemilik proyek menerima).
9. Belum ada CI: kontrak browser, `test:scale`, dan `check:contrast` dijalankan manual sebelum rilis.
10. R1.0 (`[MANUSIA]`): kredensial yang pernah tersaji publik harus diputar oleh pemilik proyek bila belum.

## 8. Gerbang rilis

Rencana bagian 11 mendefinisikan tiga gerbang (boleh dilihat orang luar, boleh dipakai staf untuk pekerjaan nyata, boleh menerima trafik nyata). Setelah R7 dan R8, periksa setiap gerbang terhadap daftar di sana dan laporkan mana yang terbuka dan mana yang masih tertahan pada keputusan klien.

## 9. Prompt pembuka yang disarankan untuk sesi baru

> Baca `docs/LANJUTAN_REMEDIASI_R7_R8_2026-09-21.md` sampai habis, lalu `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md` bagian 9 dan 10. Periksa `git status` dan cabang. Mulai dari langkah git di bagian 2 (jangan push tanpa saya minta), lalu kerjakan R7.1 sampai R7.4 di cabang `remediasi-r7-distribusi`, satu commit per task, dan laporkan hasilnya. Tanyakan padaku dulu untuk task yang berlabel KEPUTUSAN, KLIEN, atau MANUSIA.
