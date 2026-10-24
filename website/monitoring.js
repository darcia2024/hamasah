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

document.querySelector('#share-followup-whatsapp').addEventListener('click', () => {
  const name = studentSelect.selectedOptions[0]?.textContent || 'ananda';
  const message = `Assalamu'alaikum Bapak/Ibu wali ${name},\n\nTerdapat pembaruan pembinaan ananda di portal Hamasah International. Silakan masuk ke ${location.origin}/portal untuk melihat presensi, hafalan, dan tindak lanjut terbaru.\n\nWassalamu'alaikum,\nMusyrif Hamasah International`;
  window.HamasahManualWhatsapp.show({ recipientName: 'Wali santri, pilih kontak yang terhubung', message, url: `https://wa.me/?text=${encodeURIComponent(message)}` });
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
  const title = document.createElement('h3'); title.className = 'monitoring-student__name'; title.textContent = data.student.name;
  const copy = document.createElement('p'); copy.className = 'monitoring-student__meta'; copy.textContent = `${data.student.program} · Bergabung ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(data.student.joinDate))}`;
  const head = document.createElement('header'); head.className = 'monitoring-student__head'; head.append(title,copy);
  const metrics = document.createElement('div'); metrics.className = 'portal-metrics';
  metrics.append(metric(data.attendance.rate === null ? 'Belum tersedia' : `${data.attendance.rate}%`, 'Kehadiran kegiatan'), metric(String(data.achievements.length), 'Prestasi'), metric(String(data.discipline.length), 'Catatan disiplin'));
  const activity = document.createElement('p'); activity.className = 'monitoring-student__activity'; activity.textContent = data.activities[0] ? `Kegiatan terakhir: ${data.activities[0].title}` : 'Belum ada catatan kegiatan terpisah. Presensi dan pembinaan dapat dilihat pada rekam jejak di bawah.';
  dashboard.replaceChildren(head, metrics, activity); dashboard.hidden = false;
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
    juzEditor.hidden = true;
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
  await muatPetaJuz(studentId);
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
  const hasil = await studentPicker.reload();
  // Datang dari tombol "Catat" di beranda musyrif (?studentId=), atau hanya ada satu
  // santri: langsung dipilih supaya musyrif tidak perlu membuka dropdown.
  if (!studentSelect.value) {
    const dituju = new URLSearchParams(window.location.search).get('studentId');
    const pilihan = [...studentSelect.options].map((option) => option.value).filter(Boolean);
    if (dituju && pilihan.includes(dituju)) studentSelect.value = dituju;
    else if (hasil && hasil.total === 1 && pilihan.length === 1) studentSelect.value = pilihan[0];
  }
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
 {btn:document.querySelector('#tab-btn-followups'),panel:document.querySelector('#panel-followups'),onOpen:()=>muatTindakLanjut()},
 {btn:document.querySelector('#tab-btn-returns'),panel:document.querySelector('#panel-returns'),onOpen:()=>muatKepulangan()},
  { btn: document.querySelector('#tab-btn-tracking'), panel: document.querySelector('#panel-tracking') },
  { btn: document.querySelector('#tab-btn-add-student'), panel: document.querySelector('#panel-add-student') },
  { btn: document.querySelector('#tab-btn-placement'), panel: document.querySelector('#panel-placement') },
  { btn: document.querySelector('#tab-btn-dorm-mgmt'), panel: document.querySelector('#panel-dorm-mgmt') },
  { btn: document.querySelector('#tab-btn-link-account'), panel: document.querySelector('#panel-link-account') },
  { btn: document.querySelector('#tab-btn-roll'), panel: document.querySelector('#panel-roll'), onOpen: () => muatPresensiAsrama() },
  { btn: document.querySelector('#tab-btn-leave'), panel: document.querySelector('#panel-leave'), onOpen: () => muatIzin() },
  { btn: document.querySelector('#tab-btn-family'), panel: document.querySelector('#panel-family'), onOpen: () => muatPesanWali() },
  { btn: document.querySelector('#tab-btn-announcements'), panel: document.querySelector('#panel-announcements'), onOpen: () => muatPengumuman() },
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

// Peta hafalan 30 juz santri terpilih. Musyrif dan admin mengklik kotak juz untuk
// mengganti statusnya; kartu dan logikanya ada di perjalanan-santri.js.
const juzEditor = document.querySelector('#juz-editor');

async function muatPetaJuz(studentId) {
  juzEditor.hidden = true;
  if (!window.HamasahPerjalanan) return;
  try {
    const data = await kirimJson(`/api/students/${encodeURIComponent(studentId)}/juz?t=${Date.now()}`, 'GET');
    const galat = document.createElement('p');
    galat.className = 'form-status is-error';
    galat.setAttribute('role', 'status');
    const kartu = window.HamasahPerjalanan.kartuJuz(data, {
      studentId, headers: headers(), editable: true,
      onError: (pesan) => { galat.textContent = pesan; }
    });
    if (!kartu) return;
    kartu.append(galat);
    juzEditor.replaceChildren(kartu);
    juzEditor.hidden = false;
  } catch {
    juzEditor.hidden = true;
  }
}

// Pengajuan izin santri (admin dan musyrif). GET /api/leave, PATCH /api/leave/:id.
const leaveList = document.querySelector('#leave-list');
const leaveStatus = document.querySelector('#leave-status');
const leaveFilter = document.querySelector('#leave-status-filter');
const leaveCount = document.querySelector('#leave-pending-count');
const WAKTU_IZIN = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS_IZIN = { menunggu: 'Menunggu keputusan', disetujui: 'Disetujui', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };

function statusPanel(node, teks, galat = false) {
  node.textContent = teks;
  node.classList.toggle('is-error', galat);
}

async function hitungIzinMenunggu() {
  try {
    const data = await kirimJson(`/api/leave?status=menunggu&t=${Date.now()}`, 'GET');
    leaveCount.textContent = String(data.items.length);
    leaveCount.hidden = !data.items.length;
  } catch {
    leaveCount.hidden = true;
  }
}

async function muatIzin() {
  statusPanel(leaveStatus, 'Memuat...');
  try {
    const data = await kirimJson(`/api/leave?status=${encodeURIComponent(leaveFilter.value)}&t=${Date.now()}`, 'GET');
    statusPanel(leaveStatus, data.tersedia ? '' : 'Database belum diperbarui untuk izin. Terapkan pembaruan database di halaman Pengaturan.', !data.tersedia);
    if (leaveFilter.value === 'menunggu') {
      leaveCount.textContent = String(data.items.length);
      leaveCount.hidden = !data.items.length;
    }
    leaveList.replaceChildren(...(data.items.length ? data.items.map((item) => {
      const rincian = [
        `${item.kindLabel} · ${WAKTU_IZIN.format(new Date(item.startsAt))} sampai ${WAKTU_IZIN.format(new Date(item.endsAt))}`,
        item.reason,
        item.status === 'menunggu' ? '' : `${STATUS_IZIN[item.status]}${item.decidedBy ? ` oleh ${item.decidedBy}` : ''}${item.decisionNote ? `: ${item.decisionNote}` : ''}`
      ].filter(Boolean).join(' · ');
      const aksi = document.createElement('div');
      aksi.className = 'honors-item__actions';
      if (item.status === 'menunggu') {
        aksi.append(
          tombolKecil('Setujui', () => putuskanIzin(item, 'disetujui')),
          tombolKecil('Tolak', () => putuskanIzin(item, 'ditolak'))
        );
      }
      return barisTeladan(`${item.studentName}${item.dormitoryName ? ` · ${item.dormitoryName}` : ''}`, rincian, aksi.childElementCount ? aksi : null);
    }) : [barisTeladan(leaveFilter.value === 'menunggu' ? 'Tidak ada izin yang menunggu keputusan.' : 'Belum ada izin dengan status ini.', '', null)]));
  } catch (error) {
    statusPanel(leaveStatus, error.message || 'Daftar izin belum dapat dimuat.', true);
  }
}

async function putuskanIzin(item, keputusan) {
  const setuju = keputusan === 'disetujui';
  const hasil = await window.HamasahDialog.formulir({
    judul: `${setuju ? 'Setujui' : 'Tolak'} izin ${item.studentName}`,
    keterangan: `${item.kindLabel}: ${item.reason}`,
    bidang: [{
      nama: 'note', label: setuju ? 'Catatan untuk santri (opsional)' : 'Alasan penolakan', jenis: 'textarea', wajib: !setuju,
      petunjuk: setuju ? 'Contoh: kembali sebelum maghrib.' : 'Santri dan walinya membaca alasan ini.'
    }],
    labelSimpan: setuju ? 'Setujui' : 'Tolak',
    kirim: (nilai) => kirimJson(`/api/leave/${encodeURIComponent(item.id)}`, 'PATCH', { decision: keputusan, note: nilai.note })
  });
  if (hasil) await muatIzin();
}

leaveFilter.addEventListener('change', () => muatIzin());

// Tab yang bisa dibuka langsung lewat alamat, misalnya dari pintasan di beranda Portal.
const TAB_ALAMAT = Object.freeze({ 'tindak-lanjut': '#tab-btn-followups', kepulangan: '#tab-btn-returns', presensi: '#tab-btn-roll', izin: '#tab-btn-leave', 'pesan-wali': '#tab-btn-family', pengumuman: '#tab-btn-announcements' });
// #presensi-subuh dan sejenisnya langsung memilih waktu sholat itu dan menampilkan daftarnya.
function bukaTabDariAlamat() {
  const alamat = window.location.hash.slice(1);
  const [kunci, sholat] = alamat.split('-');
  const tujuan = TAB_ALAMAT[alamat] || TAB_ALAMAT[kunci];
  const tombol = tujuan && document.querySelector(tujuan);
  if (!tombol || tombol.hidden) return;
  if (kunci === 'presensi' && sholat && [...rollPrayer.options].some((opsi) => opsi.value === sholat)) {
    rollPrayer.value = sholat;
  }
  switchTab(tombol);
}

// Presensi asrama (admin dan musyrif). GET /api/presensi-asrama, POST .../sholat|kegiatan.
const rollFilter = document.querySelector('#roll-filter');
const rollForm = document.querySelector('#roll-form');
const rollList = document.querySelector('#roll-list');
const rollStatus = document.querySelector('#roll-status');
const rollDate = document.querySelector('#roll-date');
const rollDormitory = document.querySelector('#roll-dormitory');
const rollPrayer = document.querySelector('#roll-prayer');
const rollCategory = document.querySelector('#roll-category');
const STATUS_SHOLAT = [['berjamaah', 'Berjamaah'], ['munfarid', 'Munfarid'], ['tidak', 'Tidak'], ['izin', 'Izin']];
const STATUS_KEGIATAN = [['present', 'Hadir'], ['late', 'Terlambat'], ['excused', 'Izin'], ['absent', 'Alpa']];
// Warna pilihan yang terpilih: hijau baik, kuning kurang, merah tidak hadir, abu izin.
const NADA_PRESENSI = Object.freeze({
  berjamaah: 'baik', present: 'baik', munfarid: 'kurang', late: 'kurang',
  tidak: 'absen', absent: 'absen', izin: 'izin', excused: 'izin'
});
let rollData = null;

function modePresensi() {
  return rollFilter.querySelector('input[name="roll-mode"]:checked').value;
}

function perbaruiFilterPresensi() {
  const sholat = modePresensi() === 'sholat';
  document.querySelector('#roll-prayer-field').hidden = !sholat;
  document.querySelector('#roll-category-field').hidden = sholat;
  rollForm.hidden = true;
  statusPanel(rollStatus, '');
}

async function muatPresensiAsrama() {
  if (!rollDate.value) rollDate.value = hariIniWib();
  rollDate.max = hariIniWib();
  const sholat = modePresensi() === 'sholat';
  if (!sholat && rollCategory.value.trim().length < 3) {
    // Tampilkan saran kegiatan dulu; daftar santri menunggu nama kegiatan.
    const params = new URLSearchParams({ mode: 'sholat', date: rollDate.value, prayer: 'subuh' });
    if (rollDormitory.value) params.set('dormitoryId', rollDormitory.value);
    const awal = await kirimJson(`/api/presensi-asrama?${params}&t=${Date.now()}`, 'GET').catch(() => null);
    if (awal) isiPilihanPresensi(awal);
    statusPanel(rollStatus, 'Tulis atau pilih nama kegiatan, lalu tampilkan daftar.');
    rollForm.hidden = true;
    return;
  }
  statusPanel(rollStatus, 'Memuat daftar...');
  const params = new URLSearchParams({ mode: modePresensi(), date: rollDate.value });
  if (sholat) params.set('prayer', rollPrayer.value);
  else params.set('category', rollCategory.value.trim());
  if (rollDormitory.value) params.set('dormitoryId', rollDormitory.value);
  try {
    rollData = await kirimJson(`/api/presensi-asrama?${params}&t=${Date.now()}`, 'GET');
    isiPilihanPresensi(rollData);
    gambarDaftarPresensi();
  } catch (error) {
    statusPanel(rollStatus, error.message, true);
    rollForm.hidden = true;
  }
}

function isiPilihanPresensi(data) {
  const terpilih = data.dormitoryId || rollDormitory.value;
  rollDormitory.replaceChildren(...data.dormitories.map((item) => new Option(item.name, item.id)));
  if (terpilih) rollDormitory.value = terpilih;
  document.querySelector('#roll-dormitory-field').hidden = data.dormitories.length <= 1;
  document.querySelector('#roll-category-list').replaceChildren(...(data.categories || []).map((nama) => new Option(nama)));
}

function gambarDaftarPresensi() {
  const sholat = rollData.mode === 'sholat';
  const pilihan = sholat ? STATUS_SHOLAT : STATUS_KEGIATAN;
  if (!rollData.students.length) {
    statusPanel(rollStatus, rollData.dormitoryId ? 'Belum ada santri aktif di asrama ini.' : 'Anda belum memegang asrama. Hubungi admin.');
    rollForm.hidden = true;
    return;
  }
  const belum = rollData.students.filter((item) => !item.status).length;
  const terkunciSemua = sholat ? 0 : rollData.students.length - belum;
  statusPanel(rollStatus, '');
  const tanggal = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${rollData.date}T00:00:00Z`));
  const judul = sholat ? `Sholat ${rollPrayer.selectedOptions[0]?.textContent || rollData.prayer}` : rollData.category;
  document.querySelector('#roll-title').textContent = `${judul} · ${tanggal}`;
  const hitung = (teks, kelas) => {
    const node = document.createElement('span');
    node.className = `roll-count${kelas ? ` ${kelas}` : ''}`;
    node.textContent = teks;
    return node;
  };
  document.querySelector('#roll-counts').replaceChildren(
    hitung(`${rollData.students.length} santri`),
    hitung(`${belum} belum dicatat`, belum ? 'is-pending' : ''),
    hitung(`${rollData.students.length - belum} sudah dicatat`, rollData.students.length - belum ? 'is-done' : '')
  );
  const akanDisimpan = rollData.students.length - terkunciSemua;
  document.querySelector('#roll-foot-note').textContent = akanDisimpan
    ? `${akanDisimpan} santri akan disimpan sesuai pilihan di atas.`
    : 'Semua santri sudah tercatat untuk kegiatan ini.';
  rollList.replaceChildren(...rollData.students.map((santri, indeks) => {
    const baris = document.createElement('li');
    baris.className = 'roll-row';
    const terkunci = !sholat && Boolean(santri.status);
    if (terkunci) baris.classList.add('is-locked');
    const kata = santri.name.trim().split(/\s+/);
    const avatar = document.createElement('span');
    avatar.className = 'roll-row__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = (kata[0][0] + (kata.length > 1 ? kata[kata.length - 1][0] : '')).toUpperCase();
    const identitas = document.createElement('span');
    identitas.className = 'roll-row__who';
    const nama = document.createElement('strong');
    nama.className = 'roll-row__name';
    nama.textContent = santri.name;
    const keterangan = document.createElement('span');
    keterangan.className = `roll-row__note ${santri.status ? 'is-done' : 'is-pending'}`;
    keterangan.textContent = santri.status ? (terkunci ? 'Sudah dicatat' : 'Sudah dicatat, bisa diubah') : 'Belum dicatat';
    identitas.append(nama, keterangan);
    const grup = document.createElement('fieldset');
    grup.className = 'roll-row__options';
    const legend = document.createElement('legend');
    legend.className = 'sr-only';
    legend.textContent = `Status ${santri.name}`;
    grup.append(legend);
    const nilai = santri.status || pilihan[0][0];
    pilihan.forEach(([kode, label]) => {
      const opsi = document.createElement('label');
      opsi.className = `roll-option is-${NADA_PRESENSI[kode]}`;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `roll-${indeks}`;
      radio.value = kode;
      radio.checked = kode === nilai;
      radio.disabled = terkunci;
      radio.dataset.studentId = santri.id;
      opsi.append(radio, document.createTextNode(label));
      grup.append(opsi);
    });
    baris.append(avatar, identitas, grup);
    return baris;
  }));
  rollForm.hidden = false;
}

rollFilter.addEventListener('submit', (event) => {
  event.preventDefault();
  muatPresensiAsrama();
});
rollFilter.querySelectorAll('input[name="roll-mode"]').forEach((radio) => radio.addEventListener('change', perbaruiFilterPresensi));
rollDormitory.addEventListener('change', () => { rollForm.hidden = true; });

rollForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!rollData) return;
  const sholat = rollData.mode === 'sholat';
  const entries = [...rollList.querySelectorAll('input[type="radio"]:checked:not(:disabled)')]
    .map((radio) => ({ studentId: radio.dataset.studentId, status: radio.value }));
  if (!entries.length) {
    statusPanel(rollStatus, 'Semua santri sudah tercatat untuk kegiatan ini.');
    return;
  }
  const tombol = document.querySelector('#roll-save');
  tombol.disabled = true;
  try {
    const body = { dormitoryId: rollData.dormitoryId, date: rollData.date, entries };
    if (sholat) body.prayer = rollData.prayer;
    else body.category = rollData.category;
    const hasil = await kirimJson(`/api/presensi-asrama/${sholat ? 'sholat' : 'kegiatan'}`, 'POST', body);
    await muatPresensiAsrama();
    await muatPenugasanMonitoring();
    const nama = new Map(rollData.students.map((item) => [item.id, item.name]));
    const gagal = hasil.gagal.map((item) => `${nama.get(item.studentId) || 'santri'} (${item.error})`).join(', ');
    statusPanel(rollStatus, `${hasil.tersimpan} presensi tersimpan.${gagal ? ` Belum tersimpan: ${gagal}` : ''}`, Boolean(gagal));
  } catch (error) {
    statusPanel(rollStatus, error.message, true);
  } finally {
    tombol.disabled = false;
  }
});

// Pesan dan doa dari wali (admin dan musyrif). GET /api/doa, POST /api/doa/:id/dibaca.
const familyList = document.querySelector('#family-list');
const familyStatus = document.querySelector('#family-status');
const familyFilter = document.querySelector('#family-status-filter');
const familyCount = document.querySelector('#family-unread-count');

function tampilkanJumlahPesan(jumlah) {
  familyCount.textContent = String(jumlah);
  familyCount.hidden = !jumlah;
}

async function hitungPesanWali() {
  try {
    const data = await kirimJson(`/api/doa?status=belum&t=${Date.now()}`, 'GET');
    tampilkanJumlahPesan(data.items.length);
  } catch {
    familyCount.hidden = true;
  }
}

async function muatPesanWali() {
  statusPanel(familyStatus, 'Memuat...');
  try {
    const data = await kirimJson(`/api/doa?status=${encodeURIComponent(familyFilter.value)}&t=${Date.now()}`, 'GET');
    statusPanel(familyStatus, data.tersedia ? '' : 'Database belum diperbarui untuk pesan wali. Terapkan pembaruan database di halaman Pengaturan.', !data.tersedia);
    if (familyFilter.value === 'belum') tampilkanJumlahPesan(data.items.length);
    familyList.replaceChildren(...(data.items.length ? data.items.map((item) => {
      const dari = `${item.parentName || 'Wali'} untuk ${item.studentName}${item.dormitoryName ? ` · ${item.dormitoryName}` : ''}`;
      const status = item.readAt ? `Dibaca${item.readBy ? ` ${item.readBy}` : ''} · ${WAKTU_IZIN.format(new Date(item.readAt))}` : 'Belum dibaca';
      const baris = barisTeladan(
        dari,
        `${WAKTU_IZIN.format(new Date(item.createdAt))} · ${status}`,
        item.readAt ? null : tombolKecil('Tandai sudah dibaca', (tombol) => tandaiPesanDibaca(item, tombol))
      );
      const isi = document.createElement('p');
      isi.className = 'honors-item__body';
      isi.textContent = item.body;
      baris.firstElementChild.append(isi);
      return baris;
    }) : [barisTeladan(familyFilter.value === 'belum' ? 'Tidak ada pesan wali yang belum dibaca.' : 'Belum ada pesan dari wali.', '', null)]));
  } catch (error) {
    statusPanel(familyStatus, error.message || 'Pesan wali belum dapat dimuat.', true);
  }
}

async function tandaiPesanDibaca(item, tombol) {
  tombol.disabled = true;
  try {
    await kirimJson(`/api/doa/${encodeURIComponent(item.id)}/dibaca`, 'POST');
    await muatPesanWali();
  } catch (error) {
    statusPanel(familyStatus, error.message, true);
    tombol.disabled = false;
  }
}

familyFilter.addEventListener('change', () => muatPesanWali());

// Pengumuman (admin dan musyrif). GET/POST /api/announcements, DELETE /api/announcements/:id.
const announcementForm = document.querySelector('#announcement-form');
const announcementStatus = document.querySelector('#announcement-status');
const announcementList = document.querySelector('#announcement-list');
const announcementDormitory = document.querySelector('#announcement-dormitory');
const PENERIMA = { semua: 'Santri dan wali', santri: 'Santri', wali: 'Wali' };

async function isiPilihanAsramaPengumuman() {
  // Admin boleh ke semua asrama; musyrif hanya asrama yang dipegang (disaring server).
  const data = await kirimJson('/api/announcements/asrama', 'GET').catch(() => ({ allowAll: false, dormitories: [] }));
  const pilihan = data.allowAll ? [new Option('Semua asrama', '')] : [];
  announcementDormitory.replaceChildren(...pilihan, ...data.dormitories.map((item) => new Option(item.name, item.id)));
}

async function muatPengumuman() {
  if (!announcementDormitory.options.length) await isiPilihanAsramaPengumuman();
  try {
    const data = await kirimJson(`/api/announcements?limit=50&t=${Date.now()}`, 'GET');
    if (!data.tersedia) statusPanel(announcementStatus, 'Database belum diperbarui untuk pengumuman. Terapkan pembaruan database di halaman Pengaturan.', true);
    announcementList.replaceChildren(...(data.items.length ? data.items.map((item) => barisTeladan(
      item.title,
      `${PENERIMA[item.audience]} · ${item.dormitoryName || 'Semua asrama'}${item.expiresOn ? ` · sampai ${item.expiresOn}` : ''} · ${item.body}`,
      (() => {
        const actions = document.createElement('div'); actions.className = 'mus-actions';
        actions.append(tombolKecil('Bagikan lewat WhatsApp', () => {
          const message = `Assalamu'alaikum,\n\n${item.title}\n${item.body}\n\nUntuk: ${PENERIMA[item.audience]}${item.dormitoryName ? ` · ${item.dormitoryName}` : ''}.\nInformasi terbaru tersedia di ${location.origin}/portal.\n\nWassalamu'alaikum,\nTim Hamasah International`;
          window.HamasahManualWhatsapp.show({ recipientName: PENERIMA[item.audience], requiresContactSelection: true, message, url: `https://wa.me/?text=${encodeURIComponent(message)}` });
        }));
        if (item.canDelete) actions.append(tombolKecil('Hapus', tombol => hapusPengumuman(item, tombol)));
        return actions;
      })()
    )) : [barisTeladan('Belum ada pengumuman yang berlaku.', '', null)]));
  } catch (error) {
    statusPanel(announcementStatus, error.message || 'Pengumuman belum dapat dimuat.', true);
  }
}

async function hapusPengumuman(item, tombol) {
  if (!window.confirm(`Hapus pengumuman "${item.title}"?`)) return;
  tombol.disabled = true;
  try {
    await kirimJson(`/api/announcements/${encodeURIComponent(item.id)}`, 'DELETE');
    await muatPengumuman();
  } catch (error) {
    statusPanel(announcementStatus, error.message, true);
    tombol.disabled = false;
  }
}

announcementForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusPanel(announcementStatus, '');
  try {
    await kirimJson('/api/announcements', 'POST', {
      title: document.querySelector('#announcement-title').value,
      body: document.querySelector('#announcement-body').value,
      audience: document.querySelector('#announcement-audience').value,
      dormitoryId: announcementDormitory.value || null,
      expiresOn: document.querySelector('#announcement-expires').value || null
    });
    announcementForm.reset();
    statusPanel(announcementStatus, 'Pengumuman diterbitkan.');
    await muatPengumuman();
  } catch (error) {
    statusPanel(announcementStatus, error.message, true);
  }
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


const FOLLOW_STATUS={perlu:'Perlu ditangani',dipantau:'Dipantau',selesai:'Selesai'};
function actionRow(title,description,status,actions,warning=false){const row=document.createElement('article');row.className='monitoring-action-row'+(warning?' is-overdue':'');const h=document.createElement('h4');h.textContent=title;const p=document.createElement('p');p.textContent=description;const badge=document.createElement('strong');badge.className='monitoring-action-row__status';badge.textContent=status;row.append(h,badge,p);if(actions){const group=document.createElement('div');group.className='monitoring-action-row__actions';group.append(...actions);row.append(group);}return row;}
async function editFollowUp(item=null){const sid=item?item.studentId:studentSelect.value;if(!sid)return;const fields=[{nama:'title',label:'Judul pembinaan',nilai:item?.title||'',wajib:true},{nama:'target',label:'Target yang ingin dicapai',jenis:'textarea',nilai:item?.target||'',wajib:true},{nama:'dueOn',label:'Tenggat',jenis:'date',nilai:item?.dueOn||today(),wajib:true},{nama:'status',label:'Status',jenis:'select',nilai:item?.status||'perlu',pilihan:Object.entries(FOLLOW_STATUS)},{nama:'progressNote',label:'Catatan perkembangan',jenis:'textarea',nilai:item?.progressNote||''}];const result=await window.HamasahDialog.formulir({judul:item?'Perbarui tindak lanjut':'Tindak lanjut pembinaan',keterangan:item?.studentName||studentSelect.selectedOptions[0]?.textContent||'',bidang:fields,labelSimpan:'Simpan tindak lanjut',kirim:values=>kirimJson('/api/follow-ups'+(item?'/'+item.id:''),item?'PATCH':'POST',{...values,studentId:sid})});if(result){switchTab(document.querySelector('#tab-btn-followups'));}}
let followUpPage = 1;
let followUpRequest = 0;
async function muatTindakLanjut() {
  const request = ++followUpRequest;
  const status = document.querySelector('#followup-status');
  const list = document.querySelector('#followup-list');
  statusPanel(status, 'Memuat…');
  try {
    const filter = document.querySelector('#followup-filter').value;
    const data = await kirimJson('/api/follow-ups?status=' + encodeURIComponent(filter) + '&page=' + followUpPage + '&limit=50', 'GET');
    if (request !== followUpRequest) return;
    if (!data.tersedia) throw Error('Terapkan pembaruan database di Pengaturan untuk menggunakan tindak lanjut.');
    followUpPage = data.page;
    const items = data.items;
    list.replaceChildren(...items.map(item => {
      const late = item.status !== 'selesai' && item.dueOn < today();
      return actionRow(item.studentName + ' · ' + item.title,
        item.target + (item.progressNote ? ' · Perkembangan: ' + item.progressNote : ''),
        FOLLOW_STATUS[item.status] + ' · Tenggat ' + new Intl.DateTimeFormat('id-ID', {dateStyle:'medium',timeZone:'UTC'}).format(new Date(item.dueOn + 'T00:00:00Z')) + (late ? ' · Melewati tenggat' : ''),
        [tombolKecil('Perbarui', () => editFollowUp(item))], late);
    }));
    if (data.pages > 1) {
      const nav = document.createElement('div');
      const previous = tombolKecil('Sebelumnya', () => { followUpPage = data.page - 1; muatTindakLanjut(); });
      const next = tombolKecil('Berikutnya', () => { followUpPage = data.page + 1; muatTindakLanjut(); });
      previous.disabled = data.page <= 1;
      next.disabled = data.page >= data.pages;
      nav.append(previous, document.createTextNode(' Halaman ' + data.page + ' / ' + data.pages + ' '), next);
      list.append(nav);
    }
    statusPanel(status, items.length ? items.length + ' dari ' + data.total + ' tindak lanjut ditampilkan.' : 'Belum ada tindak lanjut pada pilihan ini.');
  } catch (e) {
    if (request !== followUpRequest) return;
    list.replaceChildren();
    statusPanel(status, e.message, true);
  }
}
async function muatKepulangan(){const status=document.querySelector('#return-status'),list=document.querySelector('#return-list');statusPanel(status,'Memuat…');try{const data=await kirimJson('/api/leave?status='+ (document.querySelector('#return-filter').value==='semua'?'kepulangan':'belum-kembali'),'GET');if(!data.tersedia)throw Error('Data izin belum tersedia.');const all=document.querySelector('#return-filter').value==='semua',items=data.items.filter(x=>x.kind==='keluar-asrama'&&(all||!x.returnedAt));list.replaceChildren(...items.map(item=>{const late=item.returnState==='terlambat',scheduled=item.returnState==='terjadwal',actions=[];if(!item.returnedAt&&!scheduled)actions.push(tombolKecil('Sudah kembali',async()=>{const result=await window.HamasahDialog.formulir({judul:'Catat kepulangan '+item.studentName,keterangan:'Simpan setelah santri benar-benar kembali. Waktu kepulangan dicatat saat disimpan.',bidang:[{nama:'note',label:'Catatan kepulangan (opsional)',jenis:'textarea'}],labelSimpan:'Simpan kepulangan',kirim:values=>kirimJson('/api/leave/'+item.id+'/returned','POST',values)});if(result)await muatKepulangan();}));return actionRow(item.studentName,item.reason+' · Keluar: '+WAKTU_IZIN.format(new Date(item.startsAt))+' · Batas kembali: '+WAKTU_IZIN.format(new Date(item.endsAt))+(item.returnedAt?' · Kembali: '+WAKTU_IZIN.format(new Date(item.returnedAt)):'')+(item.returnNote?' · '+item.returnNote:''),item.returnedAt?'Sudah kembali':scheduled?'Terjadwal':late?'Melewati batas kembali':'Sedang di luar',actions,late);}));statusPanel(status,items.length?items.length+' izin keluar ditampilkan (maksimal 50, diurutkan dari batas kembali terdekat).':'Tidak ada izin keluar pada pilihan ini.');}catch(e){list.replaceChildren();statusPanel(status,e.message,true);}}
document.querySelector('#add-followup').addEventListener('click',()=>editFollowUp());
document.querySelector('#followup-filter').addEventListener('change',()=>{followUpPage=1;muatTindakLanjut();});
document.querySelector('#return-filter').addEventListener('change',muatKepulangan);

async function muatPenugasanMonitoring() {
  const title = document.querySelector('#monitoring-scope-title');
  const note = document.querySelector('#monitoring-scope-note');
  const dorms = document.querySelector('#monitoring-scope-dorms');
  const stats = document.querySelector('#monitoring-scope-stats');
  try {
    const [scope, daily] = await Promise.all([
      kirimJson('/api/musyrif/ringkasan', 'GET'),
      kirimJson('/api/presensi-asrama/hari-ini', 'GET').catch(() => null)
    ]);
    const assigned = scope.dormitories || [];
    title.textContent = assigned.length === 1 ? assigned[0].name : assigned.length ? `${assigned.length} asrama ${currentRole === 'admin' ? 'dalam pemantauan' : 'binaan Anda'}` : 'Belum ada penugasan asrama';
    note.textContent = !assigned.length ? 'Hubungi admin untuk penugasan asrama. Data akan muncul setelah penugasan tersedia.' : currentRole === 'admin' ? 'Anda memantau seluruh asrama. Pilih asrama pada formulir presensi untuk mencatat laporan.' : 'Penugasan aktif Anda. Presensi dan pembinaan hanya mencakup santri yang berada dalam binaan Anda.';
    dorms.replaceChildren(); stats.replaceChildren();
    assigned.forEach(d => {
      const box = document.createElement('div'); box.className = 'monitoring-dorm';
      const name = document.createElement('strong'); name.textContent = d.name;
      const meta = document.createElement('span'); meta.textContent = [d.area, d.gender === 'putra' ? 'Asrama putra' : d.gender === 'putri' ? 'Asrama putri' : null].filter(Boolean).join(' · ');
      box.append(name, meta); dorms.append(box);
    });
    const pending = daily ? daily.sholatBelum.reduce((sum, item) => sum + item.belum, 0) : null;
    const values = [
      [String((scope.students || []).length), 'Santri binaan', 'Dalam cakupan pemantauan', 'tracking'],
      [pending === null ? 'Belum tersedia' : String(pending), 'Presensi belum dicatat', daily ? `Catatan per santri × waktu sholat · ${daily.date}` : 'Data hari ini belum dapat dimuat', 'roll'],
      [daily ? String(daily.izinMenunggu) : 'Belum tersedia', 'Izin menunggu', 'Perlu keputusan musyrif', 'leave'],
      [daily ? String(daily.pesanBelumDibaca) : 'Belum tersedia', 'Pesan belum dibaca', 'Komunikasi dengan wali', 'family']
    ];
    values.forEach(([value,label,caption,tab]) => {
      // Komponen kartu angka yang sama dengan Pendaftaran dan Keuangan: label, angka, catatan.
      const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-kpi monitoring-kpi';
      const text = document.createElement('p'); text.className = 'admin-kpi__label'; text.textContent = label;
      const number = document.createElement('p'); number.className = 'admin-kpi__value'; number.textContent = value;
      const detail = document.createElement('p'); detail.className = 'admin-kpi__note'; detail.textContent = caption;
      button.append(text,number,detail); button.addEventListener('click', () => { switchTab(document.querySelector(`#tab-btn-${tab}`)); document.querySelector('#monitoring-subtabs').scrollIntoView({behavior:'smooth',block:'start'}); }); stats.append(button);
    });
  } catch {
    title.textContent = 'Penugasan belum dapat dimuat';
    note.textContent = 'Muat ulang halaman untuk mencoba kembali. Bagian monitoring tetap dapat dibuka melalui menu di bawah.';
    dorms.replaceChildren(); stats.replaceChildren();
  }
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
    hitungIzinMenunggu();
    hitungPesanWali();
    bukaTabDariAlamat();
    if (!location.hash && !new URLSearchParams(location.search).has('studentId')) switchTab(document.querySelector('#tab-btn-roll'));
    if (currentRole === 'admin') {
      document.querySelectorAll('.admin-only-tab').forEach((tab) => { tab.hidden = false; });
      accountLinkSection.hidden = false;
      dormitorySection.hidden = false;
    }
    const muatData = async () => {
      await Promise.all([loadAssignableAccounts(), loadDormitories()]);
      await loadStudents();
      await muatPenugasanMonitoring();
    };
    window.hamasahSaatDataSegar(muatData);
    await muatData();
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
    const judul = guard.querySelector('h1');
    if (judul) judul.textContent = 'Akses monitoring belum tersedia';
  }
}());
