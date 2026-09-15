/**
 * HAMASAH INTERNATIONAL - RANCANGAN 1 WEBSITE TERPADU (2 LAYANAN)
 * Controller Interaktif untuk Proposal Resmi Dar Developer:
 * - Layanan 1 (Publik): Akun Registrasi Keberangkatan, AI Konsultan Publik, Berita Mesir
 * - Layanan 2 (App Portal): Hamasah Family (Wali), Hamasah Campus (LMS & AI), Hamasah Operations (Auto Invoice/Kuitansi)
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initUdemyLMS();
  initSantriRecordDashboard();
  initOperationsDashboard();
  initModals();
  initArtikelSection();
  initFamilyDashboard();
  initRoleEcosystemDiagram();
  initRoadmapTimeline();
  initPhaseOneWorkspace();
  initHamasahAiAssistant();
  initScrollAnimations();
});

// ==========================================================================
// 0. NAVBAR: STICKY DOCK & MOBILE MENU CONTROLLER
// ==========================================================================
function initNavbar() {
  const header = document.getElementById('site-header');
  const toggleBtn = document.getElementById('nav-toggle-mobile');
  const mobileMenu = document.getElementById('mobile-nav-menu');

  // Sticky blur and shadow elevation on scroll
  window.addEventListener('scroll', () => {
    if (!header) return;
    if (window.scrollY > 20) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  }, { passive: true });

  // Mobile menu toggle
  if (toggleBtn && mobileMenu) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileMenu.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close when clicking nav links
    mobileMenu.querySelectorAll('.mobile-nav-link, .open-pitch-btn').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target)) {
        mobileMenu.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

// ==========================================================================
// 1. PORTAL AKADEMIK HAMASAH: VIDEO TALAQQI LMS & AI STUDY PARTNER
// ==========================================================================
const UDEMY_LESSONS = {
  'ch1-1': {
    chapter: 'Bab 01: Thaharah & Jenis Air',
    tag: 'SESI TALAQQI 01 · MATAN FATHUL QORIB',
    arabic: 'بَابُ مِيَاهِ الطَّهَارَةِ وَأَقْسَامِهَا',
    title: 'Pengantar Kitab Matan Fathul Qorib',
    duration: '12:30',
    currentTime: '12:30',
    playedPercent: 100,
    statusText: 'Selesai',
    aiContext: 'Pengantar Fathul Qorib',
    points: [
      { num: '01', text: '<strong>Biografi Pengarang:</strong> Mengenal Syaikh Ibnu Qasim Al-Ghazi dan Syaikh Abu Syuja\' penyusun matan al-ghayah wat taqrib.' },
      { num: '02', text: '<strong>Sistematika Fiqh Syafi\'i:</strong> Mengapa kitab fiqh selalu diawali dengan bab Thaharah sebelum mendirikan shalat.' },
      { num: '03', text: '<strong>Keberkahan Sanad Talaqqi:</strong> Adab menyimak dan mencatat kalam ulama di majelis ilmu Al-Azhar Kairo.' }
    ],
    note: 'Santri Ahmad Raihan telah menyelesaikan materi pengantar ini dan lulus evaluasi awal dengan predikat Mumtaz.'
  },
  'ch1-2': {
    chapter: 'Bab 01: Thaharah & Jenis Air',
    tag: 'SESI TALAQQI 02 · MATAN FATHUL QORIB',
    arabic: 'فَصْلٌ فِي أَنْوَاعِ الْمِيَاهِ الطَّاهِرَةِ',
    title: 'Macam-Macam Air untuk Bersuci',
    duration: '18:15',
    currentTime: '18:15',
    playedPercent: 100,
    statusText: 'Selesai',
    aiContext: 'Macam-Macam Air Bersuci',
    points: [
      { num: '01', text: '<strong>7 Macam Air Asal:</strong> Air hujan, air laut, air sungai, air sumur, air mata air, air salju, dan air embun.' },
      { num: '02', text: '<strong>Air Musyammas:</strong> Air yang terpanaskan terik matahari di bejana logam selain emas dan perak, makruh tanzih dipakai bersuci.' },
      { num: '03', text: '<strong>Kadar Dua Qullah:</strong> Batas volume air kurang lebih 192,5 liter (atau bak kubus sisi 60 cm).' }
    ],
    note: 'Santri telah memahami perbedaan air suci menyucikan dan air yang makruh digunakan menurut Madzhab Syafi\'i.'
  },
  'ch1-3': {
    chapter: 'Bab 01: Thaharah & Jenis Air',
    tag: 'SESI TALAQQI 03 · MATAN FATHUL QORIB',
    arabic: 'فَصْلٌ فِي إِزَالَةِ النَّجَاسَةِ وَأَنْوَاعِهَا',
    title: 'Najis & Kaifiyah Mensucikannya',
    duration: '22:40',
    currentTime: '22:40',
    playedPercent: 100,
    statusText: 'Selesai',
    aiContext: 'Tingkatan Najis & Thaharah',
    points: [
      { num: '01', text: '<strong>Najis Mukhaffafah (Ringan):</strong> Air kencing bayi laki-laki yang belum makan selain ASI, cukup dipercikkan air mutlaq.' },
      { num: '02', text: '<strong>Najis Mutawassithah (Sedang):</strong> Darah, nanah, bangkai, dan khamr; wajib hilang warna, bau, dan rasa.' },
      { num: '03', text: '<strong>Najis Mughalladhah (Berat):</strong> Anjing dan babi; disucikan 7 kali basuhan dan salah satunya dicampur debu suci.' }
    ],
    note: 'Santri telah mempraktikkan tata cara pensucian najis di asrama Hay Asyir.'
  },
  'ch2-1': {
    chapter: 'Bab 02: Fiqh Wudhu & Pembatalnya',
    tag: 'SESI TALAQQI 04 · MADZHAB SYAFI\'I',
    arabic: 'فَصْلٌ فِي فُرُوضِ الْوُضُوءِ وَشُرُوطِهِ',
    title: 'Syarat Sah & Rukun Wudhu menurut Madzhab Syafi\'i',
    duration: '28:50',
    currentTime: '14:25',
    playedPercent: 48,
    statusText: 'Sedang Diputar',
    aiContext: 'Materi Wudhu & Bersuci',
    points: [
      { num: '01', text: '<strong>Definisi Thaharah:</strong> Pengangkatan hadats atau pembersihan najis yang menghalangi sahnya pelaksanaan ibadah shalat.' },
      { num: '02', text: '<strong>6 Fardhu Wudhu:</strong> Niat bersamaan membasuh muka, membasuh seluruh wajah, membasuh kedua tangan sampai siku, mengusap sebagian kepala, membasuh kedua kaki sampai mata kaki, dan tertib.' },
      { num: '03', text: '<strong>Hal yang Membatalkan:</strong> Sesuatu yang keluar dari qubul/dubur, hilang akal (tidur/pingsan), sentuhan kulit lawan jenis non-mahram tanpa batas, dan menyentuh kemaluan dengan telapak tangan.' }
    ],
    note: 'Ahmad Raihan wajib menyetorkan hafalan matan bait pasal ini secara langsung kepada pembina pada halaqah ba\'da Subuh esok.'
  },
  'ch2-2': {
    chapter: 'Bab 02: Fiqh Wudhu & Pembatalnya',
    tag: 'SESI TALAQQI 05 · MADZHAB SYAFI\'I',
    arabic: 'فَصْلٌ فِي سُنَنِ الْوُضُوءِ الْمَسْنُونَةِ',
    title: 'Sunnah-Sunnah Wudhu Lengkap',
    duration: '19:20',
    currentTime: '00:00',
    playedPercent: 0,
    statusText: 'Belum Diputar',
    aiContext: 'Sunnah Wudhu Madzhab Syafi\'i',
    points: [
      { num: '01', text: '<strong>Membaca Basmalah & Siwak:</strong> Kesunahan di awal bersuci dan keutamaan bersiwak sebelum membasuh kedua telapak tangan.' },
      { num: '02', text: '<strong>Madhmadhah & Istinsyaq:</strong> Berkumur-kumur dan menghirup air ke hidung 3 kali secara bersambung.' },
      { num: '03', text: '<strong>Taslits (Mengulang 3x):</strong> Menyempurnakan basuhan anggota wudhu dan menyela-nyela jenggot tebal serta jari tangan dan kaki.' }
    ],
    note: 'Materi lanjutan setelah santri menguasai rukun fardhu wudhu.'
  },
  'ch2-3': {
    chapter: 'Bab 02: Fiqh Wudhu & Pembatalnya',
    tag: 'SESI TALAQQI 06 · MADZHAB SYAFI\'I',
    arabic: 'فَصْلٌ فِي نَوَاقِضِ الْوُضُوءِ الْأَرْبَعَةِ',
    title: 'Perkara yang Membatalkan Wudhu',
    duration: '23:15',
    currentTime: '00:00',
    playedPercent: 0,
    statusText: 'Belum Diputar',
    aiContext: 'Pembatal Wudhu & Thaharah',
    points: [
      { num: '01', text: '<strong>Keluarnya Sesuatu:</strong> Dari salah satu dua jalan (qubul/dubur) baik berupa angin, kotoran, atau cairan.' },
      { num: '02', text: '<strong>Hilang Akal:</strong> Karena tidur pulas kecuali tidur dalam posisi duduk yang mantap di atas lantai.' },
      { num: '03', text: '<strong>Sentuhan Kulit Non-Mahram:</strong> Bersentuhan kulit laki-laki dan perempuan ajnabi tanpa penghalang menurut mu\'tamad madzhab Syafi\'i.' }
    ],
    note: 'Santri diharapkan mencatat batasan mahram dan non-mahram dalam madzhab Syafi\'i.'
  },
  'ch3-1': {
    chapter: 'Bab 03: Sholat & Syarat Rukun',
    tag: 'SESI TALAQQI 07 · MADZHAB SYAFI\'I',
    arabic: 'كِتَابُ الصَّلَاةِ وَمَوَاقِيتُهَا الْمَفْرُوضَةِ',
    title: 'Waktu-Waktu Sholat Maktubah',
    duration: '15:00',
    currentTime: '00:00',
    playedPercent: 0,
    statusText: 'Belum Diputar',
    aiContext: 'Waktu Sholat Maktubah',
    points: [
      { num: '01', text: '<strong>5 Waktu Pokok:</strong> Dzuhur, Ashar, Maghrib, Isya, dan Subuh berdasarkan pergerakan matahari dan ufuk fajar.' },
      { num: '02', text: '<strong>Waktu Ikhtiyar & Idlthirar:</strong> Batasan waktu utama dan waktu darurat untuk masing-masing pelaksanaan sholat.' }
    ],
    note: 'Materi persiapan modul fiqh sholat semester berjalan.'
  },
  'ch3-2': {
    chapter: 'Bab 03: Sholat & Syarat Rukun',
    tag: 'SESI TALAQQI 08 · MADZHAB SYAFI\'I',
    arabic: 'فَصْلٌ فِي أَرْكَانِ الصَّلَاةِ السَّبْعَةَ عَشَرَ',
    title: 'Rukun Sholat 17 Perkara',
    duration: '32:15',
    currentTime: '00:00',
    playedPercent: 0,
    statusText: 'Belum Diputar',
    aiContext: 'Rukun-Rukun Sholat 17',
    points: [
      { num: '01', text: '<strong>Rukun Qouli, Fi\'li & Qolbi:</strong> Niat, takbiratul ihram, berdiri bagi yang mampu, membaca Fatihah, ruku\', I\'tidal, sujud, duduk di antara dua sujud, tahiyyat akhir, dan salam.' },
      { num: '02', text: '<strong>Thuma\'ninah:</strong> Wajib tenang sejenak seukuran membaca kalimat "Subhanallah" pada 4 posisi fi\'li.' }
    ],
    note: 'Materi inti kurikulum semester ganjil talaqqi Al-Azhar.'
  }
};

let currentUdemyLessonKey = 'ch2-1';
let isUdemyPlaying = false;

function selectUdemyLesson(key) {
  if (!UDEMY_LESSONS[key]) return;
  currentUdemyLessonKey = key;
  const lesson = UDEMY_LESSONS[key];

  // Update playlist rows
  document.querySelectorAll('.udemy-lesson-row').forEach(row => {
    row.classList.remove('active');
  });
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  } else {
    const matched = document.querySelector(`.udemy-lesson-row[onclick*="${key}"]`);
    if (matched) matched.classList.add('active');
  }

  // Update Player Header
  const displayCourse = document.getElementById('udemy-display-course');
  if (displayCourse) displayCourse.innerText = `${lesson.chapter}: ${lesson.title}`;

  // Update Viewport overlay
  const badgeEl = document.getElementById('udemy-lesson-badge');
  const arabicEl = document.getElementById('udemy-arabic-title');
  const titleEl = document.getElementById('udemy-lesson-title');
  const timerEl = document.getElementById('udemy-timer-display');
  const scrubberPlayed = document.getElementById('udemy-scrubber-played');

  if (badgeEl) badgeEl.innerText = lesson.tag;
  if (arabicEl) arabicEl.innerText = lesson.arabic;
  if (titleEl) titleEl.innerText = lesson.title;
  if (timerEl) timerEl.innerText = `${lesson.currentTime} / ${lesson.duration}`;
  if (scrubberPlayed) scrubberPlayed.style.width = `${lesson.playedPercent}%`;

  // Update Tab 1: Points & Note
  const pointsList = document.getElementById('udemy-points-list');
  if (pointsList && lesson.points) {
    pointsList.innerHTML = lesson.points.map(p => `
      <li>
        <span class="udemy-overview-num">${p.num}</span>
        <div>${p.text}</div>
      </li>
    `).join('');
  }

  const callout = document.querySelector('.udemy-pembina-callout');
  if (callout && lesson.note) {
    callout.innerHTML = `<strong>Catatan Pembina Asrama:</strong> ${lesson.note}`;
  }

  // Update Tab 2 AI Context
  const aiMaddahName = document.getElementById('udemy-ai-maddah-name');
  if (aiMaddahName) aiMaddahName.innerText = lesson.aiContext;

  const chatBody = document.getElementById('udemy-ai-chat-body');
  if (chatBody) {
    chatBody.innerHTML = `
      <div class="chat-bubble-dpai bubble-ai-dpai">
        Kamu beralih ke materi <strong>${lesson.title}</strong>. Klik tombol <strong>Rangkum Video Ini</strong> untuk meminta rangkuman intisari dari Ustaz Pembina atau ketik istilah yang membuatmu bingung.
      </div>
    `;
  }

  // Reset play state
  isUdemyPlaying = false;
  updatePlayButtonUI();
}
window.selectUdemyLesson = selectUdemyLesson;

function switchUdemyTab(tabName) {
  document.querySelectorAll('.udemy-tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.udemy-tab-panel').forEach(panel => panel.classList.remove('active'));

  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }

  const targetPanel = document.getElementById(`udemy-tab-${tabName}`);
  if (targetPanel) targetPanel.classList.add('active');
}
window.switchUdemyTab = switchUdemyTab;

function toggleUdemyPlay() {
  isUdemyPlaying = !isUdemyPlaying;
  updatePlayButtonUI();

  const timerEl = document.getElementById('udemy-timer-display');
  const scrubberPlayed = document.getElementById('udemy-scrubber-played');
  const lesson = UDEMY_LESSONS[currentUdemyLessonKey];

  if (isUdemyPlaying) {
    if (timerEl && lesson) {
      timerEl.innerText = `${lesson.currentTime} / ${lesson.duration} (Memutar...)`;
    }
    if (scrubberPlayed && lesson.playedPercent < 100) {
      scrubberPlayed.style.width = `${Math.min(100, lesson.playedPercent + 10)}%`;
    }
  } else {
    if (timerEl && lesson) {
      timerEl.innerText = `${lesson.currentTime} / ${lesson.duration}`;
    }
  }
}

function updatePlayButtonUI() {
  const bigBtn = document.getElementById('udemy-play-toggle-btn');
  const ctrlPlay = document.getElementById('udemy-ctrl-play');

  if (bigBtn) {
    if (isUdemyPlaying) {
      bigBtn.classList.add('playing');
      bigBtn.title = 'Jeda Video';
    } else {
      bigBtn.classList.remove('playing');
      bigBtn.title = 'Putar Video';
    }
  }

  if (ctrlPlay) {
    ctrlPlay.innerText = isUdemyPlaying ? '⏸ Jeda' : '▶ Putar';
  }
}

function initUdemyLMS() {
  const bigBtn = document.getElementById('udemy-play-toggle-btn');
  const ctrlPlay = document.getElementById('udemy-ctrl-play');
  const ctrlRw = document.getElementById('udemy-ctrl-rw');
  const ctrlFf = document.getElementById('udemy-ctrl-ff');

  if (bigBtn) bigBtn.addEventListener('click', toggleUdemyPlay);
  if (ctrlPlay) ctrlPlay.addEventListener('click', toggleUdemyPlay);

  if (ctrlRw) {
    ctrlRw.addEventListener('click', () => {
      alert('Video dimundurkan 10 detik.');
    });
  }

  if (ctrlFf) {
    ctrlFf.addEventListener('click', () => {
      alert('Video dimajukan 10 detik.');
    });
  }

  // AI Chat in Udemy LMS
  const chatBody = document.getElementById('udemy-ai-chat-body');
  const input = document.getElementById('udemy-ai-input');
  const sendBtn = document.getElementById('udemy-ai-send');
  const btnRangkum = document.getElementById('btn-ai-rangkum-udemy');
  const btnTanyaIstilah = document.getElementById('btn-ai-tanya-istilah-udemy');

  if (btnRangkum && chatBody) {
    btnRangkum.addEventListener('click', () => {
      const lesson = UDEMY_LESSONS[currentUdemyLessonKey];
      appendBubble(chatBody, `Tolong rangkumkan intisari dari video "${lesson.title}".`, 'user');

      const typing = document.createElement('div');
      typing.className = 'chat-bubble-dpai bubble-ai-dpai';
      typing.innerHTML = '<span style="color: var(--text-muted);">AI sedang merangkum penjelasan Ustaz Pembina...</span>';
      chatBody.appendChild(typing);
      chatBody.scrollTop = chatBody.scrollHeight;

      setTimeout(() => {
        let summaryHtml = `<strong>Rangkuman Video ${lesson.title}:</strong><br><br>`;
        lesson.points.forEach(p => {
          summaryHtml += `• ${p.text}<br>`;
        });
        summaryHtml += `<br><em>Catatan Pembina:</em> ${lesson.note}`;
        typing.innerHTML = summaryHtml;
        chatBody.scrollTop = chatBody.scrollHeight;
      }, 350);
    });
  }

  if (btnTanyaIstilah && input) {
    btnTanyaIstilah.addEventListener('click', () => {
      input.value = "Apa perbedaan antara syarat sah dan rukun dalam fiqh Syafi'i?";
      input.focus();
    });
  }

  if (sendBtn && input && chatBody) {
    sendBtn.addEventListener('click', () => handleUdemyAiQuery(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUdemyAiQuery(input.value.trim());
    });
  }

  const udemySuggest = document.getElementById('udemy-ai-suggest');
  if (udemySuggest) {
    udemySuggest.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-chip');
      if (chip) handleUdemyAiQuery(chip.getAttribute('data-q'));
    });
  }

  function udemyAiAnswer(text) {
    const lower = text.toLowerCase();
    const lesson = UDEMY_LESSONS[currentUdemyLessonKey];

    if (lower.includes('syarat') && lower.includes('rukun')) {
      return `<strong>Beda syarat & rukun:</strong><br>
        - <strong>Syarat:</strong> keharusan sahnya ibadah yang berada <em>di luar</em> ibadah itu, dikerjakan sebelum mulai. Contoh: wudhu dan masuk waktu sebelum shalat.<br>
        - <strong>Rukun:</strong> bagian inti yang berada <em>di dalam</em> ibadah dan tidak boleh ditinggalkan. Contoh: niat, membaca Al-Fatihah, ruku', sujud.<br><br>
        Sama-sama membuat ibadah tidak sah jika ditinggalkan.`;
    }
    if (lower.includes("musta'mal") || lower.includes('mustamal')) {
      return `<strong>Air musta'mal (Mazhab Syafi'i):</strong><br>
        Air kurang dari dua qullah yang sudah terpakai untuk mengangkat hadats atau membersihkan najis.<br>
        Statusnya <em>thahir ghairu muthahhir</em>: suci zatnya, tapi tidak bisa dipakai bersuci wajib lagi.`;
    }
    if (lower.includes('fardhu') || lower.includes('fardu') || (lower.includes('rukun') && lower.includes('wudhu'))) {
      return `<strong>6 fardhu wudhu:</strong><br>
        1. Niat saat membasuh wajah.<br>
        2. Membasuh seluruh wajah.<br>
        3. Membasuh kedua tangan sampai siku.<br>
        4. Mengusap sebagian kepala.<br>
        5. Membasuh kedua kaki sampai mata kaki.<br>
        6. Tertib (berurutan).`;
    }
    if (lower.includes('batal') || lower.includes('membatalkan')) {
      return `<strong>Pembatal wudhu:</strong><br>
        - Keluar sesuatu dari qubul atau dubur.<br>
        - Hilang akal karena tidur nyenyak, pingsan, atau mabuk.<br>
        - Bersentuhan kulit dengan lawan jenis non-mahram tanpa penghalang.<br>
        - Menyentuh kemaluan dengan telapak tangan.`;
    }
    if (lower.includes('soal') || lower.includes('latihan') || lower.includes('kuis') || lower.includes('quiz')) {
      return `<strong>Latihan singkat materi "${escapeHtml(lesson.title)}":</strong><br>
        1. Sebutkan definisi thaharah dengan bahasamu sendiri.<br>
        2. Apa beda syarat dan rukun? Beri satu contoh masing-masing.<br>
        3. Urutkan 6 fardhu wudhu.<br>
        4. Seseorang tertidur pulas sambil duduk, batalkah wudhunya? Jelaskan.<br><br>
        Tulis jawabanmu, nanti saya koreksi.`;
    }
    if (lower.includes('rangkum') || lower.includes('ringkas') || lower.includes('intisari')) {
      let out = `<strong>Rangkuman "${escapeHtml(lesson.title)}":</strong><br>`;
      lesson.points.forEach(p => { out += `• ${p.text}<br>`; });
      out += `<br><em>Catatan Pembina:</em> ${lesson.note}`;
      return out;
    }
    return `<strong>Soal "${escapeHtml(text)}":</strong><br>
      Ini masih dalam lingkup materi <em>${escapeHtml(lesson.title)}</em>. Ringkasnya, kaidah ini dirujuk Ustaz Pembina ke syarah matan oleh ulama Al-Azhar.<br><br>
      Coba tanya lebih spesifik (misalnya minta contoh atau dalilnya), atau catat untuk ditanyakan langsung di halaqah ba'da Subuh besok.`;
  }

  function handleUdemyAiQuery(text) {
    if (!text) return;
    appendBubble(chatBody, escapeHtml(text), 'user');
    input.value = '';

    const typing = document.createElement('div');
    typing.className = 'chat-bubble-dpai bubble-ai-dpai';
    typing.innerHTML = '<span style="color: var(--text-muted);">AI Study Partner sedang menganalisis penjelasan video...</span>';
    chatBody.appendChild(typing);
    chatBody.scrollTop = chatBody.scrollHeight;

    setTimeout(() => {
      typing.innerHTML = udemyAiAnswer(text);
      chatBody.scrollTop = chatBody.scrollHeight;
    }, 420);
  }
}

// ==========================================================================
// 2. ARTIKEL BERITA KEGIATAN MESIR (PLATFORM PEMBERITAAN DIGITAL)
// ==========================================================================
let ARTIKEL_DATA = [
  {
    id: 1,
    judul: "Pelepasan Rombongan Santri Baru Angkatan 2026 Menuju Kairo di Bandara Soekarno Hatta",
    kategori: "Keberangkatan",
    gambar: "assets/hero-student.jpg",
    penulis: "Ustaz Ahmad Fauzi, Lc.",
    rolePenulis: "Kepala Bimbingan Keberangkatan",
    avatarPenulis: "assets/avatar-hamasah.png",
    tanggal: "4 September 2026",
    lokasi: "Bandara Soekarno Hatta, Jakarta",
    waktuBaca: "5 Menit Baca",
    ringkasan: "Sebanyak 42 calon mahasiswa Al-Azhar resmi diberangkatkan didampingi dua ustadz pembina Hamasah International setelah menuntaskan karantina bahasa dan pembekalan adab.",
    isi: `<p class="article-lead"><strong>JAKARTA :</strong> Suasana haru dan penuh rasa syukur menyelimuti Terminal 3 Keberangkatan Internasional Bandara Soekarno Hatta, Tangerang, Banten, saat 42 santri baru Hamasah International Angkatan 2026 resmi dilepas untuk memulai perjalanan tholabul ilmi menuju Universitas Al-Azhar, Kairo, Mesir.</p>

<p>Pelepasan resmi ini menandai puncak dari rangkaian program pembekalan intensif selama enam bulan di tanah air. Selama masa karantina, para santri telah dibekali penguatan tahsin Al-Qur'an, pemantapan bahasa Arab fusha aktif, serta kajian matrikulasi kitab-kitab turats dasar. Rombongan santri didampingi langsung oleh dua ustadz pembina senior dari tim Hamasah International yang akan mengawal proses perjalanan udara hingga mendarat dengan selamat di Kairo.</p>

<h4 class="article-subheading">Pesan Integritas dan Keluhuran Adab Penuntut Ilmu</h4>

<p>Dalam sambutan pelepasan di hadapan para santri dan wali murid yang hadir, Pimpinan Hamasah International menegaskan bahwa menuntut ilmu di bumi para anbiya membutuhkan ketulusan niat, ketangguhan mental, dan keluhuran akhlak.</p>

<blockquote class="article-quote">
  <p>"Kalian berangkat ke Mesir bukan semata-mata demi mengejar selembar ijazah akademik, melainkan untuk meneguk mata air keilmuan yang bersambung sanadnya kepada Rasulullah SAW melalui para masyayikh Al-Azhar. Jaga nama baik keluarga, lembaga Hamasah International, dan bangsa Indonesia di kancah internasional," pesan beliau dengan penuh ketegasan dan kehangatan.</p>
</blockquote>

<p>Pihak lembaga juga memberikan pesan penenang bagi para orang tua yang mengantar agar tidak merasa waswas melepaskan putra-putrinya ke negeri perantauan. Melalui ekosistem digital terpadu Hamasah International, setiap aspek kehidupan santri, mulai dari laporan presensi sholat Subuh, evaluasi adab, catatan kesehatan harian, hingga mutaba'ah tahfidz akan terpantau secara berkala dan dapat diakses langsung oleh wali santri di tanah air melalui Portal Keluarga.</p>

<h4 class="article-subheading">Pendampingan Penuh Hingga Tiba di Asrama Hay Asyir</h4>

<p>Kepala Bimbingan Keberangkatan Hamasah International, Ustaz Ahmad Fauzi, Lc., menjelaskan bahwa seluruh prosedur logistik perjalanan telah dipersiapkan secara komprehensif. Tim telah menyelesaikan verifikasi berkas izin tinggal, tiket penerbangan langsung tanpa transit panjang, serta koordinasi armada penjemputan resmi di Bandara Internasional Kairo.</p>

<p>"Setibanya di Kairo, rombongan santri akan langsung disambut oleh perwakilan musyrif Mesir. Santri segera diantar menggunakan bus khusus menuju Asrama 1 di kawasan Hay Asyir untuk beristirahat, orientasi kamar, dan penyesuaian iklim sebelum memasuki pekan ta'aruf kampus Al-Azhar pekan depan," terang Ustaz Ahmad Fauzi.</p>

<p>Salah seorang perwakilan wali santri asal Surabaya, Bapak Hendra Kusuma, menyampaikan apresiasinya atas keteraturan dan transparansi bimbingan Hamasah International sejak awal pendaftaran dan pemberkasan hingga hari keberangkatan.</p>

<p>"Sebagai orang tua, tentu ada rasa berat melepas anak ke luar negeri. Namun melihat kesigapan pembina Hamasah yang mendampingi dalam satu penerbangan serta tersedianya portal pemantauan harian, hati kami menjadi sangat tenang dan mantap," tutur Hendra penuh haru.</p>`
  },
  {
    id: 2,
    judul: "Pembukaan Halaqah Talaqqi Perdana Santri Bersama Masyaikh di Kawasan Darrasah Kairo",
    kategori: "Talaqqi Kairo",
    gambar: "assets/cairo-arches.jpg",
    penulis: "Ustaz Farhan Abdullah, Lc.",
    rolePenulis: "Musyrif Pembina Rumah 1 Kairo",
    avatarPenulis: "assets/avatar-hamasah.png",
    tanggal: "1 September 2026",
    lokasi: "Darrasah & Rawaq Al-Azhar, Kairo",
    waktuBaca: "6 Menit Baca",
    ringkasan: "Santri binaan Hamasah memulai kajian talaqqi kitab matan fiqih bersama ulama Al-Azhar di Darrasah untuk memperdalam pemahaman perkuliahan formal.",
    isi: `<p class="article-lead"><strong>KAIRO :</strong> Puluhan santri binaan Hamasah International memadati serambi keilmuan di kawasan Darrasah dan Rawaq Al-Azhar Kairo guna mengikuti pembukaan resmi halaqah talaqqi perdana tahun ajaran baru 2026. Kegiatan ini merupakan pilar kurikulum unggulan asrama Hamasah dalam menghidupkan tradisi transmisi keilmuan Islam bersanad langsung dari para ulama terkemuka Al-Azhar.</p>

<p>Halaqah talaqqi perdana ini diasuh langsung oleh sejumlah masyayikh Al-Azhar yang mengampu pembacaan dan syarah kitab-kitab induk turats. Pada sesi pembuka pekan ini, santri mengkaji matan Fathul Qorib Al-Mujib dalam bidang Fiqih Mazhab Syafi'i serta matan Al-Ajurumiyyah dan Qothrun Nada dalam bidang kaidah tata bahasa Arab.</p>

<h4 class="article-subheading">Memadukan Perkuliahan Kampus dan Keberkahan Sanad Masyaikh</h4>

<p>Musyrif Pembina Asrama 1 Hay Asyir, Ustaz Farhan Abdullah, Lc., mengungkapkan bahwa keberadaan program talaqqi ini dirancang khusus untuk melengkapi perkuliahan formal di fakultas. Di ruang kuliah kampus, mahasiswa Al-Azhar menerima paparan materi kurikulum secara luas, sedangkan di majelis talaqqi, santri melatih ketajaman membaca teks Arab klasik tanpa harakat kata demi kata di hadapan para guru bersanad.</p>

<blockquote class="article-quote">
  <p>"Metode talaqqi di serambi Al-Azhar adalah ruh keilmuan Islam yang telah teruji selama lebih dari seribu tahun. Kami di Hamasah memastikan setiap santri tidak sekadar hadir, melainkan didampingi musyrif asrama dalam mutaba'ah catatan, pemaknaan lafaz, hingga penguasaan argumentasi dalil fiqih," jelas Ustaz Farhan di sela-sela majelis.</p>
</blockquote>

<h4 class="article-subheading">Integrasi Rekaman Digital dan Partner Belajar AI</h4>

<p>Guna mengoptimalkan daya serap santri, seluruh materi kajian talaqqi direkam secara profesional dan diunggah ke Portal Akademik Hamasah International. Santri yang ingin mengulang penjelasan masyayikh dapat menyimak rekaman video berkualitas tinggi serta memanfaatkan asisten tanya-jawab AI Hamasah yang telah disesuaikan dengan koridor matan yang dipelajari.</p>

<p>Ahmad Raihan (19), salah seorang santri asal Jawa Barat yang mengikuti halaqah fiqih, mengaku sangat terbantu dengan sistem pendampingan terpadu yang diterapkan pengurus Hamasah.</p>

<p>"Awalnya saya sempat khawatir kesulitan menangkap dialek bahasa Arab fusha masyayikh yang cepat. Namun karena sebelum berangkat ke Darrasah kami sudah dibimbing musyrif membaca pengantar materi di asrama Rumah 1, suasana kajian menjadi sangat mudah dipahami. Rekaman talaqqi di portal santri juga sangat membantu untuk muraja'ah malam hari," tutur Raihan antusias.</p>

<p>Rangkaian halaqah talaqqi ini dijadwalkan berlangsung empat kali sepekan di masjid-masjid bersejarah sekitar kampus Al-Azhar, dengan komitmen mencetak generasi kader ulama yang berakar kuat pada tradisi keilmuan salaf dan berwawasan moderat (wasathiyyah).</p>`
  },
  {
    id: 3,
    judul: "Bimbingan Intensif Dauroh Ta'hili : Tiga Puluh Hari Membedah Soal Ujian Muadalah",
    kategori: "Dauroh & Akademik",
    gambar: "assets/subcard-student.jpg",
    penulis: "Ustaz Ziyad Karim, M.A.",
    rolePenulis: "Koordinator Kurikulum Muadalah",
    avatarPenulis: "assets/avatar-hamasah.png",
    tanggal: "26 Agustus 2026",
    lokasi: "Markaz Lughoh Al-Azhar, Kairo",
    waktuBaca: "5 Menit Baca",
    ringkasan: "Program karantina belajar daring berjalan efektif dengan tingkat kelulusan simulasi mencapai 96 persen untuk materi nahwu, shorof, dan balaghah.",
    isi: `<p class="article-lead"><strong>KAIRO :</strong> Sebanyak 58 santri tingkat persiapan Universitas Al-Azhar sukses menyelesaikan program bimbingan intensif Dauroh Ta'hili yang diselenggarakan oleh divisi kurikulum Hamasah International. Program tiga puluh hari nonstop ini difokuskan pada pembedahan mendalam soal-soal ujian Muadalah penyetaraan ijazah serta tes penempatan bahasa Arab di Markaz Lughoh Al-Azhar Kairo.</p>

<p>Hasil evaluasi akhir menunjukkan capaian akademik yang sangat menggembirakan, di mana 96 persen peserta bimbingan sukses melampaui batas nilai kelulusan dengan predikat Mumtaz (Istimewa) dan Jayyid Jiddan (Sangat Baik) pada simulasi ujian tulis maupun ujian wawancara lisan.</p>

<h4 class="article-subheading">Pola Belajar Terstruktur: Teori Kaidah dan Keberanian Wawancara</h4>

<p>Koordinator Kurikulum Muadalah Hamasah International, Ustaz Ziyad Karim, M.A., menuturkan bahwa kunci keberhasilan dauroh ini terletak pada formula silabus bertarget yang dirumuskan oleh para alumni Al-Azhar berpredikat magister dan doktoral.</p>

<blockquote class="article-quote">
  <p>"Ujian Muadalah dan tes bahasa Markaz Lughoh Al-Azhar menuntut nalar bahasa Arab yang presisi, bukan sekadar hafalan rumus gramatika. Oleh sebab itu, santri kami latih membedah struktur kalimat Al-Qur'an, menganalisis kesalahan umum i'rab, serta melatih keberanian berdialog aktif (muhadatsah) setiap hari," ungkap Ustaz Ziyad.</p>
</blockquote>

<p>Materi bimbingan mencakup empat fokus kompetensi utama: Nahwu aplikatif, Shorof wazan muta'addi, Balaghah dasar (Bayan, Ma'ani, Badi'), serta keterampilan menulis esai ilmiah (Insya'). Setiap santri diwajibkan menyusun minimal satu esai berbahasa Arab setiap pekannya untuk dikoreksi langsung oleh mentor kebahasaan.</p>

<h4 class="article-subheading">Dukungan Bank Soal Interaktif dan Simulasi Waktu Nyata</h4>

<p>Selain bimbingan tatap muka, santri memanfaatkan bank soal digital pada Portal Akademik Hamasah International. Sistem ini menyediakan ratusan simulasi soal ujian tahun-tahun terdahulu yang dilengkapi pembahasan komprehensif, penghitung waktu ujian otomatis, serta pemetaan kelemahan materi santri secara real-time.</p>

<p>Muhammad Ihsan, peserta dauroh yang meraih skor simulasi tertinggi, menyatakan bahwa latihan terstruktur ini melenyapkan rasa grogi saat berhadapan langsung dengan penguji native speaker asal Mesir.</p>

<p>"Dahulu saya merasa materi Balaghah sangat rumit. Namun berkat dauroh intensif tiga puluh hari bersama ustadz pembina Hamasah dan rutin mengerjakan kuis harian di portal, rasa percaya diri saya meningkat pesat. Bimbingan ini menjadi jembatan yang sangat kokoh sebelum kami memulai masa perkuliahan resmi," pungkas Ihsan.</p>

<p>Dengan tuntasnya Dauroh Ta'hili ini, seluruh santri dinyatakan siap mengikuti ujian resmi penetapan level bahasa dan pemberkasan administrasi fakultas di Universitas Al-Azhar untuk semester mendatang.</p>`
  },
  {
    id: 4,
    judul: "Silaturahmi Santri dan Pembagian Buku Panduan Akademik di Asrama Hay Asyir",
    kategori: "Asrama & Komunitas",
    gambar: "assets/cairo-skyline.jpg",
    penulis: "Pengurus Asrama Kairo",
    rolePenulis: "Tim Logistik & Pelayanan Asrama",
    avatarPenulis: "assets/avatar-hamasah.png",
    tanggal: "18 Agustus 2026",
    lokasi: "Hay Asyir, Kairo, Mesir",
    waktuBaca: "5 Menit Baca",
    ringkasan: "Kegiatan kebersamaan santri asrama Kairo dalam pembagian diktat panduan kuliah Al-Azhar serta evaluasi kesehatan dan kebersihan berkala.",
    isi: `<p class="article-lead"><strong>KAIRO :</strong> Semangat ukhuwah dan kekeluargaan mewarnai aula pertemuan Rumah 1 Asrama Hamasah International di kawasan Hay Asyir, Kairo, Mesir. Pengurus asrama menggelar agenda silaturahmi bulanan yang dirangkai dengan pembagian buku panduan akademik Al-Azhar, sosialisasi tata tertib kota Kairo, serta pemeriksaan kesehatan berkala bagi seluruh santri mukim.</p>

<p>Pertemuan ini dihadiri oleh jajaran asatidz pembina, musyrif adab asrama, tim logistik Rumah 1, serta puluhan santri dari berbagai wilayah Indonesia yang tengah menempuh pendidikan di bumi para nabi tersebut.</p>

<h4 class="article-subheading">Distribusi Buku Panduan Akademik dan Peta Navigasi Kota</h4>

<p>Dalam kesempatan tersebut, tim akademik membagikan paket buku panduan resmi yang memuat kalender akademik Al-Azhar, panduan administrasi izin tinggal visa pelajar, direktori perpustakaan riset kitab klasik, serta etika sosial bermasyarakat di Mesir. Santri juga dibekali panduan peta transportasi Kairo, mencakup rute metro bawah tanah, jalur bus menuju kampus Darrasah, dan kontak darurat KBRI Kairo.</p>

<blockquote class="article-quote">
  <p>"Kenyamanan dan kelancaran studi santri di perantauan berakar dari ketertiban tempat tinggal. Buku panduan ini menjadi pegangan praktis santri agar mandiri dalam mengurus urusan administrasi resmi, tertib dalam jadwal talaqqi harian, dan tanggap terhadap lingkungan sekitar," ujar perwakilan Pengurus Asrama Hamasah di Kairo.</p>
</blockquote>

<h4 class="article-subheading">Pemeriksaan Kesehatan dan Asupan Gizi Nusantara</h4>

<p>Mengingat Kairo memiliki perubahan cuaca ekstrem antara musim panas dan musim dingin, tim kesehatan asrama bekerja sama dengan dokter perhimpunan mahasiswa mengadakan pemeriksaan kesehatan rutin. Agenda mencakup pengecekan tekanan darah, evaluasi kebugaran jasmani, serta konsultasi adaptasi pola makan dan hidrasi tubuh di iklim Kairo.</p>

<p>Pengurus asrama juga membagikan vitamin dan suplemen alami guna memperkuat daya tahan tubuh santri. Sementara itu, tim dapur asrama memastikan menu katering harian disajikan dengan cita rasa nusantara yang higienis dan bergizi seimbang, sehingga santri tetap merasakan kehangatan santapan khas tanah air di negeri perantauan.</p>

<h4 class="article-subheading">Penguatan Disiplin Sholat Subuh Berjamaah dan Adab Asrama</h4>

<p>Sesi ramah tamah diakhiri dengan pengarahan musyrif mengenai pembiasaan sholat Subuh berjamaah tepat waktu di masjid, adab menjaga kebersihan kamar, serta pemanfaatan jam belajar mandiri malam hari (mudzakaroh lailiyyah).</p>

<p>Seluruh rangkuman evaluasi adab santri, catatan kesehatan, dan keaktifan kegiatan asrama ini langsung diinput oleh musyrif ke dalam Portal Keluarga Hamasah International, sehingga para orang tua di Indonesia dapat memantau kabar baik putranya dengan tenang dan penuh keyakinan.</p>`
  }
];

let activeFilter = 'all';

function initArtikelSection() {
  renderArticles();

  const filterBtns = document.querySelectorAll('#article-filter-bar .filter-btn-dpai');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-cat') || 'all';
      renderArticles();
    });
  });
}

function renderArticles() {
  const container = document.getElementById('article-grid');
  if (!container) return;

  const filtered = activeFilter === 'all' 
    ? ARTIKEL_DATA 
    : ARTIKEL_DATA.filter(a => a.kategori === activeFilter);

  if (!filtered.length) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 44px 20px; background: var(--surface-stone); border-radius: var(--radius-inner);">
        <strong style="font-size: 15px; color: var(--text-main); display: block; margin-bottom: 6px;">Belum ada artikel pada kategori ini</strong>
        <p style="font-size: 13.5px; color: var(--text-muted); margin-bottom: 16px;">Silakan pilih kategori lain atau tulis artikel kegiatan baru.</p>
        <button class="pill-btn-outline" onclick="document.getElementById('btn-open-tulis-artikel').click()" style="font-size: 12.5px;">
          Tulis Artikel Baru
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <article class="news-preview-card" onclick="openBacaArtikel(${item.id})">
      <!-- Thumbnail Cover Image with Category Overlay & Reading Time -->
      <div class="news-thumb-container">
        <img src="${item.gambar}" alt="${escapeHtml(item.judul)}" class="news-thumb-img" loading="lazy">
        <div class="news-thumb-overlay"></div>
        <span class="news-badge-category">${escapeHtml(item.kategori)}</span>
        <span class="news-badge-time">${escapeHtml(item.waktuBaca || '3 Menit Baca')}</span>
      </div>

      <!-- Editorial News Content -->
      <div class="news-content-box">
        <div class="news-meta-header">
          <span class="news-meta-location">${escapeHtml(item.lokasi || 'Kairo, Mesir')}</span>
          <span class="news-meta-dot">·</span>
          <span class="news-meta-date">${escapeHtml(item.tanggal)}</span>
        </div>

        <h3 class="news-card-title">${escapeHtml(item.judul)}</h3>
        <p class="news-card-excerpt">${escapeHtml(item.ringkasan)}</p>

        <!-- Reporter Byline & Actions -->
        <div class="news-card-footer" onclick="event.stopPropagation()">
          <div class="news-author-meta">
            <img src="${item.avatarPenulis || 'assets/avatar-hamasah.png'}" alt="${escapeHtml(item.penulis)}" class="news-author-avatar">
            <div>
              <div class="news-author-name">${escapeHtml(item.penulis)}</div>
              <div class="news-author-role">${escapeHtml(item.rolePenulis || 'Tim Liputan Kairo')}</div>
            </div>
          </div>

          <div class="news-action-btns">
            <button type="button" class="news-read-btn" onclick="openBacaArtikel(${item.id})">
              Baca Berita <span>↗</span>
            </button>
            <button type="button" class="news-share-btn" onclick="shareArticleWA(${item.id})" title="Bagikan ke WhatsApp">
              Bagikan
            </button>
          </div>
        </div>
      </div>
    </article>
  `).join('');
}

function openBacaArtikel(id) {
  const article = ARTIKEL_DATA.find(a => a.id === id);
  if (!article) return;

  const modal = document.getElementById('modal-baca-artikel');
  const titleEl = document.getElementById('baca-artikel-judul');
  const catEl = document.getElementById('baca-artikel-kategori');
  const metaEl = document.getElementById('baca-artikel-meta');
  const bodyEl = document.getElementById('baca-artikel-konten');

  if (titleEl) titleEl.innerText = article.judul;
  if (catEl) catEl.innerText = article.kategori;
  
  if (metaEl) {
    metaEl.innerHTML = `
      <div class="news-detail-byline-bar">
        <div class="byline-reporter-box">
          <img src="${article.avatarPenulis || 'assets/avatar-hamasah.png'}" alt="${escapeHtml(article.penulis)}" class="byline-avatar-img">
          <div>
            <strong class="byline-name">${escapeHtml(article.penulis)}</strong>
            <span class="byline-role">${escapeHtml(article.rolePenulis || 'Biro Liputan Kairo')} · Hamasah International</span>
          </div>
        </div>
        <div class="byline-meta-specs">
          <span>${escapeHtml(article.lokasi || 'Kairo, Mesir')}</span>
          <span class="meta-sep">·</span>
          <span>${escapeHtml(article.tanggal)}</span>
          <span class="meta-sep">·</span>
          <span class="byline-time-tag">${escapeHtml(article.waktuBaca || '5 Menit Baca')}</span>
        </div>
      </div>
    `;
  }
  
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="modal-news-hero-banner">
        <img src="${article.gambar}" alt="${escapeHtml(article.judul)}" class="modal-news-hero-img">
        <div class="modal-news-hero-caption">Dokumentasi resmi Hamasah International · ${escapeHtml(article.lokasi || 'Kairo, Mesir')}</div>
      </div>
      
      <div class="modal-news-text-body">
        ${article.isi}
      </div>

      <!-- Editorial Footer & Share Bar -->
      <div class="article-editorial-footer">
        <div class="editorial-sign-box">
          <div class="editorial-badge">DOKUMENTASI RESMI HAMASAH INTERNATIONAL</div>
          <p class="editorial-sign-text">
            Naskah berita ini dirilis oleh Tim Publikasi & Dokumentasi Resmi Hamasah International Kairo untuk menginformasikan kegiatan santri binaan secara transparan, akurat, dan berstandar jurnalistik.
          </p>
        </div>
        <div class="article-modal-actions">
          <button type="button" class="btn-share-modal-wa" onclick="shareArticleWA(${article.id})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
            </svg>
            Bagikan Berita Ini ke WhatsApp
          </button>
        </div>
      </div>
    `;
  }

  if (modal) modal.classList.add('open');
}
window.openBacaArtikel = openBacaArtikel;

function shareArticleWA(id) {
  const article = ARTIKEL_DATA.find(a => a.id === id);
  if (!article) return;

  const shareText = encodeURIComponent(
    `*${article.judul}*\n\n` +
    `Tanggal: ${article.tanggal}\n` +
    `Lokasi: ${article.lokasi || 'Kairo, Mesir'}\n` +
    `Kategori: ${article.kategori}\n\n` +
    `"${article.ringkasan}"\n\n` +
    `Baca dokumentasi resmi di Portal Hamasah International: #berita-mesir`
  );
  window.open(`https://api.whatsapp.com/send?text=${shareText}`, '_blank');
}
window.shareArticleWA = shareArticleWA;

// ==========================================================================
// 3. MODALS MANAGEMENT
// ==========================================================================
function initModals() {
  const openPitchBtns = document.querySelectorAll('.open-pitch-btn');
  const modalPitch = document.getElementById('modal-pitch');
  const openKuitansiBtns = document.querySelectorAll('.open-kuitansi-btn');
  const modalKuitansi = document.getElementById('modal-kuitansi');
  const btnOpenTulisArtikel = document.getElementById('btn-open-tulis-artikel');
  const modalTulisArtikel = document.getElementById('modal-tulis-artikel');
  const formTulisArtikel = document.getElementById('form-tulis-artikel');

  openPitchBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (modalPitch) modalPitch.classList.add('open');
    });
  });

  openKuitansiBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof openDocPreview === 'function') {
        openDocPreview('KWT/HI/2026/08492', 'Ahmad Raihan', 'SPP Bulanan', 'Rp 2.500.000', 'Lunas (Tervalidasi)');
      } else if (modalKuitansi) {
        modalKuitansi.classList.add('open');
      }
    });
  });

  if (btnOpenTulisArtikel && modalTulisArtikel) {
    btnOpenTulisArtikel.addEventListener('click', () => {
      modalTulisArtikel.classList.add('open');
      const input = document.getElementById('artikel-input-judul');
      if (input) input.focus();
    });
  }

  const allCloseBtns = document.querySelectorAll('.close-modal-btn, .modal-close-btn');
  allCloseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  if (formTulisArtikel) {
    formTulisArtikel.addEventListener('submit', (e) => {
      e.preventDefault();
      const judul = document.getElementById('artikel-input-judul')?.value.trim();
      const kategori = document.getElementById('artikel-input-kategori')?.value;
      const penulis = document.getElementById('artikel-input-penulis')?.value.trim();
      const ringkasan = document.getElementById('artikel-input-ringkasan')?.value.trim();
      const isiText = document.getElementById('artikel-input-isi')?.value.trim();

      if (!judul || !ringkasan || !isiText) {
        alert('Mohon lengkapi judul, ringkasan, dan isi naskah berita.');
        return;
      }

      const paragraphs = isiText.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('');

      // Match cover image by category for real news portal look
      let coverImg = 'assets/hero-student.jpg';
      if (kategori === 'Talaqqi Kairo') coverImg = 'assets/cairo-arches.jpg';
      else if (kategori === 'Dauroh & Akademik') coverImg = 'assets/subcard-student.jpg';
      else if (kategori === 'Asrama & Komunitas') coverImg = 'assets/cairo-skyline.jpg';

      const newArt = {
        id: Date.now(),
        judul: judul,
        kategori: kategori,
        gambar: coverImg,
        penulis: penulis || 'Pengurus Hamasah',
        rolePenulis: 'Kontributor Berita Asrama',
        avatarPenulis: 'assets/avatar-hamasah.png',
        tanggal: '9 September 2026',
        lokasi: 'Kairo, Mesir',
        waktuBaca: '2 Menit Baca',
        ringkasan: ringkasan,
        isi: paragraphs
      };

      ARTIKEL_DATA.unshift(newArt);
      activeFilter = 'all';

      const filterBtns = document.querySelectorAll('#article-filter-bar .filter-btn-dpai');
      filterBtns.forEach(b => {
        if (b.getAttribute('data-cat') === 'all') b.classList.add('active');
        else b.classList.remove('active');
      });

      renderArticles();
      if (modalTulisArtikel) modalTulisArtikel.classList.remove('open');
      formTulisArtikel.reset();

      alert(`Artikel "${judul}" berhasil diterbitkan pada Kabar Mesir.`);
      const sec = document.getElementById('berita-mesir');
      if (sec) sec.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

// ==========================================================================
// 4. PORTAL OPERASIONAL: ENTERPRISE OPERATIONS DASHBOARD CONTROLLER
// ==========================================================================
function initOperationsDashboard() {
  const filterTabs = document.querySelectorAll('.op-filter-tab');
  const tbody = document.getElementById('op-ledger-tbody');
  const btnGen = document.getElementById('btn-generate-doc');
  const selSantri = document.getElementById('op-select-santri');
  const selType = document.getElementById('op-select-doc-type');
  const genResult = document.getElementById('op-gen-result');

  // Tab Filtering
  if (filterTabs.length && tbody) {
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.getAttribute('data-filter');

        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
          const type = row.getAttribute('data-doc-type');
          if (filter === 'all' || type === filter) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        });
      });
    });
  }

  // Document Generator Simulator
  if (btnGen && selSantri && selType && genResult && tbody) {
    btnGen.addEventListener('click', () => {
      const santri = selSantri.value;
      const docType = selType.value;
      const isKwt = docType.includes('kwt') || docType === 'kuitansi';
      const isSpp = docType.includes('spp') || !docType.includes('iqomah');
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      const docCode = `${isKwt ? 'KWT' : 'INV'}/HI/2026/${randomNum}`;
      const now = new Date();
      const timeStr = `${now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} · ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const nominal = isSpp ? 'Rp 2.500.000' : 'Rp 1.750.000';
      const keterangan = isSpp ? 'SPP Bulanan' : 'Bayar Iqomah';
      const statusLabel = isKwt ? 'Kuitansi Sah (Lunas)' : 'Invoice Terbit (Menunggu)';
      const badgeClass = isKwt ? 'op-badge-pill-success' : 'op-badge-pill-pending';
      const actionText = isKwt ? 'Lihat Kuitansi ↗' : 'Lihat Invoice ↗';

      // Insert new simulated row at top of ledger
      const newTr = document.createElement('tr');
      newTr.setAttribute('data-doc-type', isKwt ? 'kuitansi' : 'invoice');
      newTr.style.background = '#f0fdf4';
      newTr.innerHTML = `
        <td>
          <span class="op-doc-code">${docCode}</span>
          <div style="font-size: 10.5px; color: var(--text-muted);">${timeStr} (Baru)</div>
        </td>
        <td>
          <span class="op-student-name">${escapeHtml(santri)}</span>
          <span class="op-student-sub">Rumah Asrama · Hay Asyir</span>
        </td>
        <td>${keterangan}</td>
        <td><strong style="color: var(--text-main);">${nominal}</strong></td>
        <td><span class="${badgeClass}">${statusLabel}</span></td>
        <td>
          <button class="pill-btn-outline op-view-doc-btn" style="font-size: 11px; padding: 4px 10px;" data-code="${docCode}" data-name="${escapeHtml(santri)}" data-prog="${keterangan}" data-nom="${nominal}" data-status="${statusLabel}">${actionText}</button>
        </td>
      `;

      tbody.insertBefore(newTr, tbody.firstChild);

      // Re-attach view handler for the new button
      attachViewDocBtn(newTr.querySelector('.op-view-doc-btn'));

      // Fade highlight after 1.5s
      setTimeout(() => {
        newTr.style.transition = 'background 0.8s ease';
        newTr.style.background = '';
      }, 1500);

      // Update generator output box
      genResult.innerHTML = `
        <strong style="color: var(--accent-emerald);">Dokumen Berhasil Diterbitkan:</strong><br>
        Nomor Dokumen: <code style="font-weight: 600;">${docCode}</code><br>
        Santri: <strong>${escapeHtml(santri)}</strong> (${keterangan} · ${nominal})<br>
        <span style="font-size: 11px; color: var(--text-muted);">Dokumen digital otomatis terenkripsi dan terkirim ke WhatsApp Wali Santri.</span>
      `;
    });
  }

  // Bind view doc buttons
  document.querySelectorAll('.op-view-doc-btn').forEach(btn => {
    attachViewDocBtn(btn);
  });
}

function attachViewDocBtn(btn) {
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const code = btn.getAttribute('data-code') || 'KWT/HI/2026/08492';
    const name = btn.getAttribute('data-name') || 'Santri Hamasah';
    const prog = btn.getAttribute('data-prog') || 'SPP Bulanan';
    const nom = btn.getAttribute('data-nom') || 'Rp 2.500.000';
    const status = btn.getAttribute('data-status') || 'Lunas (Tervalidasi)';

    openDocPreview(code, name, prog, nom, status);
  });
}

function openDocPreview(code, name, prog, nom, status) {
  const modal = document.getElementById('modal-kuitansi');
  if (!modal) return;

  const isKwt = code.startsWith('KWT');
  const isSpp = (prog && prog.toLowerCase().includes('spp')) || (nom && nom.includes('2.500.000'));
  
  // Elements in the reference invoice sheet
  const titleEl = document.getElementById('kwt-ref-main-title');
  const subEl = document.getElementById('kwt-ref-main-sub');
  const studentNameEl = document.getElementById('kwt-ref-student-name');
  const studentSubEl = document.getElementById('kwt-ref-student-sub');
  const studentInstEl = document.getElementById('kwt-ref-student-inst');
  const studentEmailEl = document.getElementById('kwt-ref-student-email');
  const docLabelEl = document.getElementById('kwt-ref-doc-label');
  const docCodeEl = document.getElementById('kwt-ref-doc-code');
  const dateEl = document.getElementById('kwt-ref-date');
  const statusEl = document.getElementById('kwt-ref-status');
  const tbodyEl = document.getElementById('kwt-ref-table-tbody');
  const subtotalValEl = document.getElementById('kwt-ref-subtotal-val');
  const sumSubtotalEl = document.getElementById('kwt-ref-sum-subtotal');
  const totalLabelEl = document.getElementById('kwt-ref-total-label');
  const sumTotalEl = document.getElementById('kwt-ref-sum-total');

  // Format Header as in reference image
  if (titleEl) titleEl.innerText = isKwt ? 'KUITANSI' : 'INVOICE';
  if (subEl) subEl.innerText = isKwt ? 'BUKTI RESMI TRANSAKSI SAH · HAMASAH INTERNATIONAL KAIRO' : 'TAGIHAN RESMI ADMINISTRASI · HAMASAH INTERNATIONAL KAIRO';
  if (docLabelEl) docLabelEl.innerText = isKwt ? 'KUITANSI NO:' : 'INVOICE NO:';

  // Format Student Identity
  const safeName = name || 'Ahmad Raihan';
  if (studentNameEl) studentNameEl.innerText = safeName;
  
  // Map placement based on student
  let placement = 'Rumah 1 · Hay Asyir, Kairo, Mesir';
  let guardian = 'Wali: Bpk. Hendra Kusuma & Ibu Siti Aminah';
  let emailSlug = 'raihan';

  if (safeName.toLowerCase().includes('fatih')) {
    placement = 'Rumah 2 · Hay Asyir, Kairo, Mesir';
    guardian = 'Wali: Bpk. Ridwan Hakim & Ibu Nurul Hidayah';
    emailSlug = 'fatih';
  } else if (safeName.toLowerCase().includes('zaid')) {
    placement = 'Rumah 1 · Hay Asyir, Kairo, Mesir';
    guardian = 'Wali: Bpk. Mansyur Abdillah & Ibu Maryam';
    emailSlug = 'zaid';
  } else if (safeName.toLowerCase().includes('farhan')) {
    placement = 'Rumah 2 · Hay Asyir, Kairo, Mesir';
    guardian = 'Wali: Bpk. Umar Al-Ghifari';
    emailSlug = 'farhan';
  }

  if (studentSubEl) studentSubEl.innerText = guardian;
  if (studentInstEl) studentInstEl.innerText = `Hamasah International · ${placement}`;
  if (studentEmailEl) studentEmailEl.innerText = `${emailSlug}.hamasah@student.alazhar.edu.eg`;

  // Doc code & date
  if (docCodeEl) {
    const numOnly = code ? code.replace(/[^0-9]/g, '') : '08492';
    docCodeEl.innerText = `#${numOnly || '08492'}`;
  }
  if (dateEl) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    dateEl.innerText = `${day}.${month}.${year}`;
  }

  // Status tag
  if (statusEl) {
    const isPaid = isKwt || (status && status.toLowerCase().includes('lunas'));
    statusEl.innerHTML = isPaid 
      ? '<span class="invoice-ref-badge-lunas">LUNAS SAH</span>'
      : '<span class="invoice-ref-badge-pending">MENUNGGU PEMBAYARAN</span>';
  }

  // Dynamic Table Items matching reference format
  if (tbodyEl) {
    if (isSpp) {
      tbodyEl.innerHTML = `
        <tr>
          <td class="td-desc">Akomodasi & Fasilitas Rumah Asrama (Kamar Ber-AC, Air Bersih, Listrik)</td>
          <td class="td-price">Rp 1.200.000</td>
          <td class="td-qty">1</td>
          <td class="td-total">Rp 1.200.000</td>
        </tr>
        <tr>
          <td class="td-desc">Katering Makanan Halal Nusantara 3x Sehari (Gizi & Higienitas Terpantau)</td>
          <td class="td-price">Rp 800.000</td>
          <td class="td-qty">1</td>
          <td class="td-total">Rp 800.000</td>
        </tr>
        <tr>
          <td class="td-desc">Bimbingan Musyrif Asrama & Pendampingan Majelis Talaqqi Al-Azhar</td>
          <td class="td-price">Rp 350.000</td>
          <td class="td-qty">1</td>
          <td class="td-total">Rp 350.000</td>
        </tr>
        <tr>
          <td class="td-desc">Kas Pemeliharaan Fasilitas Belajar Mandiri & Operasional Rumah</td>
          <td class="td-price">Rp 150.000</td>
          <td class="td-qty">1</td>
          <td class="td-total">Rp 150.000</td>
        </tr>
      `;
    } else {
      // Bayar Iqomah
      tbodyEl.innerHTML = `
        <tr>
          <td class="td-desc">Pemberkasan Paspor & Surat Keterangan Pelajar KBRI Kairo</td>
          <td class="td-price">Rp 500.000</td>
          <td class="td-qty">1</td>
          <td class="td-total">Rp 500.000</td>
        </tr>
        <tr>
          <td class="td-desc">Biaya Penerbitan Visa Pelajar Mesir 1 Tahun (Jawazat Kairo)</td>
          <td class="td-price">Rp 850.000</td>
          <td class="td-qty">1</td>
          <td class="td-total">Rp 850.000</td>
        </tr>
        <tr>
          <td class="td-desc">Legalisasi Keimigrasian & Administrasi Resmi Pelajar Asing Mesir</td>
          <td class="td-price">Rp 400.000</td>
          <td class="td-qty">1</td>
          <td class="td-total">Rp 400.000</td>
        </tr>
      `;
    }
  }

  // Subtotals & totals
  const displayNom = nom || (isSpp ? 'Rp 2.500.000' : 'Rp 1.750.000');
  if (subtotalValEl) subtotalValEl.innerText = displayNom;
  if (sumSubtotalEl) sumSubtotalEl.innerText = displayNom;
  if (sumTotalEl) sumTotalEl.innerText = displayNom;
  if (totalLabelEl) totalLabelEl.innerText = isKwt ? 'Total Dibayar' : 'Amount due';

  modal.classList.add('open');
}
window.openDocPreview = openDocPreview;

// ==========================================================================
// 5. DASHBOARD REKAMAN BELAJAR & LAPORAN SANTRI CONTROLLER
// ==========================================================================
const SANTRI_PROFILES = {
  'raihan': {
    name: 'Ahmad Raihan',
    status: 'Santri Aktif (Tahun ke-1)',
    meta: 'Asrama Hay Asyir, Rumah 1 · Bergabung: Juli 2026 · Muadalah Al-Azhar Kairo',
    target: 'Juli 2030 (S1 Syari\'ah Al-Azhar)',
    avatar: 'assets/avatar-hamasah.png',
    statProg: '85% Selesai',
    statPresensi: '98.4% Hadir',
    statAchieve: '4 Sertifikat',
    statDisiplin: '0 Pelanggaran',
    evalText: '"Ahmad Raihan menunjukkan integritas dan kemandirian belajar yang luar biasa selama menetap di asrama Kairo. Santun kepada masyayikh talaqqi, aktif membantu rekan asrama, dan taat pada mutaba\'ah ibadah. Rekam jejak sejak awal bergabung di Dauroh Ta\'hili menunjukkan progresivitas yang konsisten. Sangat direkomendasikan untuk bimbingan tingkat lanjut menuju perkuliahan reguler Al-Azhar."',
    evaluatorName: 'Ustaz Ahmad Fauzi, Lc.',
    evaluatorRole: 'Musyrif Pembina Asrama & Pengawas Akademik Kairo',
    evaluatorPhoto: 'assets/avatar-hamasah.png'
  },
  'fatih': {
    name: 'Muhammad Fatih',
    status: 'Santri Aktif (Tahun ke-1)',
    meta: 'Asrama Hay Asyir, Rumah 2 · Bergabung: Juli 2026 · Muadalah Al-Azhar Kairo',
    target: 'Juli 2030 (S1 Ushuluddin Al-Azhar)',
    avatar: 'assets/avatar-hamasah.png',
    statProg: '78% Selesai',
    statPresensi: '96.5% Hadir',
    statAchieve: '3 Sertifikat',
    statDisiplin: '0 Pelanggaran',
    evalText: '"Muhammad Fatih memiliki ketahanan hafalan Al-Qur\'an yang sangat kokoh dan konsisten tasmi\' ba\'da Subuh. Perlu pendalaman tambahan pada balaghah bahasa Arab tingkat menengah. Secara adab bermasyarakat dan kebersihan rumah asrama sangat baik."',
    evaluatorName: 'Ustaz Rahmat Hidayat, Lc.',
    evaluatorRole: 'Pembina Halaqah Tahfidz & Pengawas Asrama Kairo',
    evaluatorPhoto: 'assets/avatar-hamasah.png'
  },
  'zaid': {
    name: 'Zaid Abdillah',
    status: 'Santri Aktif (Tahun ke-1)',
    meta: 'Asrama Hay Asyir, Rumah 1 · Bergabung: Juli 2026 · Muadalah Al-Azhar Kairo',
    target: 'Juli 2030 (S1 Bahasa Arab Al-Azhar)',
    avatar: 'assets/avatar-hamasah.png',
    statProg: '82% Selesai',
    statPresensi: '97.8% Hadir',
    statAchieve: '3 Sertifikat',
    statDisiplin: '0 Pelanggaran',
    evalText: '"Zaid Abdillah sangat aktif dalam majelis talaqqi kitab nahwu Al-Ajurrumiyyah dan menunjukkan antusiasme tinggi saat mudzakarah malam. Kehadiran sholat berjamaah di asrama sangat disiplin tanpa ada catatan pelanggaran."',
    evaluatorName: 'Ustaz Ahmad Fauzi, Lc.',
    evaluatorRole: 'Musyrif Pembina Asrama & Pengawas Akademik Kairo',
    evaluatorPhoto: 'assets/avatar-hamasah.png'
  }
};

const SANTRI_ACTIVITIES = {
  'today': [
    { time: '04:30 - 06:00', title: 'Sholat Subuh Berjamaah & Halaqah Dzikir Pagi', status: 'Terlaksana Tepat Waktu', notes: 'Santri hadir di shaf pertama masjid asrama, melantunkan dzikir Al-Ma\'tsurat dan menyimak tasmi\' hafalan Al-Qur\'an 1 juz.', loc: 'Masjid Asrama Hay Asyir, Kairo' },
    { time: '08:30 - 12:00', title: 'Kelas Bahasa Arab & Muadalah Markaz Lughoh', status: 'Hadir & Aktif', notes: 'Sesi dialog percakapan fushah dan telaah balaghah Arab bersama dosen penutur asli Al-Azhar.', loc: 'Markaz Lughoh Al-Azhar, Nasr City' },
    { time: '13:30 - 15:00', title: 'Makan Siang Bersama & Istirahat Qailulah', status: 'Tercatat di Asrama', notes: 'Pemenuhan asupan gizi harian santri melalui katering asrama terpantau lancar dan higienis.', loc: 'Ruang Makan Asrama Hay Asyir' },
    { time: '16:30 - 18:30', title: 'Majelis Talaqqi Kitab Turats bersama Masyayikh Al-Azhar', status: 'Hadir di Majelis', notes: 'Menyimak pembacaan matan Fathul Qorib pasal Thaharah dan mencatat faidah syarah langsung dari ulama Al-Azhar.', loc: 'Rawaq Al-Jami\' Al-Azhar, Kairo Lama' },
    { time: '20:00 - 21:30', title: 'Mudzakarah Mandiri & Mutaba\'ah Adab Musyrif', status: 'Tervalidasi Musyrif', notes: 'Mengulang hafalan kaidah fiqh bersama teman serumah dan menyetorkan kartu mutaba\'ah adab harian kepada pembina asrama.', loc: 'Ruang Belajar Lantai 2, Asrama Hay Asyir' }
  ],
  'yesterday': [
    { time: '04:30 - 06:00', title: 'Sholat Subuh Berjamaah & Tasmi\' Mandiri', status: 'Terlaksana Tepat Waktu', notes: 'Menyetorkan hafalan lanjutan juz ke-7 kepada musyrif asrama dengan kelancaran mumtaz.', loc: 'Masjid Asrama Hay Asyir, Kairo' },
    { time: '09:00 - 12:30', title: 'Simulasi Latihan Soal Ujian Muadalah', status: 'Selesai (Skor 92)', notes: 'Mengerjakan try-out soal terpadu materi tauhid, hadits, dan ushul fiqh Al-Azhar.', loc: 'Laboratorium Komputer Asrama Kairo' },
    { time: '16:30 - 18:30', title: 'Kajian I\'rob Matan Al-Ajurrumiyyah', status: 'Hadir Penuh', notes: 'Praktik langsung membedah tarkib susunan kalimat bahasa Arab klasik bersama ustaz pembina.', loc: 'Aula Asrama Hay Asyir' },
    { time: '20:00 - 21:00', title: 'Evaluasi Pekanan Adab & Kebersihan Rumah Asrama', status: 'Predikat A (Sangat Bersih)', notes: 'Inspeksi berkala kerapian rumah asrama santri nomor 1 oleh pengawas asrama.', loc: 'Asrama 1, Hay Asyir' }
  ],
  'rekap': [
    { time: 'Pekan I Sep', title: 'Rekap Presensi Sholat Subuh: 100% (7/7 Hari)', status: 'Predikat Mumtaz', notes: 'Kehadiran sempurna tanpa masbuq selama satu pekan penuh di masjid asrama.', loc: 'Masjid Asrama Hay Asyir' },
    { time: 'Pekan I Sep', title: 'Target Setoran Hafalan Kitab: 3 Bab Tuntas', status: 'Lulus Uji Simak', notes: 'Khatam pasal fardhu wudhu dan hal-hal yang membatalkan wudhu pada matan Fathul Qorib.', loc: 'Halaqah Asrama Kairo' },
    { time: 'Pekan I Sep', title: 'Ujian Pekanan Bahasa Arab Mustawa 2: Nilai 94', status: 'Lulus Ujian', notes: 'Memperoleh peringkat 3 terbaik di kelas persiapan Markaz Lughoh Al-Azhar.', loc: 'Markaz Lughoh Al-Azhar' }
  ]
};

function initSantriRecordDashboard() {
  const selector = document.getElementById('santri-selector');
  const tabs = document.querySelectorAll('.santri-nav-tab');
  const panels = document.querySelectorAll('.santri-tab-panel');
  const actTabs = document.querySelectorAll('.santri-activity-tab');
  const actContainer = document.getElementById('santri-activity-items-list');
  const btnSaveEval = document.getElementById('btn-save-eval');
  const inputEval = document.getElementById('input-new-eval');
  const evalTextEl = document.getElementById('santri-eval-text');
  const btnSwitchLms = document.getElementById('btn-switch-lms');
  const btnSwitchRecords = document.getElementById('btn-switch-records');

  // Campus Demo View Switcher
  if (btnSwitchLms && btnSwitchRecords) {
    btnSwitchLms.addEventListener('click', () => {
      btnSwitchLms.classList.add('active');
      btnSwitchRecords.classList.remove('active');
      const target = document.getElementById('campus-lms-view');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    btnSwitchRecords.addEventListener('click', () => {
      btnSwitchRecords.classList.add('active');
      btnSwitchLms.classList.remove('active');
      const target = document.getElementById('campus-records-view');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Tab switching in Santri Dashboard
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      const panel = document.getElementById(`santri-panel-${tabId}`);
      if (panel) panel.classList.add('active');
    });
  });

  // Student selector dropdown
  if (selector) {
    selector.addEventListener('change', () => {
      const key = selector.value;
      const data = SANTRI_PROFILES[key];
      if (!data) return;

      const nameEl = document.getElementById('santri-display-name');
      const statusEl = document.getElementById('santri-display-status');
      const metaEl = document.getElementById('santri-display-meta');
      const targetEl = document.getElementById('santri-display-target');
      const avatarEl = document.getElementById('santri-avatar');
      const progEl = document.getElementById('santri-stat-prog');
      const presensiEl = document.getElementById('santri-stat-presensi');
      const achieveEl = document.getElementById('santri-stat-achieve');
      const disiplinEl = document.getElementById('santri-stat-disiplin');
      const evalText = document.getElementById('santri-eval-text');
      const evalName = document.getElementById('santri-evaluator-name');
      const evalRole = document.getElementById('santri-evaluator-role');
      const evalPhoto = document.getElementById('santri-evaluator-photo');

      if (nameEl) nameEl.innerText = data.name;
      if (statusEl) statusEl.innerText = data.status;
      if (metaEl) metaEl.innerText = data.meta;
      if (targetEl) targetEl.innerText = data.target;
      if (avatarEl) avatarEl.src = data.avatar;
      if (progEl) progEl.innerText = data.statProg;
      if (presensiEl) presensiEl.innerText = data.statPresensi;
      if (achieveEl) achieveEl.innerText = data.statAchieve;
      if (disiplinEl) disiplinEl.innerText = data.statDisiplin;
      if (evalText) evalText.innerText = data.evalText;
      if (evalName) evalName.innerText = data.evaluatorName;
      if (evalRole) evalRole.innerText = data.evaluatorRole;
      if (evalPhoto) evalPhoto.src = data.evaluatorPhoto;
    });
  }

  // Day filter in activity log
  if (actTabs.length && actContainer) {
    actTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        actTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const dayKey = btn.getAttribute('data-filter-act') || 'today';
        renderActivities(dayKey);
      });
    });
  }

  function renderActivities(dayKey) {
    if (!actContainer) return;
    const list = SANTRI_ACTIVITIES[dayKey] || SANTRI_ACTIVITIES['today'];
    actContainer.innerHTML = list.map(item => `
      <div class="santri-activity-item">
        <span class="santri-activity-time">${escapeHtml(item.time)}</span>
        <div class="santri-activity-body">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <h5 class="santri-activity-title">${escapeHtml(item.title)}</h5>
            <span class="op-badge-pill-success">${escapeHtml(item.status)}</span>
          </div>
          <p class="santri-activity-notes">${escapeHtml(item.notes)}</p>
          <span class="santri-activity-loc">Lokasi: ${escapeHtml(item.loc)}</span>
        </div>
      </div>
    `).join('');
  }

  // Interactive Note Addition Simulator
  if (btnSaveEval && inputEval && evalTextEl) {
    btnSaveEval.addEventListener('click', () => {
      const val = inputEval.value.trim();
      if (!val) {
        alert('Mohon ketik catatan evaluasi terlebih dahulu.');
        return;
      }
      evalTextEl.innerText = `"${val}"`;
      inputEval.value = '';
      alert('Catatan evaluasi pengawas berhasil diperbarui dan tersinkron ke dashboard rekam jejak santri.');
    });
  }
}
window.switchCampusView = function(view) {
  const targetId = view === 'lms' ? 'campus-lms-view' : 'campus-records-view';
  const target = document.getElementById(targetId);
  const btnLms = document.getElementById('btn-switch-lms');
  const btnRecords = document.getElementById('btn-switch-records');

  if (view === 'lms') {
    if (btnLms) btnLms.classList.add('active');
    if (btnRecords) btnRecords.classList.remove('active');
  } else {
    if (btnRecords) btnRecords.classList.add('active');
    if (btnLms) btnLms.classList.remove('active');
  }

  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Helpers
function appendBubble(container, text, sender) {
  if (!container) return;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble-dpai bubble-${sender}-dpai`;
  bubble.innerHTML = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}


// ==========================================================================
// 6. PORTAL KELUARGA: DASHBOARD PROFIL WALI SANTRI CONTROLLER
// ==========================================================================
function initFamilyDashboard() {
  const tabBtns = document.querySelectorAll('.family-tab-btn');
  const panels = {
    'rapor': document.getElementById('family-tab-panel-rapor'),
    'kabar': document.getElementById('family-tab-panel-kabar'),
    'kegiatan': document.getElementById('family-tab-panel-kegiatan'),
    'galeri': document.getElementById('family-tab-panel-galeri'),
    'kuitansi': document.getElementById('family-tab-panel-kuitansi')
  };

  // Tab Switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-family-tab');
      Object.keys(panels).forEach(key => {
        if (panels[key]) {
          if (key === targetTab) {
            panels[key].classList.add('active');
          } else {
            panels[key].classList.remove('active');
          }
        }
      });
    });
  });

  // Modal Rapor Digital Berkala
  const modalRapor = document.getElementById('modal-rapor-digital');
  const openRaporBtns = document.querySelectorAll('.btn-open-rapor');
  const closeRaporBtn = document.getElementById('btn-close-modal-rapor');

  openRaporBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (modalRapor) modalRapor.classList.add('open');
    });
  });

  if (closeRaporBtn && modalRapor) {
    closeRaporBtn.addEventListener('click', () => {
      modalRapor.classList.remove('open');
    });
  }

  // Period Selector Simulator
  const periodSelect = document.getElementById('family-period-select');
  if (periodSelect) {
    periodSelect.addEventListener('change', () => {
      const val = periodSelect.options[periodSelect.selectedIndex].text;
      const evalLabel = document.querySelector('.rapor-eval-label');
      if (evalLabel) {
        evalLabel.innerText = `RAPOR PERKEMBANGAN BERKALA · PERIODE ${val.toUpperCase()}`;
      }
    });
  }

  // Interactive Doa & Kasih Sayang Sender
  const inputDoa = document.getElementById('family-input-doa');
  const btnKirimDoa = document.getElementById('btn-kirim-doa');
  const statusDoa = document.getElementById('family-doa-status');

  if (btnKirimDoa && inputDoa && statusDoa) {
    btnKirimDoa.addEventListener('click', () => {
      const text = inputDoa.value.trim();
      if (!text) {
        alert('Mohon tuliskan pesan doa atau kalimat penyemangat untuk ananda terlebih dahulu.');
        return;
      }
      statusDoa.style.display = 'block';
      statusDoa.innerText = 'Pesan doa Bapak & Ibu telah tersimpan dan akan disampaikan langsung oleh Musyrif saat halaqah malam di Asrama 1 Hay Asyir.';
      inputDoa.value = '';

      setTimeout(() => {
        statusDoa.style.display = 'none';
      }, 5000);
    });
  }

  // Re-bind view doc buttons inside family kuitansi tab
  const kuitansiPanel = document.getElementById('family-tab-panel-kuitansi');
  if (kuitansiPanel) {
    kuitansiPanel.querySelectorAll('.op-view-doc-btn').forEach(btn => {
      if (typeof attachViewDocBtn === 'function') {
        attachViewDocBtn(btn);
      }
    });
  }
}


// ==========================================================================
// 7. ROLE-BASED ECOSYSTEM ARCHITECTURE CONTROLLER
// ==========================================================================
function initRoleEcosystemDiagram() {
  // Simplified ecosystem role cards interaction
  const roleCards = document.querySelectorAll('.simple-role-subcard');
  roleCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#e7b10c';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '';
    });
  });
}


// ==========================================================================
// 8. ROADMAP TIMELINE INTERACTIVE CONTROLLER
// ==========================================================================
function initRoadmapTimeline() {
  const stepItems = document.querySelectorAll('.roadmap-step-item');
  const phaseCards = document.querySelectorAll('.roadmap-phase-card');

  if (!stepItems.length) return;

  stepItems.forEach(step => {
    step.addEventListener('click', () => {
      stepItems.forEach(s => s.classList.remove('active'));
      step.classList.add('active');

      const targetPhase = step.getAttribute('data-phase-target');
      phaseCards.forEach(card => card.classList.remove('highlight'));

      const matchedCard = document.getElementById(`card-phase-${targetPhase}`);
      if (matchedCard) {
        matchedCard.classList.add('highlight');
        matchedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });
}

// ===========================================================================
// 8A. PHASE 1 UI REVIEW WORKSPACE
// ===========================================================================
function initPhaseOneWorkspace() {
  const buttons = document.querySelectorAll('[data-ui-review-state]');
  const result = document.getElementById('ui-review-state');
  if (!buttons.length || !result) return;

  const states = {
    main: {
      title: 'Alur utama',
      message: 'Pengguna memahami isi layar, melihat tindakan prioritas, lalu dapat melanjutkan tanpa harus menebak langkah berikutnya.'
    },
    loading: {
      title: 'Sedang dimuat',
      message: 'Beritahu pengguna bagian apa yang sedang diproses. Jangan tampilkan halaman kosong atau tombol yang terlihat siap dipakai.'
    },
    empty: {
      title: 'Belum ada data',
      message: 'Jelaskan kenapa belum ada isi dan beri satu tindakan yang bisa mengisi halaman, misalnya menambahkan laporan atau memilih periode lain.'
    },
    restricted: {
      title: 'Akses dibatasi',
      message: 'Terangkan bahwa data ini membutuhkan akun atau peran tertentu, lalu arahkan pengguna kembali ke halaman yang masih dapat ia akses.'
    },
    invalid: {
      title: 'Data tidak valid',
      message: 'Tandai field yang perlu diperbaiki, jelaskan alasannya dengan kalimat singkat, dan pertahankan isian pengguna yang sudah benar.'
    }
  };

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const state = states[button.dataset.uiReviewState];
      if (!state) return;

      buttons.forEach(item => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });

      result.innerHTML = `<strong>${state.title}</strong><p>${state.message}</p>`;
    });
  });
}


// ===========================================================================
// 9. ASISTEN AI HAMASAH (PUBLIK) - TANYA-JAWAB CALON SANTRI & WALI
// ==========================================================================
const HAMASAH_AI_KB = [
  {
    keys: ['biaya', 'spp', 'bayar', 'uang', 'mahal', 'iuran', 'dana', 'tarif'],
    answer: `<strong>Perkiraan biaya (simulasi):</strong><br>
      - SPP bimbingan Hamasah: sekitar <strong>Rp2.500.000/bulan</strong>, sudah termasuk asrama ber-AC di Asrama 1 Hay Asyir, katering harian, dan bimbingan talaqqi.<br>
      - Biaya sekali di awal: pendaftaran, pengurusan visa pelajar, dan tiket keberangkatan.<br>
      - Kuliah di Al-Azhar sendiri bebas biaya SPP bagi mahasiswa internasional yang memenuhi persyaratan dokumen.<br><br>
      Rincian resmi dan simulasi lengkap ada di brosur digital pada bagian <em>Layanan Publik</em>.`
  },
  {
    keys: ['syarat', 'daftar', 'pendaftaran', 'dokumen', 'berkas', 'ijazah', 'lulusan', 'sma', 'aliyah', 'umur', 'usia'],
    answer: `<strong>Syarat pendaftaran (ringkas):</strong><br>
      - Lulusan SMA/MA/pesantren sederajat, usia idealnya di bawah 20 tahun.<br>
      - Ijazah + transkrip nilai, akta lahir, KK, dan paspor (boleh menyusul).<br>
      - Bisa membaca Al-Qur'an dengan tartil dan punya dasar bahasa Arab.<br>
      - Mengisi formulir online di menu <em>Layanan Publik</em>, lalu berkas divalidasi tim konsultan lewat WhatsApp.<br><br>
      Setelah berkas lengkap, kamu otomatis dapat akun untuk memantau progres persiapan keberangkatan.`
  },
  {
    keys: ['jadwal', 'keberangkatan', 'berangkat', 'terbang', 'kapan', 'gelombang', 'pengumuman', 'wawancara', 'tahdid', 'dokumen', 'pasti'],
    answer: `<strong>Alur 4 Tahap Menuju Kairo (Pasti Berangkat):</strong><br>
      1. Registrasi online & verifikasi berkas awal.<br>
      2. Validasi dokumen resmi (ijazah, terjemahan, paspor) & pemantapan bahasa <em>tahdid mustawa</em>.<br>
      3. Penerbitan visa pelajar & pemesanan tiket penerbangan rombongan.<br>
      4. Terbang bersama ke Kairo & penjemputan resmi ke asrama Hay Asyir.<br><br>
      Setiap santri dapat memantau estimasi tanggal terbang dan kelengkapan berkas lewat akun keberangkatan masing-masing. Contoh simulasi: rombongan kloter 1 terbang 15 September 2026.`
  },
  {
    keys: ['kairo', 'mesir', 'hidup', 'tinggal', 'asrama', 'makan', 'keseharian', 'sehari-hari', 'cuaca', 'aman', 'lingkungan'],
    answer: `<strong>Keseharian santri di Kairo (simulasi):</strong><br>
      - Tinggal di asrama Hamasah, kawasan Hay Asyir, kamar ber-AC dan katering 3x sehari.<br>
      - Ritme harian: Subuh berjamaah, Markaz Lughoh (bahasa), talaqqi di Rawaq Al-Azhar, lalu mudzakarah malam.<br>
      - Didampingi musyrif asrama yang memantau adab, ibadah, dan adaptasi santri baru.<br><br>
      Kegiatan hariannya bisa dilihat orang tua lewat <em>Portal Keluarga</em>.`
  },
  {
    keys: ['pantau', 'memantau', 'orang tua', 'wali', 'monitor', 'rapor', 'kabar', 'laporan', 'transparan', 'kuitansi'],
    answer: `<strong>Cara orang tua memantau (Portal Keluarga):</strong><br>
      - Lihat presensi sholat berjamaah, hafalan Qur'an, dan catatan kesehatan anak.<br>
      - Terima rapor akademik Al-Azhar berkala plus catatan adab dari musyrif.<br>
      - Unduh kuitansi SPP resmi ber-stempel format PDF.<br>
      - Lihat foto dan kabar kegiatan harian santri di Kairo.<br><br>
      Semua diakses lewat satu login pribadi, jadi data tiap santri hanya terlihat oleh keluarganya.`
  },
  {
    keys: ['kurikulum', 'belajar', 'talaqqi', 'pelajaran', 'kelas online', 'lms', 'video', 'materi', 'kajian', 'kitab'],
    answer: `<strong>Belajar di Hamasah (Portal Akademik):</strong><br>
      - Kelas online berisi video talaqqi kitab klasik (mis. Fathul Qorib) bersama masyayikh Al-Azhar.<br>
      - Ada modul kitab PDF, rangkuman materi, dan silabus kurikulum terstruktur.<br>
      - <strong>AI Study Partner</strong> siap 24 jam untuk menjelaskan istilah sulit dan merangkum isi video.<br><br>
      Targetnya membina santri dari Dauroh Ta'hili sampai wisuda sarjana Al-Azhar.`
  },
  {
    keys: ['jurusan', 'fakultas', 'prodi', 'kuliah apa', 'ushuluddin', 'syariah'],
    answer: `<strong>Pilihan studi di Al-Azhar (simulasi):</strong><br>
      Santri Hamasah umumnya masuk fakultas keislaman seperti Ushuluddin, Syariah, Bahasa Arab, atau Dirasat Islamiyah.<br>
      Pemilihan jurusan dibimbing sesuai hasil <em>tahdid mustawa</em> dan minat santri, lalu didampingi sampai pendaftaran resmi ke Al-Azhar.`
  },
  {
    keys: ['beasiswa', 'gratis', 'keringanan', 'cicil', 'angsur', 'subsidi'],
    answer: `<strong>Biaya kuliah & keringanan (simulasi):</strong><br>
      Kuliah S1 di Al-Azhar bebas biaya kuliah bagi mahasiswa asing. Untuk biaya bimbingan dan fasilitas asrama Hamasah, ada opsi cicilan dan keringanan bagi keluarga yang membutuhkan, dinilai kasus per kasus oleh pengurus.<br><br>
      Silakan bicara langsung dengan admin untuk skema yang cocok.`
  },
  {
    keys: ['berapa lama', 'durasi', 'lama studi', 'lama kuliah', 'wisuda', 'lulus kuliah', 'tahun kuliah'],
    answer: `<strong>Lama studi (simulasi):</strong><br>
      - Persiapan bahasa & adaptasi (Dauroh Ta'hili): kurang lebih 1 tahun.<br>
      - S1 Al-Azhar: sekitar 4-5 tahun tergantung fakultas.<br>
      Hamasah mendampingi santri di sepanjang jalur ini, termasuk urusan visa dan akademik.`
  },
  {
    keys: ['lokasi', 'alamat', 'kantor', 'kontak', 'hubungi', 'whatsapp', 'wa ', 'telepon', 'narahubung', 'admin'],
    answer: `<strong>Kontak Hamasah International:</strong><br>
      Untuk pertanyaan lebih detail atau bicara langsung dengan tim konsultan, gunakan tombol <em>Diskusikan</em> di atas atau hubungi admin resmi lewat WhatsApp yang tertera di menu Layanan Publik.<br><br>
      Asrama santri berada di kawasan Hay Asyir, Kairo, Mesir.`
  },
  {
    keys: ['lama pengerjaan', 'waktu pengerjaan', 'estimasi pengerjaan', 'berapa lama bikin', 'durasi pengerjaan', 'jadwal pengerjaan', 'roadmap pengerjaan', '1 bulan'],
    answer: `<strong>Estimasi Pengerjaan Website (Dar Developer):</strong><br>
      Total estimasi pengerjaan adalah <strong>1 bulan (4 pekan kerja intensif / 30 hari)</strong> terbagi dalam 5 tahap sprint terukur:<br>
      - <strong>Pekan 1 (Hari 1 - 7):</strong> Layanan 1 Publik & Sistem Registrasi Keberangkatan.<br>
      - <strong>Pekan 2 (Hari 8 - 14):</strong> Layanan 2 Portal Operasional Staff & Auto Invoice/Kuitansi PDF.<br>
      - <strong>Pekan 3 (Hari 15 - 21):</strong> Layanan 2 Portal Keluarga Wali Santri & Rapor Digital.<br>
      - <strong>Pekan 4 Awal (Hari 22 - 26):</strong> Layanan 2 Portal Akademik Talaqqi Turats & LMS.<br>
      - <strong>Pekan 4 Akhir (Hari 27 - 30):</strong> Integrasi Single SSO, Enkripsi, Uji Stabilitas & Go-Live.`
  }
];

const HAMASAH_AI_FALLBACK = `Pertanyaan bagus. Untuk hal spesifik seperti ini, jawaban paling akurat datang langsung dari tim konsultan Hamasah.<br><br>
  Sementara itu, kamu bisa jelajahi menu <em>Layanan Publik</em> untuk brosur & alur pendaftaran, atau klik tombol <strong>Diskusikan Bersama Dar Dev</strong> di atas. Pada versi live, saya akan langsung menyambungkanmu ke admin WhatsApp resmi.`;

function answerHamasahAi(text, style) {
  const lower = text.toLowerCase();
  let base = HAMASAH_AI_FALLBACK;
  for (const item of HAMASAH_AI_KB) {
    if (item.keys.some(k => lower.includes(k))) { base = item.answer; break; }
  }
  if (style === 'Ringkas') {
    const firstBlock = base.split('<br><br>')[0];
    return firstBlock + '<br><br><em>Butuh rincian lengkap? Ganti gaya jawaban ke "Detail".</em>';
  }
  if (style === 'Detail') {
    return base + '<br><br>Kalau mau, saya bisa bantu susun langkah selanjutnya sesuai kondisi kamu. Sebutkan saja detailnya.';
  }
  return base;
}

function initHamasahAiAssistant() {
  const studio = document.getElementById('hamasah-ai-studio');
  const body = document.getElementById('hamasah-ai-body');
  const input = document.getElementById('hamasah-ai-input');
  const form = document.getElementById('hamasah-ai-form');
  const examples = document.getElementById('hamasah-ai-suggest');
  if (!studio || !body || !input || !form) return;

  // Time-based greeting
  const greetEl = document.getElementById('ai-greeting-time');
  if (greetEl) {
    const h = new Date().getHours();
    greetEl.textContent =
      h < 11 ? 'Selamat Pagi' :
      h < 15 ? 'Selamat Siang' :
      h < 19 ? 'Selamat Sore' : 'Selamat Malam';
  }

  // Answer style dropdown
  let answerStyle = 'Ramah';
  const styleBtn = document.getElementById('ai-style-btn');
  const styleMenu = document.getElementById('ai-style-menu');
  const styleCurrent = document.getElementById('ai-style-current');
  if (styleBtn && styleMenu) {
    styleBtn.addEventListener('click', () => {
      styleMenu.hidden = !styleMenu.hidden;
      styleBtn.setAttribute('aria-expanded', String(!styleMenu.hidden));
    });
    styleMenu.addEventListener('click', (e) => {
      const opt = e.target.closest('button[data-style]');
      if (!opt) return;
      answerStyle = opt.getAttribute('data-style');
      if (styleCurrent) styleCurrent.textContent = answerStyle;
      styleMenu.hidden = true;
      styleBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', (e) => {
      if (!styleMenu.hidden && !e.target.closest('.ai-style-wrap')) {
        styleMenu.hidden = true;
        styleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Attach button (visual affordance in this prototype)
  const attachBtn = document.getElementById('ai-tool-attach');
  if (attachBtn) {
    attachBtn.addEventListener('click', () => {
      pushMsg('ai', 'Unggah berkas (KTP, ijazah, dsb.) akan aktif di versi live. Untuk sekarang, ketik saja pertanyaanmu.');
      startChat();
    });
  }

  let busy = false;

  function startChat() {
    if (!studio.classList.contains('is-chatting')) {
      studio.classList.add('is-chatting');
      body.hidden = false;
    }
  }

  const newThreadBtn = document.getElementById('ai-demo-newthread');
  if (newThreadBtn) {
    newThreadBtn.addEventListener('click', () => {
      studio.classList.remove('is-chatting');
      body.hidden = true;
      body.innerHTML = '';
      input.value = '';
      input.focus();
    });
  }

  function pushMsg(role, html) {
    const el = document.createElement('div');
    el.className = 'ai-msg ' + role;
    el.innerHTML = html;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function ask(text) {
    const q = (text || '').trim();
    if (!q || busy) return;
    busy = true;
    startChat();
    pushMsg('user', escapeHtml(q));
    input.value = '';

    const typing = pushMsg('ai', 'Asisten AI sedang mengetik...');
    typing.classList.add('typing');

    setTimeout(() => {
      typing.classList.remove('typing');
      typing.innerHTML = answerHamasahAi(q, answerStyle);
      body.scrollTop = body.scrollHeight;
      busy = false;
      input.focus();
    }, 500);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });

  if (examples) {
    examples.addEventListener('click', (e) => {
      const card = e.target.closest('.ai-example-card');
      if (card) ask(card.getAttribute('data-q'));
    });
  }
}

// ==========================================================================
// 10. INTERACTIVE SCROLL REVEAL & MOTION SYSTEM (DAR DEV)
// ==========================================================================
function initScrollAnimations() {
  // Respect user preference for reduced motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Graceful degradation if IntersectionObserver is not supported
  if (!('IntersectionObserver' in window)) {
    return;
  }

  // Enable CSS scroll reveal rules
  document.documentElement.classList.add('has-scroll-reveal');

  // A. Hairline Reading Progress Indicator at the top of the viewport
  let progressBar = document.getElementById('scroll-progress');
  if (!progressBar) {
    progressBar = document.createElement('div');
    progressBar.id = 'scroll-progress';
    progressBar.className = 'scroll-progress-bar';
    progressBar.setAttribute('aria-hidden', 'true');
    document.body.prepend(progressBar);
  }

  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      window.requestAnimationFrame(() => {
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (totalHeight > 0) {
          const progress = Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100));
          progressBar.style.width = progress.toFixed(2) + '%';
        }
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }, { passive: true });

  // B. Single Reveal Observer
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    threshold: 0.08,
    rootMargin: '0px 0px -40px 0px'
  });

  const singleRevealSelectors = [
    '.section-head',
    '.section-head-centered',
    '.editorial-hub-column',
    '.applicant-credential-card',
    '.ai-interactive-mockup',
    '.family-profile-hero',
    '.rapor-summary-banner',
    '.family-musyrif-note-card',
    '.campus-preview-board',
    '.campus-study-dashboard',
    '.operations-board',
    '.quick-invoice-tool',
    '.compare-card',
    '.stakeholder-flow-card',
    '.roadmap-flow-track',
    '.enterprise-trust-banner',
    '.closing-cta-card',
    '.family-kendala-section'
  ];

  singleRevealSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      if (el.closest('#beranda')) return;
      el.classList.add('scroll-reveal');
      revealObserver.observe(el);
    });
  });

  // Scale reveal for prominent boards
  const scaleRevealSelectors = [
    '.applicant-credential-card',
    '.campus-preview-board',
    '.operations-board'
  ];

  scaleRevealSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.remove('scroll-reveal');
      el.classList.add('scroll-reveal-scale');
    });
  });

  // C. Staggered Grids and Lists Observer
  const staggerObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    threshold: 0.05,
    rootMargin: '0px 0px -30px 0px'
  });

  const staggerSelectors = [
    '.editorial-flow-track',
    '.pendaftaran-features-grid',
    '.family-stats-row',
    '.kendala-cards-grid',
    '.kendala-step-flow',
    '.santri-eval-grid',
    '.op-kpi-grid',
    '.service-features-list',
    '.simple-role-grid',
    '.executive-summary-points',
    '.kpi-impact-metrics-grid',
    '.stakeholder-grid-5',
    '.roadmap-grid',
    '.news-cards-grid',
    '.family-gallery-grid'
  ];

  staggerSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(container => {
      container.classList.add('scroll-stagger');
      staggerObserver.observe(container);
    });
  });

  // D. Animated Progress & KPI Fill Bars
  const barElements = document.querySelectorAll('.bar-fill, .kpi-fill');
  if (barElements.length > 0) {
    barElements.forEach(bar => {
      const match = bar.getAttribute('style')?.match(/width:\s*([^;]+)/);
      const targetWidth = bar.style.width || (match ? match[1] : '100%');
      bar.dataset.targetWidth = targetWidth;
      bar.style.width = '0%';
    });

    const barObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const bars = entry.target.querySelectorAll('.bar-fill, .kpi-fill');
          bars.forEach((bar, idx) => {
            setTimeout(() => {
              if (bar.dataset.targetWidth) {
                bar.style.width = bar.dataset.targetWidth;
              }
            }, idx * 100);
          });
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -20px 0px'
    });

    document.querySelectorAll('.arch-comparison-board, .kpi-impact-metrics-grid').forEach(board => {
      barObserver.observe(board);
    });
  }

  // E. Tab switcher hook to ensure hidden tab contents are visible when activated
  document.querySelectorAll('.tab-btn, .family-subnav-btn, .lms-chapter-item').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(() => {
        document.querySelectorAll('.scroll-reveal:not(.is-revealed), .scroll-stagger:not(.is-revealed)').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            el.classList.add('is-revealed');
          }
        });
      }, 50);
    });
  });
}
