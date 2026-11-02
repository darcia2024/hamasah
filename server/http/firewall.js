// Firewall sederhana di depan seluruh aplikasi.
//
// Tugasnya hanya menolak permintaan yang tidak mungkin berasal dari pengguna sah, sebelum
// menyentuh database: URL rusak, path traversal, metode aneh, dan penyisiran otomatis
// (/wp-login.php, /.env). Isi formulir dan query sengaja tidak diperiksa dengan pola
// "serangan" seperti SQL atau skrip: pola begitu mudah salah menolak teks biasa, sedangkan
// query database memakai parameter dan Content Security Policy sudah menahan skrip inline.
// Batas laju tetap diurus server/rate-limit.js.

const PANJANG_URL_MAKS = 4096;

const METODE_TERLARANG = new Set(['TRACE', 'TRACK', 'CONNECT']);
// POST ke halaman tetap dilewatkan: formulir memakai method="post" dan ditangani JS, jadi
// kiriman sebelum JS termuat cukup memuat ulang halaman, bukan galat.
const METODE_TERLARANG_HALAMAN = new Set(['PUT', 'PATCH', 'DELETE']);

// Bagian path yang diawali titik, kecuali /.well-known/ yang memang standar.
const BERKAS_TITIK = /(?:^|\/)\.(?!well-known(?:\/|$))/;
const EKSTENSI_PENYISIRAN = /\.(?:php\d?|phtml|aspx?|jsp|cgi|env|sql|bak|ini|pem|key|tgz|gz|zip|rar|7z)$/i;
const FOLDER_PENYISIRAN = /^\/(?:wp-[a-z]+|phpmyadmin|cgi-bin|vendor|actuator|etc\/passwd|proc\/self)(?:\/|$)/i;

const JAWABAN = Object.freeze({
  400: 'Permintaan tidak valid.',
  404: 'Tidak ditemukan.',
  405: 'Metode tidak diizinkan.',
  414: 'Alamat terlalu panjang.'
});

function tolak(status, aturan) {
  return { status, aturan };
}

// Mengembalikan null bila permintaan boleh lewat, atau { status, aturan } bila ditolak.
// Permintaan yang lolos dijamin aman untuk new URL(request.url, ...).
function periksaPermintaan(request) {
  const alamat = String(request.url || '');
  if (alamat.length > PANJANG_URL_MAKS) return tolak(414, 'url-panjang');
  if (!alamat.startsWith('/') || alamat.startsWith('//')) return tolak(400, 'url-rusak');

  let path;
  try {
    new URL(alamat, 'http://localhost');
    path = decodeURIComponent(alamat.split(/[?#]/, 1)[0]);
  } catch {
    return tolak(400, 'url-rusak');
  }
  if (/[\0\\]/.test(path) || /(?:^|\/)\.\.(?:\/|$)/.test(path)) return tolak(400, 'traversal');

  const metode = String(request.method || '').toUpperCase();
  if (METODE_TERLARANG.has(metode)) return tolak(405, 'metode');
  if (path.startsWith('/api/')) return null;
  if (METODE_TERLARANG_HALAMAN.has(metode)) return tolak(405, 'metode');
  if (BERKAS_TITIK.test(path) || EKSTENSI_PENYISIRAN.test(path) || FOLDER_PENYISIRAN.test(path)) return tolak(404, 'penyisiran');
  return null;
}

function tolakPermintaan(request, response, { status }) {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
  response.writeHead(status, headers);
  response.end(request.method === 'HEAD' ? undefined : JAWABAN[status]);
}

module.exports = { PANJANG_URL_MAKS, periksaPermintaan, tolakPermintaan };
