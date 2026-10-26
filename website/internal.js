'use strict';

// Tutorial workspace internal (/internal): satu bab per menu, dipakai saat presentasi.
// Nama menu dan tab disamakan dengan aplikasinya (nav.js, staff.html, monitoring.html,
// asrama.js, lms-studio.js, operations.html, akun.js, pengaturan.html). Kalau ada menu
// yang berganti nama, perbarui teks di bawah juga.

(function () {
  const BAB = [
    {
      judul: 'Kenalan dulu dengan workspace internal',
      peran: ['Semua staf'],
      ringkas: 'Workspace internal ini tempat tim Hamasah bekerja: pendaftaran, asrama, kelas, keuangan, sampai isi website. Semua staf masuk lewat pintu yang sama, lalu menu yang muncul menyesuaikan perannya.',
      buka: [['Buka portal', '/portal']],
      langkah: [
        ['Satu alamat untuk semua', 'Semua staf masuk lewat /portal. Tidak ada aplikasi terpisah untuk tiap bagian.'],
        ['Lima peran internal', 'Super Admin, Petugas Pendaftaran, Musyrif Asrama, Guru / Asatidz, dan Keuangan. Wali dan santri juga masuk lewat portal, tapi bukan bagian dari tutorial ini.'],
        ['Menu ikut peran', 'Petugas pendaftaran cuma lihat Pendaftaran. Keuangan cuma lihat Keuangan, Visa, dan Inventaris. Super Admin lihat semuanya.'],
        ['Semua tercatat', 'Hampir setiap perubahan tercatat di Jejak Audit: siapa yang mengubah, apa, dan kapan.']
      ],
      catatan: [
        'Buka dengan tujuan: hari ini kita belajar kerja harian di portal, bukan teori.',
        'Tanyakan siapa pegang peran apa, supaya nanti fokus ke bab yang relevan.',
        'Tekankan: kalau menu tidak muncul, itu memang bukan bagian perannya, bukan error.'
      ],
      batas: []
    },
    {
      judul: 'Masuk dan berkeliling',
      peran: ['Semua staf'],
      ringkas: 'Cara masuk, membaca sidebar, dan apa yang dilakukan kalau lupa kata sandi.',
      buka: [['Halaman masuk', '/portal']],
      langkah: [
        ['Masuk', 'Buka /portal, isi email dan kata sandi akun masing-masing, lalu tekan Masuk.'],
        ['Kenali sidebar', 'Menu ada di kiri. Di HP, buka lewat tombol Menu di pojok kiri atas.'],
        ['Tombol di atas', 'Perbarui data untuk memuat ulang angka terbaru. Nama akun di kanan atas untuk keluar.'],
        ['Lupa kata sandi', 'Hubungi Super Admin. Admin bisa membuatkan kata sandi sementara dari Kelola Akun.'],
        ['Selesai kerja', 'Keluar dari akun kalau memakai komputer bersama.']
      ],
      catatan: [
        'Demokan login pakai akun demo, jangan pakai akun pribadi di layar.',
        'Tunjukkan versi HP juga, karena musyrif kebanyakan pakai HP.'
      ],
      batas: ['Admin tidak bisa melihat kata sandi siapa pun. Admin hanya bisa menggantinya dengan kata sandi sementara.']
    },
    {
      judul: 'Portal Utama untuk Super Admin',
      peran: ['Super Admin'],
      ringkas: 'Halaman pertama setelah admin masuk. Dari sini kelihatan kondisi lembaga dan apa yang perlu segera ditangani.',
      buka: [['Buka Portal Utama', '/portal']],
      langkah: [
        ['Baca angka utama', 'Santri aktif, keterisian asrama, musyrif aktif, dan jumlah hal yang perlu perhatian.'],
        ['Cek panel Perlu perhatian', 'Isinya dikelompokkan per santri: visa atau paspor yang mau habis, catatan pelanggaran, asrama tanpa musyrif, sampai musyrif yang belum mencatat.'],
        ['Buka santri', 'Tekan Buka santri untuk langsung masuk ke detail santri itu, lengkap dengan fotonya.'],
        ['Pindah tab Santri, Asrama, Musyrif', 'Tab Santri berisi tabel semua santri (bisa difilter per asrama atau "Perlu perhatian saja"). Tab Asrama dan Musyrif berisi kartu ringkas.'],
        ['Data demo', 'Kartu Data demo dipakai untuk mengisi, mengganti kata sandi, atau menghapus data contoh. Jangan dihapus selama masih dipakai untuk presentasi.']
      ],
      catatan: [
        'Ini bab paling penting untuk pimpinan: tunjukkan bahwa masalah langsung kelihatan tanpa buka banyak menu.',
        'Klik satu santri dari Perlu perhatian supaya alurnya terasa.'
      ],
      batas: ['Data demo ikut terlihat di semua menu. Bedakan dengan data asli waktu sudah mulai dipakai.']
    },
    {
      judul: 'Kelola Akun',
      peran: ['Super Admin'],
      ringkas: 'Tempat membuat akun tim, wali, dan santri, mengganti peran, dan menonaktifkan akun.',
      buka: [['Buka Kelola Akun', '/akun']],
      langkah: [
        ['Undang lewat WhatsApp', 'Isi nama, nomor WhatsApp, dan peran. Sistem menyiapkan pesan berisi tautan aktivasi, lalu admin yang mengirimnya.'],
        ['Atau buat akun dengan kata sandi', 'Kalau orangnya ada di dekat kita, akun bisa langsung dibuat dengan kata sandi awal.'],
        ['Cek Daftar akun', 'Akun yang belum diaktifkan bisa dikirimi ulang lewat Siapkan undangan WhatsApp.'],
        ['Kata sandi sementara', 'Untuk yang lupa kata sandi. Berikan langsung ke orangnya, jangan lewat grup.'],
        ['Nonaktifkan', 'Untuk orang yang sudah tidak bertugas. Semua sesinya di perangkat lain ikut keluar.']
      ],
      catatan: [
        'Sarankan akun Super Admin dipegang sedikit orang saja.',
        'Jelaskan bahwa satu akun wali bisa terhubung ke beberapa anak (dihubungkan di Monitoring).'
      ],
      batas: ['Akun tidak dihapus, cukup dinonaktifkan, supaya riwayatnya tetap ada.']
    },
    {
      judul: 'Pendaftaran',
      peran: ['Petugas Pendaftaran', 'Super Admin'],
      ringkas: 'Semua calon santri dari formulir website masuk ke sini, sampai siap berangkat dan dijadikan santri.',
      buka: [['Buka Pendaftaran', '/staff']],
      langkah: [
        ['Daftar calon santri masuk', 'Tiap pendaftar tampil sebagai satu baris: tahap, progres, dan tanda merah kalau sudah terlalu lama belum diperiksa.'],
        ['Buka detail pendaftar', 'Klik barisnya. Di dalam ada data diri, berkas, catatan, tindak lanjut, dan riwayat tahap.'],
        ['Periksa berkas', 'Setujui atau tolak tiap dokumen. Kalau ditolak, tulis alasannya supaya pendaftar tahu apa yang diperbaiki.'],
        ['Ubah tahap', 'Data dikirim → Pemeriksaan berkas → Persiapan akademik → Siap keberangkatan → Selesai. Ada juga Perlu perbaikan dan Dibatalkan.'],
        ['Catat tindak lanjut', 'Beri tenggat. Semua tindak lanjut yang belum selesai terkumpul di tab Agenda tindak lanjut.'],
        ['Masukkan ke kloter', 'Atur kloter di bagian Kloter keberangkatan, lalu pilih kloternya di detail pendaftar. Jadwalnya muncul di halaman cek status pendaftar.'],
        ['Kabari lewat WhatsApp', 'Siapkan pesan dari detail pendaftar, baca ulang, lalu kirim.'],
        ['Konversi jadi santri', 'Pendaftar yang sudah selesai dikonversi jadi santri supaya bisa masuk asrama dan kelas.']
      ],
      catatan: [
        'Sebut tab lain sekilas: Pena Hamasah (artikel), Notifikasi akun, Import operasional, Pesan konsultasi.',
        'Tunjukkan tombol Tambah pendaftar manual untuk yang daftar lewat telepon atau datang langsung.'
      ],
      batas: ['Petugas tidak bisa membuka tagihan, catatan pembinaan, atau membuat akun. Petugas hanya bisa mengirim ulang undangan.']
    },
    {
      judul: 'Monitoring Asrama: kerja harian musyrif',
      peran: ['Musyrif Asrama', 'Super Admin'],
      ringkas: 'Tempat musyrif mencatat absen, pembinaan, dan izin santri di asrama yang dipegangnya.',
      buka: [['Buka Monitoring', '/monitoring']],
      langkah: [
        ['Presensi asrama', 'Pilih Sholat atau Kegiatan, tanggal, dan waktu sholat, lalu Tampilkan daftar. Yang belum dicatat sudah otomatis Berjamaah atau Hadir, jadi cukup ganti yang beda lalu Simpan presensi.'],
        ['Pembinaan santri', 'Pilih santrinya, lalu catat pembinaan, setoran hafalan (ziyadah atau murajaah), dan prestasi.'],
        ['Izin santri', 'Setujui atau tolak pengajuan izin keluar. Kepulangannya dicatat di tab Kepulangan izin.'],
        ['Tindak lanjut pembinaan', 'Target dan tenggat pembinaan per santri. Yang lewat tenggat ditandai.'],
        ['Pesan wali dan Pengumuman', 'Baca pesan dan doa dari wali, lalu tulis pengumuman untuk santri dan wali di asrama itu.'],
        ['Santri teladan', 'Pilih santri teladan bulanan.']
      ],
      catatan: [
        'Demokan Presensi asrama dari awal sampai simpan, ini yang dipakai tiap hari.',
        'Sebut juga Cerita AI di Portal Utama musyrif: cerita singkat soal hari itu, AI menyusun usulan catatan per santri, musyrif cek dulu sebelum disimpan.',
        'Ingatkan: kalau dicatat di hari yang sama, halaman wali selalu terisi.'
      ],
      batas: ['Musyrif hanya melihat santri di asrama yang dipegangnya.']
    },
    {
      judul: 'Monitoring Asrama: bagian Super Admin',
      peran: ['Super Admin'],
      ringkas: 'Beberapa tab di Monitoring hanya muncul untuk admin, karena menentukan siapa melihat santri yang mana.',
      buka: [['Buka Monitoring', '/monitoring']],
      langkah: [
        ['Profil santri baru', 'Tambah santri yang tidak lewat jalur pendaftaran online.'],
        ['Penempatan Kamar & Asrama', 'Tempatkan santri ke asrama dan kamarnya.'],
        ['Kelola Asrama & Musyrif', 'Tambah gedung asrama, lalu tugaskan musyrif pembinanya.'],
        ['Hubungkan akun wali', 'Hubungkan akun wali dengan santri. Satu wali bisa dihubungkan ke beberapa anak.']
      ],
      catatan: [
        'Urutannya penting waktu awal pakai: asrama dulu, musyrif, santri, baru hubungkan wali.'
      ],
      batas: ['Musyrif tidak bisa menambah santri, memindah asrama, atau menghubungkan akun wali.']
    },
    {
      judul: 'Kelola Asrama',
      peran: ['Musyrif Asrama', 'Super Admin'],
      ringkas: 'Urusan rumah tangga asrama: jadwal, piket, uang kas, barang, foto, dan iqamah.',
      buka: [['Buka Kelola Asrama', '/asrama']],
      langkah: [
        ['Kalender', 'Jadwal mingguan dan agenda asrama dalam tampilan kalender.'],
        ['Piket', 'Atur siapa piket kapan. Santri melihat piketnya di beranda.'],
        ['Uang kas', 'Catat pemasukan, pengeluaran, dan iuran. Saldo dihitung otomatis.'],
        ['Inventaris', 'Daftar barang asrama, jumlah, dan kondisinya.'],
        ['Galeri', 'Foto kegiatan asrama.'],
        ['Iqamah', 'Pantau masa berlaku iqamah santri dan laporan perpanjangannya.']
      ],
      catatan: [
        'Tunjukkan Uang kas: catatan yang salah dibatalkan dengan alasan, bukan dihapus.'
      ],
      batas: ['Catatan kas tidak bisa dihapus. Yang salah dibatalkan dengan alasan, dan catatannya tetap ada.']
    },
    {
      judul: 'LMS: kelas online',
      peran: ['Guru / Asatidz', 'Super Admin'],
      ringkas: 'Guru menyiapkan maddah, materi, kuis, dan tugas. Santri belajar dari HP.',
      buka: [['Buka LMS', '/lms']],
      langkah: [
        ['Buat maddah', 'Isi judul dan deskripsi singkat.'],
        ['Tambah materi di tab Kurikulum', 'Pilih jenisnya: bacaan, video YouTube, PDF, kuis, atau tugas. Materi bisa diurutkan, diubah, atau diarsipkan.'],
        ['Susun kuis', 'Tulis pertanyaan dan tandai jawaban yang benar. Nilai lulusnya 70, santri boleh mencoba tiga kali.'],
        ['Daftarkan santri', 'Di tab Santri, pilih siapa saja yang ikut. Progres tiap santri juga kelihatan di sini.'],
        ['Nilai tugas', 'Di tab Penilaian. Nilai 70 ke atas otomatis dianggap selesai.'],
        ['Lihat sebagai santri', 'Cek tampilannya dari sisi santri sebelum materinya dibuka.']
      ],
      catatan: [
        'Tunjukkan asisten belajar: santri bisa tanya di tiap pertemuan, jawabannya dari ringkasan materi yang ditulis guru.',
        'Pesan untuk guru: makin jelas ringkasan dan poin pentingnya, makin bagus jawaban asistennya.'
      ],
      batas: ['Guru hanya melihat maddah yang dipegangnya.']
    },
    {
      judul: 'Keuangan & SPP',
      peran: ['Keuangan', 'Super Admin'],
      ringkas: 'Tagihan, kuitansi, tunggakan, dan laporan. Semua tagihan dalam rupiah.',
      buka: [['Buka Keuangan', '/operations']],
      langkah: [
        ['Terbitkan tagihan', 'Pilih Satu santri atau Banyak santri sekaligus, isi keterangan dan nominal, lalu terbitkan.'],
        ['Kabari wali', 'Di kartu invoice, tekan Kabari wali lewat WhatsApp, baca ulang pesannya, lalu kirim.'],
        ['Tandai lunas', 'Setelah uangnya masuk. Nomor kuitansi keluar otomatis.'],
        ['Unduh kuitansi', 'Kuitansi PDF tersedia untuk invoice yang sudah lunas, bisa diunduh keuangan maupun wali.'],
        ['Koreksi atau batalkan', 'Wajib pakai alasan. Semua koreksi bisa dilihat di Riwayat koreksi dan tab Riwayat keuangan.'],
        ['Pantau tunggakan', 'Tabel Tunggakan per santri diurutkan dari total terbesar. Tagihan yang lebih dari 30 hari ditandai merah.'],
        ['Laporan CSV', 'Pilih rentang bulan di bilah Laporan tagihan, lalu Unduh laporan CSV.']
      ],
      catatan: [
        'Demokan satu siklus: terbitkan → kabari → tandai lunas → unduh kuitansi.',
        'Kalau ada pembayaran dalam pound Mesir, tetap dicatat dalam rupiah secara manual.'
      ],
      batas: ['Tagihan tidak bisa dihapus. Yang salah dikoreksi atau dibatalkan dengan alasan.']
    },
    {
      judul: 'Visa, Paspor, dan Inventaris',
      peran: ['Keuangan', 'Super Admin'],
      ringkas: 'Dua menu ini ada di halaman Keuangan, tapi punya menu sendiri di sidebar supaya cepat dibuka.',
      buka: [['Buka Visa & Paspor', '/operations#visa'], ['Buka Inventaris', '/operations#inventaris']],
      langkah: [
        ['Tracker visa pelajar', 'Kartu visa semua santri aktif, diurutkan dari yang paling mendesak. Yang sudah lewat ditandai merah.'],
        ['Perbarui berkas visa', 'Catat tanggal berlaku baru dan berkas pendukungnya.'],
        ['Inventaris & Sarana Asrama', 'Daftar aset, lalu catat pergerakan stok: barang masuk dan keluar.'],
        ['Riwayat keuangan', 'Catatan per hari: tagihan terbit, lunas, dikoreksi, dan dibatalkan.']
      ],
      catatan: [
        'Visa yang mau habis juga muncul di panel Perlu perhatian di Portal Utama admin.'
      ],
      batas: []
    },
    {
      judul: 'Jejak Audit',
      peran: ['Super Admin'],
      ringkas: 'Catatan siapa melakukan apa dan kapan, di seluruh aplikasi.',
      buka: [['Buka Jejak Audit', '/audit']],
      langkah: [
        ['Saring kejadian', 'Pakai Filter riwayat kejadian: menurut peran, jenis kejadian, atau tanggal.'],
        ['Baca timeline', 'Tiap baris berisi pelaku, tindakan, dan waktunya.'],
        ['Pakai saat ada pertanyaan', 'Misalnya "siapa yang membatalkan tagihan ini?" atau "kapan status pendaftar ini berubah?".']
      ],
      catatan: [
        'Tekankan: ini yang bikin semua orang lebih hati-hati, dan memudahkan kalau ada salah paham.'
      ],
      batas: ['Masa simpan jejak audit diatur di Pengaturan.']
    },
    {
      judul: 'Konten Website dan Template',
      peran: ['Super Admin'],
      ringkas: 'Mengubah isi website dan isi dokumen tanpa perlu programmer.',
      buka: [['Buka Konten Website', '/konten'], ['Buka Template', '/template']],
      langkah: [
        ['Konten Website', 'Ubah biaya, program, kontak, testimoni, tanya jawab, dan pengumuman. Ada pratinjau sebelum disimpan.'],
        ['Template pesan WhatsApp', 'Atur isi pesan yang disiapkan sistem, misalnya pengingat tagihan.'],
        ['Template dokumen', 'Atur kop surat, nomor rekening, dan nama penanda tangan di PDF kuitansi.']
      ],
      catatan: [
        'Demokan ubah satu angka biaya, lihat pratinjaunya, lalu batalkan supaya website tidak berubah.'
      ],
      batas: ['Perubahan di Konten Website langsung tampil di website umum setelah disimpan.']
    },
    {
      judul: 'Pengaturan',
      peran: ['Super Admin'],
      ringkas: 'Saklar fitur dan pengaturan yang berlaku untuk seluruh aplikasi.',
      buka: [['Buka Pengaturan', '/pengaturan']],
      langkah: [
        ['Pendaftaran', 'Buka atau tutup pendaftaran online, periode penerimaan, pesan saat pendaftaran ditutup, dan rekening pembayaran.'],
        ['Asisten otomatis', 'Nyalakan atau matikan asisten di website dan asisten belajar LMS, serta batas pertanyaan per akun per jam.'],
        ['Data pribadi', 'Saklar catatan kesehatan santri dan masa simpan jejak audit.'],
        ['Pembaruan database', 'Dipakai tim teknis kalau ada pembaruan sistem.']
      ],
      catatan: [
        'Jelaskan bahwa catatan kesehatan baru dinyalakan setelah kebijakan privasinya siap dan diputuskan Ust. Aji.'
      ],
      batas: ['Pembaruan database sebaiknya hanya dijalankan tim teknis.']
    },
    {
      judul: 'Rutinitas harian dan penutup',
      peran: ['Semua staf'],
      ringkas: 'Kalau semua orang mengerjakan bagiannya tiap hari, halaman wali dan dashboard pimpinan selalu terisi.',
      buka: [['Buka portal', '/portal']],
      langkah: [
        ['Super Admin', 'Tiap pagi buka Portal Utama dan cek Perlu perhatian.'],
        ['Petugas pendaftaran', 'Mulai dari Agenda tindak lanjut, lalu pendaftar yang bertanda merah.'],
        ['Musyrif', 'Isi Presensi asrama tiap waktu sholat, jawab izin, dan catat setoran hafalan.'],
        ['Guru', 'Unggah materi pertemuan dan nilai tugas yang masuk.'],
        ['Keuangan', 'Terbitkan tagihan di awal bulan, tandai lunas begitu uang masuk.'],
        ['Kalau ada kendala', 'Catat halamannya dan apa yang terjadi, lalu kabari saya. Screenshot sangat membantu.']
      ],
      catatan: [
        'Tutup dengan rencana uji coba: tiap peran dicoba langsung oleh orang yang nanti memakainya.',
        'Buka sesi tanya jawab.'
      ],
      batas: []
    }
  ];

  // Tangkapan layar asli tiap bab (assets/internal, data demo lokal), dicocokkan lewat judul bab.
  const GAMBAR = {
    'Kenalan dulu dengan workspace internal': ['portal', 'Portal Utama Super Admin: sidebar menu, angka utama, dan pintasan ke tiap bagian'],
    'Masuk dan berkeliling': ['masuk', 'Halaman masuk portal untuk santri, wali, dan staf'],
    'Portal Utama untuk Super Admin': ['perhatian', 'Panel Perlu perhatian di Portal Utama, dikelompokkan per santri'],
    'Kelola Akun': ['akun', 'Halaman Kelola Akun'],
    'Pendaftaran': ['pendaftaran', 'Halaman Pendaftaran calon santri dengan angka per tahap dan daftar pendaftar'],
    'Monitoring Asrama: kerja harian musyrif': ['presensi', 'Tab Presensi asrama: daftar santri dengan pilihan Berjamaah, Munfarid, Tidak, Izin'],
    'Monitoring Asrama: bagian Super Admin': ['monitoring-admin', 'Tab Kelola Asrama & Musyrif di Monitoring Asrama'],
    'Kelola Asrama': ['asrama', 'Halaman Kelola Asrama'],
    'LMS: kelas online': ['lms', 'Halaman LMS Maddah'],
    'Keuangan & SPP': ['keuangan', 'Halaman Keuangan & SPP dengan ringkasan tunggakan dan tagihan'],
    'Visa, Paspor, dan Inventaris': ['visa', 'Tracker visa pelajar: kartu per santri dengan masa berlaku paspor dan visa'],
    'Jejak Audit': ['audit', 'Halaman Jejak Audit'],
    'Konten Website dan Template': ['konten', 'Halaman Konten Website'],
    'Pengaturan': ['pengaturan', 'Halaman Pengaturan'],
    'Rutinitas harian dan penutup': ['portal', 'Portal Utama Super Admin']
  };

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

    const [berkas, keterangan] = GAMBAR[b.judul] || GAMBAR['Kenalan dulu dengan workspace internal'];
    const gambarBab = $('tampilan-gambar');
    if (!gambarBab.src.endsWith(`/${berkas}.jpg`)) gambarBab.src = `../assets/internal/${berkas}.jpg`;
    gambarBab.alt = keterangan;
    $('tampilan-teks').textContent = `${keterangan}. Tampilan asli dengan data demo.`;

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
