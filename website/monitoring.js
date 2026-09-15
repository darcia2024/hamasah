const guard = document.querySelector('#monitoring-guard');
const guardCopy = document.querySelector('#monitoring-guard-copy');
const consoleSection = document.querySelector('#monitoring-console');
const studentForm = document.querySelector('#student-form');
const studentFormStatus = document.querySelector('#student-form-status');
const studentSelect = document.querySelector('#monitoring-student-select');
const dashboard = document.querySelector('#monitoring-dashboard');
const recordSection = document.querySelector('#record-section');
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
let currentRole = null;

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

function renderDashboard(data) {
  const title = document.createElement('h2'); title.textContent = data.student.name;
  const copy = document.createElement('p'); copy.textContent = `${data.student.program} · Bergabung ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(data.student.joinDate))}`;
  const metrics = document.createElement('div'); metrics.className = 'portal-metrics';
  metrics.append(metric(data.attendance.rate === null ? '—' : `${data.attendance.rate}%`, 'Kehadiran'), metric(String(data.achievements.length), 'Achievement'), metric(String(data.discipline.length), 'Catatan disiplin'));
  const activity = document.createElement('p'); activity.textContent = data.activities[0] ? `Kegiatan terakhir: ${data.activities[0].title}` : 'Belum ada kegiatan tercatat.';
  dashboard.replaceChildren(title, copy, metrics, activity); dashboard.hidden = false;
}

async function loadDashboard() {
  const studentId = studentSelect.value;
  if (!studentId) { dashboard.hidden = true; recordSection.hidden = true; downloadReport.hidden = true; return; }
  const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/dashboard`, { headers: headers() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Dashboard belum dapat dimuat.');
  renderDashboard(result.dashboard); recordSection.hidden = false; downloadReport.hidden = false;
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
}

async function loadStudents() {
  const response = await fetch('/api/my-students', { headers: headers() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Data santri belum dapat dimuat.');
  const current = studentSelect.value;
  studentSelect.replaceChildren(new Option('Pilih santri', ''));
  result.items.forEach((student) => studentSelect.add(new Option(`${student.name} · ${student.program}`, student.id)));
  studentSelect.value = result.items.some((student) => student.id === current) ? current : '';
  await loadDashboard();
}

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); studentFormStatus.classList.remove('is-error');
  try {
    const response = await fetch('/api/students', {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: document.querySelector('#student-name').value, program: document.querySelector('#student-program').value, city: document.querySelector('#student-city').value, joinDate: document.querySelector('#student-join-date').value })
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

(async function initialize() {
  try {
    const response = await fetch('/api/me', { headers: headers() });
    const result = await response.json();
    if (!response.ok || !['admin', 'supervisor'].includes(result.account.role)) throw new Error('Halaman ini hanya dapat dibuka oleh admin atau pengawas.');
    currentRole = result.account.role; guard.hidden = true; consoleSection.hidden = false;
    if (currentRole === 'admin') { accountLinkSection.hidden = false; await loadAssignableAccounts(); }
    await loadStudents();
  } catch (error) { guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.'; }
}());
