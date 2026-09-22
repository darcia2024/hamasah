# Hamasah: arah visual landing page

Acuan pengguna: landing page SpaceX. Antislop diterapkan selama pengerjaan.

ENERGY 3 / RHYTHM 3 / MOTION 2.

- Kuning tua (emas #e7b10c) dan hitam arang (#363638) dari logo menjadi warna utama; putih untuk background. Hijau khusus status berhasil, merah khusus peringatan.
- Panorama Kairo menempatkan tujuan pendidikan dalam konteks lokasi; foto ini bukan dokumentasi santri atau foto kampus Al-Azhar.
- Navbar putih bersih (tanpa top bar pengumuman), wordmark emblem kiri, kapsul nav di tengah, CTA pil emas kanan.
- Hero home: eyebrow kecil ber-ikon, judul display tebal (800) dengan sebagian kata di-abu-abukan untuk hierarki, kotak-ikon emas inline sebagai aksen, sub-teks sempit terpusat, lalu CTA emas + outline. Referensi gaya: template "aelixa".
- Kicker/eyebrow di atas judul: teks kecil uppercase tracked warna emas tua + titik kecil, tanpa pill/band. Judul section tebal (700).
- Tone copy: ringkas, aktif, mudah dipahami, tidak kaku. Tanpa em dash.
- Foto profil di semua simulasi (santri, musyrif, wali, penulis berita, avatar) memakai `assets/avatar-hamasah.png` (emblem Hamasah putih di latar emas), bukan foto stok. Foto konten (arsitektur Kairo, galeri, cover artikel) tetap foto asli.
- Asisten AI Hamasah: section `#asisten-ai` di landing (chat simulasi + chip pertanyaan, basis pengetahuan di `HAMASAH_AI_KB` app.js) untuk FAQ calon santri/wali. AI Study Partner di LMS (`#udemy-tab-ai-partner`) untuk bantu santri paham materi kelas (jawaban di `udemyAiAnswer`). Keduanya simulasi keyword-match, siap diganti backend live.
- Plus Jakarta Sans dipertahankan sebagai tipografi proyek.
- Program utama mendapat satu bidang foto besar; dua jalur pendamping berbagi baris pada desktop untuk membedakan hierarki.
- Keunggulan berupa daftar editorial, bukan kumpulan kartu putih; garis tipis memisahkan informasi tanpa dekorasi tambahan.
- Portal dan dialog memakai palet terang tersendiri agar formulir dan data simulasi mudah dibaca.
- Lapisan gelap pada foto menjaga kontras teks; gerakan masuk singkat menandai pergantian bagian dan menghormati reduced motion.
- Menu lengkap menyediakan semua tujuan navigasi pada desktop dan mobile. Escape menutup menu dan dialog.
- Mobile pass (blok `@media (max-width: 700px)` + `430px` di akhir `styles.css`): hanya **tile angka pendek** yang 2 kolom/baris (op-kpi, statistik santri, galeri, langkah roadmap, kartu contoh AI landing). Semua kartu berisi eyebrow/judul + badge + deskripsi → **1 kolom** (family-stats-row, nilai maddah, achievement, fase roadmap, kpi ROI, stakeholder, reassurance).
- Pola universal di mobile: setiap baris flex "judul/eyebrow + pill mengambang" (`.family-stat-head`, `.kabar-title-row`, `.kabar-header-card`, `.op-topbar-meta`, `.santri-activity-head`, header kendala) di-stack `flex-direction: column`, pill `white-space: normal; align-self: flex-start`. Header kartu kendala di-rebuild jadi grid `30px 1fr` (nomor · eyebrow · judul · pill status tiap baris sendiri).
- Topbar dashboard (`.family-topbar`, `.op-dashboard-topbar`, `.santri-topbar`, `.santri-profile-bar`) menumpuk vertikal, `<select>` jadi full-width. Chip AI Study Partner LMS jadi strip scroll horizontal (`nowrap` + `overflow-x:auto`).
- Layout besar (lane, split, workspace, campus) menumpuk 1 kolom; padding & angka display dikecilkan; player video LMS kontrol dipin ke bawah.
- Tabel data lebar (rapor, ledger operasional, kuitansi): header/ringkasan tetap full-width di atas (`.rapor-table-scroll` membungkus hanya `<table>`), hanya tabelnya yang scroll horizontal. Tabel di dalam modal (`.modal-box table`) scroll sendiri.
- Reassurance banner "Kondisi Ananda": di mobile kartu putih bersarang diganti daftar rata (border-top tipis) biar tidak card-in-card. Banner rapor gelap: eyebrow monospace dikecilkan 9.5px biar 1 baris.
- Tidak ada horizontal scroll di viewport 375-768px. Desktop tidak berubah (semua di `@media ≤700px`).

## Foto

- `assets/cairo-skyline.jpg`: waa towaw, [Mosque with minarets against a cityscape](https://unsplash.com/photos/mosque-with-minarets-against-a-cityscape-APACUJ5_plQ), Unsplash License.
- `assets/cairo-arches.jpg`: BassemSaad saad, [Muhammad Ali Mosque, Old Cairo](https://unsplash.com/photos/a-large-building-with-many-arches-glbXDxOAYzQ), Unsplash License.
- Referensi komposisi: [SpaceX](https://www.spacex.com/).

Foto arsitektur bersifat ilustrasi lokasi. Data, harga, artikel, dan testimoni dalam prototype lama belum diverifikasi untuk publikasi.

## Skala bentuk dan tipografi (23 September 2026)

Satu sistem untuk beranda, halaman publik lain, halaman masuk akun, dan konsol internal.
Lapisan penyeragamannya ditulis di akhir `website-public.css` (publik), `website/portal.css`
(internal), `website/auth-pages.css` (masuk akun), dan `website/landing.css` (khusus beranda).

- **Radius:** kartu 20px, kotak kecil dan keadaan kosong 14px, kontrol 12px, tombol dan chip kapsul.
- **Bayangan kartu:** garis rambut `0 0 0 1px rgba(54,54,56,.07)` plus bayangan charcoal lembut.
  Tidak memakai bingkai abu solid, dan tidak ada kartu di dalam kartu.
- **Kontrol:** tinggi 46-48px, cincin fokus emas 3px.
- **Tombol:** tinggi 46-48px, isi emas `#E7B10C` dengan teks charcoal untuk aksi utama,
  garis tepi untuk aksi kedua, tautan berpanah untuk aksi ketiga. Tidak melebar penuh di
  layar lebar kecuali di dalam formulir sempit.
- **Judul:** h1 halaman `clamp(34px, 4.2vw, 50px)`, h1 beranda `clamp(36px, 4.7vw, 58px)`,
  h2 bagian `clamp(30px, 3.4vw, 44px)`, teks pengantar 17-18px, isi 15-16px, label kecil 12-14px.
- **Perataan:** kepala halaman dan judul bagian rata kiri. Tidak ada judul rata tengah.
- **Kapital:** judul, label, dan tombol memakai kapital di awal kalimat. Nama diri, nama peran,
  dan singkatan (LMS, CSV, SPP, PDF) tetap seperti aslinya. Satu maksud memakai satu label;
  ajakan mendaftar selalu "Daftar konsultasi".
- **Irama bagian:** `padding-block: clamp(72px, 9vw, 120px)`, kepala halaman lebih rapat.
- **Keadaan kosong:** bidang solid `surface-container`, tanpa garis putus-putus. Garis putus-putus
  hanya dipakai untuk aksi keluar dari semua perangkat.
- **Gaya di JavaScript:** dilarang. Semua tampilan lewat kelas CSS, kecuali nilai yang memang
  dinamis seperti lebar bilah progres.
