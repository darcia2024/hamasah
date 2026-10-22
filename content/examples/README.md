# Kelas contoh LMS

`nahwu-dasar.json` berisi materi pendamping, latihan, panduan AI, evaluasi, dan tugas orisinal untuk kelas pengantar Al-Ajurrumiyyah. Video merupakan rujukan eksternal yang disematkan dari kanal sumber; tidak ada klaim bahwa pengajar merupakan staf Hamasah. Materi ini tidak mengklaim sebagai kurikulum resmi Al-Azhar.

Urutan: kalam; isim, fi'il, huruf; tanda kata; evaluasi delapan soal; tugas analisis. Tiga modul dua halaman tersedia di `output/pdf/`.

## Pengisian lokal

1. Jalankan versi terbaru server dengan `npm run dev`.
2. Jalankan `node scripts/build-example-modules.js` bila sumber modul berubah. Memerlukan Chrome atau Edge lokal.
3. Jalankan `node scripts/seed-example-course.js` untuk mengisi kelas dan mendaftarkan profil santri pengembangan.

Importer hanya menerima alamat localhost. Akun pengembangan digunakan secara bawaan; penggantinya dapat diberikan melalui `LMS_EXAMPLE_EMAIL`, `LMS_EXAMPLE_PASSWORD`, dan `LMS_EXAMPLE_STUDENT_PASSWORD`. Alamat server dapat diberikan melalui `LMS_EXAMPLE_URL`. Token tidak ditulis ke disk. Menjalankan ulang memperbarui kelas dan materi berdasarkan judul, serta menggunakan kembali lampiran yang sudah tersedia. Cache id unggahan berada di folder data lokal yang diabaikan Git.

Referensi video:

- https://www.youtube.com/watch?v=qKaR8eTDIl4 — Bab kalam, elfansyah.
- https://www.youtube.com/watch?v=uMObs3_4SaU — Pembagian Kalam, elfansyah.
- https://yufidedu.com/tanda-tanda-isim-fiil-dan-huruf-ngaji-kitab-jurumiyah-eps-2-ustadz-muhammad-abduh-tuasikal/ — Tanda kata, Yufid EDU.

Video mengikuti ketersediaan dan izin sematan kanal sumber. Catatan, soal, dan modul disusun terpisah, bukan transkrip video atau salinan modul pihak lain. Tugas memerlukan pemeriksaan pengajar; AI berfungsi sebagai pendamping konsep.
