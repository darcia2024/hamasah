// Penanganan sesi terpusat untuk seluruh halaman internal (Task R4.4).
//
// Sebelumnya tiap modul memanggil fetch sendiri-sendiri dan tidak ada yang menangani
// 401 setelah konsol terbuka. Terbukti berbahaya: setelah /api/me mengembalikan 401
// di tengah pemakaian, konsol tetap ter-render penuh (sidebar, nama pengguna, lencana
// peran, ringkasan santri) dan tetap menyatakan "Sesi Terverifikasi Aman". API memang
// tetap menolak, jadi ini bukan celah autentikasi, tetapi pengguna dibiarkan
// menatap layar yang bohong.
//
// Berkas ini dimuat paling awal di keenam halaman, sebelum skrip modulnya, sehingga
// pembungkus terpasang sebelum permintaan pertama.
(function initSessionGuard() {
  const SESSION_KEY = 'hamasahPortalSession';
  // Permintaan ini SENGAJA tidak dianggap sesi berakhir: 401 di sini berarti
  // kredensial salah, yang artinya berbeda bagi pengguna dan sudah punya pesannya
  // sendiri di formulir masuk.
  const LOGIN_PATHS = ['/api/auth/login', '/api/applicant/login', '/api/auth/bootstrap'];

  let established = false;
  let ended = false;

  function storedToken() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      return saved && saved.accessToken ? saved.accessToken : '';
    } catch {
      return '';
    }
  }

  function pathOf(input) {
    try {
      const raw = typeof input === 'string' ? input : (input && input.url) || '';
      return new URL(raw, window.location.origin).pathname;
    } catch {
      return '';
    }
  }

  function authorizationOf(input, init) {
    const headers = (init && init.headers) || (input && typeof input === 'object' && input.headers) || null;
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get('Authorization') || '';
    return headers.Authorization || headers.authorization || '';
  }

  function setStatus(text, state) {
    document.querySelectorAll('.crm-system-status').forEach((box) => {
      const label = box.querySelector('span:last-child');
      const dot = box.querySelector('.crm-status-dot');
      if (label) label.textContent = text;
      if (dot) dot.hidden = state !== 'active';
    });
  }

  function showEnded() {
    if (ended) return;
    ended = true;
    // Token yang sudah mati dibuang, dan konsol disembunyikan: menampilkan data
    // pengguna di balik dialog hanya membiarkan yang tidak berhak melihatnya.
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* penyimpanan tidak tersedia */ }
    document.documentElement.classList.add('is-session-ended');
    setStatus('Sesi berakhir', 'ended');

    const dialog = document.createElement('dialog');
    dialog.className = 'session-ended';
    dialog.setAttribute('aria-labelledby', 'session-ended-title');

    const title = document.createElement('h2');
    title.id = 'session-ended-title';
    title.textContent = 'Sesi Anda telah berakhir';

    const copy = document.createElement('p');
    copy.textContent = 'Demi keamanan, sesi berakhir setelah beberapa waktu atau bila akun masuk dari perangkat lain. Perubahan yang belum tersimpan tidak terkirim. Masuk kembali untuk melanjutkan.';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--primary';
    button.textContent = 'Masuk kembali';
    button.addEventListener('click', () => window.location.reload());

    dialog.append(title, copy, button);
    document.body.append(dialog);
    // Dialog ini tidak dapat ditutup dengan Escape: tidak ada yang bisa dilakukan
    // di halaman ini selain masuk kembali.
    dialog.addEventListener('cancel', (event) => event.preventDefault());
    dialog.showModal();
    button.focus();
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function guardedFetch(input, init) {
    const response = await nativeFetch(input, init);

    const bearer = authorizationOf(input, init);
    const carriesSession = bearer && storedToken() && bearer === `Bearer ${storedToken()}`;
    if (!carriesSession || LOGIN_PATHS.includes(pathOf(input))) return response;

    if (response.ok) {
      if (!established) {
        established = true;
        setStatus('Sesi aktif', 'active');
      }
    } else if (response.status === 401 && established) {
      // Hanya bila konsol SUDAH terbuka. Pada saat halaman dimuat, 401 dari /api/me
      // ditangani guard masing-masing halaman (form masuk, pesan "Sesi tidak
      // ditemukan.", sessionStorage dibersihkan), dan itu tidak boleh berubah.
      showEnded();
    } else if (response.status === 401 && !established) {
      // Token basi yang ditolak saat halaman dimuat. Guard tiap halaman sudah
      // menampilkan form masuk; yang seragam di sini hanya pembuangan tokennya,
      // supaya tidak ada halaman yang menyimpan token mati (operations.js sebelumnya
      // membiarkannya).
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* penyimpanan tidak tersedia */ }
    }
    return response;
  };

  // Sebelum ada bukti apa pun, tidak ada yang boleh mengklaim sesi aman.
  document.addEventListener('DOMContentLoaded', () => {
    // Respons pertama dapat tiba sebelum DOMContentLoaded; jangan menimpanya.
    if (!established && !ended) setStatus('Memeriksa sesi...', 'pending');
  });
}());

(function initInternalShell() {
  const shell = document.querySelector('.crm-shell');
  const sidebar = document.querySelector('#crm-sidebar');
  const topbar = document.querySelector('.crm-topbar');
  if (!shell || !sidebar || !topbar) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'crm-drawer-toggle';
  toggle.setAttribute('aria-controls', 'crm-sidebar');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Buka navigasi samping');
  toggle.innerHTML = '<span aria-hidden="true">☰</span><span class="crm-drawer-toggle-label">Menu</span>';
  topbar.prepend(toggle);

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'crm-drawer-backdrop';
  backdrop.setAttribute('aria-label', 'Tutup navigasi samping');
  shell.append(backdrop);

  // Task R3.7. POST /api/auth/logout-all ada sejak lama dan tidak pernah dipanggil:
  // tidak ada cara mengakhiri sesi di perangkat lain. Dipasang di sini, bukan di
  // tiap halaman, karena keenam halaman internal memuat berkas ini dan memakai
  // .crm-sidebar-footer yang sama.
  const sidebarFooter = sidebar.querySelector('.crm-sidebar-footer');
  if (sidebarFooter) {
    const keluarSemua = document.createElement('button');
    keluarSemua.type = 'button';
    keluarSemua.id = 'logout-all-button';
    keluarSemua.className = 'crm-logout-btn crm-logout-btn--all';

    const label = document.createElement('span');
    label.textContent = 'Keluar dari semua perangkat';
    keluarSemua.append(label);

    keluarSemua.addEventListener('click', async () => {
      let sesi = null;
      try {
        sesi = JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null');
      } catch {
        sesi = null;
      }
      if (!sesi || !sesi.accessToken) return;

      const setuju = window.confirm(
        'Keluar dari semua perangkat?\n\n'
        + 'Seluruh sesi akun ini akan berakhir, termasuk di ponsel dan komputer lain yang masih terbuka. '
        + 'Sesi di perangkat ini ikut berakhir, jadi Anda perlu masuk kembali.'
      );
      if (!setuju) return;

      const labelAsli = label.textContent;
      keluarSemua.disabled = true;
      label.textContent = 'Mengakhiri sesi...';
      try {
        const response = await fetch('/api/auth/logout-all', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sesi.accessToken}` }
        });
        if (!response.ok) {
          const isi = await response.json().catch(() => ({}));
          throw new Error(isi.error || 'Sesi belum dapat diakhiri.');
        }
      } catch (error) {
        keluarSemua.disabled = false;
        label.textContent = labelAsli;
        window.alert(error.message || 'Sesi belum dapat diakhiri.');
        return;
      }
      // Sesi perangkat ini ikut dicabut server, jadi penyimpanan lokalnya harus
      // dibuang juga. Tanpa ini halaman tetap memegang token yang sudah mati.
      sessionStorage.removeItem('hamasahPortalSession');
      window.location.reload();
    });

    sidebarFooter.append(keluarSemua);
  }

  const focusables = () => Array.from(sidebar.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.disabled && el.offsetParent !== null);
  const isMobile = () => window.matchMedia('(max-width: 800px)').matches;

  function closeDrawer({ returnFocus = false } = {}) {
    shell.classList.remove('is-drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Buka navigasi samping');
    sidebar.removeAttribute('aria-modal');
    sidebar.setAttribute('aria-hidden', isMobile() ? 'true' : 'false');
    document.body.classList.remove('crm-drawer-open');
    if (returnFocus) toggle.focus();
  }

  function openDrawer() {
    if (!isMobile()) return;
    shell.classList.add('is-drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Tutup navigasi samping');
    sidebar.setAttribute('aria-hidden', 'false');
    sidebar.setAttribute('aria-modal', 'true');
    document.body.classList.add('crm-drawer-open');
    const first = focusables()[0];
    if (first) first.focus();
  }

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeDrawer();
    else openDrawer();
  });
  backdrop.addEventListener('click', () => closeDrawer({ returnFocus: true }));
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeDrawer();
  });
  document.addEventListener('keydown', (event) => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer({ returnFocus: true });
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (!isMobile()) closeDrawer();
  });
  sidebar.setAttribute('aria-hidden', isMobile() ? 'true' : 'false');
})();
