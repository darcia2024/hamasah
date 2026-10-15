# Audit Halaman Kerja Petugas — 15 Oktober 2026

Lanjutan dari [AUDIT_PORTAL_2026-10-15.md](AUDIT_PORTAL_2026-10-15.md). Empat halaman kerja petugas
dibuka di server lokal memakai akun uji dari seed, masing-masing di desktop (1366 px) dan ponsel
(390 px). Yang dicatat: error konsol, permintaan yang gagal, luapan horizontal, dan alur utama.

| Halaman | Peran uji | Tinggi desktop | Tinggi ponsel |
|---|---|---|---|
| Pendaftaran (`/staff`) | Petugas pendaftaran | 2.668 px | 3.760 px |
| Monitoring (`/monitoring`) | Musyrif | 900 px (sebelum santri dipilih) / 2.851 px | 844 px (sebelum santri dipilih) |
| LMS (`/lms`) | Guru | 2.058 px | 2.752 px |
| Keuangan (`/operations`) | Keuangan | 4.529 px | 8.025 px |

## Yang sudah berjalan baik

- Keempat halaman terbuka tanpa error konsol dan tanpa permintaan yang gagal.
- Tidak ada luapan horizontal di tingkat halaman. Baris tab yang lebih lebar dari layar memang
  sengaja digeser ke samping.
- Alur yang diuji berhasil:
  - Monitoring: memilih santri menampilkan rekam jejak, form catatan pembinaan, presensi sholat,
    setoran hafalan, dan peta 30 juz.
  - Keuangan: "Lihat tagihan" di tabel Tunggakan per santri menyaring daftar invoice ke santri itu.
- Menu profil baru (Ganti kata sandi, Keluar dari semua perangkat, Keluar) sudah tampil di keempat
  halaman.

## Pendaftaran (`/staff`)

1. **Filter bercampur dengan tombol aksi.** Ada enam kontrol penyaring: cari, program, kloter,
   urutan, tindak lanjut lewat tenggat, dan status. Tombol "Tambah pendaftar manual" terselip di
   antara kontrol itu. Di ponsel, semuanya bertumpuk sekitar 400 px sebelum daftar pendaftar.
   *Saran:* pindahkan "Tambah pendaftar manual" ke kepala halaman. Di ponsel, ringkas penyaring
   menjadi satu kotak cari ditambah tombol "Saring" yang membuka pilihan lainnya.
2. **Informasi ganda di bagian atas.** Lima kartu angka (Data baru masuk, Pemeriksaan berkas, dan
   seterusnya) diikuti empat chip peringatan yang sebagian mengulang angka yang sama. Di ponsel,
   bagian ini setinggi sekitar 600 px.
   *Saran:* di ponsel, kartu angka dijadikan satu baris yang bisa digeser, dan chip peringatan
   dijadikan satu daftar "Perlu ditindaklanjuti".
3. **Navigasi halaman ada di atas daftar.** Tombol "Sebelumnya / Halaman 1 dari 2 / Berikutnya"
   berada di atas daftar, padahal biasanya dicari setelah selesai membaca.
   *Saran:* tambahkan tombol yang sama di bawah daftar.
4. **Tab bercampur urusan lain.** Halaman Pendaftaran juga memuat tab "Pena Hamasah (terbitkan
   artikel)" dan "Notifikasi akun". Keduanya bukan pekerjaan pendaftaran.
   *Saran:* pertahankan, tetapi letakkan di urutan paling akhir dengan pemisah. Alternatifnya,
   pindahkan Pena Hamasah ke halaman Konten Website.
5. **Halaman masuk ganda.** `/staff` punya formulir masuk sendiri ("Masuk ke konsol pendaftaran")
   yang terpisah dari `/portal`. Petugas bisa bingung harus masuk dari mana.
   *Saran:* arahkan ke halaman masuk `/portal` yang sama.

## Monitoring (`/monitoring`)

1. **Halaman kosong sampai santri dipilih.** Musyrif dengan hanya satu santri tetap harus memilih
   dari dropdown dulu.
   *Saran:* pilih otomatis bila hanya ada satu santri, dan tampilkan daftar santri asrama sebagai
   kartu, bukan dropdown.
2. **Angka ringkasan hampir tidak terbaca, dan ada label berbahasa Inggris.** Deretan "100%
   Kehadiran / 0 Achievement / 0 Catatan disiplin" berwarna sangat pudar.
   *Saran:* gunakan warna teks normal dan ganti "Achievement" menjadi "Prestasi".
3. **Contoh judul kegiatan mendorong pencatatan sholat sebagai kegiatan.** Kolom "Judul kegiatan"
   berisi contoh *"Sholat Subuh Berjamaah & Mudzakarah"*. Inilah penyebab temuan di audit portal:
   kartu Sholat berjamaah wali menulis "belum ada presensi", sementara mutaba'ah mencatat "Subuh
   berjamaah: Hadir".
   *Saran:* ganti contohnya menjadi kegiatan non-sholat, misalnya *"Mudzakarah malam"* atau
   *"Talaqqi kitab"*. Tambahkan juga catatan bahwa sholat dicatat di bagian Presensi sholat.
4. **Satu halaman panjang di desktop.** Form catatan, presensi sholat, setoran hafalan, dan peta
   juz tampil berurutan, setinggi sekitar 2.900 px setelah santri dipilih.
   *Saran:* pisahkan ke sub-tab Catat, Ibadah, Hafalan, dan Rekam jejak.

## LMS (`/lms`)

1. **Form yang belum bisa dipakai sudah tampil.** Guru yang belum punya maddah sudah melihat
   form "Tambah materi maddah" dan "Santri dan progres maddah" dengan dropdown kosong.
   *Saran:* selama belum ada maddah, tampilkan hanya "Buat maddah baru" beserta penjelasan
   langkah berikutnya.
2. **Dropdown "Pilih maddah" kosong tanpa petunjuk.**
   *Saran:* tambahkan pilihan awal "Pilih maddah" atau "Belum ada maddah".
3. **Form panjang di ponsel.** Form materi memiliki delapan bidang, setinggi sekitar 1.000 px di
   ponsel.
   *Saran:* bidang opsional (poin penting, pertanyaan dan jawaban panduan) dilipat di balik
   "Tambahan (opsional)".

## Keuangan (`/operations`)

1. **Halaman sangat panjang.** Tingginya 4.529 px di desktop dan 8.025 px di ponsel. Isinya
   berurutan: form terbitkan invoice, tabel tunggakan, lalu 20 invoice per halaman.
   *Saran:* jadikan "Terbitkan invoice" tombol yang membuka dialog, dan tampilkan tunggakan serta
   daftar invoice sebagai dua sub-tab.
2. **Terlalu banyak tombol per invoice.** Invoice yang belum dibayar punya lima tombol: Tandai
   lunas, Kirim pengingat, Koreksi, Batalkan, dan Riwayat koreksi. Di ponsel, tombol-tombol itu
   menjadi tiga baris.
   *Saran:* sisakan "Tandai lunas" sebagai aksi utama, lalu masukkan aksi lain ke menu "⋯".
3. **Tabel tunggakan terpotong di ponsel.** Kolom Total dan Tertua keluar dari layar dan harus
   digeser.
   *Saran:* gunakan tampilan kartu seperti tabel santri di beranda admin.
4. **Tombol unduh laporan ganda.** "Unduh laporan CSV" ada di kepala halaman dan juga di atas
   daftar invoice.
   *Saran:* sisakan satu, yaitu yang memiliki pilihan rentang tanggal.

## Catatan pengujian

- **Batas login di pengujian.** Batas masuk lima kali per 15 menit membuat sebagian pengujian
  otomatis terkunci setelah banyak login berturut-turut. Ini perlindungan yang berjalan
  semestinya, bukan bug. Detail pendaftar di `/staff` belum sempat dibuka ulang karena batas ini.
  Alur detail pendaftar dan Cek status sudah diuji sebelumnya.
- **Data uji lokal.** Selama pengujian, dibuat satu doa wali dan satu izin santri di database
  lokal. Pengaturan rekening tagihan lokal dikembalikan menjadi kosong.

## Urutan pengerjaan yang disarankan

1. **Monitoring 3 (contoh judul kegiatan) dan Monitoring 2 (label "Prestasi").** Perubahan
   kecil, tetapi langsung mencegah data sholat yang tercatat di tempat yang salah.
2. **Keuangan 1–3.** Halaman ini paling panjang dan paling sering dipakai keuangan dari ponsel.
3. **Pendaftaran 1–3.**
4. **LMS 1–2 dan Monitoring 1.**
