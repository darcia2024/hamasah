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
const articleAuthor = document.querySelector('#article-author');
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
      const meta = document.createElement('small'); meta.textContent = [ARTICLE_STATUS_LABELS[article.status] || 'Status belum dikenali', article.category, article.authorName ? `Penulis: ${article.authorName}` : ''].filter(Boolean).join(' · ');
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
        articleAuthor.value = article.authorDisplayName || '';
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

// ---------------------------------------------------------------------------
// Daftar pendaftar: kartu ringkas, detail dan semua aksi di pop up.
//
// Dulu setiap kartu memuat seluruh isian (status, WhatsApp, catatan, tindak lanjut,
// kloter, dokumen), sehingga satu pendaftar memakan satu layar penuh dan daftar sulit
// dipindai. Kini kartu hanya berisi yang dibutuhkan untuk memilih, dan pop up memuat
// detail lengkap, termasuk catatan, tindak lanjut, dan riwayat status yang sebelumnya
// tidak pernah ditampilkan.
// ---------------------------------------------------------------------------
const LABEL_PROGRAM = Object.freeze({
  'kuliah-al-azhar': 'Kuliah S1 Al-Azhar',
  'mahad-al-azhar': "Ma'had Al-Azhar",
  'hamasah-courses': 'Hamasah Courses'
});
const LABEL_STATUS_PENDAFTAR = Object.freeze(Object.fromEntries(statusOptions));
const LABEL_VISIBILITAS = Object.freeze({ applicant: 'Terlihat pendaftar', internal: 'Internal petugas' });
const NADA_STATUS = Object.freeze({
  submitted: 'baru', 'document-review': 'proses', 'needs-revision': 'perbaikan',
  'academic-preparation': 'proses', 'ready-for-departure': 'siap', completed: 'selesai', cancelled: 'batal'
});

function elemen(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function formatTanggal(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
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
  items.forEach((registration) => registrationList.append(kartuPendaftar(registration)));
}

function kartuPendaftar(registration) {
  const kartu = elemen('button', 'staff-reg-card');
  kartu.type = 'button';
  kartu.setAttribute('aria-haspopup', 'dialog');

  const atas = elemen('span', 'staff-reg-card__top');
  atas.append(
    elemen('span', 'staff-reg-card__name', registration.applicant.applicantName),
    elemen('span', `staff-reg-card__status is-${NADA_STATUS[registration.status] || 'proses'}`, LABEL_STATUS_PENDAFTAR[registration.status] || registration.statusLabel)
  );

  const info = elemen('span', 'staff-reg-card__meta', [
    registration.registrationId,
    LABEL_PROGRAM[registration.program] || registration.program,
    registration.applicant.city
  ].filter(Boolean).join(' · '));

  const progres = elemen('span', 'staff-reg-card__progress');
  progres.setAttribute('aria-hidden', 'true');
  const isiProgres = elemen('span', 'staff-reg-card__progress-fill');
  isiProgres.style.width = `${Math.max(0, Math.min(100, registration.progress || 0))}%`;
  progres.append(isiProgres);

  const tanda = [];
  if (registration.departure) tanda.push(registration.departure.name);
  const langkahTerbuka = (registration.nextSteps || []).filter((step) => !step.doneAt).length;
  if (langkahTerbuka) tanda.push(`${langkahTerbuka} tindak lanjut`);
  const dokumen = registration.documents || [];
  const ditolak = dokumen.filter((d) => d.reviewStatus === 'rejected').length;
  const menunggu = dokumen.filter((d) => (d.reviewStatus || 'pending') === 'pending').length;
  if (menunggu) tanda.push(`${menunggu} dokumen menunggu review`);
  if (ditolak) tanda.push(`${ditolak} dokumen ditolak`);

  const bawah = elemen('span', 'staff-reg-card__foot');
  bawah.append(
    elemen('span', 'staff-reg-card__updated', `Diperbarui ${formatWaktu(registration.updatedAt || registration.createdAt)}${tanda.length ? ` · ${tanda.join(' · ')}` : ''}`),
    elemen('span', 'staff-reg-card__open', 'Buka detail')
  );

  kartu.append(atas, info, progres, bawah);
  kartu.addEventListener('click', () => bukaDetailPendaftar(registration));
  return kartu;
}

// ---------------------------------------------------------------------------
// Pop up detail pendaftar

let dialogPendaftar = null;
let isiDialogPendaftar = null;
let statusDialogPendaftar = null;
let nomorTerbuka = null;

function pastikanDialogPendaftar() {
  if (dialogPendaftar) return dialogPendaftar;
  dialogPendaftar = elemen('dialog', 'op-dialog staff-reg-dialog');
  dialogPendaftar.setAttribute('aria-labelledby', 'staff-reg-dialog-title');
  isiDialogPendaftar = elemen('div', 'staff-reg-dialog__body');
  dialogPendaftar.append(isiDialogPendaftar);
  dialogPendaftar.addEventListener('close', () => { nomorTerbuka = null; });
  // Klik di luar kotak (pada latar gelap) menutup pop up.
  dialogPendaftar.addEventListener('click', (event) => {
    if (event.target === dialogPendaftar) dialogPendaftar.close();
  });
  document.body.append(dialogPendaftar);
  return dialogPendaftar;
}

function bukaDetailPendaftar(registration) {
  const dialog = pastikanDialogPendaftar();
  nomorTerbuka = registration.registrationId;
  gambarDetailPendaftar(registration);
  if (!dialog.open) dialog.showModal();
}

function tulisStatusDetail(teks, galat = false) {
  if (!statusDialogPendaftar) return;
  statusDialogPendaftar.textContent = teks;
  statusDialogPendaftar.classList.toggle('is-error', galat);
}

async function kirimPerubahan(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { ...authHeaders(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Perubahan belum dapat disimpan.');
  return result;
}

// Satu aksi di pop up: tombol dinonaktifkan selama berjalan, hasilnya ditulis di pop up
// (bukan di daftar di belakangnya), lalu pop up dan daftar diperbarui.
async function aksiDetail(tombol, registration, kerja, pesanBerhasil) {
  tombol.disabled = true;
  tulisStatusDetail('Menyimpan...');
  try {
    const pesan = await kerja();
    await perbaruiDetailPendaftar(registration.registrationId, pesan || pesanBerhasil);
  } catch (error) {
    tulisStatusDetail(error.message || 'Perubahan belum dapat disimpan.', true);
  } finally {
    tombol.disabled = false;
  }
}

async function perbaruiDetailPendaftar(nomor, pesan) {
  loadRegistrations().catch(() => {});
  const response = await fetch(`/api/registrations?search=${encodeURIComponent(nomor)}&pageSize=5`, { headers: authHeaders() });
  const result = await response.json().catch(() => ({}));
  const baru = (result.items || []).find((item) => item.registrationId === nomor);
  if (baru && nomorTerbuka === nomor) gambarDetailPendaftar(baru);
  tulisStatusDetail(pesan || 'Tersimpan.');
}

function bagian(judul, ...isi) {
  const wadah = elemen('section', 'staff-reg-section');
  wadah.append(elemen('h3', 'staff-reg-section__title', judul), ...isi);
  return wadah;
}

function gambarDetailPendaftar(registration) {
  const kepala = elemen('div', 'staff-reg-dialog__head');
  const judul = elemen('div');
  const nama = elemen('h2', 'staff-reg-dialog__title', registration.applicant.applicantName);
  nama.id = 'staff-reg-dialog-title';
  judul.append(nama, elemen('p', 'staff-reg-dialog__sub', [
    registration.registrationId, LABEL_PROGRAM[registration.program] || registration.program, LABEL_STATUS_PENDAFTAR[registration.status] || registration.statusLabel
  ].join(' · ')));
  const tutup = elemen('button', 'button button--secondary staff-reg-dialog__close', 'Tutup');
  tutup.type = 'button';
  // Fokus awal di tombol Tutup, bukan di wadah isi yang bisa digulir.
  tutup.autofocus = true;
  tutup.addEventListener('click', () => dialogPendaftar.close());
  kepala.append(judul, tutup);

  statusDialogPendaftar = elemen('p', 'staff-reg-dialog__status');
  statusDialogPendaftar.setAttribute('role', 'status');

  const kiri = elemen('div', 'staff-reg-dialog__col');
  const kanan = elemen('div', 'staff-reg-dialog__col');
  kiri.append(bagianRingkasan(registration), bagianStatus(registration), createWhatsappControl(registration));
  if (registration.status !== 'cancelled') kiri.append(createDepartureControl(registration));
  const konversi = bagianKonversi(registration);
  if (konversi) kiri.append(konversi);
  kanan.append(bagianCatatan(registration), bagianTindakLanjut(registration));
  if ((registration.documents || []).length) kanan.append(bagianDokumen(registration));
  kanan.append(bagianRiwayat(registration));

  const kolom = elemen('div', 'staff-reg-dialog__grid');
  kolom.append(kiri, kanan);
  isiDialogPendaftar.replaceChildren(kepala, statusDialogPendaftar, kolom);
}

function bagianRingkasan(registration) {
  const daftar = elemen('dl', 'staff-reg-facts');
  const fakta = (judul, nilai) => daftar.append(elemen('dt', '', judul), elemen('dd', '', nilai || 'Belum diisi'));
  fakta('WhatsApp calon', registration.applicant.phone);
  fakta('Wali', [registration.applicant.guardianName, registration.applicant.guardianPhone].filter(Boolean).join(' · '));
  fakta('Pendidikan', registration.applicant.educationLevel);
  fakta('Domisili', registration.applicant.city);
  fakta('Progres', `${registration.progress}%`);
  fakta('Mendaftar', formatWaktu(registration.createdAt));
  return bagian('Data pendaftar', daftar);
}

function bagianStatus(registration) {
  const baris = elemen('div', 'staff-reg-row');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Status pendaftaran');
  statusOptions.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === registration.status;
    select.append(option);
  });
  const simpan = elemen('button', 'button button--primary', 'Simpan status');
  simpan.type = 'button';
  simpan.addEventListener('click', () => aksiDetail(simpan, registration, async () => {
    await kirimPerubahan(`/api/registrations/${encodeURIComponent(registration.registrationId)}/status`, 'PATCH', { status: select.value });
    return `Status diubah menjadi ${LABEL_STATUS_PENDAFTAR[select.value]}.`;
  }));
  baris.append(select, simpan);
  return bagian('Ubah status', baris);
}

function bagianCatatan(registration) {
  const isi = [];
  const catatan = [...(registration.notes || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (catatan.length) {
    const daftar = elemen('ul', 'staff-reg-list');
    catatan.forEach((note) => {
      const item = elemen('li');
      item.append(elemen('p', 'staff-reg-list__body', note.body), elemen('p', 'staff-reg-list__meta', `${LABEL_VISIBILITAS[note.visibility] || note.visibility} · ${formatWaktu(note.createdAt)}`));
      daftar.append(item);
    });
    isi.push(daftar);
  } else {
    isi.push(elemen('p', 'staff-reg-empty', 'Belum ada catatan.'));
  }
  const kotak = elemen('div', 'staff-note-box staff-note-box--catatan');
  const teks = document.createElement('textarea');
  teks.rows = 2;
  teks.placeholder = 'Tulis catatan untuk pendaftar atau internal';
  teks.setAttribute('aria-label', 'Catatan baru');
  const visibilitas = document.createElement('select');
  visibilitas.setAttribute('aria-label', 'Siapa yang melihat catatan');
  Object.entries(LABEL_VISIBILITAS).forEach(([value, text]) => visibilitas.add(new Option(text, value)));
  const tambah = elemen('button', 'button button--secondary', 'Tambah catatan');
  tambah.type = 'button';
  tambah.addEventListener('click', () => {
    if (!teks.value.trim()) return;
    aksiDetail(tambah, registration, async () => {
      await kirimPerubahan(`/api/registrations/${encodeURIComponent(registration.registrationId)}/notes`, 'POST', { visibility: visibilitas.value, body: teks.value });
    }, 'Catatan ditambahkan.');
  });
  kotak.append(teks, visibilitas, tambah);
  isi.push(kotak);
  return bagian('Catatan', ...isi);
}

function bagianTindakLanjut(registration) {
  const isi = [];
  const langkah = registration.nextSteps || [];
  if (langkah.length) {
    const daftar = elemen('ul', 'staff-reg-list');
    langkah.forEach((step) => {
      const item = elemen('li');
      item.append(
        elemen('p', 'staff-reg-list__body', step.title),
        elemen('p', 'staff-reg-list__meta', step.doneAt ? `Selesai ${formatWaktu(step.doneAt)}` : (step.dueOn ? `Tenggat ${formatTanggal(step.dueOn)}` : 'Tanpa tenggat'))
      );
      daftar.append(item);
    });
    isi.push(daftar);
  } else {
    isi.push(elemen('p', 'staff-reg-empty', 'Belum ada tindak lanjut.'));
  }
  const kotak = elemen('div', 'staff-note-box staff-note-box--langkah');
  const judul = document.createElement('input');
  judul.type = 'text';
  judul.placeholder = 'Tindak lanjut berikutnya';
  judul.setAttribute('aria-label', 'Tindak lanjut berikutnya');
  const tenggat = document.createElement('input');
  tenggat.type = 'date';
  tenggat.setAttribute('aria-label', 'Tenggat tindak lanjut');
  const tambah = elemen('button', 'button button--secondary', 'Tambah tindak lanjut');
  tambah.type = 'button';
  tambah.addEventListener('click', () => {
    if (!judul.value.trim()) return;
    aksiDetail(tambah, registration, async () => {
      await kirimPerubahan(`/api/registrations/${encodeURIComponent(registration.registrationId)}/next-steps`, 'POST', { title: judul.value, dueOn: tenggat.value || null });
    }, 'Tindak lanjut ditambahkan.');
  });
  kotak.append(judul, tenggat, tambah);
  isi.push(kotak);
  return bagian('Tindak lanjut', ...isi);
}

function bagianDokumen(registration) {
  const wadah = elemen('div', 'staff-registration__documents');
  registration.documents.forEach((documentItem) => {
    const row = elemen('div', 'staff-document-row');
    const label = elemen('span', '', `${documentItem.type} · ${documentItem.reviewStatus || 'pending'}`);
    const review = document.createElement('select');
    review.setAttribute('aria-label', `Hasil review ${documentItem.type}`);
    [['accepted', 'Terima'], ['rejected', 'Tolak']].forEach(([value, text]) => {
      const option = new Option(text, value);
      option.selected = value === documentItem.reviewStatus;
      review.append(option);
    });
    const note = document.createElement('input');
    note.type = 'text';
    note.placeholder = 'Catatan review';
    note.setAttribute('aria-label', `Catatan review ${documentItem.type}`);
    note.value = documentItem.reviewNote || '';
    // Tanpa ini petugas menyetujui atau menolak paspor, ijazah, dan surat
    // kesehatan tanpa pernah bisa membukanya dari konsol.
    const buka = elemen('button', 'button button--secondary', 'Buka berkas');
    buka.type = 'button';
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
        tulisStatusDetail('');
      } catch (error) {
        tulisStatusDetail(error.message, true);
      } finally {
        buka.disabled = false;
        buka.textContent = labelAsli;
      }
    });
    const simpan = elemen('button', 'button button--secondary', 'Simpan');
    simpan.type = 'button';
    simpan.addEventListener('click', () => aksiDetail(simpan, registration, async () => {
      await kirimPerubahan(`/api/registrations/${encodeURIComponent(registration.registrationId)}/documents/${encodeURIComponent(documentItem.id)}/review`, 'PATCH', { reviewStatus: review.value, note: note.value });
    }, 'Review dokumen disimpan.'));
    row.append(label, buka, review, note, simpan);
    wadah.append(row);
  });
  return bagian('Dokumen pendaftaran', wadah);
}

function bagianRiwayat(registration) {
  const riwayat = [...(registration.history || [])].reverse();
  if (!riwayat.length) return bagian('Riwayat status', elemen('p', 'staff-reg-empty', 'Belum ada perubahan status.'));
  const daftar = elemen('ul', 'staff-reg-list');
  riwayat.forEach((entry) => {
    const item = elemen('li');
    const pelaku = entry.byName || labelPeran(entry.byRole);
    item.append(
      elemen('p', 'staff-reg-list__body', LABEL_STATUS_PENDAFTAR[entry.to] || entry.to),
      elemen('p', 'staff-reg-list__meta', `${pelaku} · ${formatWaktu(entry.at)}${entry.note ? ` · ${entry.note}` : ''}`)
    );
    daftar.append(item);
  });
  return bagian('Riwayat status', daftar);
}

function bagianKonversi(registration) {
  if (!['ready-for-departure', 'completed'].includes(registration.status)) return null;
  const convert = elemen('button', 'button button--primary', 'Konversi jadi santri');
  convert.type = 'button';
  convert.addEventListener('click', () => {
    if (!window.confirm(`Konversi ${registration.applicant.applicantName} menjadi santri sekarang?`)) return;
    aksiDetail(convert, registration, async () => {
      const result = await kirimPerubahan(`/api/registrations/${encodeURIComponent(registration.registrationId)}/convert`, 'POST');
      const conversion = result.conversion;
      renderConversionResult(conversion);
      return conversion.alreadyConverted
        ? `Pendaftaran sudah terhubung ke santri (${conversion.studentId}).`
        : `Santri berhasil dibuat (${conversion.studentId}). ${conversion.invitationsQueued} undangan masuk antrean.`;
    });
  });
  return bagian('Jadikan santri', elemen('p', 'staff-reg-empty', 'Membuat data santri dan undangan akun wali dari pendaftaran ini.'), convert);
}

// Pemberitahuan ke pendaftar dikirim manual lewat WhatsApp petugas. Tombol ini
// membuka WhatsApp dengan pesan yang sudah disusun sesuai status TERSIMPAN dan
// berkas yang ditolak; petugas masih bisa menyuntingnya sebelum menekan kirim.
function createWhatsappControl(registration) {
  const box = document.createElement('div');
  box.className = 'staff-note-box staff-note-box--secondary staff-whatsapp';
  const judul = document.createElement('strong');
  judul.textContent = 'Kabari lewat WhatsApp';
  const keterangan = document.createElement('small');
  keterangan.textContent = 'Pesan mengikuti status yang sudah disimpan. Simpan status dulu bila baru diubah.';
  box.append(judul, keterangan);
  const statusUrl = `${window.location.origin}/website/cek-status.html`;
  const tujuan = [
    ['applicant', 'WA calon santri', registration.applicant.phone],
    ['guardian', 'WA wali', registration.applicant.guardianPhone]
  ];
  for (const [recipient, label, phone] of tujuan) {
    const pesan = window.HamasahWhatsappMessage.registrationMessage(registration, { recipient, statusUrl });
    const url = window.HamasahWhatsappMessage.whatsappUrl(phone, pesan);
    if (url) {
      const link = document.createElement('a');
      link.className = 'button button--secondary';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = label;
      box.append(link);
    } else {
      const kosong = document.createElement('span');
      kosong.className = 'staff-whatsapp__missing';
      kosong.textContent = `${label}: nomor belum diisi atau tidak valid`;
      box.append(kosong);
    }
  }
  return box;
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
  save.addEventListener('click', () => aksiDetail(save, registration, async () => {
    await kirimPerubahan(`/api/registrations/${encodeURIComponent(registration.registrationId)}/departure`, 'PUT', { departureGroupId: select.value || null });
    return select.value ? `Dimasukkan ke ${select.selectedOptions[0].textContent}.` : 'Kloter dilepas.';
  }));
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
  const muatData = () => loadRegistrations().catch((error) => {
    registrationListStatus.textContent = error.message || 'Data pendaftar belum dapat dimuat.';
    registrationListStatus.classList.add('is-error');
  });
  if (!dataSegarTerpasang) {
    dataSegarTerpasang = true;
    window.hamasahSaatDataSegar(muatData);
  }
  muatData();
  // Datang dari ikon surat di topbar Portal (portal.html).
  if (window.location.hash === '#pesan-konsultasi') {
    const tabPesan = STAFF_TABS.find((tab) => tab.button === tabBtnInquiries);
    if (tabPesan) openStaffTab(tabPesan);
  }
}

let dataSegarTerpasang = false;

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
  // Tanpa isian, penulis yang tampil adalah akun pembuat artikel; itu diketahui server, jadi tidak ditebak di sini.
  const penulis = articleAuthor?.value.trim() || '';
  const meta = document.createElement('small'); meta.textContent = [document.querySelector('#article-category')?.value.trim() || 'Kegiatan', articleStatus?.value === 'published' ? 'Terbit' : 'Draf', penulis ? `Penulis: ${penulis}` : ''].filter(Boolean).join(' · ');
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
        authorDisplayName: articleAuthor.value.trim(),
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
    const me = await window.hamasahMintaAkun(authHeaders());
    const result = me.body;
    if (!me.ok || !STAFF_ROLES.includes(result.account.role)) {
      throw new Error('Halaman ini hanya dapat dibuka oleh admin atau petugas pendaftaran.');
    }
    showConsole(result.account);
  } catch (error) {
    clearSession();
  }
}());
