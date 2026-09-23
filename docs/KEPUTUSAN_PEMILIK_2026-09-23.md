# Keputusan yang ditunggu dari pengurus Hamasah (23 September 2026)

Sistem pendaftaran, portal wali, konsol petugas, dan LMS sudah selesai dibangun dan diuji.
Yang tersisa bukan pekerjaan pemrograman, melainkan 21 keputusan yang hanya dapat diambil
pengurus Hamasah International. Enam di antaranya menahan situs dibuka untuk umum.

Versi yang dikirim ke pengurus dibuat sebagai halaman terpisah dengan bahasa non-teknis.
Dokumen ini adalah salinannya untuk repo, ditambah rujukan ke tempat dampaknya di kode.

Cara menjawab: cukup sebutkan nomor butir dan jawaban singkat, misalnya `A2: 0812 xxxx xxxx`.

| Bagian | Butir | Menahan rilis publik |
|---|---|---|
| A. Menahan pembukaan ke publik | A1-A6 | ya |
| B. Biaya dan kepemilikan akun | B1-B4 | tidak, tetapi menahan deploy |
| C. Kebijakan isi dan layanan | C1-C7 | tidak |
| D. Operasional dan serah terima | D1-D4 | tidak, kecuali D2 sebelum dipakai staf |

---

## A. Menahan pembukaan ke publik

### A1. Isi kebijakan privasi

Formulir pendaftaran meminta persetujuan atas kebijakan privasi, sementara halamannya masih
kosong. Tujuh bagian yang perlu diisi ada di `website/kebijakan-privasi.html`: data yang
dikumpulkan dan tujuannya, dasar persetujuan, lama penyimpanan, siapa yang dapat mengakses,
cara mencabut persetujuan, penanggung jawab pelindungan data, dan ketentuan calon di bawah umur.

Selama kosong: halaman berstatus draf, diberi `noindex`, dan tidak masuk sitemap.

### A2. Nomor WhatsApp resmi

`WHATSAPP_NUMBER` di `website/kontak.js` masih string kosong, sehingga tombol chat tidak muncul.

### A3. Alamat kantor di Kairo

Situs resmi hamasahinternational.com menulis **48 Zakr Husein, Hay Sabi, Nasr City**. Sistem
menulis **Hay Asyir, Madinat Nasr**. Muncul di beranda, biaya, kontak, dan cek status. Keterangan
foto beranda sudah diubah memakai "Nasr City, Kairo" sampai ada konfirmasi; halaman lain belum.

### A4. Jatah makan di asrama

Situs resmi menyebut makan dua kali sehari; `website/biaya.html` menyebut katering tiga kali
sehari. Menyangkut apa yang dibayar wali.

### A5. Tulisan asli untuk Pena Hamasah

Butuh minimal enam tulisan asli beserta nama penulis. Ini temuan R7.6 yang masih terbuka.
Pilihan: ditulis pengurus, diambil dari situs lama dengan penyuntingan, atau ditulis tim
pengembang berdasarkan bahan dari pengurus.

### A6. Penanggung jawab pelindungan data

Nama, jabatan, dan satu kanal kontak yang dipantau. Tanpa ini, bagian keenam kebijakan privasi
tidak bisa diisi, sehingga A1 ikut tertahan.

---

## B. Biaya dan kepemilikan akun

### B1. Siapa menanggung biaya hosting

Sekitar Rp 80 ribu per bulan untuk platform aplikasi. Database masih di paket gratis Supabase dan
cukup untuk tahap awal, dengan catatan project paket gratis dijeda bila seminggu tidak diakses.

### B2. Alamat situs untuk sistem ini

Domain utama dipakai situs lama, jadi sistem ini sebaiknya di subdomain: `app.`, `portal.`, atau
`daftar.`. Perlu akses pengaturan DNS atau nama pemegangnya. Nilainya masuk ke `APP_BASE_URL`.

### B3. Kepemilikan akun database dan hosting

Seluruh data pendaftar dan pindaian dokumen berada di akun pihak ketiga. Perlu diputuskan apakah
akunnya dibuat atas nama email resmi lembaga sejak awal, atau dipindahkan setelah serah terima.

### B4. Alamat email pengirim resmi

Hanya diperlukan bila pemberitahuan otomatis diaktifkan (keputusan sekarang: manual lewat
WhatsApp). Butuh alamat pengirim pada domain lembaga dan izin menambah catatan DNS.

---

## C. Kebijakan isi dan layanan

### C1. Angka biaya ditampilkan atau tidak

Situs resmi mencantumkan Rp 22 juta keberangkatan dan Rp 1,8 juta per bulan asrama. Sistem
sengaja menulis "dikonfirmasi saat konsultasi". Pilihan: tampilkan dengan tanggal pembaruan,
tetap tanpa angka, atau tampilkan kisaran.

### C2. Klaim "dipercaya ratusan pelajar"

Dipakai di bagian Tentang, diambil dari situs resmi. Perlu dasar angkanya, atau diganti kalimat
tanpa angka.

### C3. Testimoni alumni dan wali

Tiga testimoni di situs resmi belum ada bukti izin, jadi tidak ditampilkan. Pilihan: kumpulkan
ulang dengan izin tertulis, kirim bukti izin yang ada, atau tidak menampilkan testimoni.

### C4. Profil pengurus

Halaman Tentang Kami di situs resmi masih memuat teks contoh bawaan tema beserta nomor telepon
asing. Perlu diputuskan apakah profil pengurus ditampilkan, dan bila ya datanya dikirim.

### C5. Siapa membalas pendaftar dan dalam berapa lama

Pemberitahuan manual lewat WhatsApp sudah diputuskan. Yang belum: petugas utama, cadangannya,
dan target waktu balas.

### C6. Catatan kesehatan santri

Fitur sudah dibangun tetapi dikunci `HEALTH_RECORDS_ENABLED` (default mati). Mengaktifkannya
mensyaratkan kebijakan privasi memuat data kesehatan dan wali diberi tahu.

### C7. Asisten belajar berbasis AI

Adapter sudah siap dengan kuota per akun, penjaga prompt-injection, dan fallback lokal. Memakai
penyedia berbayar berarti ada biaya per pertanyaan dan pertanyaan santri keluar ke penyedia.
Pilihan: pakai penyedia berbayar, atau tetap menjawab dari materi pengajar.

---

## D. Operasional dan serah terima

### D1. Daftar akun internal yang perlu dibuat

Nama, email, dan peran untuk setiap orang. Peran tersedia: admin, petugas pendaftaran, keuangan,
musyrif, guru, wali, santri. Akun dapat dibuat langsung dengan kata sandi awal, atau lewat
undangan email bila email diaktifkan.

### D2. Siapa menguji sistem per peran sebelum dipakai

Ini R8.7 yang masih terbuka. Butuh satu nama per peran dan satu orang yang menyatakan sistem
diterima. Lembar ujinya ada di `docs/PANDUAN_ROLE_DAN_UAT_2026-09-20.md`.

### D3. Lama penyimpanan data pendaftar yang tidak melanjutkan

Usulan: anonimkan setelah 12 bulan tanpa kelanjutan. Jawabannya juga mengisi bagian ketiga
kebijakan privasi (A1).

### D4. Periode penerimaan yang ditampilkan

Formulir menulis "Penerimaan 2026/2027". Perlu dipastikan benar dan ditetapkan siapa yang
memperbaruinya tiap tahun.

---

## Tugas manusia di luar daftar ini

- **R1.0**: memutar kata sandi akun `tester@hamasah.test` bila akun itu pernah ada di staging
  atau production, karena kredensialnya pernah tersaji publik di halaman portal.
- Menjalankan `ALLOW_PRODUCTION_WRITE=I_UNDERSTAND npm run migrate` setiap ada migrasi baru.
  Migrasi 001-041 sudah diterapkan ke production pada 23 September 2026.
