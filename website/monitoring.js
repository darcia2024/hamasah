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
const editStudentButton = document.querySelector('#edit-student');
const editPhaseButton = document.querySelector('#edit-phase');
let roadmapTerpilih = null;
const dormitoryList = document.querySelector('#dormitory-list');
const dormitoryListStatus = document.querySelector('#dormitory-list-status');
// Data santri yang sedang dibuka, untuk mengisi formulir ubah data.
let santriTerpilih = null;
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
    editStudentButton.hidden = true;
    editPhaseButton.hidden = true;
    santriTerpilih = null;
    placementSection.hidden = true;
    if (monitoringEmptyState) monitoringEmptyState.hidden = false;
    return;
  }
  if (monitoringEmptyState) monitoringEmptyState.hidden = true;
  const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/dashboard`, { headers: headers() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Dashboard belum dapat dimuat.');
  renderDashboard(result.dashboard); recordSection.hidden = false; recordTrailSection.hidden = false; downloadReport.hidden = false;
  santriTerpilih = result.dashboard.student;
  // Mengubah data inti santri hanya untuk admin; musyrif tetap mencatat kegiatan saja.
  editStudentButton.hidden = currentRole !== 'admin';
  await muatRoadmapTerpilih(studentId);
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
  renderDormitoryList();
}

// ---------------------------------------------------------------------------
// Ubah data master: asrama (ubah, hapus) dan data inti santri. Hanya admin.

async function kirimJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (response.status === 204) return {};
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Perubahan belum dapat disimpan.');
  return result;
}

function renderDormitoryList() {
  if (!dormitoryList) return;
  if (!dormitories.length) {
    dormitoryList.replaceChildren(Object.assign(document.createElement('p'), { className: 'form-status', textContent: 'Belum ada asrama.' }));
    return;
  }
  dormitoryList.replaceChildren(...dormitories.map((asrama) => {
    const baris = document.createElement('div');
    baris.className = 'portal-account';
    const nama = document.createElement('strong');
    nama.textContent = asrama.name;
    const info = document.createElement('span');
    info.textContent = `${asrama.gender === 'putra' ? 'Putra' : 'Putri'} · ${asrama.area} · ${asrama.capacity ? `kapasitas ${asrama.capacity}` : 'kapasitas belum diisi'}`;
    const aksi = document.createElement('div');
    aksi.className = 'portal-account__actions';
    const ubah = document.createElement('button');
    ubah.type = 'button';
    ubah.className = 'button button--secondary';
    ubah.textContent = 'Ubah';
    ubah.addEventListener('click', () => ubahAsrama(asrama));
    const hapus = document.createElement('button');
    hapus.type = 'button';
    hapus.className = 'button button--secondary';
    hapus.textContent = 'Hapus';
    hapus.addEventListener('click', () => hapusAsrama(asrama, hapus));
    aksi.append(ubah, hapus);
    baris.append(nama, info, aksi);
    return baris;
  }));
}

async function ubahAsrama(asrama) {
  const hasil = await window.HamasahDialog.formulir({
    judul: `Ubah ${asrama.name}`,
    bidang: [
      { nama: 'name', label: 'Nama asrama', nilai: asrama.name, wajib: true },
      { nama: 'area', label: 'Kawasan', nilai: asrama.area, wajib: true },
      { nama: 'gender', label: 'Kategori penghuni', jenis: 'select', nilai: asrama.gender, pilihan: [['putra', 'Putra (Banin)'], ['putri', 'Putri (Banat)']], petunjuk: 'Kategori hanya bisa diubah bila asrama belum berpenghuni.' },
      { nama: 'capacity', label: 'Kapasitas (jumlah tempat)', jenis: 'number', min: 0, nilai: asrama.capacity || '', petunjuk: 'Tidak boleh di bawah jumlah penghuni sekarang. Kosongkan bila belum ditentukan.' }
    ],
    kirim: (nilai) => kirimJson(`/api/dormitories/${encodeURIComponent(asrama.id)}`, 'PATCH', { ...nilai, capacity: Number(nilai.capacity || 0) })
  });
  if (!hasil) return;
  dormitoryListStatus.classList.remove('is-error');
  dormitoryListStatus.textContent = `${hasil.dormitory.name} diperbarui.`;
  await loadDormitories();
}

async function hapusAsrama(asrama, tombol) {
  if (!window.confirm(`Hapus ${asrama.name}? Penugasan musyrif di asrama ini ikut dicabut.`)) return;
  tombol.disabled = true;
  dormitoryListStatus.classList.remove('is-error');
  try {
    await kirimJson(`/api/dormitories/${encodeURIComponent(asrama.id)}`, 'DELETE');
    dormitoryListStatus.textContent = `${asrama.name} dihapus.`;
    await loadDormitories();
  } catch (error) {
    dormitoryListStatus.textContent = error.message;
    dormitoryListStatus.classList.add('is-error');
    tombol.disabled = false;
  }
}

const LABEL_STATUS_SANTRI = Object.freeze([['active', 'Aktif'], ['inactive', 'Nonaktif (keluar atau berhenti)'], ['graduated', 'Lulus']]);

async function ubahSantri() {
  if (!santriTerpilih) return;
  const s = santriTerpilih;
  const hasil = await window.HamasahDialog.formulir({
    judul: `Ubah data ${s.name}`,
    keterangan: 'Santri yang ditandai nonaktif atau lulus otomatis dilepas dari asramanya. Catatan dan tagihannya tetap tersimpan.',
    bidang: [
      { nama: 'name', label: 'Nama lengkap', nilai: s.name, wajib: true },
      { nama: 'program', label: 'Program studi', nilai: s.program, wajib: true },
      { nama: 'city', label: 'Kota domisili', nilai: s.city, wajib: true },
      { nama: 'joinDate', label: 'Tanggal bergabung', jenis: 'date', nilai: s.joinDate, wajib: true },
      { nama: 'birthDate', label: 'Tanggal lahir', jenis: 'date', nilai: s.birthDate || '' },
      { nama: 'gender', label: 'Jenis', jenis: 'select', nilai: s.gender || '', pilihan: [['', 'Belum diisi'], ['putra', 'Putra'], ['putri', 'Putri']] },
      { nama: 'status', label: 'Status', jenis: 'select', nilai: s.status, pilihan: LABEL_STATUS_SANTRI }
    ],
    kirim: (nilai) => kirimJson(`/api/students/${encodeURIComponent(s.id)}`, 'PATCH', { ...nilai, birthDate: nilai.birthDate || null, gender: nilai.gender || null })
  });
  if (!hasil) return;
  await loadStudents();
  studentSelect.value = hasil.student.id;
  await loadDashboard().catch(() => {});
  if (hasil.releasedFromDormitory) {
    await window.HamasahDialog.pesan({
      judul: 'Data santri diperbarui',
      isi: [`${hasil.student.name} ditandai ${hasil.student.status === 'graduated' ? 'lulus' : 'nonaktif'} dan sudah dilepas dari asramanya.`]
    });
  }
}

editStudentButton.addEventListener('click', () => ubahSantri().catch(() => {}));

// Fase roadmap studi santri terpilih (admin). Tombolnya hanya ada bila program santri
// punya roadmap; lihat server/student-journey-service.js.
async function muatRoadmapTerpilih(studentId) {
  roadmapTerpilih = null;
  editPhaseButton.hidden = true;
  if (currentRole !== 'admin') return;
  try {
    const hasil = await kirimJson(`/api/students/${encodeURIComponent(studentId)}/roadmap`, 'GET');
    roadmapTerpilih = hasil.roadmap;
  } catch {
    roadmapTerpilih = null;
  }
  tampilkanTombolFase();
}

function tampilkanTombolFase() {
  editPhaseButton.hidden = !roadmapTerpilih;
  if (roadmapTerpilih) {
    editPhaseButton.querySelector('span').textContent = roadmapTerpilih.current ? `Fase studi: ${roadmapTerpilih.current}/${roadmapTerpilih.phases.length}` : 'Fase studi';
  }
}

async function ubahFaseStudi() {
  if (!santriTerpilih || !roadmapTerpilih) return;
  const s = santriTerpilih;
  const hasil = await window.HamasahDialog.formulir({
    judul: `Fase studi ${s.name}`,
    keterangan: `Roadmap ${roadmapTerpilih.program}. Santri dan walinya melihat fase ini di dashboard mereka.`,
    bidang: [{
      nama: 'phase', label: 'Fase saat ini', jenis: 'select', nilai: roadmapTerpilih.current || '',
      pilihan: [['', 'Belum diisi'], ...roadmapTerpilih.phases.map((fase) => [String(fase.number), `${fase.number}. ${fase.title}`])]
    }],
    labelSimpan: 'Simpan fase',
    kirim: (nilai) => kirimJson(`/api/students/${encodeURIComponent(s.id)}/roadmap`, 'PUT', { phase: nilai.phase ? Number(nilai.phase) : null })
  });
  if (!hasil) return;
  // Dari jawaban PUT langsung, bukan GET ulang: GET bisa dijawab dari data yang diingat
  // internal-shell.js sebelum versi barunya sampai.
  roadmapTerpilih = { ...roadmapTerpilih, current: hasil.phase };
  tampilkanTombolFase();
}

editPhaseButton.addEventListener('click', () => ubahFaseStudi().catch(() => {}));

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
        gender: document.querySelector('#dormitory-gender').value,
        capacity: Number(document.querySelector('#dormitory-capacity').value || 0)
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
  { btn: document.querySelector('#tab-btn-link-account'), panel: document.querySelector('#panel-link-account') },
  { btn: document.querySelector('#tab-btn-honors'), panel: document.querySelector('#panel-honors'), onOpen: () => muatTeladan() }
];

function switchTab(clickedBtn) {
  tabBtns.forEach(({ btn, panel }) => {
    if (btn && panel) {
      const active = btn === clickedBtn;
      btn.classList.toggle('is-active', active);
      panel.hidden = !active;
    }
  });
  const terpilih = tabBtns.find(({ btn }) => btn === clickedBtn);
  if (terpilih && terpilih.onOpen) terpilih.onOpen();
}

tabBtns.forEach(({ btn }) => {
  if (btn) btn.addEventListener('click', () => switchTab(btn));
});

// Santri teladan bulanan (admin). GET/POST /api/admin/honors, DELETE /api/admin/honors/:id.
const honorsMonth = document.querySelector('#honors-month');
const honorsStatus = document.querySelector('#honors-status');
const honorsSelected = document.querySelector('#honors-selected');
const honorsCandidates = document.querySelector('#honors-candidates');

function bulanIni() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}

function teksPersen(nilai, jumlah, satuan) {
  return nilai === null ? `belum ada ${satuan}` : `${nilai}% dari ${jumlah} ${satuan}`;
}

function barisTeladan(judul, rincian, tombol) {
  const item = document.createElement('li');
  item.className = 'honors-item';
  const teks = document.createElement('div');
  const nama = document.createElement('strong');
  nama.textContent = judul;
  teks.append(nama);
  if (rincian) {
    const isi = document.createElement('span');
    isi.textContent = rincian;
    teks.append(isi);
  }
  item.append(teks);
  if (tombol) item.append(tombol);
  return item;
}

function tombolKecil(teks, onClick) {
  const tombol = document.createElement('button');
  tombol.type = 'button';
  tombol.className = 'button button--secondary control--h40';
  tombol.textContent = teks;
  tombol.addEventListener('click', () => onClick(tombol));
  return tombol;
}

function statusTeladan(teks, galat = false) {
  honorsStatus.textContent = teks;
  honorsStatus.classList.toggle('is-error', galat);
}

async function muatTeladan() {
  if (currentRole !== 'admin') return;
  if (!honorsMonth.value) honorsMonth.value = bulanIni();
  statusTeladan('Memuat...');
  try {
    const data = await kirimJson(`/api/admin/honors?month=${encodeURIComponent(honorsMonth.value)}`, 'GET');
    statusTeladan(data.tersedia ? '' : 'Database belum diperbarui untuk santri teladan. Terapkan pembaruan database di halaman Pengaturan.', !data.tersedia);
    const sudah = new Set(data.items.map((item) => item.studentId));
    honorsSelected.replaceChildren(...(data.items.length
      ? data.items.map((item) => barisTeladan(`${item.name} · ${item.title}`, item.reason, tombolKecil('Hapus', (tombol) => hapusTeladan(item, tombol))))
      : [barisTeladan('Belum ada santri teladan bulan ini.', '', null)]));
    honorsCandidates.replaceChildren(...(data.candidates.length
      ? data.candidates.map((item) => barisTeladan(
        `${item.name} · ${item.program}`,
        `Sholat berjamaah ${teksPersen(item.berjamaahRate, item.prayers, 'waktu sholat')} · Hadir ${teksPersen(item.attendanceRate, item.activities, 'kegiatan')} · ${item.ziyadah} setoran hafalan baru`,
        sudah.has(item.studentId) || !data.tersedia ? null : tombolKecil('Pilih', () => pilihTeladan(item))
      ))
      : [barisTeladan('Belum ada catatan ibadah, kegiatan, atau hafalan di bulan ini.', '', null)]));
  } catch (error) {
    statusTeladan(error.message || 'Santri teladan belum dapat dimuat.', true);
  }
}

async function pilihTeladan(kandidat) {
  const hasil = await window.HamasahDialog.formulir({
    judul: `Pilih ${kandidat.name} sebagai santri teladan`,
    keterangan: 'Gelar dan alasan ini dibaca santri dan wali. Tulis dengan bahasa yang memotivasi.',
    bidang: [
      { nama: 'title', label: 'Gelar penghargaan', nilai: 'Santri teladan', wajib: true, petunjuk: 'Contoh: Santri teladan sholat berjamaah. 3 sampai 80 karakter.' },
      { nama: 'reason', label: 'Alasan', jenis: 'textarea', wajib: true, petunjuk: '10 sampai 300 karakter.' }
    ],
    labelSimpan: 'Pilih',
    kirim: (nilai) => kirimJson('/api/admin/honors', 'POST', { month: honorsMonth.value, studentId: kandidat.studentId, title: nilai.title, reason: nilai.reason })
  });
  if (hasil) await muatTeladan();
}

async function hapusTeladan(item, tombol) {
  if (!window.confirm(`Hapus ${item.name} dari santri teladan bulan ini?`)) return;
  tombol.disabled = true;
  try {
    await kirimJson(`/api/admin/honors/${encodeURIComponent(item.id)}`, 'DELETE');
    await muatTeladan();
  } catch (error) {
    statusTeladan(error.message || 'Belum dapat dihapus.', true);
    tombol.disabled = false;
  }
}

honorsMonth.addEventListener('change', () => muatTeladan());

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
    const me = await window.hamasahMintaAkun(headers());
    const result = me.body;
    if (!me.ok || !['admin', 'supervisor'].includes(result.account.role)) throw new Error('Halaman ini hanya dapat dibuka oleh admin atau pengawas.');
    currentRole = result.account.role; guard.hidden = true; consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, currentRole, 'monitoring', result.account);
    if (currentRole === 'admin') {
      document.querySelectorAll('.admin-only-tab').forEach((tab) => { tab.hidden = false; });
      accountLinkSection.hidden = false;
      dormitorySection.hidden = false;
    }
    const muatData = async () => {
      await Promise.all([loadAssignableAccounts(), loadDormitories()]);
      await loadStudents();
    };
    window.hamasahSaatDataSegar(muatData);
    await muatData();
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
    const judul = guard.querySelector('h1');
    if (judul) judul.textContent = 'Akses monitoring belum tersedia';
  }
}());
