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
      desc: 'Bisa membuka semua menu.',
      login: 'Masuk lewat /portal dengan email dan kata sandi akun Super Admin.',
      menu: ['Portal Utama', 'Pendaftaran', 'Monitoring Asrama', 'Kelola Asrama', 'LMS Maddah', 'Keuangan & SPP', 'Visa & Paspor', 'Inventaris', 'Kelola Akun', 'Jejak Audit', 'Konten Website', 'Template', 'Pengaturan'],
      open: [
        ['Portal Utama', 'Angka santri, asrama, musyrif, dan tagihan, plus daftar hal yang perlu segera ditangani.'],
        ['Pendaftaran', 'Semua yang dipegang petugas pendaftaran, termasuk kloter dan artikel.'],
        ['Monitoring Asrama', 'Semua tab, termasuk tambah santri baru, penempatan kamar, kelola asrama dan musyrif, dan menghubungkan akun wali.'],
        ['Kelola Asrama', 'Jadwal, agenda, piket, uang kas, dan inventaris di semua asrama.'],
        ['LMS Maddah', 'Semua maddah, materi, dan penilaian.'],
        ['Keuangan, Visa, Inventaris', 'Tagihan, kuitansi, visa santri, barang asrama, dan riwayat keuangan.'],
        ['Kelola Akun', 'Membuat akun, mengganti peran, memblokir, dan membuatkan kata sandi sementara.'],
        ['Jejak Audit', 'Catatan siapa melakukan apa dan kapan, di seluruh aplikasi.'],
        ['Konten Website', 'Isi website: biaya, program, kontak, testimoni, tanya jawab, dan pengumuman.'],
        ['Template dan Pengaturan', 'Isi pesan WhatsApp, kop dan rekening di PDF, serta saklar fitur.']
      ],
      steps: [
        ['Buat akun untuk tim', 'Buka Kelola Akun, tambahkan akun, lalu pilih perannya: petugas, musyrif, guru, atau keuangan.', 8],
        ['Siapkan asrama dan musyrifnya', 'Di Monitoring Asrama, tab Kelola Asrama & Musyrif, buat asramanya lalu pilih musyrif yang memegang.', 2],
        ['Masukkan santri', 'Tambahkan lewat tab Profil santri baru, atau ubah pendaftar yang sudah diterima menjadi santri.', 2],
        ['Hubungkan akun wali', 'Di tab Hubungkan akun wali. Satu wali bisa dihubungkan ke beberapa anak.', 2],
        ['Rapikan isi website', 'Di Konten Website ubah biaya dan program. Di Template atur isi pesan WhatsApp dan kop kuitansi.', 10],
        ['Cek tiap pagi', 'Buka Portal Utama dan lihat daftar yang perlu ditangani. Kalau ada perubahan yang dipertanyakan, cek di Jejak Audit.', 0]
      ],
      no: ['Melihat kata sandi orang lain. Admin hanya bisa menggantinya dengan kata sandi sementara.', 'Menghapus tagihan atau catatan kas. Yang salah dibatalkan dengan alasan, dan catatannya tetap ada.'],
      tip: 'Saran saya, akun Super Admin cukup dipegang sedikit orang. Apa pun yang dilakukan admin tercatat di Jejak Audit.'
    },
    {
      key: 'petugas', label: 'Petugas pendaftaran', av: 'PP',
      desc: 'Mengurus calon santri dari formulir sampai berangkat.',
      login: 'Masuk lewat /portal. Akunnya dibuatkan Super Admin dengan peran Petugas Pendaftaran.',
      menu: ['Portal Utama', 'Pendaftaran'],
      open: [
        ['Portal Utama', 'Ringkasan pendaftaran dan pesan konsultasi yang baru masuk.'],
        ['Daftar calon santri masuk', 'Kartu tiap pendaftar, jumlah per tahap, pencarian, dan tombol tambah pendaftar manual.'],
        ['Agenda tindak lanjut', 'Semua tindak lanjut yang belum selesai, diurutkan dari tenggat terdekat. Yang lewat tenggat ditandai merah.'],
        ['Kloter keberangkatan', 'Buat kloter dengan nama, tanggal, dan kota asal, lalu masukkan pendaftarnya.'],
        ['Pena Hamasah', 'Menulis dan menerbitkan artikel, lengkap dengan nama penulisnya.'],
        ['Notifikasi akun', 'Mengirim ulang undangan akun yang belum dibuka.'],
        ['Import operasional', 'Memasukkan data dari berkas sekaligus. Ada pratinjau dulu sebelum disimpan.'],
        ['Pesan konsultasi', 'Pertanyaan yang masuk dari formulir kontak di website.']
      ],
      steps: [
        ['Buka pendaftar baru', 'Lihat Daftar calon santri masuk. Kartu yang ada tanda merahnya berarti sudah lebih dari 3 hari belum diperiksa.', 1],
        ['Periksa berkasnya', 'Buka kartunya, lihat dokumennya, lalu setujui atau tolak. Kalau ditolak, tulis alasannya.', 1],
        ['Ubah tahapnya', 'Dari Data dikirim, ke Pemeriksaan berkas, lalu Persiapan akademik, sampai Siap keberangkatan.', 1],
        ['Catat tindak lanjut', 'Beri tenggat. Kalau lewat, otomatis muncul di Agenda tindak lanjut.', 1],
        ['Masukkan ke kloter', 'Pilih kloternya di kartu pendaftar. Jadwalnya langsung muncul di halaman cek status pendaftar.', 1],
        ['Kabari pendaftar dan wali', 'Siapkan pesan WhatsApp dari kartunya, baca ulang, lalu kirim.', 1],
        ['Jadikan santri', 'Pendaftar yang sudah selesai diubah jadi santri, supaya bisa masuk asrama dan kelas.', 1]
      ],
      no: ['Tagihan dan kuitansi.', 'Catatan pembinaan dan absen santri.', 'Membuat atau memblokir akun. Petugas hanya bisa mengirim ulang undangan.'],
      tip: 'Paling enak mulai hari dari Agenda tindak lanjut. Yang terlambat langsung kelihatan di situ.'
    },
    {
      key: 'musyrif', label: 'Musyrif asrama', av: 'MS',
      desc: 'Mencatat kegiatan harian di asrama yang dipegang.',
      login: 'Masuk lewat /portal. Super Admin yang menentukan asrama mana yang dipegang.',
      menu: ['Portal Utama', 'Monitoring Asrama', 'Kelola Asrama', 'Maddah Santri'],
      open: [
        ['Portal Utama', 'Tugas hari ini dan ringkasan santri di asramanya.'],
        ['Presensi asrama', 'Absen sholat lima waktu dan kegiatan, untuk satu asrama sekaligus.'],
        ['Pembinaan santri', 'Catatan pembinaan, setoran hafalan, dan kesehatan kalau fiturnya sudah dinyalakan.'],
        ['Cerita AI', 'Tulis cerita singkat soal hari itu, lalu AI menyusun usulan catatan per santri untuk dicek.'],
        ['Izin santri', 'Menyetujui atau menolak izin keluar. Absennya ikut tercatat. Kepulangan dicatat di tab tersendiri.'],
        ['Tindak lanjut pembinaan', 'Target dan tenggat pembinaan tiap santri.'],
        ['Pesan wali', 'Pesan dan doa yang dikirim wali untuk anaknya.'],
        ['Pengumuman', 'Pengumuman untuk santri dan wali di asramanya.'],
        ['Kelola Asrama', 'Jadwal mingguan, agenda, piket, uang kas, dan barang asrama.'],
        ['Maddah Santri', 'Melihat maddah yang diikuti santri.']
      ],
      steps: [
        ['Buka Presensi asrama', 'Pilih asrama, tanggal, dan waktu sholatnya. Santri yang belum diabsen sudah otomatis terpilih.', 1],
        ['Isi absennya', 'Ubah yang berbeda saja: munfarid, tidak, atau izin. Lalu simpan.', 1],
        ['Catat setoran hafalan', 'Di Pembinaan santri, pilih santrinya, isi ziyadah atau murajaah dan nilainya.', 1],
        ['Jawab pengajuan izin', 'Di Izin santri, setujui atau tolak. Absennya ikut tercatat.', 1],
        ['Baca pesan dari wali', 'Cek Pesan wali dan tindak lanjuti kalau perlu.', 1],
        ['Catat uang kas', 'Di Kelola Asrama, tab Uang kas, catat pemasukan, pengeluaran, dan iuran.', 2]
      ],
      no: ['Santri di asrama lain.', 'Tagihan dan keuangan lembaga.', 'Menambah santri, memindah asrama, atau menghubungkan akun wali. Itu bagian Super Admin.'],
      tip: 'Kalau dicatat di hari yang sama, halaman wali selalu terisi. Admin juga bisa lihat musyrif mana yang belum mencatat.'
    },
    {
      key: 'guru', label: 'Guru / Asatidz', av: 'GA',
      desc: 'Menyiapkan materi dan menilai santri.',
      login: 'Masuk lewat /portal. Akunnya dibuatkan Super Admin.',
      menu: ['Portal Utama', 'Kelola Maddah (LMS)'],
      open: [
        ['Kelola Maddah', 'Daftar maddah yang dipegang.'],
        ['Kurikulum', 'Menambah bacaan, video YouTube, PDF, kuis, dan tugas. Bisa diurutkan dan diarsipkan.'],
        ['Penilaian', 'Tugas yang masuk dari santri, untuk diberi nilai dan catatan.'],
        ['Santri', 'Mendaftarkan santri ke maddah dan melihat progresnya.'],
        ['Lihat sebagai santri', 'Melihat maddah persis seperti yang dilihat santri.']
      ],
      steps: [
        ['Buat maddahnya', 'Isi judul dan deskripsi singkat.', 1],
        ['Tambahkan materi', 'Pilih jenisnya, lalu isi judul dan ringkasan untuk santri.', 1],
        ['Susun kuis', 'Tulis pertanyaannya dan tandai jawaban yang benar. Nilai lulusnya 70, santri boleh mencoba tiga kali.', 1],
        ['Daftarkan santri', 'Di tab Santri, pilih siapa saja yang ikut maddah ini.', 1],
        ['Nilai tugas', 'Di tab Penilaian. Kalau nilainya 70 ke atas, materinya otomatis dianggap selesai.', 1],
        ['Isi panduan untuk asisten AI', 'Tulis poin penting dan contoh tanya jawab, supaya jawaban asistennya tidak melenceng.', 1]
      ],
      no: ['Maddah milik guru lain.', 'Data pribadi santri di luar maddahnya.', 'Keuangan dan catatan asrama.'],
      tip: 'Asisten AI cuma menjawab dari ringkasan dan poin penting yang ditulis guru. Jadi makin jelas tulisannya, makin bagus juga jawabannya.'
    },
    {
      key: 'keuangan', label: 'Keuangan', av: 'KU',
      desc: 'Mengurus tagihan, kuitansi, visa, dan barang asrama.',
      login: 'Masuk lewat /portal. Akunnya dibuatkan Super Admin.',
      menu: ['Portal Utama', 'Keuangan & SPP', 'Visa & Paspor', 'Inventaris'],
      open: [
        ['Portal Utama', 'Ringkasan tagihan dan pembayaran terbaru.'],
        ['Faktur & Invoice SPP', 'Membuat tagihan satu per satu atau sekaligus banyak, menandai lunas, mengoreksi, membatalkan, dan mengunduh kuitansi.'],
        ['Tracker visa pelajar', 'Kartu visa semua santri aktif, diurutkan dari yang paling mendesak.'],
        ['Inventaris & Sarana Asrama', 'Daftar barang asrama, keluar masuk barang, dan riwayatnya.'],
        ['Riwayat keuangan', 'Catatan per hari: tagihan terbit, lunas, dikoreksi, dibatalkan.'],
        ['Laporan CSV', 'Unduh laporan tagihan untuk rentang bulan tertentu.']
      ],
      steps: [
        ['Buat tagihan', 'Pilih satu santri atau banyak santri sekaligus, lalu isi keterangan dan nominalnya.', 1],
        ['Kabari wali', 'Tekan tombol WhatsApp di kartu tagihan, baca ulang pesannya, lalu kirim.', 1],
        ['Tandai lunas', 'Setelah pembayaran masuk, tandai lunas. Nomor kuitansi keluar sendiri.', 1],
        ['Unduh kuitansi', 'Dari kartu tagihan. Kuitansinya sudah berisi nama santri dan tanggal.', 1],
        ['Koreksi atau batalkan', 'Harus pakai alasan, dan tercatat di Riwayat keuangan.', 1],
        ['Pantau visa dan barang', 'Cek Visa & Paspor untuk masa berlaku, dan Inventaris untuk barang keluar masuk.', 2]
      ],
      no: ['Catatan pembinaan dan absen santri.', 'Pendaftaran dan berkas calon santri.', 'Mengatur akun.'],
      tip: 'Semua tagihan pakai rupiah. Kalau ada pembayaran dalam pound Mesir, dicatat dalam rupiah secara manual.'
    },
    {
      key: 'wali', label: 'Wali santri', av: 'WS',
      desc: 'Memantau ananda yang terhubung ke akunnya.',
      login: 'Masuk lewat /portal dengan akun wali. Super Admin yang menghubungkan akun ini ke ananda.',
      menu: ['Pantau Ananda'],
      open: [
        ['Ringkasan', 'Semua ananda yang terhubung, dengan tanda kalau ada tagihan atau izin.'],
        ['Mutaba’ah & ibadah', 'Kegiatan harian dan absennya.'],
        ['Sholat berjamaah', 'Rekap sholat per hari.'],
        ['Talaqqi & tahfidz', 'Setoran hafalan dan prestasi.'],
        ['Asrama', 'Jadwal, agenda, dan piket di asrama ananda.'],
        ['Maddah (LMS)', 'Progres belajar ananda, tanpa isi materinya.'],
        ['Rapor & ringkasan', 'Unduh rapor PDF untuk periode tertentu.'],
        ['Tagihan & kuitansi', 'Daftar tagihan dan kuitansi yang sudah lunas.'],
        ['Kesehatan', 'Kondisi dan catatan untuk wali, kalau fiturnya sudah dinyalakan.']
      ],
      steps: [
        ['Masuk dan pilih ananda', 'Semua anak yang terhubung muncul di Ringkasan.', 0],
        ['Baca ringkasannya', 'Ada catatan terakhir dari pembina dan hal yang perlu diperhatikan.', 0],
        ['Lihat sholat dan hafalan', 'Di tab Sholat berjamaah dan Talaqqi & tahfidz.', 0],
        ['Cek tagihan', 'Di tab Tagihan & kuitansi. Kuitansi bisa diunduh setelah lunas.', 0],
        ['Unduh rapor', 'Di tab Rapor & ringkasan, pilih periodenya, lalu unduh PDF.', 0],
        ['Kirim doa untuk ananda', 'Pesannya dibaca musyrif di asrama ananda.', 0]
      ],
      no: ['Data santri lain.', 'Isi materi maddah.', 'Catatan medis yang khusus untuk staf.'],
      tip: 'Satu akun wali bisa dipakai untuk beberapa anak sekaligus.'
    },
    {
      key: 'santri', label: 'Santri', av: 'SN',
      desc: 'Belajar, minta izin, dan melihat perkembangannya sendiri.',
      login: 'Masuk lewat /portal dengan akun santri.',
      menu: ['Portal Utama', 'Ruang belajar (LMS)'],
      open: [
        ['Beranda santri', 'Kegiatan hari ini, piket, lanjut belajar, dan izin.'],
        ['Ruang belajar', 'Maddah yang diikuti: video pertemuan, modul PDF, kuis, dan tugas.'],
        ['Tanya asisten belajar', 'Asisten AI di setiap pertemuan, yang menjawab dari materi pengajar.'],
        ['Izin', 'Mengajukan izin keluar asrama, atau membatalkannya.'],
        ['Iqamah', 'Sisa masa berlaku iqamah, dan lapor kalau sudah diperpanjang.'],
        ['Jadwal asrama', 'Jadwal, agenda, dan piket.'],
        ['Kelas daring', 'Membeli kelas tambahan kalau sedang dibuka.']
      ],
      steps: [
        ['Lanjutkan belajar', 'Tekan Lanjut belajar di beranda, langsung ke materi terakhir.', 1],
        ['Kerjakan kuis', 'Ada tiga kali kesempatan, nilai lulusnya 70.', 1],
        ['Kirim tugas', 'Cukup sekali kirim, lalu tunggu nilai dari guru.', 1],
        ['Tanya asisten belajar', 'Minta dijelaskan lebih sederhana atau minta contoh. Jawabannya dari materi guru.', 1],
        ['Ajukan izin', 'Isi waktu dan keperluannya, lalu tunggu jawaban musyrif.', 0],
        ['Lapor iqamah', 'Isi tanggal barunya setelah iqamah diperpanjang.', 0]
      ],
      no: ['Data santri lain.', 'Nilai dan tugas santri lain.', 'Kunci jawaban kuis.'],
      tip: 'Perkembangan yang dilihat santri sama dengan yang dilihat walinya.'
    },
    {
      key: 'pendaftar', label: 'Calon pendaftar', av: 'CP',
      desc: 'Belum punya akun, cukup pakai nomor pendaftaran dan kode akses.',
      login: 'Tidak perlu akun. Daftar di /daftar, lalu simpan nomor pendaftaran dan kode aksesnya.',
      menu: ['Daftar', 'Cek status', 'Kontak'],
      open: [
        ['Daftar', 'Formulir pendaftaran, termasuk persetujuan kebijakan privasi.'],
        ['Cek status', 'Tahap pendaftaran, berkas, dan kloter. Dibuka dengan kode akses.'],
        ['Unggah berkas', 'Paspor, ijazah, dan dokumen lain yang diminta petugas.'],
        ['Kontak', 'Kirim pertanyaan lewat formulir, atau langsung WhatsApp admin.']
      ],
      steps: [
        ['Isi formulir', 'Buka /daftar, isi datanya, dan setujui kebijakan privasi.', 0],
        ['Simpan buktinya', 'Catat nomor pendaftaran dan kode akses yang muncul.', 0],
        ['Buka cek status', 'Masukkan nomor dan kodenya di /cek-status.', 1],
        ['Unggah berkas', 'Kalau ada yang ditolak, alasannya ditulis, jadi tinggal diperbaiki.', 1],
        ['Pantau tahap dan kloter', 'Jadwal berangkat muncul setelah ditetapkan petugas.', 1],
        ['Lupa kode akses', 'Bisa dipulihkan dari halaman cek status.', 1]
      ],
      no: ['Portal untuk santri dan wali. Baru bisa dibuka setelah diterima dan dibuatkan akun.', 'Data pendaftar lain.'],
      tip: 'Kode akses itu seperti kata sandi. Jangan diberikan ke orang lain.'
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
