# Tahap 6 UI/UX: Halaman Kerja Internal

Tanggal: 2026-09-20

Tahap ini merapikan isi workspace internal setelah shell desktop dan mobile stabil. Fokusnya adalah membuat keadaan awal mudah dipahami, menonjolkan tugas utama, dan mengurangi metadata dekoratif.

## Perubahan

- **Monitoring**
  - Menambahkan empty state yang menjelaskan bahwa pengguna perlu memilih santri terlebih dahulu.
  - Empty state hilang saat santri dipilih dan dashboard rekam jejak dimuat.
- **LMS**
  - Mengganti klaim statis `Tersinkronisasi Lengkap` dengan status yang mengikuti keadaan nyata.
  - Status awal menjelaskan bahwa santri atau materi belum dipilih, lalu berubah saat materi tersedia atau maddah aktif dibuka.
- **Operasional**
  - Ringkasan utama memakai dua kolom pada desktop.
  - Ringkasan menumpuk menjadi satu kolom pada mobile.
- **Audit**
  - Filter diberi grid responsif, jarak label dan field yang konsisten, serta area aksi yang terpisah.
  - Ringkasan hasil diposisikan sebagai status yang mudah dipindai dan tetap membungkus pada mobile.
- **Staff / pendaftaran**
  - Empty state daftar pendaftar memberi konteks kapan data akan muncul.
  - Metadata pendaftar dipadatkan menjadi dua kolom desktop dan satu kolom mobile.
  - `Simpan status` menjadi aksi utama, sedangkan catatan dan tindak lanjut dikelompokkan sebagai aksi sekunder.
  - Tombol refresh memakai label `Segarkan daftar` dan nama aksesibel yang jelas.

## Verifikasi

- `node --check website/monitoring.js`
- `node --check website/lms.js`
- `node --check website/audit.js`
- `node --check website/staff.js`
- `npm run test:browser-contract` (16 halaman)
- `git diff --check`
- Verifikasi browser lokal:
  - monitoring menampilkan empty state saat pilihan santri masih kosong;
  - LMS menampilkan `Belum memilih santri atau materi` pada keadaan awal;
  - operasi terukur dua kolom pada viewport desktop dan satu kolom pada viewport 390 px;
  - audit memiliki grid filter, area aksi, dan ringkasan hasil;
  - staff memiliki label refresh `Segarkan daftar pendaftar`.

## Catatan

Perubahan ini hanya menyentuh prioritas visual dan state tampilan. Endpoint, izin akses, serta alur penyimpanan tetap menggunakan logika yang sudah ada.

---

**Koreksi (21 September 2026, Task R5.1/R5.2):** kutipan `npm run test:browser-contract` ("lulus, 16 halaman") dan `npm run test:uat-roles` di dokumen ini tidak membuktikan apa yang tampaknya dibuktikan. Kontrak lama hanya membaca HTML dengan regex dan memeriksa CSS prototipe di root, tanpa membuka browser. Skrip uat-roles membandingkan array dengan dirinya sendiri dan tidak pernah memakai empat dari tujuh role. Keduanya sudah diganti: pemeriksaan statis kini `npm run test:static-contract`, pembuktian browser `npm run test:browser-contract` (browser sungguhan, 17 halaman x 5 lebar), dan otorisasi per role lewat HTTP `npm run test:role-authorization`. Lihat `docs/REMEDIASI_R5_HASIL_2026-09-21.md`.
