// Halaman Kelola Akun super admin (akun.html). Dulu bagian ini menumpang di dashboard
// portal.html; dipindah ke halaman sendiri supaya daftar akun punya tempat lebar.
// Endpoint: GET/POST /api/accounts, POST /api/accounts/invitations,
// PATCH /api/accounts/:id, PATCH /api/accounts/:id/active,
// POST /api/accounts/:id/password-reset (server/routes/accounts.js).
const guard = document.querySelector('#accounts-guard');
const guardCopy = document.querySelector('#accounts-guard-copy');
const consoleSection = document.querySelector('#accounts-console');
const staffNav = document.querySelector('#staff-nav');
const accountForm = document.querySelector('#create-account-form');
const accountFormStatus = document.querySelector('#account-form-status');
const inviteForm = document.querySelector('#invite-form');
const inviteFormStatus = document.querySelector('#invite-form-status');
const accountList = document.querySelector('#account-list');
const actionStatus = document.querySelector('#account-action-status');
const accountSearch = document.querySelector('#account-search');
const accountRoleFilter = document.querySelector('#account-role-filter');
const accountActiveFilter = document.querySelector('#account-active-filter');
const accountListSummary = document.querySelector('#account-list-summary');

// Peran untuk pilihan di formulir ubah akun (nama dari nav.js).
const PILIHAN_PERAN = Object.freeze(ROLE_ORDER.map((role) => [role, ROLE_DISPLAY_NAMES[role]]));

let currentAccount = null;
let semuaAkun = [];

function session() {
  try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; }
}

function headers() {
  const current = session();
  return current ? { Authorization: `Bearer ${current.accessToken}` } : {};
}

function setStatus(node, text, error = false) {
  node.textContent = text;
  node.classList.toggle('is-error', error);
}

async function kirimJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Perubahan belum dapat disimpan.'), { result, status: response.status });
  return result;
}

async function loadAccounts() {
  const result = await kirimJson('/api/accounts', 'GET');
  semuaAkun = Array.isArray(result.items) ? result.items : [];
  tampilkanAkun();
  return semuaAkun;
}

// Pencarian dan filter. /api/accounts mengirim semua akun sekaligus, jadi penyaringan
// cukup di peramban dan tetap berlaku setelah daftar dimuat ulang.
ROLE_ORDER.forEach((role) => accountRoleFilter.add(new Option(ROLE_DISPLAY_NAMES[role], role)));
[accountSearch, accountRoleFilter, accountActiveFilter].forEach((kontrol) => {
  kontrol.addEventListener(kontrol === accountSearch ? 'input' : 'change', () => tampilkanAkun());
});

function tampilkanAkun() {
  const kata = accountSearch.value.trim().toLocaleLowerCase('id-ID');
  const peran = accountRoleFilter.value;
  const status = accountActiveFilter.value;
  const cocok = semuaAkun.filter((account) => (!peran || account.role === peran)
    && (!status || (status === 'aktif') === Boolean(account.active))
    && (!kata || `${account.name} ${account.email}`.toLocaleLowerCase('id-ID').includes(kata)));
  accountListSummary.textContent = cocok.length === semuaAkun.length
    ? `${semuaAkun.length} akun.`
    : `Menampilkan ${cocok.length} dari ${semuaAkun.length} akun.`;
  if (!cocok.length) {
    const kosong = document.createElement('p');
    kosong.className = 'form-status';
    kosong.textContent = semuaAkun.length
      ? 'Tidak ada akun yang cocok dengan pencarian atau filter ini.'
      : 'Belum ada akun.';
    accountList.replaceChildren(kosong);
    return;
  }
  gambarDaftarAkun(cocok);
}

function tombol(teks, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--secondary portal-account__action';
  button.textContent = teks;
  button.addEventListener('click', () => onClick(button));
  return button;
}

function gambarDaftarAkun(accounts) {
  accountList.replaceChildren(...accounts.map((account) => {
    const item = document.createElement('div');
    item.className = 'portal-account';

    const head = document.createElement('div');
    head.className = 'portal-account__head';
    const name = document.createElement('strong');
    name.textContent = account.name;
    const state = document.createElement('span');
    state.className = account.active ? 'portal-account__state is-active' : 'portal-account__state';
    state.textContent = account.active ? 'Aktif' : 'Nonaktif';
    head.append(name, state);

    const copy = document.createElement('span');
    copy.textContent = `${account.email} · ${ROLE_DISPLAY_NAMES[account.role] || account.role}`;

    const aksi = document.createElement('div');
    aksi.className = 'portal-account__actions';
    aksi.append(tombol('Ubah', () => ubahAkun(account)));
    aksi.append(tombol(account.active ? 'Nonaktifkan' : 'Aktifkan', (button) => ubahStatusAktif(account, button)));
    if (!currentAccount || account.id !== currentAccount.id) {
      aksi.append(tombol('Kata sandi sementara', (button) => buatSandiSementara(account, button)));
    }

    item.append(head, copy, aksi);
    return item;
  }));
}

// Menonaktifkan akun juga mencabut sesinya di semua perangkat, jadi diberi konfirmasi.
async function ubahStatusAktif(account, button) {
  if (account.active && !window.confirm(`Nonaktifkan akun ${account.name}? Sesi di semua perangkatnya ikut berakhir.`)) return;
  button.disabled = true;
  try {
    const result = await kirimJson(`/api/accounts/${encodeURIComponent(account.id)}/active`, 'PATCH', { active: !account.active });
    setStatus(actionStatus, result.account && result.account.active
      ? `Akun ${account.name} diaktifkan.`
      : `Akun ${account.name} dinonaktifkan. ${result.sessionsRevoked || 0} sesi dicabut.`);
    await loadAccounts();
  } catch (error) {
    setStatus(actionStatus, error.message || 'Status akun belum dapat diubah.', true);
    button.disabled = false;
  }
}

async function ubahAkun(account) {
  const diriSendiri = currentAccount && account.id === currentAccount.id;
  const hasil = await window.HamasahDialog.formulir({
    judul: `Ubah akun ${account.name}`,
    keterangan: 'Bila email atau peran diubah, akun ini keluar dari semua perangkat dan perlu masuk lagi.',
    bidang: [
      { nama: 'name', label: 'Nama', nilai: account.name, wajib: true },
      { nama: 'email', label: 'Email', jenis: 'email', nilai: account.email, wajib: true },
      {
        nama: 'role', label: 'Peran', jenis: 'select', nilai: account.role, pilihan: PILIHAN_PERAN,
        petunjuk: diriSendiri ? 'Peran akun yang sedang dipakai tidak dapat diubah sendiri.' : 'Musyrif yang diganti perannya otomatis dilepas dari asramanya.'
      }
    ],
    kirim: (nilai) => kirimJson(`/api/accounts/${encodeURIComponent(account.id)}`, 'PATCH', nilai)
  });
  if (!hasil) return;
  setStatus(actionStatus, hasil.changed && hasil.changed.length
    ? `Akun ${hasil.account.name} diperbarui.${hasil.sessionsRevoked ? ` ${hasil.sessionsRevoked} sesi dicabut.` : ''}`
    : 'Tidak ada yang berubah.');
  await loadAccounts();
}

async function buatSandiSementara(account, button) {
  if (!window.confirm(`Buat kata sandi sementara untuk ${account.name}? Kata sandi lamanya langsung tidak berlaku dan semua sesinya berakhir.`)) return;
  button.disabled = true;
  try {
    const hasil = await kirimJson(`/api/accounts/${encodeURIComponent(account.id)}/password-reset`, 'POST');
    setStatus(actionStatus, '');
    await window.HamasahDialog.pesan({
      judul: `Kata sandi sementara ${account.name}`,
      isi: [
        'Berikan kata sandi ini langsung ke pemilik akun, misalnya lewat WhatsApp pribadi. Kata sandi hanya ditampilkan sekali.',
        'Setelah masuk, minta pemilik akun menggantinya lewat menu Ganti kata sandi.'
      ],
      labelRahasia: `Masuk dengan email ${account.email}`,
      rahasia: hasil.temporaryPassword
    });
  } catch (error) {
    setStatus(actionStatus, error.message || 'Kata sandi sementara belum dapat dibuat.', true);
  } finally {
    button.disabled = false;
  }
}

accountForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(accountFormStatus, '');
  try {
    const result = await kirimJson('/api/accounts', 'POST', {
      name: document.querySelector('#account-name').value,
      email: document.querySelector('#account-email').value,
      role: document.querySelector('#account-role').value,
      password: document.querySelector('#account-password').value
    });
    accountForm.reset();
    setStatus(accountFormStatus, `Akun ${result.account.name} berhasil dibuat.`);
    await loadAccounts();
  } catch (error) {
    setStatus(accountFormStatus, error.message || 'Akun belum dapat dibuat.', true);
  }
});

// POST /api/accounts/invitations: akun dibuat nonaktif, penerima memasang kata sandinya
// sendiri lewat tautan aktivasi. 502 berarti akun sudah dibuat tetapi emailnya gagal
// terkirim; itu dibedakan dari galat validasi.
inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(inviteFormStatus, 'Mengirim undangan...');
  try {
    const result = await kirimJson('/api/accounts/invitations', 'POST', {
      name: document.querySelector('#invite-name').value,
      email: document.querySelector('#invite-email').value,
      role: document.querySelector('#invite-role').value
    });
    inviteForm.reset();
    setStatus(inviteFormStatus, `Undangan terkirim ke ${result.account.email}. Tautan aktivasi berlaku terbatas.`);
  } catch (error) {
    if (error.result && error.result.account) {
      inviteForm.reset();
      setStatus(inviteFormStatus, `Akun ${error.result.account.name} dibuat, tetapi email undangan belum terkirim. Periksa konfigurasi email lalu kirim ulang.`, true);
    } else {
      setStatus(inviteFormStatus, error.message || 'Undangan belum dapat dikirim.', true);
    }
  }
  await loadAccounts().catch(() => {});
});

document.querySelector('#reload-accounts').addEventListener('click', () => {
  loadAccounts().catch((error) => setStatus(actionStatus, error.message || 'Daftar akun belum dapat dimuat.', true));
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
    currentAccount = result.account;
    guard.hidden = true;
    consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, result.account.role, 'akun', result.account);
    window.hamasahSaatDataSegar(loadAccounts);
    await loadAccounts().catch((error) => setStatus(actionStatus, error.message || 'Daftar akun belum dapat dimuat.', true));
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
    const judul = guard.querySelector('h1');
    if (judul) judul.textContent = 'Akses kelola akun belum tersedia';
  }
}());
