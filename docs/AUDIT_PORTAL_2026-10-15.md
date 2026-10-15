# Audit Portal Hamasah — 15 Oktober 2026

Cakupan: halaman `/portal` (masuk, beranda, dan rekam jejak santri) untuk tujuh peran uji dari
seed lokal: wali, santri, admin, musyrif, guru, keuangan, dan petugas pendaftaran. Tiap peran
dibuka di desktop (1366 px) dan ponsel (390 px). Selama pengujian dicatat error konsol, permintaan
gagal, dan luapan horizontal.

Belum dicakup: halaman kerja petugas di luar beranda (Pendaftaran, Monitoring, LMS, Keuangan,
Akun, Konten, Pengaturan, Jejak audit).

## Yang sudah berjalan baik

- Ketujuh peran berhasil masuk dan diarahkan ke beranda masing-masing.
- Tidak ada error konsol atau permintaan yang gagal di semua halaman yang dibuka.
- Tidak ada luapan horizontal di tingkat halaman, baik di desktop maupun di ponsel.
- Fungsi yang diuji di database lokal semuanya berhasil:
  - wali mengirim doa ke musyrif, dan pesannya tersimpan;
  - wali mengunduh rapor PDF (3,4 KB) dan ringkasan CSV;
  - santri mengajukan izin, dan pengajuannya tersimpan dengan status "menunggu".

## Prioritas tinggi: mengganggu pemakaian sehari-hari

### 1. Data inti di halaman rekam jejak santri tertimbun di bawah

Ini berlaku untuk wali dan santri. Urutannya dari atas:

1. profil;
2. dua kartu angka;
3. kirim doa (bagi santri: form izin);
4. roadmap studi;
5. santri teladan;
6. baru kemudian tab Mutaba'ah, Sholat, Talaqqi, Asrama, Maddah, Rapor, dan Tagihan.

Di ponsel, tab baru muncul setelah sekitar 1.900 px gulir untuk wali dan sekitar 2.300 px untuk
santri. Panjang halamannya 2.577 px untuk wali dan 3.131 px untuk santri.

Saran: taruh tab langsung di bawah ringkasan profil. Pindahkan doa, roadmap, dan santri teladan ke
tab "Ringkasan", atau ke bagian bawah halaman.

### 2. Tab yang aktif tidak terlihat di ponsel

Baris tab digeser ke samping. Saat tab di ujung kanan dipilih (misalnya "Tagihan & kuitansi"),
tab itu tetap berada di luar layar, sehingga pengguna tidak tahu tab mana yang sedang terbuka.

Saran: geser tab aktif ke dalam layar secara otomatis. Pilihan lain, di ponsel tab dijadikan kisi
dua kolom atau menu pilihan.

### 3. Filter periode muncul di semua tab

Baris filter berisi "Hari ini", "Kemarin", "7 hari", "30 hari", dua kolom tanggal, dan tombol
"Terapkan periode". Filter ini tampil juga di tab Maddah, Asrama, Rapor, dan Tagihan, padahal
tab-tab itu tidak memakai periode. Di ponsel, filter ini memakan sekitar 150 px.

Saran: tampilkan filter hanya di tab yang memakainya, yaitu Mutaba'ah, Sholat, dan Talaqqi.

### 4. Tagihan wali tanpa petunjuk pembayaran

Kartu "SPP Oktober 2026 — Belum dibayar" hanya menampilkan jumlah dan tanggal. Wali tidak
diberi tahu ke mana harus membayar atau bagaimana mengonfirmasi pembayaran.

Saran: tampilkan rekening resmi dari pengaturan, ditambah tombol "Konfirmasi pembayaran lewat
WhatsApp" yang sudah berisi nomor tagihan.

## Prioritas sedang: tampilan dan alur

### 5. Beranda wali

- Ada dua elemen yang sama-sama berbentuk tombol: "Lihat mutaba'ah terkini" dan pil
  "Daftar ananda (2)". Pil itu sebenarnya hanya judul.
- Setiap kartu ananda punya dua aksi untuk tujuan yang sama: "Buka detail" dan ikon "buka di
  tab baru".
- Kartu sapaan untuk wali hanya berisi salam dan peran. Di desktop kartu ini mengisi kolom kanan
  yang hampir kosong. Di ponsel kartu ini malah muncul paling bawah, setelah daftar ananda.

### 6. Form izin santri selalu terbuka

Form ini terdiri dari jenis izin, waktu mulai, waktu selesai, alasan, dan tombol kirim. Seluruhnya
tampil penuh di dashboard santri dan menambah sekitar 400 px di ponsel.

Saran: ganti dengan tombol "Ajukan izin" yang membuka form ketika ditekan.

### 7. Roadmap studi

- Di ponsel, lima tahap ditampilkan sebagai lima kotak bertumpuk setinggi sekitar 250 px.
- Kalimat internal "Fase saat ini belum diisi admin" ikut terlihat oleh wali dan santri.

Saran: jadikan roadmap linimasa ringkas, dan sembunyikan kalimat admin dari wali dan santri.

### 8. Santri teladan

Kartu besar ini muncul di setiap rekam jejak ananda dan menampilkan nama santri lain kepada semua
wali.

Pertanyaan untuk pengurus: apakah ini memang disengaja? Kalau ya, cukup dibuat ringkas.

### 9. Beranda admin terlalu panjang

Halaman ini setinggi 3.208 px di desktop dan 4.526 px di ponsel. Tabel santri berisi 15 baris
dengan delapan kolom:

- di desktop, kolom "Tagihan" terpotong sehingga harus digeser ke samping;
- di ponsel, tabelnya melebar ke samping.

Saran: di ponsel gunakan kartu per santri, dan batasi tabel di beranda sampai sekitar 5 baris
ditambah tautan "Lihat semua".

### 10. Tugas hari ini untuk musyrif

Ada lima baris terpisah, satu untuk tiap waktu sholat, dengan isi yang sama: "1 dari 1 santri
belum dicatat".

Saran: gabungkan menjadi satu baris "Presensi sholat hari ini" dengan chip Subuh, Dzuhur, Ashar,
Maghrib, dan Isya, lalu satu tombol "Catat".

### 11. Menu samping untuk wali dan santri

- Menu utamanya hanya satu atau dua item, tetapi ada tiga tombol akun besar di bawahnya: Keluar
  sesi, Ganti kata sandi, dan Keluar dari semua perangkat.
- "Ganti kata sandi" tampil dengan gaya tombol keluar.

Saran: pindahkan ketiga tombol itu ke menu profil di pojok kanan atas.

### 12. Nama dan label peran

- Nama yang panjang terpotong di menu samping, misalnya "Petugas Pendaftaran...".
- Pil peran "Petugas Pendaftaran" berwarna merah, sendirian berbeda dari peran lain.

## Prioritas rendah

- **Contoh di kolom doa:** di ponsel, teks contoh di kolom doa terpotong di baris ketiga.
- **Ejaan program:** chip program "Mahad Al-Azhar" ditulis tanpa apostrof. Teks ini berasal dari
  data santri contoh di seed, bukan dari tampilan.
- **Sholat yang tercatat sebagai kegiatan:** kegiatan "Subuh berjamaah" tercatat di mutaba'ah
  sebagai kegiatan, sementara kartu Sholat berjamaah tetap menulis "belum ada presensi sholat".
  Penyebabnya, seed mencatat subuh sebagai kegiatan. Perlu dipastikan musyrif mencatat sholat
  lewat presensi sholat, bukan sebagai kegiatan.
- **Login di uji otomatis:** satu kali login musyrif di ponsel tidak masuk dalam pengujian
  otomatis, lalu berhasil saat diulang. Kemungkinan penyebabnya server lokal yang lambat. Perlu
  dipantau di produksi.

## Urutan pengerjaan yang disarankan

1. Rombak halaman rekam jejak santri untuk wali dan santri (temuan 1, 2, 3, 6, dan 7).
2. Tambahkan petunjuk pembayaran tagihan (temuan 4).
3. Rapikan beranda wali dan menu samping (temuan 5 dan 11).
4. Rapikan beranda admin dan musyrif (temuan 9 dan 10).
5. Audit lanjutan untuk halaman kerja petugas.
