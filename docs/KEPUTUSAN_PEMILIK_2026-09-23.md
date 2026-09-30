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

## Jawaban pengurus (diterima 24 September 2026)

| Butir | Jawaban | Status di sistem |
|---|---|---|
| A1 Kebijakan privasi | Sudah punya dokumen resmi. Santri dan wali hanya melihat dasbor masing-masing. | **Menunggu dokumennya dikirim.** Aturan akses sudah sesuai: wali dan santri hanya bisa membuka santri yang terhubung dengan akunnya (`server/access-matrix.test.js`). |
| A2 WhatsApp resmi | +62 878-9759-1978, satu admin untuk Indonesia dan Mesir | **Diterapkan**: `website/kontak.js`, kartu kantor di `kontak.html`. |
| A3 Alamat | Indonesia: Jl. Karakal RT 003/RW 003, Desa Banjar Sari, Kec. Ciawi, Kab. Bogor, Jawa Barat. Mesir: 32 Sheikh Taha Dinary, 1,3, Hay Sabi, Nasr City | **Diterapkan** di `kontak.html`. "Hay Asyir" diganti "Nasr City" di biaya dan cek status. Perlu dipastikan: arti "1,3" dan apakah asrama berada di alamat yang sama. |
| A4 Makan | Asrama Mesir 2 kali sehari, asrama Indonesia 3 kali | **Diterapkan**: `biaya.html` menulis 2x untuk asrama Kairo. Situs belum menyebut asrama Indonesia sama sekali. |
| A5 Artikel | Akan dikirim pengurus | Menunggu kiriman. |
| A6 Penanggung jawab data | Ust. Aji, Direktur Hamasah International Regional Mesir | Menunggu satu kanal kontak (email atau WA) untuk bagian keenam kebijakan privasi. |
| B2 Domain | Pengurus akan memberi kontak pembuat domain atau developer lama | Menunggu kontak. |
| B4 Email noreply | Boleh | Menunggu akses DNS (B2). Setelah itu: `EMAIL_DRIVER=resend` sesuai `RUNBOOK.md`. |
| C1 Biaya | Ditampilkan langsung; brosur terbaru dikirim dalam beberapa hari | Menunggu brosur. Angka lama tidak dipasang. |
| C2 "Ratusan pelajar" | Tidak perlu disebutkan | **Diterapkan**: kalimat di beranda tanpa angka. |
| C3 Testimoni | Testimoni situs lama karangan developer lama; pengurus akan mengumpulkan yang asli | Tetap tidak ditampilkan sampai ada testimoni asli beserta izin. |
| C4 Profil pengurus | Ditampilkan; data dikirim pengurus | Menunggu nama, jabatan, dan foto. |
| C5 Petugas pendaftaran | Utama Rika Dwi, cadangan Rafah; admin di Mesir dan Indonesia sehingga hampir 24 jam | Dicatat. Kontak menulis "dapat dibalas hampir sepanjang hari". Akun keduanya dibuat bersama D1. |
| C6 Kesehatan | Tampilkan di dasbor pribadi | Disetujui. Nyalakan `HEALTH_RECORDS_ENABLED=true` bersamaan dengan kebijakan privasi resmi yang memuat data kesehatan (A1). |
| C7 AI | "Dikondisikan yang terbaik": cerdas, sesuai materi, tidak melebar | Perlu usulan teknis dan biaya ke pengurus; lihat catatan di bawah. |
| D1 Akun | Akan dikirim | Menunggu daftar. |
| D2 Pengujian | Ust. Aji Nugroho dan Ust. Fauzan Afghani | Dicatat sebagai pemberi persetujuan akhir. Penguji per peran masih perlu ditunjuk. |
| D3 Data pendaftar tidak lanjut | Dihapus setelah jangka waktu tertentu | Menunggu lamanya (misalnya 12 bulan). |
| D4 Periode penerimaan | 2026/2027 benar; diperbarui tiap tahun oleh Ust. Ifdoni | Dicatat. Tidak ada perubahan. |

## Kiriman yang ditunggu dari pengurus (dicatat 24 September 2026)

| No | Kiriman | Butir | Format yang dibutuhkan sistem |
|---|---|---|---|
| 1 | 6 artikel Pena Hamasah | A5 | Per artikel: judul (8-140 karakter), ringkasan 1-2 kalimat, isi, kategori (misalnya Al-Azhar, Panduan Hidup, Kegiatan), **nama penulis**, dan foto sampul opsional beserta keterangan singkat isi fotonya. Lihat catatan penulis di bawah. |
| 2 | Nomor developer company profile (pemegang domain) | B2 | Nama dan nomor kontak. Dibutuhkan untuk subdomain aplikasi (`APP_BASE_URL`) dan catatan DNS email noreply (B4). |
| 3 | Brosur terbaru | C1 | Nominal per program (Kuliah, Ma'had, Hamasah Courses) dan komponen yang sudah termasuk, beserta tanggal berlakunya. |
| 4 | Testimoni wali santri (bila dibutuhkan) | C3 | Nama (atau inisial), hubungan dengan santri, isi testimoni, foto opsional, dan **izin tertulis** untuk dipublikasikan. |
| 5 | Profil pengurus | C4 | Nama, jabatan, foto (tegak, latar polos), dan izin tampil di situs. |
| 6 | Daftar pengelola sistem | D1 | Per orang: nama, email, jabatan, dan peran sistem: admin, petugas pendaftaran, keuangan, musyrif asrama, atau guru. Musyrif juga perlu nama asrama yang dipegang. Rika Dwi dan Rafah (C5) masuk sebagai petugas pendaftaran. |

**Catatan penulis artikel.** CMS kini punya isian "Nama penulis (opsional)" (migrasi 042). Admin
dapat menginput keenam artikel sendiri dan menuliskan nama penulis aslinya; bila dikosongkan,
yang tampil nama akun penginput. Kode boleh online sebelum migrasi 042; isian penulis baru bisa dipakai setelah 042 diterapkan ke production, dan aktif tanpa deploy ulang.

**Catatan C7.** Arah yang sesuai jawaban pengurus: AI berbayar yang hanya boleh menjawab dari materi
pengajar pada maddah tersebut, menolak pertanyaan di luar materi, dan kembali ke jawaban lokal bila
kuota habis atau layanan gagal. Konsekuensinya perlu disetujui dulu: biaya per pertanyaan, dan
kebijakan privasi (A1) harus menyebut bahwa pertanyaan santri diproses penyedia AI di luar negeri.

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

---

## Konfirmasi baru dari audit alur dan isi (29 September 2026)

Audit situs publik menemukan beberapa klaim yang tidak bisa dipastikan dari sisi pengembang.
Sampai dijawab, situs memakai kalimat yang aman (lebih umum). Bila jawabannya "ya", kalimat
lama bisa dipasang kembali.

| No | Pertanyaan | Tampil sekarang | Tempat |
|---|---|---|---|
| E1 | Apakah usia Ma'had memang **13 sampai 30 tahun** untuk jenjang setingkat SMP–SMA? | Tetap "13 sampai 30 tahun" (tidak diubah) | `program-mahad.html`, beranda, jawaban FAQ |
| E2 | Apakah pembayaran memakai **3 termin** (pendaftaran & legalisir, visa & bahasa, pelunasan tiket)? | "Bisa bertahap, jumlah dan jadwal disepakati saat konsultasi" | FAQ `biaya.html` |
| E3 | Apakah uang saku dikirim lewat **rekening penampungan Hamasah** lalu diserahkan tunai dalam EGP? | "Cara kirim dijelaskan saat konsultasi" + peringatan hanya transfer ke rekening yang dikonfirmasi admin | FAQ `biaya.html` |
| E4 | Apakah ada **MoU** dengan pengembalian dana proporsional? | "Ketentuan pembatalan ada di kesepakatan tertulis sebelum pembayaran pertama" | FAQ `biaya.html` |
| E5 | Kelas daring: apakah ada **video bersanad, modul PDF, sertifikat, akses seumur hidup**? | Hanya yang tertulis di `program-courses.html` | Kartu Courses di `biaya.html` |
| E6 | Apakah ada **halaqah talaqqi bersama masyayikh** sebagai fasilitas program, atau kajian bersama musyrif? | "Setoran hafalan dan kajian harian bersama musyrif" | `biaya.html` |
| E7 | Apakah laporan adab ke orang tua **mingguan**? | "Laporan perkembangan berkala" | `biaya.html` |
| E8 | Apakah paspor wajib berlaku **minimal 18 bulan**? | "Paspor aktif"; pilihan unggah "Paspor (halaman identitas)" | `cek-status.html`, daftar dokumen |
| E9 | Apakah **surat keterangan sehat** juga diminta untuk jalur Ma'had? | Tercantum untuk jalur kuliah saja | `program-kuliah.html`, beranda |

## Jawaban pengurus atas daftar konfirmasi (diterima 30 September 2026)

Nomor mengikuti dokumen "Konfirmasi untuk Pengurus Hamasah" (22 pertanyaan; pertanyaan hosting
dihapus pengurus dari dokumen, sehingga nomor 20-22 di dokumen asli bergeser menjadi 19-21).

| No | Jawaban | Status di sistem |
|---|---|---|
| 5 (E7) | Laporan santri disampaikan musyrif/ah asrama setiap tanggal 1 tiap bulan lewat rapat daring | **Diterapkan**: `biaya.html`, `program-mahad.html`, beranda, jawaban FAQ wali |
| 6 (E5) | E-learning memuat seluruh mata pelajaran Dirasah Khassah, Ma'had (I'dadi & Tsanawi), dan kuliah tingkat 1 | **Diterapkan**: kartu Courses di `biaya.html`, `program-courses.html`, beranda, jawaban FAQ. Video/sertifikat/akses seumur hidup tidak dijawab, tetap tidak ditampilkan |
| 8 (E3) | Uang saku dikirim ke rekening santri masing-masing | **Diterapkan**: FAQ `biaya.html`; pintasan Keuangan di `kontak.html` |
| 9 (E4) | DP tidak dikembalikan (Ma'had Rp 5 juta, Kuliah Rp 4,5 juta); kelebihan di atas DP dikembalikan | **Diterapkan**: FAQ `biaya.html` |
| 11 (A3) | Kantor Kairo: Imarah 32, lantai 1, syaqqah 3 | **Diterapkan**: `kontak.html` |
| 12 (A3) | Asrama berbeda alamat dengan kantor | Dicatat; situs tidak menyebut alamat asrama |
| 13 (A6) | Kontak penanggung jawab data: WA admin +62 878-9759-1978 | Dicatat untuk bagian 6 kebijakan privasi |
| 14 (A1) | Pengurus minta penjelasan | Penjelasan tujuh isi kebijakan privasi ditulis di dokumen konfirmasi; menunggu file resmi atau persetujuan untuk disusunkan draf |
| 16 (C4) | Profil pengurus sedang disiapkan, rencana dikirim besok | Menunggu |
| 17 (C3) | Testimoni sedang disiapkan | Menunggu |
| 19 (D1) | Daftar akun dikirim bersama database staf, rencana besok | Menunggu |
| 20 (D3) | Data pendaftar yang tidak melanjutkan disimpan 12 bulan | Dicatat untuk bagian 3 kebijakan privasi |
| 21 (C7) | Pengurus minta penjelasan | Perbandingan dua pilihan ditulis di dokumen konfirmasi; saran mulai dari jawaban materi guru |

Tambahan 30 September 2026:

| No | Jawaban | Status di sistem |
|---|---|---|
| 1 (E1) | Usia Ma'had 13 sampai 30 tahun benar | Tidak ada perubahan |
| 2 (E9) | Surat keterangan sehat berupa hasil tes darah (tahlil dam), untuk Ma'had dan Kuliah | **Diterapkan**: daftar dokumen beranda, Kuliah, Ma'had; pilihan unggah Cek status; jawaban FAQ dokumen |
| 3 (E8) | Paspor wajib berlaku minimal 18 bulan | **Diterapkan**: syarat dan daftar dokumen Kuliah dan Ma'had, beranda, pilihan unggah Cek status, jawaban FAQ |
| 4 (E6) | Talaqqi bersama masyayikh belum pasti | Tetap "kajian harian bersama musyrif" |

Belum dijawab: 7 (E2 termin), 10 (C1 brosur), 15 (A5 artikel), 18 (B2 pemegang domain).

Tambahan 30 September 2026 (keputusan nomor 14 dan 21):

| No | Jawaban | Status di sistem |
|---|---|---|
| 14 (A1, D3) | Lama simpan: data santri 5 tahun setelah selesai, catatan kesehatan 1 tahun, log sistem 1 tahun | **Diterapkan** di draf `kebijakan-privasi.html`; halaman masih draf dan `noindex` sampai seluruh teks disahkan |
| 21 (C7) | Ikut saran (tanpa AI berbayar), tetapi dibuat lebih pintar | **Diterapkan**: `server/study-retriever.js` mencari jawaban di tanya-jawab panduan, poin penting, ringkasan, dan isi materi teks (skor BM25, imbuhan dipotong, ejaan transliterasi disamakan, jenis pertanyaan dikenali), lalu materi lain di maddah yang sama. Pertanyaan di luar materi dijawab terus terang. Tidak ada data yang keluar dari server |
