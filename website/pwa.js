// PWA: mendaftarkan service worker dan mengelola tombol "Pasang aplikasi".
// Elemen dengan [data-pasang-aplikasi] hanya tampil bila browser menawarkan pemasangan; iPhone tidak punya tombol
// otomatis, jadi di sana panduan manual (halaman Pasang aplikasi) yang dipakai.
(function initPwa() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }

  const sudahTerpasang = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  document.documentElement.classList.toggle('is-standalone', sudahTerpasang);
  let tawaran = null;

  const tombol = () => [...document.querySelectorAll('[data-pasang-aplikasi]')];
  const tampil = (nilai) => tombol().forEach((b) => { b.hidden = !nilai; });
  tampil(false);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    tawaran = event;
    tampil(!sudahTerpasang);
  });

  window.addEventListener('appinstalled', () => { tawaran = null; tampil(false); });

  document.addEventListener('click', async (event) => {
    const sasaran = event.target.closest && event.target.closest('[data-pasang-aplikasi]');
    if (!sasaran || !tawaran) return;
    tawaran.prompt();
    try { await tawaran.userChoice; } catch { /* dibatalkan */ }
    tawaran = null;
    tampil(false);
  });

  // Penanda untuk panduan: sistem perangkat dan apakah aplikasi sudah dipasang.
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  document.documentElement.classList.toggle('is-ios', ios);
  document.documentElement.classList.toggle('is-android', /Android/i.test(ua));
}());