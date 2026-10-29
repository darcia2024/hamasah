// Service worker Hamasah (PWA). Sengaja kecil dan hati-hati:
//   - Tidak pernah menyentuh /api/ atau permintaan selain GET, jadi data wali dan santri tidak pernah disimpan di cache.
//   - Halaman (navigasi) selalu dari jaringan; saat tidak ada sinyal, halaman offline yang ramah ditampilkan.
//   - Berkas CSS/JS berversi (?v=...) dan ikon disimpan agar terbuka cepat dan hemat kuota.
const VERSI = 'hamasah-pwa-v1';
const BERKAS_AWAL = ['/offline.html', '/offline.css', '/offline.js', '/assets/pwa/icon-192.png'];

// Keputusan per permintaan, dipisah supaya bisa diuji tanpa browser: 'lewat' (jaringan biasa), 'halaman', 'berversi', atau 'aset'.
function jenisPermintaan(url, method, mode) {
  if (method !== 'GET') return 'lewat';
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return 'lewat';
  if (mode === 'navigate') return 'halaman';
  if (/\.(css|js)$/.test(url.pathname) && /(?:^|[?&])v=[\w.-]+/.test(url.search)) return 'berversi';
  if (url.pathname.startsWith('/assets/') && /\.(png|webp|jpg|jpeg|svg|woff2)$/.test(url.pathname)) return 'aset';
  return 'lewat';
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSI).then((cache) => cache.addAll(BERKAS_AWAL)).then(() => self.skipWaiting()));
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((nama) => Promise.all(nama.filter((n) => n !== VERSI).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    const jenis = jenisPermintaan(url, request.method, request.mode);
    if (jenis === 'lewat') return;

    if (jenis === 'halaman') {
      event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
      return;
    }
    if (jenis === 'berversi') {
      event.respondWith(caches.match(request).then((tersimpan) => tersimpan || fetch(request).then((jawaban) => {
        if (jawaban.ok) { const salinan = jawaban.clone(); caches.open(VERSI).then((cache) => cache.put(request, salinan)); }
        return jawaban;
      })));
      return;
    }
    // Aset gambar: tampilkan yang tersimpan, perbarui di belakang layar.
    event.respondWith(caches.open(VERSI).then((cache) => cache.match(request).then((tersimpan) => {
      const baru = fetch(request).then((jawaban) => { if (jawaban.ok) cache.put(request, jawaban.clone()); return jawaban; }).catch(() => tersimpan);
      return tersimpan || baru;
    })));
  });
}

if (typeof module !== 'undefined') module.exports = { jenisPermintaan, VERSI };