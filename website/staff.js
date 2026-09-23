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
const articleStatus = document.querySelector('#article-status');
const articleSlug = document.querySelector('#article-slug');
const articleSubmit = document.querySelector('#article-submit');
const articlePreviewButton = document.querySelector('#article-preview');
const articlePreviewPanel = document.querySelector('#article-preview-panel');
const articleCoverUrl = document.querySelector('#article-cover-url');
const articleCoverAlt = document.querySelector('#article-cover-alt');
const articleCoverError = document.querySelector('#article-cover-error');
const articleCoverPreview = document.querySelector('#article-cover-preview');
const articleManageList = document.querySelector('#article-manage-list');
const articleListStatus = document.querySelector('#article-list-status');
const refreshArticles = document.querySelector('#refresh-articles');
const staffNav = document.querySelector('#staff-nav');
const registrationSearch = document.querySelector('#registration-search');
const registrationStatusFilter = document.querySelector('#registration-status-filter');
const registrationPagination = document.querySelector('#registration-pagination');
const registrationPrev = document.querySelector('#registration-prev');
const registrationNext = document.querySelector('#registration-next');
const registrationPageLabel = document.querySelector('#registration-page-label');
let registrationPage = 1;

const ARTICLE_STATUS_LABELS = Object.freeze({
  draft: 'Draf',
  published: 'Terbit',
  archived: 'Diarsipkan'
});

const ARTICLE_PAGE_SIZE = 20;
let articleShown = 0;
let articleMoreButton = null;

// Daftar editorial dimuat per halaman dan tanpa isi artikel; isi diambil saat Edit dibuka.
async function loadArticles({ append = false } = {}) {
  if (!articleManageList) return;
  articleListStatus.textContent = 'Memuat artikel...';
  articleListStatus.classList.remove('is-error');
  try {
    const offset = append ? articleShown : 0;
    const response = await fetch(`/api/staff/articles?limit=${ARTICLE_PAGE_SIZE}&offset=${offset}`, { headers: authHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Artikel belum dapat dimuat.');
    if (!append) articleManageList.replaceChildren();
    articleShown = offset + result.items.length;
    if (!articleMoreButton) {
      articleMoreButton = document.createElement('button');
      articleMoreButton.type = 'button';
      articleMoreButton.className = 'button button--secondary';
      articleMoreButton.textContent = 'Muat lebih banyak';
      articleMoreButton.addEventListener('click', () => loadArticles({ append: true }).catch(() => {}));
      articleManageList.after(articleMoreButton);
    }
    articleMoreButton.hidden = articleShown >= result.total;
    if (!result.items.length) {
      const empty = document.createElement('div');
      empty.className = 'crm-empty-state';
      empty.innerHTML = '<strong>Belum ada artikel editorial</strong><span>Simpan artikel pertama sebagai draf untuk mulai meninjau konten sebelum diterbitkan.</span>';
      articleManageList.append(empty);
    }
    result.items.forEach((listed) => {
      let article = listed;
      const row = document.createElement('article');
      row.className = 'staff-registration notification-row article-editorial-row article-status-' + article.status;
      const detail = document.createElement('div');
      detail.className = 'staff-registration__content';
      const title = document.createElement('strong'); title.textContent = article.title;
      const meta = document.createElement('small'); meta.textContent = (ARTICLE_STATUS_LABELS[article.status] || 'Status belum dikenali') + ' · ' + article.category;
      const badge = document.createElement('span'); badge.className = 'article-status-badge article-status-badge--' + article.status; badge.textContent = ARTICLE_STATUS_LABELS[article.status] || 'Status belum dikenali';
     detail.append(title, meta);
     detail.prepend(badge);
      if (article.coverUrl) {
        const cover = document.createElement('img');
        cover.className = 'article-editorial-cover';
        cover.src = article.coverUrl;
        cover.alt = article.coverAltText || '';
        cover.loading = 'lazy';
        cover.addEventListener('error', () => {
          const failed = document.createElement('span');
          failed.className = 'article-cover-failed';
          failed.textContent = 'Cover tidak tersedia';
          cover.replaceWith(failed);
        }, { once: true });
        detail.append(cover);
      }
      const actions = document.createElement('div'); actions.className = 'staff-registration__controls';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button button--secondary'; edit.textContent = 'Edit';
      edit.addEventListener('click', async () => {
        edit.disabled = true;
        try {
          // Daftar tidak membawa isi artikel; ambil versi lengkapnya untuk formulir.
          const detailResponse = await fetch(`/api/staff/articles/${encodeURIComponent(article.slug)}`, { headers: authHeaders() });
          const detailResult = await detailResponse.json();
          if (!detailResponse.ok) throw new Error(detailResult.error || 'Isi artikel belum dapat dimuat.');
          article = detailResult.item;
        } catch (error) {
          articleListStatus.textContent = error.message; articleListStatus.classList.add('is-error');
          edit.disabled = false;
          return;
        }
        edit.disabled = false;
        articleSlug.value = article.slug; articleSlug.disabled = true;
        document.querySelector('#article-title').value = article.title;
        document.querySelector('#article-category').value = article.category;
        document.querySelector('#article-excerpt').value = article.excerpt;
        document.querySelector('#article-body').value = article.body;
        articleCoverUrl.value = article.coverUrl || '';
        articleCoverAlt.value = article.coverAltText || '';
       articleStatus.value = article.status === 'archived' ? 'draft' : article.status;
        updateArticleSubmitLabel();
        renderCoverPreview();
        document.querySelector('#article-form-title').textContent = `Edit artikel: ${article.title}`;
        articleForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const archive = document.createElement('button'); archive.type = 'button'; archive.className = 'button button--text'; archive.textContent = article.status === 'archived' ? 'Pulihkan sebagai draf' : 'Arsipkan';
      archive.addEventListener('click', async () => {
        archive.disabled = true;
        try {
          const response = await fetch(`/api/articles/${encodeURIComponent(article.slug)}`, { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: article.status === 'archived' ? 'draft' : 'archived' }) });
          const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Status artikel belum dapat disimpan.');
          await loadArticles();
        } catch (error) { articleListStatus.textContent = error.message; articleListStatus.classList.add('is-error'); archive.disabled = false; }
      });
      actions.append(edit, archive); row.append(detail, actions); articleManageList.append(row);
    });
    articleListStatus.textContent = `${articleShown} dari ${result.total} artikel editorial.`;
  } catch (error) { articleListStatus.textContent = error.message; articleListStatus.classList.add('is-error'); }
}

const STAFF_ROLES = Object.freeze(['admin', 'registration-officer', 'finance']);

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
    empty.className = 'crm-empty-state';
    empty.innerHTML = '<strong>Belum ada pendaftaran masuk</strong><span>Pendaftaran baru akan muncul di sini setelah calon santri mengirim formulir.</span>';
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
    meta.className = 'staff-registration__meta staff-registration__meta--compact';
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
        // Tanpa ini petugas menyetujui atau menolak paspor, ijazah, dan surat
        // kesehatan tanpa pernah bisa membukanya dari konsol.
        const buka = document.createElement('button');
        buka.type = 'button';
        buka.className = 'button button--secondary';
        buka.textContent = 'Buka berkas';
        buka.disabled = !documentItem.fileObjectId;
        if (!documentItem.fileObjectId) buka.title = 'Berkas belum terunggah lengkap.';
        buka.addEventListener('click', async () => {
          const labelAsli = buka.textContent;
          buka.disabled = true;
          buka.textContent = 'Menyiapkan...';
          try {
            await window.HamasahFileOpen.buka(documentItem.fileObjectId, {
              headers: authHeaders(),
              nama: `${registration.registrationId}-${documentItem.type}`
            });
            registrationListStatus.textContent = '';
            registrationListStatus.classList.remove('is-error');
          } catch (error) {
            registrationListStatus.textContent = error.message;
            registrationListStatus.classList.add('is-error');
          } finally {
            buka.disabled = false;
            buka.textContent = labelAsli;
          }
        });

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
        row.append(label, buka, review, note, save); documents.append(row);
      });
      content.append(documents);
    }

    const controls = document.createElement('div');
    controls.className = 'staff-registration__controls staff-registration__controls--primary';
    const select = document.createElement('select');
    statusOptions.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === registration.status;
      select.append(option);
    });
    const update = document.createElement('button');
    update.className = 'button button--primary';
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
    const noteBox = document.createElement('div'); noteBox.className = 'staff-note-box staff-note-box--secondary';
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
    const nextStepBox = document.createElement('div'); nextStepBox.className = 'staff-note-box staff-note-box--secondary';
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
    if (registration.status !== 'cancelled') controls.append(createDepartureControl(registration));
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

// ---------------------------------------------------------------------------
// Kloter keberangkatan. Daftar kloter dimuat bersama daftar pendaftar supaya pilihan kloter
// di setiap kartu selalu sesuai data terbaru.
// ---------------------------------------------------------------------------
const DEPARTURE_STATUS = { planned: 'Direncanakan', confirmed: 'Terkonfirmasi', departed: 'Sudah berangkat', cancelled: 'Dibatalkan' };
const departureForm = document.querySelector('#departure-form');
const departureFormStatus = document.querySelector('#departure-form-status');
const departureList = document.querySelector('#departure-list');
const departureReset = document.querySelector('#departure-reset');
let departureGroups = [];

function formatTanggalKloter(value) {
  if (!value) return 'Tanggal belum ditetapkan';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
}

function resetDepartureForm() {
  departureForm.reset();
  document.querySelector('#departure-id').value = '';
  document.querySelector('#departure-submit').textContent = 'Simpan kloter';
  departureReset.hidden = true;
}

function renderDepartureGroups() {
  const count = document.querySelector('#departure-count');
  if (count) count.textContent = departureGroups.length;
  departureList.replaceChildren();
  if (!departureGroups.length) {
    const empty = document.createElement('p');
    empty.className = 'departure-list__empty';
    empty.textContent = 'Belum ada kloter. Buat kloter lebih dulu, lalu tugaskan pendaftar dari kartunya.';
    departureList.append(empty);
    return;
  }
  departureGroups.forEach((group) => {
    const row = document.createElement('div');
    row.className = 'departure-list__row';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = group.name;
    const meta = document.createElement('span');
    meta.textContent = [formatTanggalKloter(group.plannedDate), group.origin || 'Asal belum ditetapkan', DEPARTURE_STATUS[group.status] || group.status, (group.memberCount || 0) + ' pendaftar'].join(' · ');
    info.append(name, meta);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'button button--secondary';
    edit.textContent = 'Ubah';
    edit.setAttribute('aria-label', 'Ubah ' + group.name);
    edit.addEventListener('click', () => {
      document.querySelector('#departure-id').value = group.id;
      document.querySelector('#departure-name').value = group.name;
      document.querySelector('#departure-date').value = group.plannedDate || '';
      document.querySelector('#departure-origin').value = group.origin || '';
      document.querySelector('#departure-status').value = group.status;
      document.querySelector('#departure-note').value = group.applicantNote || '';
      document.querySelector('#departure-submit').textContent = 'Simpan perubahan';
      departureReset.hidden = false;
      document.querySelector('#departure-name').focus();
    });
    row.append(info, edit);
    departureList.append(row);
  });
}

async function loadDepartureGroups() {
  const response = await fetch('/api/departures', { headers: authHeaders() });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Kloter belum dapat dimuat.');
  departureGroups = result.items || [];
  renderDepartureGroups();
}

departureReset?.addEventListener('click', resetDepartureForm);
departureForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#departure-id').value;
  const body = {
    name: document.querySelector('#departure-name').value,
    plannedDate: document.querySelector('#departure-date').value || null,
    origin: document.querySelector('#departure-origin').value,
    status: document.querySelector('#departure-status').value,
    applicantNote: document.querySelector('#departure-note').value
  };
  departureFormStatus.classList.remove('is-error');
  try {
    const response = await fetch(id ? '/api/departures/' + encodeURIComponent(id) : '/api/departures', {
      method: id ? 'PATCH' : 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Kloter belum dapat disimpan.');
    departureFormStatus.textContent = 'Kloter "' + result.group.name + '" tersimpan.' + (result.notified ? ' ' + result.notified + ' email perubahan jadwal masuk antrean untuk pendaftar dan wali.' : '');
    resetDepartureForm();
    await loadRegistrations();
  } catch (error) {
    departureFormStatus.textContent = error.message;
    departureFormStatus.classList.add('is-error');
  }
});

function createDepartureControl(registration) {
  const box = document.createElement('div');
  box.className = 'staff-note-box staff-note-box--secondary departure-assign';
  const label = document.createElement('label');
  label.textContent = 'Kloter keberangkatan';
  const select = document.createElement('select');
  const currentId = registration.departure ? registration.departure.id : null;
  const kosong = document.createElement('option');
  kosong.value = '';
  kosong.textContent = 'Belum ditetapkan';
  select.append(kosong);
  departureGroups.forEach((group) => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name + ' (' + formatTanggalKloter(group.plannedDate) + ')';
    option.disabled = group.status === 'cancelled' && currentId !== group.id;
    option.selected = currentId === group.id;
    select.append(option);
  });
  label.append(select);
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'button button--secondary';
  save.textContent = 'Simpan kloter';
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const response = await fetch('/api/registrations/' + encodeURIComponent(registration.registrationId) + '/departure', {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ departureGroupId: select.value || null })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Kloter belum dapat disimpan.');
      await loadRegistrations();
    } catch (error) {
      registrationListStatus.textContent = error.message;
      registrationListStatus.classList.add('is-error');
    } finally { save.disabled = false; }
  });
  box.append(label, save);
  return box;
}

async function loadRegistrations() {
  registrationListStatus.classList.remove('is-error');
  await loadDepartureGroups();
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

function notificationStatusLabel(status) {
  return ({ pending: 'Menunggu worker', processing: 'Sedang dikirim', sent: 'Terkirim', failed: 'Gagal dikirim' })[status] || status;
}

async function loadNotifications() {
  const response = await fetch('/api/notifications?limit=50', { headers: authHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Status notifikasi belum dapat dimuat.');
  notificationList.replaceChildren();
  // Bila pengiriman email tidak dikonfigurasi, sistem tidak mengirim dan tidak
  // mengantre apa pun. Itu dikatakan apa adanya, supaya petugas tahu pemberitahuan
  // ke pendaftar harus dilakukan manual lewat WhatsApp.
  if (result.emailEnabled === false) {
    notificationList.replaceChildren();
    const catatan = document.createElement('p');
    catatan.className = 'monitoring-hint';
    catatan.textContent = 'Pengiriman email belum dikonfigurasi. Sistem tidak mengirim pemberitahuan otomatis, jadi kabar ke pendaftar dan wali dilakukan manual oleh tim.';
    notificationList.append(catatan);
    notificationListStatus.textContent = 'Email nonaktif.';
    return;
  }

  const invitations = (result.items || []).filter((item) => item.notificationType === 'account-invitation');
  if (!invitations.length) {
    const empty = document.createElement('p'); empty.textContent = 'Belum ada pengiriman undangan akun.'; notificationList.append(empty);
  }
  invitations.forEach((item) => {
    const row = document.createElement('article'); row.className = 'staff-registration notification-row';
    const detail = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = item.recipientEmail;
    const meta = document.createElement('p'); meta.textContent = `${notificationStatusLabel(item.status)} · Percobaan ${item.attempts} · ${formatWaktu(item.updatedAt || item.createdAt)}`;
    detail.append(title, meta);
    const actions = document.createElement('div');
    if (item.accountId && item.status !== 'processing') {
      const resend = document.createElement('button'); resend.type = 'button'; resend.className = 'button button--secondary'; resend.textContent = 'Kirim ulang';
      resend.addEventListener('click', async () => {
        resend.disabled = true;
        try {
          const resendResponse = await fetch(`/api/accounts/${encodeURIComponent(item.accountId)}/invitation`, { method: 'POST', headers: authHeaders() });
          const resendResult = await resendResponse.json();
          if (!resendResponse.ok) throw new Error(resendResult.error || 'Undangan belum dapat dikirim ulang.');
          notificationListStatus.textContent = 'Undangan baru masuk antrean pengiriman.';
          notificationListStatus.className = 'form-status is-success';
          await loadNotifications();
        } catch (error) {
          notificationListStatus.textContent = error.message;
          notificationListStatus.className = 'form-status is-error';
        } finally { resend.disabled = false; }
      });
      actions.append(resend);
    }
    row.append(detail, actions); notificationList.append(row);
  });
  notificationListStatus.textContent = `${invitations.length} catatan undangan.`;
}

// Sub-Tab Switcher
const tabBtnRegs = document.querySelector('#tab-btn-registrations');
const tabBtnArticle = document.querySelector('#tab-btn-article');
const tabBtnNotifications = document.querySelector('#tab-btn-notifications');
const panelRegs = document.querySelector('#panel-registrations');
const panelArticle = document.querySelector('#panel-article');
const panelNotifications = document.querySelector('#panel-notifications');
const notificationList = document.querySelector('#notification-list');
const notificationListStatus = document.querySelector('#notification-list-status');
const refreshNotifications = document.querySelector('#refresh-notifications');
const tabBtnImport = document.querySelector('#tab-btn-import');
const panelImport = document.querySelector('#panel-import');
const operationImportForm = document.querySelector('#operation-import-form');
const operationImportStatus = document.querySelector('#operation-import-status');
const operationImportResult = document.querySelector('#operation-import-result');
let activeImportBatch = null;
let operationImportPage = 1;

async function loadOperationImportHistory() {
  const list = document.querySelector('#operation-import-history');
  const status = document.querySelector('#operation-import-history-status');
  if (!list || !status) return;
  const params = new URLSearchParams({ page: String(operationImportPage), pageSize: '8' });
  const statusFilter = document.querySelector('#operation-import-status-filter').value;
  const entityFilter = document.querySelector('#operation-import-entity-filter').value;
  if (statusFilter) params.set('status', statusFilter); if (entityFilter) params.set('entity', entityFilter);
  status.textContent = 'Memuat riwayat...'; status.classList.remove('is-error');
  try {
    const response = await fetch(`/api/operations/imports?${params}`, { headers: authHeaders() });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Riwayat import belum dapat dimuat.');
    list.replaceChildren();
    result.items.forEach((batch) => {
      const row = document.createElement('article'); row.className = 'staff-registration notification-row';
      const detail = document.createElement('div'); const title = document.createElement('strong'); title.textContent = `${batch.entity === 'inventory' ? 'Inventaris' : 'Visa'} · ${batch.status}`;
      const meta = document.createElement('small'); meta.textContent = `${batch.validCount}/${batch.rowCount} baris valid · ${formatWaktu(batch.createdAt)}`; detail.append(title, meta);
      const action = document.createElement('div'); const id = document.createElement('code'); id.textContent = batch.id.slice(0, 8); action.append(id); row.append(detail, action); list.append(row);
    });
    if (!result.items.length) list.textContent = 'Belum ada batch import.';
    const pages = Math.max(1, Math.ceil(result.total / result.pageSize)); const pagination = document.querySelector('#operation-import-pagination');
    pagination.hidden = pages <= 1; document.querySelector('#operation-import-page-label').textContent = `Halaman ${result.page} dari ${pages}`;
    document.querySelector('#operation-import-prev').disabled = result.page <= 1; document.querySelector('#operation-import-next').disabled = result.page >= pages;
    status.textContent = `${result.total} batch ditemukan.`;
  } catch (error) { status.textContent = error.message; status.classList.add('is-error'); }
}

function renderImportBatch(batch) {
  if (!operationImportResult) return;
  activeImportBatch = batch;
  operationImportResult.replaceChildren();
  operationImportResult.hidden = false;
  const title = document.createElement('h4'); title.id = 'operation-import-result-title'; title.textContent = `Preview ${batch.entity === 'inventory' ? 'inventaris' : 'visa'} · ${batch.status}`;
  const summary = document.createElement('div'); summary.className = 'operation-import-summary';
  [[`Baris ${batch.rowCount}`, ''], [`Valid ${batch.validCount}`, ''], [`Error ${batch.errors.length}`, batch.errors.length ? 'error' : '']].forEach(([text, extra]) => { const chip = document.createElement('span'); chip.className = `operation-import-chip ${extra}`; chip.textContent = text; summary.append(chip); });
  operationImportResult.append(title, summary);
  if (batch.errors.length) {
    const list = document.createElement('ul'); list.className = 'operation-import-errors';
    batch.errors.forEach((error) => { const item = document.createElement('li'); item.textContent = `Baris ${error.row} · ${error.field}: ${error.message}`; list.append(item); });
    operationImportResult.append(list);
  }
  const actions = document.createElement('div'); actions.className = 'operation-import-actions';
  if (batch.status === 'previewed' && !batch.errors.length) {
    const commit = document.createElement('button'); commit.type = 'button'; commit.className = 'button button--primary'; commit.textContent = 'Commit import';
    commit.addEventListener('click', () => finishImport('commit', commit)); actions.append(commit);
  }
  if (batch.status === 'previewed') {
    const rollback = document.createElement('button'); rollback.type = 'button'; rollback.className = 'button button--secondary'; rollback.textContent = 'Batalkan batch';
    rollback.addEventListener('click', () => finishImport('rollback', rollback)); actions.append(rollback);
  }
  operationImportResult.append(actions);
}

async function finishImport(action, button) {
  if (!activeImportBatch) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/operations/imports/${encodeURIComponent(activeImportBatch.id)}/${action}`, { method: 'POST', headers: authHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Batch import belum dapat diproses.');
    renderImportBatch(result.batch);
    operationImportStatus.textContent = action === 'commit' ? 'Import berhasil diterapkan.' : 'Batch import dibatalkan tanpa menulis data bisnis.';
    operationImportStatus.classList.remove('is-error');
  } catch (error) { operationImportStatus.textContent = error.message; operationImportStatus.classList.add('is-error'); button.disabled = false; }
}

// ---------------------------------------------------------------------------
// Pesan konsultasi dari formulir publik (Task R1.6)
// ---------------------------------------------------------------------------
const tabBtnInquiries = document.querySelector('#tab-btn-inquiries');
const panelInquiries = document.querySelector('#panel-inquiries');
const inquiryList = document.querySelector('#inquiry-list');
const inquiryListStatus = document.querySelector('#inquiry-list-status');
const inquiryStatusFilter = document.querySelector('#inquiry-status-filter');
const inquiryPagination = document.querySelector('#inquiry-pagination');
const inquiryPageLabel = document.querySelector('#inquiry-page-label');
let inquiryPage = 1;

const INQUIRY_STATUS_LABELS = Object.freeze({
  new: 'Belum ditindaklanjuti',
  contacted: 'Sudah dihubungi',
  closed: 'Selesai'
});

function renderInquiries(items) {
  inquiryList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'field-help';
    empty.textContent = 'Belum ada pesan konsultasi pada filter ini. Pesan baru muncul setelah pengunjung mengirim formulir di halaman kontak.';
    inquiryList.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'crm-white-card staff-registration';

    const head = document.createElement('div');
    head.className = 'inquiry-card__head';
    const title = document.createElement('strong');
    title.textContent = item.name;
    const badge = document.createElement('span');
    badge.className = `article-status-badge article-status-badge--${item.status === 'new' ? 'draft' : item.status === 'contacted' ? 'published' : 'archived'}`;
    badge.textContent = INQUIRY_STATUS_LABELS[item.status] || item.status;
    head.append(title, badge);

    const meta = document.createElement('p');
    meta.className = 'field-help';
    const waktu = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt));
    meta.textContent = `${item.topicLabel} · ${item.phone} · ${waktu}`;

    const message = document.createElement('p');
    message.className = 'staff-note-box';
    message.textContent = item.message;

    const actions = document.createElement('div');
    actions.className = 'article-form-actions';
    Object.entries(INQUIRY_STATUS_LABELS).forEach(([nilai, label]) => {
      if (nilai === item.status) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = nilai === 'contacted' ? 'button button--primary' : 'button button--text';
      button.textContent = `Tandai ${label.toLocaleLowerCase('id-ID')}`;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const response = await fetch(`/api/inquiries/${encodeURIComponent(item.id)}/status`, {
            method: 'PATCH',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nilai })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Status pesan belum dapat diubah.');
          await loadInquiries();
        } catch (error) {
          inquiryListStatus.textContent = error.message;
          inquiryListStatus.classList.add('is-error');
          button.disabled = false;
        }
      });
      actions.append(button);
    });

    row.append(head, meta, message, actions);
    inquiryList.append(row);
  });
}

async function loadInquiries() {
  if (!inquiryList || !inquiryListStatus) return;
  inquiryListStatus.classList.remove('is-error');
  inquiryListStatus.textContent = 'Memuat pesan konsultasi...';
  const params = new URLSearchParams({ page: String(inquiryPage), pageSize: '10' });
  if (inquiryStatusFilter && inquiryStatusFilter.value) params.set('status', inquiryStatusFilter.value);
  try {
    const response = await fetch(`/api/inquiries?${params}`, { headers: authHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pesan konsultasi belum dapat dimuat.');
    renderInquiries(result.items || []);
    inquiryListStatus.textContent = `${result.total} pesan pada filter ini.`;

    const badge = document.querySelector('#badge-inquiry-count');
    if (badge && (!inquiryStatusFilter || inquiryStatusFilter.value === 'new')) badge.textContent = result.total;

    const halaman = Math.max(1, Math.ceil(result.total / result.pageSize));
    if (inquiryPagination) inquiryPagination.hidden = halaman <= 1;
    if (inquiryPageLabel) inquiryPageLabel.textContent = `Halaman ${result.page} dari ${halaman}`;
    const prev = document.querySelector('#inquiry-prev');
    const next = document.querySelector('#inquiry-next');
    if (prev) prev.disabled = result.page <= 1;
    if (next) next.disabled = result.page >= halaman;
  } catch (error) {
    inquiryListStatus.textContent = error.message;
    inquiryListStatus.classList.add('is-error');
    throw error;
  }
}

if (inquiryStatusFilter) inquiryStatusFilter.addEventListener('change', () => { inquiryPage = 1; loadInquiries().catch(() => {}); });
const refreshInquiries = document.querySelector('#refresh-inquiries');
if (refreshInquiries) refreshInquiries.addEventListener('click', () => loadInquiries().catch(() => {}));
const inquiryPrev = document.querySelector('#inquiry-prev');
if (inquiryPrev) inquiryPrev.addEventListener('click', () => { if (inquiryPage > 1) { inquiryPage -= 1; loadInquiries().catch(() => {}); } });
const inquiryNext = document.querySelector('#inquiry-next');
if (inquiryNext) inquiryNext.addEventListener('click', () => { inquiryPage += 1; loadInquiries().catch(() => {}); });

// Saklar subtab konsol petugas.
//
// Sebelumnya tiap tab menyembunyikan panel lain satu per satu, sehingga menambah
// tab berarti menyentuh seluruh handler yang sudah ada dan mudah terlewat.
// Sekarang daftarnya satu tempat: tambah baris untuk menambah tab.
const STAFF_TABS = [
  { button: tabBtnRegs, panel: panelRegs, onOpen: null },
  { button: tabBtnArticle, panel: panelArticle, onOpen: () => loadArticles().catch(() => {}) },
  {
    button: tabBtnNotifications,
    panel: panelNotifications,
    onOpen: () => loadNotifications().catch((error) => {
      notificationListStatus.textContent = error.message;
      notificationListStatus.className = 'form-status is-error';
    })
  },
  { button: tabBtnImport, panel: panelImport, onOpen: () => loadOperationImportHistory().catch(() => {}) },
  { button: tabBtnInquiries, panel: panelInquiries, onOpen: () => loadInquiries().catch(() => {}) }
].filter((tab) => tab.button && tab.panel);

function openStaffTab(target) {
  STAFF_TABS.forEach((tab) => {
    const aktif = tab === target;
    tab.button.classList.toggle('is-active', aktif);
    tab.button.setAttribute('aria-selected', aktif ? 'true' : 'false');
    tab.panel.hidden = !aktif;
  });
  if (target.onOpen) target.onOpen();
}

STAFF_TABS.forEach((tab) => {
  tab.button.addEventListener('click', () => openStaffTab(tab));
});

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
if (refreshNotifications) refreshNotifications.addEventListener('click', () => loadNotifications().catch((error) => {
  notificationListStatus.textContent = error.message;
  notificationListStatus.className = 'form-status is-error';
}));
registrationSearch.addEventListener('input', () => { registrationPage = 1; loadRegistrations().catch(() => {}); });
registrationStatusFilter.addEventListener('change', () => { registrationPage = 1; loadRegistrations().catch(() => {}); });
registrationPrev.addEventListener('click', () => { registrationPage -= 1; loadRegistrations().catch(() => {}); });
registrationNext.addEventListener('click', () => { registrationPage += 1; loadRegistrations().catch(() => {}); });

function updateArticleSubmitLabel() {
  if (!articleSubmit || !articleStatus) return;
  const label = articleSubmit.querySelector('span');
  if (label) label.textContent = articleStatus.value === 'published' ? 'Terbitkan setelah ditinjau' : 'Simpan sebagai draf';
}

function renderCoverPreview() {
  if (!articleCoverPreview || !articleCoverUrl) return;
  const url = articleCoverUrl.value.trim();
  articleCoverPreview.replaceChildren();
  articleCoverPreview.hidden = !url;
  if (!url) return;
  const image = document.createElement('img');
  image.src = url;
  image.alt = articleCoverAlt?.value.trim() || 'Pratinjau cover artikel';
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    articleCoverPreview.replaceChildren();
    const failed = document.createElement('span');
    failed.className = 'article-cover-failed';
    failed.textContent = 'Cover gagal dimuat. Periksa URL HTTPS atau lanjut tanpa cover.';
    articleCoverPreview.append(failed);
  }, { once: true });
  articleCoverPreview.append(image);
}

async function renderArticlePreview() {
  if (!articlePreviewPanel) return;
  articlePreviewPanel.replaceChildren();
  const heading = document.createElement('p'); heading.className = 'eyebrow'; heading.textContent = 'PRATINJAU ARTIKEL';
  const title = document.createElement('h3'); title.textContent = document.querySelector('#article-title')?.value.trim() || 'Judul belum diisi';
  const meta = document.createElement('small'); meta.textContent = (document.querySelector('#article-category')?.value.trim() || 'Kegiatan') + ' · ' + (articleStatus?.value === 'published' ? 'Terbit' : 'Draf');
  const excerpt = document.createElement('p'); excerpt.className = 'article-preview-excerpt'; excerpt.textContent = document.querySelector('#article-excerpt')?.value.trim() || 'Ringkasan belum diisi.';
  // Isi dirender server dengan renderer yang sama dengan halaman publik (Task R7.5), supaya
  // pratinjau tidak menyimpang dari hasil terbit.
  const body = document.createElement('div'); body.className = 'article-preview-body article-prose';
  const source = document.querySelector('#article-body')?.value.trim() || '';
  body.textContent = source ? 'Menyiapkan pratinjau isi...' : 'Isi artikel belum diisi.';
  articlePreviewPanel.append(heading, title, meta, excerpt, body);
  articlePreviewPanel.hidden = false;
  articlePreviewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (!source) return;
  try {
    const response = await fetch('/api/staff/articles/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ body: source })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Pratinjau isi belum dapat dibuat.');
    body.innerHTML = data.html;
  } catch (error) {
    body.textContent = error.message;
  }
}

articleStatus?.addEventListener('change', updateArticleSubmitLabel);
articleCoverUrl?.addEventListener('input', () => {
  if (articleCoverError) articleCoverError.textContent = '';
  renderCoverPreview();
});
articleCoverAlt?.addEventListener('input', renderCoverPreview);
articlePreviewButton?.addEventListener('click', renderArticlePreview);
updateArticleSubmitLabel();

articleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  articleFormStatus.classList.remove('is-error');
  if (articleCoverError) articleCoverError.textContent = '';
  try {
    const editing = articleSlug.value.trim();
    const coverUrl = articleCoverUrl.value.trim();
    const coverAltText = articleCoverAlt.value.trim();
    if (coverUrl && !/^https:\/\//i.test(coverUrl)) throw new Error('Cover media harus memakai URL HTTPS.');
    if (coverUrl && !coverAltText) {
      if (articleCoverError) articleCoverError.textContent = 'Alt text wajib diisi saat memakai cover media.';
      articleCoverAlt.focus();
      return;
    }
    const response = await fetch(editing ? `/api/articles/${encodeURIComponent(editing)}` : '/api/articles', {
      method: editing ? 'PATCH' : 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: document.querySelector('#article-title').value,
        category: document.querySelector('#article-category').value,
        excerpt: document.querySelector('#article-excerpt').value,
        body: document.querySelector('#article-body').value,
        coverUrl,
        coverAltText,
        status: articleStatus.value,
        ...(editing ? {} : { slug: articleSlug.value.trim() || undefined })
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Artikel belum dapat diterbitkan.');
    articleForm.reset(); articleSlug.disabled = false; articleSlug.value = '';
    document.querySelector('#article-category').value = 'Kegiatan';
    articleStatus.value = 'draft'; updateArticleSubmitLabel(); renderCoverPreview();
    document.querySelector('#article-form-title').textContent = 'Terbitkan Kabar & Wawasan Edukasi (Pena Hamasah)';
    articleFormStatus.textContent = result.item.status === 'draft' ? `Draf “${result.item.title}” tersimpan.` : `Artikel “${result.item.title}” sudah diterbitkan.`;
    loadArticles().catch(() => {});
  } catch (error) {
    articleFormStatus.textContent = error.message || 'Artikel belum dapat diterbitkan.';
    articleFormStatus.classList.add('is-error');
  }
});

if (operationImportForm) operationImportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  operationImportStatus.classList.remove('is-error'); operationImportStatus.textContent = 'Memvalidasi batch...';
  try {
    let rows;
    try { rows = JSON.parse(document.querySelector('#operation-import-rows').value); } catch { throw new Error('JSON baris belum valid.'); }
    const response = await fetch('/api/operations/imports/preview', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: document.querySelector('#operation-import-entity').value, rows }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Preview import belum dapat dibuat.');
    renderImportBatch(result.batch); operationImportStatus.textContent = 'Preview selesai. Periksa hasil sebelum commit.'; loadOperationImportHistory().catch(() => {});
  } catch (error) { operationImportStatus.textContent = error.message; operationImportStatus.classList.add('is-error'); }
});

document.querySelector('#refresh-operation-imports')?.addEventListener('click', () => loadOperationImportHistory());
document.querySelector('#operation-import-status-filter')?.addEventListener('change', () => { operationImportPage = 1; loadOperationImportHistory(); });
document.querySelector('#operation-import-entity-filter')?.addEventListener('change', () => { operationImportPage = 1; loadOperationImportHistory(); });
document.querySelector('#operation-import-prev')?.addEventListener('click', () => { operationImportPage -= 1; loadOperationImportHistory(); });
document.querySelector('#operation-import-next')?.addEventListener('click', () => { operationImportPage += 1; loadOperationImportHistory(); });

if (refreshArticles) refreshArticles.addEventListener('click', () => loadArticles().catch(() => {}));

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
