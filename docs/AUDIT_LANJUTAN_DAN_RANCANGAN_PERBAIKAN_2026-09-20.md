# Audit lanjutan dan rancangan perbaikan — 20 September 2026

Dokumen ini adalah audit tahap berikutnya setelah `docs/AUDIT_UI_UX_2026-09-20.md` dan Tahap 1–8. Fokusnya bukan mengulang temuan visual yang sudah ditutup, melainkan hal yang belum pernah diperiksa: apakah fitur benar-benar berjalan di browser, apakah endpoint backend punya UI, apakah data dan konten layak dipublikasikan, dan apakah bukti kelulusan yang dipakai selama ini benar-benar menguji hal yang diklaim.

Audit ini hanya menghasilkan dokumentasi. Tidak ada kode, data, konfigurasi, atau deployment yang diubah.

---

## 1. Kesimpulan

**Produk belum layak rilis.** Tahap 1–8 memperbaiki banyak hal yang nyata, tetapi ada satu kerusakan struktural yang belum terdeteksi: **Content Security Policy pada server memblokir seluruh 126 atribut `style="..."` inline dan 1 blok `<script>` inline di folder `website/`.** Akibatnya sebagian layout yang tercatat "sudah diperbaiki" sebenarnya tidak pernah aktif di browser, dan formulir konsultasi di halaman kontak tidak berjalan sama sekali.

Temuan besar lainnya:

- Formulir kontak adalah satu-satunya kanal masuk publik yang tersisa setelah Tahap 2 menghapus telepon/alamat/WhatsApp, dan formulir itu mati.
- Sekitar sepertiga endpoint backend yang sudah selesai dan tertulis di `IMPLEMENTATION_STATUS.md` tidak punya UI sama sekali.
- Kredensial akun pengujian tertulis keras di `website/portal.js` yang disajikan publik, dan kredensial itu sudah tidak cocok dengan seed.
- Logika bisnis server dan berkas test-nya dapat diunduh publik dari `/website/`.
- `GET /api/registrations` memicu masalah N+1 dan memuat seluruh pendaftar ke memori sebelum difilter.
- Palet warna menyimpang dari keputusan merek: primary bukan emas logo, neutral memakai slate biru bukan charcoal.
- Skrip yang dipakai sebagai bukti kelulusan (`test:browser-contract`, `test:uat-roles`, `test:performance`, `security:check`) tidak menguji hal yang namanya klaim.

Tidak ada temuan yang membuat data pengguna bocor ke pihak luar. Masalah terbesar adalah **fitur yang tampak selesai padahal tidak berjalan**, dan **klaim kelulusan yang tidak didukung alat ujinya**.

---

## 2. Metode dan batas pemeriksaan

- Pembacaan sumber untuk seluruh isi `website/`, `server/`, `database/`, `scripts/`, dan dokumen di `docs/`.
- Browser lokal terhadap server yang sedang berjalan di `http://127.0.0.1:4273`, desktop dan mobile 375 × 812. Ukuran viewport dikembalikan setelah audit.
- Pengukuran langsung di DOM: `scrollWidth`, tinggi dokumen, tinggi kontrol, rasio kontras terhitung, status pemuatan gambar, dan header respons HTTP.
- Pemetaan silang endpoint: seluruh `pattern` di `server/routes/*.js` dibandingkan dengan seluruh pemanggilan `/api/...` di `website/*.js` dan `website/*.html`.
- Permintaan HTTP langsung untuk memeriksa berkas yang tersaji publik dan header cache.

Yang **tidak** dikerjakan dan tetap harus diverifikasi terpisah:

- Sesi login internal tidak berhasil dibuka. Kredensial demo di halaman portal tidak cocok dengan seed, dan kata sandi seed juga ditolak pada instance yang sedang berjalan. Tampilan isi workspace setelah login **belum** diperiksa pada sesi ini. Temuan internal di bawah berasal dari sumber dan dari shell yang ter-render sebelum guard sesi bekerja, bukan dari penelusuran penuh tiap tab.
- Tidak ada pengiriman pendaftaran, perubahan status, penerbitan artikel, unggahan berkas, pengiriman email, atau perubahan kata sandi.
- Tidak ada pengujian terhadap database production atau staging.
- Screen reader nyata, provider email nyata, dan storage Supabase tidak diuji.

Semua temuan di bawah menyebut bukti terukurnya. Jika sebuah temuan belum terkonfirmasi penuh, hal itu dinyatakan eksplisit.

---

## 3. Tingkat keparahan

| Level | Arti | Target |
|---|---|---|
| P0 | Fitur yang dipublikasikan tidak berjalan, atau data sensitif/menyesatkan terekspos | Blokir rilis |
| P1 | Fitur tidak dapat diakses pengguna, atau klaim UI tidak sesuai kenyataan | Selesai sebelum rilis |
| P2 | Kualitas, skalabilitas, konsistensi, atau kelengkapan yang akan menggigit setelah rilis | Selesai sebelum trafik nyata |
| P3 | Pengerasan dan polesan | Setelah P0–P2 |

---

## 4. Temuan

### A. Blocker teknis

#### A-01 — CSP memblokir seluruh style inline dan script inline — **P0**

Server mengirim `Content-Security-Policy: ... script-src 'self'; style-src 'self' https://fonts.googleapis.com ...` untuk setiap dokumen (`server/app.js:300`, `server/http/security-headers.js`). Tidak ada `'unsafe-inline'`. Pada CSP Level 2/3, `style-src` tanpa `'unsafe-inline'` juga memblokir **atribut** `style="..."`, bukan hanya elemen `<style>`.

Di folder `website/` terdapat **126 atribut `style="..."` di berkas HTML** dan **1 blok `<script>` inline**. Semuanya diblokir.

> **Koreksi 20 September 2026 (saat Task R1.3 dikerjakan).** Hitungan 126 di atas hanya mencakup berkas HTML. Pemeriksaan lanjutan menemukan **57 atribut `style="..."` lagi di dalam template string JavaScript** (`lms.js` 37, `portal.js` 20) yang dipasang lewat `innerHTML`. Atribut itu menjadi atribut style sungguhan di DOM, jadi ikut diblokir CSP. Total sebenarnya **183**, dan konsol CRM setelah login menghasilkan 85 pelanggaran CSP yang tidak terlihat pada audit awal karena audit tidak berhasil membuka sesi internal (lihat Bagian 9). Penulisan properti satu per satu (`element.style.width = '...'`) tidak diblokir dan bukan bagian dari hitungan ini.

Bukti terukur dari browser pada `kontak.html`:

```
[error] Applying inline style violates the following Content Security Policy
        directive 'style-src 'self' https://fonts.googleapis.com'. ... blocked.
[error] Executing inline script violates the following Content Security Policy
        directive 'script-src 'self'. ... blocked.
```

`#inquiry-message` ditulis dengan `style="width:100%; border:1px solid ...; padding:12px 16px; ..."`. Nilai computed yang benar-benar dipakai browser: `width: 177px`, `padding: 0px`, `border: 1px solid rgb(118, 118, 118)`. Artinya textarea tampil sebagai kontrol native sempit, bukan field yang dirancang.

Sebaran atribut inline per halaman:

| Halaman | Jumlah | Dampak terbesar |
|---|---:|---|
| `portal.html` | 28 | `display: grid; grid-template-columns: 1fr 1fr` gagal; **4 elemen `display: none` menjadi terlihat** |
| `monitoring.html` | 27 | Semua grid form dua kolom gagal; `height: 44px` pada CTA gagal |
| `lms.html` | 23 | Grid form gagal; lebar tombol gagal |
| `audit.html` | 16 | Tinggi field 42 px dan area aksi gagal |
| `staff.html` | 15 | Grid CMS `2fr 1fr` dan `1fr 1fr` gagal |
| `operations.html` | 13 | CTA `height: 44px; width: 100%` gagal |
| `index.html`, `kontak.html`, `cek-status.html`, `404.html` | 1 masing-masing | Field kontak rusak total |

Konsekuensi yang paling berbahaya ada di `portal.html:154, 163, 170, 173`. Empat elemen diberi `style="display: none;"` dengan komentar `Preserved in DOM for test assertions, hidden visually in CRM`:

- `.staff-intro` berisi `#portal-role-label` dan heading `Selamat datang.`
- `#portal-students-header` berisi heading `Santri yang Dapat Anda Pantau`
- `#portal-students-status`
- `#portal-student-list` (grid kartu santri versi lama)

Karena inline style diblokir, keempatnya **tampil** di production, sehingga portal menampilkan heading ganda dan grid santri versi lama berdampingan dengan dashboard CRM baru.

Catatan penting: klaim Tahap 6 bahwa "operasi terukur dua kolom pada viewport desktop" dan klaim audit bahwa tinggi kontrol minimum 44 px sudah terpenuhi, **tidak dapat benar** selama CSP aktif, karena kedua hal itu ditulis sebagai atribut inline.

#### A-02 — Formulir konsultasi di halaman kontak tidak berfungsi — **P0**

`website/kontak.html` hanya memuat `public-header.js`. Tidak ada `kontak.js`.

Handler formulir ditulis sebagai `<script>` inline di `kontak.html:288–306`, dan blok itu diblokir CSP (lihat A-01). Karena `e.preventDefault()` tidak pernah terpasang dan `<form>` tidak punya `action` maupun `method`, penekanan tombol memicu submit native GET ke halaman yang sama: halaman reload, isian hilang, tanpa pesan apa pun. `#inquiry-status` tidak pernah terisi.

Bahkan seandainya script itu berjalan, isinya tetap tidak mengirim ke mana pun. Ia membaca nama, WhatsApp, topik, dan pesan lalu membuangnya, kemudian menampilkan `Pesan siap diproses. Kanal resmi akan ditampilkan setelah dikonfirmasi oleh tim Hamasah.` dengan kelas `is-success`. Ini memberi tahu pengguna bahwa pesannya tersimpan padahal tidak ada yang tersimpan.

Beratnya temuan ini naik karena Tahap 2 sudah menghapus nomor telepon, alamat, dan jam layanan dari konten publik, lalu mengarahkan CTA kontak ke formulir ini. Hasilnya: **tidak ada satu pun kanal masuk yang berfungsi di seluruh situs publik.** Pemeriksaan `mailto:`, `tel:`, dan `wa.me` di seluruh `website/*.html` mengembalikan nol hasil.

Tidak ada endpoint `POST /api/inquiries` atau sejenisnya di `server/routes/`. Jadi ini bukan hanya UI yang putus, melainkan fitur yang backend-nya memang belum ada.

---

### B. Fitur backend tanpa UI

Pemetaan seluruh `pattern` di `server/routes/*.js` terhadap seluruh pemanggilan `/api/...` di `website/` menunjukkan endpoint berikut **tidak pernah dipanggil dari UI mana pun**.

#### B-01 — Modul operasional hanya mengekspos tiga dari sepuluh kemampuan — **P1**

`website/operations.js` berukuran 6,4 KB dan hanya berisi tiga form (invoice, visa, inventaris), satu tombol muat ulang, dan logout. Yang sudah selesai di backend tetapi tidak punya kontrol UI:

| Endpoint | Fitur | Status dokumen |
|---|---|---|
| `GET /api/operations/report.csv` | Export laporan operasional CSV | Tercatat selesai di `docs/OPERASIONAL_DAN_EXPORT_2026-09-20.md` |
| `GET /api/operations/invoices/:id/receipt.pdf` | Kuitansi PDF | Tercatat selesai di `IMPLEMENTATION_STATUS.md` |
| `GET /api/operations/visa-reminders` | Daftar visa mendekati kedaluwarsa | Tercatat selesai |
| `POST /api/operations/visa-documents` | Unggah berkas visa/paspor | Tabel `visa_documents` sudah ada |
| `PATCH /api/operations/invoices/:id/correction` | Koreksi invoice berjejak | Tabel `invoice_corrections` sudah ada |
| `PATCH /api/operations/invoices/:id/void` | Pembatalan invoice | Kolom `voided_at`, `void_reason` sudah ada |
| `POST /api/operations/inventory/:id/movements` | Ledger stok masuk/keluar | Tabel `inventory_movements` sudah ada |

Efek nyata: keuangan tidak bisa mencetak kuitansi, tidak bisa membatalkan invoice yang salah, dan tidak bisa mengekspor laporan. Inventaris hanya bisa dibuat, tidak bisa dicatat pergerakannya. Peringatan visa tidak terlihat siapa pun.

#### B-02 — LMS: penilaian tugas dan kuis tidak punya UI — **P1**

Tabel `lms_attempts` (migrasi 025) dan `lms_submissions` (migrasi 026) sudah ada lengkap dengan constraint dan index. Endpoint tersedia. Tidak satu pun dipanggil:

- `POST /api/students/:id/courses/:cid/materials/:mid/attempts` — santri mengerjakan kuis
- `POST /api/students/:id/courses/:cid/materials/:mid/submission` — santri mengumpulkan tugas
- `PATCH /api/lms/submissions/:id/review` — guru menilai
- `PATCH /api/courses/:id/materials/:mid/archive` — arsip materi
- `PATCH /api/courses/:id/materials/:mid` — sunting materi

`website/lms.html` menyediakan tipe materi `tugas` dan `kuis` pada form pembuatan materi, tetapi santri tidak punya cara mengerjakannya dan guru tidak punya cara menilainya. Ini alur yang setengah jadi dan terlihat lengkap dari sisi pengajar.

#### B-03 — Berkas yang diunggah tidak dapat dibuka dari UI — **P1**

`GET /api/files/:id` tidak pernah dipanggil. `website/cek-status.js` dan `website/staff.js` mengunggah dokumen lewat `POST /api/uploads` dan `PUT /api/uploads/:id/content`, serta menampilkan metadata dan catatan review. Tetapi tidak ada tautan untuk **melihat** berkas yang sudah diunggah.

Artinya petugas pendaftaran menyetujui atau menolak paspor, ijazah, dan surat kesehatan **tanpa bisa membuka berkasnya dari konsol**. Ini membuat alur review dokumen tidak dapat dijalankan sebagaimana dirancang.

#### B-04 — Keluar dari semua perangkat tidak terpasang — **P2**

`POST /api/auth/logout-all` dan `POST /api/applicant/logout` tidak pernah dipanggil. Tidak ada cara bagi pengguna mengakhiri sesi di perangkat lain, dan sesi pendaftar hanya hilang saat kedaluwarsa.

#### B-05 — Worker pengingat visa adalah stub — **P1**

`scripts/visa-reminder-worker.js` yang dijalankan `npm run worker:visa-reminders` **tidak melakukan apa pun**. Isinya:

```js
if (process.argv.includes('--once')) {
  console.log('[visa-reminder-worker] adapter siap; sambungkan operationsService dan notification provider di deployment.');
  return;
}
```

`server/visa-reminder-worker.js` berisi logika yang benar, tetapi default `notify` adalah fungsi kosong yang mengembalikan `{ ok: true }`, sehingga item **ditandai sudah dikirim** padahal tidak ada yang dikirim. Default `stateStore` adalah `null`, sehingga state hanya di memori dan seluruh pengingat terkirim ulang setiap restart.

`IMPLEMENTATION_STATUS.md` mencantumkan "Scheduler adapter visa" sebagai tersedia. Secara harfiah benar, tetapi mudah dibaca sebagai fitur yang berjalan.

#### B-06 — Notifikasi hanya menutupi dua peristiwa — **P2**

`server/notification-service.js` hanya mengenal `account-invitation` dan `password-reset`. Tidak ada notifikasi untuk perubahan status pendaftaran, dokumen perlu revisi, pembayaran diterima, visa mendekati kedaluwarsa, atau tugas LMS dinilai.

Pengirim yang tersedia hanya Resend (email), console, dan disabled. **Tidak ada kanal WhatsApp**, padahal seluruh formulir publik meminta nomor WhatsApp dan pasar utamanya Indonesia.

---

### C. Keamanan dan privasi

#### C-01 — Kredensial pengujian tertulis keras di JavaScript publik — **P0**

`website/portal.html:63–81` menampilkan blok `Coba Cepat Akun Pengujian` dengan empat tombol. `website/portal.js:1641–1671` mengisi field login dengan kredensial literal:

```js
btnAdmin.addEventListener('click', () => {
  emailInput.value = 'tester@hamasah.test';
  passInput.value = 'TestingHamasah2026!';
});
```

Tiga tombol lain memakai `santri@hamasah.test`, `wali@hamasah.test`, `musyrif@hamasah.test` dengan kata sandi `kata-sandi-dev-hamasah`.

`portal.js` disajikan publik tanpa autentikasi. Konvensi kata sandi internal, daftar alamat email internal, dan satu kata sandi lengkap terbaca siapa pun yang membuka source.

Masalah kedua: **tombolnya sudah rusak.** `scripts/seed-dev.js:15` menetapkan `DEV_PASSWORD = 'kata-sandi-dev-hamasah'` dan `scripts/seed-dev.js:18–24` membuat akun `admin@hamasah.test`, bukan `tester@hamasah.test`. Percobaan login melalui tombol `Super Admin` pada instance yang berjalan menghasilkan `Email atau kata sandi tidak tepat.`

Masalah ketiga: daftar tombolnya tidak konsisten dengan role yang ada. Seed membuat tujuh role; tombol hanya mewakili empat, dan salah satunya akun yang tidak diseed. Peran guru, keuangan, dan petugas pendaftaran tidak terwakili.

Ini kelas masalah yang sama dengan tombol `Contoh Data` yang sudah dihapus dari `cek-status.html` pada Tahap 3. Tahap itu tidak menyentuh portal.

#### C-02 — Logika bisnis server dan berkas test tersaji publik — **P1**

`server/http/static.js` mengizinkan awalan `website/` dan `assets/` untuk semua jenis berkas yang ada di `MIME_TYPES`, tanpa daftar-putih nama berkas. Hasil permintaan langsung ke server yang berjalan:

| Berkas | Status | Ukuran |
|---|---:|---:|
| `/website/registration-service.js` | 200 | 19.129 B |
| `/website/registration-domain.js` | 200 | 12.521 B |
| `/website/registration-service.test.js` | 200 | 10.483 B |
| `/website/registration-domain.test.js` | 200 | 5.007 B |
| `/website/DESIGN_DECISIONS.md` | 200 | 1.030 B |
| `/website/article.html.metadata.json` | 200 | 126 B |

`registration-service.js` adalah modul sisi server. Ia berisi aturan transisi status pendaftaran, penanganan token akses, aturan review dokumen, dan `listForStaff`. Tidak satu pun halaman memuatnya; hanya `registration-domain.js` yang dipakai `index.html`. Kedua berkas test dan `DESIGN_DECISIONS.md` juga tidak pernah dipakai browser.

Ini bukan kebocoran kredensial, tetapi memberi penyerang peta lengkap aturan bisnis dan nama field internal secara cuma-cuma, dan menandakan berkas server salah tempat.

#### C-03 — Tidak ada kebijakan privasi, sementara data sensitif dikumpulkan — **P1**

Migrasi `013_registration_profile_fields.sql` menambahkan `privacy_policy_version TEXT NOT NULL DEFAULT 'v1'`. Dokumen "v1" itu tidak ada. Tidak ada `kebijakan-privasi.html`, `syarat-ketentuan.html`, atau halaman sejenis di `website/`, dan tidak ada tautan ke dokumen semacam itu dari formulir pendaftaran.

Checkbox persetujuan di `index.html:711–723` berbunyi:

- `Saya mendapat persetujuan wali untuk mengikuti proses pendaftaran ini.`
- `Saya bersedia dihubungi kembali oleh konsultan Hamasah International terkait tindak lanjut informasi pendaftaran.`

Keduanya adalah persetujuan **dihubungi**, bukan persetujuan **pemrosesan data pribadi**. Yang benar-benar dikumpulkan jauh lebih luas: nama, tanggal lahir, jenis kelamin, email, nomor telepon calon dan wali, asal sekolah, kota, serta unggahan paspor, ijazah, dan surat kesehatan — sebagian dari calon yang masih di bawah umur.

UU PDP No. 27/2022 menuntut persetujuan yang eksplisit dan terinformasi dengan tujuan yang dinyatakan, plus informasi retensi dan hak subjek data. Ini perlu keputusan pemilik proses, bukan sekadar perbaikan teknis.

#### C-04 — Rate limit hanya hidup di satu proses — **P2**

`server/rate-limit.js:38` memakai `const buckets = new Map()` di memori proses. Batas login lima percobaan per 15 menit berlaku per instance. Dua instance berarti sepuluh percobaan, dan setiap deploy mengembalikan hitungan ke nol. `server/ai-service.js` memakai pola yang sama untuk kuota AI per akun.

Selain itu, `POST /api/auth/invitations/accept` dan `POST /api/auth/password-reset` tidak memiliki `rateLimit` sama sekali (`server/routes/auth.js:146, 162`). Dampaknya terbatas karena token memakai 32 byte acak (`crypto.randomBytes(32)`), jadi tebakan tidak realistis — tetapi endpoint ini tetap dapat dipakai menghabiskan sumber daya karena setiap permintaan memicu verifikasi scrypt.

#### C-05 — Parameter scrypt memakai nilai default Node — **P3**

`server/identity-service.js:77` memanggil `crypto.scrypt(password, salt, 64, ...)` tanpa opsi. Node memakai N=16384, r=8, p=1, sekitar 16 MB memori. Rekomendasi OWASP untuk scrypt lebih tinggi. Bukan kerentanan langsung, tetapi layak dinaikkan sebelum menyimpan kata sandi pengguna nyata.

#### C-06 — Prototipe lama masih tersaji publik — **P2**

`server/http/static.js:60–78` melayani `/proposal/` dan `/hamasah/` dari berkas root: `index.html` (208.309 B), `styles.css` (194 KB), `app.js` (96 KB), `cinematic.css`, `proposal.css`. Permintaan ke `/proposal/` pada server yang berjalan mengembalikan 200 dengan 208.309 B.

Prototipe ini tidak pernah masuk audit mana pun. Isinya, klaimnya, angkanya, dan kontaknya tidak diverifikasi. `.vercelignore` bahkan menunjukkan bahwa **justru prototipe inilah yang di-deploy ke Vercel**, bukan aplikasi di `website/`:

```
/*
!index.html
!styles.css
!app.js
!assets
!vercel.json
```

Perlu keputusan: apakah prototipe masih dibutuhkan. Jika ya, ia harus ikut diaudit. Jika tidak, rute dan berkasnya dihapus.

---

### D. Data dan konten

#### D-01 — Palet warna menyimpang dari identitas merek — **P1**

`website/website.css:6–57` diberi judul `Gold-Seeded Palette: #E7B10C`, tetapi token yang dipakai bukan itu:

| Token | Nilai sekarang | Warna sebenarnya | Seharusnya |
|---|---|---|---|
| `--md-sys-color-primary` | `#B45309` | Oranye bakar | Emas logo `#E7B10C` |
| `--md-sys-color-inverse-surface` | `#1E293B` | Slate biru | Charcoal `#363638` |
| `--charcoal` | `var(--md-sys-color-inverse-surface)` | Slate biru | Charcoal `#363638` |
| `--md-sys-color-on-surface` | `#0F172A` | Slate 900 | Netral hangat |
| `--md-sys-color-outline` | `#64748B` | Slate 500 | Netral hangat |
| `--md-sys-color-tertiary` | `#059669` | Hijau emerald | Hijau hanya untuk sukses |

Seluruh keluarga netral adalah palet Slate (biru-abu). Emas logo hanya muncul sebagai `--md-sys-color-inverse-primary: #FBBF24` dan sebagai `rgba(231, 177, 12, …)` pada beberapa border. Hijau emerald dipakai sebagai warna tersier umum, bukan khusus status sukses.

Hasilnya situs terbaca sebagai template korporat biru-oranye, bukan identitas emas-charcoal Hamasah.

#### D-02 — Gaya outline global merusak kontras badge — **P1**

`website/website.css:2943–2954` menambahkan override menyeluruh:

```css
.image-badge, .pricing-card-badge, .trust-pill-item,
.office-badge, .level-pill, .m3-category-chip, .m3-status-chip {
  background: transparent !important;
  border: 1px solid currentColor !important;
  border-radius: 10px !important;
  box-shadow: none !important;
}
```

`.image-badge` semula punya `background: rgba(30, 27, 22, 0.88)` dengan `backdrop-filter: blur(8px)` dan `color: var(--md-sys-color-primary-container)` (krem `#FEF3C7`). Override menghapus latar gelapnya tetapi mempertahankan teks krem.

Hasil pengukuran di browser pada viewport 375 px:

| Teks | Warna teks | Latar terukur | Rasio | Minimum |
|---|---|---|---:|---:|
| `Pendampingan Belajar Talaqqi` | `rgb(254, 243, 199)` | `rgb(248, 250, 252)` | **1,06 : 1** | 4,5 : 1 |
| `Ibadah & Talaqqi` | `rgb(254, 243, 199)` | `rgb(255, 255, 255)` | **1,11 : 1** | 4,5 : 1 |
| `Mengikuti tahapan pendaftaran Al-Azhar` | `rgba(247, 240, 228, 0.75)` 11 px | `rgb(255, 255, 255)` | **1,13 : 1** | 4,5 : 1 |

Ini regresi yang diperkenalkan oleh pass "Outline UI" (`docs/UI_UX_OUTLINE_STYLE_2026-09-20.md`), yang justru membatalkan perbaikan kontras UI-04 dari audit sebelumnya. Dokumen pass itu mencatat "screenshot mobile dan desktop ditinjau setelah perubahan" tetapi tidak mengukur kontras.

Catatan kejujuran: untuk `Ibadah & Talaqqi` dan `Pendampingan Belajar Talaqqi`, latar sesungguhnya adalah foto di belakang elemen, bukan putih. Rasio 1,06–1,11 diukur terhadap permukaan buram terdekat. Yang pasti benar adalah **scrim gelapnya hilang**, sehingga keterbacaan kini bergantung pada terang-gelapnya foto di titik itu, bukan pada desain.

#### D-03 — Seksi "Kegiatan Santri" hampir kosong di mobile — **P2**

`index.html:452–476` berisi empat `.activity-card`. Hanya kartu pertama yang punya gambar (`cairo-skyline.jpg`). Tiga kartu sisanya hanya punya badge ikon dan teks.

Tangkapan layar pada `scrollY = 9900` di viewport 375 × 812 menghasilkan **layar putih polos**. Dikombinasikan dengan D-02, seksi ini praktis tidak menyampaikan apa pun di mobile.

#### D-04 — Halaman publik sangat panjang di mobile — **P2**

Tinggi dokumen `index.html` pada viewport 375 × 812 adalah **18.871 px**, sekitar 23 layar. Baseline Tahap 0 mencatat 18.363 px, jadi setelah delapan tahap perbaikan halaman justru **bertambah 508 px**.

Tidak ada overflow horizontal (`scrollWidth 375 = clientWidth 375`), jadi perbaikan Tahap 5 dan 8 memang bertahan. Masalahnya kepadatan informasi, bukan layout.

#### D-05 — CMS hanya berisi satu artikel stub — **P2**

`GET /api/articles` pada instance yang berjalan mengembalikan satu item: `pendampingan-santri-di-kairo`, dengan `body` dua kalimat. Landing page mempromosikan "Pena Hamasah" sebagai pusat wawasan dan kabar.

Keterbatasan struktural yang memperparah:

- `body` di-render dengan memecah pada baris kosong lalu membungkus tiap bagian dalam `<p>` (`website/article.js:31–34`). Tidak ada heading, daftar, penekanan, tautan, atau gambar dalam isi. Editor tidak punya format apa pun.
- Kolom `articles.author_account_id` ada di skema sejak `001_initial_schema.sql:60`, tetapi `server/postgres-article-store.js:29, 37` tidak pernah men-`SELECT` kolom itu. API tidak pernah mengembalikan penulis, sehingga `article.js:47` menuliskan byline tetap `Tim Redaksi Hamasah International` dan lokasi tetap `Kairo, Mesir` untuk semua artikel. Kolomnya mati.
- `article.js:22` memakai fallback tanggal literal `'September 2026'` ketika `publishedAt` kosong. Ini menampilkan tanggal karangan sebagai fakta.

#### D-06 — Klaim status sesi tidak berdasar — **P1**

Teks `Sesi Terverifikasi Aman` tertulis statis di enam halaman internal: `portal.html:121`, `staff.html:94`, `lms.html:81`, `monitoring.html:81`, `operations.html:81`, `audit.html:81`. Nilainya tidak pernah diperbarui dari state sesi.

Terbukti berbahaya saat sesi kedaluwarsa di tengah pemakaian. Pada pengujian browser, setelah `/api/me` mengembalikan **401**, konsol CRM tetap ter-render penuh: sidebar lengkap, nama `Admin Dev`, badge `SUPER ADMIN`, ringkasan `4 Santri Binaan aktif terdaftar`, dan label `Sesi Terverifikasi Aman`.

Guard saat pemuatan halaman **bekerja dengan benar**: memuat ulang halaman dengan token palsu menghasilkan konsol tersembunyi, form login muncul, pesan `Sesi tidak ditemukan.`, dan sessionStorage dibersihkan. Jadi ini bukan bypass autentikasi — API tetap menolak. Masalahnya tidak ada penanganan 401 global setelah konsol terbuka. `website/portal.js` hanya melempar error di satu tempat (`:1555`); tiap modul menangani kegagalan sendiri-sendiri.

#### D-07 — Data bisnis belum terkonfirmasi tertulis di kode — **P2**

`website/portal.js:917` menyusun ringkasan role admin:

```js
`Super Admin · Markaz Utama Hay Asyir & Dokki · ${students.length} Santri Binaan aktif terdaftar.`
```

dan `:919` untuk pengawas: `Asrama Hay Asyir Madinat Nasr · …`.

Nama lokasi ini adalah data operasional yang belum dikonfirmasi, ditulis keras di JavaScript. Ini kelas yang sama dengan alamat dan telepon yang sudah dihapus dari konten publik pada Tahap 2; pass itu tidak menyentuh portal.

#### D-08 — Kotak pencarian global tidak tersambung — **P2**

`portal.html:135` menyediakan `<input id="crm-global-search" placeholder="Cari santri, berkas, maddah, atau tagihan...">`. Pencarian di seluruh `website/*.js` untuk `crm-global-search` mengembalikan nol hasil. Kontrol ini murni dekoratif dan menjanjikan kemampuan yang tidak ada.

#### D-09 — Jejak pelaku tidak lengkap pada catatan pembinaan — **P2**

`student_activities`, `student_attendance`, `student_achievements`, `student_evaluations`, dan `student_violations` (`001_initial_schema.sql:81–125`) **tidak menyimpan siapa yang mencatat**. Hanya koreksinya yang menyimpan (`student_record_corrections.actor_account_id`, migrasi 024).

Untuk `student_violations` — catatan pelanggaran santri — ketiadaan jejak pembuat adalah masalah tata kelola, bukan sekadar kerapian data. Bandingkan dengan `registration_status_events` yang sudah memiliki `changed_by_account_id` sejak migrasi 005.

#### D-10 — Model keuangan hanya satu mata uang — **P3**

`invoices.amount_rupiah BIGINT` dan `invoice_corrections.corrected_amount_rupiah`. Lembaga beroperasi di Mesir dan `biaya.html:252` sudah menyebut EGP. Tidak ada kolom mata uang maupun kurs.

---

### E. Performa dan skalabilitas

#### E-01 — `GET /api/registrations` memicu N+1 dan memfilter di memori — **P1**

`server/postgres-registration-store.js:183–186`:

```js
async list() {
  const { rows } = await database.query('SELECT registration_id FROM registrations ORDER BY updated_at DESC');
  return Promise.all(rows.map((row) => get(row.registration_id)));
}
```

`get()` menjalankan **lima query** per pendaftar: data utama, dokumen, riwayat status, catatan, dan tindak lanjut.

`website/registration-service.js:213–231` (`listForStaff`) memanggil `store.list()` tanpa argumen, lalu mengurutkan, memfilter pencarian dan status, dan memotong halaman — semuanya di JavaScript.

Jadi setiap pembukaan konsol petugas menjalankan `1 + (N × 5)` query dan memuat seluruh pendaftar beserta dokumen dan riwayatnya ke memori, meskipun UI hanya menampilkan 20 baris. Pada 200 pendaftar itu sekitar **1.001 query per permintaan**. Pencarian dan filter yang dikirim UI tidak pernah sampai ke SQL.

Catatan tambahan: `listForStaff` mengembalikan **tipe berbeda** tergantung argumen — array bila `options` kosong, objek `{items, total, page, pageSize}` bila tidak (`:230`). Ini rawan salah pakai.

#### E-02 — Sebagian besar daftar tidak punya pagination — **P2**

Hanya tiga store yang punya `LIMIT`/`OFFSET`: `postgres-audit-store.js`, `postgres-notification-store.js`, dan `listImportBatches` di `postgres-operations-store.js`.

Tanpa pagination: artikel, akun, santri, invoice, visa, inventaris, maddah, dan materi. `GET /api/articles` juga mengembalikan **`body` lengkap setiap artikel** pada respons katalog, padahal katalog hanya memerlukan judul dan ringkasan.

#### E-03 — Aset statis tanpa cache dan tanpa kompresi — **P2**

Pemeriksaan header respons untuk `/website/portal.css`:

```
status: 200, size: 82.201 B
cache-control: (tidak ada)
etag:          (tidak ada)
content-encoding: (tidak ada)
```

`server/http/static.js` menulis header hanya `Content-Type` dan `X-Content-Type-Options`. Tidak ada `Cache-Control`, `ETag`, `Last-Modified`, dan tidak ada gzip/brotli.

Setiap halaman internal memuat tiga stylesheet dan dua sampai tiga script:

| Berkas | Ukuran |
|---|---:|
| `website.css` | 90.340 B |
| `portal.css` | 82.201 B |
| `staff.css` | 17.453 B |
| `portal.js` | 76.213 B |
| **Total (portal.html)** | **≈ 266 KB tanpa kompresi, tiap navigasi** |

Memperparah: versi cache-buster tidak konsisten. `index.html` memuat `website.css?v=21`, sedangkan halaman internal memuat `website.css?v=18`. Berkas yang sama diunduh dua kali sebagai dua URL berbeda.

#### E-04 — Index database belum menutup jalur query yang sering dipakai — **P2**

| Tabel | Kekurangan | Query yang terdampak |
|---|---|---|
| `student_parent_accounts` | PK `(student_id, parent_account_id)`, tidak ada index pada `parent_account_id` | Wali membuka portal: cari santri berdasar akun wali |
| `course_enrollments` | PK `(student_id, course_id)`, tidak ada index pada `course_id` | Daftar santri yang terdaftar pada satu maddah |
| `student_achievements` | Tidak ada index `student_id` | Dashboard santri |
| `student_evaluations` | Tidak ada index `student_id` | Dashboard santri |
| `student_violations` | Tidak ada index `student_id` | Dashboard santri |

`student_activities` dan `student_attendance` sudah punya index; tiga tabel rekam jejak lain terlewat.

---

### F. SEO dan distribusi

#### F-01 — Tidak ada satu pun tag Open Graph atau Twitter Card — **P1**

Pemeriksaan `property="og:` dan `name="twitter:` pada seluruh 16 halaman: **nol**.

Untuk lembaga yang distribusinya bertumpu pada WhatsApp dan media sosial, setiap tautan yang dibagikan akan muncul tanpa judul, deskripsi, atau gambar. `article.html` bahkan punya tombol `#btn-share-wa`, jadi berbagi ke WhatsApp memang alur yang dirancang — dan hasilnya pratinjau kosong.

#### F-02 — `sitemap.xml` tidak valid dan tidak lengkap — **P2**

`website/sitemap.xml` memakai URL relatif:

```xml
<url><loc>/website/</loc></url>
```

Protokol Sitemap mewajibkan URL absolut lengkap dengan skema dan host. Google akan menolak berkas ini.

Isinya juga hanya lima halaman statis. Tidak ada satu pun URL artikel, dan tidak ada mekanisme menambahkan artikel baru ke sitemap saat diterbitkan lewat CMS. Tidak ada `lastmod`.

`website/robots.txt` memakai `Sitemap: /sitemap.xml` yang juga relatif, dan melarang `staff`, `portal`, `monitoring`, `audit` — tetapi **tidak** melarang `lms.html` dan `operations.html`.

#### F-03 — Detail artikel di-render sepenuhnya di sisi klien — **P2**

`website/article.js` mengambil artikel lewat `fetch` lalu menyuntik HTML. Crawler yang tidak menjalankan JavaScript hanya melihat kerangka kosong. Judul dokumen baru diubah setelah data tiba (`article.js:24`). Digabung dengan F-01, artikel CMS praktis tidak dapat ditemukan dan tidak dapat dibagikan.

---

### G. Kualitas alat uji dan klaim dokumentasi

Ini akar dari banyak temuan di atas: alat yang dipakai sebagai bukti kelulusan tidak menguji hal yang namanya klaim.

#### G-01 — `test:browser-contract` tidak membuka browser — **P1**

`scripts/browser-contract.test.js` membaca berkas HTML dan menjalankan regex. Ia memeriksa: ada `<meta name="viewport">`, ada `<main>` pada halaman publik, dan ada `skip-link`. Lalu:

```js
const css = fs.readFileSync(path.join(root, '..', 'styles.css'), 'utf8')
          + fs.readFileSync(path.join(root, '..', 'cinematic.css'), 'utf8');
assert.match(css, /@media\s*\(/i, 'CSS harus memiliki breakpoint responsive.');
```

Ia memeriksa **`styles.css` dan `cinematic.css` di root** — berkas milik prototipe lama. Halaman di `website/` memakai `website.css`, `portal.css`, dan `staff.css`, yang tidak pernah dibaca skrip ini.

Skrip ini dikutip sebagai bukti lulus di Tahap 2, 3, 4, 5, 6, 7, dan 8 ("lulus, 16 halaman"). Ia tidak mungkin menangkap A-01, A-02, C-01, D-02, atau D-08.

#### G-02 — `test:uat-roles` tidak menguji tujuh role — **P1**

`scripts/uat-roles.test.js` diklaim di Tahap 8 sebagai "Automated synthetic role UAT lulus untuk admin, petugas pendaftaran, guru, pengawas, finance, wali, dan santri".

Isinya sebenarnya:

```js
const roles = ['admin', 'registration-officer', 'teacher', 'supervisor', 'finance', 'parent', 'student'];
assert.deepEqual(roles.sort(), ['admin', 'finance', 'parent', ...].sort());
```

Baris itu membandingkan array dengan dirinya sendiri — selalu lulus, tidak menguji apa pun. Sisanya menjalankan dua service dengan actor `admin`, `finance`, dan `student` saja. Role `teacher`, `supervisor`, `parent`, dan `registration-officer` **tidak pernah dipakai sebagai actor**. Batas izin antar-role tidak diuji, dan UI tidak disentuh.

#### G-03 — `test:performance` dan `test:http-performance` tidak mengukur yang relevan — **P2**

`scripts/performance-smoke.test.js` menjalankan 500 pemanggilan fallback AI dan 100 pembuatan invoice di dalam proses, dengan store memori. Tidak ada HTTP, tidak ada database, tidak ada halaman.

`scripts/http-performance.test.js` memanggil `/api/health` 30 kali. `/api/health` sengaja tidak menyentuh database (`server/routes/health.js`). Jadi ia mengukur throughput HTTP kosong.

Tidak ada satu pun yang akan mendeteksi E-01 (1.001 query) atau E-03 (266 KB tanpa kompresi).

#### G-04 — `security:check` terlalu dangkal — **P2**

`scripts/security-local-check.js` memeriksa tiga hal: `package-lock.json` ada dan punya `packages`, tidak ada `console.log` yang mencetak password/secret/token di `server/*.js`, dan `security-headers.js` menyebut `X-Content-Type-Options`.

Ia hanya memindai `server/`, jadi kredensial di `website/portal.js` (C-01) tidak akan pernah terdeteksi. Tidak ada `npm audit`, tidak ada pemindaian berkas yang tersaji publik.

#### G-05 — Elemen DOM dipertahankan hanya untuk memuaskan test — **P2**

`portal.html:153` berisi komentar:

```html
<!-- Welcome Intro / Role Header (Preserved in DOM for test assertions, hidden visually in CRM) -->
```

Ini pola yang berbahaya dalam dua arah. Test lulus dengan memeriksa elemen mati, sehingga memberi rasa aman palsu. Dan karena penyembunyiannya memakai inline style, CSP membuat elemen mati itu terlihat kembali di production (A-01).

---

## 5. Rekapitulasi

| Level | Jumlah | Kode |
|---|---:|---|
| P0 | 3 | A-01, A-02, C-01 |
| P1 | 13 | B-01, B-02, B-03, B-05, C-02, C-03, D-01, D-02, D-06, E-01, F-01, G-01, G-02 |
| P2 | 18 | B-04, B-06, C-04, C-06, D-03, D-04, D-05, D-07, D-08, D-09, E-02, E-03, E-04, F-02, F-03, G-03, G-04, G-05 |
| P3 | 2 | C-05, D-10 |

Total 36 temuan.

---

## 6. Rancangan perbaikan

> **Dokumen kerja ada di `docs/RENCANA_REMEDIASI_PHASE_R1_R8_2026-09-20.md`.**
>
> Bagian 6 ini adalah ringkasan arah. Rincian per task, label `[MANUSIA]`/`[KLIEN]`/`[KEPUTUSAN]`/`[KOMPLEKS]`, langkah, kriteria selesai, dan pelacak progres ada di dokumen itu, mengikuti format `PANDUAN_BUILD.md`. Pemetaannya: Tahap 9 sampai 16 di sini menjadi Phase R1 sampai R8 di sana.
>
> Kalau ada beda antara keduanya, **dokumen remediasi yang berlaku**.

Urutan di bawah dipilih supaya setiap tahap menghasilkan sesuatu yang bisa diverifikasi, dan supaya tahap berikutnya tidak membatalkan tahap sebelumnya. Tahap 9 wajib lebih dulu: selama CSP masih memblokir style inline, setiap perbaikan visual lain diverifikasi di atas fondasi yang salah.

### Tahap 9 — Pulihkan fondasi render dan kanal masuk (P0)

Ini satu-satunya tahap yang boleh menahan rilis.

**9.1 Hapus seluruh style dan script inline**

Pindahkan 126 atribut `style="..."` ke kelas utilitas atau kelas komponen di stylesheet yang sudah ada. Jangan menambahkan `'unsafe-inline'` ke CSP sebagai jalan pintas; itu mengembalikan permukaan serangan XSS demi kenyamanan penulisan.

Perlakuan khusus untuk empat elemen `display: none` di `portal.html`:

- Putuskan lebih dulu apakah elemennya masih dipakai. Jika hanya ada untuk test, **hapus elemennya dan perbaiki test-nya**, jangan pindahkan penyembunyian ke CSS. Menyembunyikan elemen mati hanya memindahkan masalah G-05.
- Jika `#portal-student-list` masih berfungsi sebagai fallback, jadikan state yang jelas dengan atribut `hidden`, bukan style.

Pindahkan `<script>` inline di `kontak.html` ke `website/kontak.js`, dan muat berkas itu dari halaman.

**Selesai jika:** `grep -c 'style="' website/*.html` mengembalikan 0 untuk semua halaman; tidak ada `<script>` tanpa `src`; console browser bersih dari pelanggaran CSP pada seluruh 16 halaman; dan portal tidak lagi menampilkan heading ganda.

**9.2 Hidupkan kanal masuk publik**

Ini butuh keputusan pemilik proses lebih dulu, karena menyangkut ke mana pesan dikirim:

- **Opsi A** — buat `POST /api/inquiries` dengan tabel `inquiries`, rate limit per IP, dan tampilkan di konsol petugas. Paling terkontrol, paling banyak kerjanya.
- **Opsi B** — ganti formulir dengan tautan `wa.me` ke nomor resmi yang sudah dikonfirmasi. Paling cepat, paling cocok dengan kebiasaan pasar, tetapi tidak meninggalkan jejak di sistem.
- **Opsi C** — jalankan keduanya: formulir menyimpan ke database dan menawarkan lanjut ke WhatsApp.

Rekomendasi: **Opsi C**, dengan A sebagai sumber kebenaran.

Apa pun pilihannya, dua hal ini wajib: **jangan pernah menampilkan pesan sukses untuk aksi yang tidak terjadi**, dan tampilkan minimal satu kanal kontak yang benar-benar berfungsi di halaman kontak dan footer.

**Selesai jika:** mengirim formulir menghasilkan efek yang dapat diperiksa (baris di database atau perpindahan ke WhatsApp); kegagalan jaringan menampilkan error, bukan sukses; dan ada kanal kontak yang dapat dipakai tanpa JavaScript.

**9.3 Cabut kredensial dari kode klien**

Hapus blok `Coba Cepat Akun Pengujian` dari `portal.html` dan handler-nya dari `portal.js`. Jika pengisian cepat masih dibutuhkan saat development, sediakan lewat mekanisme yang tidak ikut ter-deploy — misalnya berkas terpisah yang hanya dimuat ketika `APP_ENV` bukan production, atau cukup lewat bookmarklet lokal.

Setelah itu: putar kata sandi akun `tester@hamasah.test` jika akun itu ada di environment mana pun selain lokal, dan periksa riwayat git untuk memutuskan apakah nilai lama perlu dianggap bocor.

**Selesai jika:** tidak ada alamat email atau kata sandi literal di seluruh `website/`; pemeriksaan otomatis untuk itu ditambahkan ke `security:check` (lihat Tahap 13).

---

### Tahap 10 — Tutup celah data dan privasi (P1)

**10.1 Pindahkan berkas server keluar dari `website/`**

`registration-service.js` dan `registration-domain.js` pindah ke `server/`. Berkas `*.test.js` pindah ke lokasi test. `DESIGN_DECISIONS.md` pindah ke `docs/`. Berkas `*.metadata.json` dihapus jika tidak dipakai.

Sebagai pertahanan berlapis, tambahkan daftar-tolak di `server/http/static.js` untuk pola `*.test.js`, `*.md`, dan `*.metadata.json` di bawah `website/`, sehingga kesalahan penempatan berikutnya tidak langsung menjadi eksposur.

**Selesai jika:** permintaan ke enam URL di tabel C-02 mengembalikan 404; `index.html` tetap berjalan dengan `registration-domain.js` di lokasi barunya.

**10.2 Kebijakan privasi dan persetujuan yang sah**

Perlu keputusan dan materi dari pemilik proses, bukan hanya implementasi:

- Halaman `kebijakan-privasi.html` berisi data apa yang dikumpulkan, untuk apa, berapa lama disimpan, siapa yang dapat mengaksesnya, dan bagaimana subjek data mencabut persetujuan.
- Checkbox terpisah untuk **pemrosesan data pribadi**, dengan tautan ke halaman tersebut, berbeda dari checkbox bersedia dihubungi.
- Penanganan khusus calon di bawah umur: persetujuan wali harus tercatat sebagai persetujuan pemrosesan, bukan sekadar "mendapat izin ikut mendaftar".
- Isi `privacy_policy_version` dengan versi dokumen yang benar-benar ada, dan simpan versinya saat persetujuan diberikan.

**Selesai jika:** dokumen ada, tertaut dari formulir dan footer, dan versi yang tersimpan cocok dengan dokumen yang berlaku pada saat itu.

**10.3 Jejak pelaku pada rekam jejak santri**

Migrasi baru menambahkan `recorded_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL` pada `student_activities`, `student_attendance`, `student_achievements`, `student_evaluations`, dan `student_violations`. Nullable supaya baris lama tetap terbaca. Isi dari sesi, jangan dari isi request.

**Selesai jika:** catatan baru menyimpan pelaku; UI monitoring menampilkannya; baris lama tidak rusak.

---

### Tahap 11 — Pasang UI untuk fitur backend yang sudah ada (P1)

Tahap ini tidak menulis fitur baru. Ia menyelesaikan yang sudah dibayar.

**11.1 Konsol operasional lengkap**

| Tambahan UI | Endpoint |
|---|---|
| Tombol unduh laporan CSV | `GET /api/operations/report.csv` |
| Tombol kuitansi PDF pada invoice lunas | `GET /api/operations/invoices/:id/receipt.pdf` |
| Panel visa mendekati kedaluwarsa | `GET /api/operations/visa-reminders` |
| Unggah berkas visa/paspor | `POST /api/operations/visa-documents` |
| Koreksi invoice dengan alasan wajib | `PATCH /api/operations/invoices/:id/correction` |
| Pembatalan invoice dengan alasan wajib | `PATCH /api/operations/invoices/:id/void` |
| Catat stok masuk/keluar | `POST /api/operations/inventory/:id/movements` |

Aksi yang tidak dapat dibatalkan (void, koreksi) harus punya konfirmasi eksplisit dan alasan minimal 5 karakter sesuai constraint database, dan memberi tahu bahwa aksinya tercatat di audit.

**11.2 Pembukaan berkas dari konsol review**

Pasang `GET /api/files/:id` sebagai tautan pada daftar dokumen di `staff.html` dan `cek-status.html`. Periksa ulang bahwa endpoint memvalidasi hak akses per berkas, bukan hanya per role, sebelum UI-nya dipasang.

**Selesai jika:** petugas dapat membuka paspor/ijazah yang diunggah sebelum menyetujui atau menolaknya; pendaftar hanya dapat membuka berkas miliknya sendiri; percobaan akses silang ditolak.

**11.3 Alur tugas dan kuis LMS**

- Santri: form pengumpulan tugas dan pengerjaan kuis pada `panel-course-detail`.
- Guru: daftar submission yang menunggu nilai, dengan aksi nilai dan kembalikan.
- Pengelola materi: sunting dan arsipkan materi.

Jika alur ini diputuskan belum menjadi prioritas, **turunkan janjinya di UI**: jangan tawarkan tipe materi `tugas` dan `kuis` pada form pembuatan materi selama santri belum bisa mengerjakannya.

**11.4 Keluar dari semua perangkat**

Tombol pada area profil yang memanggil `POST /api/auth/logout-all`, dan aksi serupa untuk sesi pendaftar.

---

### Tahap 12 — Kebenaran tampilan dan identitas (P1–P2)

**12.1 Kembalikan palet ke identitas merek**

Tetapkan `--md-sys-color-primary` ke emas logo `#E7B10C`, dan seluruh keluarga netral ke charcoal `#363638` beserta turunannya. Hijau `--md-sys-color-tertiary` dipindahkan menjadi token sukses saja, bukan warna tersier umum.

Ambil nilai emas dari berkas logo, jangan menebak. Setelah token berubah, **setiap pasangan teks/latar harus diukur ulang** — mengubah primary tanpa mengukur kontras akan memindahkan masalah, bukan menyelesaikannya.

**12.2 Batalkan override outline yang merusak kontras**

Hapus atau persempit aturan di `website.css:2943–2954`. Badge yang berada di atas foto wajib punya scrim buram; gaya outline hanya untuk badge di atas permukaan solid yang kontrasnya sudah terukur.

**Selesai jika:** tiga teks di tabel D-02 mencapai minimal 4,5 : 1; tidak ada teks krem di atas permukaan terang; pengukuran dilakukan dengan skrip, bukan penilaian mata.

**12.3 Identitas dan status sesi yang jujur**

- Ganti `Sesi Terverifikasi Aman` dengan status yang berasal dari state sesi nyata, atau hapus. Jangan menampilkan jaminan keamanan sebagai dekorasi.
- Tambahkan penanganan 401 terpusat: begitu ada respons 401, bersihkan sesi, kembalikan ke layar login, dan jelaskan bahwa sesi berakhir. Ini menutup D-06.
- Keluarkan `Markaz Utama Hay Asyir & Dokki` dan `Asrama Hay Asyir Madinat Nasr` dari `portal.js`. Ambil dari data, atau hilangkan sampai lokasi resmi dikonfirmasi.
- Hapus `#crm-global-search`, atau implementasikan. Jangan biarkan kontrol yang menjanjikan pencarian lintas modul tanpa fungsi.
- Ganti fallback tanggal `'September 2026'` di `article.js` dengan penanganan tanggal kosong yang jujur.

**12.4 Padatkan halaman publik dan perbaiki seksi kegiatan**

- Turunkan tinggi dokumen `index.html` di mobile secara signifikan dari 18.871 px. Targetkan di bawah 12.000 px dengan memangkas pengulangan dan merapatkan ritme vertikal, bukan dengan memperkecil teks.
- Beri tiga kartu kegiatan tanpa gambar perlakuan visual yang berfungsi tanpa foto, atau sediakan fotonya.

---

### Tahap 13 — Perbaiki alat uji sebelum menambah klaim (P1–P2)

Tahap ini diletakkan sebelum tahap performa dan SEO dengan sengaja: tanpa alat yang benar, hasil tahap berikutnya tidak dapat dibuktikan.

**13.1 Jadikan `test:browser-contract` benar-benar menguji browser**

Minimal, skrip harus menjalankan server, membuka tiap halaman, dan memeriksa:

- Tidak ada pelanggaran CSP di console.
- Tidak ada error JavaScript.
- Tidak ada `scrollWidth > clientWidth` pada 360/390/768/1024/1440 px.
- Tidak ada gambar gagal muat.
- Semua kontrol interaktif punya nama aksesibel.

Perbaiki juga pembacaan CSS yang salah sasaran: baca `website/website.css`, `website/portal.css`, `website/staff.css`, bukan `styles.css` dan `cinematic.css` milik prototipe.

**13.2 Jadikan `test:uat-roles` benar-benar menguji role**

Hapus assertion tautologis. Untuk setiap dari tujuh role, uji **matriks izin**: satu aksi yang seharusnya diizinkan dan satu yang seharusnya ditolak, lewat HTTP dengan sesi role tersebut. `server/access-matrix.test.js` sudah ada dan bisa jadi titik awal; yang kurang adalah pengujian lewat lapisan HTTP.

**13.3 Perluas `security:check`**

Tambahkan: pemindaian `website/` untuk pola email dan kata sandi literal; pemeriksaan bahwa tidak ada `*.test.js` atau modul server di bawah `website/`; dan `npm audit --omit=dev` sebagai gerbang.

**13.4 Ganti pengukuran performa dengan yang relevan**

Ukur waktu dan jumlah query `GET /api/registrations` pada dataset berisi minimal 200 pendaftar, serta ukuran transfer halaman portal. Dua angka itu yang akan menangkap E-01 dan E-03.

**13.5 Hentikan pola elemen-untuk-test**

Setelah 9.1 selesai, tidak boleh ada lagi elemen yang dipertahankan semata agar assertion lulus. Test menyesuaikan diri dengan UI, bukan sebaliknya.

---

### Tahap 14 — Skalabilitas (P1–P2)

**14.1 Tulis ulang daftar pendaftaran sebagai satu query berpaginasi**

Ganti `store.list()` dengan `store.list({ search, status, page, pageSize })` yang menjalankan satu query dengan `WHERE`, `ORDER BY`, `LIMIT`, `OFFSET`, plus satu query `COUNT`. Daftar tidak perlu memuat dokumen, catatan, dan tindak lanjut — itu hanya diperlukan saat satu pendaftar dibuka.

Rapikan juga tipe kembalian `listForStaff` menjadi satu bentuk konsisten.

**Selesai jika:** jumlah query untuk satu halaman daftar tidak bergantung pada jumlah pendaftar; pencarian dan filter berjalan di SQL; ukuran respons tidak tumbuh mengikuti total pendaftar.

**14.2 Pagination untuk daftar lain**

Terapkan pola yang sama pada artikel, akun, santri, invoice, visa, inventaris, maddah, dan materi. Keluarkan `body` dari respons katalog artikel.

**14.3 Cache dan kompresi aset statis**

Tambahkan `Cache-Control` dan `ETag` di `server/http/static.js`, serta gzip/brotli. Satukan skema versioning aset supaya `website.css` tidak diminta sebagai dua URL berbeda.

Pertimbangkan memecah `portal.css` (82 KB) dan `portal.js` (76 KB) agar halaman internal tidak memuat kode untuk modul yang tidak dibukanya.

**14.4 Index database**

Migrasi baru: index pada `student_parent_accounts(parent_account_id)`, `course_enrollments(course_id)`, dan `student_id` untuk `student_achievements`, `student_evaluations`, `student_violations`.

**14.5 Rate limit dan kuota bersama**

Pindahkan state rate limit dan kuota AI ke penyimpanan bersama jika deployment akan memakai lebih dari satu instance. Tambahkan rate limit pada `invitations/accept` dan `password-reset`.

---

### Tahap 15 — Distribusi dan konten (P1–P2)

**15.1 Open Graph dan Twitter Card**

Tambahkan `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, dan padanan Twitter pada seluruh halaman publik. Untuk `article.html`, tag harus mencerminkan artikel yang dibuka, yang berarti nilainya tidak bisa statis (lihat 15.3).

**15.2 Sitemap dan robots yang benar**

URL absolut di `sitemap.xml` dan `robots.txt`. Tambahkan URL artikel yang berstatus `published`, dan buat sitemap ikut diperbarui saat artikel diterbitkan. Tambahkan `lms.html` dan `operations.html` ke daftar `Disallow`.

**15.3 Artikel yang dapat ditemukan dan dibagikan**

Sediakan HTML awal untuk `article.html` dari server, minimal judul, deskripsi, dan tag Open Graph, sehingga crawler dan pratinjau WhatsApp mendapat isi. Render kaya di klien tetap boleh di atasnya.

**15.4 Kemampuan editorial**

- Aktifkan kolom `author_account_id` yang sudah ada: `SELECT` di store, kembalikan lewat API, tampilkan sebagai byline sesungguhnya. Hapus byline tetap `Tim Redaksi Hamasah International`.
- Putuskan format isi artikel: Markdown terbatas atau editor kaya dengan sanitasi. Tanpa ini "Pena Hamasah" tidak dapat memuat tulisan yang layak.
- Isi konten nyata. Satu artikel stub tidak cukup untuk seksi yang dipromosikan di landing page.

---

### Tahap 16 — Pengerasan dan keputusan sisa (P2–P3)

- **Prototipe lama.** Putuskan nasib `/proposal/` dan `/hamasah/`. Jika dihapus, hapus juga rutenya, `index.html`/`styles.css`/`app.js`/`cinematic.css`/`proposal.css` di root, dan perbarui `.vercelignore` supaya Vercel men-deploy aplikasi yang sebenarnya.
- **Worker visa.** Sambungkan `scripts/visa-reminder-worker.js` ke `operationsService` dan notification service nyata. Ubah default `notify` supaya **tidak** menandai terkirim ketika tidak ada pengirim. Berikan `stateStore` yang persisten.
- **Notifikasi.** Tambahkan jenis untuk perubahan status pendaftaran, dokumen perlu revisi, pembayaran diterima, dan visa mendekati kedaluwarsa. Putuskan apakah kanal WhatsApp diperlukan.
- **scrypt.** Naikkan parameter dari default Node, ukur dampaknya terhadap waktu login.
- **Mata uang.** Tambahkan kolom mata uang dan kurs jika transaksi EGP akan dicatat.
- **404.** Berikan komposisi yang konsisten setelah style inline dipindah.

---

## 7. Yang sudah baik dan tidak perlu diubah

Supaya perbaikan tidak merusak yang sudah benar:

- **Tidak ada overflow horizontal** di mobile pada landing page (`scrollWidth 375 = clientWidth 375`). Perbaikan Tahap 5 dan 8 bertahan.
- **Guard sesi saat pemuatan halaman bekerja.** Token tidak valid menghasilkan konsol tersembunyi, form login muncul, dan sessionStorage dibersihkan. API konsisten menolak dengan 401.
- **Arsitektur route bersih.** Satu daftar route dengan `permission` dan `session` deklaratif, diperiksa sebelum handler. Role diambil dari sesi, bukan dari isi request.
- **Penanganan path traversal di `static.js` teliti**, termasuk normalisasi backslash untuk Windows, dengan komentar yang menjelaskan alasannya.
- **Nomor dokumen atomik** lewat `document_counters` dengan `INSERT` tanpa `ON CONFLICT`, sehingga tabrakan gagal keras alih-alih menimpa data.
- **Migrasi berversi** dengan penolakan berkas yang sudah diterapkan lalu diubah, plus mode baseline.
- **Row Level Security aktif di semua tabel**, menutup Data API Supabase.
- **Header keamanan** lengkap dan disusun dari konfigurasi, bukan string panjang. CSP-nya ketat — itu justru yang mengungkap A-01, dan kekuatannya harus dipertahankan.
- **Payload notifikasi terenkripsi** dan token tidak pernah dicetak ke log.
- **Koreksi berjejak** untuk invoice dan rekam jejak santri, dengan alasan wajib minimal 5 karakter di level database.
- **Validasi formulir pendaftaran** menampilkan error inline dan memindahkan fokus ke field bermasalah.

---

## 8. Checklist verifikasi

Dijalankan setelah setiap tahap, bukan hanya di akhir.

**Render dan CSP**

- [ ] Console browser bersih dari pelanggaran CSP pada 16 halaman.
- [ ] `grep -c 'style="' website/*.html` mengembalikan 0.
- [ ] Tidak ada `<script>` tanpa atribut `src`.
- [ ] Portal tidak menampilkan heading atau daftar santri ganda.

**Fungsi**

- [ ] Formulir kontak menghasilkan efek yang dapat diperiksa; kegagalan menampilkan error.
- [ ] Setiap endpoint di `server/routes/` punya UI, atau tercatat sengaja tanpa UI beserta alasannya.
- [ ] Berkas yang diunggah dapat dibuka oleh pihak yang berhak, dan ditolak untuk yang lain.
- [ ] Sesi yang kedaluwarsa di tengah pemakaian mengembalikan pengguna ke layar login.

**Data dan privasi**

- [ ] Enam URL di tabel C-02 mengembalikan 404.
- [ ] Tidak ada email atau kata sandi literal di `website/`.
- [ ] Kebijakan privasi ada, tertaut, dan versinya tersimpan saat persetujuan.
- [ ] Rekam jejak santri menyimpan pelaku pencatatan.

**Tampilan**

- [ ] Token warna memakai emas `#E7B10C` dan charcoal `#363638`.
- [ ] Seluruh pasangan teks/latar diukur dengan skrip: normal ≥ 4,5 : 1, besar ≥ 3 : 1.
- [ ] Kontrol interaktif mencapai tinggi praktis minimum di semua halaman.
- [ ] Tinggi dokumen `index.html` mobile di bawah target.
- [ ] 360/390/768/1024/1440 px, zoom 200%, portrait dan landscape.

**Performa**

- [ ] `GET /api/registrations` dengan 200 pendaftar: jumlah query konstan.
- [ ] Aset statis mengirim `Cache-Control`, `ETag`, dan terkompresi.
- [ ] Halaman internal tidak memuat `website.css` dua kali.

**Distribusi**

- [ ] Tautan yang dibagikan ke WhatsApp menampilkan pratinjau lengkap.
- [ ] `sitemap.xml` memakai URL absolut dan memuat artikel terbit.
- [ ] Artikel dapat dibaca crawler tanpa JavaScript.

**Alat uji**

- [ ] `test:browser-contract` benar-benar membuka browser dan membaca CSS yang tepat.
- [ ] `test:uat-roles` menguji izin tujuh role lewat HTTP, tanpa assertion tautologis.
- [ ] `security:check` memindai `website/` dan menjalankan `npm audit`.
- [ ] Tidak ada elemen DOM yang dipertahankan hanya demi assertion.

**Per role**

- [ ] Admin, petugas pendaftaran, guru, pengawas, keuangan, wali, dan santri diperiksa pada sesi masing-masing, bukan dengan akses admin.

---

## 9. Batas dokumen ini

- Isi workspace internal setelah login belum diperiksa pada sesi ini. Temuan internal berasal dari sumber dan dari shell yang ter-render, bukan dari penelusuran seluruh tab dan modal. **Harus ada audit lanjutan dengan sesi tiap role setelah masalah kredensial pada C-01 dibereskan.**
- Rasio kontras untuk badge di atas foto diukur terhadap permukaan buram terdekat, bukan terhadap piksel foto. Yang pasti benar adalah scrim-nya hilang.
- Tidak ada pengujian terhadap database production atau staging, provider email nyata, storage Supabase, domain HTTPS, atau screen reader nyata.
- Jumlah temuan bukan ukuran mutu kerja sebelumnya. Sebagian besar temuan di sini ada justru karena delapan tahap sebelumnya sudah menutup lapisan permukaan, sehingga lapisan yang lebih dalam kini terlihat.
