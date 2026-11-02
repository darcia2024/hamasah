'use strict';

// Demo /qohiroh-demo: satu santri diikuti dari pendaftaran sampai wali menerima kuitansi.
// Memakai tangkapan layar yang sudah ada di assets/qohiroh/m (data contoh), tanpa memanggil API
// dan tanpa akun apa pun, jadi tidak menyentuh data atau login situs utama.
// Naikkan VERSI bersama qohiroh.js bila gambar diambil ulang, karena gambar disimpan peramban sehari.

(function () {
  const FOLDER = '../assets/qohiroh/m/';
  const VERSI = '20261027d';
  const LAPTOP = 'laptop';
  const PONSEL = 'ponsel';
  const DOKUMEN = 'dokumen';

  // Tiap adegan: peran, judul, apa yang terlihat, poin yang ditunjukkan, catatan pembicara, dan layarnya.
  // Layar: [berkas, jenis, teks pengganti].
  const SEMUA = [
    {
      peran: 'Petugas pendaftaran',
      judul: 'Pendaftar masuk ke satu daftar',
      lihat: 'Semua calon santri ada di satu tempat, lengkap dengan tahap dan progresnya.',
      poin: ['Satu baris per pendaftar.', 'Tanda merah untuk yang terlalu lama belum diperiksa.'],
      catatan: 'Mulai dari sini: "Bayangkan satu calon santri baru saja mengisi formulir." Tunjuk tanda merah, lalu bilang petugas tidak perlu mencari satu per satu.',
      layar: [['petugas-daftar', LAPTOP, 'Daftar calon santri dengan tahap dan progres']]
    },
    {
      peran: 'Petugas pendaftaran',
      judul: 'Berkas diperiksa, wali dikabari',
      lihat: 'Data diri, berkas, dan status satu pendaftar dalam satu jendela.',
      poin: ['Setujui atau tolak berkas dengan alasan.', 'Pesan WhatsApp disiapkan sistem, petugas membaca ulang lalu mengirim.'],
      catatan: 'Tekankan bahwa pesan tidak terkirim sendiri: petugas yang menekan kirim. Kalau ditanya soal otomatis, jawab itu keputusan pimpinan (butuh domain dan pengirim resmi).',
      layar: [['petugas-detail', LAPTOP, 'Jendela detail pendaftar']]
    },
    {
      peran: 'Petugas pendaftaran',
      judul: 'Dimasukkan ke gelombang keberangkatan',
      lihat: 'Kelompok berangkat dibuat dengan nama, tanggal, dan kota asal.',
      poin: ['Jadwal tampil di halaman cek status pendaftar.', 'Visa dan paspor dipantau dari tanggal berlakunya.'],
      catatan: 'Di aplikasi istilahnya "kloter". Sebutkan bahwa istilah ini bisa diganti sesuai kebiasaan tim Qohiroh.',
      layar: [['petugas-kloter', LAPTOP, 'Formulir kloter keberangkatan']]
    },
    {
      peran: 'Pimpinan',
      judul: 'Yang perlu ditangani hari ini, langsung kelihatan',
      lihat: 'Hal yang perlu perhatian dikelompokkan per santri, bukan per menu.',
      poin: ['Visa atau paspor yang mau habis, tagihan, pembina yang belum mencatat.', 'Satu tombol membuka santrinya.'],
      catatan: 'Ini adegan untuk pimpinan. Tanyakan: "Biasanya Bapak/Ibu tahu dari mana kalau ada yang terlambat?"',
      layar: [['admin-perhatian', LAPTOP, 'Panel Perlu perhatian yang dikelompokkan per santri']]
    },
    {
      peran: 'Pembina asrama',
      judul: 'Presensi satu asrama dalam hitungan detik',
      lihat: 'Yang belum diisi sudah terpilih berjamaah, jadi pembina cukup mengubah yang berbeda.',
      poin: ['Sholat dan kegiatan sekaligus.', 'Catatan hari itu langsung muncul di halaman wali.'],
      catatan: 'Jembatan ke adegan wali: "Yang dicatat pembina sekarang akan dilihat wali sebentar lagi."',
      layar: [['musyrif-presensi', LAPTOP, 'Presensi asrama dengan pilihan berjamaah, munfarid, tidak, dan izin']]
    },
    {
      peran: 'Guru dan santri',
      judul: 'Guru menyiapkan sekali, santri belajar dari HP',
      lihat: 'Maddah, materi, kuis, dan tugas disusun dari satu halaman.',
      poin: ['Bacaan, video, PDF, kuis, dan tugas dalam satu maddah.', 'Santri bertanya ke asisten belajar di tiap pertemuan.'],
      catatan: 'Kalau ditanya soal AI: jawabannya hanya dari materi pengajar, pemakaian dibatasi per jam dan per hari.',
      layar: [
        ['guru-kurikulum', LAPTOP, 'Kurikulum satu maddah di halaman guru'],
        ['santri-pertemuan', PONSEL, 'Halaman pertemuan di HP santri']
      ]
    },
    {
      peran: 'Keuangan',
      judul: 'Tagihan terbit, tunggakan terpantau',
      lihat: 'Setiap tagihan punya nomor, dan koreksi atau pembatalan wajib disertai alasan.',
      poin: ['Tagihan untuk satu santri atau banyak sekaligus.', 'Tunggakan diurutkan dari total terbesar.'],
      catatan: 'Jangan menyebut pembayaran online atau gateway: itu belum diputuskan. Cukup bahas pencatatan dan kuitansi.',
      layar: [['keuangan-invoice', LAPTOP, 'Daftar invoice: belum dibayar dan lunas']]
    },
    {
      peran: 'Keuangan dan wali',
      judul: 'Lunas, kuitansi langsung jadi PDF',
      lihat: 'Kuitansi bisa diunduh oleh keuangan maupun wali, dengan kop Qohiroh Center.',
      poin: ['Kop, rekening, dan penanda tangan diatur sendiri.', 'Bagian yang belum ada catatannya ditulis kosong, tidak dikarang.'],
      catatan: 'Tunjukkan kop dan logo Qohiroh di dokumen. Itu bukti identitas lembaga sudah ikut.',
      layar: [['dok-kuitansi', DOKUMEN, 'Contoh kuitansi pembayaran dengan kop Qohiroh Center']]
    },
    {
      peran: 'Wali santri',
      judul: 'Kabar sampai ke rumah tanpa menunggu laporan bulanan',
      lihat: 'Wali melihat ananda dari HP: laporan 30 hari, tagihan, dan hal yang perlu diurus.',
      poin: ['Sholat berjamaah, kehadiran, dan setoran hafalan.', 'Tagihan dan iqamah yang perlu diurus tampil di depan.'],
      catatan: 'Tutup ceritanya di sini: dari satu pendaftar sampai wali yang tahu kabar anaknya.',
      layar: [
        ['wali-1', PONSEL, 'Halaman wali: ananda dan hal yang perlu diperhatikan'],
        ['wali-2', PONSEL, 'Halaman wali: laporan 30 hari terakhir']
      ]
    },
    {
      peran: 'Pimpinan',
      judul: 'Setiap perubahan ada jejaknya',
      lihat: 'Siapa mengubah apa dan kapan, di seluruh aplikasi.',
      poin: ['Akses menu mengikuti peran akun.', 'Koreksi dan pembatalan tercatat lengkap dengan alasannya.'],
      catatan: 'Penutup untuk pimpinan: kendali dan keterlacakan. Lanjutkan ke lima hal yang perlu diputuskan di halaman penawaran.',
      layar: [['admin-audit', LAPTOP, 'Timeline kejadian di Jejak audit']]
    }
  ];

  // Versi ringkas (?ringkas=1) untuk waktu terbatas: lima langkah yang paling berdampak, urutan nomor di SEMUA (mulai 1).
  const RINGKAS = [1, 4, 6, 8, 9];
  const modeRingkas = new URLSearchParams(window.location.search).get('ringkas') === '1';
  const ADEGAN = modeRingkas ? RINGKAS.map((nomor) => SEMUA[nomor - 1]) : SEMUA;

  // Ukuran asli tiap jenis gambar, dipakai mengubah kotak sorotan dari piksel menjadi persen.
  const UKURAN = { [LAPTOP]: [1366, 860], [PONSEL]: [780, 1688], [DOKUMEN]: [1190, 470] };

  // Layar HP dimulai sedikit di bawah dynamic island, supaya teks paling atas tidak terpotong sudut layar.
  // Nilainya harus sama dengan --geser di qohiroh-demo.css (dalam persen tinggi layar).
  const GESER_PONSEL = 4;

  // Bagian layar yang disorot saat adegan tampil: berkas -> [x, y, lebar, tinggi] dalam piksel gambar asli, dan keterangannya.
  // Ubah angkanya bila gambar diambil ulang dengan tata letak yang berbeda.
  const SOROT = {
    'petugas-daftar': [[290, 318, 1036, 134], 'Jumlah pendaftar di tiap tahap'],
    'petugas-detail': [[236, 534, 436, 172], 'WhatsApp ke calon santri dan wali'],
    'petugas-kloter': [[309, 425, 987, 126], 'Kloter terkonfirmasi, lengkap dengan pendaftarnya'],
    'admin-perhatian': [[300, 142, 1012, 132], 'Satu santri, tiga hal yang perlu perhatian'],
    'musyrif-presensi': [[323, 712, 952, 62], 'Sudah terpilih Berjamaah, cukup ubah yang berbeda'],
    'guru-kurikulum': [[292, 516, 1032, 264], 'Urutan materi sama dengan yang dilihat santri'],
    'santri-pertemuan': [[24, 1030, 732, 330], 'Daftar pertemuan dan progresnya'],
    'keuangan-invoice': [[323, 405, 970, 188], 'Belum dibayar, tinggal Tandai lunas'],
    'dok-kuitansi': [[84, 196, 1022, 210], 'Nomor kuitansi dan tagihan tercatat'],
    'wali-1': [[24, 1110, 732, 370], 'Tagihan dan iqamah tampil di depan'],
    'wali-2': [[14, 694, 752, 484], 'Sholat, kegiatan, dan hafalan dalam angka'],
    'admin-audit': [[323, 625, 970, 214], 'Siapa, kapan, dan pada data apa']
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    demo: $('demo'), adegan: document.querySelector('.adegan'), no: $('adegan-no'), peran: $('adegan-peran'), judul: $('adegan-judul'), lihat: $('adegan-lihat'),
    poin: $('adegan-poin'), catatan: $('catatan'), catatanTeks: $('catatan-teks'), layar: $('layar'), bar: $('bar'),
    titik: $('titik'), mundur: $('mundur'), maju: $('maju'), alatCatatan: $('alat-catatan'), alatPenuh: $('alat-penuh')
  };

  let kini = 0;

  function dariAlamat() {
    const n = Number.parseInt(window.location.hash.slice(1), 10);
    return Number.isInteger(n) && n >= 1 && n <= ADEGAN.length ? n - 1 : 0;
  }

  function alamatGambar(berkas) { return `${FOLDER}${berkas}.jpg?v=${VERSI}`; }

  function bingkai([berkas, jenis, alt]) {
    const gambar = document.createElement('img');
    gambar.src = alamatGambar(berkas);
    gambar.alt = alt;
    gambar.decoding = 'sync';
    if (jenis === LAPTOP) { gambar.width = 1366; gambar.height = 860; }
    else if (jenis === PONSEL) { gambar.width = 780; gambar.height = 1688; }
    else { gambar.width = 1190; gambar.height = 470; }
    const layar = document.createElement('div');
    layar.className = 'bingkai__layar';
    layar.appendChild(gambar);
    if (jenis === PONSEL) {
      const indikator = document.createElement('span');
      indikator.className = 'bingkai__indikator';
      indikator.setAttribute('aria-hidden', 'true');
      layar.appendChild(indikator);
    }
    const sorot = SOROT[berkas];
    if (sorot) {
      const [lebarAsli, tinggiAsli] = UKURAN[jenis];
      const [x, y, l, t] = sorot[0];
      const kotak = document.createElement('span');
      kotak.className = 'sorot';
      kotak.setAttribute('aria-hidden', 'true');
      const geser = jenis === PONSEL ? GESER_PONSEL : 0;
      // Properti satu per satu (CSSOM), bukan atribut style, supaya lolos Content Security Policy tanpa unsafe-inline.
      kotak.style.left = `${(x / lebarAsli) * 100}%`;
      kotak.style.top = `${(y / tinggiAsli) * 100 + geser}%`;
      kotak.style.width = `${(l / lebarAsli) * 100}%`;
      kotak.style.height = `${(t / tinggiAsli) * 100}%`;
      layar.appendChild(kotak);
    }
    // Tutup laptop atau bingkai logam HP membungkus layarnya; tampilan perangkatnya diatur di CSS.
    const tutup = document.createElement('div');
    tutup.className = 'bingkai__tutup';
    tutup.appendChild(layar);
    const figure = document.createElement('figure');
    figure.className = `bingkai bingkai--${jenis}`;
    figure.appendChild(tutup);
    const unit = document.createElement('div');
    unit.className = `unit unit--${jenis}`;
    unit.appendChild(figure);
    if (sorot) {
      const teks = document.createElement('p');
      teks.className = 'unit__teks';
      teks.textContent = sorot[1];
      unit.appendChild(teks);
    }
    return unit;
  }

  // Mengulang animasi CSS: lepas kelasnya, paksa hitung ulang tata letak, lalu pasang lagi.
  function ulangAnimasi(elemen, kelas) {
    elemen.classList.remove(kelas);
    void elemen.offsetWidth;
    elemen.classList.add(kelas);
  }

  function siapkanTitik() {
    ADEGAN.forEach((adegan, i) => {
      const li = document.createElement('li');
      const tombol = document.createElement('button');
      tombol.type = 'button';
      tombol.setAttribute('aria-label', `Langkah ${i + 1}: ${adegan.judul}`);
      tombol.addEventListener('click', () => pindah(i));
      li.appendChild(tombol);
      el.titik.appendChild(li);
    });
  }

  function tampil(i, { animasi = true } = {}) {
    const adegan = ADEGAN[i];
    el.no.textContent = String(i + 1);
    el.peran.textContent = adegan.peran;
    el.judul.textContent = adegan.judul;
    el.lihat.textContent = adegan.lihat;
    el.poin.replaceChildren(...adegan.poin.map((teks) => { const li = document.createElement('li'); li.textContent = teks; return li; }));
    el.catatanTeks.textContent = adegan.catatan;
    el.layar.classList.remove('layar--masuk');
    el.layar.replaceChildren(...adegan.layar.map(bingkai));
    if (animasi) { ulangAnimasi(el.layar, 'layar--masuk'); ulangAnimasi(el.adegan, 'adegan--masuk'); }
    el.bar.style.width = `${((i + 1) / ADEGAN.length) * 100}%`;
    el.mundur.disabled = i === 0;
    el.maju.disabled = i === ADEGAN.length - 1;
    el.maju.textContent = i === ADEGAN.length - 2 ? 'Langkah terakhir' : 'Berikutnya';
    [...el.titik.querySelectorAll('button')].forEach((tombol, n) => {
      if (n === i) tombol.setAttribute('aria-current', 'step'); else tombol.removeAttribute('aria-current');
      tombol.classList.toggle('lewat', n < i);
    });
    document.title = `${i + 1}/${ADEGAN.length} ${adegan.judul} | Demo Qohiroh Center`;
    // Gambar langkah berikutnya dimuat lebih dulu supaya pindah tidak berkedip.
    const berikut = ADEGAN[i + 1];
    if (berikut) berikut.layar.forEach(([berkas]) => { const gambar = new Image(); gambar.src = alamatGambar(berkas); });
  }

  function pindah(i) {
    const tujuan = Math.max(0, Math.min(ADEGAN.length - 1, i));
    if (tujuan === kini) return;
    kini = tujuan;
    // replaceState supaya tombol kembali peramban tidak harus ditekan belasan kali.
    try { window.history.replaceState(null, '', `#${kini + 1}`); } catch (galat) { /* tidak penting */ }
    tampil(kini);
  }

  function ubahCatatan() {
    const nyala = el.catatan.hidden;
    el.catatan.hidden = !nyala;
    el.alatCatatan.setAttribute('aria-pressed', String(nyala));
  }

  function layarPenuh() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.demo.requestFullscreen) el.demo.requestFullscreen();
    } catch (galat) { /* peramban menolak, abaikan */ }
  }

  const alatMode = $('alat-mode');
  if (alatMode) {
    alatMode.textContent = modeRingkas ? 'Versi lengkap' : 'Versi ringkas';
    alatMode.href = modeRingkas ? '?#1' : '?ringkas=1#1';
    alatMode.title = modeRingkas ? 'Semua 10 langkah' : 'Hanya 5 langkah utama';
  }

  el.mundur.addEventListener('click', () => pindah(kini - 1));
  el.maju.addEventListener('click', () => pindah(kini + 1));
  el.alatCatatan.addEventListener('click', ubahCatatan);
  el.alatPenuh.addEventListener('click', layarPenuh);
  if (!document.documentElement.requestFullscreen) el.alatPenuh.hidden = true;

  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tombol = event.key;
    if (tombol === 'ArrowRight' || tombol === 'PageDown' || tombol === ' ') { event.preventDefault(); pindah(kini + 1); }
    else if (tombol === 'ArrowLeft' || tombol === 'PageUp') { event.preventDefault(); pindah(kini - 1); }
    else if (tombol === 'Home') { event.preventDefault(); pindah(0); }
    else if (tombol === 'End') { event.preventDefault(); pindah(ADEGAN.length - 1); }
    else if (tombol === 'n' || tombol === 'N') ubahCatatan();
    else if (tombol === 'f' || tombol === 'F') layarPenuh();
  });

  // Spasi pada tombol yang sedang fokus tetap menekan tombol itu, bukan pindah langkah.
  document.addEventListener('keydown', (event) => {
    if (event.key === ' ' && event.target instanceof HTMLButtonElement) event.stopImmediatePropagation();
  }, true);

  window.addEventListener('hashchange', () => { const n = dariAlamat(); if (n !== kini) { kini = n; tampil(kini); } });

  siapkanTitik();
  kini = dariAlamat();
  tampil(kini, { animasi: false });
})();
