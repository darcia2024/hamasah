'use strict';

// Halaman penawaran /qohiroh: pilihan peran dan fitur di bagian Tampilan, serta tombol WhatsApp.
// Isi NOMOR_WA (format 62812xxxxxxx, tanpa tanda plus) supaya tombol diskusi muncul.
// Selama kosong, tombolnya tersembunyi dan halaman memakai kalimat penutup biasa.
// Gambar dibuat ulang dengan .claude/checks/qohiroh-shots.cjs dan qohiroh-docs.cjs. Tema warna dan
// font mockup (hijau-kuning Qohiroh, Space Grotesk dan Geist) ada di .claude/checks/qohiroh-tema.cjs;
// logo mockup diambil dari assets/qohiroh/logo-q.png, jadi ulangi kedua skrip setelah logo diganti.

(function () {
  const NOMOR_WA = '';
  const PESAN_WA = 'Assalamu’alaikum. Saya dari Qohiroh Center, sudah membaca penawaran sistemnya dan ingin berdiskusi.';
  const FOLDER = '../assets/qohiroh/m/';

  // Tiap peran punya daftar fitur: [judul, penjelasan, berkas gambar, teks pengganti gambar].
  const PERAN = [
    {
      nama: 'Pimpinan',
      fitur: [
        ['Beranda pimpinan', 'Angka utama: santri aktif, keterisian asrama, musyrif, kehadiran, tagihan, dan hal yang perlu perhatian.', 'admin-portal', 'Beranda pimpinan di Qohiroh Portal dengan angka utama'],
        ['Perlu perhatian', 'Dikelompokkan per santri: visa atau paspor yang mau habis, tagihan, dan pembina yang belum mencatat. Satu tombol membuka santrinya.', 'admin-perhatian', 'Panel Perlu perhatian yang dikelompokkan per santri'],
        ['Daftar santri', 'Semua santri dalam satu tabel, bisa disaring per asrama atau program.', 'admin-santri', 'Tabel santri dengan presensi, hafalan, tagihan, visa, dan status wali'],
        ['Detail santri', 'Foto, rekam jejak, dan roadmap studi satu santri.', 'admin-detail', 'Halaman detail satu santri'],
        ['Kelola akun', 'Undang tim dan wali lewat WhatsApp, atau buat akun langsung. Yang berhenti bertugas dinonaktifkan.', 'admin-akun', 'Halaman Kelola akun'],
        ['Jejak audit', 'Siapa melakukan apa dan kapan, di seluruh aplikasi.', 'admin-audit', 'Timeline kejadian di Jejak audit'],
        ['Template', 'Isi pesan WhatsApp, kop dan rekening di PDF, serta daftar dokumen pendaftar.', 'admin-template', 'Halaman Template pesan WhatsApp'],
        ['Pengaturan', 'Buka atau tutup pendaftaran, nyalakan asisten AI, dan atur data pribadi.', 'admin-pengaturan', 'Halaman Pengaturan']
      ]
    },
    {
      nama: 'Petugas pendaftaran',
      fitur: [
        ['Beranda petugas', 'Ringkasan pendaftaran dan pesan konsultasi yang baru masuk.', 'petugas-portal', 'Beranda petugas pendaftaran'],
        ['Daftar calon santri', 'Tiap pendaftar satu baris: tahap, progres, dan tanda merah kalau terlalu lama belum diperiksa.', 'petugas-daftar', 'Daftar calon santri dengan tahap dan progres'],
        ['Detail pendaftar', 'Data diri, berkas, catatan, dan riwayat tahap dalam satu jendela.', 'petugas-detail', 'Jendela detail pendaftar'],
        ['Tahap, WhatsApp, dan kloter', 'Ubah tahap, siapkan pesan WhatsApp, pilih kloter, atau jadikan santri.', 'petugas-detail-bawah', 'Bagian bawah detail pendaftar: ubah status, WhatsApp, kloter, dan konversi'],
        ['Agenda tindak lanjut', 'Semua tindak lanjut yang belum selesai, diurutkan dari tenggat terdekat.', 'petugas-agenda', 'Agenda tindak lanjut'],
        ['Kloter keberangkatan', 'Buat kloter dengan nama, tanggal, dan kota asal, lalu masukkan pendaftarnya.', 'petugas-kloter', 'Formulir kloter keberangkatan'],
        ['Tambah pendaftar manual', 'Untuk yang mendaftar lewat telepon atau datang langsung.', 'petugas-manual', 'Formulir tambah pendaftar manual']
      ]
    },
    {
      nama: 'Pembina asrama',
      fitur: [
        ['Beranda pembina', 'Tugas hari ini dan ringkasan santri di asrama yang dipegang.', 'musyrif-portal', 'Beranda pembina asrama'],
        ['Presensi asrama', 'Absen satu asrama sekaligus. Yang belum diisi sudah terpilih berjamaah, jadi cukup ubah yang berbeda.', 'musyrif-presensi', 'Presensi asrama dengan pilihan berjamaah, munfarid, tidak, dan izin'],
        ['Pembinaan santri', 'Catatan pembinaan, setoran hafalan, dan prestasi per santri.', 'musyrif-pembinaan', 'Halaman Pembinaan santri'],
        ['Izin santri', 'Setujui atau tolak pengajuan izin keluar. Absennya ikut tercatat.', 'musyrif-izin', 'Pengajuan izin santri'],
        ['Pesan wali', 'Pesan dan doa dari wali untuk ananda.', 'musyrif-pesan', 'Pesan dan doa dari wali'],
        ['Pengumuman', 'Pengumuman untuk santri dan wali di asrama yang dipegang.', 'musyrif-pengumuman', 'Formulir pengumuman'],
        ['Kalender asrama', 'Jadwal dan agenda asrama dalam tampilan bulan.', 'musyrif-kalender', 'Kalender asrama'],
        ['Uang kas', 'Catat pemasukan, pengeluaran, dan iuran. Saldo dihitung otomatis.', 'musyrif-kas', 'Uang kas asrama'],
        ['Inventaris', 'Barang asrama, jumlah, dan kondisinya.', 'musyrif-inventaris', 'Inventaris asrama'],
        ['Iqamah', 'Pantau masa berlaku iqamah santri dan laporan perpanjangannya.', 'musyrif-iqamah', 'Iqamah santri']
      ]
    },
    {
      nama: 'Guru',
      fitur: [
        ['Ruang belajar', 'Daftar maddah yang bisa dipilih.', 'guru-ruang', 'Ruang belajar'],
        ['Kurikulum', 'Tambah bacaan, video, PDF, kuis, atau tugas. Materi bisa diurutkan dan diarsipkan.', 'guru-kurikulum', 'Kurikulum satu maddah'],
        ['Penilaian', 'Tugas yang masuk dari santri, untuk diberi nilai dan catatan.', 'guru-penilaian', 'Tab Penilaian'],
        ['Santri', 'Daftarkan santri ke maddah dan lihat progres tiap santri.', 'guru-santri', 'Tab Santri dan progres']
      ]
    },
    {
      nama: 'Keuangan',
      fitur: [
        ['Terbitkan tagihan', 'Satu santri atau banyak santri sekaligus.', 'keuangan-tagihan', 'Halaman Keuangan dan formulir tagihan'],
        ['Tunggakan', 'Santri dengan tagihan belum dibayar, diurutkan dari total terbesar.', 'keuangan-tunggakan', 'Tunggakan per santri'],
        ['Daftar invoice', 'Kabari wali lewat WhatsApp, tandai lunas, dan unduh kuitansi PDF.', 'keuangan-invoice', 'Daftar invoice'],
        ['Visa dan paspor', 'Kartu visa semua santri aktif, diurutkan dari yang paling mendesak.', 'keuangan-visa', 'Tracker visa pelajar'],
        ['Inventaris', 'Daftar aset dan pergerakan stok barang asrama.', 'keuangan-inventaris', 'Inventaris dan sarana asrama'],
        ['Riwayat keuangan', 'Catatan per hari: tagihan terbit, lunas, dikoreksi, dan dibatalkan.', 'keuangan-riwayat', 'Riwayat keuangan']
      ]
    },
    {
      nama: 'Wali santri',
      ponsel: true,
      fitur: [
        ['Ananda dan hal yang perlu diperhatikan', 'Semua ananda yang terhubung muncul di satu akun, lengkap dengan tagihan atau iqamah yang perlu diurus.', 'wali-1', 'Halaman wali di HP: ananda dan hal yang perlu diperhatikan'],
        ['Laporan 30 hari', 'Ringkasan bulan ini: sholat berjamaah, kehadiran kegiatan, dan setoran hafalan.', 'wali-2', 'Halaman wali di HP: laporan 30 hari terakhir'],
        ['Sholat dan kegiatan', 'Rekap sholat lima waktu per hari dan kehadiran kegiatan asrama.', 'wali-3', 'Halaman wali di HP: rekap sholat dan kegiatan'],
        ['Hafalan Al-Qur’an', 'Juz yang sudah dihafal dan mutu setoran terakhir.', 'wali-4', 'Halaman wali di HP: hafalan Al-Qur’an']
      ]
    },
    {
      nama: 'Santri',
      ponsel: true,
      fitur: [
        ['Hari ini', 'Kegiatan hari ini, piket, dan materi terakhir yang dibuka.', 'santri-1', 'Beranda santri di HP'],
        ['Iqamah dan izin', 'Sisa masa berlaku iqamah dan pengajuan izin keluar asrama.', 'santri-2', 'Beranda santri di HP: iqamah dan izin'],
        ['Perkembangan', 'Prestasi, sholat, kehadiran kegiatan, dan hafalan. Sama dengan yang dilihat wali.', 'santri-3', 'Beranda santri di HP: perkembangan'],
        ['Ruang belajar', 'Maddah yang diikuti santri.', 'santri-kelas', 'Ruang belajar di HP'],
        ['Maddah', 'Ringkasan maddah, progres, dan daftar pertemuan.', 'santri-maddah', 'Halaman maddah di HP'],
        ['Pertemuan dan asisten', 'Satu pertemuan: video atau kuis, poin penting, dan asisten belajar.', 'santri-pertemuan', 'Halaman pertemuan di HP']
      ]
    }
  ];

  const nomor = NOMOR_WA.replace(/\D/g, '');
  if (nomor) {
    const alamat = `https://wa.me/${nomor}?text=${encodeURIComponent(PESAN_WA)}`;
    document.querySelectorAll('[data-wa]').forEach((a) => {
      a.hidden = false;
      a.href = alamat;
      a.target = '_blank';
      a.rel = 'noopener';
    });
    document.querySelectorAll('[data-nowa]').forEach((n) => { n.hidden = true; });
    const nav = document.getElementById('nav-aksi');
    nav.href = alamat;
    nav.target = '_blank';
    nav.rel = 'noopener';
    // Dengan kontak, ajakan diskusi jadi aksi utama dan melihat tampilan jadi aksi kedua.
    const lihat = document.getElementById('aksi-lihat');
    const hero = document.querySelector('.hero [data-wa]');
    if (lihat && hero) {
      lihat.classList.replace('btn--primary', 'btn--ghost');
      hero.classList.replace('btn--ghost', 'btn--primary');
    }
  }

  // Pilihan peran dan fitur.
  const elPeran = document.getElementById('tour-peran');
  const elFitur = document.getElementById('tour-fitur');
  const pane = document.getElementById('tour-pane');
  const gambar = document.getElementById('tour-gambar');
  const teks = document.getElementById('tour-teks');
  if (!elPeran || !elFitur) return;

  let peranAktif = 0;
  let fiturAktif = 0;

  const chip = PERAN.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'who__item';
    b.setAttribute('role', 'tab');
    b.textContent = p.nama;
    b.addEventListener('click', () => { peranAktif = i; fiturAktif = 0; gambarUlang(true); });
    b.addEventListener('keydown', (event) => {
      const arah = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!arah) return;
      event.preventDefault();
      peranAktif = (i + arah + PERAN.length) % PERAN.length;
      fiturAktif = 0;
      gambarUlang(false);
      chip[peranAktif].focus();
    });
    elPeran.append(b);
    return b;
  });

  function gambarUlang() {
    const peran = PERAN[peranAktif];
    chip.forEach((b, i) => {
      const on = i === peranAktif;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    elFitur.replaceChildren(...peran.fitur.map(([judul, isi], i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `feat${i === fiturAktif ? ' is-on' : ''}`;
      if (i === fiturAktif) b.setAttribute('aria-current', 'true');
      const t = document.createElement('strong');
      t.textContent = judul;
      const p = document.createElement('span');
      p.textContent = isi;
      b.append(t, p);
      b.addEventListener('click', () => { fiturAktif = i; gambarUlang(); });
      li.append(b);
      return li;
    }));
    const [judul, , berkas, alt] = peran.fitur[fiturAktif];
    const src = `${FOLDER}${berkas}.jpg`;
    if (!gambar.src.endsWith(`/${berkas}.jpg`)) gambar.src = src;
    gambar.alt = alt;
    gambar.width = peran.ponsel ? 780 : 1366;
    gambar.height = peran.ponsel ? 1688 : 860;
    pane.classList.toggle('pane--phone', Boolean(peran.ponsel));
    teks.textContent = `${judul}. Data contoh, bukan data lembaga.`;
    // Muat gambar fitur berikutnya lebih dulu supaya pindah tidak berkedip.
    const berikut = peran.fitur[fiturAktif + 1];
    if (berikut) new Image().src = `${FOLDER}${berikut[2]}.jpg`;
  }

  gambarUlang();

  // Tombol "Lihat tampilannya" di kartu fitur membuka peran dan fitur yang sesuai di bagian Tampilan.
  document.querySelectorAll('[data-peran]').forEach((tombol) => {
    tombol.addEventListener('click', () => {
      peranAktif = Number(tombol.dataset.peran) || 0;
      fiturAktif = Number(tombol.dataset.fitur) || 0;
      gambarUlang();
      const pelan = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('tampilan').scrollIntoView({ behavior: pelan ? 'auto' : 'smooth' });
    });
  });
})();
