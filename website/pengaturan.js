// Halaman Pengaturan super admin: saklar fitur dan pembaruan database.
// Endpoint: GET/PUT /api/admin/settings, POST /api/admin/settings/database
// (server/routes/settings.js). Hanya nilai yang berubah yang dikirim, supaya jejak audit
// mencatat yang memang diubah.
const guard = document.querySelector('#settings-guard');
const guardCopy = document.querySelector('#settings-guard-copy');
const consoleSection = document.querySelector('#settings-console');
const form = document.querySelector('#settings-form');
const saveButton = document.querySelector('#settings-save');
const resetButton = document.querySelector('#settings-reset');
const status = document.querySelector('#settings-status');
const lastChanged = document.querySelector('#settings-last');
const unavailable = document.querySelector('#settings-unavailable');
const dbSummary = document.querySelector('#database-summary');
const dbPending = document.querySelector('#database-pending');
const dbProblem = document.querySelector('#database-problem');
const dbApply = document.querySelector('#database-apply');
const dbStatus = document.querySelector('#database-status');
const staffNav = document.querySelector('#staff-nav');

const controls = [...form.querySelectorAll('[data-kunci]')];
let tersimpan = null;

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

function setStatus(node, text, error = false) {
  node.textContent = text;
  node.classList.toggle('is-error', error);
}

async function kirim(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Permintaan belum dapat diproses.');
    error.errors = result.errors || null;
    throw error;
  }
  return result;
}

function nilaiKontrol(control) {
  if (control.type === 'checkbox') return control.checked;
  if (control.type === 'number') return control.value.trim() === '' ? '' : Number(control.value);
  return control.value.replace(/\s+/g, ' ').trim();
}

function isiKontrol(control, nilai) {
  if (control.type === 'checkbox') control.checked = Boolean(nilai);
  else control.value = nilai === undefined || nilai === null ? '' : String(nilai);
}

function perubahan() {
  if (!tersimpan) return {};
  return Object.fromEntries(controls
    .map((control) => [control.dataset.kunci, nilaiKontrol(control)])
    .filter(([kunci, nilai]) => nilai !== tersimpan.nilai[kunci]));
}

function tandaiPerubahan() {
  const berubah = perubahan();
  controls.forEach((control) => {
    const baris = control.closest('.setting-row, .setting-field');
    if (baris) baris.classList.toggle('is-changed', control.dataset.kunci in berubah);
    control.removeAttribute('aria-invalid');
  });
  const ada = Object.keys(berubah).length > 0;
  saveButton.disabled = !ada || !tersimpan.tersedia;
  resetButton.disabled = !ada;
  if (ada && !status.classList.contains('is-error')) setStatus(status, `${Object.keys(berubah).length} perubahan belum disimpan.`);
  if (!ada && !status.classList.contains('is-error')) setStatus(status, '');
}

function renderPengaturan(data) {
  tersimpan = data;
  controls.forEach((control) => isiKontrol(control, data.nilai[control.dataset.kunci]));
  unavailable.hidden = data.tersedia;
  lastChanged.textContent = data.terakhir
    ? `Terakhir diubah ${waktu(data.terakhir.pada)}${data.terakhir.oleh ? ` oleh ${data.terakhir.oleh}` : ''}.`
    : 'Belum pernah diubah. Semua memakai nilai bawaan.';
  tandaiPerubahan();
}

function renderDatabase(db) {
  dbProblem.hidden = !db.masalah;
  dbProblem.textContent = db.masalah || '';
  const tertunda = db.tertunda || [];
  if (db.masalah) {
    dbSummary.textContent = 'Pembaruan dari halaman ini belum bisa dijalankan.';
  } else if (tertunda.length) {
    dbSummary.textContent = `${tertunda.length} pembaruan menunggu diterapkan (${db.diterapkan} dari ${db.total} sudah diterapkan).`;
  } else {
    dbSummary.textContent = `Database sudah terbaru. Semua ${db.total} pembaruan sudah diterapkan.`;
  }
  dbPending.hidden = !tertunda.length || Boolean(db.masalah);
  dbPending.replaceChildren(...tertunda.map((item) => {
    const li = document.createElement('li');
    li.textContent = item.berkas;
    return li;
  }));
  dbApply.hidden = !tertunda.length || Boolean(db.masalah);
}

async function muat() {
  const data = await kirim('GET', '/api/admin/settings');
  setStatus(status, '');
  renderPengaturan(data);
  renderDatabase(data.database);
}

function jalankan(pekerjaan, node = status) {
  return pekerjaan().catch((error) => setStatus(node, error.message || 'Pengaturan belum dapat dimuat.', true));
}

// Dua perubahan yang berdampak besar diminta konfirmasi dulu.
function konfirmasi(berubah) {
  if (berubah['pendaftaran.dibuka'] === false
    && !window.confirm('Tutup pendaftaran online? Pengunjung tidak bisa mengirim formulir sampai dibuka lagi.')) return false;
  if (berubah['kesehatan.aktif'] === true
    && !window.confirm('Nyalakan catatan kesehatan? Pastikan Kebijakan Privasi sudah memuat pengolahan data kesehatan santri.')) return false;
  return true;
}

form.addEventListener('input', () => {
  status.classList.remove('is-error');
  tandaiPerubahan();
});

resetButton.addEventListener('click', () => {
  if (!tersimpan) return;
  status.classList.remove('is-error');
  renderPengaturan(tersimpan);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const berubah = perubahan();
  if (!Object.keys(berubah).length || !konfirmasi(berubah)) return;
  saveButton.disabled = true;
  saveButton.textContent = 'Menyimpan...';
  setStatus(status, '');
  try {
    const hasil = await kirim('PUT', '/api/admin/settings', { nilai: berubah });
    renderPengaturan(hasil);
    setStatus(status, 'Pengaturan disimpan. Situs memakai nilai baru dalam beberapa detik.');
  } catch (error) {
    setStatus(status, error.message, true);
    Object.keys(error.errors || {}).forEach((kunci) => {
      const control = controls.find((item) => item.dataset.kunci === kunci);
      if (control) control.setAttribute('aria-invalid', 'true');
    });
    const salah = form.querySelector('[aria-invalid="true"]');
    if (salah) salah.focus();
    saveButton.disabled = false;
  } finally {
    saveButton.textContent = 'Simpan pengaturan';
  }
});

dbApply.addEventListener('click', async () => {
  const jumlah = dbPending.children.length;
  if (!window.confirm(`Terapkan ${jumlah} pembaruan database sekarang? Lakukan setelah aplikasi versi baru sudah berjalan. Proses ini tidak bisa dibatalkan dari halaman ini.`)) return;
  dbApply.disabled = true;
  dbApply.textContent = 'Menerapkan...';
  setStatus(dbStatus, '');
  try {
    const hasil = await kirim('POST', '/api/admin/settings/database');
    setStatus(dbStatus, hasil.diterapkan.length
      ? `${hasil.diterapkan.length} pembaruan diterapkan: ${hasil.diterapkan.join(', ')}.`
      : 'Tidak ada pembaruan yang perlu diterapkan.');
    await muat();
  } catch (error) {
    setStatus(dbStatus, error.message, true);
    jalankan(muat);
  } finally {
    dbApply.disabled = false;
    dbApply.textContent = 'Terapkan pembaruan database';
  }
});

document.querySelector('#reload-settings').addEventListener('click', () => {
  if (Object.keys(perubahan()).length && !window.confirm('Buang perubahan yang belum disimpan?')) return;
  jalankan(muat);
});

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
    if (!me.ok || result.account.role !== 'admin') {
      throw new Error('Halaman ini hanya dapat dibuka oleh super admin.');
    }
    guard.hidden = true;
    consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, result.account.role, 'pengaturan', result.account);
    window.hamasahSaatDataSegar(muat);
    await jalankan(muat);
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
    const judul = guard.querySelector('h1');
    if (judul) judul.textContent = 'Akses pengaturan belum tersedia';
  }
}());
