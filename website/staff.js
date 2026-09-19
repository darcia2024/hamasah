const loginSection = document.querySelector('#staff-login');
const loginForm = document.querySelector('#staff-login-form');
const loginStatus = document.querySelector('#staff-login-status');
const consoleSection = document.querySelector('#staff-console');
const logoutButton = document.querySelector('#logout-button');
const refreshButton = document.querySelector('#refresh-registrations');
const registrationList = document.querySelector('#registration-list');
const registrationListStatus = document.querySelector('#registration-list-status');
const articleForm = document.querySelector('#article-form');
const articleFormStatus = document.querySelector('#article-form-status');
const staffNav = document.querySelector('#staff-nav');

const STAFF_ROLES = Object.freeze(['admin', 'registration-officer']);

const statusOptions = [
  ['submitted', 'Data dikirim'], ['document-review', 'Pemeriksaan berkas'], ['needs-revision', 'Perlu perbaikan'],
  ['academic-preparation', 'Persiapan akademik'], ['ready-for-departure', 'Siap keberangkatan'],
  ['completed', 'Selesai'], ['cancelled', 'Dibatalkan']
];

// Kunci penyimpanan sesi disamakan dengan halaman lain (hamasahPortalSession), supaya
// akun yang sudah masuk lewat Portal atau halaman lain tidak perlu login ulang di sini.
function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null');
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem('hamasahPortalSession');
}

function authHeaders() {
  const session = getSession();
  return session ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

const labelPeranPelaku = {
  applicant: 'calon santri',
  'registration-officer': 'petugas pendaftaran',
  admin: 'admin'
};

// Dipakai jika akun pelaku sudah dihapus sehingga namanya tidak tersedia.
function labelPeran(role) {
  return labelPeranPelaku[role] || 'petugas';
}

function formatWaktu(value) {
  const waktu = new Date(value);
  if (Number.isNaN(waktu.getTime())) return 'waktu tidak tercatat';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta'
  }).format(waktu);
}

function renderRegistrations(items) {
  registrationList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Belum ada pendaftaran masuk.';
    registrationList.append(empty);
    return;
  }

  items.forEach((registration) => {
    const card = document.createElement('article');
    card.className = 'staff-registration';
    const content = document.createElement('div');
    const name = document.createElement('h2');
    name.textContent = registration.applicant.applicantName;
    const identity = document.createElement('p');
    identity.textContent = `${registration.registrationId} · ${registration.program}`;
    const meta = document.createElement('div');
    meta.className = 'staff-registration__meta';
    const terakhir = (registration.history || []).at(-1);
    const pelaku = terakhir ? (terakhir.byName || labelPeran(terakhir.byRole)) : '';
    [
      `WhatsApp calon: ${registration.applicant.phone}`,
      `Wali: ${registration.applicant.guardianName || 'Belum diisi'} · ${registration.applicant.guardianPhone || 'Belum diisi'}`,
      `Pendidikan: ${registration.applicant.educationLevel || 'Belum diisi'} · Domisili: ${registration.applicant.city || 'Belum diisi'}`,
      `Status: ${registration.statusLabel} · Progres ${registration.progress}%`,
      terakhir ? `Terakhir diubah oleh ${pelaku} pada ${formatWaktu(terakhir.at)}` : 'Belum ada perubahan status.'
    ].forEach((text) => {
      const line = document.createElement('p');
      line.textContent = text;
      meta.append(line);
    });
    content.append(name, identity, meta);

    const controls = document.createElement('div');
    controls.className = 'staff-registration__controls';
    const select = document.createElement('select');
    statusOptions.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === registration.status;
      select.append(option);
    });
    const update = document.createElement('button');
    update.className = 'button button--secondary';
    update.type = 'button';
    update.textContent = 'Simpan status';
    update.addEventListener('click', async () => {
      update.disabled = true;
      try {
        const response = await fetch(`/api/registrations/${encodeURIComponent(registration.registrationId)}/status`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: select.value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Status belum dapat disimpan.');
        await loadRegistrations();
      } catch (error) {
        registrationListStatus.textContent = error.message || 'Status belum dapat disimpan.';
        registrationListStatus.classList.add('is-error');
      } finally {
        update.disabled = false;
      }
    });
    controls.append(select, update);
    card.append(content, controls);
    registrationList.append(card);
  });
}

async function loadRegistrations() {
  registrationListStatus.classList.remove('is-error');
  registrationListStatus.textContent = 'Memuat data pendaftar...';
  const response = await fetch('/api/registrations', { headers: authHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Data pendaftar belum dapat dimuat.');
  renderRegistrations(result.items);
  const badgeEl = document.querySelector('#badge-reg-count');
  if (badgeEl) badgeEl.textContent = result.items.length;
  registrationListStatus.textContent = `${result.items.length} pendaftaran tersedia.`;
}

function showConsole(account) {
  const role = typeof account === 'string' ? account : account.role;
  document.body.classList.add('in-crm');
  loginSection.hidden = true;
  consoleSection.hidden = false;
  logoutButton.hidden = false;
  renderStaffNav(staffNav, role, 'staff', typeof account === 'object' ? account : null);
  loadRegistrations().catch((error) => {
    registrationListStatus.textContent = error.message || 'Data pendaftar belum dapat dimuat.';
    registrationListStatus.classList.add('is-error');
  });
}

// Sub-Tab Switcher
const tabBtnRegs = document.querySelector('#tab-btn-registrations');
const tabBtnArticle = document.querySelector('#tab-btn-article');
const panelRegs = document.querySelector('#panel-registrations');
const panelArticle = document.querySelector('#panel-article');

if (tabBtnRegs && tabBtnArticle && panelRegs && panelArticle) {
  tabBtnRegs.addEventListener('click', () => {
    tabBtnRegs.classList.add('is-active');
    tabBtnArticle.classList.remove('is-active');
    panelRegs.hidden = false;
    panelArticle.hidden = true;
  });
  tabBtnArticle.addEventListener('click', () => {
    tabBtnArticle.classList.add('is-active');
    tabBtnRegs.classList.remove('is-active');
    panelArticle.hidden = false;
    panelRegs.hidden = true;
  });
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.classList.remove('is-error');
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.querySelector('#staff-email').value, password: document.querySelector('#staff-password').value })
    });
    const result = await response.json();
    if (!response.ok || !STAFF_ROLES.includes(result.account.role)) {
      throw new Error(result.error || 'Akun ini tidak memiliki akses petugas.');
    }
    sessionStorage.setItem('hamasahPortalSession', JSON.stringify({ accessToken: result.accessToken }));
    showConsole(result.account);
  } catch (error) {
    loginStatus.textContent = error.message || 'Login belum berhasil.';
    loginStatus.classList.add('is-error');
  }
});

refreshButton.addEventListener('click', () => loadRegistrations().catch((error) => {
  registrationListStatus.textContent = error.message || 'Data pendaftar belum dapat dimuat.';
  registrationListStatus.classList.add('is-error');
}));

articleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  articleFormStatus.classList.remove('is-error');
  try {
    const response = await fetch('/api/articles', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: document.querySelector('#article-title').value,
        category: document.querySelector('#article-category').value,
        excerpt: document.querySelector('#article-excerpt').value,
        body: document.querySelector('#article-body').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Artikel belum dapat diterbitkan.');
    articleForm.reset();
    document.querySelector('#article-category').value = 'Kegiatan';
    articleFormStatus.textContent = `Artikel “${result.item.title}” sudah diterbitkan.`;
  } catch (error) {
    articleFormStatus.textContent = error.message || 'Artikel belum dapat diterbitkan.';
    articleFormStatus.classList.add('is-error');
  }
});

logoutButton.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});
  clearSession();
  window.location.reload();
});

// Dipanggil saat halaman dibuka dengan sesi yang sudah ada (misal masuk lewat Portal
// lebih dulu, lalu klik menu Pendaftaran). Role tetap diperiksa ulang lewat /api/me,
// bukan sekadar percaya token ada, supaya konsisten dengan halaman staf lainnya.
(async function initialize() {
  if (!getSession()) return;
  document.body.classList.add('in-crm');
  try {
    const response = await fetch('/api/me', { headers: authHeaders() });
    const result = await response.json();
    if (!response.ok || !STAFF_ROLES.includes(result.account.role)) {
      throw new Error('Halaman ini hanya dapat dibuka oleh admin atau petugas pendaftaran.');
    }
    showConsole(result.account);
  } catch (error) {
    clearSession();
  }
}());
