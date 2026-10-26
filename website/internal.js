'use strict';

// Tutorial aplikasi kerja Hamasah (/internal): satu bab per menu, dipakai saat presentasi.
// Bahasanya sengaja sederhana, untuk orang yang belum pernah memakai aplikasi seperti ini.
// Nama menu dan bagian tetap ditulis persis seperti di aplikasinya (nav.js, staff.html,
// monitoring.html, asrama.js, lms-studio.js, operations.html, akun.js, pengaturan.html),
// supaya mudah ditunjuk di layar. Kalau ada menu yang berganti nama, perbarui teks di sini juga.

(function () {
  const BAB = [
    {
      judul: 'Mengenal aplikasi kerja Hamasah',
      peran: ['Semua tim'],
      ringkas: 'Ini aplikasi tempat seluruh tim Hamasah bekerja, dari mengurus pendaftar sampai mencatat uang. Semua dikerjakan di satu tempat, jadi tidak perlu lagi mencatat di buku atau banyak file terpisah.',
      buka: [['Buka aplikasinya', '/portal']],
      gambar: ['portal', 'Halaman depan aplikasi untuk admin utama: menu di kiri dan ringkasan kondisi lembaga'],
      langkah: [
        ['Satu pintu masuk untuk semua', 'Semua orang membuka alamat yang sama, yaitu /portal. Tidak ada aplikasi lain yang perlu dipasang.'],
        ['Ada lima jenis tugas', 'Admin utama, petugas pendaftaran, musyrif (pembina asrama), guru, dan keuangan. Wali dan santri juga bisa masuk, tapi mereka tidak dibahas di sini.'],
        ['Menu menyesuaikan tugas', 'Petugas pendaftaran hanya melihat menu Pendaftaran. Keuangan hanya melihat menu uang. Admin utama melihat semuanya. Jadi kalau ada menu yang tidak muncul, itu normal.'],
        ['Semua perubahan ada catatannya', 'Aplikasi mencatat siapa mengubah apa dan kapan. Gunanya supaya semua orang lebih hati-hati dan mudah dilacak kalau ada salah paham.']
      ],
      catatan: [
        'Buka dengan tujuan: hari ini kita belajar kerja sehari-hari di aplikasi, bukan teori.',
        'Tanyakan siapa memegang tugas apa, supaya nanti bisa fokus ke bab yang paling cocok.',
        'Tekankan: kalau sebuah menu tidak muncul, itu memang bukan bagian tugasnya, bukan kerusakan.'
      ],
      batas: []
    },
    {
      judul: 'Cara masuk dan mengenal tampilan',
      peran: ['Semua tim'],
      ringkas: 'Cara masuk ke aplikasi, cara membaca menu di sebelah kiri, dan apa yang dilakukan kalau lupa kata sandi.',
      buka: [['Buka halaman masuk', '/portal']],
      gambar: ['masuk', 'Halaman masuk: isi email dan kata sandi, lalu tekan Masuk'],
      langkah: [
        ['Masuk', 'Buka /portal, isi email dan kata sandi milik sendiri, lalu tekan tombol Masuk.'],
        ['Kenali menu di kiri', 'Semua menu ada di bagian kiri layar. Di HP, menunya dibuka lewat tombol Menu di pojok kiri atas.'],
        ['Tombol di bagian atas', 'Tombol "Perbarui data" memuat ulang angka terbaru. Nama Anda di pojok kanan atas dipakai untuk keluar.'],
        ['Kalau lupa kata sandi', 'Minta tolong admin utama. Admin akan membuatkan kata sandi sementara yang bisa diganti setelah masuk.'],
        ['Setelah selesai bekerja', 'Tekan Keluar, terutama kalau memakai komputer bersama.']
      ],
      catatan: [
        'Demokan masuk pakai akun contoh, jangan pakai akun pribadi di layar.',
        'Tunjukkan juga tampilan di HP, karena pembina asrama kebanyakan memakai HP.'
      ],
      batas: ['Admin tidak bisa melihat kata sandi siapa pun. Admin hanya bisa menggantinya dengan yang sementara.']
    },
    {
      judul: 'Halaman utama admin: apa yang perlu diurus hari ini',
      peran: ['Admin utama'],
      ringkas: 'Ini halaman pertama yang dilihat admin setelah masuk. Isinya gambaran singkat kondisi lembaga dan daftar hal yang perlu segera diurus.',
      buka: [['Buka Portal Utama', '/portal']],
      gambar: ['perhatian', 'Kotak "Perlu perhatian": daftar masalah yang dikelompokkan per santri'],
      langkah: [
        ['Baca angka di atas', 'Ada jumlah santri, berapa kamar asrama yang terisi, jumlah pembina, dan berapa hal yang perlu perhatian.'],
        ['Lihat kotak "Perlu perhatian"', 'Isinya hal-hal yang harus ditindaklanjuti, misalnya paspor atau visa yang hampir habis, santri yang melanggar aturan, atau asrama yang belum punya pembina.'],
        ['Buka santri yang bermasalah', 'Tekan "Buka santri" untuk langsung melihat data lengkap santri itu.'],
        ['Pindah ke Santri, Asrama, atau Musyrif', 'Tiga tombol di bawahnya menampilkan daftar santri, daftar asrama, atau daftar pembina asrama (musyrif).'],
        ['Data contoh', 'Kotak "Data demo" dipakai untuk mengisi data contoh saat latihan. Jangan dihapus selama masih dipakai untuk presentasi.']
      ],
      catatan: [
        'Ini bab paling penting untuk pimpinan: masalah langsung kelihatan tanpa harus membuka banyak menu.',
        'Klik satu santri dari kotak Perlu perhatian supaya alurnya terasa nyata.'
      ],
      batas: ['Data contoh ikut tampil di semua menu. Bedakan dari data asli saat aplikasi sudah dipakai sungguhan.']
    },
    {
      judul: 'Kelola Akun: membuat dan mengatur pengguna',
      peran: ['Admin utama'],
      ringkas: 'Tempat membuat akun untuk tim, wali, dan santri, mengubah tugas seseorang, dan menutup akun orang yang sudah tidak bertugas.',
      buka: [['Buka Kelola Akun', '/akun']],
      gambar: ['akun', 'Halaman Kelola Akun'],
      langkah: [
        ['Mengundang lewat WhatsApp', 'Isi nama, nomor WhatsApp, dan tugasnya. Aplikasi menyiapkan pesan berisi tautan aktivasi, lalu admin yang mengirimnya sendiri lewat WhatsApp.'],
        ['Atau langsung buat akun', 'Kalau orangnya ada di dekat Anda, akun bisa langsung dibuat dengan kata sandi awal.'],
        ['Cek "Daftar akun"', 'Di sini kelihatan siapa yang sudah aktif dan siapa yang belum. Yang belum aktif bisa diundang ulang.'],
        ['Kata sandi sementara', 'Dipakai untuk orang yang lupa kata sandi. Berikan langsung ke orangnya, jangan lewat grup.'],
        ['Menutup akun', 'Pilih "Nonaktifkan" untuk orang yang sudah tidak bertugas. Akunnya langsung keluar dari semua perangkat.']
      ],
      catatan: [
        'Sarankan akun admin utama dipegang sedikit orang saja.',
        'Jelaskan bahwa satu akun wali bisa dihubungkan ke beberapa anak (dihubungkan lewat menu Monitoring Asrama).'
      ],
      batas: ['Akun tidak dihapus, hanya dinonaktifkan, supaya riwayatnya tetap tersimpan.']
    },
    {
      judul: 'Pendaftaran: mengurus calon santri',
      peran: ['Petugas pendaftaran', 'Admin utama'],
      ringkas: 'Semua orang yang mendaftar lewat website masuk ke sini. Petugas mengurusnya langkah demi langkah sampai calon santri siap berangkat.',
      buka: [['Buka Pendaftaran', '/staff']],
      gambar: ['pendaftaran', 'Halaman Pendaftaran: jumlah pendaftar di tiap tahap dan daftar nama pendaftar'],
      langkah: [
        ['Lihat daftar pendaftar', 'Setiap pendaftar tampil sebagai satu kartu: nama, tahap sekarang, dan tanda merah kalau sudah terlalu lama belum diurus.'],
        ['Buka data pendaftar', 'Klik kartunya. Isinya data diri, berkas yang diunggah, catatan, dan riwayat tahap.'],
        ['Periksa berkas', 'Setujui atau tolak tiap dokumen. Kalau ditolak, tulis alasannya supaya pendaftar tahu apa yang harus diperbaiki.'],
        ['Pindahkan ke tahap berikutnya', 'Urutannya: Data dikirim, Pemeriksaan berkas, Persiapan akademik, Siap keberangkatan, lalu Selesai. Ada juga status Perlu perbaikan dan Dibatalkan.'],
        ['Catat hal yang harus ditindaklanjuti', 'Misalnya "minta paspor", lengkap dengan batas waktunya. Semua yang belum selesai terkumpul di bagian "Agenda tindak lanjut".'],
        ['Masukkan ke rombongan berangkat', 'Atur rombongan di bagian "Kloter keberangkatan", lalu pilih rombongan untuk tiap pendaftar. Jadwalnya otomatis tampil di halaman cek status milik pendaftar.'],
        ['Kabari lewat WhatsApp', 'Aplikasi menyiapkan isi pesannya. Baca dulu, lalu kirim sendiri.'],
        ['Jadikan santri', 'Kalau semua tahap sudah selesai, tekan tombol untuk menjadikannya santri supaya bisa masuk asrama dan kelas.']
      ],
      catatan: [
        'Sebut sekilas bagian lain di halaman ini: Pena Hamasah (artikel), Notifikasi akun, Import operasional, Pesan konsultasi.',
        'Tunjukkan tombol "Tambah pendaftar manual" untuk orang yang mendaftar lewat telepon atau datang langsung.'
      ],
      batas: ['Petugas pendaftaran tidak bisa membuka tagihan, catatan pembinaan, atau membuat akun. Petugas hanya bisa mengirim ulang undangan.']
    },
    {
      judul: 'Monitoring Asrama: pekerjaan harian pembina',
      peran: ['Pembina asrama (musyrif)', 'Admin utama'],
      ringkas: 'Tempat pembina asrama mencatat siapa yang hadir sholat atau kegiatan, perkembangan santri, dan izin keluar santri.',
      buka: [['Buka Monitoring Asrama', '/monitoring']],
      gambar: ['presensi', 'Bagian "Presensi asrama": daftar santri dengan pilihan Berjamaah, Munfarid, Tidak, atau Izin'],
      langkah: [
        ['Catat kehadiran di "Presensi asrama"', 'Pilih Sholat atau Kegiatan, tanggal, dan waktu sholat, lalu tekan "Tampilkan daftar". Semua santri sudah otomatis terisi hadir, jadi cukup ubah yang berbeda lalu tekan "Simpan presensi".'],
        ['Catat perkembangan santri', 'Di "Pembinaan santri": pilih santrinya, lalu tulis catatan pembinaan, setoran hafalan Al-Qur\'an (hafalan baru atau mengulang hafalan lama), dan prestasinya.'],
        ['Jawab permintaan izin', 'Di "Izin santri": setujui atau tolak pengajuan izin keluar. Kepulangan santri yang izin dicatat di "Kepulangan izin".'],
        ['Pantau target pembinaan', 'Di "Tindak lanjut pembinaan": target dan batas waktu untuk tiap santri. Yang terlambat diberi tanda.'],
        ['Baca pesan wali dan buat pengumuman', 'Di "Pesan wali" ada pesan dan doa dari orang tua. Di "Pengumuman" Anda bisa menulis kabar untuk santri dan wali di asrama itu.'],
        ['Pilih santri teladan', 'Di "Santri teladan", pilih santri terbaik bulan ini.']
      ],
      catatan: [
        'Demokan "Presensi asrama" dari awal sampai simpan, karena inilah yang dikerjakan setiap hari.',
        'Sebut juga "Cerita AI" di halaman utama pembina: pembina menulis cerita singkat tentang hari itu, lalu AI menyusunnya menjadi usulan catatan per santri. Pembina tetap memeriksa dulu sebelum disimpan.',
        'Ingatkan: kalau dicatat di hari yang sama, halaman milik wali selalu terisi.'
      ],
      batas: ['Pembina hanya bisa melihat santri di asrama yang menjadi tanggung jawabnya.']
    },
    {
      judul: 'Monitoring Asrama: bagian khusus admin',
      peran: ['Admin utama'],
      ringkas: 'Beberapa bagian di Monitoring Asrama hanya muncul untuk admin, karena bagian ini menentukan siapa boleh melihat santri yang mana.',
      buka: [['Buka Monitoring Asrama', '/monitoring']],
      gambar: ['monitoring-admin', 'Bagian "Kelola Asrama & Musyrif" di Monitoring Asrama'],
      langkah: [
        ['Menambah santri baru', 'Di "Profil santri baru": untuk santri yang tidak mendaftar lewat website.'],
        ['Menempatkan santri', 'Di "Penempatan Kamar & Asrama": pilih santri, lalu tentukan asrama dan kamarnya.'],
        ['Mengatur asrama dan pembinanya', 'Di "Kelola Asrama & Musyrif": tambahkan gedung asrama, lalu tentukan pembina yang bertanggung jawab.'],
        ['Menghubungkan orang tua', 'Di "Hubungkan akun wali": sambungkan akun orang tua dengan anaknya. Satu orang tua bisa dihubungkan ke beberapa anak.']
      ],
      catatan: [
        'Urutan saat pertama kali dipakai itu penting: asrama dulu, lalu pembina, lalu santri, terakhir hubungkan wali.'
      ],
      batas: ['Pembina asrama tidak bisa menambah santri, memindahkan asrama, atau menghubungkan akun orang tua.']
    },
    {
      judul: 'Kelola Asrama: urusan rumah tangga asrama',
      peran: ['Pembina asrama (musyrif)', 'Admin utama'],
      ringkas: 'Untuk mengurus keperluan asrama sehari-hari: jadwal, giliran piket, uang kas, barang, foto, dan masa berlaku izin tinggal.',
      buka: [['Buka Kelola Asrama', '/asrama']],
      gambar: ['asrama', 'Halaman Kelola Asrama'],
      langkah: [
        ['Kalender', 'Jadwal mingguan dan acara asrama dalam bentuk kalender.'],
        ['Piket', 'Atur siapa piket di hari apa. Santri bisa melihat gilirannya di halaman mereka.'],
        ['Uang kas', 'Catat uang masuk, uang keluar, dan iuran. Sisa uangnya dihitung otomatis.'],
        ['Inventaris', 'Daftar barang asrama beserta jumlah dan kondisinya.'],
        ['Galeri', 'Kumpulan foto kegiatan asrama.'],
        ['Iqamah', 'Iqamah adalah izin tinggal di Mesir. Di sini terlihat kapan masa berlakunya habis dan siapa yang perlu memperpanjang.']
      ],
      catatan: [
        'Tunjukkan "Uang kas": catatan yang salah tidak dihapus, tapi dibatalkan dengan menyebut alasannya.'
      ],
      batas: ['Catatan uang kas tidak bisa dihapus. Yang salah dibatalkan dengan alasan, dan catatannya tetap tersimpan.']
    },
    {
      judul: 'LMS: kelas online untuk santri',
      peran: ['Guru', 'Admin utama'],
      ringkas: 'LMS adalah ruang kelas di internet. Guru menyiapkan pelajaran, latihan soal, dan tugas, lalu santri belajar lewat HP.',
      buka: [['Buka LMS', '/lms']],
      gambar: ['lms', 'Halaman LMS Maddah (maddah artinya mata pelajaran)'],
      langkah: [
        ['Buat mata pelajaran', 'Di sini disebut "maddah". Cukup isi judul dan penjelasan singkat.'],
        ['Isi materinya di bagian "Kurikulum"', 'Pilih jenisnya: bacaan, video YouTube, file PDF, kuis, atau tugas. Urutannya bisa diatur, diubah, atau disimpan dulu tanpa ditampilkan.'],
        ['Susun kuis', 'Tulis pertanyaan dan tandai jawaban yang benar. Nilai lulusnya 70, dan santri boleh mencoba sampai tiga kali.'],
        ['Daftarkan santri', 'Di bagian "Santri", pilih siapa saja yang ikut. Di sini juga kelihatan sejauh mana belajar tiap santri.'],
        ['Beri nilai tugas', 'Di bagian "Penilaian". Nilai 70 ke atas otomatis dianggap selesai.'],
        ['Lihat sebagai santri', 'Cek dulu tampilan dari sisi santri sebelum materi dibuka.']
      ],
      catatan: [
        'Tunjukkan asisten belajar: santri bisa bertanya di setiap pertemuan, dan jawabannya diambil dari ringkasan yang ditulis guru.',
        'Pesan untuk guru: makin jelas ringkasan dan poin pentingnya, makin bagus jawaban asistennya.'
      ],
      batas: ['Guru hanya bisa melihat mata pelajaran yang dipegangnya.']
    },
    {
      judul: 'Keuangan & SPP: tagihan dan pembayaran',
      peran: ['Keuangan', 'Admin utama'],
      ringkas: 'Tempat membuat tagihan, mencatat pembayaran, mencetak kuitansi, dan memantau siapa yang belum membayar. Semua dalam rupiah.',
      buka: [['Buka Keuangan & SPP', '/operations']],
      gambar: ['keuangan', 'Halaman Keuangan & SPP: ringkasan tunggakan dan daftar tagihan'],
      langkah: [
        ['Buat tagihan', 'Pilih "Satu santri" atau "Banyak santri sekaligus", isi keterangan dan jumlahnya, lalu terbitkan.'],
        ['Kabari wali', 'Di kartu tagihan, tekan "Kabari wali lewat WhatsApp", baca pesannya, lalu kirim.'],
        ['Tandai sudah lunas', 'Lakukan ini setelah uangnya benar-benar diterima. Nomor kuitansi muncul otomatis.'],
        ['Unduh kuitansi', 'Kuitansi berbentuk PDF dan bisa diunduh oleh bagian keuangan maupun orang tua.'],
        ['Memperbaiki atau membatalkan', 'Wajib menulis alasannya. Semua perbaikan tercatat di "Riwayat koreksi" dan "Riwayat keuangan".'],
        ['Pantau yang belum bayar', 'Tabel "Tunggakan" mengurutkan santri dari yang tunggakannya terbesar. Tagihan yang lewat dari 30 hari diberi tanda merah.'],
        ['Unduh laporan', 'Pilih rentang bulan di bagian "Laporan tagihan", lalu unduh laporannya sebagai file yang bisa dibuka di Excel.']
      ],
      catatan: [
        'Demokan satu siklus penuh: buat tagihan, kabari wali, tandai lunas, unduh kuitansi.',
        'Kalau ada pembayaran dalam pound Mesir, tetap dicatat dalam rupiah secara manual.'
      ],
      batas: ['Tagihan tidak bisa dihapus. Yang salah diperbaiki atau dibatalkan dengan menulis alasannya.']
    },
    {
      judul: 'Visa, Paspor, dan Inventaris',
      peran: ['Keuangan', 'Admin utama'],
      ringkas: 'Dua menu ini letaknya di halaman Keuangan, tapi dibuatkan menu sendiri di sebelah kiri supaya cepat dibuka.',
      buka: [['Buka Visa & Paspor', '/operations#visa'], ['Buka Inventaris', '/operations#inventaris']],
      gambar: ['visa', 'Pelacak visa pelajar: satu kartu per santri berisi masa berlaku paspor dan visa'],
      langkah: [
        ['Pelacak visa', 'Satu kartu untuk setiap santri aktif. Yang paling mendesak ditaruh di paling atas, dan yang sudah lewat masa berlakunya diberi warna merah.'],
        ['Memperbarui data visa', 'Catat tanggal berlaku yang baru dan unggah berkas pendukungnya.'],
        ['Inventaris', 'Daftar barang milik asrama. Setiap barang yang masuk atau keluar dicatat supaya jumlahnya selalu cocok.'],
        ['Riwayat keuangan', 'Catatan per hari tentang tagihan yang terbit, dibayar, diperbaiki, dan dibatalkan.']
      ],
      catatan: [
        'Visa yang hampir habis juga muncul di kotak "Perlu perhatian" di halaman utama admin.'
      ],
      batas: []
    },
    {
      judul: 'Jejak Audit: catatan siapa melakukan apa',
      peran: ['Admin utama'],
      ringkas: 'Catatan otomatis tentang siapa mengubah apa dan kapan, di seluruh aplikasi. Anggap saja seperti kamera CCTV untuk data.',
      buka: [['Buka Jejak Audit', '/audit']],
      gambar: ['audit', 'Halaman Jejak Audit'],
      langkah: [
        ['Saring kejadian', 'Gunakan "Filter riwayat kejadian" untuk memilih berdasarkan tugas seseorang, jenis kejadian, atau tanggal.'],
        ['Baca daftarnya', 'Tiap baris berisi siapa yang melakukan, apa yang dilakukan, dan jam berapa.'],
        ['Kapan dipakai', 'Misalnya saat ada yang bertanya "siapa yang membatalkan tagihan ini?" atau "kapan status pendaftar ini berubah?".']
      ],
      catatan: [
        'Tekankan: karena semua tercatat, orang jadi lebih hati-hati, dan kalau ada salah paham mudah dicari penyebabnya.'
      ],
      batas: ['Berapa lama catatan ini disimpan diatur di menu Pengaturan.']
    },
    {
      judul: 'Konten Website dan Template',
      peran: ['Admin utama'],
      ringkas: 'Untuk mengubah tulisan di website dan isi dokumen tanpa perlu meminta bantuan programmer.',
      buka: [['Buka Konten Website', '/konten'], ['Buka Template', '/template']],
      gambar: ['konten', 'Halaman Konten Website'],
      langkah: [
        ['Konten Website', 'Ubah biaya, program, kontak, testimoni, tanya jawab, dan pengumuman. Ada pratinjau untuk melihat hasilnya sebelum disimpan.'],
        ['Template pesan WhatsApp', 'Atur bunyi pesan yang disiapkan aplikasi, misalnya pesan pengingat tagihan.'],
        ['Template dokumen', 'Atur kop surat, nomor rekening, dan nama penanda tangan yang tercetak di kuitansi PDF.']
      ],
      catatan: [
        'Demokan mengubah satu angka biaya, lihat pratinjaunya, lalu batalkan supaya website tidak ikut berubah.'
      ],
      batas: ['Perubahan di Konten Website langsung terlihat di website umum begitu disimpan.']
    },
    {
      judul: 'Pengaturan: saklar fitur aplikasi',
      peran: ['Admin utama'],
      ringkas: 'Tempat menyalakan atau mematikan fitur tertentu, dan mengatur hal-hal yang berlaku untuk seluruh aplikasi.',
      buka: [['Buka Pengaturan', '/pengaturan']],
      gambar: ['pengaturan', 'Halaman Pengaturan'],
      langkah: [
        ['Pendaftaran', 'Buka atau tutup pendaftaran online, tentukan periode penerimaan, tulis pesan saat pendaftaran ditutup, dan isi rekening pembayaran.'],
        ['Asisten otomatis', 'Nyalakan atau matikan asisten di website dan asisten belajar di kelas online, termasuk batas berapa kali satu akun boleh bertanya dalam satu jam.'],
        ['Data pribadi', 'Saklar untuk catatan kesehatan santri, dan pengaturan berapa lama catatan riwayat disimpan.'],
        ['Pembaruan database', 'Bagian ini hanya untuk tim teknis saat aplikasi diperbarui. Tidak perlu disentuh.']
      ],
      catatan: [
        'Jelaskan bahwa catatan kesehatan baru dinyalakan setelah kebijakan privasinya siap dan diputuskan Ust. Aji.'
      ],
      batas: ['"Pembaruan database" sebaiknya hanya dijalankan oleh tim teknis.']
    },
    {
      judul: 'Kerja harian tiap tugas, lalu tanya jawab',
      peran: ['Semua tim'],
      ringkas: 'Kalau setiap orang mengerjakan bagiannya tiap hari, halaman milik orang tua dan halaman pimpinan akan selalu terisi data terbaru.',
      buka: [['Buka aplikasinya', '/portal']],
      gambar: ['portal', 'Halaman depan aplikasi untuk admin utama'],
      langkah: [
        ['Admin utama', 'Setiap pagi buka halaman utama dan lihat kotak "Perlu perhatian".'],
        ['Petugas pendaftaran', 'Mulai dari "Agenda tindak lanjut", lalu pendaftar yang bertanda merah.'],
        ['Pembina asrama', 'Isi "Presensi asrama" tiap waktu sholat, jawab permintaan izin, dan catat setoran hafalan.'],
        ['Guru', 'Unggah materi untuk pertemuan berikutnya dan beri nilai pada tugas yang masuk.'],
        ['Keuangan', 'Buat tagihan di awal bulan, dan tandai lunas begitu uangnya masuk.'],
        ['Kalau ada kendala', 'Catat halaman mana dan apa yang terjadi, lalu kabari tim teknis. Foto layarnya sangat membantu.']
      ],
      catatan: [
        'Tutup dengan rencana uji coba: setiap tugas dicoba langsung oleh orang yang nanti memakainya.',
        'Buka sesi tanya jawab.'
      ],
      batas: []
    }
  ];

  // Tangkapan layar per langkah, urutannya sama dengan bab dan langkah di atas. Langkah tanpa
  // gambar sendiri memakai gambar bab. Dibuat ulang dengan .claude/checks/internal-shots.cjs.
  const LANGKAH_GAMBAR = [
    ['portal', 'portal', 'portal', 'audit'],
    ['masuk', 'portal', 'portal', 'masuk', 'portal'],
    ['portal-angka', 'perhatian', 'santri-detail', 'portal-tabel', 'portal-demo'],
    ['akun', 'akun-buat', 'akun-daftar', 'akun-daftar', 'akun-daftar'],
    ['pendaftaran', 'pendaftaran-detail', 'pendaftaran-detail', 'pendaftaran-detail-tengah', 'pendaftaran-agenda', 'pendaftaran-kloter', 'pendaftaran-detail-bawah', 'pendaftaran-detail-bawah'],
    ['presensi', 'monitoring-pembinaan', 'monitoring-izin', 'monitoring-tindaklanjut', 'monitoring-pesan', 'monitoring-teladan'],
    ['monitoring-santribaru', 'monitoring-penempatan', 'monitoring-admin', 'monitoring-wali'],
    ['asrama-kalender', 'asrama-piket', 'asrama-kas', 'asrama-inventaris', 'asrama-galeri', 'asrama-iqamah'],
    ['lms', 'lms-kurikulum', 'lms-kurikulum', 'lms-santri', 'lms-penilaian', 'lms-kurikulum'],
    ['keuangan', 'keuangan-invoice', 'keuangan-invoice', 'keuangan-invoice', 'keuangan-invoice', 'keuangan-tunggakan', 'keuangan-invoice'],
    ['visa', 'visa', 'inventaris', 'keuangan-riwayat'],
    ['audit', 'audit-timeline', 'audit-timeline'],
    ['konten', 'template', 'template'],
    ['pengaturan', 'pengaturan-ai', 'pengaturan-data', 'pengaturan-db'],
    ['portal', 'pendaftaran-agenda', 'presensi', 'lms-kurikulum', 'keuangan-invoice', 'portal']
  ];

  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const SIMPAN = 'hamasahTutorialInternal';
  const baca = () => { try { return JSON.parse(localStorage.getItem(SIMPAN)) || {}; } catch { return {}; } };
  const tulis = (data) => { try { localStorage.setItem(SIMPAN, JSON.stringify(data)); } catch { /* boleh gagal */ } };

  const awal = baca();
  const dariHash = /^#bab-(\d+)$/.exec(location.hash);
  let bab = dariHash ? Math.min(BAB.length - 1, Number(dariHash[1])) : Math.min(BAB.length - 1, awal.bab || 0);
  let langkah = dariHash ? 0 : (awal.langkah || 0);
  let catatanTerbuka = false;

  const daftar = $('daftar-bab');
  const tombolBab = BAB.map((b, i) => {
    const li = el('li');
    const tombol = el('button', 'bab-item');
    tombol.type = 'button';
    tombol.append(el('span', 'bab-item__no', String(i + 1)), el('span', 'bab-item__judul', b.judul));
    tombol.addEventListener('click', () => pilihBab(i, 0, true));
    li.append(tombol);
    daftar.append(li);
    return tombol;
  });

  function pilihBab(i, l, fokus) {
    bab = i;
    langkah = l;
    gambar();
    if (fokus) $('bab').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function gambar() {
    const b = BAB[bab];
    $('posisi').textContent = `Bab ${bab + 1} dari ${BAB.length}`;
    $('bab-peran').replaceChildren(...b.peran.map((p) => el('span', 'chip', p)));
    $('bab-judul').textContent = b.judul;
    $('bab-ringkas').textContent = b.ringkas;
    $('bab-buka').replaceChildren(...b.buka.map(([teks, alamat]) => {
      const a = el('a', 'btn btn-line', teks);
      a.title = 'Dibuka di tab baru';
      a.href = alamat;
      a.target = '_blank';
      a.rel = 'noopener';
      return a;
    }));

    const dasar = b.gambar;
    const khusus = (LANGKAH_GAMBAR[bab] || [])[langkah];
    const berkas = khusus || dasar[0];
    const keterangan = khusus ? b.langkah[langkah][0] : dasar[1];
    const gambarBab = $('tampilan-gambar');
    if (!gambarBab.src.endsWith(`/${berkas}.jpg`)) gambarBab.src = `../assets/internal/${berkas}.jpg`;
    gambarBab.alt = keterangan;
    $('tampilan-teks').textContent = `${keterangan}. Tampilan asli dengan data demo.`;
    // Muat gambar langkah berikutnya lebih dulu supaya pindah langkah tidak berkedip.
    const berikut = (LANGKAH_GAMBAR[bab] || [])[langkah + 1];
    if (berikut) new Image().src = `../assets/internal/${berikut}.jpg`;

    $('catatan-isi').replaceChildren(...b.catatan.map((t) => el('li', '', t)));
    $('catatan').hidden = !catatanTerbuka;

    $('langkah-daftar').replaceChildren(...b.langkah.map(([judul, isi], i) => {
      const li = el('li');
      const tombol = el('button', `step${i === langkah ? ' is-on' : ''}${i < langkah ? ' is-done' : ''}`);
      tombol.type = 'button';
      if (i === langkah) tombol.setAttribute('aria-current', 'step');
      const teks = el('span', 'step__teks');
      teks.append(el('strong', '', judul), el('span', '', isi));
      tombol.append(el('span', 'step__no', String(i + 1)), teks);
      tombol.addEventListener('click', () => { langkah = i; gambar(); });
      li.append(tombol);
      return li;
    }));
    $('langkah-posisi').textContent = `Langkah ${langkah + 1} dari ${b.langkah.length}`;

    $('batas').hidden = !b.batas.length;
    $('batas-isi').replaceChildren(...b.batas.map((t) => el('li', '', t)));

    tombolBab.forEach((t, i) => {
      t.classList.toggle('is-on', i === bab);
      t.classList.toggle('is-done', i < bab);
      if (i === bab) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
    });
    // Bab aktif selalu kelihatan di daftar: digeser ke samping di HP, ke bawah di sidebar.
    // Hanya wadah daftarnya yang digulir, bukan halamannya.
    const itemAktif = tombolBab[bab].parentElement;
    const nav = daftar.parentElement;
    if (daftar.scrollWidth > daftar.clientWidth) {
      daftar.scrollLeft = itemAktif.offsetLeft - daftar.offsetLeft - 16;
    } else if (nav.scrollHeight > nav.clientHeight) {
      const atas = itemAktif.offsetTop;
      if (atas < nav.scrollTop || atas + itemAktif.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = atas - 80;
    }

    const total = BAB.reduce((n, x) => n + x.langkah.length, 0);
    const lewat = BAB.slice(0, bab).reduce((n, x) => n + x.langkah.length, 0) + langkah + 1;
    $('progress-bar').style.transform = `scaleX(${lewat / total})`;

    $('tombol-sebelum').disabled = bab === 0 && langkah === 0;
    const terakhir = bab === BAB.length - 1 && langkah === b.langkah.length - 1;
    $('tombol-lanjut').disabled = terakhir;
    $('tombol-lanjut').textContent = langkah === b.langkah.length - 1 && !terakhir ? 'Bab berikutnya' : 'Lanjut';

    const aktif = $('langkah-daftar').children[langkah];
    const pelan = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (aktif && document.activeElement !== document.body) aktif.scrollIntoView({ block: 'nearest', behavior: pelan ? 'auto' : 'smooth' });

    history.replaceState(null, '', `#bab-${bab}`);
    tulis({ bab, langkah });
  }

  function maju() {
    if (langkah < BAB[bab].langkah.length - 1) { langkah += 1; gambar(); return; }
    if (bab < BAB.length - 1) pilihBab(bab + 1, 0, false);
  }

  function mundur() {
    if (langkah > 0) { langkah -= 1; gambar(); return; }
    if (bab > 0) pilihBab(bab - 1, BAB[bab - 1].langkah.length - 1, false);
  }

  function aturCatatan() {
    catatanTerbuka = !catatanTerbuka;
    $('tombol-catatan').setAttribute('aria-pressed', String(catatanTerbuka));
    $('catatan').hidden = !catatanTerbuka;
  }

  function layarPenuh() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  $('tombol-lanjut').addEventListener('click', maju);
  $('tombol-sebelum').addEventListener('click', mundur);
  $('tombol-catatan').addEventListener('click', aturCatatan);
  $('tombol-layar').addEventListener('click', layarPenuh);
  document.addEventListener('fullscreenchange', () => {
    $('tombol-layar').textContent = document.fullscreenElement ? 'Keluar layar penuh' : 'Layar penuh';
  });

  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); maju(); }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); mundur(); }
    else if (event.key === 'n' || event.key === 'N') aturCatatan();
    else if (event.key === 'f' || event.key === 'F') layarPenuh();
  });

  window.addEventListener('hashchange', () => {
    const m = /^#bab-(\d+)$/.exec(location.hash);
    if (m && Number(m[1]) !== bab && Number(m[1]) < BAB.length) pilihBab(Number(m[1]), 0, false);
  });

  if (langkah >= BAB[bab].langkah.length) langkah = 0;
  gambar();
})();
