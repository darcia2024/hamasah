'use strict';

// Konten website publik yang diubah super admin dari halaman Konten Website (konten.html).
//
// Halaman HTML di website/ tetap memuat isi bawaannya sendiri. Bagian yang bisa diubah
// ditandai komentar pembatas:
//
//   <!--konten:biaya.kuliah.harga--> ...isi bawaan... <!--/konten:biaya.kuliah.harga-->
//
// Selama satu blok belum pernah disimpan, halaman disajikan apa adanya. Setelah disimpan,
// server mengganti isi di antara pembatas dengan hasil render dari nilai tersimpan sebelum
// halaman dikirim (renderHalaman). Jadi tidak ada teks yang berkedip di peramban, mesin
// pencari membaca isi terbaru, dan asisten website ikut menjawab dari isi yang sama.
//
// BAWAAN di bawah harus sama dengan isi HTML. site-content.test.js memeriksanya, supaya
// formulir admin selalu dimulai dari teks yang memang tampil di situs.

const fs = require('node:fs');
const path = require('node:path');

const NOMOR_WA_BAWAAN = '6281288489997';

// Foto testimoni hanya boleh dipilih dari berkas yang ada di assets/. CSP situs hanya
// mengizinkan gambar dari domain sendiri, jadi URL luar tidak akan tampil. Foto baru
// cukup dikirim ke pengembang untuk ditambahkan ke daftar ini.
const FOTO_TESTIMONI = Object.freeze([
  { berkas: 'testimoni-wali-ghazalba.webp', label: 'Keluarga wali Ghazalba', lebar: 1280, tinggi: 853 },
  { berkas: 'testimoni-wali-aruna.webp', label: 'Ayah dan ibu wali Aruna', lebar: 1091, tinggi: 1280 },
  { berkas: 'testimoni-wali-khafidzah.webp', label: 'Wali Khafidzah bersama putrinya', lebar: 720, tinggi: 900 },
  { berkas: 'cairo-arches.webp', label: 'Lengkung bangunan Kairo', lebar: 1600, tinggi: 1066 },
  { berkas: 'cairo-skyline.webp', label: 'Pemandangan kota Kairo', lebar: 1600, tinggi: 1068 },
  { berkas: 'kelas-daring-kitab.webp', label: 'Santri belajar kitab dari rumah', lebar: 1200, tinggi: 800 },
  { berkas: 'hero-student.webp', label: 'Belajar dengan laptop', lebar: 1200, tinggi: 800 },
  { berkas: 'subcard-student.webp', label: 'Santri di Kairo', lebar: 500, tinggi: 333 },
  { berkas: '', label: 'Tanpa foto (logo Hamasah)', lebar: 512, tinggi: 512 }
]);

const PROGRAM = Object.freeze(['kuliah', 'mahad', 'courses']);

// Foto galeri bawaan di assets/galeri/. Foto baru diunggah admin (tujuan 'gallery-photo')
// dan disimpan sebagai "unggah/<id>.<ext>", disajikan lewat /media/galeri/<id>.<ext>.
const FOTO_GALERI_ASET = Object.freeze((() => {
  try {
    return fs.readdirSync(path.join(__dirname, '..', 'assets', 'galeri')).filter((nama) => /\.(jpe?g|png|webp)$/i.test(nama)).map((nama) => `galeri/${nama}`);
  } catch {
    return [];
  }
})());

// Foto bawaan dulu berformat JPEG dan kini WebP. Konten yang sudah disimpan admin masih
// memuat nama lama ("galeri/x.jpg", "cairo-arches.jpg"); nama itu dipetakan ke berkas
// WebP yang sama supaya isi tersimpan tidak dianggap rusak lalu kembali ke bawaan.
function namaFotoTerkini(foto, dikenal) {
  const nama = String(foto || '');
  if (dikenal(nama) || nama.startsWith('unggah/')) return nama;
  const webp = nama.replace(/\.(jpe?g|png)$/i, '.webp');
  return webp !== nama && dikenal(webp) ? webp : nama;
}

// Versi lebar 640px untuk foto bawaan yang besar (assets/galeri/kecil/). Beranda menampilkan
// foto galeri sekitar 300px, jadi yang dimuat versi kecil; versi asli tetap dipakai saat
// foto diperbesar.
const FOTO_GALERI_KECIL = Object.freeze(new Set((() => {
  try {
    return fs.readdirSync(path.join(__dirname, '..', 'assets', 'galeri', 'kecil')).map((nama) => `galeri/${nama}`);
  } catch {
    return [];
  }
})()));

function srcsetFotoGaleri(f) {
  if (!FOTO_GALERI_KECIL.has(f.foto)) return '';
  const kecil = `../assets/galeri/kecil/${f.foto.slice('galeri/'.length)}`;
  return ` srcset="${kecil} 640w, ${srcFotoGaleri(f.foto)} ${f.lebar}w" sizes="(max-width: 640px) 68vw, 320px"`;
}

function srcFotoGaleri(foto) {
  return foto.startsWith('unggah/') ? `/media/galeri/${foto.slice('unggah/'.length)}` : `../assets/${foto}`;
}

const BAWAAN = Object.freeze({
  kontak: {
    whatsapp: NOMOR_WA_BAWAAN,
    alamatIndonesia: 'Jl. Karakal RT 003/RW 003, Desa Banjar Sari\nKec. Ciawi, Kab. Bogor, Jawa Barat',
    alamatMesir: 'Sheikh Taha Dinary, Imarah 32, Lantai 1, Syaqqah 3\nHay Sabi, Nasr City, Kairo\nRepublik Arab Mesir',
    jamLayanan: 'Admin bertugas dari Indonesia dan Mesir, sehingga pesan dapat dibalas hampir sepanjang hari.',
    email: '',
    instagram: '',
    tiktok: '',
    youtube: ''
  },

  biaya: {
    pengantar: 'Halaman ini merinci komponen dan fasilitas tiap program. Rincian biaya jalur kuliah dan ma\'had ada di halaman programnya masing-masing; untuk kelas daring nominalnya disampaikan saat konsultasi, dan konsultasinya tanpa biaya.',
    program: {
      kuliah: {
        label: 'Biaya awal mulai',
        harga: 'Rp 1.100.000',
        keterangan: 'Pendaftaran, verifikasi dokumen, dan Tahdid Mustawa. Tahap berikutnya dibayar bertahap.',
        fasilitas: [
          'Konsultasi pemilihan fakultas & pemetaan jurusan',
          'Bimbingan persiapan Ujian Bahasa (Tahdid Mustawa)',
          'Pengurusan berkas Kemenag, Kemlu, & Kedubes Mesir',
          'Penerbitan visa pelajar & penjemputan bandara Kairo',
          'Kamar asrama ber-AC di Nasr City & makan 2x sehari',
          'Setoran hafalan dan kajian harian bersama musyrif',
          'Presensi sholat dan hafalan tercatat di portal santri & wali'
        ]
      },
      mahad: {
        label: 'Biaya keberangkatan',
        harga: 'Rp 22.000.000',
        keterangan: 'Sekali bayar. Asrama di Kairo Rp 1.800.000 per bulan, termasuk makan dua kali sehari.',
        fasilitas: [
          'Jalur ijazah mengikuti ketentuan lembaga pendidikan terkait',
          "Pembimbing setoran Al-Qur'an dan adab harian",
          'Bahasa Arab aktif, lisan dan tulisan',
          'Asrama aman ber-AC di Nasr City dengan musyrif 24 jam',
          'Katering makanan nusantara halal & bergizi 2x sehari',
          'Laporan bulanan musyrif/ah ke wali lewat rapat daring setiap tanggal 1'
        ]
      },
      courses: {
        label: 'Biaya Program',
        harga: 'Dikonfirmasi saat konsultasi',
        keterangan: 'Mengikuti materi dan paket yang dipilih',
        fasilitas: [
          'Seluruh mata pelajaran Dirasah Khassah (DK)',
          "Mata pelajaran Ma'had I'dadi dan Tsanawi, serta kuliah tingkat 1",
          'Berbasis kitab rujukan, dari dasar ke lanjutan',
          'Materi tersimpan dan bisa diulang untuk murajaah',
          'Akses kelas lewat portal santri'
        ]
      }
    },
    faq: [
      {
        tanya: 'Apakah biaya pendaftaran awal dapat diangsur?',
        jawab: "Ya, pembayaran bisa dicicil. Untuk Ma'had, DP Rp 5 juta, lalu sisanya dilunasi sebelum keberangkatan. Untuk Kuliah, calon mengikuti rangkaian tes terlebih dahulu, dan pembayarannya dapat dicicil selama proses berjalan."
      },
      {
        tanya: 'Bagaimana cara orang tua mengirimkan uang saku ke Kairo?',
        jawab: 'Uang saku dikirim orang tua langsung ke rekening santri masing-masing. Untuk pembayaran ke Hamasah, gunakan hanya rekening yang dikonfirmasi langsung oleh admin.'
      },
      {
        tanya: 'Apakah ada biaya perpanjangan izin tinggal (Iqomah)?',
        jawab: 'Biaya izin tinggal (Iqomah/Visa) dibayarkan sesuai tarif resmi imigrasi Mesir setiap tahunnya. Tim operasional Hamasah akan mengkoordinir seluruh proses birokrasi imigrasi di Kairo agar santri tidak perlu antre sendirian.'
      },
      {
        tanya: 'Apakah uang dikembalikan jika santri batal berangkat?',
        jawab: "DP pemberkasan tidak dikembalikan: Rp 5 juta untuk Ma'had dan Rp 4,5 juta untuk Kuliah. Bila Anda sudah membayar lebih dari DP, kelebihannya dikembalikan."
      }
    ]
  },

  program: {
    kuliah: {
      syarat: 'Lulusan SMA, MA, atau pesantren',
      ringkasan: 'Dari verifikasi berkas, Tahdid Mustawa, karantina bahasa, sampai ujian muadalah dan resmi terdaftar.',
      pengantar: 'Kami menemani lulusan SMA, MA, dan pesantren dari memilih fakultas, menyiapkan bahasa Arab, sampai resmi tercatat sebagai mahasiswa di kampus Islam tertua di dunia.'
    },
    mahad: {
      syarat: 'Usia 13 sampai 30 tahun',
      ringkasan: 'Sekolah resmi Al-Azhar setingkat SMP dan SMA di Kairo, dengan asrama dan musyrif.',
      pengantar: "Ma'had Al-Azhar adalah bagian dari sistem pendidikan resmi Al-Azhar di Kairo. Santri belajar ilmu syar'i, bahasa Arab, dan pelajaran umum, sambil tinggal di asrama yang didampingi musyrif."
    },
    courses: {
      syarat: 'Daring, dari mana saja',
      ringkasan: "Mata pelajaran Dirasah Khassah, Ma'had (I'dadi dan Tsanawi), dan kuliah tingkat 1.",
      pengantar: 'Platform belajar daring untuk santri, mahasiswa, dan pelajar. Kelasnya berbasis kitab rujukan, disusun dari dasar ke lanjutan, dan bisa diulang kapan saja untuk murajaah.'
    }
  },

  testimoni: [
    {
      kutipan: 'Anak kami tetap memiliki tempat mengadu atau dibimbing secara langsung setelah tiba di Mesir.',
      isi: "Alhamdulillah, jazakallah khairan kepada Hamasah International untuk anak kami yang akan melanjutkan pendidikan ke Ma'had Al-Azhar. Anak kami dibantu dan didampingi dari awal: mulai dari pengisian formulir, verifikasi berkas, pengurusan visa, dan pendaftaran ujian. Hamasah juga menyediakan program karantina untuk bimbingan bahasa Arab, bimbingan pelajaran yang akan dipelajari di Al-Azhar, serta bimbingan ujian Tahdid Mustawa dan ujian Muadalah, hingga tiba dan terdaftar resmi di Mesir.\n\nHamasah International dikenal sebagai lembaga resmi dan memiliki kantor perwakilan di Nasr City, Kairo. Ini memberi rasa aman ekstra bagi kami sebagai orang tua, karena anak kami tetap memiliki tempat mengadu atau dibimbing secara langsung setelah tiba di Mesir.",
      nama: 'Wali dari Ghazalba Fauzan Luqman Natawijaya',
      keterangan: "Santri Ma'had Al-Azhar",
      foto: 'testimoni-wali-ghazalba.webp',
      alt: 'Keluarga wali santri berfoto bersama'
    },
    {
      kutipan: 'Ketika ada hal-hal yang perlu diurus, anak tidak benar-benar dilepas sendiri.',
      isi: 'Alhamdulillah, selama ananda tinggal di Hamasah, kami sebagai orang tua merasa cukup tenang. Yang menurut kami menjadi nilai plus adalah lokasi asrama yang strategis, jadi cukup memudahkan anak untuk beraktivitas dan memenuhi kebutuhan sehari-hari. Fasilitasnya juga bagus dan cukup mendukung untuk anak-anak yang sedang belajar jauh dari orang tua.\n\nYang paling kami rasakan membantu adalah adanya pendampingan dalam pengurusan berkas administrasi. Jadi, ketika ada hal-hal yang perlu diurus, anak tidak benar-benar dilepas sendiri.\n\nDi Hamasah juga ada kelas pemantapan, harapannya bisa membantu anak dalam mengikuti pelajaran. Anak bisa lebih cepat memahami materi dan beradaptasi dengan pelajaran yang ada.\n\nSelain kegiatan belajar, setahu kami Hamasah juga memiliki organisasi pelajar dan mahasiswa. Ini menurut saya bagus, karena anak-anak punya wadah untuk belajar berorganisasi, berkreativitas, sekaligus mengembangkan diri.\n\nTidak kalah penting, kami juga mendapatkan laporan bulanan mengenai kegiatan dan perkembangan ananda. Sebagai orang tua yang jauh dari anak, tentu hal seperti ini membuat kami merasa lebih tenang, karena kami tetap bisa mengetahui bagaimana aktivitas dan perkembangan anak selama di sana.\n\nAlhamdulillah, kami bersyukur ananda bisa mendapatkan pengalaman tersebut selama tinggal di Hamasah. Terakhir, kami ingin mengucapkan terima kasih kepada para asatidz dan seluruh pihak yang selama ini mendampingi anak-anak kami. Semoga Allah senantiasa memberikan kesehatan, kesabaran, kekuatan, dan keberkahan dalam setiap langkahnya. Semoga setiap ilmu, perhatian, dan kebaikan yang diberikan kepada anak-anak kami menjadi amal jariyah dan dibalas dengan pahala yang berlipat ganda oleh Allah SWT.',
      nama: 'Ayah dan ibu dari Aruna Hassya Javas Reswara',
      keterangan: "Santri Ma'had Al-Azhar",
      foto: 'testimoni-wali-aruna.webp',
      alt: 'Ayah dan ibu wali santri'
    },
    {
      kutipan: 'Yang pasti, pengurus semua cepat tanggap kalau ada situasi darurat.',
      isi: "Terima kasih untuk Hamasah International yang telah membantu proses anak kami, Khafidzah Khoirunnisa, untuk melanjutkan pendidikannya ke Al-Azhar Mesir. Mulai dari pengurusan dokumen dan persiapan belajar untuk masuk Ma'had, semuanya sangat mempermudah anak kami, dengan biaya yang cukup terjangkau. Dan yang pasti, pengurus semua cepat tanggap kalau ada situasi darurat.",
      nama: 'Wali dari Khafidzah Khoirunnisa',
      keterangan: "Santri Ma'had Al-Azhar",
      foto: 'testimoni-wali-khafidzah.webp',
      alt: 'Wali santri berfoto bersama putrinya'
    }
  ],

  faq: [
    {
      tanya: 'Apakah harus mahir bahasa Arab untuk daftar?',
      topik: 'Tentang persiapan bahasa',
      judul: 'Calon mahasiswa tidak harus sudah mahir bahasa Arab untuk memulai proses.',
      jawab: 'Semua calon mahasiswa mengikuti Ujian Tahdid Mustawa untuk penempatan level bahasa Arab, lalu karantina bahasa (Dauroh Ta’hili) sebelum ujian seleksi. Bila level awal belum mencukupi, ada kelas bahasa terlebih dahulu.'
    },
    {
      tanya: "Apa saja yang dipelajari di Program Ma'had?",
      topik: "Tentang Program Ma'had",
      judul: "Ma'had Al-Azhar memadukan ilmu syar’i, bahasa Arab, dan pelajaran umum.",
      jawab: "Program ini untuk usia 13 sampai 30 tahun, lulusan SD, SMP, maupun SMA. Setibanya di Kairo, calon santri mengikuti tes bahasa Arab, kelas bahasa, lalu tes qobul untuk penempatan di kelas I'dadi (setingkat SMP) atau langsung Tsanawi (setingkat SMA). Pelajar berprestasi berpeluang akselerasi."
    },
    {
      tanya: 'Bagaimana alur pendaftaran melalui Hamasah?',
      topik: 'Tentang pendaftaran',
      judul: 'Pendaftaran dimulai dengan formulir dan verifikasi berkas.',
      jawab: 'Alurnya: isi formulir, verifikasi berkas, Ujian Tahdid Mustawa, karantina daring (Dauroh Ta’hili), ujian muadalah, lalu pemberkasan dan keberangkatan sampai resmi kuliah di Al-Azhar.'
    },
    {
      tanya: 'Dokumen awal apa yang perlu dipersiapkan?',
      topik: 'Tentang dokumen awal',
      judul: 'Untuk mendaftar, cukup pindaian ijazah dan paspor atau KTP.',
      jawab: 'Dokumen asli baru dibutuhkan setelah lulus seleksi: ijazah, akta kelahiran, paspor yang berlaku minimal 18 bulan, surat izin orang tua bermeterai, pasfoto 4x6, rekomendasi Kemenag daerah, dan surat keterangan sehat berupa hasil tes darah (tahlil dam). Kami pandu satu per satu.'
    },
    {
      tanya: 'Berapa biayanya?',
      topik: 'Tentang biaya',
      judul: "Ma'had Rp 22 juta untuk keberangkatan, Kuliah S1 dibayar bertahap mulai Rp 1,1 juta.",
      jawab: "Ma'had: keberangkatan Rp 22.000.000 sekali bayar, lalu asrama Rp 1.800.000 per bulan, sudah termasuk makan, listrik, dan pendampingan musyrif. Kuliah S1 dari Indonesia: Rp 1.100.000 untuk pendaftaran, Rp 2.800.000 untuk karantina dan ujian muadalah, lalu Rp 18.500.000 sampai Rp 20.000.000 untuk keberangkatan. Uang yang sudah dibayar bisa dikembalikan dengan ketentuan: DP pemberkasan tidak dikembalikan (Rp 5 juta untuk Ma'had dan Rp 4,5 juta untuk Kuliah), sedangkan kelebihan di atas DP dikembalikan. Rincian lengkap ada di halaman Biaya & fasilitas."
    }
  ],

  pengumuman: {
    aktif: false,
    teks: '',
    tautanTeks: '',
    tautanUrl: '',
    mulai: '',
    selesai: ''
  },

  galeri: [
    {
      foto: 'galeri/founder-rektor-al-azhar.webp', lebar: 1108, tinggi: 1280,
      keterangan: 'Founder Hamasah International bersama Rektor Universitas Al-Azhar, Prof. Dr. Salamah Dawud',
      alt: 'Founder Hamasah International berdiri berdampingan dengan Rektor Universitas Al-Azhar di sebuah ruang pertemuan'
    },
    {
      foto: 'galeri/pimpinan-markaz-tatwir.webp', lebar: 1600, tinggi: 1324,
      keterangan: 'Pertemuan dengan Pimpinan Markaz Tatwir, lembaga pengembangan pendidikan Al-Azhar untuk pelajar asing',
      alt: 'Perwakilan Hamasah International berfoto bersama Pimpinan Markaz Tatwir'
    },
    {
      foto: 'galeri/wakil-pimpinan-markaz-tatwir.webp', lebar: 960, tinggi: 1280,
      keterangan: 'Pertemuan dengan Wakil Pimpinan Markaz Tatwir, lembaga pengembangan pendidikan Al-Azhar untuk pelajar asing',
      alt: 'Perwakilan Hamasah International menyerahkan plakat penghargaan kepada Wakil Pimpinan Markaz Tatwir'
    },
    {
      foto: 'galeri/keberangkatan-santri.webp', lebar: 1280, tinggi: 960,
      keterangan: 'Keberangkatan rombongan santri menuju Kairo',
      alt: 'Rombongan santri Hamasah berfoto di area keberangkatan internasional bandara sebelum berangkat ke Kairo'
    },
    {
      foto: 'galeri/idul-fitri-kairo.webp', lebar: 1280, tinggi: 960,
      keterangan: 'Suasana Hari Raya Idul Fitri di Kairo',
      alt: 'Santri Hamasah berfoto bersama di depan masjid berkubah putih seusai salat Idul Fitri di Kairo'
    },
    {
      foto: 'galeri/family-gathering-kairo.webp', lebar: 1280, tinggi: 960,
      keterangan: 'Family gathering Hamasah International di Kairo',
      alt: 'Santri Hamasah berfoto bersama di depan spanduk Hamasah International dalam acara family gathering'
    },
    {
      foto: 'galeri/cairo-international-book-fair.webp', lebar: 1280, tinggi: 960,
      keterangan: 'Mengunjungi Cairo International Book Fair',
      alt: 'Santri putra dan putri Hamasah berfoto di depan gedung pameran Cairo International Book Fair'
    },
    {
      foto: 'galeri/kajian-sore.webp', lebar: 469, tinggi: 313,
      keterangan: 'Kajian sore di asrama',
      alt: 'Santri duduk melingkar di lantai menghadap papan tulis saat kajian sore'
    },
    {
      foto: 'galeri/maulid-nabi.webp', lebar: 468, tinggi: 312,
      keterangan: 'Peringatan Maulid Nabi Muhammad SAW',
      alt: 'Santri menabuh rebana bersama saat peringatan Maulid Nabi'
    },
    {
      foto: 'galeri/tur-tempat-bersejarah.webp', lebar: 423, tinggi: 282,
      keterangan: 'Tur tempat bersejarah di Kairo',
      alt: 'Rombongan santri berfoto di halaman masjid bersejarah berkubah di Kairo'
    },
    {
      foto: 'galeri/dewan-masyayikh-al-azhar.webp', lebar: 490, tinggi: 275,
      keterangan: 'Bersama Dewan Masyayikh Al-Azhar, Dr. Nakhlah dan Dr. Syahidah',
      alt: 'Santri Hamasah berfoto bersama Dewan Masyayikh Al-Azhar di sebuah aula'
    }
  ]
});

const BLOK = Object.freeze(Object.keys(BAWAAN));

const LABEL_BLOK = Object.freeze({
  kontak: 'Kontak',
  biaya: 'Biaya',
  program: 'Program',
  testimoni: 'Testimoni',
  faq: 'Pertanyaan umum (FAQ)',
  pengumuman: 'Pengumuman',
  galeri: 'Galeri'
});

// Halaman yang memuat tiap blok, untuk tautan "Lihat di website" dan pemuatan konten.
const HALAMAN_BLOK = Object.freeze({
  kontak: ['kontak.html', 'kebijakan-privasi.html'],
  biaya: ['biaya.html'],
  program: ['index.html', 'program-kuliah.html', 'program-mahad.html', 'program-courses.html'],
  testimoni: ['index.html'],
  faq: ['index.html'],
  pengumuman: ['index.html'],
  galeri: ['index.html']
});

const HALAMAN_PUBLIK = Object.freeze([...new Set(Object.values(HALAMAN_BLOK).flat().concat(['articles.html', 'cek-status.html', 'tim.html']))]);

// ---------------------------------------------------------------------------- validasi

class KesalahanKonten extends Error {
  constructor(bidang, pesan) {
    super(pesan);
    this.bidang = bidang;
  }
}

function teks(nilai, bidang, label, { min = 0, maks = 200, baris = false } = {}) {
  let hasil = typeof nilai === 'string' ? nilai : (nilai === undefined || nilai === null ? '' : String(nilai));
  hasil = hasil.replace(/\r\n?/g, '\n');
  hasil = baris
    ? hasil.split('\n').map((satu) => satu.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    : hasil.replace(/\s+/g, ' ').trim();
  if (hasil.length < min) {
    throw new KesalahanKonten(bidang, min <= 1 ? `${label} wajib diisi.` : `${label} minimal ${min} karakter.`);
  }
  if (hasil.length > maks) throw new KesalahanKonten(bidang, `${label} maksimal ${maks} karakter.`);
  return hasil;
}

function daftar(nilai, bidang, label, { min = 0, maks = 10 } = {}) {
  const isi = Array.isArray(nilai) ? nilai : [];
  if (isi.length < min) throw new KesalahanKonten(bidang, `${label} minimal ${min} butir.`);
  if (isi.length > maks) throw new KesalahanKonten(bidang, `${label} maksimal ${maks} butir.`);
  return isi;
}

function objek(nilai) {
  return nilai && typeof nilai === 'object' && !Array.isArray(nilai) ? nilai : {};
}

// 0812..., 62812..., +62 812-... menjadi 62812...
function nomorWhatsapp(nilai) {
  let angka = String(nilai || '').replace(/[\s().+-]/g, '');
  if (/^0\d+$/.test(angka)) angka = `62${angka.slice(1)}`;
  if (!/^[1-9]\d{9,14}$/.test(angka)) {
    throw new KesalahanKonten('whatsapp', 'Nomor WhatsApp harus angka dengan kode negara, misalnya 6281234567890.');
  }
  return angka;
}

// 6281288489997 menjadi +62 812-8848-9997 (kode negara, lalu tiga angka, lalu kelompok empat).
function formatWhatsapp(nomor) {
  const kode = nomor.startsWith('62') ? '62' : nomor.startsWith('20') ? '20' : nomor.slice(0, 2);
  const sisa = nomor.slice(kode.length);
  const kelompok = [sisa.slice(0, 3)];
  for (let i = 3; i < sisa.length; i += 4) kelompok.push(sisa.slice(i, i + 4));
  return `+${kode} ${kelompok.join('-')}`;
}

function akunSosial(nilai, bidang, label) {
  const bersih = String(nilai || '').trim().replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/^@/, '').replace(/\/.*$/, '');
  if (!bersih) return '';
  if (!/^[A-Za-z0-9._]{1,30}$/.test(bersih)) throw new KesalahanKonten(bidang, `${label} ditulis sebagai nama akun, misalnya hamasah.international.`);
  return bersih;
}

function tautanAman(nilai, bidang, label) {
  const bersih = String(nilai || '').trim();
  if (!bersih) return '';
  // Alamat HTTPS, atau alamat di situs ini (biaya.html, #pendaftaran, article.html?slug=...).
  // Titik dua di alamat relatif ditolak supaya javascript: dan sejenisnya tidak lolos.
  if (/^https:\/\/[^\s"'<>]+$/i.test(bersih) || /^[A-Za-z0-9#?/._=&-][^\s"'<>:]*$/.test(bersih)) {
    if (bersih.length > 300) throw new KesalahanKonten(bidang, `${label} terlalu panjang.`);
    return bersih;
  }
  throw new KesalahanKonten(bidang, `${label} harus alamat https:// atau halaman di situs ini, misalnya biaya.html.`);
}

function tanggal(nilai, bidang, label) {
  const bersih = String(nilai || '').trim();
  if (!bersih) return '';
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bersih);
  const tgl = cocok && new Date(Date.UTC(Number(cocok[1]), Number(cocok[2]) - 1, Number(cocok[3])));
  if (!tgl || tgl.toISOString().slice(0, 10) !== bersih) throw new KesalahanKonten(bidang, `${label} tidak valid.`);
  return bersih;
}

const PERIKSA = Object.freeze({
  kontak(nilai) {
    const v = objek(nilai);
    const email = teks(v.email, 'email', 'Email', { maks: 120 });
    if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}$/.test(email)) throw new KesalahanKonten('email', 'Alamat email belum valid.');
    const youtube = tautanAman(v.youtube, 'youtube', 'Alamat YouTube');
    if (youtube && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtube)) {
      throw new KesalahanKonten('youtube', 'Alamat YouTube harus diawali https://www.youtube.com/.');
    }
    return {
      whatsapp: nomorWhatsapp(v.whatsapp),
      alamatIndonesia: teks(v.alamatIndonesia, 'alamatIndonesia', 'Alamat kantor Indonesia', { min: 10, maks: 300, baris: true }),
      alamatMesir: teks(v.alamatMesir, 'alamatMesir', 'Alamat kantor Mesir', { min: 10, maks: 300, baris: true }),
      jamLayanan: teks(v.jamLayanan, 'jamLayanan', 'Jam layanan', { min: 5, maks: 200 }),
      email,
      instagram: akunSosial(v.instagram, 'instagram', 'Instagram'),
      tiktok: akunSosial(v.tiktok, 'tiktok', 'TikTok'),
      youtube
    };
  },

  biaya(nilai) {
    const v = objek(nilai);
    const program = {};
    for (const kunci of PROGRAM) {
      const p = objek(objek(v.program)[kunci]);
      const awal = `program.${kunci}`;
      program[kunci] = {
        label: teks(p.label, `${awal}.label`, 'Label biaya', { min: 3, maks: 40 }),
        harga: teks(p.harga, `${awal}.harga`, 'Biaya', { min: 2, maks: 60 }),
        keterangan: teks(p.keterangan, `${awal}.keterangan`, 'Keterangan biaya', { maks: 120 }),
        fasilitas: daftar(p.fasilitas, `${awal}.fasilitas`, 'Fasilitas', { min: 1, maks: 12 })
          .map((item, i) => teks(item, `${awal}.fasilitas.${i}`, `Fasilitas ke-${i + 1}`, { min: 3, maks: 160 }))
      };
    }
    return {
      pengantar: teks(v.pengantar, 'pengantar', 'Pengantar halaman biaya', { min: 20, maks: 500 }),
      program,
      faq: daftar(v.faq, 'faq', 'Tanya-jawab biaya', { maks: 12 }).map((item, i) => ({
        tanya: teks(objek(item).tanya, `faq.${i}.tanya`, `Pertanyaan ke-${i + 1}`, { min: 5, maks: 200 }),
        jawab: teks(objek(item).jawab, `faq.${i}.jawab`, `Jawaban ke-${i + 1}`, { min: 10, maks: 800 })
      }))
    };
  },

  program(nilai) {
    const v = objek(nilai);
    const hasil = {};
    for (const kunci of PROGRAM) {
      const p = objek(v[kunci]);
      hasil[kunci] = {
        syarat: teks(p.syarat, `${kunci}.syarat`, 'Sasaran program', { min: 3, maks: 60 }),
        ringkasan: teks(p.ringkasan, `${kunci}.ringkasan`, 'Ringkasan di beranda', { min: 20, maks: 200 }),
        pengantar: teks(p.pengantar, `${kunci}.pengantar`, 'Pengantar halaman program', { min: 20, maks: 500 })
      };
    }
    return hasil;
  },

  testimoni(nilai) {
    const izin = new Set(FOTO_TESTIMONI.map((foto) => foto.berkas));
    return daftar(nilai, 'testimoni', 'Testimoni', { maks: 8 }).map((item, i) => {
      const v = objek(item);
      const foto = namaFotoTerkini(v.foto, (nama) => izin.has(nama));
      if (!izin.has(foto)) throw new KesalahanKonten(`${i}.foto`, `Foto testimoni ke-${i + 1} tidak dikenal.`);
      return {
        kutipan: teks(v.kutipan, `${i}.kutipan`, `Kutipan testimoni ke-${i + 1}`, { min: 10, maks: 200 }),
        isi: teks(v.isi, `${i}.isi`, `Isi testimoni ke-${i + 1}`, { maks: 4000, baris: true }),
        nama: teks(v.nama, `${i}.nama`, `Nama pemberi testimoni ke-${i + 1}`, { min: 3, maks: 120 }),
        keterangan: teks(v.keterangan, `${i}.keterangan`, `Keterangan testimoni ke-${i + 1}`, { maks: 80 }),
        foto,
        alt: foto ? teks(v.alt, `${i}.alt`, `Keterangan foto testimoni ke-${i + 1}`, { min: 5, maks: 160 }) : ''
      };
    });
  },

  faq(nilai) {
    return daftar(nilai, 'faq', 'Pertanyaan umum', { min: 1, maks: 10 }).map((item, i) => {
      const v = objek(item);
      return {
        tanya: teks(v.tanya, `${i}.tanya`, `Pertanyaan ke-${i + 1}`, { min: 5, maks: 120 }),
        topik: teks(v.topik, `${i}.topik`, `Topik ke-${i + 1}`, { min: 3, maks: 60 }),
        judul: teks(v.judul, `${i}.judul`, `Judul jawaban ke-${i + 1}`, { min: 5, maks: 200 }),
        jawab: teks(v.jawab, `${i}.jawab`, `Jawaban ke-${i + 1}`, { min: 10, maks: 800 })
      };
    });
  },

  galeri(nilai) {
    return periksaGaleri(nilai);
  },

  pengumuman(nilai) {
    const v = objek(nilai);
    const aktif = v.aktif === true;
    const hasil = {
      aktif,
      teks: teks(v.teks, 'teks', 'Isi pengumuman', { min: aktif ? 5 : 0, maks: 200 }),
      tautanTeks: teks(v.tautanTeks, 'tautanTeks', 'Teks tautan', { maks: 40 }),
      tautanUrl: tautanAman(v.tautanUrl, 'tautanUrl', 'Alamat tautan'),
      mulai: tanggal(v.mulai, 'mulai', 'Tanggal mulai'),
      selesai: tanggal(v.selesai, 'selesai', 'Tanggal selesai')
    };
    if (hasil.tautanTeks && !hasil.tautanUrl) throw new KesalahanKonten('tautanUrl', 'Alamat tautan wajib diisi bila teks tautan diisi.');
    if (hasil.tautanUrl && !hasil.tautanTeks) throw new KesalahanKonten('tautanTeks', 'Teks tautan wajib diisi bila alamat tautan diisi.');
    if (hasil.mulai && hasil.selesai && hasil.selesai < hasil.mulai) {
      throw new KesalahanKonten('selesai', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
    }
    return hasil;
  }
});

// Foto galeri: berkas bawaan di assets/galeri/, atau unggahan admin "unggah/<uuid>.<ext>".
// Apakah unggahannya benar-benar ada diperiksa route (server/routes/site-content.js).
function fotoGaleri(nilai, bidang, urutan) {
  const foto = namaFotoTerkini(String(nilai || '').trim(), (nama) => FOTO_GALERI_ASET.includes(nama));
  if (!foto) throw new KesalahanKonten(bidang, `Foto ke-${urutan} belum diunggah.`);
  if (/^unggah\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(foto) || FOTO_GALERI_ASET.includes(foto)) return foto;
  throw new KesalahanKonten(bidang, `Foto ke-${urutan} tidak dikenal. Unggah ulang fotonya.`);
}

function ukuranFoto(nilai, bidang, urutan) {
  const angka = Number(nilai);
  if (!Number.isInteger(angka) || angka < 50 || angka > 12000) throw new KesalahanKonten(bidang, `Ukuran foto ke-${urutan} tidak valid. Unggah ulang fotonya.`);
  return angka;
}

function periksaGaleri(nilai) {
  return daftar(nilai, 'galeri', 'Galeri', { min: 1, maks: 40 }).map((item, i) => {
    const v = objek(item);
    return {
      foto: fotoGaleri(v.foto, `${i}.foto`, i + 1),
      lebar: ukuranFoto(v.lebar, `${i}.foto`, i + 1),
      tinggi: ukuranFoto(v.tinggi, `${i}.foto`, i + 1),
      keterangan: teks(v.keterangan, `${i}.keterangan`, `Keterangan foto ke-${i + 1}`, { min: 5, maks: 200 }),
      alt: teks(v.alt, `${i}.alt`, `Deskripsi foto ke-${i + 1}`, { min: 5, maks: 200 })
    };
  });
}

// { ok, nilai } atau { ok: false, error, bidang }.
function periksaBlok(blok, nilai) {
  if (!PERIKSA[blok]) return { ok: false, error: 'Bagian konten tidak dikenal.', bidang: null };
  try {
    return { ok: true, nilai: PERIKSA[blok](nilai) };
  } catch (error) {
    if (error instanceof KesalahanKonten) return { ok: false, error: error.message, bidang: error.bidang };
    throw error;
  }
}

// ---------------------------------------------------------------------------- render

function esc(nilai) {
  return String(nilai)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// "Al-Azhar" tidak boleh terpotong di akhir baris (sama seperti HTML yang ditulis tangan).
function nb(nilai) {
  return esc(nilai).replace(/Al-Azhar/g, '<span class="lp-nb">Al-Azhar</span>');
}

function paragraf(nilai, indent) {
  return String(nilai).split(/\n{2,}/).filter(Boolean)
    .map((isi) => `${indent}<p>${nb(isi).replace(/\n/g, '<br />')}</p>`).join('\n');
}

const CENTANG = '<span class="feature-bullet" aria-hidden="true"><svg class="m3-icon m3-icon--check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>';

function tanggalJakarta(sekarang) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(sekarang);
}

// Pengumuman tampil bila aktif, berisi, dan hari ini (WIB) berada di rentang tanggalnya.
function pengumumanTampil(p, sekarang = new Date()) {
  if (!p || !p.aktif || !p.teks) return false;
  const hariIni = tanggalJakarta(sekarang);
  if (p.mulai && hariIni < p.mulai) return false;
  if (p.selesai && hariIni > p.selesai) return false;
  return true;
}

function wilayah(id, isi) {
  return [id, isi];
}

// Daftar [id wilayah, isi HTML] untuk satu blok.
const RENDER = Object.freeze({
  kontak(k) {
    const sosial = [];
    if (k.email) sosial.push(`Email: <a href="mailto:${esc(k.email)}">${esc(k.email)}</a>`);
    if (k.instagram) sosial.push(`Instagram: <a href="https://www.instagram.com/${esc(k.instagram)}/" target="_blank" rel="noopener">@${esc(k.instagram)}</a>`);
    if (k.tiktok) sosial.push(`TikTok: <a href="https://www.tiktok.com/@${esc(k.tiktok)}" target="_blank" rel="noopener">@${esc(k.tiktok)}</a>`);
    if (k.youtube) sosial.push(`<a href="${esc(k.youtube)}" target="_blank" rel="noopener">Kanal YouTube Hamasah</a>`);
    const satuBaris = (alamat) => esc(alamat.split('\n').join(', '));
    return [
      wilayah('kontak.alamatIndonesia', `\n                ${esc(k.alamatIndonesia).split('\n').join('<br />\n                ')}\n              `),
      wilayah('kontak.alamatMesir', `\n                ${esc(k.alamatMesir).split('\n').join('<br />\n                ')}\n              `),
      wilayah('kontak.jamLayanan', esc(k.jamLayanan)),
      wilayah('kontak.sosial', sosial.length ? `\n          <p class="kontak-sosial">${sosial.join('<span aria-hidden="true"> · </span>')}</p>\n          ` : ''),
      wilayah('kontak.privasiIndonesia', satuBaris(k.alamatIndonesia)),
      wilayah('kontak.privasiMesir', satuBaris(k.alamatMesir))
    ];
  },

  biaya(b) {
    const hasil = [wilayah('biaya.pengantar', `\n              ${nb(b.pengantar)}\n            `)];
    for (const kunci of PROGRAM) {
      const p = b.program[kunci];
      hasil.push(wilayah(`biaya.${kunci}.harga`, `
                <span class="cost-currency">${esc(p.label)}</span>
                <strong class="cost-figure">${esc(p.harga)}</strong>
                ${p.keterangan ? `<span class="cost-period">${esc(p.keterangan)}</span>` : ''}
              `));
      // Tanpa nb(): CSS kartu biaya mewarnai setiap <span> di dalam butir (ikon centang).
      hasil.push(wilayah(`biaya.${kunci}.fasilitas`, `\n${p.fasilitas.map((item) => `                <li>${CENTANG} ${esc(item)}</li>`).join('\n')}\n              `));
    }
    hasil.push(wilayah('biaya.faq', `\n${b.faq.map((item) => `            <details class="faq-item-card" data-buka-desktop>
              <summary>${nb(item.tanya)}</summary>
              <p>${nb(item.jawab)}</p>
            </details>`).join('\n\n')}\n          `));
    return hasil;
  },

  program(p) {
    const hasil = [];
    for (const kunci of PROGRAM) {
      hasil.push(wilayah(`program.${kunci}.syarat`, nb(p[kunci].syarat)));
      hasil.push(wilayah(`program.${kunci}.ringkasan`, nb(p[kunci].ringkasan)));
      hasil.push(wilayah(`program.${kunci}.pengantar`, nb(p[kunci].pengantar)));
    }
    return hasil;
  },

  // Zig-zag: satu testimoni satu baris, foto dan teks lengkap berdampingan, sisi foto
  // bergantian (diatur landing.css). Testimoni tanpa foto tampil sebagai kartu kutipan.
  testimoni(daftarTestimoni) {
    const kartu = daftarTestimoni.map((t) => {
      const foto = FOTO_TESTIMONI.find((item) => item.berkas === t.foto);
      const figur = t.foto && foto
        ? `
              <figure class="lp-testi__photo">
                <img src="../assets/${esc(t.foto)}" alt="${esc(t.alt)}" width="${foto.lebar}" height="${foto.tinggi}" loading="lazy" decoding="async" />
              </figure>`
        : '';
      const lengkap = t.isi
        ? `
                <details class="lp-testi__more">
                  <summary>Baca cerita lengkapnya</summary>
                  <div class="lp-testi__full">
${paragraf(t.isi, '                    ')}
                  </div>
                </details>`
        : '';
      return `            <article class="lp-testi${figur ? '' : ' lp-testi--tanpa-foto'}">${figur}
              <div class="lp-testi__body">
                <blockquote class="lp-testi__quote">
                  <p class="lp-testi__lead">&ldquo;${nb(t.kutipan)}&rdquo;</p>${lengkap}
                </blockquote>
                <p class="lp-testi__who"><strong>${nb(t.nama)}</strong>${t.keterangan ? `<span>${nb(t.keterangan)}</span>` : ''}</p>
              </div>
            </article>`;
    });
    return [wilayah('testimoni', `\n${kartu.join('\n\n')}\n          `)];
  },

  faq(daftarFaq) {
    const pertama = daftarFaq[0];
    const tombol = daftarFaq.map((item, i) => `              <button class="faq-question${i === 0 ? ' is-active' : ''}" type="button" data-answer="faq-${i + 1}" aria-pressed="${i === 0}">${nb(item.tanya)}</button>`);
    const sumber = daftarFaq.map((item, i) => `              <div data-answer="faq-${i + 1}">
                <p class="faq-answer__topic">${nb(item.topik)}</p>
                <h3>${nb(item.judul)}</h3>
                <p>${nb(item.jawab)}</p>
              </div>`);
    return [
      wilayah('faq.tombol', `\n${tombol.join('\n')}\n            `),
      wilayah('faq.jawaban', `
              <p class="faq-answer__topic">${nb(pertama.topik)}</p>
              <h3>${nb(pertama.judul)}</h3>
              <p>${nb(pertama.jawab)}</p>
            `),
      wilayah('faq.sumber', `\n${sumber.join('\n')}\n            `)
    ];
  },

  galeri(daftarFoto) {
    const butir = daftarFoto.map((f) => `            <li${f.tinggi > f.lebar ? ' class="lp-photos__tegak"' : ''}>
              <button class="lp-photos__item" type="button" aria-label="Perbesar foto: ${esc(f.keterangan)}">
                <img src="${esc(srcFotoGaleri(f.foto))}"${srcsetFotoGaleri(f)} alt="${esc(f.alt)}" width="${f.lebar}" height="${f.tinggi}" loading="lazy" decoding="async" />
                <span class="lp-photos__caption">${nb(f.keterangan)}</span>
              </button>
            </li>`);
    return [wilayah('galeri', `\n${butir.join('\n')}\n          `)];
  },

  pengumuman(p, sekarang) {
    if (!pengumumanTampil(p, sekarang)) return [wilayah('pengumuman', '')];
    const tautan = p.tautanUrl ? ` <a href="${esc(p.tautanUrl)}">${esc(p.tautanTeks)}</a>` : '';
    return [wilayah('pengumuman', `
      <aside class="lp-announce" aria-label="Pengumuman">
        <div class="shell"><p><strong>Pengumuman</strong> ${nb(p.teks)}${tautan}</p></div>
      </aside>
      `)];
  }
});

function gantiWilayah(html, id, isi) {
  const awal = `<!--konten:${id}-->`;
  const akhir = `<!--/konten:${id}-->`;
  let hasil = html;
  let dari = 0;
  for (;;) {
    const i = hasil.indexOf(awal, dari);
    if (i < 0) break;
    const j = hasil.indexOf(akhir, i + awal.length);
    if (j < 0) break;
    hasil = hasil.slice(0, i + awal.length) + isi + hasil.slice(j);
    dari = i + awal.length + isi.length + akhir.length;
  }
  return hasil;
}

// Alamat bawaan dalam satu baris, seperti tertulis di kebijakan privasi dan jawaban FAQ.
const ALAMAT_SATU_BARIS_BAWAAN = Object.freeze({
  indonesia: 'Jl. Karakal RT 003/RW 003, Desa Banjar Sari, Kec. Ciawi, Kab. Bogor, Jawa Barat',
  mesir: 'Sheikh Taha Dinary, Imarah 32, Lantai 1, Syaqqah 3, Hay Sabi, Nasr City, Kairo'
});

// Teks biasa (jawaban FAQ, jawaban asisten) yang menyebut nomor WhatsApp atau alamat bawaan
// disesuaikan dengan kontak yang disimpan admin.
function sesuaikanTeksKontak(isi, kontak) {
  if (!kontak || typeof isi !== 'string') return isi;
  let hasil = isi;
  if (kontak.whatsapp !== NOMOR_WA_BAWAAN) {
    hasil = hasil.replaceAll(`wa.me/${NOMOR_WA_BAWAAN}`, `wa.me/${kontak.whatsapp}`)
      .replaceAll(formatWhatsapp(NOMOR_WA_BAWAAN), formatWhatsapp(kontak.whatsapp));
  }
  if (kontak.alamatIndonesia !== BAWAAN.kontak.alamatIndonesia) {
    hasil = hasil.replaceAll(ALAMAT_SATU_BARIS_BAWAAN.indonesia, kontak.alamatIndonesia.split('\n').join(', '));
  }
  if (kontak.alamatMesir !== BAWAAN.kontak.alamatMesir) {
    hasil = hasil.replaceAll(ALAMAT_SATU_BARIS_BAWAAN.mesir, kontak.alamatMesir.split('\n').join(', '));
  }
  return hasil;
}

// html: isi berkas halaman publik. konten: { nilai, tersimpan } dari site-content-service.
// Blok yang belum pernah disimpan dibiarkan apa adanya.
function renderHalaman(html, konten, sekarang = new Date()) {
  if (!konten || typeof html !== 'string') return html;
  let hasil = html;
  for (const blok of BLOK) {
    if (!konten.tersimpan || !konten.tersimpan[blok]) continue;
    for (const [id, isi] of RENDER[blok](konten.nilai[blok], sekarang)) {
      if (hasil.includes(`<!--konten:${id}-->`)) hasil = gantiWilayah(hasil, id, isi);
    }
  }
  // Nomor WhatsApp muncul di banyak tautan dan teks, jadi diganti di seluruh halaman.
  const nomor = konten.nilai.kontak.whatsapp;
  if (nomor !== NOMOR_WA_BAWAAN) {
    hasil = hasil.replaceAll(`wa.me/${NOMOR_WA_BAWAAN}`, `wa.me/${nomor}`)
      .replaceAll(formatWhatsapp(NOMOR_WA_BAWAAN), formatWhatsapp(nomor));
  }
  // Skrip publik (assistant.js, kontak.js, website.js) membaca nomor dari sini.
  if (hasil.includes('</head>') && !hasil.includes('name="hamasah-whatsapp"')) {
    hasil = hasil.replace('</head>', `<meta name="hamasah-whatsapp" content="${nomor}" /></head>`);
  }
  return hasil;
}

module.exports = {
  BAWAAN,
  BLOK,
  FOTO_GALERI_ASET,
  FOTO_TESTIMONI,
  HALAMAN_BLOK,
  HALAMAN_PUBLIK,
  LABEL_BLOK,
  NOMOR_WA_BAWAAN,
  RENDER,
  formatWhatsapp,
  gantiWilayah,
  pengumumanTampil,
  periksaBlok,
  renderHalaman,
  sesuaikanTeksKontak
};
