const guard = document.querySelector('#lms-guard');
const guardCopy = document.querySelector('#lms-guard-copy');
const consoleSection = document.querySelector('#lms-console');
const studentSelect = document.querySelector('#lms-student-select');
const status = document.querySelector('#lms-status');
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

// Outline SVG icon helpers
const ICONS = {
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  share: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  playFilled: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="margin-left: 2px;"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  checkCircle: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  star: '<svg width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  book: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>',
  globe: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  verified: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#2563EB" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
  send: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
};

function getCourseCategory(title) {
  const lower = (title || '').toLowerCase();
  if (lower.includes('fiqh')) return "Fiqh Syafi'i · Al-Azhar";
  if (lower.includes('nahwu') || lower.includes('sharaf') || lower.includes('ajurrum')) return 'Lughah Arabiyyah · Al-Azhar';
  if (lower.includes('tahsin') || lower.includes('jazari') || lower.includes('qur')) return "Tahsin & Qira'at";
  if (lower.includes('tauhid') || lower.includes('aqidah')) return 'Aqidah & Ushuluddin';
  if (lower.includes('hadits')) return 'Hadits & Musthalah';
  return 'Dirasah Islamiyyah Al-Azhar';
}

function renderCourse(course, activeMaterialId) {
  const materials = course.materials || [];
  const activeMaterial = (activeMaterialId ? materials.find((m) => m.id === activeMaterialId) : null) || materials[0] || null;

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
  backBtn.title = 'Kembali ke Daftar Maddah';
  backBtn.innerHTML = ICONS.back;
  backBtn.addEventListener('click', () => {
    if (breadcrumbActive) breadcrumbActive.textContent = 'LMS Hamasah & Silabus Maddah';
    switchLmsTab(tabBtnMyCourses);
  });

  const titleBlock = document.createElement('div');
  titleBlock.className = 'lms-course-title-block';

  const titleLine = document.createElement('div');
  titleLine.className = 'lms-course-title-line';

  const courseTitle = document.createElement('h2');
  courseTitle.className = 'lms-course-title';
  courseTitle.textContent = course.title;

  const categoryPill = document.createElement('span');
  categoryPill.className = 'lms-course-category-pill';
  categoryPill.textContent = getCourseCategory(course.title);

  titleLine.append(courseTitle, categoryPill);

  const statsLine = document.createElement('div');
  statsLine.className = 'lms-course-stats-line';
  statsLine.innerHTML = `
    <span class="lms-stat-item">${ICONS.star} <strong style="color:#B45309;">4.9</strong> (128 Santri)</span>
    <span class="lms-stat-item">${ICONS.book} ${materials.length} Modul</span>
    <span class="lms-stat-item">${ICONS.clock} Diperbarui September 2026</span>
    <span class="lms-stat-item">${ICONS.globe} Bahasa Arab &amp; Indonesia</span>
    <span class="lms-stat-item" style="color:#059669; font-weight:600;">Progres: ${course.progress}%</span>
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
      actionComplete.innerHTML = `${ICONS.check} <span>Modul Ini Selesai</span>`;
      actionComplete.disabled = true;
      actionComplete.style.background = '#059669';
    } else {
      actionComplete.innerHTML = `${ICONS.check} <span>Tandai Selesai</span>`;
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
  playerContainer.style.background = 'radial-gradient(ellipse at center, #1E293B 0%, #0F172A 100%)';

  const overlay = document.createElement('div');
  overlay.className = 'lms-player-overlay';

  const badge = document.createElement('span');
  badge.className = 'lms-player-badge';
  badge.textContent = activeMaterial ? `Modul Aktif: ${activeMaterial.title}` : `Maddah: ${course.title}`;

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'lms-play-btn';
  playBtn.title = 'Mulai Belajar';
  playBtn.innerHTML = ICONS.playFilled;

  const bottomBar = document.createElement('div');
  bottomBar.className = 'lms-player-bottom-bar';
  bottomBar.innerHTML = `
    <span style="display:flex; align-items:center; gap:8px;">
      ${ICONS.play} ${activeMaterial ? `${activeMaterial.title} · ${activeMaterial.type.toUpperCase()}` : 'Video Pembelajaran Al-Azhar'}
    </span>
    <span style="font-size:12px; opacity:0.8;">Hamasah Learning Portal</span>
  `;

  overlay.append(badge, bottomBar);
  playerContainer.append(overlay, playBtn);
  mainCol.append(playerContainer);

  // Active Lesson Content Card
  if (activeMaterial) {
    const activeCard = document.createElement('div');
    activeCard.className = 'lms-content-card';
    activeCard.style.padding = '20px 24px';
    activeCard.style.gap = '14px';

    const cardHeader = document.createElement('div');
    cardHeader.style.display = 'flex';
    cardHeader.style.alignItems = 'center';
    cardHeader.style.justifyContent = 'space-between';
    cardHeader.style.flexWrap = 'wrap';
    cardHeader.style.gap = '10px';

    const cardTitle = document.createElement('h3');
    cardTitle.style.fontSize = '17px';
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
      contentBox.style.padding = '14px 16px';
      contentBox.style.background = '#F8FAFC';
      contentBox.style.borderRadius = '10px';
      contentBox.style.border = '1px solid #E2E8F0';
      contentBox.style.fontSize = '13.5px';
      contentBox.style.color = '#334155';
      contentBox.style.lineHeight = '1.6';
      contentBox.textContent = activeMaterial.content;
      activeCard.append(contentBox);
    }

    if (activeMaterial.keyPoints && activeMaterial.keyPoints.length) {
      const pointsTitle = document.createElement('h4');
      pointsTitle.style.margin = '4px 0 0';
      pointsTitle.style.fontSize = '13px';
      pointsTitle.style.fontWeight = '600';
      pointsTitle.style.color = '#0F172A';
      pointsTitle.textContent = 'Poin-Poin Utama Pembahasan:';

      const pointsGrid = document.createElement('div');
      pointsGrid.className = 'lms-learn-grid';
      activeMaterial.keyPoints.forEach((pt) => {
        const item = document.createElement('div');
        item.className = 'lms-learn-item';
        item.innerHTML = `<span class="lms-learn-icon">${ICONS.checkCircle}</span><span>${pt}</span>`;
        pointsGrid.append(item);
      });
      activeCard.append(pointsTitle, pointsGrid);
    }

    mainCol.append(activeCard);
  }

  // Sub-tabs Bar
  const tabsBar = document.createElement('div');
  tabsBar.className = 'lms-tabs-bar';

  const subTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'author', label: 'Asatidzah' },
    { id: 'faq', label: 'Tanya Jawab / FAQ' },
    { id: 'announcements', label: 'Pengumuman' },
    { id: 'reviews', label: 'Ulasan' }
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
  overviewPanel.innerHTML = `
    <h3>Tentang Maddah Ini</h3>
    <p class="lms-about-text">${course.description || "Silabus resmi persiapan santri Al-Azhar Kairo yang disusun secara terstruktur sesuai kurikulum Ma'had & Kulliyyah Al-Azhar Asy-Syarif Mesir."}</p>
    <div style="border-top: 1px solid #F1F5F9; margin: 4px 0;"></div>
    <h3>Yang Akan Dipelajari</h3>
    <div class="lms-learn-grid">
      <div class="lms-learn-item"><span class="lms-learn-icon">${ICONS.checkCircle}</span><span>Penguasaan kaidah &amp; i'rab aplikatif langsung dari kitab matan mu'tamad</span></div>
      <div class="lms-learn-item"><span class="lms-learn-icon">${ICONS.checkCircle}</span><span>Metodologi talaqqi &amp; hafalan terarah bersama asatidzah Al-Azhar Kairo</span></div>
      <div class="lms-learn-item"><span class="lms-learn-icon">${ICONS.checkCircle}</span><span>Persiapan komprehensif menghadapi imtihan mu'adalah &amp; tahdid mustawa</span></div>
      <div class="lms-learn-item"><span class="lms-learn-icon">${ICONS.checkCircle}</span><span>Akses tanya jawab interaktif untuk mengurai materi musykil bersama musyrif</span></div>
    </div>
  `;
  tabPanels.overview = overviewPanel;
  mainCol.append(overviewPanel);

  // Tab Panel 2: Asatidzah
  const authorPanel = document.createElement('div');
  authorPanel.className = 'lms-content-card';
  authorPanel.hidden = true;
  authorPanel.innerHTML = `
    <div style="display: flex; gap: 16px; align-items: flex-start;">
      <div class="lms-author-pic" style="width: 56px; height: 56px; font-size: 20px;">AZ</div>
      <div style="flex: 1;">
        <div class="lms-author-name-row">
          <h3 class="lms-author-name" style="font-size: 16px;">Ustadz Ahmad Al-Azhari, Lc., M.A.</h3>
          <span class="lms-author-badge">${ICONS.verified}</span>
        </div>
        <p class="lms-author-role" style="margin-top: 4px;">Musyrif Akademik &amp; Dosen Tamu Al-Azhar Asy-Syarif</p>
        <p class="lms-author-bio" style="margin-top: 10px; font-size: 13px;">Alumnus Fakultas Syariah Wal Qanun Universitas Al-Azhar Kairo. Memiliki sanad keilmuan muttashil pada matan-matan induk serta pengalaman lebih dari 8 tahun membimbing santri Indonesia menempuh studi sarjana dan pascasarjana di Kairo.</p>
        <div style="margin-top: 12px; display: flex; gap: 16px; font-size: 12px; color: #64748B;">
          <span><strong>12+</strong> Tahun Mengajar</span>
          <span><strong>850+</strong> Santri Dibimbing</span>
          <span><strong>4.9/5</strong> Rating Kepuasan</span>
        </div>
      </div>
    </div>
  `;
  tabPanels.author = authorPanel;
  mainCol.append(authorPanel);

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
    helpForm.style.marginTop = '10px';

    const questionInput = document.createElement('input');
    questionInput.type = 'text';
    questionInput.placeholder = `Tanyakan materi "${activeMaterial.title}"...`;
    questionInput.style.flex = '1';

    const askBtn = document.createElement('button');
    askBtn.type = 'submit';
    askBtn.className = 'button button--primary';
    askBtn.innerHTML = `${ICONS.send} <span>Tanya</span>`;

    helpForm.append(questionInput, askBtn);

    const answerBox = document.createElement('p');
    answerBox.className = 'lms-answer';
    answerBox.style.display = 'none';

    helpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!questionInput.value.trim()) return;
      answerBox.style.display = 'block';
      studyHelp(course.id, activeMaterial.id, questionInput.value, answerBox);
    });

    faqPanel.append(helpForm, answerBox);

    // If activeMaterial has studyGuide items, display them!
    if (activeMaterial.studyGuide && activeMaterial.studyGuide.length) {
      const guideTitle = document.createElement('h4');
      guideTitle.style.margin = '16px 0 8px';
      guideTitle.style.fontSize = '13.5px';
      guideTitle.style.fontWeight = '600';
      guideTitle.style.color = '#0F172A';
      guideTitle.textContent = 'Panduan & Tanya Jawab Terdaftar:';
      faqPanel.append(guideTitle);

      activeMaterial.studyGuide.forEach((sg) => {
        const guideItem = document.createElement('div');
        guideItem.style.padding = '10px 14px';
        guideItem.style.background = '#F8FAFC';
        guideItem.style.borderRadius = '8px';
        guideItem.style.border = '1px solid #E2E8F0';
        guideItem.style.marginBottom = '8px';
        guideItem.innerHTML = `
          <p style="margin:0 0 4px; font-weight:600; font-size:13px; color:#0F172A;">Q: ${sg.question}</p>
          <p style="margin:0; font-size:12.5px; color:#475569;">A: ${sg.answer}</p>
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

  // Tab Panel 4: Pengumuman
  const announcePanel = document.createElement('div');
  announcePanel.className = 'lms-content-card';
  announcePanel.hidden = true;
  announcePanel.innerHTML = `
    <h3>Pengumuman Akademik</h3>
    <div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">
      <div style="padding:14px 16px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px;">
        <span style="font-size:11px; font-weight:700; color:#D97706; text-transform:uppercase;">15 September 2026</span>
        <h4 style="margin:4px 0; font-size:14px; font-weight:600; color:#0F172A;">Jadwal Talaqqi Pekanan &amp; Setoran Matan</h4>
        <p style="margin:0; font-size:13px; color:#475569;">Halaqah talaqqi bersama asatidzah Al-Azhar diselenggarakan setiap hari Rabu pukul 16.00 CLT (Waktu Kairo) melalui tautan ruang virtual terpadu.</p>
      </div>
      <div style="padding:14px 16px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px;">
        <span style="font-size:11px; font-weight:700; color:#059669; text-transform:uppercase;">1 September 2026</span>
        <h4 style="margin:4px 0; font-size:14px; font-weight:600; color:#0F172A;">Penyelarasan Silabus Imtihan Qabul</h4>
        <p style="margin:0; font-size:13px; color:#475569;">Seluruh materi telah diselaraskan dengan silabus muqorror terbaru untuk seleksi masuk Al-Azhar tahun akademik 2026/2027.</p>
      </div>
    </div>
  `;
  tabPanels.announcements = announcePanel;
  mainCol.append(announcePanel);

  // Tab Panel 5: Ulasan
  const reviewsPanel = document.createElement('div');
  reviewsPanel.className = 'lms-content-card';
  reviewsPanel.hidden = true;
  reviewsPanel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <h3>Ulasan Santri</h3>
      <span style="font-size:13px; font-weight:600; color:#B45309;">${ICONS.star} 4.9 dari 5 (128 ulasan)</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">
      <div style="padding:14px 16px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="font-size:13px; color:#0F172A;">Muhammad Farhan (Santri Kairo)</strong>
          <span style="font-size:12px; color:#B45309;">${ICONS.star} 5.0</span>
        </div>
        <p style="margin:0; font-size:12.5px; color:#475569;">Penjelasan matan sangat sistematis dan mudah dipahami. Membantu sekali sebelum masuk halaqah syarah di Masjid Al-Azhar.</p>
      </div>
      <div style="padding:14px 16px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="font-size:13px; color:#0F172A;">Ahmad Zaki (Persiapan Mu'adalah)</strong>
          <span style="font-size:12px; color:#B45309;">${ICONS.star} 5.0</span>
        </div>
        <p style="margin:0; font-size:12.5px; color:#475569;">Fitur tanya jawab interaktifnya sangat cepat dan akurat dalam menjelaskan kaidah nahwu yang rumit.</p>
      </div>
    </div>
  `;
  tabPanels.reviews = reviewsPanel;
  mainCol.append(reviewsPanel);

  grid.append(mainCol);

  // --- Right Column: Curriculum Accordion & Author Card ---
  const sideCol = document.createElement('div');
  sideCol.className = 'lms-side-col';

  // Curriculum Card
  const curriculumCard = document.createElement('div');
  curriculumCard.className = 'lms-curriculum-card';

  const currHeader = document.createElement('div');
  currHeader.className = 'lms-curriculum-header';
  currHeader.innerHTML = `
    <h3>Kurikulum Maddah</h3>
    <span>${materials.length} Pelajaran</span>
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
      <span class="lms-module-title">Modul Utama: Muqorror Maddah</span>
      <span class="lms-module-meta">${materials.length} Sesi ${ICONS.chevronDown}</span>
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

  // Author Card
  const authorCard = document.createElement('div');
  authorCard.className = 'lms-author-card';
  authorCard.innerHTML = `
    <div class="lms-author-header">
      <h4>INSTRUKTUR UTAMA</h4>
    </div>
    <div class="lms-author-profile">
      <div class="lms-author-pic">AZ</div>
      <div class="lms-author-info">
        <div class="lms-author-name-row">
          <h5 class="lms-author-name">Ustadz Ahmad Al-Azhari, Lc.</h5>
          <span class="lms-author-badge">${ICONS.verified}</span>
        </div>
        <p class="lms-author-role">Musyrif Akademik &amp; Pembina Maddah</p>
      </div>
      <div class="lms-author-rating">${ICONS.star} 4.9</div>
    </div>
    <p class="lms-author-bio">Alumnus Universitas Al-Azhar Kairo dengan spesialisasi pengajaran matan klasik dan bimbingan seleksi santri ke Mesir.</p>
  `;
  sideCol.append(authorCard);

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
    empty.style.color = '#64748B';
    empty.style.fontSize = '13.5px';
    empty.style.padding = '24px 0';
    empty.textContent = 'Belum ada maddah yang diikuti.';
    courseList.append(empty);
    return;
  }

  courses.forEach((course) => {
    const item = document.createElement('article');
    item.className = 'portal-student-card';
    item.style.padding = '20px';
    item.style.display = 'flex';
    item.style.flexDirection = 'column';
    item.style.gap = '14px';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'flex-start';
    topRow.style.gap = '10px';

    const titleBlock = document.createElement('div');
    const category = document.createElement('span');
    category.className = 'lms-course-category-pill';
    category.style.marginBottom = '6px';
    category.textContent = getCourseCategory(course.title);

    const title = document.createElement('h3');
    title.style.margin = '0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    title.style.color = '#0F172A';
    title.textContent = course.title;

    titleBlock.append(category, title);
    topRow.append(titleBlock);

    const desc = document.createElement('p');
    desc.style.margin = '0';
    desc.style.fontSize = '13px';
    desc.style.color = '#64748B';
    desc.style.lineHeight = '1.5';
    desc.textContent = course.description || 'Maddah persiapan akademik Al-Azhar Kairo.';

    const metaRow = document.createElement('div');
    metaRow.style.display = 'flex';
    metaRow.style.alignItems = 'center';
    metaRow.style.justifyContent = 'space-between';
    metaRow.style.fontSize = '12px';
    metaRow.style.color = '#64748B';

    const materialCount = document.createElement('span');
    materialCount.innerHTML = `${ICONS.book} ${course.materials.length} materi`;

    const progressText = document.createElement('span');
    progressText.style.fontWeight = '600';
    progressText.style.color = course.progress === 100 ? '#059669' : '#D97706';
    progressText.textContent = `${course.progress}% Selesai`;

    metaRow.append(materialCount, progressText);

    // Progress bar
    const progressTrack = document.createElement('div');
    progressTrack.style.width = '100%';
    progressTrack.style.height = '6px';
    progressTrack.style.background = '#E2E8F0';
    progressTrack.style.borderRadius = '9999px';
    progressTrack.style.overflow = 'hidden';

    const progressFill = document.createElement('div');
    progressFill.style.width = `${course.progress}%`;
    progressFill.style.height = '100%';
    progressFill.style.background = course.progress === 100 ? '#059669' : '#D97706';
    progressFill.style.borderRadius = '9999px';
    progressFill.style.transition = 'width 0.3s ease';
    progressTrack.append(progressFill);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary';
    button.style.width = '100%';
    button.style.justifyContent = 'center';
    button.style.marginTop = '4px';
    button.innerHTML = `<span>Buka Maddah</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
    button.addEventListener('click', () => renderCourse(course));

    item.append(topRow, desc, metaRow, progressTrack, button);
    courseList.append(item);
  });
}

async function loadCourses() {
  if (!studentSelect.value) { courseList.replaceChildren(); courseView.hidden = true; return; }
  const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses`, { headers: headers() });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Maddah belum dapat dimuat.');
  renderCourses(result.items); setStatus(status, `${result.items.length} maddah tersedia.`);
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

async function loadStudents() {
  const response = await fetch('/api/my-students', { headers: headers() });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Data santri belum dapat dimuat.');
  studentSelect.replaceChildren(new Option('Pilih santri', ''));
  result.items.forEach((student) => studentSelect.add(new Option(`${student.name} · ${student.program}`, student.id)));
  if (result.items.length === 1) { studentSelect.value = result.items[0].id; await loadCourses(); }
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
    if (breadcrumbActive) breadcrumbActive.textContent = 'LMS Hamasah & Silabus Maddah';
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
    if (!response.ok || !LMS_VIEW_ROLES.includes(result.account.role)) throw new Error('Halaman ini hanya tersedia untuk santri, guru, pengawas, atau admin.');
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
  }
}());
