const loginSection = document.querySelector('#staff-login');
const loginForm = document.querySelector('#staff-login-form');
const loginStatus = document.querySelector('#staff-login-status');
const consoleSection = document.querySelector('#staff-console');
const logoutButton = document.querySelector('#logout-button');
const refreshButton = document.querySelector('#refresh-registrations');
const registrationList = document.querySelector('#registration-list');
const registrationListStatus = document.querySelector('#registration-list-status');
const conversionResult = document.querySelector('#conversion-result');
const articleForm = document.querySelector('#article-form');
const articleFormStatus = document.querySelector('#article-form-status');
const staffNav = document.querySelector('#staff-nav');
const registrationSearch = document.querySelector('#registration-search');
const registrationStatusFilter = document.querySelector('#registration-status-filter');
const registrationPagination = document.querySelector('#registration-pagination');
const registrationPrev = document.querySelector('#registration-prev');
const registrationNext = document.querySelector('#registration-next');
const registrationPageLabel = document.querySelector('#registration-page-label');
let registrationPage = 1;

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

function renderConversionResult(conversion) {
  if (!conversionResult || !conversion || !conversion.student) return;
  conversionResult.replaceChildren();
  conversionResult.hidden = false;
  const title = document.createElement('h3');
  title.id = 'conversion-result-title';
  title.textContent = conversion.alreadyConverted ? 'Onboarding sudah tersedia' : 'Onboarding santri dimulai';
  const copy = document.createElement('p');
  copy.textContent = `${conversion.student.name} · ${conversion.student.program} · ${conversion.student.city || 'Kairo'}`;
  const list = document.createElement('div');
  list.className = 'conversion-result__accounts';
  (conversion.accounts || []).forEach((account) => {
    const item = document.createElement('div');
    item.className = 'conversion-result__account';
    const label = document.createElement('strong');
    label.textContent = account.role === 'student' ? 'Akun santri' : 'Akun wali';
    const email = document.createElement('span');
    email.textContent = account.email;
    const status = document.createElement('span');
    status.className = 'conversion-result__status';
    status.textContent = account.onboardingStatus === 'active'
      ? 'Aktif'
      : account.onboardingStatus === 'invitation-sent'
        ? 'Undangan terkirim'
        : account.onboardingStatus === 'invitation-pending'
          ? 'Menunggu pengiriman'
          : 'Undangan belum tersedia';
    item.append(label, email, status);
    list.append(item);
  });
  const next = document.createElement('p');
  next.className = 'conversion-result__next';
  next.textContent = 'Langkah berikutnya: akun menerima email aktivasi, membuat kata sandi, lalu masuk ke portal sesuai perannya.';
  conversionResult.append(title, copy, list, next);
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

    if ((registration.documents || []).length) {
      const documents = document.createElement('div');
      documents.className = 'staff-registration__documents';
      const heading = document.createElement('strong');
      heading.textContent = 'Dokumen pendaftaran';
      documents.append(heading);
      registration.documents.forEach((documentItem) => {
        const row = document.createElement('div');
        row.className = 'staff-document-row';
        const label = document.createElement('span');
        label.textContent = `${documentItem.type} · ${documentItem.reviewStatus || 'pending'}`;
        const review = document.createElement('select');
        [['accepted', 'Terima'], ['rejected', 'Tolak']].forEach(([value, text]) => {
          const option = document.createElement('option'); option.value = value; option.textContent = text;
          option.selected = value === documentItem.reviewStatus; review.append(option);
        });
        const note = document.createElement('input');
        note.type = 'text'; note.placeholder = 'Catatan review'; note.value = documentItem.reviewNote || '';
        const save = document.createElement('button'); save.type = 'button'; save.className = 'button button--secondary'; save.textContent = 'Simpan';
        save.addEventListener('click', async () => {
          save.disabled = true;
          try {
            const response = await fetch(`/api/registrations/${encodeURIComponent(registration.registrationId)}/documents/${encodeURIComponent(documentItem.id)}/review`, {
              method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ reviewStatus: review.value, note: note.value })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Review dokumen belum dapat disimpan.');
            await loadRegistrations();
          } catch (error) {
            registrationListStatus.textContent = error.message;
            registrationListStatus.classList.add('is-error');
          } finally { save.disabled = false; }
        });
        row.append(label, review, note, save); documents.append(row);
      });
      content.append(documents);
    }

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
    const noteBox = document.createElement('div'); noteBox.className = 'staff-note-box';
    const noteInput = document.createElement('textarea'); noteInput.rows = 2; noteInput.placeholder = 'Catatan untuk pendaftar atau internal';
    const visibility = document.createElement('select');
    [['applicant', 'Terlihat pendaftar'], ['internal', 'Internal petugas']].forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; visibility.append(option); });
    const addNote = document.createElement('button'); addNote.type = 'button'; addNote.className = 'button button--secondary'; addNote.textContent = 'Tambah catatan';
    addNote.addEventListener('click', async () => {
      if (!noteInput.value.trim()) return;
      addNote.disabled = true;
      try {
        const response = await fetch(`/api/registrations/${encodeURIComponent(registration.registrationId)}/notes`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: visibility.value, body: noteInput.value }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Catatan belum dapat disimpan.');
        noteInput.value = ''; await loadRegistrations();
      } catch (error) { registrationListStatus.textContent = error.message; registrationListStatus.classList.add('is-error'); }
      finally { addNote.disabled = false; }
    });
    noteBox.append(noteInput, visibility, addNote); controls.append(noteBox);
    const nextStepBox = document.createElement('div'); nextStepBox.className = 'staff-note-box';
    const nextStepTitle = document.createElement('input'); nextStepTitle.placeholder = 'Tindak lanjut berikutnya';
    const nextStepDue = document.createElement('input'); nextStepDue.type = 'date';
    const addNextStep = document.createElement('button'); addNextStep.type = 'button'; addNextStep.className = 'button button--secondary'; addNextStep.textContent = 'Tambah tindak lanjut';
    addNextStep.addEventListener('click', async () => {
      if (!nextStepTitle.value.trim()) return;
      addNextStep.disabled = true;
      try {
        const response = await fetch(`/api/registrations/${encodeURIComponent(registration.registrationId)}/next-steps`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: nextStepTitle.value, dueOn: nextStepDue.value || null }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Tindak lanjut belum dapat disimpan.');
        nextStepTitle.value = ''; nextStepDue.value = ''; await loadRegistrations();
      } catch (error) { registrationListStatus.textContent = error.message; registrationListStatus.classList.add('is-error'); }
      finally { addNextStep.disabled = false; }
    });
    nextStepBox.append(nextStepTitle, nextStepDue, addNextStep); controls.append(nextStepBox);
    if (['ready-for-departure', 'completed'].includes(registration.status)) {
      const convert = document.createElement('button');
      convert.className = 'button button--primary';
      convert.type = 'button';
      convert.textContent = 'Konversi jadi santri';
      convert.addEventListener('click', async () => {
        if (!window.confirm(`Konversi ${registration.applicant.applicantName} menjadi santri sekarang?`)) return;
        convert.disabled = true;
        try {
          const response = await fetch(`/api/registrations/${encodeURIComponent(registration.registrationId)}/convert`, {
            method: 'POST', headers: authHeaders()
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Konversi belum dapat dilakukan.');
          const conversion = result.conversion;
          registrationListStatus.classList.remove('is-error');
          registrationListStatus.textContent = conversion.alreadyConverted
            ? `Pendaftaran sudah terhubung ke santri (${conversion.studentId}).`
            : `Santri berhasil dibuat (${conversion.studentId}). ${conversion.invitationsQueued} undangan masuk antrean.`;
          renderConversionResult(conversion);
          await loadRegistrations();
        } catch (error) {
          registrationListStatus.textContent = error.message || 'Konversi belum dapat dilakukan.';
          registrationListStatus.classList.add('is-error');
        } finally {
          convert.disabled = false;
        }
      });
      controls.append(convert);
    }
    card.append(content, controls);
    registrationList.append(card);
  });
}

async function loadRegistrations() {
  registrationListStatus.classList.remove('is-error');
  registrationListStatus.textContent = 'Memuat data pendaftar...';
  const params = new URLSearchParams({ page: String(registrationPage), pageSize: '10' });
  if (registrationSearch.value.trim()) params.set('search', registrationSearch.value.trim());
  if (registrationStatusFilter.value) params.set('status', registrationStatusFilter.value);
  const response = await fetch(`/api/registrations?${params}`, { headers: authHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Data pendaftar belum dapat dimuat.');
  renderRegistrations(result.items);
  const badgeEl = document.querySelector('#badge-reg-count');
  if (badgeEl) badgeEl.textContent = result.items.length;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  registrationPagination.hidden = pages <= 1;
  registrationPageLabel.textContent = `Halaman ${result.page} dari ${pages}`;
  registrationPrev.disabled = result.page <= 1;
  registrationNext.disabled = result.page >= pages;
  registrationListStatus.textContent = `${result.total} pendaftaran tersedia.`;
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
registrationSearch.addEventListener('input', () => { registrationPage = 1; loadRegistrations().catch(() => {}); });
registrationStatusFilter.addEventListener('change', () => { registrationPage = 1; loadRegistrations().catch(() => {}); });
registrationPrev.addEventListener('click', () => { registrationPage -= 1; loadRegistrations().catch(() => {}); });
registrationNext.addEventListener('click', () => { registrationPage += 1; loadRegistrations().catch(() => {}); });

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
