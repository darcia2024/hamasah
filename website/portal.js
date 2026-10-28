const portalLogin = document.querySelector('#portal-login');
const portalLoginForm = document.querySelector('#portal-login-form');
const portalLoginStatus = document.querySelector('#portal-login-status');
const activationNotice = document.querySelector('#activation-notice');
const portalConsole = document.querySelector('#portal-console');
const portalLogout = document.querySelector('#portal-logout');
const studentsStatus = document.querySelector('#portal-students-status');
const studentList = document.querySelector('#portal-student-list');
const studentDashboard = document.querySelector('#student-dashboard');
const publicHeader = document.querySelector('#public-header');
const staffNav = document.querySelector('#staff-nav');

let currentAccount = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

// Nama peran dari nav.js (dimuat sebelum berkas ini), supaya sama di semua halaman.
const roleLabels = ROLE_DISPLAY_NAMES;

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

if (activationNotice && new URLSearchParams(window.location.search).get('activated') === '1') {
  activationNotice.hidden = false;
  activationNotice.textContent = 'Akun berhasil diaktifkan. Masuk menggunakan email dan kata sandi baru Anda.';
  activationNotice.dataset.kind = 'success';
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

function formatWaktu(iso) {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatTanggal(iso) {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function renderBadgeIcon(icon) {
  if (!icon) return '';
  if (typeof icon === 'string' && icon.trim().startsWith('<svg')) return icon;
  switch (icon) {
    case 'mosque':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M4 10h16M6 10v10M18 10v10M10 10v10M14 10v10M12 6a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4z"/></svg>`;
    case 'book':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>`;
    case 'cap':
    case 'graduation':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    case 'palm':
    case 'tree':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7"/><path d="M12 15c-3-2-5-6-5-10 4 0 7 2 8 6"/><path d="M12 15c3-2 5-6 5-10-4 0-7 2-8 6"/></svg>`;
    case 'note':
    case 'eval':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;
    case 'warning':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    case 'camel':
    case 'desert':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16M7 18v-4c0-2 1-3 3-3s3 1 3 3v4M13 11c0-2 1-3 3-3s3 1 3 3v7M4 14l2-4 3-1"/></svg>`;
    case 'building':
    case 'landmark':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"/><line x1="4" y1="10" x2="20" y2="10"/><path d="m12 3 10 7H2l10-7z"/><line x1="6" y1="10" x2="6" y2="21"/><line x1="10" y1="10" x2="10" y2="21"/><line x1="14" y1="10" x2="14" y2="21"/><line x1="18" y1="10" x2="18" y2="21"/></svg>`;
    default:
      return icon;
  }
}

// ---------------------------------------------------------------------------
// Tampilan santri dan konsol (Task R4.5)
//
// Bagian ini dulu dibangun dari templat "itinerary perjalanan" dan berisi data yang
// ditulis keras di kode: nomor induk, nama musyrif pendamping, dan
// "Status Pembiayaan: Lunas (SPP & Dorm)" untuk SEMUA santri, "100% Hadir" saat belum
// ada satu pun presensi, kartu "Hadir Istiqomah" untuk lima waktu sholat yang tidak
// pernah dicatat, serta hitungan tab (12, 30, 8) yang tidak berasal dari mana pun.
// Wali yang membuka portal melihat klaim keuangan dan kehadiran yang tidak pernah
// terjadi. Kini setiap nilai di layar berasal dari API, atau bagian itu menjadi
// keadaan kosong yang menyatakan apa adanya.
// ---------------------------------------------------------------------------

const ATTENDANCE_LABELS = Object.freeze({ present: 'Hadir', late: 'Terlambat', excused: 'Izin / sakit', absent: 'Tidak hadir' });
const ATTENDANCE_TYPES = Object.freeze({ present: 'complete', late: 'pending', excused: 'pending', absent: 'absent' });
const PRAYER_PATTERN = /sholat|salat|shalat|subuh|shubuh|dzuhur|zuhur|dhuhur|ashar|asar|maghrib|magrib|isya|isha|berjamaah|jamaah/i;
const STUDENT_STATUS_LABELS = Object.freeze({ active: 'Aktif', inactive: 'Tidak aktif', graduated: 'Lulus' });

function formatTanggalPanjang(isoDate) {
  if (!isoDate) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(isoDate));
  } catch {
    return String(isoDate);
  }
}

function dormitoryLabel(student) {
  if (student.dormitory) return [student.dormitory.name, student.dormitory.area].filter(Boolean).join(' · ');
  if (student.dormitoryName) return student.dormitoryName;
  return student.dormitoryId ? 'Asrama terdaftar' : 'Belum ditempatkan';
}

// Kartu satu catatan. Hanya field yang ADA di data yang ditampilkan: tidak ada lokasi,
// unit asrama, jumlah anggota, atau "tipe pembinaan" yang dikarang untuk mengisi kolom.
function createRecordCard({ badgeColor = 'yellow', badgeIcon = 'mosque', title, subtitle = '', statusText = '', statusType = 'pending', details = [], note = '' }) {
  const card = document.createElement('div');
  card.className = 'crm-activity-card';

  const shown = details.filter((item) => item && item.value);
  card.innerHTML = `
    <div class="crm-activity-card__header-row">
      <div class="crm-activity-card__title-col">
        <div class="crm-square-badge crm-square-badge--${escapeHtml(badgeColor)}">
          ${renderBadgeIcon(badgeIcon)}
        </div>
        <div class="js-flex-1-min">
          <h3 class="crm-activity-card__name">${escapeHtml(title)}</h3>
          ${subtitle ? `<div class="crm-activity-card__subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
      </div>
      ${statusText ? `<div class="crm-activity-card__header-actions"><span class="crm-status-pill crm-status-pill--${escapeHtml(statusType)}">${escapeHtml(statusText)}</span></div>` : ''}
    </div>
    ${shown.length ? `<div class="crm-activity-card__upper">${shown.map((item) => `<div class="crm-col-block"><label>${escapeHtml(item.label)}</label><span>${escapeHtml(item.value)}</span></div>`).join('')}</div>` : ''}
    ${note ? `<div class="crm-activity-card__note"><svg class="js-no-shrink" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${escapeHtml(note)}</span></div>` : ''}
  `;
  return card;
}

function createEmptyState(message) {
  const box = document.createElement('div');
  box.className = 'crm-white-card';
  const copy = document.createElement('p');
  copy.className = 'js-text-muted';
  copy.textContent = message;
  box.append(copy);
  return box;
}

function attendanceCard(entry) {
  return createRecordCard({
    badgeIcon: entry.status === 'present' ? 'mosque' : 'warning',
    title: entry.category || 'Kehadiran',
    subtitle: formatWaktu(entry.occurredAt),
    statusText: ATTENDANCE_LABELS[entry.status] || entry.status,
    statusType: ATTENDANCE_TYPES[entry.status] || 'pending',
    // recordedByName hanya ada untuk staf; server mencabutnya dari tampilan keluarga.
    details: [{ label: 'Dicatat oleh', value: entry.recordedByName }],
    note: entry.note
  });
}

// Unduhan yang membawa sesi. <a href download> biasa tidak mengirim header
// Authorization, sehingga endpoint yang dilindungi menjawab 401 dan yang terunduh
// adalah berkas galat, bukan datanya.
async function downloadWithSession(url, fileName, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Menyiapkan...';
  try {
    const response = await fetch(url, { headers: requestHeaders() });
    if (!response.ok) {
      let message = 'Berkas belum dapat diunduh.';
      try { message = (await response.json()).error || message; } catch { /* respons bukan JSON */ }
      throw new Error(message);
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

// Ringkasan satu ananda untuk wali: tagihan belum lunas, izin yang menunggu keputusan,
// dan kehadiran kegiatan 7 hari terakhir. Bagian yang gagal dimuat dilewati saja.
async function isiRingkasanAnanda(studentId, wadah) {
  const id = encodeURIComponent(studentId);
  const tanggal = (mundur) => {
    const d = new Date();
    d.setDate(d.getDate() - mundur);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const ambilJson = (url) => fetch(url, { headers: requestHeaders() }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  const [tagihan, izin, dasbor] = await Promise.all([
    ambilJson(`/api/students/${id}/invoices`),
    ambilJson(`/api/students/${id}/leave`),
    ambilJson(`/api/students/${id}/dashboard?from=${tanggal(6)}&to=${tanggal(0)}`)
  ]);
  const butir = [];
  if (tagihan && Array.isArray(tagihan.items)) {
    const belum = tagihan.items.filter((item) => item.status === 'unpaid');
    const total = belum.reduce((jumlah, item) => jumlah + (Number(item.amount) || 0), 0);
    butir.push(belum.length
      ? [`${belum.length} tagihan belum lunas, Rp${total.toLocaleString('id-ID')}`, 'perlu']
      : ['Tidak ada tagihan tertunda', 'baik']);
  }
  if (izin && Array.isArray(izin.items)) {
    const menunggu = izin.items.filter((item) => item.status === 'menunggu').length;
    if (menunggu) butir.push([`${menunggu} izin menunggu keputusan musyrif`, 'tunggu']);
  }
  if (dasbor && dasbor.dashboard && dasbor.dashboard.attendance) {
    const hadir = dasbor.dashboard.attendance;
    butir.push([hadir.rate === null ? 'Belum ada catatan kegiatan 7 hari terakhir' : `Kehadiran 7 hari ${hadir.rate}%`, 'netral']);
  }
  wadah.replaceChildren(...butir.map(([teks, jenis]) => {
    const chip = document.createElement('span');
    chip.className = `crm-summary-chip is-${jenis}`;
    chip.textContent = teks;
    return chip;
  }));
}

function createStudentCompactCard(student, idx, account, onOpen) {
  const card = document.createElement('div');
  card.className = 'crm-student-compact-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Buka detail rekam jejak ${student.name}`);

  const colors = ['yellow', 'orange', 'green', 'purple'];
  const badgeColor = colors[idx % colors.length];
  // Wali: seluruh kartu adalah satu tombol. "Buka detail" dan "buka di tab baru" dulu
  // dua aksi untuk tujuan yang sama.
  const wali = Boolean(account) && account.role === 'parent';
  // Tanpa NIM: nomor induk tidak ada di data, dan sebelumnya dikarang dari indeks
  // baris (dibuat dari nomor urut), sehingga berganti setiap urutan daftar berubah.
  const statusLabel = STUDENT_STATUS_LABELS[student.status] || student.status || '';
  const metaParts = [];
  // "Kota", bukan "Asal": santri yang dibuat manual menyimpan kota domisili (Kairo),
  // sedangkan hasil konversi pendaftar menyimpan kota asal pendaftar.
  if (student.city) metaParts.push(`Kota ${escapeHtml(student.city)}`);
  if (student.program) metaParts.push(`<span class="crm-student-compact-pill">${escapeHtml(student.program)}</span>`);
  metaParts.push(`<span class="crm-student-compact-dorm"><svg class="js-icon-inline--tight" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> ${escapeHtml(dormitoryLabel(student))}</span>`);

  card.innerHTML = `
    <div class="crm-student-compact-main">
      <div class="crm-square-badge crm-square-badge--${badgeColor}">
        ${renderBadgeIcon('cap')}
      </div>
      <div class="crm-student-compact-info">
        <div class="crm-student-compact-title-row">
          <h3 class="crm-student-compact-name">${escapeHtml(student.name)}</h3>
          ${statusLabel ? `<span class="crm-status-pill crm-status-pill--complete">${escapeHtml(statusLabel)}</span>` : ''}
        </div>
        <div class="crm-student-compact-meta">${metaParts.join('<span class="crm-meta-dot">·</span>')}</div>
      </div>
    </div>
    <div class="crm-student-compact-action">
      ${wali ? '' : '<span class="crm-student-compact-cta-label">Buka detail</span>'}
      <div class="crm-student-compact-arrow" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
      ${wali ? '' : `<a href="portal?studentId=${encodeURIComponent(student.id)}" target="_blank" rel="noopener" class="crm-student-compact-newtab" title="Buka di tab baru" aria-label="Buka di tab baru">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>`}
    </div>
  `;
  if (wali) card.classList.add('crm-student-compact-card--wali');

  // Wali: ringkasan singkat per ananda supaya yang perlu ditindaklanjuti terlihat tanpa
  // membuka satu per satu. Dimuat setelah kartu tampil.
  if (wali) {
    const ringkas = document.createElement('div');
    ringkas.className = 'crm-student-compact-summary';
    ringkas.id = `ringkasan-ananda-${student.id}`;
    ringkas.textContent = 'Memuat ringkasan...';
    card.querySelector('.crm-student-compact-info').append(ringkas);
    card.setAttribute('aria-describedby', ringkas.id);
    isiRingkasanAnanda(student.id, ringkas).catch(() => { ringkas.textContent = ''; });
  }

  card.addEventListener('click', (e) => {
    if (e.target.closest('.crm-student-compact-newtab')) return;
    e.preventDefault();
    if (onOpen) onOpen();
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('.crm-student-compact-newtab')) return;
      e.preventDefault();
      if (onOpen) onOpen();
    }
  });

  return card;
}

// awal: indeks tab yang terbuka saat tampil. onChange(def): dipanggil tiap kali tab berganti.
function buildTabs(definitions, panels, container, { awal = 0, onChange } = {}) {
  const buttons = definitions.map((def, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `crm-pill-btn ${index === awal ? 'is-active' : ''}`;
    // Hitungan hanya ditampilkan bila diketahui dari data. Tidak ada angka bawaan.
    const count = def.count === undefined ? '' : ` <span class="crm-pill-count" id="tab-count-${def.id}">${def.count}</span>`;
    button.innerHTML = `${def.icon} <span>${def.label}</span>${count}`;
    container.append(button);
    return button;
  });
  // Di ponsel baris tab digeser ke samping; tab yang dipilih digeser ke tengah baris
  // supaya selalu terlihat (dulu tab di ujung kanan tetap di luar layar).
  const geserKeLayar = (button) => {
    const kiri = button.offsetLeft - (container.clientWidth - button.offsetWidth) / 2;
    container.scrollTo({ left: Math.max(0, kiri), behavior: 'smooth' });
  };
  buttons.forEach((button, index) => {
    button.setAttribute('aria-pressed', index === awal ? 'true' : 'false');
    button.addEventListener('click', () => {
      buttons.forEach((other) => {
        other.classList.remove('is-active');
        other.setAttribute('aria-pressed', 'false');
      });
      panels.forEach((panel) => {
        panel.hidden = true;
        panel.classList.remove('crm-tab-enter');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
      panels[index].hidden = false;
      panels[index].classList.add('crm-tab-enter');
      geserKeLayar(button);
      if (onChange) onChange(definitions[index]);
    });
  });
  panels.forEach((panel, index) => { panel.hidden = index !== awal; });
  if (buttons[awal]) requestAnimationFrame(() => geserKeLayar(buttons[awal]));
  return buttons;
}

// Petunjuk pembayaran pada tagihan yang belum dibayar: rekening resmi dari Pengaturan (bila
// diisi admin) dan tombol WhatsApp ke admin dengan pesan yang sudah berisi nama santri,
// nomor tagihan, dan jumlahnya. Bukti transfer dilampirkan pengirim di WhatsApp.
function petunjukBayar(invoice, student, payment, rupiah) {
  const wadah = document.createElement('div');
  wadah.className = 'crm-pay-guide';
  const judul = document.createElement('p');
  judul.className = 'crm-pay-guide__title';
  judul.textContent = 'Cara membayar';
  wadah.append(judul);
  const rekening = String(payment.bankAccount || '').trim();
  const teks = document.createElement('p');
  teks.className = 'crm-pay-guide__text';
  if (rekening) {
    teks.textContent = 'Transfer ke rekening resmi Hamasah berikut, lalu kirim bukti transfer lewat WhatsApp admin.';
    const kotak = document.createElement('div');
    kotak.className = 'crm-pay-guide__account';
    const nomor = document.createElement('span');
    nomor.textContent = rekening;
    const salin = document.createElement('button');
    salin.type = 'button';
    salin.className = 'crm-pay-guide__copy';
    salin.textContent = 'Salin';
    salin.setAttribute('aria-label', 'Salin rekening pembayaran');
    salin.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rekening);
        salin.textContent = 'Tersalin';
      } catch {
        salin.textContent = 'Salin manual';
      }
      setTimeout(() => { salin.textContent = 'Salin'; }, 2000);
    });
    kotak.append(nomor, salin);
    wadah.append(teks, kotak);
  } else {
    teks.textContent = 'Hubungi admin lewat WhatsApp untuk mendapatkan rekening resmi, lalu kirim bukti transfer di percakapan yang sama.';
    wadah.append(teks);
  }
  const catatan = document.createElement('p');
  catatan.className = 'crm-pay-guide__note';
  catatan.textContent = 'Bayar hanya ke rekening yang tertulis di sini atau yang dikonfirmasi langsung oleh admin Hamasah.';
  const pesan = [
    "Assalamu'alaikum, admin Hamasah.",
    `Saya ingin mengonfirmasi pembayaran tagihan santri ${student.name}.`,
    `Tagihan: ${invoice.description}`,
    `Nomor tagihan: ${invoice.number}`,
    `Jumlah: ${rupiah(invoice.amount)}`,
    'Bukti transfer saya lampirkan di pesan ini.'
  ].join('\n');
  const nomorWa = String(payment.whatsapp || '').replace(/\D/g, '');
  const tombol = document.createElement('a');
  tombol.className = 'crm-btn-primary-yellow crm-pay-guide__wa';
  tombol.target = '_blank';
  tombol.rel = 'noopener';
  tombol.href = `https://wa.me/${nomorWa}?text=${encodeURIComponent(pesan)}`;
  tombol.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg><span>Konfirmasi via WhatsApp</span>';
  tombol.setAttribute('aria-label', `Konfirmasi pembayaran ${invoice.number} via WhatsApp`);
  if (!nomorWa) tombol.hidden = true;
  wadah.append(tombol, catatan);
  return wadah;
}

// Tab yang terakhir dibuka per santri, supaya mengganti periode tidak melempar kembali ke
// tab pertama. Hanya tab yang memakai periode yang menampilkan pilihan periode.
const tabTerakhir = new Map();
const TAB_BERPERIODE = new Set(['mutabaah', 'sholat', 'talaqqi', 'kesehatan']);

function inisialNama(nama) {
  const kata = String(nama || '').trim().split(/\s+/).filter(Boolean);
  return ((kata[0] || '?')[0] + (kata.length > 1 ? kata[kata.length - 1][0] : '')).toUpperCase();
}

// Foto santri di kartu ringkasan detail santri. Inisial tampil lebih dulu dan diganti foto
// bila ada (unggahan admin/musyrif, atau pas foto dari berkas pendaftaran). Ambil dan unggah
// memakai fungsi beranda-musyrif.js supaya cache dan pengecilan fotonya sama.
function pasangFotoSantri(wadah, student, bolehUbah) {
  const musyrif = window.HamasahBerandaMusyrif;
  if (!wadah || !musyrif || !musyrif.fotoUrl) return;
  const bingkai = wadah.querySelector('.crm-summary-photo');

  function tampilkan(url) {
    const lama = bingkai.querySelector('img');
    if (lama) lama.remove();
    if (!url) return;
    const img = document.createElement('img');
    img.className = 'crm-summary-photo__img';
    img.alt = `Foto ${student.name}`;
    img.decoding = 'async';
    img.src = url;
    bingkai.append(img);
    bingkai.classList.add('has-img');
  }
  musyrif.fotoUrl(student.id, requestHeaders()).then(tampilkan);

  if (!bolehUbah || !musyrif.unggahFoto) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.hidden = true;
  const tombol = document.createElement('button');
  tombol.type = 'button';
  tombol.className = 'crm-summary-photo__action';
  const label = () => (bingkai.classList.contains('has-img') ? 'Ganti foto' : 'Tambah foto');
  tombol.textContent = 'Tambah foto';
  musyrif.fotoUrl(student.id, requestHeaders()).then(() => { tombol.textContent = label(); });
  const status = document.createElement('p');
  status.className = 'crm-summary-photo__status';
  status.setAttribute('role', 'status');
  tombol.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    tombol.disabled = true;
    status.textContent = 'Mengunggah foto...';
    try {
      await musyrif.unggahFoto(student.id, file, requestHeaders());
      tampilkan(await musyrif.fotoUrl(student.id, requestHeaders()));
      status.textContent = 'Foto tersimpan.';
    } catch (error) {
      status.textContent = error.message || 'Foto belum dapat diunggah.';
    } finally {
      tombol.disabled = false;
      tombol.textContent = label();
    }
  });
  wadah.append(tombol, input, status);
}

// Kartu profil wali dan santri: kepala gelap berisi inisial, nama, program, asrama, dan
// tiga angka utama (sholat berjamaah, hafalan, kehadiran). Angka hafalan diisi setelah
// data juz dimuat oleh perjalanan-santri.js.
function kartuProfilKeluarga(dashboard, care, account) {
  const student = dashboard.student;
  const kartu = document.createElement('section');
  kartu.className = 'ananda-hero';
  kartu.setAttribute('aria-label', `Profil ${student.name}`);
  const statusLabel = STUDENT_STATUS_LABELS[student.status] || student.status || '';
  const meta = [student.program, student.city].filter(Boolean).join(' · ');
  const musyrif = student.dormitory && student.dormitory.supervisors && student.dormitory.supervisors.length
    ? student.dormitory.supervisors.join(', ') : '';
  const sapaan = account && account.role === 'student' ? "Assalamu'alaikum" : 'Rekam jejak ananda';
  const p = care && care.prayers;
  const sholat = p && p.berjamaahRate !== null && p.berjamaahRate !== undefined ? `${p.berjamaahRate}%` : '-';
  const sholatKet = p && p.recorded ? `${p.totals.berjamaah} dari ${p.recorded} waktu` : 'Belum dicatat';
  const rate = dashboard.attendance.rate;
  const hadir = rate === null || rate === undefined ? '-' : `${rate}%`;
  const hadirKet = dashboard.attendance.total ? `${dashboard.attendance.present || 0} dari ${dashboard.attendance.total} kegiatan` : 'Belum dicatat';
  kartu.innerHTML = `
    <div class="ananda-hero__head">
      <span class="ananda-hero__avatar" aria-hidden="true">${escapeHtml(inisialNama(student.name))}</span>
      <div class="ananda-hero__id">
        <p class="ananda-hero__salam">${escapeHtml(sapaan)}</p>
        <h2 class="ananda-hero__name">${escapeHtml(student.name)}</h2>
        ${meta ? `<p class="ananda-hero__meta">${escapeHtml(meta)}</p>` : ''}
      </div>
      ${statusLabel ? `<span class="ananda-hero__status">${escapeHtml(statusLabel)}</span>` : ''}
    </div>
    <dl class="ananda-hero__info">
      <div><dt>Asrama</dt><dd>${escapeHtml(dormitoryLabel(student))}</dd></div>
      ${musyrif ? `<div><dt>Musyrif</dt><dd>${escapeHtml(musyrif)}</dd></div>` : ''}
      ${student.joinDate ? `<div><dt>Bergabung</dt><dd>${escapeHtml(formatTanggalPanjang(student.joinDate))}</dd></div>` : ''}
    </dl>
    <div class="ananda-hero__stats">
      <div class="ananda-stat"><span class="ananda-stat__label">Sholat berjamaah</span><strong class="ananda-stat__value">${escapeHtml(sholat)}</strong><span class="ananda-stat__note">${escapeHtml(sholatKet)}</span></div>
      <div class="ananda-stat" id="ananda-stat-hafalan"><span class="ananda-stat__label">Hafalan</span><strong class="ananda-stat__value">-</strong><span class="ananda-stat__note">Memuat...</span></div>
      <div class="ananda-stat"><span class="ananda-stat__label">Kehadiran</span><strong class="ananda-stat__value">${escapeHtml(hadir)}</strong><span class="ananda-stat__note">${escapeHtml(hadirKet)}</span></div>
    </div>
  `;
  return kartu;
}

function isiStatHafalan(kartu, juz) {
  const kotak = kartu && kartu.querySelector('#ananda-stat-hafalan');
  if (!kotak) return;
  const nilai = kotak.querySelector('.ananda-stat__value');
  const ket = kotak.querySelector('.ananda-stat__note');
  if (!juz || !juz.tersedia) {
    nilai.textContent = '-';
    ket.textContent = 'Belum dicatat';
    return;
  }
  nilai.textContent = `${juz.hafal} juz`;
  ket.textContent = juz.sedang ? `${juz.sedang} juz sedang dihafal` : (juz.hafal ? 'Sudah hafal' : 'Belum ada juz ditandai');
}

const TAB_ICONS = Object.freeze({
  clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  mosque: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  award: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  home: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  book: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  file: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  users: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  lock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
});

const HAFALAN_GRADE = Object.freeze({ lancar: ['Lancar', 'complete'], 'kurang-lancar': ['Kurang lancar', 'pending'], ulang: ['Perlu diulang', 'absent'] });
const KONDISI_KESEHATAN = Object.freeze({ sehat: ['Sehat', 'complete'], 'sakit-ringan': ['Sakit ringan', 'pending'], 'perlu-perhatian': ['Perlu perhatian', 'absent'], dirujuk: ['Dirujuk', 'absent'] });
const SHOLAT_WAKTU = Object.freeze([['subuh', 'Subuh'], ['dzuhur', 'Dzuhur'], ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya']]);
const SHOLAT_STATUS = Object.freeze({ berjamaah: 'Berjamaah', munfarid: 'Munfarid', tidak: 'Tidak', izin: 'Izin' });

// Rekap sholat berjamaah dari catatan terstruktur: ringkasan periode dan tabel per hari.
function createPrayerRecap(care) {
  const box = document.createElement('div');
  box.className = 'crm-white-card prayer-recap';
  const heading = document.createElement('h3');
  heading.textContent = 'Sholat berjamaah ' + formatTanggalPanjang(care.period.from) + ' sampai ' + formatTanggalPanjang(care.period.to);
  const summary = document.createElement('p');
  const t = care.prayers.totals;
  summary.textContent = care.prayers.recorded
    ? care.prayers.recorded + ' waktu sholat tercatat: ' + t.berjamaah + ' berjamaah (' + care.prayers.berjamaahRate + '%), ' + t.munfarid + ' munfarid, ' + t.tidak + ' tidak, ' + t.izin + ' izin.'
    : 'Belum ada presensi sholat yang dicatat musyrif pada periode ini.';
  box.append(heading, summary);
  if (!care.prayers.days.length) return box;
  const wrap = document.createElement('div');
  wrap.className = 'prayer-recap__scroll';
  const table = document.createElement('table');
  table.className = 'prayer-recap__table';
  const caption = document.createElement('caption');
  caption.className = 'prayer-recap__caption';
  caption.textContent = 'Presensi sholat per hari';
  const head = document.createElement('tr');
  ['Tanggal', ...SHOLAT_WAKTU.map(([, label]) => label)].forEach((text) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; head.append(th); });
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  care.prayers.days.forEach((day) => {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = formatTanggalPanjang(day.date);
    row.append(th);
    SHOLAT_WAKTU.forEach(([key]) => {
      const td = document.createElement('td');
      const status = day.prayers[key];
      td.textContent = status ? SHOLAT_STATUS[status] || status : '-';
      if (status) td.className = 'prayer-recap__cell prayer-recap__cell--' + status;
      row.append(td);
    });
    tbody.append(row);
  });
  table.append(caption, thead, tbody);
  wrap.append(table);
  box.append(wrap);
  return box;
}

function renderCrmDashboard(dashboard, account, onBack, care = null) {
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;
  const student = dashboard.student;
  const canRecord = Boolean(account) && ['admin', 'supervisor'].includes(account.role);
  // Wali dan santri: profil ringkas lalu langsung tab; doa, izin, roadmap, dan santri teladan
  // pindah ke tab Ringkasan. Staf tetap melihat kartu ringkasan lengkap di atas tab.
  const keluarga = Boolean(account) && ['parent', 'student'].includes(account.role);

  if (onBack) {
    const backBar = document.createElement('div');
    backBar.className = 'crm-back-bar';
    const labelKembali = keluarga ? 'Kembali ke beranda' : 'Kembali ke daftar santri';
    backBar.innerHTML = `
      <button type="button" class="crm-topbar-action-btn js-chip-active" id="crm-back-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        <span>${labelKembali}</span>
      </button>
      <span class="js-text-meta">Rekam jejak <strong>${escapeHtml(student.name)}</strong></span>
    `;
    backBar.querySelector('#crm-back-btn').addEventListener('click', onBack);
    studentDashboard.append(backBar);
  }

  // Ringkasan profil. Dulu berisi NIM, nama musyrif, semester, dan status SPP yang
  // ditulis keras; kini hanya yang ada di data.
  const summaryCard = document.createElement('div');
  summaryCard.className = 'crm-summary-card';

  const attendanceText = dashboard.attendance.rate === null
    ? 'Belum ada data presensi'
    : `${dashboard.attendance.rate}% hadir (${dashboard.attendance.present || 0}/${dashboard.attendance.total || 0})`;
  const latestEval = dashboard.evaluations.length ? dashboard.evaluations[0].note : 'Belum ada catatan pembina.';
  const statusLabel = STUDENT_STATUS_LABELS[student.status] || student.status || '-';
  const subtitle = [student.program, student.city].filter(Boolean).join(' · ');

  summaryCard.innerHTML = `
    <div class="crm-summary-col">
      <div class="crm-summary-identity">
        <div class="crm-summary-photo-wrap">
          <span class="crm-summary-photo"><span class="crm-summary-photo__initials">${escapeHtml(inisialNama(student.name))}</span></span>
        </div>
        <div>
          <div class="crm-summary-title-row">
            <h2 class="crm-summary-title">${escapeHtml(student.name)}</h2>
          </div>
          ${subtitle ? `<p class="crm-summary-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        </div>
      </div>
      <div>
        <p class="crm-field-label">BERGABUNG</p>
        <div class="crm-field-value"><span>${escapeHtml(formatTanggalPanjang(student.joinDate) || '-')}</span></div>
      </div>
    </div>

    <div class="crm-summary-col">
      <div>
        <p class="crm-field-label">STATUS</p>
        <div class="crm-field-value"><span>${escapeHtml(statusLabel)}</span></div>
      </div>
      <div>
        <p class="crm-field-label">ASRAMA</p>
        <div class="crm-person-row"><span class="crm-person-name">${escapeHtml(dormitoryLabel(student))}</span></div>
      </div>
      ${student.dormitory && student.dormitory.supervisors && student.dormitory.supervisors.length ? `
      <div>
        <p class="crm-field-label">MUSYRIF PENANGGUNG JAWAB</p>
        <div class="crm-person-row"><span class="crm-person-name">${escapeHtml(student.dormitory.supervisors.join(', '))}</span></div>
      </div>` : ''}
    </div>

    <div class="crm-summary-col">
      <div>
        <p class="crm-field-label">KEHADIRAN KEGIATAN</p>
        <div class="crm-field-value">
          <span class="crm-outline-dot" aria-hidden="true"></span>
          <span>${escapeHtml(attendanceText)}</span>
        </div>
      </div>
      <div>
        <p class="crm-field-label">CATATAN PEMBINA</p>
        <p class="crm-summary-note">${escapeHtml(latestEval)}</p>
      </div>
    </div>
  `;
  pasangFotoSantri(summaryCard.querySelector('.crm-summary-photo-wrap'), student, canRecord);

  const attendanceEntries = dashboard.attendance.entries || [];
  const prayerEntries = attendanceEntries.filter((entry) => PRAYER_PATTERN.test(entry.category || ''));

  const tabDefs = [
    ...(keluarga ? [{ id: 'ringkasan', label: 'Ringkasan', icon: TAB_ICONS.home }] : []),
    { id: 'mutabaah', label: "Mutaba'ah & ibadah", icon: TAB_ICONS.clock, count: attendanceEntries.length },
    { id: 'sholat', label: 'Sholat berjamaah', icon: TAB_ICONS.mosque, count: care ? care.prayers.recorded : prayerEntries.length },
    { id: 'talaqqi', label: 'Talaqqi & tahfidz', icon: TAB_ICONS.award, count: dashboard.achievements.length + (care ? care.memorization.length : 0) },
    { id: 'dorm', label: 'Asrama', icon: TAB_ICONS.home },
    { id: 'lms', label: 'Maddah (LMS)', icon: TAB_ICONS.book },
    { id: 'admin', label: 'Rapor & ringkasan', icon: TAB_ICONS.file }
  ];

  const subtabsRow = document.createElement('div');
  subtabsRow.className = 'crm-subtabs-row';

  // Toolbar: hanya kontrol periode yang benar-benar menyaring data. Penanda tanggal
  // "Pekan Ini: 15 Sep - 21 Sep 2026" dan dropdown "Semua Aktivitas" dulu hanya
  // menampilkan teks tanpa menyaring apa pun, dan tombol "Input Mutaba'ah" tidak
  // punya pendengar. Pencatatan sungguhan ada di konsol monitoring.
  const toolbar = document.createElement('div');
  toolbar.className = 'crm-toolbar';
  const periodControls = document.createElement('div');
  periodControls.className = 'crm-toolbar-filters';
  periodControls.innerHTML = '<label class="sr-only" for="record-period-from">Dari tanggal</label><input id="record-period-from" type="date" value="' + escapeHtml(dashboard.period?.from || '') + '"><label class="sr-only" for="record-period-to">Sampai tanggal</label><input id="record-period-to" type="date" value="' + escapeHtml(dashboard.period?.to || '') + '"><button type="button" class="crm-pill-btn" id="apply-record-period">Terapkan periode</button>';
  periodControls.querySelector('#apply-record-period').addEventListener('click', async () => {
    const from = periodControls.querySelector('#record-period-from').value;
    const to = periodControls.querySelector('#record-period-to').value;
    try { await loadDashboard(student.id, account, onBack, { from, to }); } catch (error) { window.alert(error.message); }
  });
  // Pilihan cepat periode: Hari ini, Kemarin, 7 hari, 30 hari. Tanggal memakai kalender
  // perangkat pembaca; yang sedang aktif ditandai.
  const PERIODE_CEPAT = [['Hari ini', 0, 0], ['Kemarin', 1, 1], ['7 hari', 6, 0], ['30 hari', 29, 0]];
  const tanggalMundur = (hari) => {
    const d = new Date();
    d.setDate(d.getDate() - hari);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const cepat = document.createElement('div');
  cepat.className = 'crm-period-quick';
  cepat.setAttribute('role', 'group');
  cepat.setAttribute('aria-label', 'Pilihan cepat periode');
  PERIODE_CEPAT.forEach(([label, mulai, akhir]) => {
    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'crm-pill-btn';
    tombol.textContent = label;
    const from = tanggalMundur(mulai);
    const to = tanggalMundur(akhir);
    const aktif = dashboard.period && dashboard.period.from === from && dashboard.period.to === to;
    tombol.classList.toggle('is-active', Boolean(aktif));
    tombol.setAttribute('aria-pressed', aktif ? 'true' : 'false');
    tombol.addEventListener('click', async () => {
      try { await loadDashboard(student.id, account, onBack, { from, to }); } catch (error) { window.alert(error.message); }
    });
    cepat.append(tombol);
  });
  toolbar.append(cepat, periodControls);
  if (canRecord) {
    const actions = document.createElement('div');
    actions.className = 'crm-toolbar-actions';
    actions.innerHTML = '<a class="crm-btn-primary-yellow" href="monitoring"><span>Catat di Monitoring</span></a>';
    toolbar.append(actions);
  }

  const panelsContainer = document.createElement('div');
  panelsContainer.className = 'crm-panels';

  // Panel 1: Mutaba'ah & Ibadah
  const panelMutabaah = document.createElement('div');
  panelMutabaah.className = 'crm-card-stack';
  if (attendanceEntries.length) {
    attendanceEntries.slice(0, 10).forEach((entry) => panelMutabaah.append(attendanceCard(entry)));
  } else {
    panelMutabaah.append(createEmptyState("Belum ada catatan mutaba'ah pada periode ini."));
  }

  // Panel 2: Sholat Berjamaah, disaring dari presensi yang benar-benar tercatat.
  const panelSholat = document.createElement('div');
  panelSholat.className = 'crm-card-stack';
  panelSholat.hidden = true;
  if (care) {
    panelSholat.append(createPrayerRecap(care));
  } else if (prayerEntries.length) {
    prayerEntries.forEach((entry) => panelSholat.append(attendanceCard(entry)));
  } else {
    panelSholat.append(createEmptyState('Belum ada presensi sholat berjamaah yang tercatat pada periode ini.'));
  }

  // Panel 3: Talaqqi & Tahfidz
  const panelTalaqqi = document.createElement('div');
  panelTalaqqi.className = 'crm-card-stack';
  panelTalaqqi.hidden = true;
  if (care && care.memorization.length) {
    care.memorization.forEach((setoran) => {
      const [statusText, statusType] = HAFALAN_GRADE[setoran.grade] || [setoran.grade, 'pending'];
      panelTalaqqi.append(createRecordCard({
        badgeColor: 'green', badgeIcon: 'book',
        title: setoran.portion,
        subtitle: (setoran.kind === 'ziyadah' ? 'Ziyadah (hafalan baru)' : 'Murajaah') + ' · ' + formatTanggalPanjang(setoran.occurredOn),
        statusText, statusType, note: setoran.note || ''
      }));
    });
  }
  if (dashboard.achievements.length) {
    dashboard.achievements.forEach((achievement) => {
      panelTalaqqi.append(createRecordCard({
        badgeColor: 'green',
        badgeIcon: 'book',
        title: achievement.title,
        subtitle: formatWaktu(achievement.occurredAt),
        statusText: 'Capaian',
        statusType: 'complete',
        details: [{ label: 'Dicatat oleh', value: achievement.recordedByName }],
        note: achievement.description
      }));
    });
  } else if (!(care && care.memorization.length)) {
    panelTalaqqi.append(createEmptyState('Belum ada capaian talaqqi atau setoran hafalan yang tercatat.'));
  }

  // Panel 4: Asrama. Dulu berisi nama gedung, katering, AC, dan Wi-Fi yang ditulis keras
  // untuk setiap santri. Kini hanya asrama tempat santri ini ditempatkan.
  const panelDorm = document.createElement('div');
  panelDorm.className = 'crm-card-stack';
  panelDorm.hidden = true;
  if (student.dormitory) {
    panelDorm.append(createRecordCard({
      badgeIcon: 'building',
      title: student.dormitory.name,
      subtitle: student.dormitory.area || '',
      statusText: 'Ditempatkan',
      statusType: 'complete'
    }));
  } else {
    panelDorm.append(createEmptyState(student.dormitoryId
      ? 'Santri ini sudah ditempatkan, tetapi rincian asramanya belum dapat dimuat.'
      : 'Santri ini belum ditempatkan di asrama.'));
  }

  // Panel 5: Maddah (LMS)
  const panelLms = document.createElement('div');
  panelLms.className = 'crm-white-card';
  panelLms.hidden = true;
  panelLms.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Maddah yang Diikuti</h3>
        <p>Daftar maddah dan progres belajar santri ini.</p>
      </div>
      <a href="lms" class="crm-btn-primary-yellow js-btn-sm">
        <span>Buka Ruang Belajar (LMS)</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </a>
    </div>
    <div id="crm-student-courses">
      <p class="js-text-muted">Memuat maddah...</p>
    </div>
  `;
  // Wali hanya melihat ringkasan progres; ruang belajar LMS bukan untuknya.
  if (currentAccount && currentAccount.role === 'parent') {
    const lmsLink = panelLms.querySelector('a[href="lms"]');
    if (lmsLink) lmsLink.remove();
    const subjudul = panelLms.querySelector('.crm-white-card-header p');
    if (subjudul) subjudul.textContent = 'Ringkasan progres belajar ananda per maddah.';
  }

  // Ringkasan progres (judul dan hitungan materi) juga terbuka untuk wali. Dulu tab ini
  // memanggil /courses yang menolak wali, dan penolakan itu tampil sebagai "belum ada maddah".
  fetch(`/api/students/${encodeURIComponent(student.id)}/course-progress`, { headers: requestHeaders() })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Maddah belum dapat dimuat.');
      return data;
    })
    .then((data) => {
      const container = panelLms.querySelector('#crm-student-courses');
      if (!container) return;
      if (!data.items || !data.items.length) {
        container.innerHTML = '<p class="js-text-muted">Belum ada maddah yang diikuti santri ini.</p>';
        return;
      }
      container.replaceChildren();
      const grid = document.createElement('div');
      grid.className = 'crm-grid-2col';
      data.items.forEach((course) => {
        const item = document.createElement('div');
        item.className = 'crm-feature-box';
        item.innerHTML = `
          <div class="crm-feature-box-icon">${TAB_ICONS.book}</div>
          <div class="js-flex-1">
            <strong>${escapeHtml(course.title)}</strong>
            <p>${Number(course.completedMaterials) || 0} dari ${Number(course.totalMaterials) || 0} materi selesai · Progres ${Number(course.progress) || 0}%</p>
            <div class="js-progress-track">
              <div class="js-progress-bar"></div>
            </div>
          </div>
        `;
        // Lebar diisi lewat element.style, bukan atribut style di markup: penulisan
        // properti satu per satu tidak terkena Content Security Policy.
        const bar = item.querySelector('.js-progress-bar');
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, Number(course.progress) || 0))}%`;
        grid.append(item);
      });
      container.append(grid);
    })
    .catch((error) => {
      const container = panelLms.querySelector('#crm-student-courses');
      if (!container) return;
      const pesan = document.createElement('p');
      pesan.className = 'js-text-muted';
      pesan.textContent = error.message || 'Maddah belum dapat dimuat.';
      container.replaceChildren(pesan);
    });

  // Panel 6: Ringkasan Data. Dulu menyatakan "Status SPP & Akomodasi: Lunas" dan
  // "Garansi Tanpa Biaya Siluman" untuk semua santri. Dashboard tidak membawa data
  // tagihan, jadi tidak ada klaim keuangan di sini. Yang tersisa hanya yang nyata:
  // rapor PDF (dari catatan nyata) dan ekspor ringkasan rekam jejak.
  const recordPeriodLabel = dashboard.period?.from || dashboard.period?.to
    ? [formatTanggalPanjang(dashboard.period.from) || 'awal', formatTanggalPanjang(dashboard.period.to) || 'sekarang'].join(' sampai ')
    : 'seluruh catatan';
  const panelAdmin = document.createElement('div');
  panelAdmin.className = 'crm-white-card';
  panelAdmin.hidden = true;
  panelAdmin.innerHTML = `
    <div class="crm-white-card-header">
      <div>
        <h3>Rapor Digital &amp; Ringkasan</h3>
        <p>Rapor PDF memuat kehadiran, progres maddah, prestasi, kegiatan, evaluasi, dan catatan disiplin yang tercatat pada periode ${escapeHtml(recordPeriodLabel)}.</p>
      </div>
      <div class="crm-report-actions">
        <button type="button" class="crm-topbar-action-btn" id="download-student-rapor" aria-label="Unduh rapor PDF">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>Unduh rapor (PDF)</span>
        </button>
        <button type="button" class="crm-topbar-action-btn" id="download-student-report" aria-label="Unduh ringkasan CSV">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Unduh Ringkasan (CSV)</span>
        </button>
      </div>
    </div>
  `;
  // Rapor mengikuti periode yang sedang diterapkan, sama dengan data yang tampil di layar.
  const recordPeriodQuery = new URLSearchParams(Object.entries({ from: dashboard.period?.from, to: dashboard.period?.to }).filter(([, value]) => value)).toString();
  const reportSuffix = recordPeriodQuery ? `?${recordPeriodQuery}` : '';
  const raporButton = panelAdmin.querySelector('#download-student-rapor');
  raporButton.addEventListener('click', () => {
    downloadWithSession(`/api/students/${encodeURIComponent(student.id)}/report.pdf${reportSuffix}`, `rapor-${student.id}.pdf`, raporButton.querySelector('span'));
  });
  const reportButton = panelAdmin.querySelector('#download-student-report');
  reportButton.addEventListener('click', () => {
    downloadWithSession(`/api/students/${encodeURIComponent(student.id)}/report${reportSuffix}`, `ringkasan-${student.id}.csv`, reportButton.querySelector('span'));
  });

  const panels = [panelMutabaah, panelSholat, panelTalaqqi, panelDorm, panelLms, panelAdmin];

  // Tab Ringkasan (wali dan santri): catatan pembina terbaru, lalu kartu dari
  // perjalanan-santri.js (pengumuman, hari ini, izin, doa, roadmap, peta juz, teladan).
  let panelRingkasan = null;
  if (keluarga) {
    panelRingkasan = document.createElement('div');
    panelRingkasan.className = 'crm-card-stack ananda-ringkasan';
    if (dashboard.evaluations.length) {
      const evaluasi = dashboard.evaluations[0];
      const catatan = document.createElement('section');
      catatan.className = 'crm-white-card santri-card ananda-catatan';
      const kepala = document.createElement('div');
      kepala.className = 'santri-card__head';
      const judul = document.createElement('h3');
      judul.className = 'santri-card__title';
      judul.textContent = 'Catatan pembina terbaru';
      kepala.append(judul);
      const isiCatatan = document.createElement('p');
      isiCatatan.className = 'ananda-catatan__isi';
      isiCatatan.textContent = evaluasi.note;
      catatan.append(kepala, isiCatatan);
      panelRingkasan.append(catatan);
    }
    panels.unshift(panelRingkasan);
  }

  // Panel Kesehatan: hanya bila fitur kesehatan aktif (care.health bukan null). Wali dan santri
  // menerima kondisi dan catatan untuk wali; keluhan dan tindakan hanya ada pada data staf.
  if (care && care.health !== null) {
    const panelHealth = document.createElement('div');
    panelHealth.className = 'crm-card-stack';
    panelHealth.hidden = true;
    if (!care.health.length) {
      panelHealth.append(createEmptyState('Belum ada catatan kesehatan pada periode ini.'));
    } else {
      care.health.forEach((catatan) => {
        const [statusText, statusType] = KONDISI_KESEHATAN[catatan.condition] || [catatan.condition, 'pending'];
        panelHealth.append(createRecordCard({
          badgeColor: statusType === 'complete' ? 'green' : 'yellow', badgeIcon: 'note',
          title: 'Kondisi: ' + statusText, subtitle: formatTanggalPanjang(catatan.occurredOn), statusText, statusType,
          details: [{ label: 'Keluhan (internal)', value: catatan.complaint || '' }, { label: 'Tindakan (internal)', value: catatan.actionTaken || '' }],
          note: catatan.parentNote || ''
        }));
      });
    }
    tabDefs.push({ id: 'kesehatan', label: 'Kesehatan', icon: TAB_ICONS.clock, count: care.health.length });
    panels.push(panelHealth);
  }

  // Panel 7: Tagihan & Kuitansi. Untuk wali (santri yang terhubung), santri itu sendiri, dan admin; peran
  // lain tidak punya akses ke data keuangan santri. Kuitansi hanya untuk tagihan lunas.
  if (currentAccount && ['parent', 'student', 'admin'].includes(currentAccount.role)) {
    const panelBilling = document.createElement('div');
    panelBilling.className = 'crm-white-card';
    panelBilling.hidden = true;
    const header = document.createElement('div');
    header.className = 'crm-white-card-header';
    header.innerHTML = '<div><h3>Tagihan &amp; Kuitansi</h3><p>Tagihan santri ini dan kuitansi untuk tagihan yang sudah lunas.</p></div>';
    const list = document.createElement('div');
    list.className = 'crm-billing-list';
    list.textContent = 'Memuat tagihan...';
    panelBilling.append(header, list);
    const STATUS_TAGIHAN = { paid: ['Lunas', 'complete'], unpaid: ['Belum dibayar', 'pending'], voided: ['Dibatalkan', 'absent'] };
    const rupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
    fetch(`/api/students/${encodeURIComponent(student.id)}/invoices`, { headers: requestHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Tagihan belum dapat dimuat.');
        return data;
      })
      .then(({ items = [], payment = {} }) => {
        list.replaceChildren();
        if (!items.length) {
          list.append(createEmptyState('Belum ada tagihan untuk santri ini.'));
          return;
        }
        items.forEach((invoice) => {
          const [statusText, statusType] = STATUS_TAGIHAN[invoice.status] || [invoice.status, 'pending'];
          const card = createRecordCard({
            badgeColor: invoice.status === 'paid' ? 'green' : 'yellow',
            badgeIcon: 'note',
            title: invoice.description,
            subtitle: invoice.number,
            statusText,
            statusType,
            details: [
              { label: 'Jumlah', value: rupiah(invoice.amount) },
              { label: 'Diterbitkan', value: formatTanggal(invoice.issuedAt) },
              { label: 'Dibayar', value: invoice.paidAt ? formatTanggal(invoice.paidAt) : '' },
              { label: 'Nomor kuitansi', value: invoice.receiptNumber || '' }
            ]
          });
          if (invoice.status === 'paid' && invoice.receiptNumber) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'crm-topbar-action-btn crm-receipt-btn';
            button.setAttribute('aria-label', `Unduh kuitansi ${invoice.receiptNumber}`);
            button.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Unduh Kuitansi (PDF)</span>';
            button.addEventListener('click', () => {
              downloadWithSession(
                `/api/students/${encodeURIComponent(student.id)}/invoices/${encodeURIComponent(invoice.id)}/receipt.pdf`,
                `${invoice.receiptNumber.replace(/[^\w.-]+/g, '-')}.pdf`,
                button.querySelector('span')
              );
            });
            card.append(button);
          }
          if (invoice.status === 'unpaid') card.append(petunjukBayar(invoice, student, payment, rupiah));
          list.append(card);
        });
      })
      .catch((error) => {
        list.replaceChildren(createEmptyState(error.message));
      });
    tabDefs.push({ id: 'billing', label: 'Tagihan & kuitansi', icon: TAB_ICONS.file });
    panels.push(panelBilling);
  }

  const idxTerakhir = tabDefs.findIndex((def) => def.id === tabTerakhir.get(student.id));
  const awal = idxTerakhir >= 0 ? idxTerakhir : 0;
  const aturToolbar = (def) => { toolbar.hidden = !TAB_BERPERIODE.has(def.id); };
  subtabsRow.setAttribute('aria-label', 'Bagian rekam jejak');
  buildTabs(tabDefs, panels, subtabsRow, {
    awal,
    onChange(def) {
      tabTerakhir.set(student.id, def.id);
      aturToolbar(def);
    }
  });
  aturToolbar(tabDefs[awal]);
  panelsContainer.append(...panels);

  // Hari ini, roadmap studi, dan santri teladan (perjalanan-santri.js). Diisi setelah
  // dashboard tampil; kartu yang datanya kosong tidak muncul. Untuk wali dan santri
  // kartu-kartu ini masuk ke tab Ringkasan.
  const perjalanan = document.createElement('div');
  perjalanan.className = keluarga ? 'santri-journey santri-journey--ringkasan' : 'santri-journey';
  perjalanan.hidden = true;

  const profil = keluarga ? kartuProfilKeluarga(dashboard, care, account) : summaryCard;
  if (keluarga) {
    panelRingkasan.append(perjalanan);
    studentDashboard.append(profil, subtabsRow, toolbar, panelsContainer);
  } else {
    studentDashboard.append(summaryCard, perjalanan, subtabsRow, toolbar, panelsContainer);
  }
  studentDashboard.classList.add('crm-view-enter');
  studentDashboard.hidden = false;
  if (window.HamasahPerjalanan) {
    window.HamasahPerjalanan.isi(perjalanan, { studentId: student.id, role: account && account.role, care, headers: requestHeaders(), ringkas: keluarga })
      .then((hasil) => { if (keluarga) isiStatHafalan(profil, hasil && hasil.juz); })
      .catch(() => { if (keluarga) isiStatHafalan(profil, null); });
  } else if (keluarga) {
    isiStatHafalan(profil, null);
  }
}

// Daftar santri dimuat per halaman (Task R6.2). Yang ditampilkan selalu isi `items`;
// `allTotal` adalah jumlah seluruh santri yang boleh dilihat akun ini, sedangkan `total`
// mengikuti pencarian yang sedang aktif.
const STUDENT_PAGE_SIZE = 20;
let studentPage = { items: [], total: 0, allTotal: 0, search: '' };
// Ringkasan dashboard super admin (/api/admin/overview), lihat admin-overview.js.
let adminOverview = null;

async function fetchStudentPage({ search = '', offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(STUDENT_PAGE_SIZE), offset: String(offset) });
  if (search) params.set('search', search);
  const response = await fetch(`/api/my-students?${params}`, { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Data santri belum dapat dimuat.');
  return { items: result.items || [], total: typeof result.total === 'number' ? result.total : (result.items || []).length };
}

function renderExecutiveDashboard(_daftarAwal, account) {
  const students = studentPage.items;
  const allTotal = studentPage.allTotal;
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;

  const isAdmin = account && account.role === 'admin';
  const isSupervisor = account && account.role === 'supervisor';
  const isParent = account && account.role === 'parent';
  // Dashboard super admin memakai ringkasan gabungan bila tersedia.
  const ringkasan = isAdmin && adminOverview && window.HamasahAdminOverview ? adminOverview : null;

  const coursueLayout = document.createElement('div');
  coursueLayout.className = 'coursue-layout';
  const mainCol = document.createElement('div');
  mainCol.className = 'coursue-main-col';
  if (isSupervisor) mainCol.classList.add('mus-home');
  if (isAdmin) mainCol.classList.add('admin-home');
  // Judul dan ringkasan hanya memakai peran dan jumlah dari data. Sebelumnya berisi
  // nama kawasan dan gedung operasional yang belum dikonfirmasi klien dan ditulis keras
  // di kode.
  const namaWali = namaSapaan(account);
  const titleText = isParent
    ? `Assalamu'alaikum, Bapak/Ibu${namaWali ? ` ${namaWali}` : ''}`
    : `Assalamu'alaikum${namaWali ? `, ${namaWali}` : ''}`;
  const subtitleText = isAdmin
    ? (ringkasan
      ? `Super Admin · ${ringkasan.summary.activeStudents} santri aktif, ${ringkasan.summary.dormitories} asrama, ${ringkasan.summary.supervisors} musyrif.`
      : `Super Admin · ${allTotal} santri terdaftar.`)
    : isSupervisor
      ? `${allTotal} santri dalam pengawasan Anda.`
      : (allTotal
        ? `${allTotal} ananda terhubung dengan akun ini. Berikut perkembangan dan kegiatan terbaru ${allTotal > 1 ? 'mereka' : 'ananda'}.`
        : 'Belum ada ananda yang terhubung dengan akun ini.');
  const heroTag = isAdmin ? 'Konsol eksekutif' : isSupervisor ? 'Konsol musyrif' : 'Portal keluarga';

  const heroBanner = document.createElement('div');
  heroBanner.className = 'coursue-hero-banner';
  heroBanner.innerHTML = `
    <div class="coursue-hero-tag">${heroTag}</div>
    <h2 class="coursue-hero-title">${escapeHtml(titleText)}</h2>
    <p class="coursue-hero-subtitle">${escapeHtml(subtitleText)}</p>
    ${isParent || isAdmin ? '' : `<button type="button" class="coursue-hero-cta" id="btn-hero-action">
      <span>Catat di Monitoring Asrama</span>
      <span class="coursue-hero-cta-arrow">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </span>
    </button>`}
  `;
  if (isSupervisor) {
    heroBanner.classList.add('mus-home-header');
    const title = heroBanner.querySelector('.coursue-hero-title');
    title.textContent = `Assalamu'alaikum, ${sapaanMusyrif(account)}`;
    heroBanner.querySelector('.coursue-hero-subtitle').textContent = `Pantau perkembangan ${allTotal} santri binaan dan lengkapi laporan harian.`;
    const action = heroBanner.querySelector('#btn-hero-action');
    if (action) action.textContent = 'Catat presensi';
  }
  // Wali: tombol "Lihat mutaba'ah terkini" dihapus karena hanya membuka ananda pertama;
  if (isAdmin && ringkasan) {
    const subtitle = heroBanner.querySelector('.coursue-hero-subtitle');
    subtitle.replaceChildren(document.createTextNode('Super Admin · '));
    [
      [ringkasan.summary.activeStudents, 'santri aktif'],
      [ringkasan.summary.dormitories, 'asrama'],
      [ringkasan.summary.supervisors, 'musyrif']
    ].forEach(([value, label], index) => {
      if (index) subtitle.append(document.createTextNode(', '));
      const emphasis = document.createElement('strong');
      emphasis.textContent = `${value} ${label}`;
      subtitle.append(emphasis);
    });
    subtitle.append(document.createTextNode('.'));
  }
  // setiap kartu ananda sudah bisa diketuk.

  // Selain admin, tidak ada kartu angka di bawah judul: jumlah santri sudah ada di
  // subjudul, dan kotak "Halaqah & Program" dulu hanya teks pengisi tanpa data.

  // Dulu ada lima tab tambahan (Mutaba'ah, Sholat, Talaqqi, Asrama, LMS) berisi sekitar
  // 300 baris konten karangan, karena tidak ada sumber data agregat di tingkat ini.
  // Dihilangkan sampai ada datanya. Rekam jejak nyata per santri ada di detail santri.
  const tabDefs = ringkasan
    ? [
      { id: 'students', label: 'Santri', icon: TAB_ICONS.users, count: ringkasan.students.length },
      { id: 'dormitories', label: 'Asrama', icon: TAB_ICONS.home, count: ringkasan.dormitories.length },
      { id: 'supervisors', label: 'Musyrif', icon: TAB_ICONS.award, count: ringkasan.supervisors.length }
    ]
    : [
      { id: 'students', label: isParent ? 'Daftar ananda' : 'Daftar santri', icon: TAB_ICONS.users, count: allTotal }
    ];

  const subtabsRow = document.createElement('div');
  subtabsRow.className = 'crm-subtabs-row';

  const panelsContainer = document.createElement('div');
  panelsContainer.className = 'crm-panels';

  const panelStudents = document.createElement('div');
  panelStudents.className = 'crm-card-stack';

  // Pencarian dan "Muat lebih banyak" berjalan di server. Kotak cari hanya ditawarkan
  // bila daftarnya memang tidak muat dalam satu halaman.
  const studentTools = document.createElement('div');
  studentTools.className = 'portal-student-tools';
  const studentSearch = document.createElement('input');
  studentSearch.type = 'search';
  studentSearch.className = 'portal-student-search';
  studentSearch.placeholder = 'Cari nama santri...';
  studentSearch.setAttribute('aria-label', 'Cari nama santri');
  studentSearch.value = studentPage.search;
  studentSearch.hidden = allTotal <= STUDENT_PAGE_SIZE && !studentPage.search;
  const studentHint = document.createElement('p');
  studentHint.className = 'portal-student-hint';
  studentHint.setAttribute('role', 'status');
  const studentCards = document.createElement('div');
  studentCards.className = 'crm-card-stack';
  const studentMore = document.createElement('button');
  studentMore.type = 'button';
  studentMore.className = 'button button--secondary';
  studentMore.textContent = 'Muat lebih banyak';
  studentTools.append(studentSearch, studentHint);

  function openStudent(student) {
    bukaSantri(student.id);
  }

  // Detail santri selalu dibuka dari atas: tanpa ini layar tetap di posisi gulir dashboard
  // (misalnya di tengah tabel santri). Hanya di sini, bukan di loadDashboard, supaya
  // mengganti periode di dalam detail santri tidak melompat ke atas.
  function bukaSantri(studentId) {
    loadDashboard(studentId, account, () => renderExecutiveDashboard(null, account)).then(() => {
      // 'instant': html memakai scroll-behavior: smooth, dan halaman baru tidak perlu animasi.
      window.scrollTo({ top: 0, behavior: 'instant' });
      const kembali = document.querySelector('#crm-back-btn');
      if (kembali) kembali.focus({ preventScroll: true });
    }).catch((err) => {
      alert(err.message || 'Dashboard belum dapat dimuat.');
    });
  }

  function paintStudents() {
    studentCards.replaceChildren();
    if (!studentPage.items.length) {
      studentCards.append(createEmptyState(studentPage.search
        ? 'Tidak ada santri yang cocok dengan pencarian.'
        : 'Belum ada santri yang terhubung dengan akun ini.'));
    } else {
      studentPage.items.forEach((student, idx) => {
        studentCards.append(createStudentCompactCard(student, idx, account, () => openStudent(student)));
      });
    }
    studentHint.textContent = studentPage.total > studentPage.items.length || studentPage.search
      ? `Menampilkan ${studentPage.items.length} dari ${studentPage.total} santri.`
      : '';
    studentMore.hidden = studentPage.items.length >= studentPage.total;
  }

  let studentSearchTimer = null;
  studentSearch.addEventListener('input', () => {
    clearTimeout(studentSearchTimer);
    studentSearchTimer = setTimeout(async () => {
      const search = studentSearch.value.trim();
      try {
        const page = await fetchStudentPage({ search });
        studentPage = { ...studentPage, items: page.items, total: page.total, search };
        paintStudents();
      } catch (err) {
        studentHint.textContent = err.message || 'Pencarian belum dapat dijalankan.';
      }
    }, 250);
  });
  studentMore.addEventListener('click', async () => {
    studentMore.disabled = true;
    try {
      const page = await fetchStudentPage({ search: studentPage.search, offset: studentPage.items.length });
      studentPage = { ...studentPage, items: studentPage.items.concat(page.items), total: page.total };
      paintStudents();
    } catch (err) {
      studentHint.textContent = err.message || 'Data santri belum dapat dimuat.';
    } finally {
      studentMore.disabled = false;
    }
  });
  // Wali memakai beranda keluarga; kartu ananda lama hanya dilukis bila beranda gagal,
  // karena tiap kartu wali memuat ringkasannya sendiri dari server.
  const pakaiBerandaWali = isParent && Boolean(window.HamasahBerandaWali);
  if (!pakaiBerandaWali) paintStudents();
  panelStudents.append(studentTools, studentCards, studentMore);

  const panels = ringkasan
    ? [
      window.HamasahAdminOverview.panelSantri(ringkasan, { onOpenStudent: bukaSantri }),
      window.HamasahAdminOverview.panelAsrama(ringkasan, { onOpenStudent: bukaSantri }),
      window.HamasahAdminOverview.panelMusyrif(ringkasan)
    ]
    : [panelStudents];
  panels.slice(1).forEach((panel) => { panel.hidden = true; });
  buildTabs(tabDefs, panels, subtabsRow);
  panelsContainer.append(...panels);

  // Tema 2026: satu kolom lebar. Sapaan dan pintasan pindah ke kepala halaman (hiasKepala),
  // kartu data demo admin ke bagian paling bawah.
  hiasKepala(heroBanner, account);
  const kartuDemo = isAdmin && window.HamasahAdminOverview
    ? window.HamasahAdminOverview.kartuDemo({ headers: requestHeaders, onSelesai: () => loadStudents(account).catch(() => {}) })
    : null;

  const heroBtn = heroBanner.querySelector('#btn-hero-action');
  if (heroBtn) {
    heroBtn.addEventListener('click', () => {
      // Musyrif: pintasan ke halaman pencatatan. Perkembangan per santri sudah di beranda.
      if (isSupervisor) {
        window.location.href = 'monitoring';
        return;
      }
      if (students.length > 0) {
        loadDashboard(students[0].id, account, () => renderExecutiveDashboard(null, account)).catch((err) => {
          alert(err.message || 'Dashboard belum dapat dimuat.');
        });
      }
    });
  }

  // Wali: beranda wali (beranda-wali.js) menggantikan daftar kartu ananda.
  // Laporan singkat, diagram, dan laporan kegiatan per ananda; tombol di laporan membuka rekam
  // jejak lengkap.
  let berandaWali = null;
  if (pakaiBerandaWali) {
    berandaWali = document.createElement('div');
    berandaWali.className = 'beranda-keluarga';
    window.HamasahBerandaWali.render(berandaWali, {
      students: studentPage.items,
      headers: requestHeaders(),
      onOpenStudent: bukaSantri
    }).catch(() => {
      paintStudents();
      berandaWali.replaceChildren(panelsContainer);
    });
  }
  // Musyrif: perkembangan santri binaan (beranda-musyrif.js) menggantikan daftar nama.
  // Bila ringkasannya gagal dimuat, daftar santri biasa yang tampil.
  let berandaMusyrif = null;
  if (isSupervisor && window.HamasahBerandaMusyrif) {
    berandaMusyrif = document.createElement('div');
    berandaMusyrif.className = 'beranda-keluarga';
    window.HamasahBerandaMusyrif.render(berandaMusyrif, {
      headers: requestHeaders(),
      onOpenSantri: (santri) => bukaSantriMusyrif(santri, account)
    }).catch(() => {
      paintStudents();
      berandaMusyrif.replaceChildren(subtabsRow, panelsContainer);
    });
  }
  const berandaPeran = berandaWali || berandaMusyrif;
  // Catatan pembinaan harian (kehadiran, sholat, hafalan, kesehatan, tagihan). Paspor dan
  // iqamah sudah ditangani Monitoring pusat, jadi tidak diulang di sini.
  const catatanPembinaanLipat = (data) => {
    const sisa = data.alerts.filter((alert) => !['visa', 'paspor'].includes(alert.kind));
    const lipat = document.createElement('details');
    lipat.className = 'admin-fold';
    const judul = document.createElement('summary');
    judul.textContent = `Catatan pembinaan harian (${sisa.length})`;
    lipat.append(judul, window.HamasahAdminOverview.perhatian(data, { onOpenStudent: bukaSantri, judul: 'Catatan pembinaan harian', kecuali: ['visa', 'paspor'], id: 'admin-catatan' }));
    return lipat;
  };
  mainCol.append(
    heroBanner,
    // Admin: Monitoring pusat paling atas (angka hari ini, absensi, urusan administrasi santri).
    // Kartu angka lama di bawahnya tinggal yang belum dicakup monitoring (asrama, kehadiran,
    // tagihan), dan catatan pembinaan harian dilipat supaya tidak tampil sebagai daftar kedua.
    ...(ringkasan && window.HamasahMonitoringPusat ? [window.HamasahMonitoringPusat.render({ headers: requestHeaders, onOpenStudent: bukaSantri })] : []),
    ...(ringkasan ? [window.HamasahAdminOverview.kpi(ringkasan, { tanpaMonitoring: Boolean(window.HamasahMonitoringPusat) })] : []),
    // Super admin: pendaftaran, belajar, dan keuangan di layar yang sama (beranda-admin.js).
    ...(isAdmin && window.HamasahBerandaAdmin ? [window.HamasahBerandaAdmin.operasional(requestHeaders())] : []),
    ...(ringkasan && window.HamasahMonitoringPusat
      ? [catatanPembinaanLipat(ringkasan)]
      : ringkasan ? [window.HamasahAdminOverview.perhatian(ringkasan, { onOpenStudent: bukaSantri })] : []),
    ...(isSupervisor ? [kartuTugasMusyrif()] : []),
    ...(isSupervisor && window.HamasahUrusanSantri ? [window.HamasahUrusanSantri.render({ headers: requestHeaders })] : []),
    ...(berandaPeran ? [berandaPeran] : [subtabsRow, panelsContainer]),
    ...(kartuDemo ? [kartuDemo] : [])
  );
  coursueLayout.classList.add('coursue-layout--tunggal');
  coursueLayout.append(mainCol);
  coursueLayout.classList.add('crm-view-enter');

  studentDashboard.append(coursueLayout);
  studentDashboard.hidden = false;
}

// Musyrif: halaman laporan satu santri (beranda-musyrif.js) dengan foto, formulir cepat,
// cerita AI, dan daftar laporan yang bisa dikoreksi. "Lihat seperti wali" membuka rekam
// jejak lengkap.
function bukaSantriMusyrif(santri, account) {
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;
  const layout = document.createElement('div');
  layout.className = 'coursue-layout coursue-layout--tunggal crm-view-enter';
  const mainCol = document.createElement('div');
  mainCol.className = 'coursue-main-col';
  const isi = document.createElement('div');
  mainCol.append(isi);
  layout.append(mainCol);
  studentDashboard.append(layout);
  studentDashboard.hidden = false;
  window.scrollTo(0, 0);
  window.HamasahBerandaMusyrif.santri(isi, {
    student: santri,
    headers: requestHeaders(),
    onBack: () => renderExecutiveDashboard(null, account),
    onOpenFull: () => loadDashboard(santri.id, account, () => bukaSantriMusyrif(santri, account)).catch((err) => {
      alert(err.message || 'Rekam jejak belum dapat dimuat.');
    })
  }).catch((err) => {
    isi.textContent = err.message || 'Laporan santri belum dapat dimuat.';
  });
}

// Beranda santri: sapaan, lalu kelas online, perkembangan diri, izin, dan kegiatan
// terbaru dari beranda-keluarga.js.
function renderBerandaSantri(student, account) {
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;
  try { if (window.location.hash) history.replaceState(null, '', window.location.pathname); } catch {}

  const layout = document.createElement('div');
  layout.className = 'coursue-layout coursue-layout--tunggal crm-view-enter';
  const mainCol = document.createElement('div');
  mainCol.className = 'coursue-main-col snt-home';

  const hero = document.createElement('div');
  hero.className = 'coursue-hero-banner';
  const tag = document.createElement('div');
  tag.className = 'coursue-hero-tag';
  tag.textContent = 'Beranda santri';
  const judul = document.createElement('h2');
  judul.className = 'coursue-hero-title';
  judul.textContent = `Assalamu'alaikum, ${namaSapaan(account) || student.name}`;
  const sub = document.createElement('p');
  sub.className = 'coursue-hero-subtitle';
  sub.textContent = [student.program, student.dormitoryName].filter(Boolean).join(' · ') || 'Semangat belajar hari ini.';
  hero.append(tag, judul, sub);
  hiasKepala(hero, account);

  const isi = document.createElement('div');
  isi.className = 'beranda-keluarga';
  const bukaLengkap = () => {
    loadDashboard(student.id, account, () => renderBerandaSantri(student, account)).catch((err) => {
      alert(err.message || 'Rekam jejak belum dapat dimuat.');
    });
  };
  // Beranda santri baru (beranda-santri.js); beranda keluarga lama sebagai cadangan.
  if (window.HamasahBerandaSantri) {
    window.HamasahBerandaSantri.render(isi, { student, headers: requestHeaders(), onOpenFull: bukaLengkap }).catch(() => {
      if (window.HamasahBerandaKeluarga) window.HamasahBerandaKeluarga.santri(isi, { student, headers: requestHeaders(), onOpenFull: bukaLengkap }).catch(() => bukaLengkap());
      else bukaLengkap();
    });
  } else if (window.HamasahBerandaKeluarga) {
    window.HamasahBerandaKeluarga.santri(isi, { student, headers: requestHeaders(), onOpenFull: bukaLengkap }).catch(() => bukaLengkap());
  } else {
    bukaLengkap();
    return;
  }

  mainCol.append(hero, isi);
  layout.append(mainCol);
  studentDashboard.append(layout);
  studentDashboard.hidden = false;
}

// Nama depan untuk sapaan. Gelar di depan (Ust., Ustzh., H., Dr., dst.) ikut disebut
// bersama nama depannya, supaya tidak menjadi "Assalamu'alaikum, Ust.".
function sapaanMusyrif(account) {
  const name = String(account && account.name || '').trim();
  const perempuan = /^(ustadzah|ustazah|ustzh|ustzhh|musyrifah)\b/i.test(name);
  const tanpaGelar = name.replace(/^(?:ustadzah|ustazah|ustzhh?|ustadz|ustaz|ustad|ust|musyrifah)\.?\s*/i, '').trim();
  const nama = namaSapaan({ name: tanpaGelar });
  return `${perempuan ? 'Ustadzah' : 'Ustadz'}${nama ? ` ${nama}` : ''}`;
}

function namaSapaan(account) {
  const kataNama = account && account.name ? account.name.trim().split(/\s+/) : [];
  const GELAR = /^(ust|ustz|ustzh|ustadz|ustadzah|ustaz|ustazah|kh|h|hj|dr|drs|prof|ir)\.?$/i;
  return kataNama.length > 1 && GELAR.test(kataNama[0]) ? `${kataNama[0]} ${kataNama[1]}` : (kataNama[0] || '');
}

// Kartu sapaan di kolom kanan beranda: salam, peran, dan pintasan kerja per peran.
// Pintasan kerja per peran. Urutannya sama dengan menu samping (nav.js). Tampil sebagai
// deretan tautan di kepala halaman beranda.
const PINTASAN_PERAN = {
  admin: [
    ['staff', 'Pendaftaran calon santri'],
    ['monitoring', 'Monitoring santri & asrama'],
    ['lms', 'LMS: maddah dan materi'],
    ['operations', 'Keuangan, visa, dan inventaris'],
    ['akun', 'Kelola akun'],
    ['audit', 'Jejak audit'],
    ['pengaturan', 'Pengaturan aplikasi']
  ],
  'registration-officer': [
    ['staff', 'Pendaftaran calon santri'],
    ['staff#tambah-manual', 'Tambah pendaftar manual'],
    ['staff#agenda', 'Agenda tindak lanjut'],
    ['staff#pesan-konsultasi', 'Pesan konsultasi']
  ],
  supervisor: [
    ['asrama', 'Kelola asrama'],
    ['monitoring#presensi', 'Presensi asrama (sholat dan kegiatan)'],
    ['monitoring', 'Catat pembinaan per santri'],
    ['monitoring#izin', 'Izin santri'],
    ['monitoring#izin-pulang', 'Izin pulang ke Indonesia'],
    ['monitoring#pesan-wali', 'Pesan wali'],
    ['monitoring#tindak-lanjut', 'Tindak lanjut pembinaan'],
    ['monitoring#kepulangan', 'Kepulangan izin'],
    ['lms', 'Progres maddah santri']
  ],
  teacher: [
    ['lms', 'Kelola maddah dan materi'],
    ['lms#kelola=kiriman', 'Nilai kiriman tugas'],
    ['lms#kelola=progres', 'Progres dan pendaftaran santri']
  ],
  finance: [
    ['operations', 'Terbitkan tagihan dan kuitansi'],
    ['operations#menunggak', 'Tagihan menunggak'],
    ['operations#tunggakan', 'Tunggakan per santri'],
    ['operations#visa', 'Visa dan paspor']
  ],
  student: [['lms', 'Buka ruang belajar']]
};

// Tanggal hari ini dalam Masehi dan Hijriah (kalender Umm al-Qura), zona Kairo.
const TANGGAL_MASEHI = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' });
let TANGGAL_HIJRIAH = null;
try {
  TANGGAL_HIJRIAH = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' });
} catch {
  TANGGAL_HIJRIAH = null;
}

function teksTanggalHariIni() {
  const sekarang = new Date();
  const masehi = TANGGAL_MASEHI.format(sekarang);
  let hijriah = '';
  try { hijriah = TANGGAL_HIJRIAH ? TANGGAL_HIJRIAH.format(sekarang) : ''; } catch { hijriah = ''; }
  return hijriah ? `${masehi} · ${hijriah}` : masehi;
}

// Kepala halaman beranda (tema 2026): tanggal di atas judul dan pintasan kerja di bawahnya.
function hiasKepala(hero, account) {
  const tanggal = document.createElement('p');
  tanggal.className = 'k26-date';
  tanggal.textContent = teksTanggalHariIni();
  const tag = hero.querySelector('.coursue-hero-tag');
  if (tag) tag.after(tanggal);
  else hero.prepend(tanggal);
  const tautan = PINTASAN_PERAN[account && account.role] || [];
  if (tautan.length) {
    const nav = document.createElement('nav');
    nav.className = 'k26-shortcuts';
    nav.setAttribute('aria-label', 'Pintasan kerja');
    tautan.forEach(([href, label]) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      nav.append(link);
    });
    hero.append(nav);
  }
  hero.classList.add('k26-hero');
  return hero;
}

// Beranda peran yang tidak memegang daftar santri: banner, kartu kerja (guru: tugas
// mengajar), dan kartu sapaan. Keuangan dan petugas pendaftaran langsung diarahkan ke
// halaman kerjanya lewat tombol banner dan pintasan.
const BERANDA_PERAN = {
  teacher: { tag: 'RUANG ASATIDZ', judul: 'Konsol pengajar', sub: 'Maddah yang Anda ampu, kiriman tugas, dan progres santri.', cta: 'Buka maddah saya', href: 'lms' },
  finance: { tag: 'KONSOL KEUANGAN', judul: 'Konsol keuangan', sub: 'Tagihan, pembayaran, dan kuitansi santri.', cta: 'Buka tagihan', href: 'operations' },
  'registration-officer': { tag: 'KONSOL PENDAFTARAN', judul: 'Konsol pendaftaran', sub: 'Calon santri, berkas, dan pesan konsultasi.', cta: 'Buka pendaftaran', href: 'staff' }
};

function renderBerandaPeran(account) {
  const info = BERANDA_PERAN[account && account.role] || { tag: 'PORTAL HAMASAH', judul: 'Portal Hamasah', sub: '', cta: '', href: '' };
  studentDashboard.replaceChildren();
  if (studentList) studentList.hidden = true;
  if (studentsStatus) studentsStatus.hidden = true;

  const layout = document.createElement('div');
  layout.className = 'coursue-layout crm-view-enter';
  const mainCol = document.createElement('div');
  mainCol.className = 'coursue-main-col';

  const hero = document.createElement('div');
  hero.className = 'coursue-hero-banner';
  const tag = document.createElement('div');
  tag.className = 'coursue-hero-tag';
  tag.textContent = info.tag;
  const judul = document.createElement('h2');
  judul.className = 'coursue-hero-title';
  judul.textContent = info.judul;
  const sub = document.createElement('p');
  sub.className = 'coursue-hero-subtitle';
  sub.textContent = info.sub;
  hero.append(tag, judul, sub);
  if (info.href) {
    const cta = document.createElement('a');
    cta.className = 'coursue-hero-cta';
    cta.href = info.href;
    cta.innerHTML = `<span>${escapeHtml(info.cta)}</span><span class="coursue-hero-cta-arrow"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>`;
    hero.append(cta);
  }
  mainCol.append(hero);
  if (account && account.role === 'teacher') mainCol.append(kartuTugasGuru(sub));
  if (account && account.role === 'finance') mainCol.append(kartuTugasKeuangan(sub));
  if (account && account.role === 'registration-officer') mainCol.append(kartuTugasPendaftaran(sub));

  hiasKepala(hero, account);
  layout.classList.add('coursue-layout--tunggal');
  layout.append(mainCol);
  studentDashboard.append(layout);
  studentDashboard.hidden = false;

  if (window.location.hash === '#perhatian') {
    const daftar = document.querySelector('#tugas-guru, #tugas-keuangan, #tugas-pendaftaran');
    if (daftar) daftar.scrollIntoView({ block: 'start' });
    try { history.replaceState(null, '', window.location.pathname); } catch {}
  }
}

// Kartu "Tugas mengajar" di beranda guru: kiriman yang menunggu dinilai dan maddah yang
// belum punya santri. GET /api/lms/ringkasan-guru. Angka lonceng dan subjudul banner ikut
// diperbarui.
function kartuTugasGuru(subjudul) {
  const wadah = document.createElement('section');
  wadah.className = 'admin-alerts musyrif-tasks';
  wadah.id = 'tugas-guru';
  wadah.tabIndex = -1;
  const kepala = document.createElement('div');
  kepala.className = 'admin-section-head';
  const judul = document.createElement('h3');
  judul.className = 'admin-section-title';
  judul.textContent = 'Tugas mengajar';
  kepala.append(judul);
  const memuat = document.createElement('p');
  memuat.className = 'admin-empty';
  memuat.textContent = 'Memuat...';
  wadah.append(kepala, memuat);

  function tugas(teks, href, tautan, jenis) {
    const item = document.createElement('li');
    item.className = `musyrif-task is-${jenis}`;
    const isi = document.createElement('span');
    isi.textContent = teks;
    item.append(isi);
    if (href) {
      const a = document.createElement('a');
      a.className = 'admin-link';
      a.href = href;
      a.textContent = tautan;
      item.append(a);
    }
    return item;
  }

  fetch('/api/lms/ringkasan-guru', { headers: requestHeaders() })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Tugas mengajar belum dapat dimuat.'))))
    .then((data) => {
      const { courses, totals } = data;
      if (subjudul) {
        subjudul.textContent = courses.length
          ? `${totals.courses} maddah diampu, ${totals.students} santri terdaftar, ${totals.pending} kiriman menunggu dinilai.`
          : 'Belum ada maddah yang Anda ampu.';
      }
      const daftar = document.createElement('ul');
      daftar.className = 'musyrif-task-list';
      const butir = [];
      if (!courses.length) {
        butir.push(tugas('Belum ada maddah yang Anda ampu. Buat maddah baru atau minta admin menugaskan Anda.', 'lms', 'Buat maddah', 'info'));
      }
      courses.filter((course) => course.pending).forEach((course) => {
        butir.push(tugas(`${course.title}: ${course.pending} kiriman menunggu dinilai`, `lms#kelola=kiriman&maddah=${encodeURIComponent(course.id)}`, 'Nilai', 'perlu'));
      });
      courses.filter((course) => !course.students).forEach((course) => {
        butir.push(tugas(`${course.title}: belum ada santri terdaftar`, `lms#kelola=progres&maddah=${encodeURIComponent(course.id)}`, 'Daftarkan', 'perlu'));
      });
      courses.filter((course) => !course.materials).forEach((course) => {
        butir.push(tugas(`${course.title}: belum ada materi aktif`, 'lms', 'Tambah materi', 'perlu'));
      });
      if (courses.length && !butir.length) {
        butir.push(tugas('Semua kiriman tugas sudah dinilai.', null, '', 'selesai'));
      }
      courses.forEach((course) => {
        butir.push(tugas(`${course.title}: ${course.materials} materi, ${course.students} santri`, `lms#kelola=progres&maddah=${encodeURIComponent(course.id)}`, 'Progres', 'info'));
      });
      daftar.append(...butir);
      memuat.replaceWith(daftar);
      isiAngkaIkon('#topbar-attention-count', totals.pending);
      const lonceng = document.querySelector('#topbar-attention');
      if (lonceng) lonceng.setAttribute('aria-label', totals.pending ? `Tugas mengajar, ${totals.pending} kiriman menunggu dinilai` : 'Tugas mengajar');
    })
    .catch((error) => { memuat.textContent = error.message; });
  return wadah;
}

// Beranda keuangan: angka utama (GET /api/operations/ringkasan) dan daftar yang perlu
// ditindaklanjuti. Angka lonceng = tagihan menunggak + visa/paspor yang habis atau segera habis.
function kartuTugasKeuangan(subjudul) {
  const wadah = document.createElement('section');
  wadah.className = 'admin-alerts musyrif-tasks';
  wadah.id = 'tugas-keuangan';
  wadah.tabIndex = -1;
  const kepala = document.createElement('div');
  kepala.className = 'admin-section-head';
  const judul = document.createElement('h3');
  judul.className = 'admin-section-title';
  judul.textContent = 'Perlu ditindaklanjuti';
  kepala.append(judul);
  const memuat = document.createElement('p');
  memuat.className = 'admin-empty';
  memuat.textContent = 'Memuat...';
  const angka = document.createElement('div');
  angka.className = 'admin-kpi-grid finance-home-kpis';
  wadah.append(kepala, memuat);

  const rp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  // Angka besar di kartu diringkas (Rp48,5 jt); nilai lengkap ada di catatan kartu.
  const rpRingkas = (n) => `Rp${new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;
  function kartu(label, nilai, catatan, href, nada) {
    const a = document.createElement('a');
    a.className = `admin-kpi${nada ? ` admin-kpi--${nada}` : ''}`;
    a.href = href;
    const l = document.createElement('p');
    l.className = 'admin-kpi__label';
    l.textContent = label;
    const v = document.createElement('p');
    v.className = 'admin-kpi__value';
    v.textContent = nilai;
    const c = document.createElement('p');
    c.className = 'admin-kpi__note';
    c.textContent = catatan;
    a.append(l, v, c);
    return a;
  }
  function tugas(teks, href, tautan, jenis) {
    const item = document.createElement('li');
    item.className = `musyrif-task is-${jenis}`;
    const isi = document.createElement('span');
    isi.textContent = teks;
    item.append(isi);
    if (href) {
      const a = document.createElement('a');
      a.className = 'admin-link';
      a.href = href;
      a.textContent = tautan;
      item.append(a);
    }
    return item;
  }

  fetch('/api/operations/ringkasan', { headers: requestHeaders() })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Ringkasan keuangan belum dapat dimuat.'))))
    .then((r) => {
      const namaBulan = new Intl.DateTimeFormat('id-ID', { month: 'long', timeZone: 'UTC' }).format(new Date(`${r.month}-01T00:00:00Z`));
      if (subjudul) subjudul.textContent = `Tunggakan ${rp(r.outstanding.total)} dari ${r.outstanding.count} tagihan. Terkumpul ${namaBulan}: ${rp(r.collectedThisMonth.total)}.`;
      angka.append(
        kartu('Tunggakan', rpRingkas(r.outstanding.total), `${r.outstanding.count} tagihan, ${rp(r.outstanding.total)}`, 'operations#belum-dibayar', r.outstanding.count ? 'warn' : ''),
        kartu(`Terkumpul ${namaBulan}`, rpRingkas(r.collectedThisMonth.total), `${r.collectedThisMonth.count} pembayaran, ${rp(r.collectedThisMonth.total)}`, 'operations', ''),
        kartu(`Terbit ${namaBulan}`, rpRingkas(r.issuedThisMonth.total), `${r.issuedThisMonth.count} tagihan, ${rp(r.issuedThisMonth.total)}`, 'operations', '')
      );
      const daftar = document.createElement('ul');
      daftar.className = 'musyrif-task-list';
      const butir = [];
      if (r.overdue.count) butir.push(tugas(`${r.overdue.count} tagihan belum dibayar lebih dari ${r.overdueDays} hari (${rp(r.overdue.total)})`, 'operations#menunggak', 'Tagih', 'perlu'));
      if (r.visa.expired) butir.push(tugas(`${r.visa.expired} visa atau paspor sudah lewat masa berlaku`, 'operations#visa', 'Periksa', 'perlu'));
      if (r.visa.expiring) butir.push(tugas(`${r.visa.expiring} visa atau paspor habis dalam 30 hari`, 'operations#visa', 'Periksa', 'perlu'));
      if (!butir.length) butir.push(tugas('Tidak ada tunggakan lama dan tidak ada visa yang segera habis.', null, '', 'selesai'));
      daftar.append(...butir);
      memuat.replaceWith(angka, daftar);
      const jumlah = r.overdue.count + r.visa.expired + r.visa.expiring;
      isiAngkaIkon('#topbar-attention-count', jumlah);
      const lonceng = document.querySelector('#topbar-attention');
      if (lonceng) lonceng.setAttribute('aria-label', jumlah ? `Perlu ditindaklanjuti, ${jumlah} hal` : 'Perlu ditindaklanjuti');
    })
    .catch((error) => { memuat.textContent = error.message; });
  return wadah;
}

// Beranda petugas pendaftaran: jumlah per tahap (GET /api/registrations/ringkasan) dan
// daftar yang perlu ditindaklanjuti. Angka lonceng = tindak lanjut lewat tenggat +
// pendaftar baru yang belum disentuh.
function kartuTugasPendaftaran(subjudul) {
  const wadah = document.createElement('section');
  wadah.className = 'admin-alerts musyrif-tasks';
  wadah.id = 'tugas-pendaftaran';
  wadah.tabIndex = -1;
  const kepala = document.createElement('div');
  kepala.className = 'admin-section-head';
  const judul = document.createElement('h3');
  judul.className = 'admin-section-title';
  judul.textContent = 'Perlu ditindaklanjuti';
  kepala.append(judul);
  const memuat = document.createElement('p');
  memuat.className = 'admin-empty';
  memuat.textContent = 'Memuat...';
  wadah.append(kepala, memuat);

  const TAHAP = [
    ['submitted', 'Data baru masuk'],
    ['document-review', 'Pemeriksaan berkas'],
    ['needs-revision', 'Perlu perbaikan'],
    ['academic-preparation', 'Persiapan akademik'],
    ['ready-for-departure', 'Siap berangkat']
  ];
  function kartu(label, nilai, href, nada) {
    const a = document.createElement('a');
    a.className = `admin-kpi${nada ? ` admin-kpi--${nada}` : ''}`;
    a.href = href;
    const l = document.createElement('p');
    l.className = 'admin-kpi__label';
    l.textContent = label;
    const v = document.createElement('p');
    v.className = 'admin-kpi__value';
    v.textContent = String(nilai);
    a.append(l, v);
    return a;
  }
  function tugas(teks, href, tautan, jenis) {
    const item = document.createElement('li');
    item.className = `musyrif-task is-${jenis}`;
    const isi = document.createElement('span');
    isi.textContent = teks;
    item.append(isi);
    if (href) {
      const a = document.createElement('a');
      a.className = 'admin-link';
      a.href = href;
      a.textContent = tautan;
      item.append(a);
    }
    return item;
  }

  fetch('/api/registrations/ringkasan', { headers: requestHeaders() })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Ringkasan pendaftaran belum dapat dimuat.'))))
    .then((r) => {
      const per = r.byStatus || {};
      const berjalan = TAHAP.reduce((sum, [status]) => sum + (per[status] || 0), 0);
      if (subjudul) subjudul.textContent = `${berjalan} pendaftaran sedang berjalan, ${per.submitted || 0} di antaranya data baru masuk.`;
      const angka = document.createElement('div');
      angka.className = 'admin-kpi-grid finance-home-kpis registration-home-kpis';
      TAHAP.forEach(([status, label]) => angka.append(kartu(label, per[status] || 0, 'staff', status === 'needs-revision' && per[status] ? 'warn' : '')));
      const daftar = document.createElement('ul');
      daftar.className = 'musyrif-task-list';
      const butir = [];
      if (r.stale) butir.push(tugas(`${r.stale} pendaftar baru belum disentuh lebih dari ${r.staleDays || 3} hari`, 'staff#baru-tertunda', 'Periksa', 'perlu'));
      if (r.overdueSteps) butir.push(tugas(`${r.overdueSteps} tindak lanjut lewat tenggat (${r.overdueRegistrations} pendaftar)`, 'staff#agenda', 'Buka agenda', 'perlu'));
      if (r.pendingDocuments) butir.push(tugas(`${r.pendingDocuments} berkas menunggu review (${r.pendingDocumentRegistrations} pendaftar)`, 'staff#berkas-menunggu', 'Review', 'perlu'));
      if (r.newInquiries) butir.push(tugas(`${r.newInquiries} pesan konsultasi baru`, 'staff#pesan-konsultasi', 'Balas', 'perlu'));
      if (!butir.length) butir.push(tugas('Tidak ada pendaftar tertunda, tindak lanjut lewat tenggat, atau berkas yang menunggu.', null, '', 'selesai'));
      daftar.append(...butir);
      memuat.replaceWith(angka, daftar);
      const jumlah = (r.stale || 0) + (r.overdueSteps || 0);
      isiAngkaIkon('#topbar-attention-count', jumlah);
      const lonceng = document.querySelector('#topbar-attention');
      if (lonceng) lonceng.setAttribute('aria-label', jumlah ? `Perlu ditindaklanjuti, ${jumlah} hal` : 'Perlu ditindaklanjuti');
    })
    .catch((error) => { memuat.textContent = error.message; });
  return wadah;
}

async function loadDashboard(studentId, account, onBack, range = {}) {
  const params = new URLSearchParams(); if (range.from) params.set('from', range.from); if (range.to) params.set('to', range.to);
  const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/dashboard${params.toString() ? `?${params}` : ''}`, { headers: requestHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Dashboard belum dapat dimuat.');

  // Update URL hash for deep linking
  try {
    if (window.location.hash !== `#student=${studentId}`) {
      history.replaceState(null, '', `#student=${studentId}`);
    }
  } catch {}

  const wrappedOnBack = onBack ? () => {
    try {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
      }
    } catch {}
    onBack();
  } : null;

  // Ringkasan ibadah dan kesehatan: periode yang sama bila rentangnya <= 92 hari, selain itu
  // 30 hari terakhir. Gagal dimuat tidak menggagalkan dashboard (tab sholat kembali ke data lama).
  let care = null;
  try {
    const careParams = new URLSearchParams();
    const span = range.from && range.to ? (new Date(range.to) - new Date(range.from)) / 86400000 : null;
    if (span !== null && span >= 0 && span <= 92) { careParams.set('from', range.from); careParams.set('to', range.to); }
    else if (range.to) careParams.set('to', range.to);
    const careResponse = await fetch('/api/students/' + encodeURIComponent(studentId) + '/care' + (careParams.toString() ? '?' + careParams : ''), { headers: requestHeaders() });
    if (careResponse.ok) care = (await careResponse.json()).care;
  } catch { care = null; }

  renderCrmDashboard(result.dashboard, account || currentAccount, wrappedOnBack, care);
}

function renderStudents(students, account) {
  studentList.replaceChildren();
  studentDashboard.hidden = true;

  if (!students.length) {
    const empty = document.createElement('div');
    empty.className = 'crm-white-card portal-student-empty';
    empty.textContent = 'Belum ada santri yang terhubung dengan akun ini.';
    studentList.append(empty);
    studentList.hidden = false;
    return;
  }

  if (account && (account.role === 'student' || (account.role === 'parent' && students.length === 1))) {
    studentList.hidden = true;
    return;
  }
}


// Peran yang tidak membaca daftar santri. /api/me mengirim daftar izin; bila tidak ada,
// peran-peran ini yang dipakai sebagai cadangan.
const PERAN_TANPA_DAFTAR_SANTRI = ['teacher', 'finance', 'registration-officer'];
let izinAkun = null;
function bolehMembacaSantri(account) {
  if (Array.isArray(izinAkun)) return izinAkun.includes('students.read');
  return !PERAN_TANPA_DAFTAR_SANTRI.includes(account && account.role);
}

async function loadStudents(account) {
  if (!bolehMembacaSantri(account)) {
    renderBerandaPeran(account);
    return;
  }
  // Status ini sebelumnya selalu tersembunyi, sehingga pesan memuat tidak pernah
  // terlihat. Sekarang ditampilkan selama permintaan berjalan lalu disembunyikan lagi.
  studentsStatus.classList.remove('is-error');
  studentsStatus.textContent = 'Memuat data santri...';
  studentsStatus.hidden = false;

  let response;
  let result;
  try {
    response = await fetch('/api/my-students', { headers: requestHeaders() });
    result = await response.json();
  } catch (error) {
    studentsStatus.textContent = 'Data santri belum dapat dimuat. Periksa koneksi lalu muat ulang.';
    studentsStatus.classList.add('is-error');
    throw error;
  }
  if (!response.ok) {
    studentsStatus.textContent = result.error || 'Data santri belum dapat dimuat.';
    studentsStatus.classList.add('is-error');
    throw new Error(result.error || 'Data santri belum dapat dimuat.');
  }
  studentsStatus.hidden = true;
  studentsStatus.textContent = '';

  const students = result.items || [];
  const allTotal = typeof result.total === 'number' ? result.total : students.length;
  studentPage = { items: students, total: allTotal, allTotal, search: '' };

  const urlParams = new URLSearchParams(window.location.search);
  const targetStudentId = urlParams.get('studentId') || (window.location.hash.startsWith('#student=') ? window.location.hash.replace('#student=', '') : null);

  if (account && account.role === 'student') {
    // Santri: beranda santri (kelas online, perkembangan, izin). Rekam jejak lengkap
    // dibuka dari tombol di beranda, atau langsung bila datang lewat tautan #student=.
    if (!students.length) {
      renderStudents([], account);
    } else if (targetStudentId) {
      await loadDashboard(students[0].id, account, () => renderBerandaSantri(students[0], account));
    } else {
      renderBerandaSantri(students[0], account);
    }
  } else {
    if (account && account.role === 'admin') {
      // Ringkasan santri, asrama, dan musyrif. Bila gagal, dashboard tetap tampil dengan
      // daftar santri biasa. Akun dikelola di halaman sendiri (akun).
      try {
        adminOverview = window.HamasahAdminOverview ? await window.HamasahAdminOverview.muat(requestHeaders()) : null;
      } catch {
        adminOverview = null;
      }
      perbaruiAngkaPerhatian();
    }

    // Santri yang dituju lewat tautan belum tentu ada di halaman pertama. Server yang
    // menentukan boleh atau tidaknya; bila ditolak, konsol biasa yang ditampilkan.
    let opened = false;
    if (targetStudentId) {
      try {
        await loadDashboard(targetStudentId, account, () => {
          try {
            if (window.location.hash) history.replaceState(null, '', window.location.pathname);
          } catch {}
          renderExecutiveDashboard(null, account);
        });
        opened = true;
      } catch {
        opened = false;
      }
    }
    if (!opened) {
      renderExecutiveDashboard(null, account);
      // Datang dari lonceng saat sedang membuka detail santri.
      if (window.location.hash === '#perhatian') {
        const daftar = document.querySelector('#admin-perhatian, #tugas-musyrif');
        if (daftar) daftar.scrollIntoView({ block: 'start' });
        try { history.replaceState(null, '', window.location.pathname); } catch {}
      }
    }
  }
}



async function showPortal() {
  const me = await window.hamasahMintaAkun(requestHeaders());
  const result = me.body;
  if (!me.ok) throw new Error(result.error || 'Sesi sudah berakhir.');

  currentAccount = result.account;
  izinAkun = Array.isArray(result.permissions) ? result.permissions : null;
  document.body.classList.add('in-crm');
  // Atribut hidden sudah cukup: staff.css memberi `[hidden] { display: none !important }`.
  // Menulis style.display lagi hanya menambah atribut style di DOM tanpa efek tambahan.
  if (publicHeader) publicHeader.hidden = true;
  if (portalLogin) portalLogin.hidden = true;
  portalConsole.hidden = false;
  portalLogout.hidden = false;

  // Nama dan peran ditampilkan oleh shell CRM lewat renderStaffNav/updateCrmUserBadges,
  // jadi tidak ada heading sapaan terpisah di kanvas.
  renderStaffNav(staffNav, result.account.role, 'portal', result.account);
  // Judul tab mengikuti nama menu peran ini (nav.js): Portal Utama, Pantau Ananda, dst.
  const namaHalaman = (ROLE_NAV_LABELS[result.account.role] || {}).portal;
  if (namaHalaman) document.title = `${namaHalaman} | Hamasah International`;
  siapkanIkonTopbar(result.account);
  if (!dataSegarTerpasang) {
    dataSegarTerpasang = true;
    window.hamasahSaatDataSegar(() => loadStudents(currentAccount).catch(() => {}));
  }
  await loadStudents(result.account).catch(() => {});
}

let dataSegarTerpasang = false;

// Ikon di topbar. Surat: pesan konsultasi baru dari formulir kontak (admin dan petugas
// pendaftaran), membuka tab Pesan konsultasi di staff. Lonceng: jumlah "Perlu
// perhatian" di dashboard admin, menggulir ke daftarnya.
function isiAngkaIkon(id, jumlah) {
  const badge = document.querySelector(id);
  if (!badge) return;
  badge.hidden = !(jumlah > 0);
  badge.textContent = jumlah > 99 ? '99+' : String(jumlah || '');
}

function siapkanIkonTopbar(account) {
  const role = account && account.role;
  const pesan = document.querySelector('#topbar-inquiries');
  const lonceng = document.querySelector('#topbar-attention');
  if (pesan && ['admin', 'registration-officer'].includes(role)) {
    pesan.hidden = false;
    fetch('/api/inquiries?status=new&page=1&pageSize=1', { headers: requestHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((hasil) => {
        if (!hasil) return;
        isiAngkaIkon('#topbar-inquiries-count', hasil.total);
        pesan.setAttribute('aria-label', hasil.total ? `Pesan konsultasi, ${hasil.total} baru` : 'Pesan konsultasi');
      })
      .catch(() => {});
  }
  if (lonceng && ['admin', 'supervisor', 'teacher', 'finance', 'registration-officer'].includes(role) && !lonceng.dataset.siap) {
    lonceng.dataset.siap = '1';
    lonceng.hidden = false;
    // Admin: daftar "Perlu perhatian". Musyrif: kartu "Tugas hari ini". Guru: "Tugas mengajar".
    lonceng.addEventListener('click', () => {
      const daftar = document.querySelector('#admin-perhatian, #tugas-musyrif, #tugas-guru, #tugas-keuangan, #tugas-pendaftaran');
      if (daftar) {
        // Fokus lebih dulu supaya tidak memotong animasi gulir.
        daftar.focus({ preventScroll: true });
        daftar.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // Sedang membuka detail santri: kembali ke dashboard lalu gulir ke daftarnya.
      if (window.location.search) {
        window.location.assign(`${window.location.pathname}#perhatian`);
      } else {
        window.location.hash = 'perhatian';
        window.location.reload();
      }
    });
  }
}

// Kartu "Tugas hari ini" di beranda musyrif: waktu sholat yang belum dicatat, izin
// menunggu, pesan wali belum dibaca, dan catatan kesehatan yang perlu perhatian.
// GET /api/presensi-asrama/hari-ini. Angka lonceng ikut diperbarui.
function kartuTugasMusyrif() {
  const wadah = document.createElement('section');
  wadah.className = 'admin-alerts musyrif-tasks';
  wadah.id = 'tugas-musyrif';
  wadah.tabIndex = -1;
  const kepala = document.createElement('div');
  kepala.className = 'admin-section-head';
  const judul = document.createElement('h3');
  judul.className = 'admin-section-title';
  judul.textContent = 'Tugas hari ini';
  kepala.append(judul);
  const daftar = document.createElement('ul');
  daftar.className = 'musyrif-task-list';
  const memuat = document.createElement('p');
  memuat.className = 'admin-empty';
  memuat.textContent = 'Memuat...';
  wadah.append(kepala, memuat);

  const NAMA_SHOLAT = { subuh: 'Subuh', dzuhur: 'Dzuhur', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya' };
  const KONDISI = { 'sakit-ringan': 'sakit ringan', 'perlu-perhatian': 'perlu perhatian', dirujuk: 'dirujuk ke dokter' };
  function tugas(teks, href, tautan, jenis) {
    const item = document.createElement('li');
    item.className = `musyrif-task is-${jenis}`;
    const isi = document.createElement('span');
    isi.textContent = teks;
    item.append(isi);
    if (href) {
      const a = document.createElement('a');
      a.className = 'admin-link';
      a.href = href;
      a.textContent = tautan;
      item.append(a);
    }
    return item;
  }

  fetch('/api/presensi-asrama/hari-ini', { headers: requestHeaders() })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Tugas hari ini belum dapat dimuat.'))))
    .then((data) => {
      const butir = [];
      if (!data.students) {
        butir.push(tugas('Anda belum memegang asrama. Hubungi admin untuk penugasan.', null, '', 'info'));
      } else if (data.sholatBelum.length) {
        // Satu baris untuk presensi sholat: chip per waktu (emas = belum lengkap, hijau =
        // sudah), dulu lima baris terpisah dengan kalimat yang sama.
        const belum = new Map(data.sholatBelum.map((item) => [item.prayer, item.belum]));
        const baris = tugas(`Presensi sholat hari ini: ${data.sholatBelum.length} dari 5 waktu belum lengkap untuk ${data.students} santri.`, `monitoring#presensi-${data.sholatBelum[0].prayer}`, 'Catat', 'perlu');
        baris.classList.add('musyrif-task--sholat');
        const chips = document.createElement('span');
        chips.className = 'musyrif-prayer-chips';
        Object.entries(NAMA_SHOLAT).forEach(([kunci, nama]) => {
          const sisa = belum.get(kunci);
          const chip = document.createElement(sisa ? 'a' : 'span');
          chip.className = `musyrif-prayer-chip ${sisa ? 'is-belum' : 'is-sudah'}`;
          chip.textContent = sisa ? `${nama} · ${sisa} belum` : `${nama} ✓`;
          if (sisa) {
            chip.href = `monitoring#presensi-${kunci}`;
            chip.setAttribute('aria-label', `Catat sholat ${nama}, ${sisa} santri belum dicatat`);
          } else {
            chip.setAttribute('aria-label', `Sholat ${nama} sudah dicatat`);
          }
          chips.append(chip);
        });
        baris.querySelector('span').after(chips);
        butir.push(baris);
      } else {
        butir.push(tugas(`Semua waktu sholat hari ini sudah dicatat untuk ${data.students} santri.`, null, '', 'selesai'));
      }
      if (data.izinMenunggu) butir.push(tugas(`${data.izinMenunggu} izin menunggu keputusan`, 'monitoring#izin', 'Putuskan', 'perlu'));
      if (data.pesanBelumDibaca) butir.push(tugas(`${data.pesanBelumDibaca} pesan wali belum dibaca`, 'monitoring#pesan-wali', 'Baca', 'perlu'));
      (data.kesehatan || []).forEach((item) => butir.push(tugas(`${item.name}: ${KONDISI[item.condition] || item.condition} (${formatTanggalPanjang(item.date)})`, null, '', 'perlu')));
      daftar.replaceChildren(...butir);
      memuat.replaceWith(daftar);
      const jumlah = (data.izinMenunggu || 0) + (data.pesanBelumDibaca || 0) + (data.kesehatan || []).length;
      isiAngkaIkon('#topbar-attention-count', jumlah);
      const lonceng = document.querySelector('#topbar-attention');
      if (lonceng) lonceng.setAttribute('aria-label', jumlah ? `Tugas hari ini, ${jumlah} perlu ditindaklanjuti` : 'Tugas hari ini');
    })
    .catch((error) => { memuat.textContent = error.message; });
  return wadah;
}

function perbaruiAngkaPerhatian() {
  const jumlah = adminOverview && Array.isArray(adminOverview.alerts) ? adminOverview.alerts.length : 0;
  isiAngkaIkon('#topbar-attention-count', jumlah);
  const lonceng = document.querySelector('#topbar-attention');
  if (lonceng) lonceng.setAttribute('aria-label', jumlah ? `Perlu perhatian, ${jumlah} hal` : 'Perlu perhatian');
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

portalLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: requestHeaders() }).catch(() => {});
  sessionStorage.removeItem('hamasahPortalSession');
  document.body.classList.remove('in-crm');
  window.location.reload();
});

// Pengisian cepat kredensial contoh sengaja tidak ada di sini. Berkas ini disajikan
// publik, jadi alamat akun dan kata sandi apa pun di dalamnya ikut terbaca siapa saja.
// Kredensial akun contoh dicetak ke terminal oleh `npm run dev`.

if (getSession()) {
  document.body.classList.add('in-crm');
  showPortal().catch((error) => {
    document.body.classList.remove('in-crm');
    sessionStorage.removeItem('hamasahPortalSession');
    setLoginError(error.message || 'Sesi sudah berakhir.');
  });
}
