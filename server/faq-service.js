// Jawaban otomatis kotak "Tanyakan" di beranda dan fakta inti asisten (site-assistant.js).
// Sumber angka dan ketentuan: brosur Panduan Kuliah S1 2026 dan brosur Program Ma'had 2026,
// yang juga sudah tertulis di halaman program. Isinya harus sama dengan halaman program; bila ragu, lebih baik tidak cocok lalu diarahkan ke admin daripada
// menjawab keliru. "al-azhar" sengaja bukan kata kunci karena muncul di hampir semua
// pertanyaan dan membuat jawaban meleset. Bila skor seri, entri yang lebih atas menang,
// jadi topik lintas program (biaya, status, bahasa) ditaruh sebelum topik program.
const KNOWLEDGE_BASE = Object.freeze([
  {
    id: 'pendaftaran',
    label: 'Tentang pendaftaran',
    keywords: ['daftar', 'pendaftaran', 'mendaftar', 'formulir', 'dokumen', 'berkas'],
    answer: 'Isi formulir di halaman Daftar konsultasi. Setelah terkirim, Anda langsung menerima nomor registrasi dan Kode Akses, lalu tim kami menghubungi lewat WhatsApp. Untuk mendaftar cukup pindaian ijazah dan paspor atau KTP; dokumen asli baru dibutuhkan setelah lulus seleksi. Berkas diunggah lewat halaman Cek status.'
  },
  {
    id: 'cicilan',
    label: 'Cicilan dan pengembalian biaya',
    keywords: ['cicil', 'dicicil', 'cicilan', 'angsur', 'diangsur', 'bertahap', 'refund', 'kembali', 'dikembalikan', 'batal', 'hangus'],
    answer: 'Pembayaran bisa dicicil: dilakukan bertahap mengikuti tahap pendaftaran yang sedang berjalan. Uang yang sudah dibayar bisa dikembalikan dengan ketentuan: DP pemberkasan tidak dikembalikan (Rp 5 juta untuk Ma\'had dan Rp 4,5 juta untuk Kuliah), sedangkan kelebihan pembayaran di atas DP dikembalikan. Semua angka bersifat estimasi dan bisa berubah mengikuti regulasi Al-Azhar serta kebijakan pemerintah Mesir dan Indonesia.'
  },
  {
    id: 'fasilitas',
    label: 'Fasilitas asrama',
    keywords: ['fasilitas', 'asrama', 'kamar', 'ac', 'wifi', 'cuci', 'katering', 'makan', 'musyrif', 'musyrifah', 'dapur', 'kulkas'],
    answer: "Asrama Hamasah di Nasr City, Kairo, berada di lingkungan pelajar dan mahasiswa, dengan kamar ber-AC. Fasilitasnya: makan dua kali sehari, tempat belajar yang aman dan nyaman, Wi-Fi, gas, air, dan listrik sudah termasuk, kulkas, mesin cuci, pemanas air, filter air, dan peralatan dapur lengkap. Ada juga kajian harian, persiapan bahasa Arab, pembimbing setoran Al-Qur'an, serta musyrif dan musyrifah 24 jam."
  },
  {
    id: 'biaya-kuliah',
    label: 'Biaya jalur kuliah',
    keywords: ['biaya', 'harga', 'kuliah', 's1', 'universitas', 'mahasiswa', 'keberangkatan', 'non-asrama', 'non'],
    answer: 'Biaya jalur Kuliah S1 dari Indonesia (estimasi 2026/2027): pendaftaran, verifikasi dokumen, dan Tahdid Mustawa Rp 1.100.000; karantina daring dan ujian muadalah Rp 2.800.000; keberangkatan ke Kairo Rp 20.000.000 untuk program asrama atau Rp 18.500.000 untuk non-asrama. Pembayaran dilakukan bertahap. Rinciannya ada di halaman Program Kuliah S1.'
  },
  {
    id: 'mesir',
    label: 'Sekilas tentang Mesir',
    keywords: ['mesir', 'dimana', 'negara', 'letak', 'ummu', 'anbiya', 'ibu kota', 'benua'],
    answer: 'Mesir adalah negara republik dengan ibu kota Kairo. Sebagian besar wilayahnya berada di benua Afrika dan sebagian di Asia, berbatasan dengan Libya di barat, Sudan di selatan, Laut Mediterania di utara, serta Israel dan Yordania di timur. Mesir dijuluki Ummu Dunya (ibu dunia) dan Ardul Anbiya (negeri para nabi).'
  },
  {
    id: 'biaya-mesir',
    label: 'Biaya bagi pelajar yang sudah di Mesir',
    keywords: ['biaya', 'mesir', 'sudah di mesir', 'domisili', 'berdomisili', 'tinggal di mesir', 'pemberkasan'],
    answer: 'Untuk pelajar yang sudah berada di Mesir, biaya jalur Kuliah S1: pendaftaran dan verifikasi dokumen Rp 500.000; karantina daring dan ujian muadalah Rp 2.800.000; pemberkasan dan administrasi kuliah Rp 5.000.000. Alurnya mirip, hanya berbeda pada tahap bahasa (dirosah khossoh sampai mutawasith awal).'
  },
  {
    id: 'biaya-mahad',
    label: "Biaya jalur ma'had",
    keywords: ['biaya', 'harga', 'mahad', "ma'had", 'masuk'],
    answer: "Biaya jalur Ma'had (estimasi 2026): keberangkatan Rp 22.000.000 sekali bayar, sudah termasuk tiket Jakarta ke Kairo, visa, pemberkasan, bimbingan pendaftaran di Kairo, biaya asrama bulan pertama, dan perlengkapan pribadi. Setelah itu biaya asrama Rp 1.800.000 per bulan, termasuk makan dua kali sehari. Rinciannya ada di halaman Program Ma'had."
  },
  {
    id: 'biaya-asrama',
    label: 'Biaya asrama',
    keywords: ['biaya', 'asrama', 'bulan', 'bulanan', 'perbulan', 'spp', 'sewa', 'kos', 'kost'],
    answer: "Biaya asrama Hamasah di Kairo Rp 1.800.000 per bulan. Sudah termasuk makan dua kali sehari, gas, air, dan listrik, kulkas, mesin cuci, pemanas air, filter air, peralatan dapur, kajian harian, persiapan bahasa Arab, pembimbing setoran Al-Qur'an, serta musyrif atau musyrifah 24 jam."
  },
  {
    id: 'cakupan',
    label: 'Yang termasuk biaya keberangkatan',
    keywords: ['termasuk', 'mencakup', 'cakupan', 'tiket', 'pesawat', 'keberangkatan', 'dapat apa'],
    answer: "Biaya keberangkatan jalur Kuliah mencakup tiket pesawat Jakarta ke Kairo, pemberkasan di Jakarta dan rekomendasi Kemenag, visa di Kedutaan Besar Mesir, pendampingan keberangkatan, penjemputan di bandara Kairo, sewa apartemen bulan pertama, perlengkapan dan fasilitas apartemen, pemberkasan di Kairo sampai terdaftar di fakultas, seragam keberangkatan, dan infak lembaga. Untuk jalur Ma'had: tiket, visa, pendampingan bandara, pemberkasan, bimbingan lapor diri ke KBRI Kairo, pendaftaran di Kairo, asrama bulan pertama, dan perlengkapan pribadi."
  },
  {
    id: 'biaya',
    label: 'Tentang biaya',
    keywords: ['biaya', 'harga', 'bayar', 'uang', 'mahal', 'murah', 'total', 'semua', 'keseluruhan', 'sampai', 'berangkat'],
    answer: "Kuliah S1 dari Indonesia: Rp 1.100.000 untuk pendaftaran dan Tahdid Mustawa, Rp 2.800.000 untuk karantina dan ujian, lalu keberangkatan Rp 20.000.000 (asrama) atau Rp 18.500.000 (non-asrama). Ma'had: keberangkatan Rp 22.000.000 dan asrama Rp 1.800.000 per bulan. Kelas daring: disampaikan saat konsultasi. Semua angka estimasi 2026, bisa dicicil bertahap, dan konsultasinya tanpa biaya."
  },
  {
    id: 'status',
    label: 'Tentang cek status',
    keywords: ['status', 'cek status', 'kode akses', 'nomor registrasi', 'lacak', 'unggah', 'hilang', 'lupa'],
    answer: 'Buka halaman Cek status, lalu masukkan nomor registrasi dan Kode Akses yang muncul setelah Anda mendaftar. Bila kodenya hilang, hubungi admin lewat WhatsApp dan sebutkan nomor registrasi Anda.'
  },
  {
    id: 'bahasa',
    label: 'Tentang bahasa Arab',
    keywords: ['bahasa arab', 'mahir', 'belum bisa', 'lancar', 'pemula'],
    answer: "Tidak harus sudah mahir. Calon mahasiswa mengikuti Tahdid Mustawa, yaitu ujian penempatan level bahasa Arab. Bila levelnya belum cukup, ada kelas bahasa dulu sebelum Dauroh Ta'hili. Persiapan terbaik: perkuat bahasa Arab dan Al-Qur'an, lihat artikel Tips lulus tes Universitas Al-Azhar Kairo di Pena Hamasah."
  },
  {
    id: 'level-bahasa',
    label: 'Enam level bahasa Arab',
    keywords: ['level', 'bahasa arab', 'tingkat', 'tingkatan', 'mubtadi', 'mutawassit', 'mutawasith', 'mutaqaddim', 'ifadah', 'najah', 'matrikulasi'],
    answer: "Tahdid Mustawa membagi kemampuan bahasa Arab menjadi enam level: Mubtadi Awal, Mubtadi Tsani, Mutawassit Awal, Mutawassit Tsani, Mutaqaddim Awal, dan Mutaqaddim Tsani. Level Mubtadi Awal sampai Mutawassit Awal wajib kelas bahasa dulu; Mutawassit Tsani dan Mutaqaddim Awal bisa langsung ikut Dauroh Ta'hili; Mutaqaddim Tsani bebas kelas bahasa dan berhak atas ifadah najah, yaitu surat keterangan lulus."
  },
  {
    id: 'dauroh',
    label: "Dauroh Ta'hili dan ujian muadalah",
    keywords: ['dauroh', 'tahili', "ta'hili", 'tahily', 'karantina', 'muadalah', "mu'adalah", 'penyetaraan', 'pengumuman', 'diumumkan', 'hasil ujian'],
    answer: "Dauroh Ta'hili adalah karantina daring sekitar 30 hari dari Markaz Tatwir untuk mempersiapkan ujian muadalah, yaitu ujian penyetaraan ijazah. Bila lulus, ijazah Anda dianggap setara dan bisa dipakai masuk Universitas Al-Azhar. Hasil ujian diumumkan Markaz Tatwir sekitar dua minggu setelah ujian."
  },
  {
    id: 'markaz-tatwir',
    label: 'Tentang Markaz Tatwir',
    keywords: ['markaz', 'tatwir'],
    answer: "Markaz Tatwir adalah lembaga pendidikan Al-Azhar untuk pelajar asing. Lembaga ini memverifikasi berkas pendaftar, menjadwalkan Tahdid Mustawa, menyelenggarakan Dauroh Ta'hili, dan mengumumkan hasil ujian muadalah."
  },
  {
    id: 'tahdid',
    label: 'Tentang Tahdid Mustawa',
    keywords: ['tahdid', 'mustawa', 'tes bahasa', 'ujian bahasa', 'penempatan'],
    answer: "Tahdid Mustawa adalah tes kemampuan bahasa Arab untuk menentukan level Anda, dari Mubtadi Awal sampai Mutaqaddim Tsani (enam level). Ujian ini dijadwalkan Markaz Tatwir setelah berkas terverifikasi, dan peserta di Indonesia mengikutinya dari Indonesia. Hasilnya menentukan apakah Anda perlu kelas bahasa dulu atau bisa langsung ikut Dauroh Ta'hili."
  },
  {
    id: 'jadwal',
    label: 'Jadwal penerimaan',
    keywords: ['dibuka', 'buka', 'gelombang', 'jadwal', 'tutup', 'ditutup', 'deadline', 'periode', 'penerimaan'],
    answer: 'Penerimaan yang sedang berjalan adalah tahun akademik 2026/2027. Tanggal pembukaan dan penutupan tiap gelombang mengikuti jadwal Al-Azhar, jadi untuk kepastiannya silakan tanyakan ke admin lewat WhatsApp. Anda tetap bisa mengisi formulir konsultasi kapan saja.'
  },
  {
    id: 'paspor',
    label: 'Belum punya paspor',
    keywords: ['paspor', 'belum punya', 'ktp'],
    answer: 'Bisa. Untuk mendaftar cukup pindaian ijazah dan paspor atau KTP, jadi KTP saja sudah cukup untuk tahap awal. Paspor asli yang berlaku minimal 18 bulan dibutuhkan setelah lulus seleksi, sebelum keberangkatan.'
  },
  {
    id: 'syarat-kuliah',
    label: 'Syarat jalur kuliah',
    keywords: ['syarat', 'persyaratan', 'kuliah', 's1', 'paspor', 'ijazah'],
    answer: 'Syarat jalur Kuliah S1: muslim atau muslimah, lulusan MA, SMA, atau sederajat, paspor berlaku minimal 18 bulan, dan rekomendasi Kemenag daerah. Untuk mendaftar cukup pindaian ijazah dan paspor atau KTP. Setelah lulus seleksi dibutuhkan dokumen asli: ijazah, akta kelahiran, paspor, surat izin orang tua bermeterai, pasfoto 4x6, dan surat rekomendasi Kemenag.'
  },
  {
    id: 'syarat-mahad',
    label: "Syarat jalur ma'had",
    keywords: ['syarat', 'persyaratan', 'mahad', "ma'had", 'usia', 'umur', 'pasfoto', 'foto', 'lembar'],
    answer: "Syarat jalur Ma'had: muslim atau muslimah berusia 13 sampai 30 tahun, ijazah SD, SMP, SMA, atau sederajat, paspor, surat rekomendasi Kemenag daerah, pindaian kartu keluarga, akta kelahiran, dan KTP bila ada, surat pernyataan orang tua, surat keterangan sehat, dan pasfoto 4x6 latar putih 10 lembar."
  },
  {
    id: 'alur-mahad',
    label: "Alur jalur ma'had",
    keywords: ['alur', 'tahap', 'tahapan', 'proses', 'langkah', 'mahad', "ma'had", 'qobul', 'tes qobul'],
    answer: "Alur jalur Ma'had: kirim berkas ke tim Hamasah, tunggu visa dan jadwal keberangkatan, lalu setiba di Kairo tim kami membimbing pendaftaran. Setelah terdaftar, pelajar mengikuti tes bahasa Arab dan kelas bahasa (enam level), kemudian tes qobul yang menentukan kelas I'dadi atau Tsanawi."
  },
  {
    id: 'akselerasi',
    label: "Akselerasi dan penempatan kelas ma'had",
    keywords: ['akselerasi', 'program akselerasi', 'percepatan', 'lompat', 'loncat', 'cepat lulus', 'menentukan kelas', 'penempatan kelas', 'lama pendidikan'],
    answer: "Di Ma'had Al-Azhar ada program akselerasi: dari kelas 2 I'dadi (SMP) pelajar bisa langsung naik ke Tsanawi (SMA), dan dari kelas 2 Tsanawi bisa langsung memperoleh ijazah lalu melanjutkan ke Universitas Al-Azhar. Syaratnya nilai tes yang tinggi. Ijazah dari Indonesia tidak menentukan kelas; semua calon dites di Kairo dengan kesempatan yang sama."
  },
  {
    id: 'program-kuliah',
    label: 'Tentang jalur kuliah',
    keywords: ['kuliah', 'universitas', 's1', 'mahasiswa', 'alur', 'tahap', 'tahapan'],
    answer: "Jalur Kuliah S1 untuk lulusan SMA, MA, atau pesantren, putra maupun putri. Alurnya delapan tahap: formulir pendaftaran, verifikasi dokumen, hasil seleksi administrasi, Tahdid Mustawa, kelas bahasa sampai Mutaqaddim Awal, karantina daring Dauroh Ta'hili, ujian seleksi, lalu pemberkasan akhir, keberangkatan, dan daftar ulang di fakultas."
  },
  {
    id: 'program-mahad',
    label: "Tentang Ma'had",
    keywords: ['mahad', "ma'had", 'smp', 'sma', "i'dadi", 'idadi', 'tsanawi', 'sekolah'],
    answer: "Ma'had Al-Azhar adalah sekolah resmi Al-Azhar di Kairo setingkat SMP (I'dadi) dan SMA (Tsanawi), untuk usia 13 sampai 30 tahun, lulusan SD, SMP, maupun SMA. Penempatan kelas ditentukan lewat tes bahasa dan tes qobul di Kairo, bukan dari ijazah Indonesia, dan pelajar berprestasi berpeluang akselerasi."
  },
  {
    id: 'lembaga',
    label: 'Tentang Hamasah International',
    keywords: ['hamasah', 'profil', 'lembaga', 'resmi', 'legal', 'legalitas', 'terpercaya', 'penipuan', 'visi berkah', 'siapa'],
    answer: 'Hamasah International adalah lembaga konsultan pendidikan luar negeri yang mendampingi pelajar Indonesia menuju Al-Azhar, didukung oleh PT Visi Berkah International. Kantornya ada di Ciawi, Bogor dan di Nasr City, Kairo. Pendaftaran pelajar diproses bersama Markaz Tatwir, lembaga pendidikan Al-Azhar untuk pelajar asing.'
  },
  {
    id: 'courses',
    label: 'Tentang kelas daring',
    keywords: ['courses', 'hamasah courses', 'daring', 'online', 'nahwu', 'sharaf', 'balaghah', 'kelas', 'lms', 'e-learning'],
    answer: "Hamasah Courses adalah kelas daring (e-learning Hamasah) yang memuat seluruh mata pelajaran Dirasah Khassah, Ma'had (I'dadi dan Tsanawi), dan kuliah tingkat 1, termasuk kelas dasar nahwu, sharaf, adab, dan balaghah. Materinya bisa diulang kapan saja. Jadwal dan cara bergabung dijelaskan setelah Anda mendaftar."
  },
  {
    id: 'fakultas',
    label: 'Fakultas dan jurusan',
    keywords: ['fakultas', 'jurusan', 'prodi', 'ushuluddin', 'syariah', 'dirasat', 'dakwah', 'banin', 'banat', 'putra', 'putri'],
    answer: 'Putra (banin): Ushuluddin (Aqidah dan Filsafat, Hadis dan Ulumul Hadis, Dakwah, Filsafat), Syariah wal Qanun (Syariah wal Qanun, Syariah Islamiyyah), Bahasa Arab (Bahasa dan Sastra, Sejarah dan Peradaban), Dirasat Islamiyyah wal Arabiyyah, dan Dakwah Islamiyyah. Putri (banat): Dirasat Islamiyyah wal Arabiyyah, dengan jurusan Ushuluddin, Syariah Islamiyyah, dan Bahasa Arab. Pilihan fakultas mengikuti ketentuan resmi Al-Azhar.'
  },
  {
    id: 'pilih-program',
    label: 'Memilih program',
    keywords: ['kuliah', 'mahad', "ma'had", 'courses', 'pilih', 'cocok', 'program', 'jalur', 'lulusan', 'lulus', 'sd', 'smp', 'sma', 'pesantren', 'bedanya', 'beda', 'perbedaan', 'anak'],
    answer: "Kuliah S1 untuk lulusan SMA, MA, atau pesantren yang ingin masuk Universitas Al-Azhar. Ma'had untuk usia 13 sampai 30 tahun, lulusan SD, SMP, atau SMA, belajar di sekolah Al-Azhar setingkat SMP dan SMA sebelum melanjutkan ke universitas. Hamasah Courses adalah kelas daring yang bisa diikuti dari rumah. Bila masih ragu, kami bantu menimbangnya saat konsultasi gratis."
  },
  {
    id: 'kontak',
    label: 'Alamat dan kontak',
    keywords: ['alamat', 'dimana', 'kantor', 'lokasi', 'whatsapp', 'nomor', 'kontak', 'hubungi', 'admin', 'telepon', 'telpon', 'instagram'],
    answer: 'WhatsApp Admin 1: +62 812-8848-9997, Admin 2: +62 877-5861-9337. Instagram: @hamasah_international. Kantor Indonesia: Jl. Karakal RT 003/RW 003, Desa Banjar Sari, Kec. Ciawi, Kab. Bogor, Jawa Barat. Kantor Mesir: Sheikh Taha Dinary, Imarah 32, Lantai 1, Syaqqah 3, Hay Sabi, Nasr City, Kairo.'
  },
  {
    id: 'visi-misi',
    label: 'Visi dan misi',
    keywords: ['visi', 'misi', 'tujuan'],
    answer: 'Visi Hamasah: turut mencerdaskan kehidupan bangsa dengan memfasilitasi pelajar Indonesia menimba ilmu di berbagai penjuru dunia. Misinya: menyederhanakan administrasi dan pemberkasan, menyelenggarakan persiapan tes yang efektif, mendampingi dari persiapan sampai keberangkatan, bertanggung jawab atas keamanan dan kenyamanan pelajar di luar negeri, menyediakan fasilitas belajar, dan membantu lewat jalur beasiswa maupun biaya mandiri yang terjangkau.'
  },
  {
    id: 'beasiswa',
    label: 'Tentang beasiswa',
    keywords: ['beasiswa'],
    answer: 'Salah satu misi Hamasah adalah membantu studi lewat jalur beasiswa maupun biaya mandiri yang terjangkau. Informasi beasiswa yang sedang dibuka belum tercantum di website, jadi silakan tanyakan ke admin lewat WhatsApp.'
  },
  {
    id: 'kegiatan',
    label: 'Kegiatan santri',
    keywords: ['kegiatan', 'aktivitas', 'keseharian', 'sehari-hari', 'olahraga', 'futsal', 'badminton', 'tahfiz', 'kajian'],
    answer: 'Kegiatan santri Hamasah di Kairo antara lain salat subuh berjamaah, kegiatan tahfiz dan setoran hafalan, kajian sore, tarawih keliling, peringatan Maulid Nabi, open house dan halal bihalal, lomba 17 Agustus, tur tempat bersejarah, serta olahraga mingguan badminton dan futsal.'
  },
  {
    id: 'kairo',
    label: 'Tentang keberangkatan dan asrama',
    keywords: ['mesir', 'kairo', 'keberangkatan', 'berangkat', 'visa', 'asrama', 'makan', 'jemput', 'bandara'],
    answer: 'Tim Hamasah mengurus visa pelajar, penjemputan di bandara Kairo, dan asrama di Nasr City dengan makan dua kali sehari. Jadwal keberangkatan dikonfirmasi per pendaftar dan tampil di halaman Cek status.'
  },
  {
    id: 'wali',
    label: 'Tentang portal wali',
    keywords: ['wali', 'orang tua', 'portal', 'rapor', 'presensi', 'hafalan', 'laporan', 'memantau', 'pantau', 'perkembangan', 'anak', 'ananda'],
    answer: 'Musyrif/ah asrama menyampaikan laporan santri setiap tanggal 1 tiap bulan lewat rapat daring. Di luar itu, wali bisa memantau presensi sholat, setoran hafalan, rapor, dan kuitansi lewat portal santri & wali.'
  },
  {
    id: 'sejarah',
    label: 'Sejarah Al-Azhar',
    keywords: ['sejarah', 'didirikan', 'berdiri', 'dibangun', 'pendiri', 'tertua'],
    answer: 'Al-Azhar berawal dari masjid yang mulai dibangun pada 14 Ramadhan 359 H (25 Juli 970 M) atas perintah Khalifah Muiz Lidinillah dan dirancang Jauhar As-Siqli. Masjid ini berkembang menjadi pusat pembelajaran Sunni, lalu pada 1961 diresmikan sebagai universitas modern. Selengkapnya ada di artikel Sekilas tentang Al-Azhar di Pena Hamasah.'
  }
]);

const UNSAFE_PATTERNS = Object.freeze([
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /bypass\s+(your\s+)?(safety|rules|policy)/i
]);

function answerQuestion(question) {
  const normalized = String(question || '').toLocaleLowerCase('id-ID').trim();
  if (normalized.length < 3) {
    return { matched: false, answer: 'Tulis pertanyaan yang lebih lengkap agar kami dapat membantu.' };
  }
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { matched: false, handoff: true, source: 'faq-safety', answer: 'Saya hanya dapat membantu pertanyaan tentang program dan layanan Hamasah. Untuk hal di luar itu, silakan hubungi tim Hamasah.' };
  }

  const ranked = KNOWLEDGE_BASE
    .map(function score(entry) {
      const score = entry.keywords.reduce(function sum(total, keyword) {
        return total + (normalized.includes(keyword) ? 1 : 0);
      }, 0);
      return { entry, score };
    })
    .sort(function highestFirst(left, right) { return right.score - left.score; });

  if (!ranked[0] || ranked[0].score === 0) {
    return {
      matched: false,
      handoff: true,
      source: 'faq-handoff',
      answer: 'Pertanyaan ini belum ada di jawaban otomatis kami. Tanyakan langsung ke admin lewat WhatsApp agar jawabannya sesuai kondisi terbaru.'
    };
  }

  return {
    matched: true,
    source: 'faq-approved',
    topic: ranked[0].entry.id,
    label: ranked[0].entry.label,
    answer: ranked[0].entry.answer
  };
}

module.exports = { KNOWLEDGE_BASE, answerQuestion };
