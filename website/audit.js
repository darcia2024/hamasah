const guard = document.querySelector('#audit-guard');
const guardCopy = document.querySelector('#audit-guard-copy');
const consoleSection = document.querySelector('#audit-console');
const filterForm = document.querySelector('#audit-filter');
const filterFrom = document.querySelector('#filter-from');
const filterTo = document.querySelector('#filter-to');
const filterAction = document.querySelector('#filter-action');
const filterActor = document.querySelector('#filter-actor');
const status = document.querySelector('#audit-status');
const list = document.querySelector('#audit-list');
const summary = document.querySelector('#audit-summary');
const prevButton = document.querySelector('#audit-prev');
const nextButton = document.querySelector('#audit-next');
const staffNav = document.querySelector('#staff-nav');

const PAGE_SIZE = 25;
let offset = 0;
let total = 0;

// Nama kejadian yang ramah dibaca. Kalau ada aksi baru yang belum ada di sini,
// nama teknisnya tetap ditampilkan apa adanya, bukan disembunyikan.
const LABEL = {
  'auth.login.success': 'Login berhasil',
  'auth.login.failed': 'Login gagal',
  'auth.login.rate-limited': 'Login diblokir sementara',
  'auth.logout': 'Logout',
  'auth.logout-all': 'Logout semua perangkat',
  'auth.password-reset.requested': 'Minta reset kata sandi',
  'auth.password-reset.completed': 'Kata sandi diganti',
  'account.created': 'Akun dibuat',
  'account.bootstrapped': 'Admin pertama dibuat',
  'account.active-changed': 'Status aktif akun diubah',
  'registration.created': 'Pendaftaran masuk',
  'registration.status-changed': 'Status pendaftaran berubah',
  'registration.departure-assigned': 'Kloter pendaftar diubah',
  'student.worship-recorded': 'Catatan ibadah santri disimpan',
  'student.health-recorded': 'Catatan kesehatan santri dibuat',
  'departure-group.saved': 'Kloter keberangkatan disimpan',
  'registration.document-added': 'Dokumen pendaftaran ditambahkan',
  'student.created': 'Santri ditambahkan',
  'student.accounts-linked': 'Relasi akun santri diubah',
  'student.placement-changed': 'Penempatan asrama diubah',
  'student.report-exported': 'Ringkasan santri diunduh',
  'dormitory.created': 'Asrama dibuat',
  'dormitory.staff-assigned': 'Musyrif ditugaskan',
  'dormitory.staff-unassigned': 'Penugasan musyrif dicabut',
  'file.uploaded': 'Berkas diunggah',
  'file.downloaded': 'Berkas diunduh',
  'invoice.created': 'Invoice dibuat',
  'invoice.paid': 'Invoice ditandai lunas',
  'invoice.receipt-downloaded': 'Kuitansi diunduh'
};

function session() {
  try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; }
}

function headers() {
  const current = session();
  return current ? { Authorization: `Bearer ${current.accessToken}` } : {};
}

function waktu(iso) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
}

function ringkasMetadata(metadata) {
  const isi = Object.entries(metadata || {});
  if (!isi.length) return '';
  return isi.map(([kunci, nilai]) => `${kunci}: ${Array.isArray(nilai) ? nilai.join(', ') : nilai}`).join(' · ');
}

function renderEvents(items) {
  if (!items.length) {
    const kosong = document.createElement('p');
    kosong.className = 'form-status';
    kosong.textContent = 'Tidak ada kejadian yang cocok dengan filter ini.';
    list.replaceChildren(kosong);
    return;
  }
  list.replaceChildren(...items.map((event) => {
    const baris = document.createElement('div');
    baris.className = 'portal-account';

    const judul = document.createElement('strong');
    judul.textContent = LABEL[event.action] || event.action;

    const pelaku = document.createElement('span');
    const nama = event.actorName || (event.actorRole ? `(akun dihapus, peran ${event.actorRole})` : 'Tanpa sesi');
    pelaku.textContent = `${waktu(event.occurredAt)} · ${nama}`;

    const rincian = document.createElement('span');
    const sasaran = event.entityType ? `${event.entityType} ${event.entityId || ''}`.trim() : '';
    rincian.textContent = [sasaran, ringkasMetadata(event.metadata)].filter(Boolean).join(' · ');

    baris.append(judul, pelaku, rincian);
    return baris;
  }));
}

function filterQuery() {
  const query = new URLSearchParams();
  // Tanggal diambil apa adanya dari input, lalu dijadikan rentang satu hari penuh.
  if (filterFrom.value) query.set('from', `${filterFrom.value}T00:00:00.000Z`);
  if (filterTo.value) query.set('to', `${filterTo.value}T23:59:59.999Z`);
  if (filterAction.value) query.set('action', filterAction.value);
  if (filterActor.value) query.set('actorAccountId', filterActor.value);
  query.set('limit', String(PAGE_SIZE));
  query.set('offset', String(offset));
  return query;
}

async function loadEvents() {
  status.classList.remove('is-error');
  const response = await fetch(`/api/audit?${filterQuery().toString()}`, { headers: headers() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Catatan audit belum dapat dimuat.');

  total = result.total;
  renderEvents(result.items);

  const awal = total === 0 ? 0 : offset + 1;
  const akhir = Math.min(offset + result.items.length, total);
  summary.textContent = total === 0 ? 'Belum ada kejadian tercatat.' : `Menampilkan ${awal}–${akhir} dari ${total} kejadian.`;
  prevButton.disabled = offset === 0;
  nextButton.disabled = offset + PAGE_SIZE >= total;

  if (filterAction.options.length === 1) {
    result.actions.forEach((action) => filterAction.add(new Option(LABEL[action] || action, action)));
  }
}

async function loadActors() {
  const response = await fetch('/api/accounts', { headers: headers() });
  const result = await response.json();
  if (!response.ok) return;
  result.items.forEach((account) => filterActor.add(new Option(`${account.name} · ${account.role}`, account.id)));
}

function jalankan(pekerjaan) {
  pekerjaan().catch((error) => {
    status.textContent = error.message || 'Catatan audit belum dapat dimuat.';
    status.classList.add('is-error');
  });
}

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  offset = 0;
  jalankan(loadEvents);
});

document.querySelector('#reset-filter').addEventListener('click', () => {
  filterForm.reset();
  offset = 0;
  jalankan(loadEvents);
});

document.querySelector('#reload-audit').addEventListener('click', () => jalankan(loadEvents));
prevButton.addEventListener('click', () => { offset = Math.max(0, offset - PAGE_SIZE); jalankan(loadEvents); });
nextButton.addEventListener('click', () => { if (offset + PAGE_SIZE < total) { offset += PAGE_SIZE; jalankan(loadEvents); } });

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
    if (!response.ok || result.account.role !== 'admin') {
      throw new Error('Halaman ini hanya dapat dibuka oleh admin.');
    }
    guard.hidden = true;
    consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, result.account.role, 'audit', result.account);
    await loadActors();
    await loadEvents();
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
  }
}());
