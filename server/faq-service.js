// Jawaban otomatis kotak "Tanyakan" di beranda. Isinya harus sama dengan yang tertulis di
// halaman program; bila ragu, lebih baik tidak cocok lalu diarahkan ke admin daripada
// menjawab keliru. "al-azhar" sengaja bukan kata kunci karena muncul di hampir semua
// pertanyaan dan membuat jawaban meleset. Bila skor seri, entri yang lebih atas menang,
// jadi topik lintas program (biaya, status, bahasa) ditaruh sebelum topik program.
const KNOWLEDGE_BASE = Object.freeze([
  {
    id: 'pendaftaran',
    label: 'Tentang pendaftaran',
    keywords: ['daftar', 'pendaftaran', 'dokumen', 'berkas', 'syarat', 'paspor', 'ijazah'],
    answer: 'Isi formulir pendaftaran di beranda. Setelah terkirim, Anda langsung menerima nomor registrasi dan Kode Akses, lalu tim kami menghubungi lewat WhatsApp. Untuk mendaftar cukup pindaian ijazah dan paspor atau KTP; dokumen asli baru dibutuhkan setelah lulus seleksi. Berkas diunggah lewat halaman Cek status.'
  },
  {
    id: 'biaya',
    label: 'Tentang biaya',
    keywords: ['biaya', 'harga', 'bayar', 'spp', 'cicil', 'angsur', 'uang', 'mahal'],
    answer: "Nominal biaya disampaikan saat konsultasi karena mengikuti program dan periode keberangkatan. Pembayaran bisa dicicil: untuk Ma'had DP Rp 5 juta lalu dilunasi sebelum berangkat, untuk Kuliah dicicil selama rangkaian tes. Komponen dan fasilitasnya ada di halaman Biaya & fasilitas. Konsultasinya tanpa biaya."
  },
  {
    id: 'status',
    label: 'Tentang cek status',
    keywords: ['status', 'kode akses', 'nomor registrasi', 'lacak', 'unggah'],
    answer: 'Buka halaman Cek status, lalu masukkan nomor registrasi dan Kode Akses yang muncul setelah Anda mendaftar. Bila kodenya hilang, hubungi admin lewat WhatsApp dan sebutkan nomor registrasi Anda.'
  },
  {
    id: 'bahasa',
    label: 'Tentang bahasa Arab',
    keywords: ['bahasa arab', 'tahdid', 'mustawa', 'dauroh', 'mahir', 'belum bisa'],
    answer: 'Tidak harus sudah mahir. Calon mahasiswa mengikuti Tahdid Mustawa untuk penempatan level bahasa Arab. Bila levelnya belum cukup, ada kelas bahasa dulu sebelum Dauroh Ta\'hili. Persiapan terbaik: perkuat bahasa Arab dan Al-Qur\'an, lihat artikel Tips lulus tes Universitas Al-Azhar Kairo di Pena Hamasah.'
  },
  {
    id: 'program-kuliah',
    label: 'Tentang jalur kuliah',
    keywords: ['kuliah', 'universitas', 'fakultas', 's1', 'jurusan', 'muadalah', 'mahasiswa'],
    answer: "Jalur Kuliah S1 untuk lulusan SMA, MA, atau pesantren, putra maupun putri. Alurnya: formulir, verifikasi berkas, Tahdid Mustawa, Dauroh Ta'hili dan ujian muadalah, lalu keberangkatan dan daftar ulang di fakultas."
  },
  {
    id: 'program-mahad',
    label: "Tentang Ma'had",
    keywords: ['mahad', "ma'had", 'smp', 'sma', "i'dadi", 'idadi', 'tsanawi', 'sekolah'],
    answer: "Ma'had Al-Azhar adalah sekolah resmi Al-Azhar di Kairo setingkat SMP (I'dadi) dan SMA (Tsanawi), terbuka untuk lulusan SD, SMP, maupun SMA. Penempatan kelas ditentukan lewat tes bahasa dan tes qobul di Kairo, bukan dari ijazah Indonesia, dan pelajar berprestasi berpeluang akselerasi."
  },
  {
    id: 'courses',
    label: 'Tentang kelas daring',
    keywords: ['courses', 'daring', 'online', 'nahwu', 'sharaf', 'balaghah', 'kelas'],
    answer: "Hamasah Courses (e-learning Hamasah) memuat seluruh mata pelajaran Dirasah Khassah, Ma'had (I'dadi dan Tsanawi), dan kuliah tingkat 1, termasuk kelas dasar nahwu, sharaf, adab, dan balaghah. Materinya bisa diulang kapan saja. Jadwal dan cara bergabung dijelaskan setelah Anda mendaftar."
  },
  {
    id: 'kairo',
    label: 'Tentang keberangkatan dan asrama',
    keywords: ['mesir', 'kairo', 'keberangkatan', 'berangkat', 'visa', 'asrama', 'makan'],
    answer: 'Tim Hamasah mengurus visa pelajar, penjemputan di bandara Kairo, dan asrama di Nasr City dengan makan dua kali sehari. Jadwal keberangkatan dikonfirmasi per pendaftar dan tampil di halaman Cek status.'
  },
  {
    id: 'wali',
    label: 'Tentang portal wali',
    keywords: ['wali', 'orang tua', 'portal', 'rapor', 'presensi', 'hafalan', 'laporan'],
    answer: 'Musyrif/ah asrama menyampaikan laporan santri setiap tanggal 1 tiap bulan lewat rapat daring. Di luar itu, wali bisa memantau presensi sholat, setoran hafalan, rapor, dan kuitansi lewat portal santri & wali.'
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
