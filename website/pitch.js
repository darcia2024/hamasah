'use strict';

// Halaman pitch (/pitch): animasi masuk, mockup interaktif, dan tutorial per peran.
// Menu dan tab di tutorial mengikuti sidebar sungguhan (nav.js), tab portal (portal.js),
// dan izin peran (server/access-policy.js). Bila menu berubah, perbarui daftar di bawah.

(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const rupiah = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // ---- Masuk saat terlihat. Bagian yang sudah dekat layar tetap muncul bila observer tidak jalan.
  const reveal = Array.from(document.querySelectorAll('[data-reveal]'));
  if (!reduce && 'IntersectionObserver' in window) {
    root.classList.add('is-anim');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
    reveal.forEach((el) => io.observe(el));
    window.setTimeout(() => {
      reveal.forEach((el) => { if (el.getBoundingClientRect().top < window.innerHeight * 1.5) el.classList.add('is-in'); });
    }, 2500);
  }

  // ---- Angka yang menghitung naik.
  function countUp(el) {
    const target = Number(el.getAttribute('data-count'));
    if (reduce || Number.isNaN(target)) return;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 1100);
      el.textContent = rupiah(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    const counters = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        counters.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-count]').forEach((el) => counters.observe(el));

    // Tautan nav yang sesuai bagian yang sedang dibaca.
    const links = Array.from(document.querySelectorAll('.links a'));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    links.forEach((a) => { const target = document.querySelector(a.getAttribute('href')); if (target) spy.observe(target); });
  }

  // ---- Tab (WAI-ARIA): klik dan panah kiri/kanan.
  function tabs(box) {
    if (!box) return;
    const buttons = Array.from(box.querySelectorAll('[role="tab"]'));
    const panels = Array.from(box.querySelectorAll('[role="tabpanel"]'));
    function show(index, focus) {
      buttons.forEach((b, i) => { b.setAttribute('aria-selected', String(i === index)); b.tabIndex = i === index ? 0 : -1; });
      panels.forEach((p, i) => { p.hidden = i !== index; });
      if (focus) buttons[index].focus();
    }
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => show(i));
      b.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); show((i + 1) % buttons.length, true); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); show((i - 1 + buttons.length) % buttons.length, true); }
      });
    });
  }
  tabs(document.getElementById('tabs-fitur'));
  tabs(document.getElementById('tabs-layar'));

  // ---- Penanda bernomor di atas tangkapan layar: posisi dalam persen dari data-x/data-y.
  document.querySelectorAll('.hot[data-x][data-y]').forEach((dot) => {
    dot.style.left = `${Number(dot.dataset.x)}%`;
    dot.style.top = `${Number(dot.dataset.y)}%`;
    dot.setAttribute('aria-hidden', 'true');
  });
  // ---- Tutorial per peran.
  // m = indeks menu sidebar yang disorot saat langkah itu diputar.
  const ROLES = [
    {
      key: 'admin', label: 'Super Admin', av: 'SA',
      desc: 'Memegang semua menu dan semua izin.',
      login: 'Masuk di /portal dengan email dan kata sandi akun Super Admin.',
      menu: ['Portal Utama', 'Pendaftaran', 'Monitoring Asrama', 'Kelola Asrama', 'LMS Maddah', 'Keuangan & SPP', 'Visa & Paspor', 'Inventaris', 'Kelola Akun', 'Jejak Audit', 'Konten Website', 'Template', 'Pengaturan'],
      open: [
        ['Portal Utama', 'Konsol eksekutif: angka santri, asrama, musyrif, dan tagihan; daftar Perlu perhatian; tabel santri, asrama, musyrif.'],
        ['Pendaftaran', 'Semua tab petugas pendaftaran, termasuk kloter dan artikel.'],
        ['Monitoring Asrama', 'Semua tab, termasuk Profil santri baru, Penempatan kamar, Kelola asrama dan musyrif, Hubungkan akun wali, Santri teladan.'],
        ['Kelola Asrama', 'Jadwal, agenda, piket, uang kas, dan inventaris semua asrama.'],
        ['LMS Maddah', 'Semua maddah, studio materi, dan penilaian.'],
        ['Keuangan, Visa, Inventaris', 'Tagihan, kuitansi, tracker visa, aset asrama, dan riwayat keuangan.'],
        ['Kelola Akun', 'Membuat akun, mengubah peran, memblokir, dan memberi kata sandi sementara.'],
        ['Jejak Audit', 'Siapa melakukan apa dan kapan, di seluruh sistem.'],
        ['Konten Website', 'Biaya, program, kontak, testimoni, FAQ, dan pengumuman situs publik.'],
        ['Template dan Pengaturan', 'Pesan WhatsApp, kop dan rekening PDF; saklar fitur dan pembaruan basis data.']
      ],
      steps: [
        ['Buat akun tim', 'Kelola Akun: tambah akun dan pilih peran petugas, musyrif, guru, atau keuangan.', 8],
        ['Siapkan asrama dan musyrif', 'Monitoring Asrama, tab Kelola Asrama & Musyrif: buat asrama lalu tugaskan musyrifnya.', 2],
        ['Daftarkan santri', 'Tab Profil santri baru dan Penempatan Kamar, atau ubah pendaftar yang diterima menjadi santri.', 2],
        ['Hubungkan wali', 'Tab Hubungkan akun wali. Satu akun wali bisa terhubung ke beberapa ananda.', 2],
        ['Rapikan konten publik', 'Konten Website untuk biaya dan program; Template untuk pesan WhatsApp dan kop kuitansi.', 10],
        ['Pantau setiap pagi', 'Portal Utama, Perlu perhatian. Buka Jejak Audit bila ada perubahan yang dipertanyakan.', 0]
      ],
      no: ['Melihat kata sandi akun lain; admin hanya bisa menggantinya dengan kata sandi sementara.', 'Menghapus tagihan atau catatan kas; yang salah dibatalkan dengan alasan dan tetap tercatat.'],
      tip: 'Batasi akun Super Admin pada sedikit orang. Semua aksinya tercatat di Jejak Audit.'
    },
    {
      key: 'petugas', label: 'Petugas pendaftaran', av: 'PP',
      desc: 'Mengurus calon santri dari formulir sampai kloter.',
      login: 'Masuk di /portal. Akun dibuat Super Admin dengan peran Petugas Pendaftaran.',
      menu: ['Portal Utama', 'Pendaftaran'],
      open: [
        ['Portal Utama', 'Ringkasan pendaftaran dan pesan konsultasi baru.'],
        ['Daftar calon santri masuk', 'Kartu pendaftar tiga per baris, ringkasan per tahap, saringan, dan tambah pendaftar manual.'],
        ['Agenda tindak lanjut', 'Semua tindak lanjut yang belum selesai, urut tenggat; yang lewat ditandai merah.'],
        ['Kloter keberangkatan', 'Buat kloter: nama, tanggal, kota asal; tugaskan pendaftar dari kartunya.'],
        ['Pena Hamasah', 'Tulis dan terbitkan artikel, lengkap dengan nama penulis.'],
        ['Notifikasi akun', 'Kirim ulang undangan akun yang belum diterima.'],
        ['Import operasional', 'Impor data dari berkas, dengan pratinjau sebelum disimpan.'],
        ['Pesan konsultasi', 'Pesan dari formulir kontak publik untuk ditindaklanjuti.']
      ],
      steps: [
        ['Buka pendaftar baru', 'Daftar calon santri masuk. Kartu berpenanda merah berarti belum disentuh lebih dari 3 hari.', 1],
        ['Periksa berkas', 'Buka kartu, lihat dokumen, lalu setujui atau tolak dengan alasan.', 1],
        ['Ubah status', 'Data dikirim, Pemeriksaan berkas, Perlu perbaikan atau Persiapan akademik, lalu Siap keberangkatan.', 1],
        ['Catat tindak lanjut', 'Beri tenggat. Yang lewat tenggat muncul di Agenda tindak lanjut.', 1],
        ['Tetapkan kloter', 'Pilih kloter di kartu pendaftar. Jadwalnya langsung tampil di halaman cek status.', 1],
        ['Kabari pendaftar dan wali', 'Siapkan pesan WhatsApp dari kartu, periksa isinya, lalu kirim.', 1],
        ['Jadikan santri', 'Pendaftar yang selesai diubah menjadi profil santri untuk asrama dan LMS.', 1]
      ],
      no: ['Keuangan, tagihan, dan kuitansi.', 'Monitoring asrama dan catatan pembinaan santri.', 'Membuat atau memblokir akun; hanya mengirim ulang undangan.'],
      tip: 'Kartu yang terlambat selalu tampil paling jelas. Mulai hari dari Agenda tindak lanjut.'
    },
    {
      key: 'musyrif', label: 'Musyrif asrama', av: 'MS',
      desc: 'Mencatat harian untuk asrama yang dipegang.',
      login: 'Masuk di /portal. Super Admin menugaskan akun musyrif ke asramanya.',
      menu: ['Portal Utama', 'Monitoring Asrama', 'Kelola Asrama', 'Maddah Santri'],
      open: [
        ['Portal Utama', 'Tugas hari ini dan ringkasan santri di asrama yang dipegang.'],
        ['Presensi asrama', 'Sholat lima waktu dan kegiatan, sekaligus satu asrama.'],
        ['Pembinaan santri', 'Catatan pembinaan, setoran hafalan, dan kesehatan bila fitur dinyalakan.'],
        ['Cerita AI', 'Tulis cerita singkat hari itu; AI mengusulkan catatan per santri untuk ditinjau sebelum disimpan.'],
        ['Izin santri', 'Setujui atau tolak pengajuan; presensi ikut tercatat. Kepulangan izin dicatat di tab sendiri.'],
        ['Tindak lanjut pembinaan', 'Target dan tenggat pembinaan per santri.'],
        ['Pesan wali', 'Pesan dan doa dari wali santri di asramanya.'],
        ['Pengumuman', 'Pengumuman untuk santri dan wali di asramanya.'],
        ['Kelola Asrama', 'Jadwal mingguan, agenda, piket, uang kas, dan inventaris asrama.'],
        ['Maddah Santri', 'Pratinjau maddah yang diikuti santri.']
      ],
      steps: [
        ['Buka Presensi asrama', 'Pilih asrama, tanggal, dan waktu sholat. Santri yang belum dicatat otomatis terpilih.', 1],
        ['Catat status sholat', 'Berjamaah, munfarid, tidak, atau izin, lalu simpan.', 1],
        ['Catat setoran hafalan', 'Pembinaan santri: pilih santri, isi ziyadah atau murajaah beserta nilainya.', 1],
        ['Putuskan izin', 'Izin santri: setujui atau tolak. Presensinya ikut tercatat.', 1],
        ['Baca pesan wali', 'Pesan wali: tindak lanjuti bila perlu.', 1],
        ['Catat kas asrama', 'Kelola Asrama, Uang kas: pemasukan, pengeluaran, dan iuran per santri.', 2]
      ],
      no: ['Santri di asrama lain.', 'Tagihan dan keuangan lembaga.', 'Membuat santri baru, memindah asrama, atau menghubungkan akun wali; itu tugas Super Admin.'],
      tip: 'Mencatat di hari yang sama membuat dashboard wali selalu terisi. Portal Utama admin menandai musyrif yang belum mencatat.'
    },
    {
      key: 'guru', label: 'Guru / Asatidz', av: 'GA',
      desc: 'Menyusun maddah dan menilai santri.',
      login: 'Masuk di /portal. Akun guru dibuat Super Admin.',
      menu: ['Portal Utama', 'Kelola Maddah (LMS)'],
      open: [
        ['Kelola Maddah', 'Daftar maddah milik sendiri.'],
        ['Kurikulum', 'Tambah materi bacaan, video YouTube, PDF, kuis, dan tugas; urutkan dan arsipkan.'],
        ['Penilaian', 'Tugas yang masuk, beri nilai dan catatan.'],
        ['Santri', 'Daftarkan santri ke maddah dan lihat progresnya.'],
        ['Pratinjau', 'Lihat maddah persis seperti yang dilihat santri.']
      ],
      steps: [
        ['Buat maddah', 'Isi judul dan deskripsi singkat.', 1],
        ['Tambah materi', 'Pilih jenis materi, isi judul dan ringkasan untuk santri.', 1],
        ['Susun kuis', 'Tulis pertanyaan dan tandai jawaban benar. Lulus 70, tiga percobaan.', 1],
        ['Daftarkan santri', 'Tab Santri: pilih santri yang mengikuti maddah.', 1],
        ['Nilai tugas', 'Tab Penilaian. Nilai 70 ke atas menandai materi selesai.', 1],
        ['Isi panduan asisten belajar', 'Poin penting dan tanya jawab panduan, supaya jawaban AI tidak melebar.', 1]
      ],
      no: ['Maddah milik guru lain.', 'Data pribadi santri di luar maddahnya.', 'Keuangan dan monitoring asrama.'],
      tip: 'Ringkasan dan poin penting dari guru adalah satu-satunya sumber jawaban asisten belajar.'
    },
    {
      key: 'keuangan', label: 'Keuangan', av: 'KU',
      desc: 'Tagihan, kuitansi, visa, dan inventaris.',
      login: 'Masuk di /portal. Akun keuangan dibuat Super Admin.',
      menu: ['Portal Utama', 'Keuangan & SPP', 'Visa & Paspor', 'Inventaris'],
      open: [
        ['Portal Utama', 'Konsol keuangan: tagihan dan pembayaran terbaru.'],
        ['Faktur & Invoice SPP', 'Terbitkan satuan atau massal; tandai lunas, koreksi, batalkan; unduh kuitansi PDF.'],
        ['Tracker visa pelajar', 'Kartu visa semua santri aktif, urut paling mendesak, dengan pengingat WhatsApp.'],
        ['Inventaris & Sarana Asrama', 'Kartu aset, mutasi masuk dan keluar, serta riwayatnya.'],
        ['Riwayat keuangan', 'Buku besar per hari: terbit, lunas, koreksi, batal, pengingat.'],
        ['Laporan CSV', 'Unduh laporan tagihan per rentang bulan.']
      ],
      steps: [
        ['Terbitkan tagihan', 'Pilih satu santri atau Banyak santri sekaligus, isi keterangan dan nominal rupiah.', 1],
        ['Kabari wali', 'Tombol WhatsApp di kartu invoice: periksa pesan, lalu kirim.', 1],
        ['Tandai lunas', 'Konfirmasi pembayaran. Nomor kuitansi terbit otomatis.', 1],
        ['Unduh kuitansi PDF', 'Dari kartu invoice, berisi nama santri dan tanggal WIB.', 1],
        ['Koreksi atau batalkan', 'Wajib dengan alasan, dan tercatat di Riwayat keuangan.', 1],
        ['Pantau visa dan aset', 'Visa & Paspor untuk masa berlaku; Inventaris untuk mutasi stok.', 2]
      ],
      no: ['Catatan pembinaan dan presensi santri.', 'Pendaftaran dan berkas calon santri.', 'Mengelola akun.'],
      tip: 'Semua tagihan dalam rupiah. Pembayaran dalam pound Mesir dicatat dalam rupiah secara manual.'
    },
    {
      key: 'wali', label: 'Wali santri', av: 'WS',
      desc: 'Memantau ananda yang terhubung.',
      login: 'Masuk di /portal dengan akun wali. Super Admin menghubungkan akun ini ke ananda.',
      menu: ['Pantau Ananda'],
      open: [
        ['Ringkasan', 'Semua ananda yang terhubung, dengan penanda tagihan dan izin.'],
        ['Mutaba’ah & ibadah', 'Kegiatan harian dan presensinya.'],
        ['Sholat berjamaah', 'Rekap dan tabel per hari.'],
        ['Talaqqi & tahfidz', 'Setoran hafalan dan prestasi.'],
        ['Asrama', 'Jadwal, agenda, dan piket asrama ananda.'],
        ['Maddah (LMS)', 'Ringkasan progres belajar, tanpa isi materi.'],
        ['Rapor & ringkasan', 'Unduh rapor digital PDF per periode.'],
        ['Tagihan & kuitansi', 'Daftar tagihan dan unduh kuitansi yang sudah lunas.'],
        ['Kesehatan', 'Kondisi dan catatan untuk wali, bila fitur dinyalakan.']
      ],
      steps: [
        ['Masuk dan pilih ananda', 'Semua ananda yang terhubung tampil di Ringkasan.', 0],
        ['Baca ringkasan', 'Catatan pembina terakhir dan penanda yang perlu perhatian.', 0],
        ['Lihat sholat dan hafalan', 'Tab Sholat berjamaah dan Talaqqi & tahfidz.', 0],
        ['Cek tagihan', 'Tab Tagihan & kuitansi; unduh kuitansi setelah lunas.', 0],
        ['Unduh rapor', 'Tab Rapor & ringkasan, pilih periode, lalu unduh PDF.', 0],
        ['Kirim doa untuk ananda', 'Pesan dibaca musyrif asramanya dan admin.', 0]
      ],
      no: ['Santri lain selain ananda yang terhubung.', 'Isi materi maddah.', 'Detail medis internal dari staf.'],
      tip: 'Satu akun wali bisa terhubung ke beberapa ananda sekaligus.'
    },
    {
      key: 'santri', label: 'Santri', av: 'SN',
      desc: 'Belajar, mengajukan izin, melihat perkembangan sendiri.',
      login: 'Masuk di /portal dengan akun santri.',
      menu: ['Portal Utama', 'Ruang belajar (LMS)'],
      open: [
        ['Beranda santri', 'Kelas online, perkembanganku, izin, dan kegiatan terbaru.'],
        ['Ruang belajar', 'Maddah yang diikuti: video pertemuan, modul PDF, kuis, dan tugas.'],
        ['Tanya asisten belajar', 'Asisten AI di setiap pertemuan, menjawab dari materi pengajar.'],
        ['Izin', 'Ajukan izin keluar asrama dan batalkan bila perlu.'],
        ['Iqamah', 'Sisa masa berlaku dan lapor tanggal baru setelah perpanjangan.'],
        ['Jadwal asrama', 'Jadwal, agenda, dan piket.'],
        ['Kelas daring', 'Beli kelas tambahan bila sedang dibuka.']
      ],
      steps: [
        ['Lanjutkan belajar', 'Kartu Lanjutkan belajar di beranda membuka materi terakhir.', 1],
        ['Kerjakan kuis', 'Tiga percobaan, lulus 70.', 1],
        ['Kirim tugas', 'Sekali kirim, lalu tunggu nilai dari guru.', 1],
        ['Tanya asisten belajar', 'Minta penjelasan sederhana atau contoh; jawaban hanya dari materi guru.', 1],
        ['Ajukan izin', 'Isi waktu dan keperluan, lalu pantau keputusan musyrif.', 0],
        ['Lapor iqamah', 'Isi tanggal baru setelah iqamah diperpanjang.', 0]
      ],
      no: ['Data santri lain.', 'Nilai dan tugas santri lain.', 'Kunci jawaban kuis.'],
      tip: 'Perkembangan yang dilihat santri sama dengan yang dilihat walinya.'
    },
    {
      key: 'pendaftar', label: 'Calon pendaftar', av: 'CP',
      desc: 'Tanpa akun; memakai nomor pendaftaran dan kode akses.',
      login: 'Tanpa akun. Daftar di /daftar, lalu simpan nomor pendaftaran dan kode akses.',
      menu: ['Daftar', 'Cek status', 'Kontak'],
      open: [
        ['Daftar', 'Formulir pendaftaran dengan persetujuan kebijakan privasi.'],
        ['Cek status', 'Tahap pendaftaran, berkas, dan kloter, dibuka dengan kode akses.'],
        ['Unggah berkas', 'Paspor, ijazah, dan dokumen lain yang diminta petugas.'],
        ['Kontak', 'Pesan konsultasi dan WhatsApp admin.']
      ],
      steps: [
        ['Isi formulir', 'Di /daftar, lalu setujui kebijakan privasi.', 0],
        ['Simpan bukti', 'Catat nomor pendaftaran dan kode akses yang muncul.', 0],
        ['Buka cek status', 'Masukkan nomor dan kode di /cek-status.', 1],
        ['Unggah berkas', 'Perbaiki bila ada berkas yang ditolak beserta alasannya.', 1],
        ['Pantau tahap dan kloter', 'Jadwal berangkat tampil setelah ditetapkan petugas.', 1],
        ['Lupa kode', 'Gunakan pemulihan di halaman cek status.', 1]
      ],
      no: ['Portal berlogin; dibuka setelah diterima dan dibuatkan akun.', 'Data pendaftar lain.'],
      tip: 'Kode akses berfungsi seperti kata sandi. Jangan dibagikan ke orang lain.'
    }
  ];

  const tabBox = document.getElementById('role-tabs');
  const nameEl = document.getElementById('tut-name');
  const avEl = document.getElementById('tut-av');
  const descEl = document.getElementById('tut-desc');
  const loginEl = document.getElementById('tut-login');
  const menuEl = document.getElementById('tut-menu');
  const openEl = document.getElementById('tut-open');
  const stepsEl = document.getElementById('tut-steps');
  const noEl = document.getElementById('tut-no');
  const tipEl = document.getElementById('tut-tip');
  const playBtn = document.getElementById('play-btn');
  const playBar = document.getElementById('play-bar');
  let current = ROLES[0];
  let active = 0;
  let timer = null;

  function setStep(index) {
    active = index;
    Array.from(stepsEl.children).forEach((li, i) => {
      const button = li.firstChild;
      button.classList.toggle('is-on', i === index);
      button.setAttribute('aria-current', i === index ? 'step' : 'false');
    });
    const menuIndex = current.steps[index][2];
    Array.from(menuEl.children).forEach((item, i) => item.classList.toggle('is-on', i === menuIndex));
    playBar.style.width = `${((index + 1) / current.steps.length) * 100}%`;
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
    playBtn.textContent = 'Putar langkah';
  }

  function play() {
    if (timer) { stop(); return; }
    playBtn.textContent = 'Jeda';
    setStep(0);
    timer = window.setInterval(() => {
      if (active + 1 >= current.steps.length) { stop(); return; }
      setStep(active + 1);
    }, reduce ? 4000 : 2600);
  }

  function renderRole(role) {
    stop();
    current = role;
    nameEl.textContent = role.label;
    avEl.textContent = role.av;
    descEl.textContent = role.desc;
    const loginTitle = document.createElement('b');
    loginTitle.textContent = 'Cara masuk';
    loginEl.replaceChildren(loginTitle, document.createTextNode(role.login));

    menuEl.replaceChildren(...role.menu.map((label, i) => {
      const item = document.createElement('div');
      item.className = 'sb-item';
      item.style.animationDelay = `${i * 45}ms`;
      item.append(document.createElement('i'), document.createTextNode(label));
      return item;
    }));
    openEl.replaceChildren(...role.open.map(([title, text]) => {
      const box = document.createElement('div');
      box.className = 'open-item';
      const b = document.createElement('b'); b.textContent = title;
      const s = document.createElement('span'); s.textContent = text;
      box.append(b, s);
      return box;
    }));
    stepsEl.replaceChildren(...role.steps.map(([title, text], i) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'step-btn';
      const wrap = document.createElement('div');
      const b = document.createElement('b'); b.textContent = title;
      const s = document.createElement('span'); s.textContent = text;
      wrap.append(b, s);
      button.append(wrap);
      button.addEventListener('click', () => { stop(); setStep(i); });
      li.append(button);
      return li;
    }));
    noEl.replaceChildren(...role.no.map((text) => { const li = document.createElement('li'); li.textContent = text; return li; }));
    tipEl.textContent = role.tip;
    setStep(0);
  }

  if (tabBox) {
    const buttons = ROLES.map((role, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab';
      button.textContent = role.label;
      button.setAttribute('aria-pressed', String(i === 0));
      button.addEventListener('click', () => {
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        renderRole(role);
      });
      return button;
    });
    tabBox.replaceChildren(...buttons);
    playBtn.addEventListener('click', play);
    renderRole(ROLES[0]);
  }
})();
