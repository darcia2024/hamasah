const portalLogin = document.querySelector('#portal-login');
const portalLoginForm = document.querySelector('#portal-login-form');
const portalLoginStatus = document.querySelector('#portal-login-status');
const activationNotice = document.querySelector('#activation-notice');
const portalConsole = document.querySelector('#portal-console');
const portalLogout = document.querySelector('#portal-logout');
const studentsStatus = document.querySelector('#portal-students-status');
const studentList = document.querySelector('#portal-student-list');
const studentDashboard = document.querySelector('#student-dashboard');
const portalAdmin = document.querySelector('#portal-admin');
const accountForm = document.querySelector('#account-form');
const accountFormStatus = document.querySelector('#account-form-status');
const accountList = document.querySelector('#account-list');
const inviteForm = document.querySelector('#invite-form');
const inviteFormStatus = document.querySelector('#invite-form-status');
const publicHeader = document.querySelector('#public-header');
const staffNav = document.querySelector('#staff-nav');

let currentAccount = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

const roleLabels = {
  admin: 'Portal Hamasah · Super Admin',
  'registration-officer': 'Portal pendaftaran',
  supervisor: 'Konsol musyrif asrama',
  teacher: 'Portal tenaga pengajar',
  finance: 'Konsol Keuangan & SPP',
  parent: 'Portal wali santri',
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

if (activationNotice && new URLSearchParams(window.location.search).get('activated') === '1') {
  activationNotice.hidden = false;
  activationNotice.textContent = 'Akun berhasil diaktifkan. Masuk menggunakan email dan kata sandi baru Anda.';
  activationNotice.dataset.kind = 'success';
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
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M4 10h16M6 10v10M18 10v10M10 10v10M14 10v10M12 6a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4z"/></svg>`;
    case 'book':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>`;
    case 'cap':
    case 'graduation':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    case 'palm':
    case 'tree':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7"/><path d="M12 15c-3-2-5-6-5-10 4 0 7 2 8 6"/><path d="M12 15c3-2 5-6 5-10-4 0-7 2-8 6"/></svg>`;
    case 'note':
    case 'eval':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;
    case 'warning':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    case 'camel':
    case 'desert':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16M7 18v-4c0-2 1-3 3-3s3 1 3 3v4M13 11c0-2 1-3 3-3s3 1 3 3v7M4 14l2-4 3-1"/></svg>`;
    case 'building':
    case 'landmark':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"/><line x1="4" y1="10" x2="20" y2="10"/><path d="m12 3 10 7H2l10-7z"/><line x1="6" y1="10" x2="6" y2="21"/><line x1="10" y1="10" x2="10" y2="21"/><line x1="14" y1="10" x2="14" y2="21"/><line x1="18" y1="10" x2="18" y2="21"/></svg>`;
    default:
      return icon;
  }
}

// ---------------------------------------------------------------------------
// Tampilan santri dan konsol (Task R4.5)
//
// Bagian ini dulu dibangun dari templat "itinerary perjalanan" dan berisi data yang
// ditulis keras di kode: nomor induk, nama musyrif pendamping, dan
// "Status Pembiayaan: Lunas (SPP & Dorm)" untuk SEMUA santri, "100% Hadir" saat belum
// ada satu pun presensi, kartu "Hadir Istiqomah" untuk lima waktu sholat yang tidak
// pernah dicatat, serta hitungan tab (12, 30, 8) yang tidak berasal dari mana pun.
// Wali yang membuka portal melihat klaim keuangan dan kehadiran yang tidak pernah
// terjadi. Kini setiap nilai di layar berasal dari API, atau bagian itu menjadi
// keadaan kosong yang menyatakan apa adanya.
// ---------------------------------------------------------------------------

const ATTENDANCE_LABELS = Object.freeze({ present: 'Hadir', late: 'Terlambat', excused: 'Izin / sakit', absent: 'Tidak hadir' });
const ATTENDANCE_TYPES = Object.freeze({ present: 'complete', late: 'pending', excused: 'pending', absent: 'absent' });
const PRAYER_PATTERN = /sholat|salat|shalat|subuh|shubuh|dzuhur|zuhur|dhuhur|ashar|asar|maghrib|magrib|isya|isha|berjamaah|jamaah/i;
const STUDENT_STATUS_LABELS = Object.freeze({ active: 'Aktif', inactive: 'Tidak aktif', graduated: 'Lulus' });

function formatTanggalPanjang(isoDate) {
  if (!isoDate) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(isoDate));
  } catch {
    return String(isoDate);
  }
}

function dormitoryLabel(student) {
  if (student.dormitory) return [student.dormitory.name, student.dormitory.area].filter(Boolean).join(' · ');
  if (student.dormitoryName) return student.dormitoryName;
  return student.dormitoryId ? 'Asrama terdaftar' : 'Belum ditempatkan';
}

// Kartu satu catatan. Hanya field yang ADA di data yang ditampilkan: tidak ada lokasi,
// unit asrama, jumlah anggota, atau "tipe pembinaan" yang dikarang untuk mengisi kolom.
function createRecordCard({ badgeColor = 'yellow', badgeIcon = 'mosque', title, subtitle = '', statusText = '', statusType = 'pending', details = [], note = '' }) {
  const card = document.createElement('div');
  card.className = 'crm-activity-card';

  const shown = details.filter((item) => item && item.value);
  card.innerHTML = `
    <div class="crm-activity-card__header-row">
      <div class="crm-activity-card__title-col">
        <div class="crm-square-badge crm-square-badge--${escapeHtml(badgeColor)}">
          ${renderBadgeIcon(badgeIcon)}
        </div>
        <div class="js-flex-1-min">
          <h3 class="crm-activity-card__name">${escapeHtml(title)}</h3>
          ${subtitle ? `<div class="crm-activity-card__subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
      </div>
      ${statusText ? `<div class="crm-activity-card__header-actions"><span class="crm-status-pill crm-status-pill--${escapeHtml(statusType)}">${escapeHtml(statusText)}</span></div>` : ''}
    </div>
    ${shown.length ? `<div class="crm-activity-card__upper">${shown.map((item) => `<div class="crm-col-block"><label>${escapeHtml(item.label)}</label><span>${escapeHtml(item.value)}</span></div>`).join('')}</div>` : ''}
    ${note ? `<div class="crm-activity-card__note"><svg class="js-no-shrink" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${escapeHtml(note)}</span></div>` : ''}
  `;
  return card;
}

function createEmptyState(message) {
  const box = document.createElement('div');
  box.className = 'crm-white-card';
  const copy = document.createElement('p');
  copy.className = 'js-text-muted';
  copy.textContent = message;
  box.append(copy);
  return box;
}

function attendanceCard(entry) {
  return createRecordCard({
    badgeIcon: entry.status === 'present' ? 'mosque' : 'warning',
    title: entry.category || 'Kehadiran',
    subtitle: formatWaktu(entry.occurredAt),
    statusText: ATTENDANCE_LABELS[entry.status] || entry.status,
    statusType: ATTENDANCE_TYPES[entry.status] || 'pending',
    // recordedByName hanya ada untuk staf; server mencabutnya dari tampilan keluarga.
    details: [{ label: 'Dicatat oleh', value: entry.recordedByName }],
    note: entry.note
  });
}

// Unduhan yang membawa sesi. <a href download> biasa tidak mengirim header
// Authorization, sehingga endpoint yang dilindungi menjawab 401 dan yang terunduh
// adalah berkas galat, bukan datanya.
async function downloadWithSession(url, fileName, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Menyiapkan...';
  try {
    const response = await fetch(url, { headers: requestHeaders() });
    if (!response.ok) {
      let message = 'Berkas belum dapat diunduh.';
      try { message = (await response.json()).error || message; } catch { /* respons bukan JSON */ }
      throw new Error(message);
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function createStudentCompactCard(student, idx, account, onOpen) {
  const card = document.createElement('div');
  card.className = 'crm-student-compact-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Buka detail rekam jejak ${student.name}`);

  const colors = ['yellow', 'orange', 'green', 'purple'];
  const badgeColor = colors[idx % colors.length];
  // Tanpa NIM: nomor induk tidak ada di data, dan sebelumnya dikarang dari indeks
  // baris (dibuat dari nomor urut), sehingga berganti setiap urutan daftar berubah.
  const statusLabel = STUDENT_STATUS_LABELS[student.status] || student.status || '';
  const metaParts = [];
  if (student.city) metaParts.push(`Asal ${escapeHtml(student.city)}`);
  if (student.program) metaParts.push(`<span class="crm-student-compact-pill">${escapeHtml(student.program)}</span>`);
  metaParts.push(`<span class="crm-student-compact-dorm"><svg class="js-icon-inline--tight" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> ${escapeHtml(dormitoryLabel(student))}</span>`);

  card.innerHTML = `
    <div class="crm-student-compact-main">
      <div class="crm-square-badge crm-square-badge--${badgeColor}">
        ${renderBadgeIcon('cap')}
      </div>
      <div class="crm-student-compact-info">
        <div class="crm-student-compact-title-row">
          <h3 class="crm-student-compact-name">${escapeHtml(student.name)}</h3>
          ${statusLabel ? `<span class="crm-status-pill crm-status-pill--complete">${escapeHtml(statusLabel)}</span>` : ''}
        </div>
        <div class="crm-student-compact-meta">${metaParts.join('<span class="crm-meta-dot">·</span>')}</div>
      </div>
    </div>
    <div class="crm-student-compact-action">
      <span class="crm-student-compact-cta-label">Buka detail</span>
      <div class="crm-student-compact-arrow">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
      <a href="portal.html?studentId=${encodeURIComponent(student.id)}" target="_blank" rel="noopener" class="crm-student-compact-newtab" title="Buka di tab baru" aria-label="Buka di tab baru">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.crm-student-compact-newtab')) return;
    e.preventDefault();
    if (onOpen) onOpen();
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('.crm-student-compact-newtab')) return;
      e.preventDefault();
      if (onOpen) onOpen();
    }
  });

  return card;
}

function buildTabs(definitions, panels, container) {
  const buttons = definitions.map((def, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `crm-pill-btn ${index === 0 ? 'is-active' : ''}`;
    // Hitungan hanya ditampilkan bila diketahui dari data. Tidak ada angka bawaan.
    const count = def.count === undefined ? '' : ` <span class="crm-pill-count" id="tab-count-${def.id}">${def.count}</span>`;
    button.innerHTML = `${def.icon} <span>${def.label}</span>${count}`;
    container.append(button);
    return button;
  });
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      buttons.forEach((other) => other.classList.remove('is-active'));
      panels.forEach((panel) => {
        panel.hidden = true;
        panel.classList.remove('crm-tab-enter');
      });
      button.classList.add('is-active');
      panels[index].hidden = false;
      panels[index].classList.add('crm-tab-enter');
    });
  });
  return buttons;
}

const TAB_ICONS = Object.freeze({
  clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  mosque: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  award: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  home: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  book: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  file: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  users: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  lock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
});

const HAFALAN_GRADE = Object.freeze({ lancar: ['Lancar', 'complete'], 'kurang-lancar': ['Kurang lancar', 'pending'], ulang: ['Perlu diulang', 'absent'] });
const KONDISI_KESEHATAN = Object.freeze({ sehat: ['Sehat', 'complete'], 'sakit-ringan': ['Sakit ringan', 'pending'], 'perlu-perhatian': ['Perlu perhatian', 'absent'], dirujuk: ['Dirujuk', 'absent'] });
const SHOLAT_WAKTU = Object.freeze([['subuh', 'Subuh'], ['dzuhur', 'Dzuhur'], ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya']]);
const SHOLAT_STATUS = Object.freeze({ berjamaah: 'Berjamaah', munfarid: 'Munfarid', tidak: 'Tidak', izin: 'Izin' });

// Rekap sholat berjamaah dari catatan terstruktur: ringkasan periode dan tabel per hari.
function createPrayerRecap(care) {
  const box = document.createElement('div');
  box.className = 'crm-white-card prayer-recap';
  const heading = document.createElement('h3');
  heading.textContent = 'Sholat berjamaah ' + formatTanggalPanjang(care.period.from) + ' sampai ' + formatTanggalPanjang(care.period.to);
  const summary = document.createElement('p');
  const t = care.prayers.totals;
  summary.textContent = care.prayers.recorded
    ? care.prayers.recorded + ' waktu sholat tercatat: ' + t.berjamaah + ' berjamaah (' + care.prayers.berjamaahRate + '%), ' + t.munfarid + ' munfarid, ' + t.tidak + ' tidak, ' + t.izin + ' izin.'
    : 'Belum ada presensi sholat yang dicatat musyrif pada periode ini.';
  box.append(heading, summary);
  if (!care.prayers.days.length) return box;
  const wrap = document.createElement('div');
  wrap.className = 'prayer-recap__scroll';
  const table = document.createElement('table');
  table.className = 'prayer-recap__table';
  const caption = document.createElement('caption');
  caption.className = 'prayer-recap__caption';
  caption.textContent = 'Presensi sholat per hari';
  const head = document.createElement('tr');
  ['Tanggal', ...SHOLAT_WAKTU.map(([, label]) => label)].forEach((text) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; head.append(th); });
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  care.prayers.days.forEach((day) => {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = formatTanggalPanjang(day.date);
    row.append(th);
    SHOLAT_WAKTU.forEach(([key]) => {
      const td = document.createElement('td');
      const status = day.prayers[key];
      td.textContent = status ? SHOLAT_STATUS[status] || status : '-';
      if (status) td.className = 'prayer-recap__cell prayer-recap__cell--' + status;
      row.append(td);
    });
    tbody.append(row);
  });
  table.append(caption, thead, tbody);
  wrap.append(table);
  box.append(wrap);
  return box;
}

function renderCrmDashboard(dashboard, account, onBack, care = null) {
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;
  const student = dashboard.student;
  const canRecord = Boolean(account) && ['admin', 'supervisor'].includes(account.role);

  if (onBack) {
    const backBar = document.createElement('div');
    backBar.className = 'crm-back-bar';
    backBar.innerHTML = `
      <button type="button" class="crm-topbar-action-btn js-chip-active" id="crm-back-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        <span>Kembali ke konsol</span>
      </button>
      <span class="js-text-meta">Rekam Jejak CRM: <strong>${escapeHtml(student.name)}</strong></span>
    `;
    backBar.querySelector('#crm-back-btn').addEventListener('click', onBack);
    studentDashboard.append(backBar);
  }

  // Ringkasan profil. Dulu berisi NIM, nama musyrif, semester, dan status SPP yang
  // ditulis keras; kini hanya yang ada di data.
  const summaryCard = document.createElement('div');
  summaryCard.className = 'crm-summary-card';

  const attendanceText = dashboard.attendance.rate === null
    ? 'Belum ada data presensi'
    : `${dashboard.attendance.rate}% hadir (${dashboard.attendance.present || 0}/${dashboard.attendance.total || 0})`;
  const latestEval = dashboard.evaluations.length ? dashboard.evaluations[0].note : 'Belum ada catatan pembina.';
  const statusLabel = STUDENT_STATUS_LABELS[student.status] || student.status || '-';
  const subtitle = [student.program, student.city].filter(Boolean).join(' · ');

  summaryCard.innerHTML = `
    <div class="crm-summary-col">
      <div>
        <div class="crm-summary-title-row">
          <h2 class="crm-summary-title">${escapeHtml(student.name)}</h2>
        </div>
        ${subtitle ? `<p class="crm-summary-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <div>
        <p class="crm-field-label">BERGABUNG</p>
        <div class="crm-field-value"><span>${escapeHtml(formatTanggalPanjang(student.joinDate) || '-')}</span></div>
      </div>
    </div>

    <div class="crm-summary-col">
      <div>
        <p class="crm-field-label">STATUS</p>
        <div class="crm-field-value"><span>${escapeHtml(statusLabel)}</span></div>
      </div>
      <div>
        <p class="crm-field-label">ASRAMA</p>
        <div class="crm-person-row"><span class="crm-person-name">${escapeHtml(dormitoryLabel(student))}</span></div>
      </div>
    </div>

    <div class="crm-summary-col">
      <div>
        <p class="crm-field-label">PRESENSI IBADAH</p>
        <div class="crm-field-value">
          <span class="crm-outline-dot" aria-hidden="true"></span>
          <span>${escapeHtml(attendanceText)}</span>
        </div>
      </div>
      <div>
        <p class="crm-field-label">CATATAN PEMBINA</p>
        <p class="crm-summary-note">${escapeHtml(latestEval)}</p>
      </div>
    </div>
  `;

  const attendanceEntries = dashboard.attendance.entries || [];
  const prayerEntries = attendanceEntries.filter((entry) => PRAYER_PATTERN.test(entry.category || ''));

  const tabDefs = [
    { id: 'mutabaah', label: "Mutaba'ah & ibadah", icon: TAB_ICONS.clock, count: attendanceEntries.length },
    { id: 'sholat', label: 'Sholat berjamaah', icon: TAB_ICONS.mosque, count: care ? care.prayers.recorded : prayerEntries.length },
    { id: 'talaqqi', label: 'Talaqqi & tahfidz', icon: TAB_ICONS.award, count: dashboard.achievements.length + (care ? care.memorization.length : 0) },
    { id: 'dorm', label: 'Asrama', icon: TAB_ICONS.home },
    { id: 'lms', label: 'Maddah (LMS)', icon: TAB_ICONS.book },
    { id: 'admin', label: 'Rapor & ringkasan', icon: TAB_ICONS.file }
  ];

  const subtabsRow = document.createElement('div');
  subtabsRow.className = 'crm-subtabs-row';

  // Toolbar: hanya kontrol periode yang benar-benar menyaring data. Penanda tanggal
  // "Pekan Ini: 15 Sep - 21 Sep 2026" dan dropdown "Semua Aktivitas" dulu hanya
  // menampilkan teks tanpa menyaring apa pun, dan tombol "Input Mutaba'ah" tidak
  // punya pendengar. Pencatatan sungguhan ada di konsol monitoring.
  const toolbar = document.createElement('div');
  toolbar.className = 'crm-toolbar';
  const periodControls = document.createElement('div');
  periodControls.className = 'crm-toolbar-filters';
  periodControls.innerHTML = '<label class="sr-only" for="record-period-from">Dari tanggal</label><input id="record-period-from" type="date" value="' + escapeHtml(dashboard.period?.from || '') + '"><label class="sr-only" for="record-period-to">Sampai tanggal</label><input id="record-period-to" type="date" value="' + escapeHtml(dashboard.period?.to || '') + '"><button type="button" class="crm-pill-btn" id="apply-record-period">Terapkan periode</button>';
  periodControls.querySelector('#apply-record-period').addEventListener('click', async () => {
    const from = periodControls.querySelector('#record-period-from').value;
    const to = periodControls.querySelector('#record-period-to').value;
    try { await loadDashboard(student.id, account, onBack, { from, to }); } catch (error) { window.alert(error.message); }
  });
  toolbar.append(periodControls);
  if (canRecord) {
    const actions = document.createElement('div');
    actions.className = 'crm-toolbar-actions';
    actions.innerHTML = '<a class="crm-btn-primary-yellow" href="monitoring.html"><span>Catat di Monitoring</span></a>';
    toolbar.append(actions);
  }

  const panelsContainer = document.createElement('div');
  panelsContainer.className = 'crm-panels';

  // Panel 1: Mutaba'ah & Ibadah
  const panelMutabaah = document.createElement('div');
  panelMutabaah.className = 'crm-card-stack';
  if (attendanceEntries.length) {
    attendanceEntries.slice(0, 10).forEach((entry) => panelMutabaah.append(attendanceCard(entry)));
  } else {
    panelMutabaah.append(createEmptyState("Belum ada catatan mutaba'ah pada periode ini."));
  }

  // Panel 2: Sholat Berjamaah, disaring dari presensi yang benar-benar tercatat.
  const panelSholat = document.createElement('div');
  panelSholat.className = 'crm-card-stack';
  panelSholat.hidden = true;
  if (care) {
    panelSholat.append(createPrayerRecap(care));
  } else if (prayerEntries.length) {
    prayerEntries.forEach((entry) => panelSholat.append(attendanceCard(entry)));
  } else {
    panelSholat.append(createEmptyState('Belum ada presensi sholat berjamaah yang tercatat pada periode ini.'));
  }

  // Panel 3: Talaqqi & Tahfidz
  const panelTalaqqi = document.createElement('div');
  panelTalaqqi.className = 'crm-card-stack';
  panelTalaqqi.hidden = true;
  if (care && care.memorization.length) {
    care.memorization.forEach((setoran) => {
      const [statusText, statusType] = HAFALAN_GRADE[setoran.grade] || [setoran.grade, 'pending'];
      panelTalaqqi.append(createRecordCard({
        badgeColor: 'green', badgeIcon: 'book',
        title: setoran.portion,
        subtitle: (setoran.kind === 'ziyadah' ? 'Ziyadah (hafalan baru)' : 'Murajaah') + ' · ' + formatTanggalPanjang(setoran.occurredOn),
        statusText, statusType, note: setoran.note || ''
      }));
    });
  }
  if (dashboard.achievements.length) {
    dashboard.achievements.forEach((achievement) => {
      panelTalaqqi.append(createRecordCard({
        badgeColor: 'green',
        badgeIcon: 'book',
        title: achievement.title,
        subtitle: formatWaktu(achievement.occurredAt),
        statusText: 'Capaian',
        statusType: 'complete',
        details: [{ label: 'Dicatat oleh', value: achievement.recordedByName }],
        note: achievement.description
      }));
    });
  } else if (!(care && care.memorization.length)) {
    panelTalaqqi.append(createEmptyState('Belum ada capaian talaqqi atau setoran hafalan yang tercatat.'));
  }

  // Panel 4: Asrama. Dulu berisi nama gedung, katering, AC, dan Wi-Fi yang ditulis keras
  // untuk setiap santri. Kini hanya asrama tempat santri ini ditempatkan.
  const panelDorm = document.createElement('div');
  panelDorm.className = 'crm-card-stack';
  panelDorm.hidden = true;
  if (student.dormitory) {
    panelDorm.append(createRecordCard({
      badgeIcon: 'building',
      title: student.dormitory.name,
      subtitle: student.dormitory.area || '',
      statusText: 'Ditempatkan',
      statusType: 'complete'
    }));
  } else {
    panelDorm.append(createEmptyState(student.dormitoryId
      ? 'Santri ini sudah ditempatkan, tetapi rincian asramanya belum dapat dimuat.'
      : 'Santri ini belum ditempatkan di asrama.'));
  }

  // Panel 5: Maddah (LMS)
  const panelLms = document.createElement('div');
  panelLms.className = 'crm-white-card';
  panelLms.hidden = true;
  panelLms.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Maddah yang Diikuti</h3>
        <p>Daftar maddah dan progres belajar santri ini.</p>
      </div>
      <a href="lms.html" class="crm-btn-primary-yellow js-btn-sm">
        <span>Buka Ruang Belajar (LMS)</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </a>
    </div>
    <div id="crm-student-courses">
      <p class="js-text-muted">Memuat maddah...</p>
    </div>
  `;
  // Wali hanya melihat ringkasan progres; ruang belajar LMS bukan untuknya.
  if (currentAccount && currentAccount.role === 'parent') {
    const lmsLink = panelLms.querySelector('a[href="lms.html"]');
    if (lmsLink) lmsLink.remove();
    const subjudul = panelLms.querySelector('.crm-white-card-header p');
    if (subjudul) subjudul.textContent = 'Ringkasan progres belajar ananda per maddah.';
  }

  // Ringkasan progres (judul dan hitungan materi) juga terbuka untuk wali. Dulu tab ini
  // memanggil /courses yang menolak wali, dan penolakan itu tampil sebagai "belum ada maddah".
  fetch(`/api/students/${encodeURIComponent(student.id)}/course-progress`, { headers: requestHeaders() })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Maddah belum dapat dimuat.');
      return data;
    })
    .then((data) => {
      const container = panelLms.querySelector('#crm-student-courses');
      if (!container) return;
      if (!data.items || !data.items.length) {
        container.innerHTML = '<p class="js-text-muted">Belum ada maddah yang diikuti santri ini.</p>';
        return;
      }
      container.replaceChildren();
      const grid = document.createElement('div');
      grid.className = 'crm-grid-2col';
      data.items.forEach((course) => {
        const item = document.createElement('div');
        item.className = 'crm-feature-box';
        item.innerHTML = `
          <div class="crm-feature-box-icon">${TAB_ICONS.book}</div>
          <div class="js-flex-1">
            <strong>${escapeHtml(course.title)}</strong>
            <p>${Number(course.completedMaterials) || 0} dari ${Number(course.totalMaterials) || 0} materi selesai · Progres ${Number(course.progress) || 0}%</p>
            <div class="js-progress-track">
              <div class="js-progress-bar"></div>
            </div>
          </div>
        `;
        // Lebar diisi lewat element.style, bukan atribut style di markup: penulisan
        // properti satu per satu tidak terkena Content Security Policy.
        const bar = item.querySelector('.js-progress-bar');
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, Number(course.progress) || 0))}%`;
        grid.append(item);
      });
      container.append(grid);
    })
    .catch((error) => {
      const container = panelLms.querySelector('#crm-student-courses');
      if (!container) return;
      const pesan = document.createElement('p');
      pesan.className = 'js-text-muted';
      pesan.textContent = error.message || 'Maddah belum dapat dimuat.';
      container.replaceChildren(pesan);
    });

  // Panel 6: Ringkasan Data. Dulu menyatakan "Status SPP & Akomodasi: Lunas" dan
  // "Garansi Tanpa Biaya Siluman" untuk semua santri. Dashboard tidak membawa data
  // tagihan, jadi tidak ada klaim keuangan di sini. Yang tersisa hanya yang nyata:
  // rapor PDF (dari catatan nyata) dan ekspor ringkasan rekam jejak.
  const recordPeriodLabel = dashboard.period?.from || dashboard.period?.to
    ? [formatTanggalPanjang(dashboard.period.from) || 'awal', formatTanggalPanjang(dashboard.period.to) || 'sekarang'].join(' sampai ')
    : 'seluruh catatan';
  const panelAdmin = document.createElement('div');
  panelAdmin.className = 'crm-white-card';
  panelAdmin.hidden = true;
  panelAdmin.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Rapor Digital &amp; Ringkasan</h3>
        <p>Rapor PDF memuat kehadiran, progres maddah, prestasi, kegiatan, evaluasi, dan catatan disiplin yang tercatat pada periode ${escapeHtml(recordPeriodLabel)}.</p>
      </div>
      <div class="crm-report-actions">
        <button type="button" class="crm-topbar-action-btn" id="download-student-rapor" aria-label="Unduh rapor PDF">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>Unduh rapor (PDF)</span>
        </button>
        <button type="button" class="crm-topbar-action-btn" id="download-student-report" aria-label="Unduh ringkasan CSV">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Unduh Ringkasan (CSV)</span>
        </button>
      </div>
    </div>
  `;
  // Rapor mengikuti periode yang sedang diterapkan, sama dengan data yang tampil di layar.
  const recordPeriodQuery = new URLSearchParams(Object.entries({ from: dashboard.period?.from, to: dashboard.period?.to }).filter(([, value]) => value)).toString();
  const reportSuffix = recordPeriodQuery ? `?${recordPeriodQuery}` : '';
  const raporButton = panelAdmin.querySelector('#download-student-rapor');
  raporButton.addEventListener('click', () => {
    downloadWithSession(`/api/students/${encodeURIComponent(student.id)}/report.pdf${reportSuffix}`, `rapor-${student.id}.pdf`, raporButton.querySelector('span'));
  });
  const reportButton = panelAdmin.querySelector('#download-student-report');
  reportButton.addEventListener('click', () => {
    downloadWithSession(`/api/students/${encodeURIComponent(student.id)}/report${reportSuffix}`, `ringkasan-${student.id}.csv`, reportButton.querySelector('span'));
  });

  const panels = [panelMutabaah, panelSholat, panelTalaqqi, panelDorm, panelLms, panelAdmin];

  // Panel Kesehatan: hanya bila fitur kesehatan aktif (care.health bukan null). Wali dan santri
  // menerima kondisi dan catatan untuk wali; keluhan dan tindakan hanya ada pada data staf.
  if (care && care.health !== null) {
    const panelHealth = document.createElement('div');
    panelHealth.className = 'crm-card-stack';
    panelHealth.hidden = true;
    if (!care.health.length) {
      panelHealth.append(createEmptyState('Belum ada catatan kesehatan pada periode ini.'));
    } else {
      care.health.forEach((catatan) => {
        const [statusText, statusType] = KONDISI_KESEHATAN[catatan.condition] || [catatan.condition, 'pending'];
        panelHealth.append(createRecordCard({
          badgeColor: statusType === 'complete' ? 'green' : 'yellow', badgeIcon: 'note',
          title: 'Kondisi: ' + statusText, subtitle: formatTanggalPanjang(catatan.occurredOn), statusText, statusType,
          details: [{ label: 'Keluhan (internal)', value: catatan.complaint || '' }, { label: 'Tindakan (internal)', value: catatan.actionTaken || '' }],
          note: catatan.parentNote || ''
        }));
      });
    }
    tabDefs.push({ id: 'kesehatan', label: 'Kesehatan', icon: TAB_ICONS.clock, count: care.health.length });
    panels.push(panelHealth);
  }

  // Panel 7: Tagihan & Kuitansi. Hanya untuk wali (santri yang terhubung) dan admin; peran
  // lain tidak punya akses ke data keuangan santri. Kuitansi hanya untuk tagihan lunas.
  if (currentAccount && ['parent', 'admin'].includes(currentAccount.role)) {
    const panelBilling = document.createElement('div');
    panelBilling.className = 'crm-white-card';
    panelBilling.hidden = true;
    const header = document.createElement('div');
    header.className = 'crm-white-card-header';
    header.innerHTML = '<div><h3>Tagihan &amp; Kuitansi</h3><p>Tagihan santri ini dan kuitansi untuk tagihan yang sudah lunas.</p></div>';
    const list = document.createElement('div');
    list.className = 'crm-billing-list';
    list.textContent = 'Memuat tagihan...';
    panelBilling.append(header, list);
    const STATUS_TAGIHAN = { paid: ['Lunas', 'complete'], unpaid: ['Belum dibayar', 'pending'], voided: ['Dibatalkan', 'absent'] };
    const rupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
    fetch(`/api/students/${encodeURIComponent(student.id)}/invoices`, { headers: requestHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Tagihan belum dapat dimuat.');
        return data.items || [];
      })
      .then((items) => {
        list.replaceChildren();
        if (!items.length) {
          list.append(createEmptyState('Belum ada tagihan untuk santri ini.'));
          return;
        }
        items.forEach((invoice) => {
          const [statusText, statusType] = STATUS_TAGIHAN[invoice.status] || [invoice.status, 'pending'];
          const card = createRecordCard({
            badgeColor: invoice.status === 'paid' ? 'green' : 'yellow',
            badgeIcon: 'note',
            title: invoice.description,
            subtitle: invoice.number,
            statusText,
            statusType,
            details: [
              { label: 'Jumlah', value: rupiah(invoice.amount) },
              { label: 'Diterbitkan', value: formatTanggal(invoice.issuedAt) },
              { label: 'Dibayar', value: invoice.paidAt ? formatTanggal(invoice.paidAt) : '' },
              { label: 'Nomor kuitansi', value: invoice.receiptNumber || '' }
            ]
          });
          if (invoice.status === 'paid' && invoice.receiptNumber) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'crm-topbar-action-btn crm-receipt-btn';
            button.setAttribute('aria-label', `Unduh kuitansi ${invoice.receiptNumber}`);
            button.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Unduh Kuitansi (PDF)</span>';
            button.addEventListener('click', () => {
              downloadWithSession(
                `/api/students/${encodeURIComponent(student.id)}/invoices/${encodeURIComponent(invoice.id)}/receipt.pdf`,
                `${invoice.receiptNumber.replace(/[^\w.-]+/g, '-')}.pdf`,
                button.querySelector('span')
              );
            });
            card.append(button);
          }
          list.append(card);
        });
      })
      .catch((error) => {
        list.replaceChildren(createEmptyState(error.message));
      });
    tabDefs.push({ id: 'billing', label: 'Tagihan & kuitansi', icon: TAB_ICONS.file });
    panels.push(panelBilling);
  }

  buildTabs(tabDefs, panels, subtabsRow);
  panelsContainer.append(...panels);

  studentDashboard.append(summaryCard, subtabsRow, toolbar, panelsContainer);
  studentDashboard.classList.add('crm-view-enter');
  studentDashboard.hidden = false;
}

// Daftar santri dimuat per halaman (Task R6.2). Yang ditampilkan selalu isi `items`;
// `allTotal` adalah jumlah seluruh santri yang boleh dilihat akun ini, sedangkan `total`
// mengikuti pencarian yang sedang aktif.
const STUDENT_PAGE_SIZE = 20;
let studentPage = { items: [], total: 0, allTotal: 0, search: '' };

async function fetchStudentPage({ search = '', offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(STUDENT_PAGE_SIZE), offset: String(offset) });
  if (search) params.set('search', search);
  const response = await fetch(`/api/my-students?${params}`, { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Data santri belum dapat dimuat.');
  return { items: result.items || [], total: typeof result.total === 'number' ? result.total : (result.items || []).length };
}

function renderExecutiveDashboard(_daftarAwal, account, accountsList = []) {
  const students = studentPage.items;
  const allTotal = studentPage.allTotal;
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;

  const isAdmin = account && account.role === 'admin';
  const isSupervisor = account && account.role === 'supervisor';
  const isParent = account && account.role === 'parent';

  const coursueLayout = document.createElement('div');
  coursueLayout.className = 'coursue-layout';
  const mainCol = document.createElement('div');
  mainCol.className = 'coursue-main-col';
  const rightPanel = document.createElement('div');
  rightPanel.className = 'coursue-right-panel';

  // Judul dan ringkasan hanya memakai peran dan jumlah dari data. Sebelumnya berisi
  // nama kawasan dan gedung operasional yang belum dikonfirmasi klien dan ditulis keras
  // di kode.
  const titleText = isAdmin
    ? 'Konsol pembinaan santri'
    : isSupervisor
      ? 'Konsol pembinaan musyrif'
      : 'Pemantauan ananda';
  const subtitleText = isAdmin
    ? `Super Admin · ${allTotal} santri terdaftar.`
    : isSupervisor
      ? `${allTotal} santri dalam pengawasan Anda.`
      : `${allTotal} ananda terhubung dengan akun ini.`;
  const heroTag = isAdmin ? 'KONSOL EKSEKUTIF' : isSupervisor ? 'KONSOL MUSYRIF' : 'PORTAL KELUARGA';

  const heroBanner = document.createElement('div');
  heroBanner.className = 'coursue-hero-banner';
  heroBanner.innerHTML = `
    <div class="coursue-hero-tag">${heroTag}</div>
    <h2 class="coursue-hero-title">${titleText}</h2>
    <p class="coursue-hero-subtitle">${escapeHtml(subtitleText)}</p>
    <button type="button" class="coursue-hero-cta" id="btn-hero-action">
      <span>${isAdmin ? 'Buka rekam jejak santri' : 'Lihat mutaba\'ah terkini'}</span>
      <span class="coursue-hero-cta-arrow">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </span>
    </button>
  `;

  const statRow = document.createElement('div');
  // Hanya angka yang benar-benar diketahui. Dua kartu 'Belum ada data' (tahfidz, presensi)
  // dulu tampil permanen karena tidak ada kode yang mengisinya.
  statRow.className = 'coursue-stat-row coursue-stat-row--single';
  statRow.innerHTML = `
    <div class="coursue-stat-pill">
      <div class="coursue-stat-icon coursue-stat-icon--gold">${renderBadgeIcon('mosque')}</div>
      <div class="coursue-stat-meta">
        <p class="coursue-stat-count">${allTotal} Santri</p>
        <p class="coursue-stat-label">terhubung dengan akun</p>
      </div>
    </div>
  `;

  const featuredSection = document.createElement('div');
  featuredSection.className = 'coursue-empty-state';
  featuredSection.innerHTML = '<h3 class="coursue-section-title">Halaqah &amp; Program</h3><p class="coursue-user-subtext">Program akan muncul setelah maddah dan materi diterbitkan oleh pembina.</p>';

  // Dulu ada lima tab tambahan (Mutaba'ah, Sholat, Talaqqi, Asrama, LMS) berisi sekitar
  // 300 baris konten karangan, karena tidak ada sumber data agregat di tingkat ini.
  // Dihilangkan sampai ada datanya. Rekam jejak nyata per santri ada di detail santri.
  const tabDefs = [
    { id: 'students', label: isParent ? 'Daftar ananda' : 'Daftar santri', icon: TAB_ICONS.users, count: allTotal }
  ];
  if (isAdmin) {
    tabDefs.push({
      id: 'accounts',
      label: 'Kelola akun internal',
      icon: TAB_ICONS.lock,
      count: Array.isArray(accountsList) ? accountsList.length : undefined
    });
  }

  const subtabsRow = document.createElement('div');
  subtabsRow.className = 'crm-subtabs-row';

  const panelsContainer = document.createElement('div');
  panelsContainer.className = 'crm-panels';

  const panelStudents = document.createElement('div');
  panelStudents.className = 'crm-card-stack';

  // Pencarian dan "Muat lebih banyak" berjalan di server. Kotak cari hanya ditawarkan
  // bila daftarnya memang tidak muat dalam satu halaman.
  const studentTools = document.createElement('div');
  studentTools.className = 'portal-student-tools';
  const studentSearch = document.createElement('input');
  studentSearch.type = 'search';
  studentSearch.className = 'portal-student-search';
  studentSearch.placeholder = 'Cari nama santri...';
  studentSearch.setAttribute('aria-label', 'Cari nama santri');
  studentSearch.value = studentPage.search;
  studentSearch.hidden = allTotal <= STUDENT_PAGE_SIZE && !studentPage.search;
  const studentHint = document.createElement('p');
  studentHint.className = 'portal-student-hint';
  studentHint.setAttribute('role', 'status');
  const studentCards = document.createElement('div');
  studentCards.className = 'crm-card-stack';
  const studentMore = document.createElement('button');
  studentMore.type = 'button';
  studentMore.className = 'button button--secondary';
  studentMore.textContent = 'Muat lebih banyak';
  studentTools.append(studentSearch, studentHint);

  function openStudent(student) {
    loadDashboard(student.id, account, () => renderExecutiveDashboard(null, account, accountsList)).catch((err) => {
      alert(err.message || 'Dashboard belum dapat dimuat.');
    });
  }

  function paintStudents() {
    studentCards.replaceChildren();
    if (!studentPage.items.length) {
      studentCards.append(createEmptyState(studentPage.search
        ? 'Tidak ada santri yang cocok dengan pencarian.'
        : 'Belum ada santri yang terhubung dengan akun ini.'));
    } else {
      studentPage.items.forEach((student, idx) => {
        studentCards.append(createStudentCompactCard(student, idx, account, () => openStudent(student)));
      });
    }
    studentHint.textContent = studentPage.total > studentPage.items.length || studentPage.search
      ? `Menampilkan ${studentPage.items.length} dari ${studentPage.total} santri.`
      : '';
    studentMore.hidden = studentPage.items.length >= studentPage.total;
  }

  let studentSearchTimer = null;
  studentSearch.addEventListener('input', () => {
    clearTimeout(studentSearchTimer);
    studentSearchTimer = setTimeout(async () => {
      const search = studentSearch.value.trim();
      try {
        const page = await fetchStudentPage({ search });
        studentPage = { ...studentPage, items: page.items, total: page.total, search };
        paintStudents();
      } catch (err) {
        studentHint.textContent = err.message || 'Pencarian belum dapat dijalankan.';
      }
    }, 250);
  });
  studentMore.addEventListener('click', async () => {
    studentMore.disabled = true;
    try {
      const page = await fetchStudentPage({ search: studentPage.search, offset: studentPage.items.length });
      studentPage = { ...studentPage, items: studentPage.items.concat(page.items), total: page.total };
      paintStudents();
    } catch (err) {
      studentHint.textContent = err.message || 'Data santri belum dapat dimuat.';
    } finally {
      studentMore.disabled = false;
    }
  });
  paintStudents();
  panelStudents.append(studentTools, studentCards, studentMore);

  const panels = [panelStudents];
  if (isAdmin) {
    const panelAccounts = document.createElement('div');
    panelAccounts.hidden = true;
    if (portalAdmin) {
      panelAccounts.append(portalAdmin);
      portalAdmin.hidden = false;
    }
    panels.push(panelAccounts);
  }
  buildTabs(tabDefs, panels, subtabsRow);
  panelsContainer.append(...panels);

  // Kartu sapaan: hanya yang benar-benar diketahui (nama, peran, jumlah santri) dan
  // pintasan kerja sesuai peran. Dulu ada "Statistik Pekanan" dengan cincin progres dan
  // "Musyrif & Asatidzah" yang tidak pernah terisi oleh kode mana pun.
  const userName = account && account.name ? account.name.split(' ')[0] : '';
  const PINTASAN = {
    admin: [['staff.html', 'Pendaftaran calon santri'], ['monitoring.html', 'Monitoring santri & asrama'], ['operations.html', 'Keuangan, visa, dan inventaris'], ['audit.html', 'Jejak audit']],
    'registration-officer': [['staff.html', 'Pendaftaran calon santri']],
    supervisor: [['monitoring.html', 'Catat kegiatan dan ibadah santri']],
    teacher: [['lms.html', 'Kelola maddah dan materi']],
    finance: [['operations.html', 'Tagihan dan kuitansi']],
    student: [['lms.html', 'Buka ruang belajar']]
  };
  const statCard = document.createElement('div');
  statCard.className = 'coursue-statistic-card portal-greeting';
  const salam = document.createElement('h3');
  salam.textContent = userName ? `Assalamu'alaikum, ${userName}` : "Assalamu'alaikum";
  const peran = document.createElement('p');
  peran.className = 'portal-greeting__role';
  peran.textContent = roleLabels[account && account.role] || '';
  const jumlah = document.createElement('p');
  jumlah.className = 'portal-greeting__count';
  jumlah.textContent = isParent
    ? `${allTotal} ananda terhubung dengan akun ini.`
    : `${allTotal} santri dapat Anda akses.`;
  statCard.append(salam, peran, jumlah);
  const tautan = PINTASAN[account && account.role] || [];
  if (tautan.length) {
    const judul = document.createElement('p');
    judul.className = 'portal-greeting__label';
    judul.textContent = 'Pintasan kerja';
    const daftar = document.createElement('ul');
    daftar.className = 'portal-greeting__links';
    tautan.forEach(([href, label]) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      item.append(link);
      daftar.append(item);
    });
    statCard.append(judul, daftar);
  }

  rightPanel.append(statCard);

  const heroBtn = heroBanner.querySelector('#btn-hero-action');
  if (heroBtn) {
    heroBtn.addEventListener('click', () => {
      if (students.length > 0) {
        loadDashboard(students[0].id, account, () => renderExecutiveDashboard(null, account, accountsList)).catch((err) => {
          alert(err.message || 'Dashboard belum dapat dimuat.');
        });
      }
    });
  }

  mainCol.append(heroBanner, statRow, featuredSection, subtabsRow, panelsContainer);
  coursueLayout.append(mainCol, rightPanel);
  coursueLayout.classList.add('crm-view-enter');

  studentDashboard.append(coursueLayout);
  studentDashboard.hidden = false;
}

async function loadDashboard(studentId, account, onBack, range = {}) {
  const params = new URLSearchParams(); if (range.from) params.set('from', range.from); if (range.to) params.set('to', range.to);
  const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/dashboard${params.toString() ? `?${params}` : ''}`, { headers: requestHeaders() });
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

  // Ringkasan ibadah dan kesehatan: periode yang sama bila rentangnya <= 92 hari, selain itu
  // 30 hari terakhir. Gagal dimuat tidak menggagalkan dashboard (tab sholat kembali ke data lama).
  let care = null;
  try {
    const careParams = new URLSearchParams();
    const span = range.from && range.to ? (new Date(range.to) - new Date(range.from)) / 86400000 : null;
    if (span !== null && span >= 0 && span <= 92) { careParams.set('from', range.from); careParams.set('to', range.to); }
    else if (range.to) careParams.set('to', range.to);
    const careResponse = await fetch('/api/students/' + encodeURIComponent(studentId) + '/care' + (careParams.toString() ? '?' + careParams : ''), { headers: requestHeaders() });
    if (careResponse.ok) care = (await careResponse.json()).care;
  } catch { care = null; }

  renderCrmDashboard(result.dashboard, account || currentAccount, wrappedOnBack, care);
}

function renderStudents(students, account) {
  studentList.replaceChildren();
  studentDashboard.hidden = true;

  if (!students.length) {
    const empty = document.createElement('div');
    empty.className = 'crm-white-card portal-student-empty';
    empty.textContent = 'Belum ada santri yang terhubung dengan akun ini.';
    studentList.append(empty);
    studentList.hidden = false;
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
  // Status ini sebelumnya selalu tersembunyi, sehingga pesan memuat tidak pernah
  // terlihat. Sekarang ditampilkan selama permintaan berjalan lalu disembunyikan lagi.
  studentsStatus.classList.remove('is-error');
  studentsStatus.textContent = 'Memuat data santri...';
  studentsStatus.hidden = false;

  let response;
  let result;
  try {
    response = await fetch('/api/my-students', { headers: requestHeaders() });
    result = await response.json();
  } catch (error) {
    studentsStatus.textContent = 'Data santri belum dapat dimuat. Periksa koneksi lalu muat ulang.';
    studentsStatus.classList.add('is-error');
    throw error;
  }
  if (!response.ok) {
    studentsStatus.textContent = result.error || 'Data santri belum dapat dimuat.';
    studentsStatus.classList.add('is-error');
    throw new Error(result.error || 'Data santri belum dapat dimuat.');
  }
  studentsStatus.hidden = true;
  studentsStatus.textContent = '';

  const students = result.items || [];
  const allTotal = typeof result.total === 'number' ? result.total : students.length;
  studentPage = { items: students, total: allTotal, allTotal, search: '' };

  const urlParams = new URLSearchParams(window.location.search);
  const targetStudentId = urlParams.get('studentId') || (window.location.hash.startsWith('#student=') ? window.location.hash.replace('#student=', '') : null);

  if (account && (account.role === 'student' || (account.role === 'parent' && allTotal === 1))) {
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

    // Santri yang dituju lewat tautan belum tentu ada di halaman pertama. Server yang
    // menentukan boleh atau tidaknya; bila ditolak, konsol biasa yang ditampilkan.
    let opened = false;
    if (targetStudentId) {
      try {
        await loadDashboard(targetStudentId, account, () => {
          try {
            if (window.location.hash) history.replaceState(null, '', window.location.pathname);
          } catch {}
          renderExecutiveDashboard(null, account, accountsList);
        });
        opened = true;
      } catch {
        opened = false;
      }
    }
    if (!opened) renderExecutiveDashboard(null, account, accountsList);
  }
}

function renderAccounts(accounts) {
  accountList.replaceChildren();
  accounts.forEach((account) => {
    const item = document.createElement('div');
    item.className = 'portal-account';

    const head = document.createElement('div');
    head.className = 'portal-account__head';
    const name = document.createElement('strong');
    name.textContent = account.name;
    const state = document.createElement('span');
    state.className = account.active ? 'portal-account__state is-active' : 'portal-account__state';
    state.textContent = account.active ? 'Aktif' : 'Nonaktif';
    head.append(name, state);

    const copy = document.createElement('span');
    copy.textContent = `${account.email} · ${roleLabels[account.role] || account.role}`;

    // PATCH /api/accounts/:id/active. Menonaktifkan akun juga mencabut sesinya
    // di semua perangkat, jadi tombolnya diberi konfirmasi.
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button button--secondary portal-account__action';
    action.textContent = account.active ? 'Nonaktifkan' : 'Aktifkan';
    action.addEventListener('click', async () => {
      if (account.active && !window.confirm(`Nonaktifkan akun ${account.name}? Sesi di semua perangkatnya ikut berakhir.`)) return;
      action.disabled = true;
      accountFormStatus.classList.remove('is-error');
      try {
        const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/active`, {
          method: 'PATCH',
          headers: { ...requestHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !account.active })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Status akun belum dapat diubah.');
        accountFormStatus.textContent = result.account && result.account.active
          ? `Akun ${account.name} diaktifkan.`
          : `Akun ${account.name} dinonaktifkan. ${result.sessionsRevoked || 0} sesi dicabut.`;
        await loadAccounts();
      } catch (error) {
        accountFormStatus.textContent = error.message || 'Status akun belum dapat diubah.';
        accountFormStatus.classList.add('is-error');
        action.disabled = false;
      }
    });

    item.append(head, copy, action);
    accountList.append(item);
  });
}

async function showPortal() {
  const response = await fetch('/api/me', { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Sesi sudah berakhir.');

  currentAccount = result.account;
  document.body.classList.add('in-crm');
  // Atribut hidden sudah cukup: staff.css memberi `[hidden] { display: none !important }`.
  // Menulis style.display lagi hanya menambah atribut style di DOM tanpa efek tambahan.
  if (publicHeader) publicHeader.hidden = true;
  if (portalLogin) portalLogin.hidden = true;
  portalConsole.hidden = false;
  portalLogout.hidden = false;

  // Nama dan peran ditampilkan oleh shell CRM lewat renderStaffNav/updateCrmUserBadges,
  // jadi tidak ada heading sapaan terpisah di kanvas.
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

// POST /api/accounts/invitations: akun dibuat nonaktif, penerima memasang kata
// sandinya sendiri lewat tautan aktivasi. Admin tidak perlu mengarang kata sandi.
if (inviteForm) {
  inviteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    inviteFormStatus.classList.remove('is-error');
    inviteFormStatus.textContent = 'Mengirim undangan...';
    try {
      const response = await fetch('/api/accounts/invitations', {
        method: 'POST',
        headers: { ...requestHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.querySelector('#invite-name').value,
          email: document.querySelector('#invite-email').value,
          role: document.querySelector('#invite-role').value
        })
      });
      const result = await response.json();
      // 502 berarti akun sudah dibuat tetapi emailnya gagal terkirim. Itu bukan
      // kegagalan penuh, jadi pesannya dibedakan dari galat validasi.
      if (!response.ok && !result.account) throw new Error(result.error || 'Undangan belum dapat dikirim.');
      inviteForm.reset();
      inviteFormStatus.textContent = response.ok
        ? `Undangan terkirim ke ${result.account.email}. Tautan aktivasi berlaku terbatas.`
        : `Akun ${result.account.name} dibuat, tetapi email undangan belum terkirim. Periksa konfigurasi email lalu kirim ulang.`;
      if (!response.ok) inviteFormStatus.classList.add('is-error');
      const accounts = await loadAccounts();
      const countBadge = document.querySelector('#tab-count-accounts');
      if (countBadge) countBadge.textContent = accounts.length;
    } catch (error) {
      inviteFormStatus.textContent = error.message || 'Undangan belum dapat dikirim.';
      inviteFormStatus.classList.add('is-error');
    }
  });
}

portalLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: requestHeaders() }).catch(() => {});
  sessionStorage.removeItem('hamasahPortalSession');
  document.body.classList.remove('in-crm');
  window.location.reload();
});

// Pengisian cepat kredensial contoh sengaja tidak ada di sini. Berkas ini disajikan
// publik, jadi alamat akun dan kata sandi apa pun di dalamnya ikut terbaca siapa saja.
// Kredensial akun contoh dicetak ke terminal oleh `npm run dev`.

if (getSession()) {
  document.body.classList.add('in-crm');
  showPortal().catch((error) => {
    document.body.classList.remove('in-crm');
    sessionStorage.removeItem('hamasahPortalSession');
    setLoginError(error.message || 'Sesi sudah berakhir.');
  });
}
