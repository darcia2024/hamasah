const portalLogin = document.querySelector('#portal-login');
const portalLoginForm = document.querySelector('#portal-login-form');
const portalLoginStatus = document.querySelector('#portal-login-status');
const portalConsole = document.querySelector('#portal-console');
const portalLogout = document.querySelector('#portal-logout');
const portalRoleLabel = document.querySelector('#portal-role-label');
const portalTitle = document.querySelector('#portal-title');
const studentsStatus = document.querySelector('#portal-students-status');
const studentList = document.querySelector('#portal-student-list');
const studentDashboard = document.querySelector('#student-dashboard');
const portalAdmin = document.querySelector('#portal-admin');
const accountForm = document.querySelector('#account-form');
const accountFormStatus = document.querySelector('#account-form-status');
const accountList = document.querySelector('#account-list');
const publicHeader = document.querySelector('#public-header');
const staffNav = document.querySelector('#staff-nav');
const crmPageTitle = document.querySelector('#crm-page-title');
const portalStudentsHeader = document.querySelector('#portal-students-header');

let currentAccount = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

const roleLabels = {
  admin: 'Portal Hamasah · Super Admin',
  'registration-officer': 'Portal Pendaftaran',
  supervisor: 'Konsol Musyrif Asrama',
  teacher: 'Portal Tenaga Pengajar',
  finance: 'Konsol Keuangan & SPP',
  parent: 'Portal Wali Santri',
  student: 'Portal Santri'
};

function getSession() {
  try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; }
}

function requestHeaders() {
  const session = getSession();
  return session ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

function setLoginError(message) {
  portalLoginStatus.textContent = message;
  portalLoginStatus.classList.add('is-error');
}

function metric(value, label) {
  const item = document.createElement('div');
  item.className = 'portal-metric';
  const number = document.createElement('strong');
  number.textContent = value;
  const copy = document.createElement('span');
  copy.textContent = label;
  item.append(number, copy);
  return item;
}

function formatWaktu(iso) {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatTanggal(iso) {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function renderBadgeIcon(icon) {
  if (!icon) return '';
  if (typeof icon === 'string' && icon.trim().startsWith('<svg')) return icon;
  switch (icon) {
    case 'mosque':
    case '🕌':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M4 10h16M6 10v10M18 10v10M10 10v10M14 10v10M12 6a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4z"/></svg>`;
    case 'book':
    case '📖':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>`;
    case 'cap':
    case 'graduation':
    case '🎓':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    case 'palm':
    case 'tree':
    case '🌴':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7"/><path d="M12 15c-3-2-5-6-5-10 4 0 7 2 8 6"/><path d="M12 15c3-2 5-6 5-10-4 0-7 2-8 6"/></svg>`;
    case 'note':
    case 'eval':
    case '📝':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;
    case 'warning':
    case '⚠️':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    case 'camel':
    case 'desert':
    case '🐪':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16M7 18v-4c0-2 1-3 3-3s3 1 3 3v4M13 11c0-2 1-3 3-3s3 1 3 3v7M4 14l2-4 3-1"/></svg>`;
    case 'building':
    case 'landmark':
    case '🏛️':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"/><line x1="4" y1="10" x2="20" y2="10"/><path d="m12 3 10 7H2l10-7z"/><line x1="6" y1="10" x2="6" y2="21"/><line x1="10" y1="10" x2="10" y2="21"/><line x1="14" y1="10" x2="14" y2="21"/><line x1="18" y1="10" x2="18" y2="21"/></svg>`;
    default:
      return icon;
  }
}

function createAltezzaCard(options) {
  const {
    badgeColor = 'yellow',
    badgeIcon = 'mosque',
    title = 'Sholat Subuh Berjamaah',
    subtitle = 'Hari ini',
    program = 'Al-Azhar · Markaz Kairo',
    route = 'Hay Asyir -> Masjid Al-Azhar',
    startTime = '04:30 CLT',
    finishTime = '05:30 CLT',
    dormUnit = 'Gedung Hay Asyir Lt. 3',
    itineraryStatus = 'OPEN',
    members = '12 Santri',
    requestType = 'Presensi Subuh',
    tourType = 'Wajib Berjamaah',
    statusText = 'Tour Complete',
    statusType = 'complete',
    note = 'Presensi diverifikasi musyrif tepat waktu.',
    actionBtnText = 'View note',
    onAction = null
  } = options;

  const card = document.createElement('div');
  card.className = 'crm-activity-card';

  card.innerHTML = `
    <!-- Header Row: Title & Subtitle + Header Actions -->
    <div class="crm-activity-card__header-row">
      <div class="crm-activity-card__title-col">
        <div class="crm-square-badge crm-square-badge--${badgeColor}">
          ${renderBadgeIcon(badgeIcon)}
        </div>
        <div style="min-width: 0; flex: 1;">
          <h3 class="crm-activity-card__name">${escapeHtml(title)}</h3>
          <div class="crm-activity-card__subtitle">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <div class="crm-activity-card__header-actions">
        <span class="crm-status-pill crm-status-pill--${escapeHtml(statusType)}">${escapeHtml(statusText)}</span>
        <button type="button" class="crm-icon-sub-btn crm-btn-more" title="More Actions" aria-label="More actions">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </button>
        <!-- Popover action dropdown -->
        <div class="crm-action-popover" hidden>
          <div class="crm-popover-header">MORE ACTION</div>
          <button type="button" class="crm-popover-item crm-action-edit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>Edit Data</span>
          </button>
          <button type="button" class="crm-popover-item crm-popover-item--danger crm-action-delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span>Hapus</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Upper multi-column grid -->
    <div class="crm-activity-card__upper">
      <!-- Col 1: Program / Halaqah -->
      <div class="crm-col-block">
        <label>HALAQAH &amp; PROGRAM</label>
        <span class="crm-check-list">${escapeHtml(program)}</span>
      </div>

      <!-- Col 2: Route / Lokasi -->
      <div class="crm-col-block">
        <label>LOKASI / MASJID</label>
        <span title="${escapeHtml(route)}">${escapeHtml(route)}</span>
      </div>

      <!-- Col 3: Start / Finish Time -->
      <div class="crm-col-block">
        <label>WAKTU KEGIATAN</label>
        <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${startTime} - ${finishTime}</span>
      </div>

      <!-- Col 4: Unit Asrama -->
      <div class="crm-col-block">
        <label>ASRAMA KAIRO</label>
        <span>${escapeHtml(dormUnit)}</span>
      </div>

      <!-- Col 5: Itinerary status -->
      <div class="crm-col-block">
        <label>STATUS ITINERARY</label>
        <span style="color: #059669; font-weight: 700;">${escapeHtml(itineraryStatus)}</span>
      </div>
    </div>

    <!-- Note snippet directly on card -->
    ${note ? `
    <div class="crm-activity-card__note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span>${escapeHtml(note)}</span>
    </div>
    ` : ''}

    <!-- Lower metadata and action row -->
    <div class="crm-activity-card__lower">
      <div class="crm-activity-card__meta-group">
        <div class="crm-meta-item">
          <label>PRESENSI SANTRI</label>
          <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>${members}</span>
        </div>
        <div class="crm-meta-item">
          <label>KATEGORI</label>
          <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>${requestType}</span>
        </div>
        <div class="crm-meta-item">
          <label>TIPE PEMBINAAN</label>
          <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${tourType}</span>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="crm-activity-card__actions">
        <button type="button" class="crm-action-link-btn crm-btn-view-note" title="${escapeHtml(actionBtnText)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>${escapeHtml(actionBtnText)}</span>
        </button>
      </div>
    </div>
  `;

  const moreBtn = card.querySelector('.crm-btn-more');
  const popover = card.querySelector('.crm-action-popover');
  const viewBtn = card.querySelector('.crm-btn-view-note');

  if (moreBtn && popover) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.hidden = !popover.hidden;
    });
    document.addEventListener('click', () => { popover.hidden = true; });
  }

  if (viewBtn) {
    if (onAction) {
      viewBtn.addEventListener('click', onAction);
    } else {
      viewBtn.addEventListener('click', () => {
        alert(`Catatan Pembina / Mutaba'ah:\n"${note}"`);
      });
    }
  }

  return card;
}

function createStudentCompactCard(student, idx, account, onOpen) {
  const card = document.createElement('div');
  card.className = 'crm-student-compact-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Buka detail rekam jejak ${student.name}`);

  const colors = ['yellow', 'orange', 'green', 'purple'];
  const badgeColor = colors[idx % colors.length];
  const dormText = student.dormitoryId ? 'Dorm Hay Asyir Lt. 3' : 'Markaz Kairo';
  const nimText = `NIM: 2026-AZH-00${idx + 1}`;
  const cityText = student.city || 'Kairo';
  const programText = student.program || 'Al-Azhar';

  card.innerHTML = `
    <div class="crm-student-compact-main">
      <div class="crm-square-badge crm-square-badge--${badgeColor}">
        ${renderBadgeIcon('cap')}
      </div>
      <div class="crm-student-compact-info">
        <div class="crm-student-compact-title-row">
          <h3 class="crm-student-compact-name">${student.name}</h3>
          <span class="crm-status-pill crm-status-pill--complete">Santri Terverifikasi</span>
        </div>
        <div class="crm-student-compact-meta">
          <span>${nimText}</span>
          <span class="crm-meta-dot">·</span>
          <span>Asal ${cityText}</span>
          <span class="crm-meta-dot">·</span>
          <span class="crm-student-compact-pill">${programText}</span>
          <span class="crm-meta-dot">·</span>
          <span class="crm-student-compact-dorm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="vertical-align: -2px; margin-right: 3px;"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            ${dormText}
          </span>
        </div>
      </div>
    </div>
    <div class="crm-student-compact-action">
      <span class="crm-student-compact-cta-label">Buka Detail</span>
      <div class="crm-student-compact-arrow">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
      <a href="portal.html?studentId=${encodeURIComponent(student.id)}" target="_blank" class="crm-student-compact-newtab" title="Buka di tab baru" aria-label="Buka di tab baru">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.crm-student-compact-newtab')) {
      return;
    }
    e.preventDefault();
    if (onOpen) onOpen();
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('.crm-student-compact-newtab')) {
        return;
      }
      e.preventDefault();
      if (onOpen) onOpen();
    }
  });

  return card;
}

function renderCrmDashboard(dashboard, account, onBack) {
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;
  if (portalStudentsHeader) portalStudentsHeader.hidden = true;
  const isStudent = account && account.role === 'student';
  const isParent = account && account.role === 'parent';
  const attendanceRate = dashboard.attendance.rate === null ? 100 : dashboard.attendance.rate;
  const student = dashboard.student;

  // Update Breadcrumb
  const pageTitleEl = document.querySelector('#crm-page-title');
  if (pageTitleEl) {
    pageTitleEl.textContent = `${student.name} (${isStudent ? 'Santri' : isParent ? 'Ananda' : 'Profil Santri'})`;
  }

  // If opened from executive dashboard, provide seamless back button
  if (onBack) {
    const backBar = document.createElement('div');
    backBar.style.display = 'flex';
    backBar.style.alignItems = 'center';
    backBar.style.justifyContent = 'space-between';
    backBar.style.marginBottom = '12px';
    backBar.innerHTML = `
      <button type="button" class="crm-topbar-action-btn" id="crm-back-btn" style="background: #FFFFFF; font-weight: 700; color: #0F172A; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        <span>Kembali ke Konsol Eksekutif</span>
      </button>
      <span style="font-size: 12.5px; font-weight: 600; color: #64748B;">Rekam Jejak CRM: <strong>${student.name}</strong></span>
    `;
    backBar.querySelector('#crm-back-btn').addEventListener('click', onBack);
    studentDashboard.append(backBar);
  }

  // 1. Altezza Top Detail Summary Profile Card
  const summaryCard = document.createElement('div');
  summaryCard.className = 'crm-summary-card';

  const latestEval = dashboard.evaluations.length
    ? dashboard.evaluations[0].note
    : "Santri istiqomah sholat berjamaah di markaz Hay Asyir, talaqqi kutub turots lancar dan berakhlak mulia.";

  summaryCard.innerHTML = `
    <!-- Col 1: Name, ID & Musyrif -->
    <div class="crm-summary-col">
      <div>
        <div class="crm-summary-title-row">
          <h2 class="crm-summary-title">${student.name}</h2>
          <svg class="crm-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </div>
        <p class="crm-summary-subtitle">${student.program} · Kairo (NIM: 2026-AZH-019)</p>
      </div>
      <div>
        <p class="crm-field-label">
          <span>MUSYRIF PENDAMPING</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        </p>
        <div class="crm-person-row">
          <div class="crm-person-avatar">RK</div>
          <span class="crm-person-name">Ust. Ridwan Kamil, Lc.</span>
        </div>
      </div>
    </div>

    <!-- Col 2: Academic Period & Asrama/Markaz -->
    <div class="crm-summary-col">
      <div>
        <p class="crm-field-label">PERIODE AKADEMIK</p>
        <div class="crm-field-value">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Semester Ganjil 2026/2027</span>
        </div>
      </div>
      <div>
        <p class="crm-field-label">
          <span>MARKAZ &amp; ASRAMA</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
        </p>
        <div class="crm-person-row">
          <div class="crm-person-avatar" style="background: #FEF3C7; color: #B45309;">HA</div>
          <span class="crm-person-name">Asrama Hay Asyir Kairo</span>
        </div>
      </div>
    </div>

    <!-- Col 3: Balance & SPP Status -->
    <div class="crm-summary-col">
      <div>
        <p class="crm-field-label">STATUS PEMBIAYAAN / SPP</p>
        <div class="crm-balance-value">
          <span class="crm-bullet-blue"></span>
          <span>Lunas (SPP &amp; Dorm)</span>
        </div>
      </div>
      <div>
        <p class="crm-field-label">PRESENSI IBADAH</p>
        <div class="crm-field-value">
          <span style="color: #16A34A;">●</span>
          <span>${attendanceRate}% Hadir (${dashboard.attendance.present || 0}/${dashboard.attendance.total || 0})</span>
        </div>
      </div>
    </div>

    <!-- Col 4: Note with Readmore link -->
    <div class="crm-summary-col">
      <div>
        <p class="crm-field-label">CATATAN PEMBINA</p>
        <p class="crm-summary-note">"${latestEval}"</p>
        <a class="crm-readmore-link" href="#evaluasi-section">Lihat Riwayat &amp; Evaluasi &rarr;</a>
      </div>
    </div>
  `;

  // 2. Horizontal Sub-Tabs Bar
  const subtabsRow = document.createElement('div');
  subtabsRow.className = 'crm-subtabs-row';

  const tabDefs = [
    { id: 'mutabaah', label: "Mutaba'ah & Ibadah", icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', count: dashboard.attendance.entries.length || 12 },
    { id: 'sholat', label: 'Sholat Berjamaah', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>', count: dashboard.attendance.present || 30 },
    { id: 'talaqqi', label: 'Talaqqi & Tahfidz', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>', count: dashboard.achievements.length || 8 },
    { id: 'dorm', label: 'Asrama Kairo', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>', count: 1 },
    { id: 'lms', label: 'Maddah Belajar LMS', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>', count: 6 },
    { id: 'admin', label: 'Administrasi & SPP', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>', count: 1 }
  ];

  const pillButtons = [];
  tabDefs.forEach((def, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `crm-pill-btn ${index === 0 ? 'is-active' : ''}`;
    btn.innerHTML = `${def.icon} <span>${def.label}</span> <span class="crm-pill-count">${def.count}</span>`;
    subtabsRow.append(btn);
    pillButtons.push(btn);
  });

  // 3. Sub-filter Bar & Yellow Action CTA
  const toolbar = document.createElement('div');
  toolbar.className = 'crm-toolbar';
  toolbar.innerHTML = `
    <div class="crm-toolbar-filters">
      <div class="crm-date-selector">
        <button type="button" class="crm-date-nav-btn" title="Pekan Sebelumnya" aria-label="Previous week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="crm-date-display">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Pekan Ini: 15 Sep - 21 Sep 2026</span>
        </div>
        <button type="button" class="crm-date-nav-btn" title="Pekan Selanjutnya" aria-label="Next week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <button type="button" class="crm-filter-dropdown" aria-label="Filter kategori">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        <span>Semua Aktivitas Mutaba'ah</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>

    <div class="crm-toolbar-actions">
      <button type="button" class="crm-btn-primary-yellow" id="btn-create-activity">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        <span>Input Mutaba'ah / Catatan</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
  `;

  // 4. Tab Panels Container
  const panelsContainer = document.createElement('div');
  panelsContainer.style.display = 'flex';
  panelsContainer.style.flexDirection = 'column';
  panelsContainer.style.gap = '16px';

  // --- PANEL 1: Mutaba'ah & Ibadah (Card Stack) ---
  const panelMutabaah = document.createElement('div');
  panelMutabaah.className = 'crm-card-stack';

  const defaultEntries = [
    {
      badgeColor: 'yellow',
      badgeIcon: 'mosque',
      title: 'Sholat Subuh Berjamaah & Dzikir Al-Ma\'tsurat',
      subtitle: 'Hari ini · 04:30 CLT',
      program: 'Al-Azhar · Markaz Kairo',
      route: 'Hay Asyir -> Masjid Al-Azhar',
      startTime: '04:30 CLT',
      finishTime: '05:45 CLT',
      dormUnit: 'Gedung Hay Asyir Lt. 3',
      itineraryStatus: 'VALID',
      members: '12 Santri',
      requestType: 'Sholat Wajib',
      tourType: 'Berjamaah Utama',
      statusText: 'Hadir Tepat Waktu',
      statusType: 'complete',
      note: 'Alhamdulillah santri hadir di shaf pertama dan mengikuti dzikir pagi berjamaah.'
    },
    {
      badgeColor: 'orange',
      badgeIcon: 'book',
      title: 'Talaqqi Matan Taqrib Fiqh Syafi\'i bersama Syekh',
      subtitle: 'Kemarin · 16:30 CLT',
      program: 'Turots Syafi\'i · Al-Azhar',
      route: 'Riwaq Al-Azhar Asy-Syarif',
      startTime: '16:30 CLT',
      finishTime: '18:00 CLT',
      dormUnit: 'Markaz Mahasiswa',
      itineraryStatus: 'OPEN',
      members: '18 Santri',
      requestType: 'Talaqqi Masyayikh',
      tourType: 'Kutub Turots',
      statusText: 'Mutaba\'ah Lengkap',
      statusType: 'complete',
      note: 'Membahas bab Sholat Jamak & Qashar dan menyetorkan hafalan bait matan.'
    },
    {
      badgeColor: 'green',
      badgeIcon: 'palm',
      title: 'Setoran Ziyadah Tahfidz Al-Qur\'an (Juz 28)',
      subtitle: '18 Sep 2026 · 19:30 CLT',
      program: 'Tahfidz Al-Qur\'an · Mutqin',
      route: 'Markaz Tahfidz Kairo',
      startTime: '19:30 CLT',
      finishTime: '20:30 CLT',
      dormUnit: 'Gedung Hay Asyir',
      itineraryStatus: 'MUMTAZ',
      members: '1 Santri',
      requestType: 'Tahfidz Ziyadah',
      tourType: 'Setoran Privat',
      statusText: 'Mumtaz Jayyid Jiddan',
      statusType: 'complete',
      note: 'Setoran lancar dengan tajwid makhraj fasih bersama musyrif tahfidz.'
    },
    {
      badgeColor: 'purple',
      badgeIcon: 'note',
      title: 'Evaluasi Pembinaan Akhlak & Ketertiban Asrama',
      subtitle: '17 Sep 2026 · Pekanan',
      program: 'Kedisiplinan · Adab Ma\'had',
      route: 'Asrama Hay Asyir Kairo',
      startTime: '20:00 CLT',
      finishTime: '21:00 CLT',
      dormUnit: 'Gedung Hay Asyir Lt. 3',
      itineraryStatus: 'EVALUASI',
      members: '12 Santri',
      requestType: 'Bimbingan Konseling',
      tourType: 'Halaqah Asrama',
      statusText: 'Disiplin Baik',
      statusType: 'complete',
      note: latestEval
    }
  ];

  // If dashboard has actual attendance entries, convert them into cards
  if (dashboard.attendance.entries.length) {
    const colors = ['yellow', 'orange', 'green', 'purple'];
    dashboard.attendance.entries.slice(0, 10).forEach((entry, idx) => {
      const color = colors[idx % colors.length];
      const isPresent = entry.status === 'present';
      const statusLabel = {
        present: 'Hadir Tepat Waktu',
        late: 'Terlambat',
        excused: 'Izin Sakit',
        absent: 'Alfa'
      }[entry.status] || entry.status;

      const card = createAltezzaCard({
        badgeColor: color,
        badgeIcon: isPresent ? 'mosque' : 'warning',
        title: `${entry.category || 'Sholat Berjamaah'}`,
        subtitle: formatWaktu(entry.occurredAt),
        program: 'Al-Azhar · Markaz Kairo',
        route: 'Masjid Markaz Hay Asyir, Kairo',
        startTime: formatWaktu(entry.occurredAt),
        finishTime: 'Selesai',
        dormUnit: 'Gedung Hay Asyir',
        itineraryStatus: isPresent ? 'TERVERIFIKASI' : 'PERHATIAN',
        members: '12 Santri',
        requestType: 'Mutaba\'ah Sholat',
        tourType: 'Wajib Berjamaah',
        statusText: statusLabel,
        statusType: isPresent ? 'complete' : entry.status === 'late' ? 'pending' : 'absent',
        note: entry.note || 'Tercatat dalam log mutaba\'ah asrama Kairo.'
      });
      panelMutabaah.append(card);
    });
  } else {
    // Render rich default entries for preview
    defaultEntries.forEach((entry) => {
      panelMutabaah.append(createAltezzaCard(entry));
    });
  }

  // --- PANEL 2: Sholat Berjamaah ---
  const panelSholat = document.createElement('div');
  panelSholat.className = 'crm-card-stack';
  panelSholat.hidden = true;
  ['Subuh Berjamaah', 'Dzuhur Berjamaah', 'Ashar Berjamaah', 'Maghrib Berjamaah', 'Isya Berjamaah'].forEach((sholatName, idx) => {
    panelSholat.append(createAltezzaCard({
      badgeColor: ['yellow', 'orange', 'green', 'purple', 'yellow'][idx],
      badgeIcon: 'mosque',
      title: `${sholatName} di Masjid Markaz Kairo`,
      subtitle: `Presensi Istiqomah Pekan Ini`,
      program: 'Al-Azhar · Markaz Kairo',
      route: 'Masjid Asrama Hay Asyir',
      startTime: 'Sesuai Waktu Sholat',
      finishTime: 'Selesai Berjamaah',
      dormUnit: 'Gedung Hay Asyir',
      itineraryStatus: 'TERJADWAL',
      members: '12 Santri',
      requestType: 'Sholat 5 Waktu',
      tourType: 'Fardhu Berjamaah',
      statusText: 'Hadir Istiqomah',
      statusType: 'complete',
      note: 'Wajib dilaksanakan berjamaah bersama seluruh santri di bawah pengawasan musyrif.'
    }));
  });

  // --- PANEL 3: Talaqqi & Tahfidz ---
  const panelTalaqqi = document.createElement('div');
  panelTalaqqi.className = 'crm-card-stack';
  panelTalaqqi.hidden = true;
  if (dashboard.achievements.length) {
    dashboard.achievements.forEach((ach, idx) => {
      panelTalaqqi.append(createAltezzaCard({
        badgeColor: 'green',
        badgeIcon: 'book',
        title: ach.title,
        subtitle: formatWaktu(ach.occurredAt),
        program: 'Sanad Al-Azhar · Matan Turots',
        route: 'Masjid Al-Azhar / Riwaq',
        startTime: formatWaktu(ach.occurredAt),
        finishTime: 'Tuntas',
        dormUnit: 'Markaz Kairo',
        itineraryStatus: 'MUMTAZ',
        members: 'Mandiri',
        requestType: 'Setoran Prestasi',
        tourType: 'Tahfidz / Matan',
        statusText: 'Capaian Mumtaz',
        statusType: 'complete',
        note: ach.description || 'Setoran tuntas terverifikasi asatidzah.'
      }));
    });
  } else {
    panelTalaqqi.append(createAltezzaCard({
      badgeColor: 'green',
      badgeIcon: 'book',
      title: 'Talaqqi Matan Al-Jurumiyyah & Tuhfatul Athfal',
      subtitle: 'Target Semester Ganjil',
      program: 'Matan Tajwid · Lughah Arabiyyah',
      route: 'Riwaq Al-Azhar Asy-Syarif',
      startTime: 'Pekan Berjalan',
      finishTime: 'Ujian Akhir',
      dormUnit: 'Hay Asyir',
      itineraryStatus: 'BERLANGSUNG',
      members: '12 Santri',
      requestType: 'Kutub Turots',
      tourType: 'Kurikulum Resmi',
      statusText: 'Progres 85%',
      statusType: 'complete',
      note: 'Santri telah menyetorkan bab Idgham dan Mad sampai bait akhir.'
    }));
  }

  // --- PANEL 4: Asrama Kairo ---
  const panelDorm = document.createElement('div');
  panelDorm.className = 'crm-white-card';
  panelDorm.hidden = true;
  panelDorm.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Fasilitas &amp; Markaz Asrama di Kairo</h3>
        <p>Gedung asrama terpadu, lingkungan kondusif, dan pengawalan musyrif 24 jam di Republik Arab Mesir.</p>
      </div>
      <a href="kontak.html" class="crm-topbar-action-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Direktori Hotline Kairo</span>
      </a>
    </div>
    <div class="crm-grid-2col">
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </div>
        <div>
          <strong>Gedung Hay Asyir, Madinat Nasr</strong>
          <p>Dekat dengan kampus Universitas Al-Azhar dan Masjid Al-Azhar, Kairo.</p>
        </div>
      </div>
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <strong>Pengawalan Musyrif Siaga 24 Jam</strong>
          <p>Dibimbing langsung oleh asatidzah Al-Azhar berdedikasi menjaga keselamatan dan kedisiplinan santri.</p>
        </div>
      </div>
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
        </div>
        <div>
          <strong>Katering Masakan Nusantara 3x Sehari</strong>
          <p>Menu khas Indonesia yang higienis, bergizi seimbang, dan halal terjamin.</p>
        </div>
      </div>
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
        </div>
        <div>
          <strong>Kamar Nyaman, AC &amp; Wi-Fi Fiber</strong>
          <p>Kamar berpendingin udara, kasur empuk, lemari pribadi, dan jaringan internet stabil untuk belajar.</p>
        </div>
      </div>
    </div>
  `;

  // --- PANEL 5: Maddah Belajar (LMS) ---
  const panelLms = document.createElement('div');
  panelLms.className = 'crm-white-card';
  panelLms.hidden = true;
  panelLms.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Maddah Silabus Kurikulum Al-Azhar</h3>
        <p>Mata pelajaran diniyah, lughah Arabiyyah, nahwu, balaghah, dan fiqh yang sedang dipelajari santri.</p>
      </div>
      <a href="lms.html" class="crm-btn-primary-yellow" style="height: 36px; padding: 0 14px; font-size: 12.5px;">
        <span>Buka Ruang Belajar (LMS)</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </a>
    </div>
    <div id="crm-student-courses">
      <p style="color: #64748B; font-size: 13px;">Memuat silabus maddah belajar...</p>
    </div>
  `;

  // Fetch student courses in background
  fetch(`/api/students/${encodeURIComponent(student.id)}/courses`, { headers: requestHeaders() })
    .then((res) => res.json())
    .then((data) => {
      const container = panelLms.querySelector('#crm-student-courses');
      if (!container) return;
      if (!data.items || !data.items.length) {
        container.innerHTML = '<p style="color: #64748B; font-size: 13px;">Belum ada maddah terdaftar untuk semester berjalan.</p>';
        return;
      }
      container.replaceChildren();
      const grid = document.createElement('div');
      grid.className = 'crm-grid-2col';
      data.items.forEach((course) => {
        const item = document.createElement('div');
        item.className = 'crm-feature-box';
        item.innerHTML = `
          <div class="crm-feature-box-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>
          </div>
          <div style="flex: 1;">
            <strong>${course.title}</strong>
            <p>${course.materials ? course.materials.length : 0} modul · Progres ${course.progress || 0}%</p>
            <div style="margin-top: 8px; height: 6px; background: #E2E8F0; border-radius: 999px; overflow: hidden;">
              <div style="width: ${course.progress || 0}%; height: 100%; background: #FFC42C; border-radius: 999px;"></div>
            </div>
          </div>
        `;
        grid.append(item);
      });
      container.append(grid);
    })
    .catch(() => {});

  // --- PANEL 6: Administrasi & SPP ---
  const panelAdmin = document.createElement('div');
  panelAdmin.className = 'crm-white-card';
  panelAdmin.hidden = true;
  panelAdmin.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Rincian Administrasi &amp; Transparansi SPP</h3>
        <p>Prinsip transparansi penuh: biaya resmi terbit bertahap, kuitansi sah tervalidasi, tanpa pungutan liar.</p>
      </div>
      <a href="/api/students/${encodeURIComponent(student.id)}/report" download class="crm-topbar-action-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Unduh Ringkasan Rekam Jejak (CSV)</span>
      </a>
    </div>
    <div class="crm-grid-2col">
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        <div>
          <strong>Status SPP &amp; Akomodasi: Lunas</strong>
          <p>Mencakup asrama AC di Kairo, katering 3x sehari, talaqqi masyayikh Al-Azhar, dan visa resmi.</p>
        </div>
      </div>
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <strong>Garansi Tanpa Biaya Siluman</strong>
          <p>Setiap pembayaran tervalidasi oleh kuitansi resmi bertanda tangan digital divisi keuangan.</p>
        </div>
      </div>
    </div>
  `;

  // Tab switching logic with smooth transition
  const panels = [panelMutabaah, panelSholat, panelTalaqqi, panelDorm, panelLms, panelAdmin];

  pillButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      pillButtons.forEach((b) => b.classList.remove('is-active'));
      panels.forEach((p) => {
        p.hidden = true;
        p.classList.remove('crm-tab-enter');
      });
      btn.classList.add('is-active');
      panels[index].hidden = false;
      panels[index].classList.add('crm-tab-enter');
    });
  });

  panelsContainer.append(panelMutabaah, panelSholat, panelTalaqqi, panelDorm, panelLms, panelAdmin);

  // Append everything into studentDashboard with smooth view transition
  studentDashboard.append(summaryCard, subtabsRow, toolbar, panelsContainer);
  studentDashboard.classList.add('crm-view-enter');
  studentDashboard.hidden = false;
}

function renderExecutiveDashboard(students, account, accountsList = []) {
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;
  if (portalStudentsHeader) portalStudentsHeader.hidden = true;

  const isAdmin = account && account.role === 'admin';
  const isSupervisor = account && account.role === 'supervisor';
  const isParent = account && account.role === 'parent';

  // Update Breadcrumb
  if (crmPageTitle) {
    crmPageTitle.textContent = isAdmin
      ? 'Konsol Super Admin'
      : isSupervisor
      ? 'Konsol Musyrif Asrama'
      : 'Pantau Ananda Kairo';
  }

  // Coursue 3-Column Layout Shell
  const coursueLayout = document.createElement('div');
  coursueLayout.className = 'coursue-layout';

  const mainCol = document.createElement('div');
  mainCol.className = 'coursue-main-col';

  const rightPanel = document.createElement('div');
  rightPanel.className = 'coursue-right-panel';

  const titleText = isAdmin
    ? 'Pusat Pembinaan & Studi Islam Al-Azhar Kairo'
    : isSupervisor
    ? 'Konsol Pembinaan Musyrif Kairo'
    : 'Pemantauan Ananda di Republik Arab Mesir';

  const subtitleText = isAdmin
    ? `Super Admin · Markaz Utama Hay Asyir & Dokki · ${students.length} Santri Binaan aktif terdaftar.`
    : isSupervisor
    ? `Asrama Hay Asyir Madinat Nasr · ${students.length} Santri Binaan dalam pengawasan.`
    : `Laporan Terpadu Perkembangan Santri · ${students.length} Ananda istiqomah di Kairo.`;

  // 1. Coursue Hero Banner
  const heroBanner = document.createElement('div');
  heroBanner.className = 'coursue-hero-banner';
  heroBanner.innerHTML = `
    <div class="coursue-hero-tag">${isAdmin ? 'KONSOL EKSEKUTIF AL-AZHAR' : 'MARKAZ ASRAMA KAIRO'}</div>
    <h2 class="coursue-hero-title">${titleText}</h2>
    <p class="coursue-hero-subtitle">${subtitleText}</p>
    <button type="button" class="coursue-hero-cta" id="btn-hero-action">
      <span>${isAdmin ? 'Buka Rekam Jejak Santri' : 'Lihat Mutaba\'ah Terkini'}</span>
      <span class="coursue-hero-cta-arrow">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </span>
    </button>
  `;

  // 2. Coursue Row of 3 Stat Pills
  const statRow = document.createElement('div');
  statRow.className = 'coursue-stat-row';
  statRow.innerHTML = `
    <div class="coursue-stat-pill">
      <div class="coursue-stat-icon coursue-stat-icon--gold">${renderBadgeIcon('mosque')}</div>
      <div class="coursue-stat-meta">
        <p class="coursue-stat-count">${students.length} Santri Binaan</p>
        <p class="coursue-stat-label">Talaqqi Turots</p>
      </div>
    </div>
    <div class="coursue-stat-pill">
      <div class="coursue-stat-icon coursue-stat-icon--pink">${renderBadgeIcon('book')}</div>
      <div class="coursue-stat-meta">
        <p class="coursue-stat-count">30 Juz Mutqin</p>
        <p class="coursue-stat-label">Tahfidz Al-Qur'an</p>
      </div>
    </div>
    <div class="coursue-stat-pill">
      <div class="coursue-stat-icon coursue-stat-icon--cyan">${renderBadgeIcon('cap')}</div>
      <div class="coursue-stat-meta">
        <p class="coursue-stat-count">98.6% Istiqomah</p>
        <p class="coursue-stat-label">Presensi Sholat</p>
      </div>
    </div>
  `;

  // 3. Featured Courses / Halaqah Section (Coursue Grid of 3 Cards)
  const featuredSection = document.createElement('div');
  featuredSection.innerHTML = `
    <div class="coursue-section-header">
      <h3 class="coursue-section-title">Halaqah &amp; Program Unggulan Kairo</h3>
      <div class="coursue-nav-arrows">
        <button type="button" class="coursue-arrow-btn" aria-label="Previous">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button type="button" class="coursue-arrow-btn coursue-arrow-btn--active" aria-label="Next">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </div>
    <div class="coursue-cards-grid">
      <div class="coursue-card">
        <div class="coursue-card-cover" style="background: #0F172A;">
          <span class="coursue-card-pill coursue-card-pill--gold">TUROTS SYAFI'I</span>
        </div>
        <div class="coursue-card-body">
          <h4 class="coursue-card-title">Daurah Matan Al-Ghayah wa At-Taqrib (Fiqh Ibadah)</h4>
          <div class="coursue-card-footer">
            <div class="coursue-mentor-avatar">AF</div>
            <span class="coursue-mentor-name">Ust. Ahmad Fauzi, Lc.</span>
          </div>
        </div>
      </div>
      <div class="coursue-card">
        <div class="coursue-card-cover" style="background: #065F46;">
          <span class="coursue-card-pill coursue-card-pill--cyan">TAHFIDZ AL-QUR'AN</span>
        </div>
        <div class="coursue-card-body">
          <h4 class="coursue-card-title">Tahsin Makharij &amp; Setoran Sanad Al-Jazariyyah</h4>
          <div class="coursue-card-footer">
            <div class="coursue-mentor-avatar">MR</div>
            <span class="coursue-mentor-name">Ust. Muhammad Ridwan, Lc.</span>
          </div>
        </div>
      </div>
      <div class="coursue-card">
        <div class="coursue-card-cover" style="background: #701A75;">
          <span class="coursue-card-pill coursue-card-pill--pink">MUTABA'AH ASRAMA</span>
        </div>
        <div class="coursue-card-body">
          <h4 class="coursue-card-title">Sholat Fardhu Berjamaah &amp; Kedisiplinan Hay Asyir</h4>
          <div class="coursue-card-footer">
            <div class="coursue-mentor-avatar">SA</div>
            <span class="coursue-mentor-name">Syekh Riwaq Al-Azhar</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // 4. Horizontal Subtabs Row
  const subtabsRow = document.createElement('div');
  subtabsRow.className = 'crm-subtabs-row';

  const tabDefs = [
    {
      id: 'students',
      label: isParent ? 'Daftar Ananda' : 'Daftar Santri Binaan',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      count: students.length
    },
    {
      id: 'mutabaah',
      label: "Mutaba'ah & Ibadah",
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      count: 12
    },
    {
      id: 'sholat',
      label: 'Sholat Berjamaah',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
      count: 30
    },
    {
      id: 'talaqqi',
      label: 'Talaqqi & Tahfidz',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
      count: 8
    },
    {
      id: 'dorm',
      label: 'Asrama & Fasilitas',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>',
      count: 1
    },
    {
      id: 'lms',
      label: 'Maddah Belajar LMS',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>',
      count: 6
    }
  ];

  if (isAdmin) {
    tabDefs.push({
      id: 'accounts',
      label: 'Kelola Akun Internal',
      icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      count: accountsList ? accountsList.length : 7
    });
  }

  const pillButtons = [];
  tabDefs.forEach((def, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `crm-pill-btn ${index === 0 ? 'is-active' : ''}`;
    btn.innerHTML = `${def.icon} <span>${def.label}</span> <span class="crm-pill-count" id="tab-count-${def.id}">${def.count}</span>`;
    subtabsRow.append(btn);
    pillButtons.push(btn);
  });

  // 3. Filter Toolbar with Date Selector and Yellow Action CTA
  const toolbar = document.createElement('div');
  toolbar.className = 'crm-toolbar';
  toolbar.innerHTML = `
    <div class="crm-toolbar-filters">
      <div class="crm-date-selector">
        <button type="button" class="crm-date-nav-btn" title="Pekan Sebelumnya" aria-label="Previous week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="crm-date-display">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span id="crm-exec-date-label">Pekan Ini: 15 Sep - 21 Sep 2026</span>
        </div>
        <button type="button" class="crm-date-nav-btn" title="Pekan Selanjutnya" aria-label="Next week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <button type="button" class="crm-filter-dropdown" id="crm-exec-filter" aria-label="Filter kategori">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        <span>Semua Santri &amp; Halaqah</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>

    <div class="crm-toolbar-actions">
      <button type="button" class="crm-btn-primary-yellow" id="btn-exec-create-activity">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        <span>${isAdmin ? 'Input Akun / Mutaba\'ah' : 'Input Catatan Pembinaan'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
  `;

  // Hook date nav buttons
  const prevDateBtn = toolbar.querySelector('.crm-date-nav-btn[title="Pekan Sebelumnya"]');
  const nextDateBtn = toolbar.querySelector('.crm-date-nav-btn[title="Pekan Selanjutnya"]');
  const dateLabel = toolbar.querySelector('#crm-exec-date-label');
  if (prevDateBtn && nextDateBtn && dateLabel) {
    prevDateBtn.addEventListener('click', () => {
      dateLabel.textContent = 'Pekan Sebelumnya: 08 Sep - 14 Sep 2026';
    });
    nextDateBtn.addEventListener('click', () => {
      dateLabel.textContent = 'Pekan Depan: 22 Sep - 28 Sep 2026';
    });
  }

  // Hook yellow button
  const yellowBtn = toolbar.querySelector('#btn-exec-create-activity');
  if (yellowBtn) {
    yellowBtn.addEventListener('click', () => {
      if (isAdmin) {
        const accTabBtn = pillButtons[pillButtons.length - 1];
        if (accTabBtn) accTabBtn.click();
        const nameInput = document.querySelector('#account-name');
        if (nameInput) nameInput.focus();
      } else {
        alert("Pencatatan mutaba'ah santri: Silakan klik 'Buka Rekam Jejak CRM' pada salah satu kartu santri untuk mengisi catatan pembinaan.");
      }
    });
  }

  // 4. Tab Panels
  const panelsContainer = document.createElement('div');
  panelsContainer.style.display = 'flex';
  panelsContainer.style.flexDirection = 'column';
  panelsContainer.style.gap = '16px';
  panelsContainer.style.width = '100%';

  // --- PANEL 1: DAFTAR SANTRI BINAAN ---
  const panelStudents = document.createElement('div');
  panelStudents.className = 'crm-card-stack';

  const colors = ['yellow', 'orange', 'green', 'purple'];
  const badges = ['cap', 'mosque', 'book', 'building'];

  if (!students.length) {
    const empty = document.createElement('div');
    empty.className = 'crm-white-card';
    empty.style.padding = '24px';
    empty.textContent = 'Belum ada santri yang terhubung dengan akun ini.';
    panelStudents.append(empty);
  } else {
    students.forEach((student, idx) => {
      const card = createStudentCompactCard(
        student,
        idx,
        account,
        () => {
          loadDashboard(student.id, account, () => renderExecutiveDashboard(students, account, accountsList)).catch((err) => {
            alert(err.message || 'Dashboard belum dapat dimuat.');
          });
        }
      );
      panelStudents.append(card);
    });
  }

  // --- PANEL 2: Mutaba'ah & Ibadah ---
  const panelMutabaah = document.createElement('div');
  panelMutabaah.className = 'crm-card-stack';
  panelMutabaah.hidden = true;
  [
    {
      badgeColor: 'yellow',
      badgeIcon: 'mosque',
      title: 'Sholat Subuh Berjamaah Seluruh Santri di Masjid Markaz',
      subtitle: 'Hari ini · 04:30 CLT',
      program: 'Al-Azhar · Markaz Kairo',
      route: 'Asrama Hay Asyir -> Masjid Al-Azhar',
      startTime: '04:30 CLT',
      finishTime: '05:45 CLT',
      dormUnit: 'Gedung Hay Asyir Lt. 3',
      itineraryStatus: 'VALID',
      members: `${students.length} Santri Hadir Penuh`,
      requestType: 'Presensi Subuh',
      tourType: 'Wajib Berjamaah',
      statusText: '100% Hadir Tepat Waktu',
      statusType: 'complete',
      note: 'Alhamdulillah seluruh santri bangun sebelum adzan dan menempati shaf terdepan didampingi musyrif.'
    },
    {
      badgeColor: 'orange',
      badgeIcon: 'book',
      title: 'Talaqqi Kutub Turots: Fiqh Syafi\'i & Nahwu Bersama Masyayikh',
      subtitle: 'Kemarin · 16:30 CLT',
      program: 'Turots Syafi\'i · Al-Azhar',
      route: 'Riwaq Al-Azhar Asy-Syarif',
      startTime: '16:30 CLT',
      finishTime: '18:00 CLT',
      dormUnit: 'Markaz Mahasiswa',
      itineraryStatus: 'TERLAKSANA',
      members: `${students.length} Santri`,
      requestType: 'Talaqqi Masyayikh',
      tourType: 'Daurah Ilmiah',
      statusText: 'Tuntas & Berfaedah',
      statusType: 'complete',
      note: 'Pembahasan matan Taqrib bab Thaharah dan Sholat Jamak Qashar serta setoran hafal bait matan.'
    },
    {
      badgeColor: 'green',
      badgeIcon: 'palm',
      title: 'Ziyadah & Muraja\'ah Tahfidz Al-Qur\'an Berkelanjutan',
      subtitle: '18 Sep 2026 · 19:30 CLT',
      program: 'Tahfidz Al-Qur\'an · Mutqin',
      route: 'Markaz Tahfidz Kairo',
      startTime: '19:30 CLT',
      finishTime: '20:30 CLT',
      dormUnit: 'Gedung Hay Asyir',
      itineraryStatus: 'MUMTAZ',
      members: `${students.length} Santri`,
      requestType: 'Halaqah Tahfidz',
      tourType: 'Setoran Rutin',
      statusText: 'Capaian Jayyid Jiddan',
      statusType: 'complete',
      note: 'Setiap santri menyetorkan 1 lembar ziyadah baru dan 1 juz muraja\'ah hafalan mutqin.'
    },
    {
      badgeColor: 'purple',
      badgeIcon: 'note',
      title: 'Evaluasi Kedisiplinan Asrama & Bimbingan Konseling Musyrif',
      subtitle: '17 Sep 2026 · Pekanan',
      program: 'Kedisiplinan · Adab Ma\'had',
      route: 'Asrama Hay Asyir Kairo',
      startTime: '20:00 CLT',
      finishTime: '21:00 CLT',
      dormUnit: 'Gedung Hay Asyir Lt. 3',
      itineraryStatus: 'EVALUASI',
      members: `${students.length} Santri`,
      requestType: 'Bimbingan Konseling',
      tourType: 'Halaqah Asrama',
      statusText: 'Disiplin Sangat Baik',
      statusType: 'complete',
      note: 'Evaluasi pekanan berjalan tertib. Tidak ditemukan pelanggaran jam malam maupun kebersihan kamar.'
    }
  ].forEach((entry) => {
    panelMutabaah.append(createAltezzaCard(entry));
  });

  // --- PANEL 3: Sholat Berjamaah ---
  const panelSholat = document.createElement('div');
  panelSholat.className = 'crm-card-stack';
  panelSholat.hidden = true;
  ['Subuh Berjamaah', 'Dzuhur Berjamaah', 'Ashar Berjamaah', 'Maghrib Berjamaah', 'Isya Berjamaah'].forEach((sholatName, idx) => {
    panelSholat.append(createAltezzaCard({
      badgeColor: ['yellow', 'orange', 'green', 'purple', 'yellow'][idx],
      badgeIcon: 'mosque',
      title: `${sholatName} di Masjid Markaz Kairo`,
      subtitle: `Presensi Istiqomah Pekan Ini`,
      program: 'Al-Azhar · Markaz Kairo',
      route: 'Masjid Asrama Hay Asyir',
      startTime: 'Sesuai Waktu Sholat Kairo',
      finishTime: 'Selesai Berjamaah',
      dormUnit: 'Gedung Hay Asyir',
      itineraryStatus: 'TERJADWAL',
      members: `${students.length} Santri`,
      requestType: 'Sholat 5 Waktu',
      tourType: 'Fardhu Berjamaah',
      statusText: 'Hadir Istiqomah',
      statusType: 'complete',
      note: 'Wajib dilaksanakan berjamaah bersama seluruh santri di bawah pengawasan musyrif.'
    }));
  });

  // --- PANEL 4: Talaqqi & Tahfidz ---
  const panelTalaqqi = document.createElement('div');
  panelTalaqqi.className = 'crm-card-stack';
  panelTalaqqi.hidden = true;
  [
    {
      badgeColor: 'green',
      badgeIcon: 'book',
      title: 'Talaqqi Matan Al-Jurumiyyah & Tuhfatul Athfal',
      subtitle: 'Target Semester Ganjil',
      program: 'Matan Tajwid · Lughah Arabiyyah',
      route: 'Riwaq Al-Azhar Asy-Syarif',
      startTime: 'Pekan Berjalan',
      finishTime: 'Ujian Akhir',
      dormUnit: 'Hay Asyir',
      itineraryStatus: 'BERLANGSUNG',
      members: `${students.length} Santri`,
      requestType: 'Kutub Turots',
      tourType: 'Kurikulum Resmi',
      statusText: 'Progres 85%',
      statusType: 'complete',
      note: 'Santri telah menyetorkan bab Idgham, Mad, dan kaidah I\'rab nahwu dasar.'
    },
    {
      badgeColor: 'yellow',
      badgeIcon: 'palm',
      title: 'Setoran Hafalan Al-Qur\'an Mutqin 30 Juz',
      subtitle: 'Halaqah Tahfidz Asrama',
      program: 'Sanad Al-Azhar · Tahfidz',
      route: 'Markaz Tahfidz Kairo',
      startTime: 'Senin & Kamis 19:30',
      finishTime: 'Tuntas Ujian',
      dormUnit: 'Hay Asyir Lt. 3',
      itineraryStatus: 'MUMTAZ',
      members: `${students.length} Santri`,
      requestType: 'Tahfidz Al-Qur\'an',
      tourType: 'Setoran Privat',
      statusText: 'Lancar & Fashih',
      statusType: 'complete',
      note: 'Hafalan disimak dengan tajwid tartil dan talaqqi makharijul huruf.'
    }
  ].forEach((entry) => {
    panelTalaqqi.append(createAltezzaCard(entry));
  });

  // --- PANEL 5: Asrama Kairo ---
  const panelDorm = document.createElement('div');
  panelDorm.className = 'crm-white-card';
  panelDorm.hidden = true;
  panelDorm.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Fasilitas &amp; Markaz Asrama di Kairo</h3>
        <p>Gedung asrama terpadu, lingkungan kondusif, dan pengawalan musyrif 24 jam di Republik Arab Mesir.</p>
      </div>
      <a href="kontak.html" class="crm-topbar-action-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Direktori Hotline Kairo</span>
      </a>
    </div>
    <div class="crm-grid-2col">
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>
        <div>
          <strong>Gedung Hay Asyir, Madinat Nasr</strong>
          <p>Dekat dengan kampus Universitas Al-Azhar dan Masjid Al-Azhar, Kairo.</p>
        </div>
      </div>
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <div>
          <strong>Pengawalan Musyrif Siaga 24 Jam</strong>
          <p>Dibimbing langsung oleh asatidzah Al-Azhar berdedikasi menjaga keselamatan dan kedisiplinan santri.</p>
        </div>
      </div>
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg></div>
        <div>
          <strong>Katering Masakan Nusantara 3x Sehari</strong>
          <p>Menu khas Indonesia yang higienis, bergizi seimbang, dan halal terjamin.</p>
        </div>
      </div>
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg></div>
        <div>
          <strong>Kamar Nyaman, AC &amp; Wi-Fi Fiber</strong>
          <p>Kamar berpendingin udara, kasur empuk, lemari pribadi, dan jaringan internet stabil untuk belajar.</p>
        </div>
      </div>
    </div>
  `;

  // --- PANEL 6: Maddah Belajar LMS ---
  const panelLms = document.createElement('div');
  panelLms.className = 'crm-white-card';
  panelLms.hidden = true;
  panelLms.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Maddah Silabus Kurikulum Al-Azhar</h3>
        <p>Mata pelajaran diniyah, lughah Arabiyyah, nahwu, balaghah, dan fiqh yang sedang dipelajari santri.</p>
      </div>
      <a href="lms.html" class="crm-btn-primary-yellow" style="height: 36px; padding: 0 14px; font-size: 12.5px;">
        <span>Buka Ruang Belajar (LMS)</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </a>
    </div>
    <div class="crm-grid-2col">
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg></div>
        <div style="flex: 1;">
          <strong>Matan Al-Jurumiyyah (Nahwu)</strong>
          <p>Progress akan muncul setelah data pembelajaran santri tersedia.</p>
        </div>
      </div>
      <div class="crm-feature-box">
        <div class="crm-feature-box-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg></div>
        <div style="flex: 1;">
          <strong>Matan Ghoyah wa Taqrib (Fiqh)</strong>
          <p>Progress akan muncul setelah data pembelajaran santri tersedia.</p>
        </div>
      </div>
    </div>
  `;

  // --- PANEL 7: Kelola Akun & Hak Akses (Admin only) ---
  const panelAccounts = document.createElement('div');
  panelAccounts.hidden = true;
  if (isAdmin && portalAdmin) {
    panelAccounts.append(portalAdmin);
    portalAdmin.hidden = false;
  }

  // Tab switching logic with smooth transition
  const panels = [panelStudents, panelMutabaah, panelSholat, panelTalaqqi, panelDorm, panelLms];
  if (isAdmin) panels.push(panelAccounts);

  pillButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      pillButtons.forEach((b) => b.classList.remove('is-active'));
      panels.forEach((p) => {
        p.hidden = true;
        p.classList.remove('crm-tab-enter');
      });
      btn.classList.add('is-active');
      panels[index].hidden = false;
      panels[index].classList.add('crm-tab-enter');
    });
  });

  panelsContainer.append(panelStudents, panelMutabaah, panelSholat, panelTalaqqi, panelDorm, panelLms);
  if (isAdmin) panelsContainer.append(panelAccounts);

  // Right Panel: Statistic Card + Mentors Card
  const userInitial = account && account.name ? account.name.charAt(0).toUpperCase() : 'U';
  const userName = account && account.name ? account.name.split(' ')[0] : 'Ustadz';

  const statCard = document.createElement('div');
  statCard.className = 'coursue-statistic-card';
  statCard.innerHTML = `
    <div class="coursue-stat-card-header">
      <h3>Statistik Pekanan</h3>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
    </div>
    <div class="coursue-circle-progress">
      <svg class="coursue-circle-svg" viewBox="0 0 100 100">
        <circle class="coursue-circle-bg" cx="50" cy="50" r="42"></circle>
        <circle class="coursue-circle-bar" cx="50" cy="50" r="42"></circle>
      </svg>
      <div class="coursue-circle-avatar">${userInitial}</div>
    </div>
    <h4 class="coursue-user-greeting">Assalamu'alaikum, ${userName}</h4>
    <p class="coursue-user-subtext">Ringkasan akan terisi setelah aktivitas santri tercatat dalam sistem.</p>
    <p class="coursue-user-subtext">Belum ada rangkaian aktivitas untuk grafik periode ini.</p>
  `;

  const mentorCard = document.createElement('div');
  mentorCard.className = 'coursue-mentor-card';
  mentorCard.innerHTML = `
    <div class="coursue-mentor-header">
      <h3>Musyrif &amp; Asatidzah</h3>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
    </div>
    <div class="coursue-mentor-list">
      <p class="coursue-user-subtext">Data musyrif dan asatidzah akan muncul setelah penugasan tercatat.</p>
    </div>
  `;

  rightPanel.append(statCard, mentorCard);

  // Hook hero button
  const heroBtn = heroBanner.querySelector('#btn-hero-action');
  if (heroBtn) {
    heroBtn.addEventListener('click', () => {
      if (students.length > 0) {
        loadDashboard(students[0].id, account, () => renderExecutiveDashboard(students, account, accountsList)).catch((err) => {
          alert(err.message || 'Dashboard belum dapat dimuat.');
        });
      }
    });
  }

  // Assemble main column
  mainCol.append(heroBanner, statRow, featuredSection, subtabsRow, toolbar, panelsContainer);

  // Assemble 3-column layout
  coursueLayout.append(mainCol, rightPanel);
  coursueLayout.classList.add('crm-view-enter');

  studentDashboard.append(coursueLayout);
  studentDashboard.hidden = false;
}

async function loadDashboard(studentId, account, onBack) {
  const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/dashboard`, { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Dashboard belum dapat dimuat.');

  // Update URL hash for deep linking
  try {
    if (window.location.hash !== `#student=${studentId}`) {
      history.replaceState(null, '', `#student=${studentId}`);
    }
  } catch {}

  const wrappedOnBack = onBack ? () => {
    try {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
      }
    } catch {}
    onBack();
  } : null;

  renderCrmDashboard(result.dashboard, account || currentAccount, wrappedOnBack);
}

function renderStudents(students, account) {
  studentList.replaceChildren();
  studentDashboard.hidden = true;

  if (!students.length) {
    const empty = document.createElement('div');
    empty.className = 'crm-white-card';
    empty.style.padding = '24px';
    empty.textContent = 'Belum ada santri yang terhubung dengan akun ini.';
    studentList.append(empty);
    return;
  }

  if (account && (account.role === 'student' || (account.role === 'parent' && students.length === 1))) {
    studentList.hidden = true;
    return;
  }
}

async function loadAccounts() {
  const response = await fetch('/api/accounts', { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Daftar akun belum dapat dimuat.');
  renderAccounts(result.items);
  return result.items || [];
}

async function loadStudents(account) {
  studentsStatus.classList.remove('is-error');
  studentsStatus.textContent = 'Memuat data santri...';
  const response = await fetch('/api/my-students', { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Data santri belum dapat dimuat.');

  const students = result.items || [];

  const urlParams = new URLSearchParams(window.location.search);
  const targetStudentId = urlParams.get('studentId') || (window.location.hash.startsWith('#student=') ? window.location.hash.replace('#student=', '') : null);

  if (account && (account.role === 'student' || (account.role === 'parent' && students.length === 1))) {
    if (students.length >= 1) {
      await loadDashboard(students[0].id, account);
    } else {
      renderStudents([], account);
    }
  } else {
    let accountsList = [];
    if (account && account.role === 'admin') {
      try {
        accountsList = await loadAccounts();
      } catch {}
    }

    if (targetStudentId && students.some(s => s.id === targetStudentId)) {
      await loadDashboard(targetStudentId, account, () => {
        try {
          if (window.location.hash) history.replaceState(null, '', window.location.pathname);
        } catch {}
        renderExecutiveDashboard(students, account, accountsList);
      });
    } else {
      renderExecutiveDashboard(students, account, accountsList);
    }
  }
}

function renderAccounts(accounts) {
  accountList.replaceChildren();
  accounts.forEach((account) => {
    const item = document.createElement('div');
    item.className = 'portal-account';
    const name = document.createElement('strong');
    name.textContent = account.name;
    const copy = document.createElement('span');
    copy.textContent = `${account.email} · ${roleLabels[account.role] || account.role}`;
    item.append(name, copy);
    accountList.append(item);
  });
}

async function showPortal() {
  const response = await fetch('/api/me', { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Sesi sudah berakhir.');

  currentAccount = result.account;
  document.body.classList.add('in-crm');
  if (publicHeader) {
    publicHeader.hidden = true;
    publicHeader.style.display = 'none';
  }
  if (portalLogin) {
    portalLogin.hidden = true;
    portalLogin.style.display = 'none';
  }
  portalConsole.hidden = false;
  portalLogout.hidden = false;

  portalRoleLabel.textContent = roleLabels[result.account.role] || 'Portal Hamasah';
  if (result.account.role === 'student') {
    portalTitle.textContent = `Assalamu'alaikum, ${result.account.name}.`;
    if (crmPageTitle) crmPageTitle.textContent = 'Dashboard Santri';
  } else if (result.account.role === 'parent') {
    portalTitle.textContent = `Assalamu'alaikum, Bapak/Ibu ${result.account.name}.`;
    if (crmPageTitle) crmPageTitle.textContent = 'Pantau Ananda';
  } else if (result.account.role === 'supervisor') {
    portalTitle.textContent = `Ahlan wa Sahlan, Ustadz ${result.account.name}.`;
    if (crmPageTitle) crmPageTitle.textContent = 'Pengawasan Asrama';
  } else {
    portalTitle.textContent = `Assalamu'alaikum, ${result.account.name}.`;
    if (crmPageTitle) crmPageTitle.textContent = 'Super Admin CRM';
  }

  renderStaffNav(staffNav, result.account.role, 'portal', result.account);
  await loadStudents(result.account);
}

portalLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  portalLoginStatus.classList.remove('is-error');
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.querySelector('#portal-email').value, password: document.querySelector('#portal-password').value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Login belum berhasil.');
    sessionStorage.setItem('hamasahPortalSession', JSON.stringify({ accessToken: result.accessToken }));
    await showPortal();
  } catch (error) {
    setLoginError(error.message || 'Login belum berhasil.');
  }
});

accountForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  accountFormStatus.classList.remove('is-error');
  try {
    const response = await fetch('/api/accounts', {
      method: 'POST',
      headers: { ...requestHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.querySelector('#account-name').value,
        email: document.querySelector('#account-email').value,
        role: document.querySelector('#account-role').value,
        password: document.querySelector('#account-password').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Akun belum dapat dibuat.');
    accountForm.reset();
    accountFormStatus.textContent = `Akun ${result.account.name} berhasil dibuat.`;
    const accounts = await loadAccounts();
    const countBadge = document.querySelector('#tab-count-accounts');
    if (countBadge) countBadge.textContent = accounts.length;
  } catch (error) {
    accountFormStatus.textContent = error.message || 'Akun belum dapat dibuat.';
    accountFormStatus.classList.add('is-error');
  }
});

portalLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: requestHeaders() }).catch(() => {});
  sessionStorage.removeItem('hamasahPortalSession');
  document.body.classList.remove('in-crm');
  window.location.reload();
});

// Quick fill testing credentials buttons
const btnStudent = document.querySelector('#btn-fill-student');
const btnParent = document.querySelector('#btn-fill-parent');
const btnMusyrif = document.querySelector('#btn-fill-musyrif');
const btnAdmin = document.querySelector('#btn-fill-admin');
const emailInput = document.querySelector('#portal-email');
const passInput = document.querySelector('#portal-password');

if (btnStudent) {
  btnStudent.addEventListener('click', () => {
    emailInput.value = 'santri@hamasah.test';
    passInput.value = 'kata-sandi-dev-hamasah';
  });
}
if (btnParent) {
  btnParent.addEventListener('click', () => {
    emailInput.value = 'wali@hamasah.test';
    passInput.value = 'kata-sandi-dev-hamasah';
  });
}
if (btnMusyrif) {
  btnMusyrif.addEventListener('click', () => {
    emailInput.value = 'musyrif@hamasah.test';
    passInput.value = 'kata-sandi-dev-hamasah';
  });
}
if (btnAdmin) {
  btnAdmin.addEventListener('click', () => {
    emailInput.value = 'tester@hamasah.test';
    passInput.value = 'TestingHamasah2026!';
  });
}

if (getSession()) {
  document.body.classList.add('in-crm');
  showPortal().catch((error) => {
    document.body.classList.remove('in-crm');
    sessionStorage.removeItem('hamasahPortalSession');
    setLoginError(error.message || 'Sesi sudah berakhir.');
  });
}
