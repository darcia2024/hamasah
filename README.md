# Penawaran Rancangan Digital Ekosistem Hamasah International (by Dar Dev)
### Disusun oleh: Dar Developer untuk Mendukung Visi Hamasah International

[![Test](https://github.com/darcia2024/penawaran-konsep-mediator/actions/workflows/test.yml/badge.svg)](https://github.com/darcia2024/penawaran-konsep-mediator/actions/workflows/test.yml)

Rancangan 1 Website Terpadu dengan 2 Layanan Utama (**Publik & App Portal**) dari Dar Developer untuk menyederhanakan pendaftaran, akademik, operasional staff, otomatisasi invoice & kuitansi, serta transparansi wali santri di Mesir.

---

## Struktur Arsitektur Resmi : 1 Website Terpadu (2 Layanan Utama)

### LAYANAN 1 : PUBLIK & PENDAFTARAN (Hamasah International)
**Layanan publik terdepan untuk masyarakat luas, calon santri, dan calon wali:**
- **Profil Lembaga:** Visi misi pimpinan lembaga dan galeri Kairo.
- **Informasi Program:** Brosur digital lengkap program bimbingan studi Al-Azhar.
- **Alur Pendaftaran & Persiapan Keberangkatan:** Panduan tahapan pendaftaran dari awal hingga keberangkatan.
- **Akun Registrasi Keberangkatan Calon Santri:** Akses calon santri untuk cek progres dokumen, visa, jadwal terbang, dan panduan Kairo (Pasti Berangkat).
- **Pusat Informasi & AI Konsultan:** Tanya jawab cerdas 24 jam serta kontak WhatsApp resmi.
- **Artikel Berita Kegiatan Mesir:** Dokumentasi kegiatan santri di Kairo yang dapat ditulis langsung oleh pengurus (CMS Mandiri).

### LAYANAN 2 : APP PORTAL TERINTEGRASI (App Portal Hamasah International)
**Layanan aplikasi internal terproteksi login enkripsi berbasis peran (Role-Based Access):**

1. **Portal Keluarga Hamasah (Wali Santri / Portal Keluarga):**
   - Monitoring absensi harian (Sholat Subuh berjamaah 98%).
   - Capaian tahfidz & perkembangan belajar (Rata-rata Mumtaz 94, Hafalan 7 Juz Mutqin).
   - Catatan evaluasi adab oleh ustaz pembina asrama Hay Asyir.
   - Unduh dokumen rapor resmi semester Al-Azhar format PDF.
   - Foto dan update kegiatan harian santri di Kairo.
   - Unduh invoice & kuitansi sah pembayaran berstempel format PDF.

2. **Portal Akademik Hamasah (Santri, Pembina & Pengawas / Portal Akademik):**
   - **LMS Video Talaqqi Santri:** Video pembelajaran talaqqi yang dirancang khusus Hamasah International dengan kontrol interaktif, modul materi kitab PDF, silabus kurikulum terstruktur, dan AI Study Partner 24 jam untuk rangkum materi dan konsultasi istilah keilmuan Islam.
   - **Dashboard Rekam Jejak Belajar:** Pemantauan kurikulum talaqqi dan roadmap akademik santri dari awal bergabung (Dauroh Ta'hili) hingga target wisuda sarjana Al-Azhar Kairo (2030).
   - **Laporan Kegiatan Santri di Mesir:** Log aktivitas harian (Subuh berjamaah, Markaz Lughoh, talaqqi Rawaq Al-Azhar, katering asrama, dan mudzakarah malam).
   - **Pencapaian & Achievement:** Portofolio piagam digital, syahadah tahfidz bersanad, dan penghargaan keteladanan asrama.
   - **Disiplin, Presensi & Evaluasi Pengawas:** Rekap kehadiran sholat berjamaah (98.4%), catatan pelanggaran (0 kasus / bersih), dan lembar evaluasi jangka panjang musyrif asrama.
   - **Fitur Pembina:** Kelola materi video talaqqi, bagikan modul kitab klasik, evaluasi tugas berkala, serta susun catatan bimbingan adab santri.

3. **Portal Operasional Hamasah (Staff & Admin / Portal Operasional):**
   - **Auto Financial Generator:** Pembuatan otomatis invoice SPP (INV/HI/2026/XXXX) dan kuitansi sah digital PDF (KWT/HI/2026/XXXX).
   - **Auto-Sync Portal & WA:** Bukti pembayaran langsung tampil di dashboard wali (Portal Keluarga) dan terkirim ke WhatsApp resmi wali.
   - **Berkas Visa Santri:** Tracking paspor, legalisasi 4 kementerian di Jakarta, dan masa berlaku visa pelajar Mesir.
   - **Generate Akun Keberangkatan:** Pembuatan instan akun calon santri untuk akses registrasi keberangkatan di Layanan Publik.
   - **Logistik Asrama Kairo:** Inventaris fasilitas kamar santri ber-AC dan katering harian di Hay Asyir.

---

## Matriks Akses Berbasis Peran (Role-Based Access)
- **Calon Wali & Calon Santri:** Layanan 1 (Publik & Pendaftaran)
- **Wali Santri:** Layanan 2 (Portal Keluarga)
- **Santri:** Layanan 2 (Portal Akademik)
- **Pembina & Musyrif:** Layanan 2 (Portal Akademik)
- **Staff & Admin Operasional:** Layanan 2 (Portal Operasional)

---

## Roadmap Pengembangan 1 Bulan (4 Pekan Intensif)
- **PEKAN 1 (Hari 1 - 7):** Layanan 1 (Publik, Profil Lembaga, Berita Kegiatan Mesir & Akun Keberangkatan)
- **PEKAN 2 (Hari 8 - 14):** Layanan 2 (Portal Operasional: Staff, Logistik Asrama & Auto Invoice/Kuitansi PDF)
- **PEKAN 3 (Hari 15 - 21):** Layanan 2 (Portal Keluarga: Monitoring Wali Santri Hay Asyir & Kuitansi Sah)
- **PEKAN 4 AWAL (Hari 22 - 26):** Layanan 2 (Portal Akademik: Santri, Musyrif & LMS AI Study Partner)
- **PEKAN 4 AKHIR (Hari 27 - 30):** Integrasi Database Terpadu, Single SSO, Pengujian & Go-Live

---

## Cara Mencoba Aplikasi
Prototipe proposal lama (landing di root, `/proposal`, `/hamasah`) sudah dihapus (keputusan KR6, 22 September 2026). Aplikasi yang sebenarnya ada di `website/` dan dijalankan server Node:

1. `npm run dev` (database lokal berisi data contoh), lalu buka alamat yang dicetak di terminal.
2. Lihat `IMPLEMENTATION_STATUS.md` bagian "Menjalankan secara lokal" untuk akun dev dan perintah lain.
