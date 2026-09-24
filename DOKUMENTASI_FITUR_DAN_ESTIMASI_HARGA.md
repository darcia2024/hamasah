# DOKUMENTASI LENGKAP FITUR & ESTIMASI HARGA PEMBUATAN WEBSITE

> **Arsip.** Dokumen ini dicatat untuk riwayat dan tidak lagi menjadi pegangan kerja. Cara
> menjalankan sistem yang berlaku ada di `RUNBOOK.md` di akar repo.

## Digital Ekosistem Terpadu: Hamasah International Kairo (By Dar Developer)

---

## 1. Ringkasan Eksekutif & Konsep Platform

Website ini dirancang bukan sekadar sebagai brosur digital statis (company profile biasa), melainkan sebuah **Ekosistem Digital Terpadu Berbasis Web App (Enterprise Educational & Operations Platform)** dengan konsep arsitektur:

> **"1 Website Terpadu dengan 2 Layanan Utama dalam Single Domain"**
> - **Layanan 1 (Publik)**: Pusat Informasi, Representasi Lembaga, Edukasi Studi Al-Azhar, dan Gerbang Registrasi Keberangkatan Calon Santri.
> - **Layanan 2 (Portal Member & Operasional)**: Sistem Aplikasi Terproteksi Single Sign-On (SSO) untuk Wali Santri (Portal Keluarga), Santri & Musyrif (Portal Akademik), serta Pengurus Cabang Kairo & Jakarta (Portal Operasional & Keuangan).

Platform ini memposisikan Hamasah International sebagai lembaga mediator dan pembimbing studi resmi Al-Azhar Kairo yang kredibel, modern, transparan, dan bertaraf internasional.

---

## 2. Inventarisasi Lengkap Seluruh Modul & Fitur di Website

Berikut adalah rincian fitur dan komponen teknis yang ada di dalam website ini:

### A. Komponen Global, Navigasi & Identitas Visual
1. **Lattice Navigation Bar (Header Sticky & Blur Efek)**:
   - Penempatan logo resmi Hamasah International beresolusi tinggi.
   - Menu navigasi modular: Struktur 2 Layanan, Layanan Publik & Pendaftaran, Asisten AI, Portal Keluarga, Portal Akademik, Portal Operasional, Kabar Berita Mesir, dan Roadmap Pengerjaan.
   - Tombol CTA utama: *"Diskusikan Bersama Dar Dev"*.
   - Menu Navigasi Mobile Responsif (Drawer dengan backdrop filter).
2. **Sistem Desain & Tipografi Kelas Dunia**:
   - Tipografi utama: *Plus Jakarta Sans* dengan skala hierarki presisi.
   - Palet warna resmi: *Hamasah Royal Gold* (`#E7B10C`) dan *Charcoal Warm Dark* (`#363638` / `#1E1D1C`).
   - Pendekatan visual *Anti-Slop Luxury Editorial*: grid asimetris, kartu konten dengan kontras tinggi, micro-badge berlatar subtle, dan micro-interaction tanpa elemen murahan.
   - Animasi scroll terpadu (Fade in up saat elemen memasuki viewport).

### B. Hero Section (Pintu Masuk Representasi Lembaga)
1. **Bilingual Eyebrow Tag**: Penegasan status sebagai mediator studi terpercaya Al-Azhar Kairo.
2. **Headline Otoritatif & Sub-Headline Persuasif**: Menjelaskan jaminan pendampingan dari tanah air hingga mendarat dan mukim di Kairo.
3. **Dual Action Button**: Akses langsung ke Layanan Publik atau simulasi portal internal.
4. **4 Kartu Metrik Kunci (KPI Showcase)**:
   - 98% Presensi Sholat Berjamaah Santri.
   - 100% Legalitas Berkas Resmi Kementerian & KBRI.
   - 24/7 Monitoring Musyrif Asrama Hay Asyir.
   - 10 Detik Otomatisasi Invoice & Kuitansi Sah PDF.

### C. Seksi Arsitektur: 1 Website dengan 2 Layanan Utama
1. **Peta Visual Arsitektur 2 Kolom Komparatif**:
   - Membandingkan alur pengunjung umum (Layanan 1) dengan alur pengguna berotentikasi (Layanan 2).
   - Menjelaskan keuntungan single domain: 1 nama domain resmi, hemat biaya hosting, database terpusat, dan satu kali maintenance.
2. **4 Kartu Peran Pengguna (Stakeholders View)**:
   - Tampilan manfaat khusus untuk Calon Santri, Wali Santri di Indonesia, Musyrif Pembina Asrama di Kairo, dan Pengurus Lembaga.

### D. Modul 1: Layanan Publik & Sistem Pendaftaran Keberangkatan
1. **Brosur Digital Interaktif**:
   - Rincian estimasi biaya bimbingan dan SPP bulanan (Rp2.500.000/bulan mencakup asrama ber-AC Hay Asyir, katering 3x sehari, dan halaqah talaqqi).
   - Simulasi alur pengurusan visa pelajar, paspor, dan tiket kloter penerbangan.
2. **Sistem Akun Registrasi Keberangkatan Calon Santri (Kartu Digital Interaktif)**:
   - Tampilan kartu identitas registrasi digital (#HI-2026-08492).
   - Badge status dinamis: *"BERKAS TERVALIDASI · SIAP BERANGKAT"*.
   - 3 Blok Data Lapangan:
     - Estimasi Kloter Penerbangan (15 September 2026).
     - Pembekalan Bahasa (Tahdid Mustawa Markaz Lughoh).
     - Status Kelengkapan Dokumen (Ijazah, Akta, Paspor, Legalisasi Kemenag & Kemenlu).
3. **Stepper 4 Tahap Menuju Kairo (Pasti Berangkat)**:
   - Tahap 01: Registrasi Online & Verifikasi Awal.
   - Tahap 02: Validasi Berkas & Pemantapan Bahasa.
   - Tahap 03: Penerbitan Visa Pelajar & Tiket Kloter.
   - Tahap 04: Terbang Bersama & Penjemputan ke Asrama Hay Asyir.
4. **Asisten AI Konsultan Publik (Chatbot Interaktif 24/7)**:
   - Basis pengetahuan cerdas menjawab pertanyaan seputar biaya, syarat umur, fakultas Al-Azhar, asrama Hay Asyir, durasi kuliah, hingga estimasi pengerjaan web.
   - Opsi pengatur gaya jawaban: Mode *"Ringkas"* dan Mode *"Detail"*.
   - Tombol eskalasi langsung ke WhatsApp Admin Resmi.

### E. Modul 2A: Portal Keluarga Hamasah (Wali Santri Dashboard)
1. **Header Identitas Santri Mukim**: Menampilkan nama santri (Ahmad Raihan), lokasi asrama (Asrama 1 Hay Asyir), dan nama musyrif penanggung jawab (Ustaz Farhan Abdullah, Lc.).
2. **Trio Indikator Utama Real-time**:
   - Stamina & Kesehatan Fisik (Status: Prima, bugar).
   - Presensi Sholat Subuh Berjamaah (98% tepat waktu di masjid asrama).
   - Capaian Tahfidz Al-Qur'an (7 Juz Mutqin bersanad).
3. **Log Catatan Aktivitas Harian Santri (Interactive Timeline)**:
   - Tab Filter: Aktivitas Hari Ini, Kemarin, dan Rekap Pekanan.
   - Rincian aktivitas: Sholat Subuh, kelas Markaz Lughoh, makan siang katering asrama, halaqah talaqqi matan Fathul Qorib di Rawaq Al-Azhar, dan mudzakarah adab malam hari.
4. **Fitur Interaktif "Kirim Doa untuk Ananda"**:
   - Form wali santri untuk mengirim pesan doa langsung yang tersimpan ke catatan mutaba'ah malam musyrif.
5. **Modal Rapor Digital Santri (Format Cetak / Simpan PDF)**:
   - Tabel evaluasi bidang: Fiqih Syafi'i (Mumtaz 95), Nahwu Shorof (Mumtaz 92), Bahasa Arab Fusha (Mumtaz 94), Tahfidz (Mumtaz 96), dan Adab Keseharian (Predikat A).
   - Catatan musyrif pembina asrama tentang perkembangan akhlak dan solusi kendala adaptasi santri di Kairo.
   - Validasi keamanan SHA-256 dan tombol cetak PDF instan.

### F. Modul 2B: Portal Akademik & Talaqqi Turats (Santri & LMS)
1. **LMS Video Player Talaqqi Terstruktur**:
   - Pemutar video materi kajian kitab Fathul Qorib dan Al-Ajurrumiyyah bersama ulama Al-Azhar.
   - Playlist silabus bab pelajaran terstruktur dengan indikator durasi dan status tuntas.
   - Akses unduh modul kitab format PDF.
2. **AI Study Partner Terpadu**:
   - Asisten khusus santri untuk konsultasi tarkib nahwu, pemahaman ibarat kitab klasik, dan faedah fiqih mazhab Syafi'i.
3. **Visual Roadmap Studi Sarjana (5 Fase Perjalanan Santri)**:
   - Fase 01: Dauroh Ta'hili & Karantina Bahasa (Juli 2026 - Tuntas).
   - Fase 02: Ujian Muadalah Ijazah & Kedatangan Kairo (Agustus 2026 - Tuntas).
   - Fase 03: Talaqqi Kitab Turats & Markaz Lughoh (September 2026 - Berjalan).
   - Fase 04: Kuliah Reguler S1 Syari'ah Islamiyah Al-Azhar (Target 2027).
   - Fase 05: Wisuda Sarjana Lc. Al-Azhar Kairo (Target 2030).
4. **Hall of Fame & Penghargaan Santri Terdisiplin**:
   - Banner apresiasi santri teladan bulanan untuk memotivasi iklim belajar positif.

### G. Modul 2C: Portal Operasional & Keuangan Staff (Management Console)
1. **Tiga Panel KPI Operasional Utama**:
   - Total Penerimaan Kas SPP Bulanan (Rupiah).
   - Total Santri Aktif Mukim (Asrama Hay Asyir & Hay Sabi).
   - Tracking Berkas Visa Pelajar On-Progress di Jakarta & KBRI Kairo.
2. **Buku Besar Ledger Transaksi Keuangan**:
   - Tabel riwayat pembayaran SPP Bulanan dan Biaya Perpanjangan Iqomah (Visa).
   - Filter pencarian santri, kode transaksi, dan status lunas.
3. **Auto Financial Generator (Pembuat Invoice & Kuitansi PDF Instan 10 Detik)**:
   - Form input: Pilih jenis dokumen (Kuitansi Sah / Invoice Tagihan), nama santri, nominal, dan bulan periode.
   - Tombol satu klik: *"Generate Dokumen Sah ↗"*.
4. **Modal Pratinjau Dokumen Keuangan Berstandar Desain Internasional**:
   - Desain minimalis monokrom mewah sesuai standar corporate finance global.
   - Baris identitas resmi lembaga (Hamasah International Kairo, Markaz Khidmat Thalabah, Hay Asyir).
   - Tipografi raksasa "INVOICE" atau "KUITANSI RESMI".
   - Metadata lengkap: No. Referensi Dokumen, Nama Wali, Nama Santri, Tanggal Terbit, Badge Status *"LUNAS SAH"*.
   - Tabel perincian item transaksi bergaris tipis elegan.
   - Watermark stempel resmi Hamasah International dan tanda tangan digital Finance Director.
   - Kode enkripsi verifikasi SHA-256 untuk memastikan keaslian dokumen dari manipulasi.
   - Tombol cetak langsung ke printer atau simpan PDF resolusi tinggi.

### H. Modul Kabar & Berita Mesir (CMS Mandiri Pengurus)
1. **Sistem Filter Kategori Berita**: Keberangkatan, Talaqqi Kairo, Dauroh & Akademik, Asrama & Komunitas.
2. **Grid Kartu Berita Editorial**: Thumbnail dokumentasi Kairo, tanggal terbit, nama penulis musyrif, dan ringkasan isi.
3. **Modal Baca Artikel Lengkap**: Tampilan baca editorial fokus dan bersih.
4. **Modal Tambah Artikel Baru (Simulasi CMS Mandiri)**: Pengurus dapat membuat artikel berita baru langsung dari browser tanpa perlu menyentuh baris kode program.

### I. Modul Roadmap Implementasi (Sprint 1 Bulan / 30 Hari)
1. **Pipa Alur Peluncuran Bertahap (Visual Stepper Track)**:
   - Indikator progres interaktif 5 sprint pengerjaan.
2. **5 Rincian Fase Kerja Terstruktur**:
   - **Pekan 1 (Hari 1 - 7)**: Layanan 1 Publik & Pendaftaran.
   - **Pekan 2 (Hari 8 - 14)**: Layanan 2 Operasional & Keuangan Staff.
   - **Pekan 3 (Hari 15 - 21)**: Layanan 2 Portal Keluarga & Rapor Digital.
   - **Pekan 4 Awal (Hari 22 - 26)**: Layanan 2 Portal Akademik Talaqqi LMS.
   - **Pekan 4 Akhir (Hari 27 - 30)**: Integrasi Single SSO, Enkripsi, Uji Stabilitas & Go-Live.
3. **Bantalan Garansi Eksekutif Dar Dev**:
   - 100% Hak Milik Source Code & Database.
   - Pendampingan teknis dan monitoring server.
   - Kemudahan skalabilitas fitur masa depan.

### J. Modul Diskusi & Kontak Resmi
1. **Modal Konsultasi Dar Developer**: Form eskalasi langsung ke WhatsApp tim developer.
2. **Footer Komprehensif**: Navigasi sitemap lengkap, hak cipta, dan identitas pengembang.

---

## 3. Analisis Kompleksitas Teknis & Beban Kerja

Untuk mewujudkan website seperti ini dari nol hingga tahap produksi (production-ready) dengan durasi **1 bulan (4 pekan kerja intensif / ~160 - 200 jam kerja)**, komponen teknis yang harus dikerjakan meliputi:

1. **Desain Sistem & UI/UX (Bespoke / Custom Design)**:
   - Bukan template WordPress atau theme murah. Menggunakan sistem desain khusus (*design system token*, tipografi custom, layout asimetris, antarmuka portal aplikasi).
   - Estimasi jam kerja: **40 jam**.

2. **Frontend Development & Responsive Engineering**:
   - HTML5 semantik, arsitektur CSS modern (Grid, Flexbox, CSS Variables, Clamp fluid typography), dan vanilla JavaScript modular tanpa dependensi berat (loading kilat di bawah 1.5 detik).
   - Responsive design diuji di 4 breakpoint: Mobile (360px - 430px), Tablet (768px - 1024px), Desktop Laptop (1280px - 1440px), dan Monitor Lebar (1920px).
   - Estimasi jam kerja: **60 jam**.

3. **Interaktivitas Aplikasi Web (Web App Logic)**:
   - State management untuk tab navigasi portal keluarga dan akademik.
   - Mesin kalkulasi dan generator dokumen PDF kuitansi/invoice dengan validasi stempel dan verifikasi kode.
   - Sistem filter kategori berita dan generator kartu artikel dinamis.
   - Mesin interaktif Asisten AI berbasis pencarian kata kunci semantik dan context fallback.
   - Estimasi jam kerja: **45 jam**.

4. **DevOps, Security Hardening, & Deployment**:
   - Setup repository Git, CI/CD pipeline, deploy ke Cloud Platform (Vercel / VPS), konfigurasi Custom Domain DNS, SSL Enkripsi HTTPS, optimasi kompresi aset gambar WebP.
   - Estimasi jam kerja: **15 jam**.

**Total Jam Kerja Efektif: ~160 Jam Kerja Profesional.**

---

## 4. Penentuan Estimasi Harga yang Cocok di Pasar

Berdasarkan analisis cakupan fitur, kualitas desain editorial, fungsionalitas portal aplikasi internal, serta nilai bisnis riil yang didapatkan oleh lembaga Hamasah International:

### A. Nilai Bisnis bagi Klien (Hamasah International)
- **Kredibilitas Institusi Naik Drastis**: Wali santri yang menyekolahkan anaknya ke luar negeri (Kairo) membayar puluhan hingga ratusan juta rupiah per tahun. Memiliki website modern dengan portal monitoring membuat mereka yakin 100% bahwa Hamasah adalah lembaga profesional berkelas, bukan agen perorangan ilegal.
- **Efisiensi Biaya Operasional Staf**: Otomatisasi penerbitan kuitansi SPP dan invoice menghemat setidaknya 1-2 orang tenaga admin manual (penghematan gaji staf Rp5.000.000 - Rp8.000.000 setiap bulan).
- **Kepastian Retensi & Rekomendasi**: Orang tua yang puas memantau anaknya lewat Portal Keluarga akan merekomendasikan Hamasah ke jaringan pesantren dan kerabat di tanah air.

### B. Benchmark Harga Pasar Indonesia (Standar Industri 2026)

| Tipe Penyedia Jasa | Kisaran Harga di Pasar | Keterangan Kualitas |
| :--- | :--- | :--- |
| **Freelancer Pemula / Template Murah** | Rp7.000.000 - Rp12.000.000 | Menggunakan template pasaran, desain kaku, fungsionalitas portal terbatas, rawan bug, tanpa branding eksklusif. |
| **Boutique Software Agency (Dar Developer)** | **Rp25.000.000 - Rp40.000.000** | **Custom UI/UX berkelas tinggi, performa kilat, modul web app portal lengkap, otomatisasi PDF, garansi 1 bulan pengerjaan, hak milik penuh source code.** |
| **Enterprise Software House Skala Besar** | Rp65.000.000 - Rp120.000.000+ | Beban overhead korporat tinggi, birokrasi panjang, pengerjaan seringkali molor lebih dari 3-4 bulan. |

---

## 5. Rekomendasi Struktur Paket Penawaran Harga

Untuk memberikan fleksibilitas kepada yayasan/lembaga pengurus Hamasah International, berikut adalah 3 opsi paket penawaran yang sangat realistis dan profesional:

### OPSI 1: PAKET ESSENTIAL (Layanan Publik & Intake Santri)
> **Cocok jika klien ingin fokus pada promosi publik dan pendaftaran awal terlebih dahulu.**
- **Harga Penawaran**: **Rp14.500.000**
- **Waktu Pengerjaan**: 2 Pekan (14 Hari Kerja)
- **Cakupan Fitur**:
  - Website Publik Responsif & Profil Lembaga Kairo.
  - Brosur Digital Interaktif & Alur 4 Tahap Menuju Kairo.
  - Sistem Akun Registrasi Keberangkatan Calon Santri.
  - Kabar Kegiatan Santri di Mesir (CMS Berita).
  - Setup Domain, Hosting Cloud, dan SSL 1 Tahun.
  - Garansi bug fix 1 bulan.

---

### OPSI 2: PAKET PROFESSIONAL (1 Website, 2 Layanan Terpadu) - [SANGAT DIREKOMENDASIKAN]
> **Paket ideal yang mencakup seluruh prototipe yang saat ini telah dibangun dan siap pakai.**
- **Harga Penawaran**: **Rp28.500.000 - Rp35.000.000**
- **Waktu Pengerjaan**: **1 Bulan (4 Pekan Kerja Intensif / 30 Hari)**
- **Cakupan Fitur Penuh**:
  - **Layanan 1 (Publik)**: Seluruh modul website publik, brosur biaya, sistem cek akun santri, dan Asisten AI Konsultan 24/7.
  - **Layanan 2 (Portal Keluarga)**: Dashboard monitoring wali santri, log ibadah Subuh, tahfidz, kirim doa, dan Rapor Digital PDF.
  - **Layanan 2 (Portal Akademik)**: LMS Talaqqi Turats Al-Azhar, AI Study Partner, roadmap wisuda santri.
  - **Layanan 2 (Portal Operasional & Keuangan Staff)**: Auto Financial Generator (Invoice & Kuitansi PDF resmi berstempel dan kode verifikasi SHA-256), Ledger pembukuan SPP bulanan, inventaris asrama Hay Asyir & Hay Sabi.
  - **Single Sign-On (SSO) Role-Based Access Control**.
  - Setup Cloud Deployment (Vercel / VPS), Domain Custom, SSL Enkripsi.
  - Pelatihan Pengurus & Staf Admin (Sesi Training Online / Panduan Penggunaan).
  - 100% Penyerahan Hak Milik Source Code & Database.
  - Garansi Pemeliharaan & Support Teknis selama 3 Bulan.

---

### OPSI 3: PAKET ENTERPRISE (Full Automation & Integrasi WhatsApp API)
> **Paket kelas atas jika lembaga ingin otomatisasi total dengan notifikasi WhatsApp resmi dan payment gateway.**
- **Harga Penawaran**: **Rp48.000.000 - Rp60.000.000**
- **Waktu Pengerjaan**: 1.5 - 2 Bulan (45 - 60 Hari Kerja)
- **Cakupan Tambahan**:
  - Seluruh fitur pada Paket Professional.
  - **Integrasi WhatsApp Business Official API**: Invoice dan kuitansi sah otomatis terkirim langsung ke nomor WhatsApp nomor orang tua begitu diverifikasi admin.
  - **Payment Gateway Otomatis (Midtrans / Xendit)**: Orang tua bisa membayar SPP langsung lewat Virtual Account BCA/Mandiri/BRI, QRIS, atau kartu kredit tanpa konfirmasi manual.
  - Dedicated Cloud Server di Singapura/Jakarta dengan backup harian otomatis.
  - Garansi Pemeliharaan & Support Prioritas selama 12 Bulan (1 Tahun Penuh).

---

## 6. Estimasi Biaya Berjalan (Maintenance & Third-Party Costs)

Selain biaya jasa pengembangan awal (one-time fee), berikut adalah estimasi biaya operasional tahunan yang perlu disiapkan oleh yayasan:

1. **Domain Internasional (`.com` / `.org` / `.id`)**:
   - Biaya: **Rp180.000 - Rp350.000 / tahun**.
2. **Cloud Server & Database (Vercel Pro / VPS DigitalOcean/Biznet)**:
   - Biaya: **Rp200.000 - Rp400.000 / bulan** (~Rp2.400.000 - Rp4.800.000 / tahun).
   - *Catatan: Untuk kapasitas awal 50-200 santri, tier standard cloud sudah sangat cepat dan stabil.*
3. **SSL Certificate**:
   - Biaya: **Gratis (Automated via Cloudflare / Let's Encrypt)**.
4. **Maintenance Retainer (Opsional setelah masa garansi berakhir)**:
   - Biaya: **Rp1.500.000 - Rp2.500.000 / bulan** (Mencakup monitoring uptime 99.9%, backup mingguan, patch keamanan, update konten, dan asistensi teknis darurat).

---

## 7. Kesimpulan & Rekomendasi Final untuk Negosiasi

Untuk proyek penawaran konsep ini kepada pemilik atau dewan pimpinan **Hamasah International**:

1. **Buka Penawaran di Angka**: **Rp35.000.000** untuk Paket Professional Full-Scope (1 Bulan Pengerjaan).
2. **Batas Negosiasi Wajar (Bottom Price)**: **Rp28.500.000**.
3. **Argumentasi Penjualan (Pitching Key Points)**:
   - *"Dengan investasi Rp28.5jt - Rp35jt, Hamasah mendapatkan sistem aset digital permanen milik sendiri yang menggantikan biaya admin manual selamanya, memberikan fasilitas monitoring berkelas bagi wali santri, dan langsung memposisikan Hamasah sebagai mediator nomor satu terpercaya untuk studi Al-Azhar di Indonesia."*
   - Estimasi pengerjaan cepat dan terukur: **1 Bulan (4 Pekan Intensif)**.

---
*Dokumen ini disusun oleh tim pengembang Dar Developer sebagai rujukan spesifikasi teknis dan proposal komersial resmi.*
