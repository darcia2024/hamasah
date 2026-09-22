const guard = document.querySelector('#monitoring-guard');
const guardCopy = document.querySelector('#monitoring-guard-copy');
const consoleSection = document.querySelector('#monitoring-console');
const studentForm = document.querySelector('#student-form');
const studentFormStatus = document.querySelector('#student-form-status');
const studentSelect = document.querySelector('#monitoring-student-select');
const dashboard = document.querySelector('#monitoring-dashboard');
const monitoringEmptyState = document.querySelector('#monitoring-empty-state');
const recordSection = document.querySelector('#record-section');
const recordTrailSection = document.querySelector('#record-trail-section');
const recordTrail = document.querySelector('#record-trail');
const recordForm = document.querySelector('#record-form');
const recordFormStatus = document.querySelector('#record-form-status');
const recordKind = document.querySelector('#record-kind');
const recordTitle = document.querySelector('#record-title');
const recordTitleLabel = document.querySelector('#record-title-label');
const attendanceLabel = document.querySelector('#record-attendance-label');
const attendanceSelect = document.querySelector('#record-attendance');
const accountLinkSection = document.querySelector('#account-link-section');
const accountLinkForm = document.querySelector('#account-link-form');
const accountLinkStatus = document.querySelector('#account-link-status');
const linkedStudentAccount = document.querySelector('#linked-student-account');
const linkedParentAccounts = document.querySelector('#linked-parent-accounts');
const downloadReport = document.querySelector('#download-report');
const placementSection = document.querySelector('#placement-section');
const placementForm = document.querySelector('#placement-form');
const placementStatus = document.querySelector('#placement-status');
const placementGender = document.querySelector('#placement-gender');
const placementDormitory = document.querySelector('#placement-dormitory');
const dormitorySection = document.querySelector('#dormitory-section');
const dormitoryForm = document.querySelector('#dormitory-form');
const dormitoryStatus = document.querySelector('#dormitory-status');
const assignmentForm = document.querySelector('#assignment-form');
const assignmentStatus = document.querySelector('#assignment-status');
const assignmentAccount = document.querySelector('#assignment-account');
const assignmentDormitory = document.querySelector('#assignment-dormitory');
const assignmentList = document.querySelector('#assignment-list');
const studentGender = document.querySelector('#student-gender');
const studentDormitory = document.querySelector('#student-dormitory');
let currentRole = null;
let dormitories = [];
const staffNav = document.querySelector('#staff-nav');

function session() {
  try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; }
}

function headers() {
  const current = session();
  return current ? { Authorization: `Bearer ${current.accessToken}` } : {};
}

function today() { return new Date().toISOString().slice(0, 10); }

function setRecordFields() {
  const kind = recordKind.value;
  const attendance = kind === 'attendance';
  attendanceLabel.hidden = !attendance;
  attendanceSelect.hidden = !attendance;
  recordTitleLabel.hidden = attendance;
  recordTitle.hidden = attendance;
  recordTitle.required = !attendance && ['activities', 'achievements'].includes(kind);
  recordTitleLabel.textContent = kind === 'achievements' ? 'Judul capaian' : 'Judul kegiatan';
  document.querySelector('#record-note-label').textContent = kind === 'evaluations' ? 'Catatan evaluasi' : kind === 'violations' ? 'Catatan pelanggaran' : 'Deskripsi';
}

function metric(value, label) {
  const item = document.createElement('div'); item.className = 'portal-metric';
  const number = document.createElement('strong'); number.textContent = value;
  const copy = document.createElement('span'); copy.textContent = label;
  item.append(number, copy); return item;
}

const ATTENDANCE_LABELS = Object.freeze({
  present: 'Hadir tepat waktu',
  late: 'Terlambat',
  excused: 'Izin / sakit',
  absent: 'Tidak hadir'
});

// Kelima koleksi digabung jadi satu daftar berurut waktu, karena yang ingin dilihat
// musyrif adalah "apa yang terjadi terakhir pada santri ini", bukan lima daftar terpisah.
const RECORD_TRAIL_KINDS = Object.freeze([
  { label: 'Kegiatan', pick: (data) => data.activities, summary: (entry) => entry.title },
  { label: 'Prestasi', pick: (data) => data.achievements, summary: (entry) => entry.title },
  { label: 'Kehadiran', pick: (data) => data.attendance.entries, summary: (entry) => `${ATTENDANCE_LABELS[entry.status] || entry.status} · ${entry.category}` },
  { label: 'Evaluasi', pick: (data) => data.evaluations, summary: (entry) => `${entry.area} · ${entry.note}` },
  { label: 'Pelanggaran', pick: (data) => data.discipline, summary: (entry) => `${entry.level} · ${entry.note}` }
]);

function recordTrailItem(entry) {
  const baris = document.createElement('article');
  baris.className = 'record-trail__item';

  const kepala = document.createElement('div');
  kepala.className = 'record-trail__head';
  const jenis = document.createElement('span');
  jenis.className = 'record-trail__kind';
  jenis.textContent = entry.kindLabel;
  const tanggal = document.createElement('span');
  tanggal.className = 'record-trail__date';
  tanggal.textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(entry.occurredAt));
  kepala.append(jenis, tanggal);

  const isi = document.createElement('p');
  isi.className = 'record-trail__summary';
  isi.textContent = entry.summary;

  const pencatat = document.createElement('p');
  pencatat.className = 'record-trail__actor';
  // Catatan sebelum migrasi 033, dan catatan dari akun staf yang sudah dihapus,
  // tidak punya nama pencatat. Dinyatakan apa adanya, bukan disembunyikan, supaya
  // selisih antara catatan yang dapat ditelusuri dan yang tidak terlihat jelas.
  if (entry.recordedByName) {
    pencatat.textContent = `Dicatat oleh ${entry.recordedByName}`;
  } else {
    pencatat.textContent = 'Pencatat tidak tersimpan';
    pencatat.classList.add('record-trail__actor--kosong');
  }

  baris.append(kepala, isi, pencatat);
  return baris;
}

function renderRecordTrail(data) {
  const entries = RECORD_TRAIL_KINDS
    .flatMap((kind) => (kind.pick(data) || []).map((entry) => ({ ...entry, kindLabel: kind.label, summary: kind.summary(entry) })))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 20);

  if (!entries.length) {
    const kosong = document.createElement('p');
    kosong.className = 'form-status';
    kosong.textContent = 'Belum ada catatan untuk santri ini.';
    recordTrail.replaceChildren(kosong);
    return;
  }

  recordTrail.replaceChildren(...entries.map(recordTrailItem));
}

function renderDashboard(data) {
  const title = document.createElement('h2'); title.textContent = data.student.name;
  const copy = document.createElement('p'); copy.textContent = `${data.student.program} · Bergabung ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(data.student.joinDate))}`;
  const metrics = document.createElement('div'); metrics.className = 'portal-metrics';
  metrics.append(metric(data.attendance.rate === null ? 'Belum ada data' : `${data.attendance.rate}%`, 'Kehadiran'), metric(String(data.achievements.length), 'Achievement'), metric(String(data.discipline.length), 'Catatan disiplin'));
  const activity = document.createElement('p'); activity.textContent = data.activities[0] ? `Kegiatan terakhir: ${data.activities[0].title}` : 'Belum ada kegiatan tercatat.';
  dashboard.replaceChildren(title, copy, metrics, activity); dashboard.hidden = false;
  renderRecordTrail(data);
}

// ---------------------------------------------------------------------------
// Ibadah (sholat berjamaah, setoran hafalan) dan kesehatan.
// ---------------------------------------------------------------------------
const careSection = document.querySelector('#care-section');
const careSummary = document.querySelector('#care-summary');
const healthForm = document.querySelector('#health-form');
const LABEL_HAFALAN = { lancar: 'lancar', 'kurang-lancar': 'kurang lancar', ulang: 'perlu diulang' };

function hariIniWib() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

async function loadCare(studentId) {
  careSection.hidden = false;
  ['#prayer-date', '#memorization-date', '#health-date'].forEach((selector) => {
    const field = document.querySelector(selector);
    if (field && !field.value) field.value = hariIniWib();
    if (field) field.max = hariIniWib();
  });
  try {
    const response = await fetch('/api/students/' + encodeURIComponent(studentId) + '/care', { headers: headers() });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Ringkasan ibadah belum dapat dimuat.');
    const care = result.care;
    healthForm.hidden = !result.healthEnabled;
    const sholat = care.prayers.recorded
      ? care.prayers.recorded + ' presensi sholat tercatat 30 hari terakhir, ' + care.prayers.berjamaahRate + '% berjamaah.'
      : 'Belum ada presensi sholat 30 hari terakhir.';
    const terakhir = care.memorization[0];
    const hafalan = terakhir
      ? ' Setoran terakhir ' + terakhir.occurredOn + ': ' + terakhir.portion + ' (' + (LABEL_HAFALAN[terakhir.grade] || terakhir.grade) + ').'
      : ' Belum ada setoran hafalan 30 hari terakhir.';
    careSummary.textContent = sholat + hafalan;
  } catch (error) {
    careSummary.textContent = error.message;
  }
}

async function kirimCare(url, method, body, statusEl, pesanSukses) {
  statusEl.classList.remove('is-error');
  try {
    const response = await fetch(url, { method, headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Catatan belum dapat disimpan.');
    statusEl.textContent = pesanSukses;
    await loadCare(studentSelect.value);
    return true;
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.classList.add('is-error');
    return false;
  }
}

document.querySelector('#prayer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const statusEl = document.querySelector('#prayer-form-status');
  if (!studentSelect.value) { statusEl.textContent = 'Pilih santri terlebih dahulu.'; statusEl.classList.add('is-error'); return; }
  const entries = [...document.querySelectorAll('#prayer-form select[data-prayer]')]
    .filter((select) => select.value)
    .map((select) => ({ prayer: select.dataset.prayer, status: select.value }));
  if (!entries.length) { statusEl.textContent = 'Pilih status untuk minimal satu waktu sholat.'; statusEl.classList.add('is-error'); return; }
  const tanggal = document.querySelector('#prayer-date').value;
  const ok = await kirimCare('/api/students/' + encodeURIComponent(studentSelect.value) + '/prayers', 'PUT', { date: tanggal, entries }, statusEl, entries.length + ' waktu sholat tanggal ' + tanggal + ' tersimpan.');
  if (ok) document.querySelectorAll('#prayer-form select[data-prayer]').forEach((select) => { select.value = ''; });
});

document.querySelector('#memorization-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const statusEl = document.querySelector('#memorization-form-status');
  if (!studentSelect.value) { statusEl.textContent = 'Pilih santri terlebih dahulu.'; statusEl.classList.add('is-error'); return; }
  const ok = await kirimCare('/api/students/' + encodeURIComponent(studentSelect.value) + '/memorization', 'POST', {
    occurredOn: document.querySelector('#memorization-date').value,
    kind: document.querySelector('#memorization-kind').value,
    portion: document.querySelector('#memorization-portion').value,
    grade: document.querySelector('#memorization-grade').value,
    note: document.querySelector('#memorization-note').value
  }, statusEl, 'Setoran hafalan tersimpan.');
  if (ok) { document.querySelector('#memorization-portion').value = ''; document.querySelector('#memorization-note').value = ''; }
});

healthForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const statusEl = document.querySelector('#health-form-status');
  if (!studentSelect.value) { statusEl.textContent = 'Pilih santri terlebih dahulu.'; statusEl.classList.add('is-error'); return; }
  const ok = await kirimCare('/api/students/' + encodeURIComponent(studentSelect.value) + '/health', 'POST', {
    occurredOn: document.querySelector('#health-date').value,
    condition: document.querySelector('#health-condition').value,
    complaint: document.querySelector('#health-complaint').value,
    actionTaken: document.querySelector('#health-action').value,
    parentNote: document.querySelector('#health-parent-note').value
  }, statusEl, 'Catatan kesehatan tersimpan.');
  if (ok) ['#health-complaint', '#health-action', '#health-parent-note'].forEach((selector) => { document.querySelector(selector).value = ''; });
});

async function loadDashboard() {
  const studentId = studentSelect.value;
  if (!studentId) {
    dashboard.hidden = true;
    recordSection.hidden = true;
    recordTrailSection.hidden = true;
    downloadReport.hidden = true;
    placementSection.hidden = true;
    if (monitoringEmptyState) monitoringEmptyState.hidden = false;
    return;
  }
  if (monitoringEmptyState) monitoringEmptyState.hidden = true;
  const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/dashboard`, { headers: headers() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Dashboard belum dapat dimuat.');
  renderDashboard(result.dashboard); recordSection.hidden = false; recordTrailSection.hidden = false; downloadReport.hidden = false;
  await loadCare(studentId);
  placementSection.hidden = false;
  placementGender.value = result.dashboard.student.gender || '';
  fillDormitorySelect(placementDormitory, result.dashboard.student.dormitoryId, 'Belum ditempatkan');
  placementStatus.textContent = '';
}

function fillDormitorySelect(select, selected, placeholder) {
  select.replaceChildren(new Option(placeholder, ''));
  dormitories.forEach((asrama) => select.add(new Option(`${asrama.name} · ${asrama.area} · ${asrama.gender}`, asrama.id)));
  select.value = selected || '';
}

function renderAssignments(assignments) {
  if (!assignments.length) {
    const kosong = document.createElement('p');
    kosong.className = 'form-status';
    kosong.textContent = 'Belum ada musyrif yang ditugaskan. Selama belum ditugaskan, musyrif tidak melihat santri mana pun.';
    assignmentList.replaceChildren(kosong);
    return;
  }
  assignmentList.replaceChildren(...assignments.map((tugas) => {
    const baris = document.createElement('div');
    baris.className = 'portal-account';
    const nama = document.createElement('strong');
    nama.textContent = tugas.accountName;
    const asrama = document.createElement('span');
    asrama.textContent = `${tugas.dormitoryName} · ${tugas.email}`;
    const cabut = document.createElement('button');
    cabut.type = 'button';
    cabut.className = 'button button--secondary';
    cabut.textContent = 'Cabut';
    cabut.addEventListener('click', () => unassign(tugas.dormitoryId, tugas.accountId));
    baris.append(nama, asrama, cabut);
    return baris;
  }));
}

async function unassign(dormitoryId, accountId) {
  assignmentStatus.classList.remove('is-error');
  try {
    const response = await fetch(`/api/dormitories/${encodeURIComponent(dormitoryId)}/staff/${encodeURIComponent(accountId)}`, {
      method: 'DELETE', headers: headers()
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Penugasan belum dapat dicabut.');
    }
    assignmentStatus.textContent = 'Penugasan dicabut.';
    await loadDormitories();
  } catch (error) {
    assignmentStatus.textContent = error.message || 'Penugasan belum dapat dicabut.';
    assignmentStatus.classList.add('is-error');
  }
}

async function loadDormitories() {
  if (currentRole !== 'admin') return;
  const response = await fetch('/api/dormitories', { headers: headers() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Daftar asrama belum dapat dimuat.');
  dormitories = result.dormitories;
  fillDormitorySelect(studentDormitory, '', 'Belum ditempatkan');
  fillDormitorySelect(assignmentDormitory, '', 'Pilih asrama');
  fillDormitorySelect(placementDormitory, placementDormitory.value, 'Belum ditempatkan');
  renderAssignments(result.assignments);
}

async function loadAssignableAccounts() {
  if (currentRole !== 'admin') return;
  const response = await fetch('/api/accounts', { headers: headers() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Daftar akun belum dapat dimuat.');
  linkedStudentAccount.replaceChildren(new Option('Belum dihubungkan', ''));
  linkedParentAccounts.replaceChildren();
  result.items.filter((account) => account.role === 'student').forEach((account) => linkedStudentAccount.add(new Option(`${account.name} · ${account.email}`, account.id)));
  result.items.filter((account) => account.role === 'parent').forEach((account) => linkedParentAccounts.add(new Option(`${account.name} · ${account.email}`, account.id)));
  assignmentAccount.replaceChildren(new Option('Pilih musyrif', ''));
  result.items.filter((account) => account.role === 'supervisor').forEach((account) => assignmentAccount.add(new Option(`${account.name} · ${account.email}`, account.id)));
}

let studentPicker = null;
async function loadStudents() {
  if (!studentPicker) studentPicker = window.HamasahStudentPicker.attach(studentSelect, { headers, placeholder: 'Pilih santri' });
  await studentPicker.reload();
  await loadDashboard();
}

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); studentFormStatus.classList.remove('is-error');
  try {
    const response = await fetch('/api/students', {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.querySelector('#student-name').value,
        program: document.querySelector('#student-program').value,
        city: document.querySelector('#student-city').value,
        joinDate: document.querySelector('#student-join-date').value,
        gender: studentGender.value || undefined,
        dormitoryId: studentDormitory.value || undefined
      })
    });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Profil santri belum dapat disimpan.');
    studentForm.reset(); document.querySelector('#student-city').value = 'Kairo'; document.querySelector('#student-join-date').value = today();
    studentFormStatus.textContent = `${result.student.name} berhasil ditambahkan.`;
    await loadStudents(); studentSelect.value = result.student.id; await loadDashboard();
  } catch (error) { studentFormStatus.textContent = error.message || 'Profil santri belum dapat disimpan.'; studentFormStatus.classList.add('is-error'); }
});

recordKind.addEventListener('change', setRecordFields);
studentSelect.addEventListener('change', () => loadDashboard().catch((error) => { recordFormStatus.textContent = error.message; recordFormStatus.classList.add('is-error'); }));
recordForm.addEventListener('submit', async (event) => {
  event.preventDefault(); recordFormStatus.classList.remove('is-error');
  const studentId = studentSelect.value; if (!studentId) return;
  const kind = recordKind.value;
  const payload = { occurredAt: document.querySelector('#record-date').value };
  if (kind === 'attendance') { payload.status = attendanceSelect.value; payload.category = 'Kegiatan harian'; payload.note = document.querySelector('#record-note').value; }
  if (kind === 'activities' || kind === 'achievements') { payload.title = recordTitle.value; payload.description = document.querySelector('#record-note').value; }
  if (kind === 'evaluations') { payload.note = document.querySelector('#record-note').value; payload.area = 'Pembinaan'; }
  if (kind === 'violations') { payload.note = document.querySelector('#record-note').value; payload.level = 'ringan'; }
  try {
    const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/${kind}`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Catatan belum dapat disimpan.');
    recordForm.reset(); document.querySelector('#record-date').value = today(); setRecordFields();
    recordFormStatus.textContent = 'Catatan berhasil disimpan.'; await loadDashboard();
  } catch (error) { recordFormStatus.textContent = error.message || 'Catatan belum dapat disimpan.'; recordFormStatus.classList.add('is-error'); }
});

accountLinkForm.addEventListener('submit', async (event) => {
  event.preventDefault(); accountLinkStatus.classList.remove('is-error');
  if (!studentSelect.value) { accountLinkStatus.textContent = 'Pilih profil santri terlebih dahulu.'; accountLinkStatus.classList.add('is-error'); return; }
  try {
    const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/accounts`, {
      method: 'PATCH', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAccountId: linkedStudentAccount.value || null, parentAccountIds: [...linkedParentAccounts.selectedOptions].map((option) => option.value) })
    });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Relasi akun belum dapat disimpan.');
    accountLinkStatus.textContent = 'Relasi akun berhasil disimpan.';
  } catch (error) { accountLinkStatus.textContent = error.message || 'Relasi akun belum dapat disimpan.'; accountLinkStatus.classList.add('is-error'); }
});

placementForm.addEventListener('submit', async (event) => {
  event.preventDefault(); placementStatus.classList.remove('is-error');
  if (!studentSelect.value) { placementStatus.textContent = 'Pilih profil santri terlebih dahulu.'; placementStatus.classList.add('is-error'); return; }
  try {
    const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/placement`, {
      method: 'PATCH', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ gender: placementGender.value || null, dormitoryId: placementDormitory.value || null })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Penempatan belum dapat disimpan.');
    placementStatus.textContent = 'Penempatan berhasil disimpan.';
    await loadStudents();
  } catch (error) { placementStatus.textContent = error.message || 'Penempatan belum dapat disimpan.'; placementStatus.classList.add('is-error'); }
});

dormitoryForm.addEventListener('submit', async (event) => {
  event.preventDefault(); dormitoryStatus.classList.remove('is-error');
  try {
    const response = await fetch('/api/dormitories', {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.querySelector('#dormitory-name').value,
        area: document.querySelector('#dormitory-area').value,
        gender: document.querySelector('#dormitory-gender').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Asrama belum dapat disimpan.');
    dormitoryForm.reset();
    dormitoryStatus.textContent = `${result.dormitory.name} berhasil ditambahkan.`;
    await loadDormitories();
  } catch (error) { dormitoryStatus.textContent = error.message || 'Asrama belum dapat disimpan.'; dormitoryStatus.classList.add('is-error'); }
});

assignmentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); assignmentStatus.classList.remove('is-error');
  if (!assignmentAccount.value || !assignmentDormitory.value) {
    assignmentStatus.textContent = 'Pilih musyrif dan asrama terlebih dahulu.'; assignmentStatus.classList.add('is-error'); return;
  }
  try {
    const response = await fetch(`/api/dormitories/${encodeURIComponent(assignmentDormitory.value)}/staff/${encodeURIComponent(assignmentAccount.value)}`, {
      method: 'POST', headers: headers()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Penugasan belum dapat disimpan.');
    assignmentStatus.textContent = 'Musyrif berhasil ditugaskan.';
    await loadDormitories();
  } catch (error) { assignmentStatus.textContent = error.message || 'Penugasan belum dapat disimpan.'; assignmentStatus.classList.add('is-error'); }
});

downloadReport.addEventListener('click', async () => {
  try {
    const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/report`, { headers: headers() });
    if (!response.ok) throw new Error('Ringkasan belum dapat dibuat.');
    const blob = await response.blob();
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'ringkasan-santri.csv'; link.click(); URL.revokeObjectURL(link.href);
  } catch (error) { recordFormStatus.textContent = error.message || 'Ringkasan belum dapat dibuat.'; recordFormStatus.classList.add('is-error'); }
});

document.querySelector('#reload-students').addEventListener('click', () => loadStudents().catch((error) => { guardCopy.textContent = error.message; }));
document.querySelector('#student-join-date').value = today();
document.querySelector('#record-date').value = today();
setRecordFields();

// Subtab switching
const tabBtns = [
  { btn: document.querySelector('#tab-btn-tracking'), panel: document.querySelector('#panel-tracking') },
  { btn: document.querySelector('#tab-btn-add-student'), panel: document.querySelector('#panel-add-student') },
  { btn: document.querySelector('#tab-btn-placement'), panel: document.querySelector('#panel-placement') },
  { btn: document.querySelector('#tab-btn-dorm-mgmt'), panel: document.querySelector('#panel-dorm-mgmt') },
  { btn: document.querySelector('#tab-btn-link-account'), panel: document.querySelector('#panel-link-account') }
];

function switchTab(clickedBtn) {
  tabBtns.forEach(({ btn, panel }) => {
    if (btn && panel) {
      const active = btn === clickedBtn;
      btn.classList.toggle('is-active', active);
      panel.hidden = !active;
    }
  });
}

tabBtns.forEach(({ btn }) => {
  if (btn) btn.addEventListener('click', () => switchTab(btn));
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
    if (!response.ok || !['admin', 'supervisor'].includes(result.account.role)) throw new Error('Halaman ini hanya dapat dibuka oleh admin atau pengawas.');
    currentRole = result.account.role; guard.hidden = true; consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, currentRole, 'monitoring', result.account);
    if (currentRole === 'admin') {
      document.querySelectorAll('.admin-only-tab').forEach((tab) => { tab.hidden = false; });
      accountLinkSection.hidden = false;
      dormitorySection.hidden = false;
      await loadAssignableAccounts();
      await loadDormitories();
    }
    await loadStudents();
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
    const judul = guard.querySelector('h1');
    if (judul) judul.textContent = 'Akses monitoring belum tersedia';
  }
}());
