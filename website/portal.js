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

const staffNav = document.querySelector('#staff-nav');

const roleLabels = {
  admin: 'Admin',
  'registration-officer': 'Petugas Pendaftaran',
  supervisor: 'Pengawas',
  teacher: 'Guru',
  finance: 'Keuangan',
  parent: 'Portal Wali',
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

function renderDashboard(dashboard) {
  const title = document.createElement('h2');
  title.textContent = dashboard.student.name;
  const description = document.createElement('p');
  description.textContent = `${dashboard.student.program} · ${dashboard.student.city}`;
  const metrics = document.createElement('div');
  metrics.className = 'portal-metrics';
  metrics.append(
    metric(dashboard.attendance.rate === null ? '—' : `${dashboard.attendance.rate}%`, 'Kehadiran tercatat'),
    metric(String(dashboard.achievements.length), 'Achievement'),
    metric(String(dashboard.activities.length), 'Kegiatan tercatat')
  );
  const latest = document.createElement('p');
  latest.textContent = dashboard.evaluations[0] ? `Evaluasi terakhir: ${dashboard.evaluations[0].note}` : 'Belum ada evaluasi tercatat.';
  studentDashboard.replaceChildren(title, description, metrics, latest);
  studentDashboard.hidden = false;
}

async function loadDashboard(studentId) {
  const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/dashboard`, { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Dashboard belum dapat dimuat.');
  renderDashboard(result.dashboard);
}

function renderStudents(students) {
  studentList.replaceChildren();
  studentDashboard.hidden = true;
  if (!students.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Belum ada santri yang terhubung dengan akun ini.';
    studentList.append(empty);
    return;
  }
  students.forEach((student) => {
    const card = document.createElement('article');
    card.className = 'portal-student-card';
    const name = document.createElement('h3');
    name.textContent = student.name;
    const copy = document.createElement('p');
    copy.textContent = `${student.program} · ${student.city}`;
    const button = document.createElement('button');
    button.className = 'button button--secondary';
    button.type = 'button';
    button.textContent = 'Lihat ringkasan';
    button.addEventListener('click', () => loadDashboard(student.id).catch((error) => {
      studentsStatus.textContent = error.message || 'Dashboard belum dapat dimuat.';
      studentsStatus.classList.add('is-error');
    }));
    card.append(name, copy, button);
    studentList.append(card);
  });
}

async function loadStudents() {
  studentsStatus.classList.remove('is-error');
  studentsStatus.textContent = 'Memuat data santri...';
  const response = await fetch('/api/my-students', { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Data santri belum dapat dimuat.');
  renderStudents(result.items);
  studentsStatus.textContent = `${result.items.length} santri tersedia.`;
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

async function loadAccounts() {
  const response = await fetch('/api/accounts', { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Daftar akun belum dapat dimuat.');
  renderAccounts(result.items);
}

async function showPortal() {
  const response = await fetch('/api/me', { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Sesi sudah berakhir.');
  portalLogin.hidden = true;
  portalConsole.hidden = false;
  portalLogout.hidden = false;
  portalRoleLabel.textContent = roleLabels[result.account.role] || 'Portal Hamasah';
  portalTitle.textContent = `Assalamu'alaikum, ${result.account.name}.`;
  renderStaffNav(staffNav, result.account.role, 'portal');
  await loadStudents();
  if (result.account.role === 'admin') {
    portalAdmin.hidden = false;
    await loadAccounts();
  }
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
    await loadAccounts();
  } catch (error) {
    accountFormStatus.textContent = error.message || 'Akun belum dapat dibuat.';
    accountFormStatus.classList.add('is-error');
  }
});

portalLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: requestHeaders() }).catch(() => {});
  sessionStorage.removeItem('hamasahPortalSession');
  window.location.reload();
});

if (getSession()) {
  showPortal().catch((error) => {
    sessionStorage.removeItem('hamasahPortalSession');
    setLoginError(error.message || 'Sesi sudah berakhir.');
  });
}
