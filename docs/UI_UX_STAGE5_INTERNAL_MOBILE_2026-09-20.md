# Tahap 5 — Shell internal mobile

Tanggal: 2026-09-20

## Perubahan

- Sidebar internal portal, staf, monitoring, LMS, audit, dan operasional diubah menjadi drawer pada viewport di bawah 800px.
- Kondisi awal drawer tertutup; navigasi tidak lagi mengambil hampir seluruh layar sebelum konten.
- Backdrop ditambahkan dan menutup drawer saat ditekan.
- Fokus dipindahkan ke item pertama ketika drawer dibuka, dikunci di dalam drawer saat Tab/Shift+Tab, dan dikembalikan ke tombol saat Escape.
- Topbar mobile diringkas: breadcrumb dan search disembunyikan, aksi memakai target sentuh minimum, profil dipadatkan.
- Shell/workspace tidak membuat overflow horizontal dokumen. Tabel dan tab yang memang lebar tetap memiliki scroll lokal.
- Implementasi shared berada di `website/internal-shell.js`; aturan responsif berada di `website/portal.css`.

## Verifikasi

Pada viewport 390×844, keenam halaman internal memiliki satu tombol drawer, satu backdrop, `aria-expanded="false"`, dan sidebar `aria-hidden="true"` pada kondisi awal.

## Validasi otomatis

- `npm run test:browser-contract` — lulus, 16 halaman.
- `node --check website/internal-shell.js` — lulus.
- `git diff --check` — lulus; peringatan yang muncul hanya konversi akhir baris Git.

---

**Koreksi (21 September 2026, Task R5.1/R5.2):** kutipan `npm run test:browser-contract` ("lulus, 16 halaman") dan `npm run test:uat-roles` di dokumen ini tidak membuktikan apa yang tampaknya dibuktikan. Kontrak lama hanya membaca HTML dengan regex dan memeriksa CSS prototipe di root, tanpa membuka browser. Skrip uat-roles membandingkan array dengan dirinya sendiri dan tidak pernah memakai empat dari tujuh role. Keduanya sudah diganti: pemeriksaan statis kini `npm run test:static-contract`, pembuktian browser `npm run test:browser-contract` (browser sungguhan, 17 halaman x 5 lebar), dan otorisasi per role lewat HTTP `npm run test:role-authorization`. Lihat `docs/REMEDIASI_R5_HASIL_2026-09-21.md`.
