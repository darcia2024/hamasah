const guard = document.querySelector('#lms-guard');
const guardCopy = document.querySelector('#lms-guard-copy');
const consoleSection = document.querySelector('#lms-console');
const studentSelect = document.querySelector('#lms-student-select');
const status = document.querySelector('#lms-status');
const syncStatus = document.querySelector('#lms-sync-status');
const courseList = document.querySelector('#lms-course-list');
const courseView = document.querySelector('#lms-course-view');
const staffSection = document.querySelector('#lms-staff-section');
const courseForm = document.querySelector('#course-form');
const courseStatus = document.querySelector('#course-form-status');
const materialForm = document.querySelector('#material-form');
const materialStatus = document.querySelector('#material-form-status');
const materialCourse = document.querySelector('#material-course');
const enrollmentForm = document.querySelector('#enrollment-form');
const enrollmentStatus = document.querySelector('#enrollment-form-status');
const enrollmentCourse = document.querySelector('#enrollment-course');
let role = null;
const staffNav = document.querySelector('#staff-nav');

// Harus sama persis dengan izin courses.manage dan courses.read di
// server/access-policy.js: guru bisa mengelola maddah, musyrif hanya melihat.
const LMS_MANAGE_ROLES = Object.freeze(['admin', 'teacher']);
const LMS_VIEW_ROLES = Object.freeze(['admin', 'teacher', 'supervisor', 'student']);

function session() { try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; } }
function headers() { const current = session(); return current ? { Authorization: `Bearer ${current.accessToken}` } : {}; }
function setStatus(target, message, error) { target.textContent = message; target.classList.toggle('is-error', Boolean(error)); }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

// Outline SVG icon helpers
const ICONS = {
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  share: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  playFilled: '<svg class="js-ml-1" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  checkCircle: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  star: '<svg width="13" height="13" viewBox="0 0 24 24" fill="#E7B10C" stroke="#E7B10C" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  book: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>',
  globe: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  verified: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#2563EB" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
  send: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
};


function renderCourse(course, activeMaterialId) {
  const materials = course.materials || [];
  const activeMaterial = (activeMaterialId ? materials.find((m) => m.id === activeMaterialId) : null) || materials[0] || null;
  if (syncStatus) syncStatus.textContent = activeMaterial ? `Maddah aktif: ${course.title}` : 'Belum ada materi yang dipilih';

  // Update breadcrumb
  const breadcrumbActive = document.querySelector('.crm-breadcrumbs .crumb-active');
  if (breadcrumbActive) {
    breadcrumbActive.textContent = course.title;
  }

  // Create stage container
  const stage = document.createElement('div');
  stage.className = 'lms-stage';

  // 1. Header Row
  const headerRow = document.createElement('div');
  headerRow.className = 'lms-course-header-row';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'lms-course-header-left';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'lms-back-arrow-btn';
  backBtn.title = 'Kembali ke daftar maddah';
  backBtn.innerHTML = ICONS.back;
  backBtn.addEventListener('click', () => {
    if (breadcrumbActive) breadcrumbActive.textContent = 'LMS Hamasah dan silabus maddah';
    switchLmsTab(tabBtnMyCourses);
  });

  const titleBlock = document.createElement('div');
  titleBlock.className = 'lms-course-title-block';

  const titleLine = document.createElement('div');
  titleLine.className = 'lms-course-title-line';

  const courseTitle = document.createElement('h2');
  courseTitle.className = 'lms-course-title';
  courseTitle.textContent = course.title;

  titleLine.append(courseTitle);

  const statsLine = document.createElement('div');
  statsLine.className = 'lms-course-stats-line';
  // Hanya angka yang benar-benar ada di data. Rating, jumlah santri, tanggal
  // pembaruan, dan bahasa pengantar sebelumnya ditulis keras di kode.
  statsLine.innerHTML = `
    <span class="lms-stat-item">${ICONS.book} ${materials.length} modul</span>
    <span class="lms-stat-item js-text-ok-sm">Progres: ${course.progress}%</span>
  `;

  titleBlock.append(titleLine, statsLine);
  headerLeft.append(backBtn, titleBlock);

  const headerActions = document.createElement('div');
  headerActions.className = 'lms-course-header-actions';

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'lms-btn-share';
  shareBtn.innerHTML = `${ICONS.share} <span>Bagikan</span>`;
  shareBtn.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      shareBtn.innerHTML = `${ICONS.check} <span>Tersalin!</span>`;
      setTimeout(() => { shareBtn.innerHTML = `${ICONS.share} <span>Bagikan</span>`; }, 2000);
    }
  });

  headerActions.append(shareBtn);
  if (activeMaterial) {
    const actionComplete = document.createElement('button');
    actionComplete.type = 'button';
    actionComplete.className = 'lms-btn-enroll';
    if (activeMaterial.completed) {
      actionComplete.innerHTML = `${ICONS.check} <span>Modul ini selesai</span>`;
      actionComplete.disabled = true;
      actionComplete.classList.add('is-complete');
    } else {
      actionComplete.innerHTML = `${ICONS.check} <span>Tandai selesai</span>`;
      actionComplete.addEventListener('click', () => completeMaterial(course.id, activeMaterial.id));
    }
    headerActions.append(actionComplete);
  }

  headerRow.append(headerLeft, headerActions);
  stage.append(headerRow);

  // 2. Main Two-column Grid
  const grid = document.createElement('div');
  grid.className = 'lms-course-grid';

  // --- Left Column: Player & Sub-tabs ---
  const mainCol = document.createElement('div');
  mainCol.className = 'lms-main-col';

  // Player Container
  const playerContainer = document.createElement('div');
  playerContainer.className = 'lms-player-container';

  const overlay = document.createElement('div');
  overlay.className = 'lms-player-overlay';

  const badge = document.createElement('span');
  badge.className = 'lms-player-badge';
  badge.textContent = activeMaterial ? `Modul Aktif: ${activeMaterial.title}` : `Maddah: ${course.title}`;

  // Tombol putar hanya muncul bila materi benar-benar menunjuk ke tautan video.
  // Sebelumnya tombol ini selalu tampil dan tidak melakukan apa pun saat diklik.
  const tautanVideo = activeMaterial && /^https?:\/\//i.test(String(activeMaterial.content || '').trim())
    ? String(activeMaterial.content).trim()
    : '';
  let playBtn = null;
  if (tautanVideo) {
    playBtn = document.createElement('a');
    playBtn.className = 'lms-play-btn';
    playBtn.href = tautanVideo;
    playBtn.target = '_blank';
    playBtn.rel = 'noopener';
    playBtn.title = 'Buka materi di tab baru';
    playBtn.setAttribute('aria-label', `Buka materi ${activeMaterial.title} di tab baru`);
    playBtn.innerHTML = ICONS.playFilled;
  }

  const bottomBar = document.createElement('div');
  bottomBar.className = 'lms-player-bottom-bar';
  bottomBar.innerHTML = `
    <span class="js-row">
      ${ICONS.play} ${activeMaterial ? `${activeMaterial.title} · ${activeMaterial.type.toUpperCase()}` : 'Materi belum dipilih'}
    </span>
    <span class="js-text-soft">Hamasah Learning Portal</span>
  `;

  overlay.append(badge, bottomBar);
  playerContainer.append(overlay);
  if (playBtn) playerContainer.append(playBtn);
  // Panel pemutar hanya berguna bila ada tautan materi; tanpa itu ia hanya kotak hitam.
  if (tautanVideo) mainCol.append(playerContainer);

  // Active Lesson Content Card
  if (activeMaterial) {
    const activeCard = document.createElement('div');
    activeCard.className = 'lms-content-card lms-content-card--active';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'lms-content-card__header';

    const cardTitle = document.createElement('h3');
    cardTitle.textContent = activeMaterial.title;

    const cardBadge = document.createElement('span');
    cardBadge.className = 'lms-course-category-pill';
    cardBadge.textContent = activeMaterial.type.toUpperCase();

    cardHeader.append(cardTitle, cardBadge);

    const cardSummary = document.createElement('p');
    cardSummary.className = 'lms-about-text';
    cardSummary.textContent = activeMaterial.summary || activeMaterial.content || 'Pelajari materi ini dengan saksama sesuai arahan asatidzah.';

    activeCard.append(cardHeader, cardSummary);

    if (activeMaterial.content && activeMaterial.content !== activeMaterial.summary) {
      const contentBox = document.createElement('div');
      contentBox.className = 'lms-note-box';
      contentBox.textContent = activeMaterial.content;
      activeCard.append(contentBox);
    }

    if (activeMaterial.keyPoints && activeMaterial.keyPoints.length) {
      const pointsTitle = document.createElement('h4');
      pointsTitle.className = 'lms-subheading';
      pointsTitle.textContent = 'Poin utama pembahasan';

      const pointsGrid = document.createElement('div');
      pointsGrid.className = 'lms-learn-grid';
      activeMaterial.keyPoints.forEach((pt) => {
        const item = document.createElement('div');
        item.className = 'lms-learn-item';
        item.innerHTML = `<span class="lms-learn-icon">${ICONS.checkCircle}</span><span>${escapeHtml(pt)}</span>`;
        pointsGrid.append(item);
      });
      activeCard.append(pointsTitle, pointsGrid);
    }

    mainCol.append(activeCard);
  }

  // Sub-tabs Bar
  const tabsBar = document.createElement('div');
  tabsBar.className = 'lms-tabs-bar';

  // Tab Asatidzah, Pengumuman, dan Ulasan dihapus: isinya nama pengajar, pengumuman,
  // dan ulasan karangan. Tab baru hanya ditambahkan bila datanya benar-benar ada.
  const subTabs = [
    { id: 'overview', label: 'Ringkasan' },
    { id: 'faq', label: 'Tanya jawab' }
  ];

  const tabPanels = {};

  subTabs.forEach((st, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `lms-tab-link ${idx === 0 ? 'is-active' : ''}`;
    btn.textContent = st.label;
    btn.addEventListener('click', () => {
      tabsBar.querySelectorAll('.lms-tab-link').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      Object.values(tabPanels).forEach((panel) => { panel.hidden = true; });
      if (tabPanels[st.id]) tabPanels[st.id].hidden = false;
    });
    tabsBar.append(btn);
  });
  mainCol.append(tabsBar);

  // Tab Panel 1: Overview
  const overviewPanel = document.createElement('div');
  overviewPanel.className = 'lms-content-card';
  const about = document.createElement('div');
  about.innerHTML = `
    <h3>Tentang maddah ini</h3>
    <p class="lms-about-text">${escapeHtml(course.description || 'Deskripsi maddah belum diisi pengajar.')}</p>
  `;
  overviewPanel.append(about);

  // Poin yang dipelajari diambil dari poin utama materi yang sudah diisi pengajar.
  const poin = materials.flatMap((mat) => mat.keyPoints || []).slice(0, 6);
  if (poin.length) {
    const learnTitle = document.createElement('h3');
    learnTitle.textContent = 'Yang akan dipelajari';
    const learnGrid = document.createElement('div');
    learnGrid.className = 'lms-learn-grid';
    poin.forEach((teks) => {
      const row = document.createElement('div');
      row.className = 'lms-learn-item';
      row.innerHTML = `<span class="lms-learn-icon">${ICONS.checkCircle}</span><span></span>`;
      row.lastElementChild.textContent = teks;
      learnGrid.append(row);
    });
    overviewPanel.append(learnTitle, learnGrid);
  }

  tabPanels.overview = overviewPanel;
  mainCol.append(overviewPanel);

  // Tab Panel 3: FAQ / Tanya Jawab
  const faqPanel = document.createElement('div');
  faqPanel.className = 'lms-content-card';
  faqPanel.hidden = true;

  const faqHeader = document.createElement('div');
  faqHeader.innerHTML = `
    <h3>Tanya Jawab Seputar Maddah &amp; Modul</h3>
    <p class="lms-about-text">Tanyakan hal yang belum dipahami langsung kepada sistem bimbingan asatidzah.</p>
  `;
  faqPanel.append(faqHeader);

  if (activeMaterial) {
    const helpForm = document.createElement('form');
    helpForm.className = 'lms-help-form';
    helpForm.classList.add('lms-help-form');

    const questionInput = document.createElement('input');
    questionInput.type = 'text';
    questionInput.placeholder = `Tanyakan materi "${activeMaterial.title}"...`;
    questionInput.classList.add('lms-help-input');

    const askBtn = document.createElement('button');
    askBtn.type = 'submit';
    askBtn.className = 'button button--primary';
    askBtn.innerHTML = `${ICONS.send} <span>Tanya</span>`;

    helpForm.append(questionInput, askBtn);

    const answerBox = document.createElement('p');
    answerBox.className = 'lms-answer';
    answerBox.hidden = true;

    helpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!questionInput.value.trim()) return;
      answerBox.hidden = false;
      studyHelp(course.id, activeMaterial.id, questionInput.value, answerBox);
    });

    faqPanel.append(helpForm, answerBox);

    // If activeMaterial has studyGuide items, display them!
    if (activeMaterial.studyGuide && activeMaterial.studyGuide.length) {
      const guideTitle = document.createElement('h4');
      guideTitle.className = 'lms-subheading lms-subheading--spaced';
      guideTitle.textContent = 'Panduan & Tanya Jawab Terdaftar:';
      faqPanel.append(guideTitle);

      activeMaterial.studyGuide.forEach((sg) => {
        const guideItem = document.createElement('div');
        guideItem.className = 'lms-note-box lms-note-box--row';
        guideItem.innerHTML = `
          <p class="js-text-label">Q: ${sg.question}</p>
          <p class="js-text-xs">A: ${sg.answer}</p>
        `;
        faqPanel.append(guideItem);
      });
    }
  } else {
    const noMaterialNote = document.createElement('p');
    noMaterialNote.className = 'lms-about-text';
    noMaterialNote.textContent = 'Pilih salah satu modul di samping untuk memulai sesi tanya jawab.';
    faqPanel.append(noMaterialNote);
  }
  tabPanels.faq = faqPanel;
  mainCol.append(faqPanel);

  grid.append(mainCol);

  // --- Kolom kanan: kurikulum maddah ---
  const sideCol = document.createElement('div');
  sideCol.className = 'lms-side-col';

  // Curriculum Card
  const curriculumCard = document.createElement('div');
  curriculumCard.className = 'lms-curriculum-card';

  const currHeader = document.createElement('div');
  currHeader.className = 'lms-curriculum-header';
  currHeader.innerHTML = `
    <h3>Kurikulum maddah</h3>
    <span>${materials.length} materi</span>
  `;
  curriculumCard.append(currHeader);

  const accordion = document.createElement('div');
  accordion.className = 'lms-accordion';

  if (!materials.length) {
    const emptyCurriculum = document.createElement('p');
    emptyCurriculum.className = 'lms-about-text';
    emptyCurriculum.textContent = 'Belum ada modul yang diunggah untuk maddah ini.';
    accordion.append(emptyCurriculum);
  } else {
    // Module Item
    const moduleItem = document.createElement('div');
    moduleItem.className = 'lms-module-item is-open';

    const moduleHeader = document.createElement('div');
    moduleHeader.className = 'lms-module-header';
    moduleHeader.innerHTML = `
      <span class="lms-module-title">Daftar materi</span>
      <span class="lms-module-meta">${materials.length} materi ${ICONS.chevronDown}</span>
    `;

    const lessonsList = document.createElement('div');
    lessonsList.className = 'lms-lessons-list';

    materials.forEach((mat, mIdx) => {
      const isCurrent = activeMaterial && activeMaterial.id === mat.id;
      const lessonBtn = document.createElement('button');
      lessonBtn.type = 'button';
      lessonBtn.className = `lms-lesson-item ${isCurrent ? 'is-active' : ''} ${mat.completed ? 'is-completed' : ''}`;

      lessonBtn.innerHTML = `
        <div class="lms-lesson-left">
          <span class="lms-lesson-icon">${mat.completed ? ICONS.checkCircle : ICONS.play}</span>
          <span class="lms-lesson-name">${mIdx + 1}. ${mat.title}</span>
        </div>
        <span class="lms-lesson-duration">${mat.completed ? 'Selesai' : mat.type.toUpperCase()}</span>
      `;

      lessonBtn.addEventListener('click', () => {
        renderCourse(course, mat.id);
      });

      lessonsList.append(lessonBtn);
    });

    moduleItem.append(moduleHeader, lessonsList);
    accordion.append(moduleItem);
  }
  curriculumCard.append(accordion);
  sideCol.append(curriculumCard);

  grid.append(sideCol);
  stage.append(grid);

  courseView.replaceChildren(stage);
  courseView.hidden = false;

  const emptyNote = document.querySelector('#lms-course-empty-note');
  if (emptyNote) emptyNote.hidden = true;
  switchLmsTab(tabBtnCourseDetail);
}

async function completeMaterial(courseId, materialId) {
  const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}/complete`, { method: 'POST', headers: headers() });
  const result = await response.json();
  if (!response.ok) {
    setStatus(status, result.error || 'Progress belum dapat diperbarui.', true);
    return;
  }
  renderCourse(result.course, materialId);
  await loadCourses();
}

async function studyHelp(courseId, materialId, question, answer) {
  if (!question || !question.trim()) return;
  answer.textContent = 'Memuat jawaban asatidzah...';
  answer.classList.remove('is-error');
  try {
    const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}/study-help`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    const result = await response.json();
    if (response.ok) {
      answer.textContent = `${result.help.answer} (${result.help.source})`;
    } else {
      answer.textContent = result.error || 'Jawaban belum tersedia.';
      answer.classList.add('is-error');
    }
  } catch (err) {
    answer.textContent = 'Terjadi kendala saat menghubungi layanan tanya jawab.';
    answer.classList.add('is-error');
  }
}

function renderCourses(courses) {
  courseList.replaceChildren();
  courseView.hidden = true;
  const emptyNote = document.querySelector('#lms-course-empty-note');
  if (emptyNote) emptyNote.hidden = false;
  if (!courses.length) {
    const empty = document.createElement('p');
    empty.className = 'lms-empty-note';
    empty.textContent = 'Belum ada maddah yang diikuti.';
    courseList.append(empty);
    return;
  }

  courses.forEach((course) => {
    const item = document.createElement('article');
    item.className = 'portal-student-card';
    item.classList.add('lms-course-item');

    const topRow = document.createElement('div');
    topRow.className = 'lms-course-item__top';

    const titleBlock = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'lms-course-item__title';
    title.textContent = course.title;

    titleBlock.append(title);
    topRow.append(titleBlock);

    const desc = document.createElement('p');
    desc.className = 'lms-course-item__desc';
    desc.textContent = course.description || 'Maddah persiapan akademik Al-Azhar Kairo.';

    const metaRow = document.createElement('div');
    metaRow.className = 'lms-course-item__meta';

    const materialCount = document.createElement('span');
    materialCount.innerHTML = `${ICONS.book} ${course.materials.length} materi`;

    const progressText = document.createElement('span');
    progressText.className = course.progress === 100 ? 'lms-progress-text is-complete' : 'lms-progress-text';
    progressText.textContent = `${course.progress}% Selesai`;

    metaRow.append(materialCount, progressText);

    // Progress bar
    const progressTrack = document.createElement('div');
    progressTrack.className = 'lms-progress-track';

    const progressFill = document.createElement('div');
    progressFill.className = course.progress === 100 ? 'lms-progress-fill is-complete' : 'lms-progress-fill';
    progressFill.style.width = `${course.progress}%`;
    progressTrack.append(progressFill);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary coursue-card-cta';
    button.innerHTML = `<span>Buka maddah</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
    button.addEventListener('click', () => renderCourse(course));

    item.append(topRow, desc, metaRow, progressTrack, button);
    courseList.append(item);
  });
}

async function loadCourses() {
  if (!studentSelect.value) {
    courseList.replaceChildren();
    courseView.hidden = true;
    if (syncStatus) syncStatus.textContent = 'Belum memilih santri atau materi';
    return;
  }
  if (syncStatus) syncStatus.textContent = 'Memuat materi santri…';
  const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses`, { headers: headers() });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Maddah belum dapat dimuat.');
  renderCourses(result.items); setStatus(status, `${result.items.length} maddah tersedia.`);
  if (syncStatus) syncStatus.textContent = result.items.length ? 'Materi tersedia untuk santri terpilih' : 'Belum ada materi untuk santri terpilih';
}

function renderStaffCourses(courses) {
  [materialCourse, enrollmentCourse].forEach((select) => select.replaceChildren());
  courses.forEach((course) => [materialCourse, enrollmentCourse].forEach((select) => select.add(new Option(course.title, course.id))));
}

async function loadStaffCourses() {
  if (!LMS_MANAGE_ROLES.includes(role)) return;
  const response = await fetch('/api/courses', { headers: headers() });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Daftar maddah belum dapat dimuat.');
  renderStaffCourses(result.items);
}

let studentPicker = null;
async function loadStudents() {
  if (!studentPicker) studentPicker = window.HamasahStudentPicker.attach(studentSelect, { headers, placeholder: 'Pilih santri' });
  const page = await studentPicker.reload();
  if (page && page.total === 1 && page.items.length === 1) { studentSelect.value = page.items[0].id; await loadCourses(); }
}

studentSelect.addEventListener('change', () => loadCourses().catch((error) => setStatus(status, error.message, true)));
courseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { const response = await fetch('/api/courses', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: document.querySelector('#course-title').value, description: document.querySelector('#course-description').value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); courseForm.reset(); setStatus(courseStatus, `Maddah ${result.course.title} berhasil dibuat.`); await loadStaffCourses(); } catch (error) { setStatus(courseStatus, error.message || 'Maddah belum dapat dibuat.', true); }
});
materialForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const guideQuestion = document.querySelector('#guide-question').value.trim(); const guideAnswer = document.querySelector('#guide-answer').value.trim();
  try { const response = await fetch(`/api/courses/${encodeURIComponent(materialCourse.value)}/materials`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ type: document.querySelector('#material-type').value, title: document.querySelector('#material-title').value, content: document.querySelector('#material-content').value, summary: document.querySelector('#material-summary').value, keyPoints: document.querySelector('#material-points').value.split(',').map((entry) => entry.trim()).filter(Boolean), studyGuide: guideQuestion && guideAnswer ? [{ question: guideQuestion, answer: guideAnswer }] : [] }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); materialForm.reset(); setStatus(materialStatus, `Materi ${result.material.title} berhasil ditambahkan.`); if (studentSelect.value) await loadCourses(); } catch (error) { setStatus(materialStatus, error.message || 'Materi belum dapat ditambahkan.', true); }
});
enrollmentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!studentSelect.value) { setStatus(enrollmentStatus, 'Pilih santri terlebih dahulu.', true); return; }
  try { const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses/${encodeURIComponent(enrollmentCourse.value)}`, { method: 'POST', headers: headers() }); if (!response.ok) { const result = await response.json(); throw new Error(result.error); } setStatus(enrollmentStatus, 'Santri berhasil didaftarkan ke maddah.'); await loadCourses(); } catch (error) { setStatus(enrollmentStatus, error.message || 'Enrollment belum dapat disimpan.', true); }
});

// Subtabs management
const tabBtnMyCourses = document.querySelector('#tab-btn-my-courses');
const tabBtnCourseDetail = document.querySelector('#tab-btn-course-detail');
const tabBtnManage = document.querySelector('#tab-btn-manage');
const panelMyCourses = document.querySelector('#panel-my-courses');
const panelCourseDetail = document.querySelector('#panel-course-detail');
const panelManage = document.querySelector('#panel-manage');

const lmsTabs = [
  { btn: tabBtnMyCourses, panel: panelMyCourses },
  { btn: tabBtnCourseDetail, panel: panelCourseDetail },
  { btn: tabBtnManage, panel: panelManage }
];

function switchLmsTab(targetBtn) {
  lmsTabs.forEach(({ btn, panel }) => {
    if (btn && panel) {
      const active = btn === targetBtn;
      btn.classList.toggle('is-active', active);
      panel.hidden = !active;
    }
  });
  if (targetBtn === tabBtnMyCourses || targetBtn === tabBtnManage) {
    const breadcrumbActive = document.querySelector('.crm-breadcrumbs .crumb-active');
    if (breadcrumbActive) breadcrumbActive.textContent = 'LMS Hamasah dan silabus maddah';
  }
}

lmsTabs.forEach(({ btn }) => {
  if (btn) btn.addEventListener('click', () => switchLmsTab(btn));
});

const logoutButton = document.querySelector('#logout-button');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: headers() }).catch(() => {});
    sessionStorage.removeItem('hamasahPortalSession');
    window.location.reload();
  });
}

(async function initialize() {
  if (session()) document.body.classList.add('in-crm');
  try {
    const response = await fetch('/api/me', { headers: headers() });
    const result = await response.json();
    // Belum masuk / sesi berakhir dibedakan dari peran yang tidak berhak.
    if (!response.ok) throw Object.assign(new Error('Sesi Anda belum ada atau sudah berakhir. Masuk lewat Portal Hamasah untuk membuka LMS.'), { judul: 'Masuk untuk membuka LMS' });
    if (!LMS_VIEW_ROLES.includes(result.account.role)) throw Object.assign(new Error('Halaman ini hanya tersedia untuk santri, guru, pengawas, atau admin.'), { judul: 'LMS tidak tersedia untuk akun ini' });
    role = result.account.role;
    guard.hidden = true;
    consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, role, 'lms', result.account);
    if (LMS_MANAGE_ROLES.includes(role)) {
      document.querySelectorAll('.staff-only-tab').forEach((el) => { el.hidden = false; });
      staffSection.hidden = false;
      await loadStaffCourses();
    }
    if (role !== 'teacher') {
      await loadStudents();
    }
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
    // Judul tidak boleh tetap "Memeriksa..." setelah pemeriksaan selesai.
    const judul = guard.querySelector('h1');
    if (judul) judul.textContent = error.judul || 'Masuk untuk membuka LMS';
  }
}());
