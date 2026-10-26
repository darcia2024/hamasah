// Gerbang PIN pratinjau: selama website belum dibuka untuk umum, setiap halaman (kecuali
// /pitch dan /internal) meminta PIN dulu. Ini pagar ringan untuk pratinjau, bukan pengganti login:
// API, CSS, JS, dan gambar tetap terbuka, dan data di portal tetap dijaga sesi masing-masing.
//
// Setelah PIN benar, peramban menyimpan cookie HttpOnly berisi HMAC dari PIN (bukan PIN-nya),
// jadi mengganti PIN otomatis mengeluarkan semua yang sudah masuk. Halaman yang tersaji di
// balik gerbang tidak boleh disimpan CDN, kalau tidak pengunjung tanpa PIN ikut melihatnya.

const crypto = require('node:crypto');

const COOKIE = 'hi_pratinjau';
const ALAMAT_KIRIM = '/api/pratinjau/pin';
// Halaman presentasi (pitch dan tutorial workspace internal) boleh dibuka tanpa PIN.
const BEBAS = new Set(['pitch', 'internal'].flatMap((nama) => [`/${nama}`, `/${nama}.html`, `/website/${nama}`, `/website/${nama}.html`]));
const TIGA_PULUH_HARI = 30 * 24 * 60 * 60;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Alamat kembali hanya jalur di situs ini: diawali "/" tunggal, bukan "//host".
function alamatAman(value) {
  const teks = String(value || '/');
  return /^\/(?!\/)[^\s\\]*$/.test(teks) ? teks : '/';
}

function bacaCookie(header, nama) {
  for (const bagian of String(header || '').split(';')) {
    const [kunci, ...isi] = bagian.trim().split('=');
    if (kunci === nama) return isi.join('=');
  }
  return '';
}

function halamanPin({ kembali, salah }) {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Pratinjau | Hamasah International</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&amp;display=swap" />
<link rel="stylesheet" href="/pratinjau.css" />
</head>
<body>
<main class="pin">
  <img class="pin__logo" src="/assets/logo-emblem-gold.png" alt="Logo Hamasah International" width="56" height="61" />
  <h1>Website ini masih dalam pratinjau</h1>
  <p>Masukkan PIN dari tim Hamasah untuk melihatnya.</p>
  <form class="pin__form" method="post" action="${ALAMAT_KIRIM}">
    <input type="hidden" name="kembali" value="${escapeHtml(kembali)}" />
    <label class="pin__label" for="pin">PIN</label>
    <input class="pin__input" id="pin" name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" required autofocus />
    ${salah ? '<p class="pin__error" role="alert">PIN belum cocok. Coba lagi.</p>' : ''}
    <button class="pin__button" type="submit">Masuk</button>
  </form>
</main>
</body>
</html>`;
}

// pin kosong berarti gerbang mati. secret: kunci HMAC server (IP_HASH_SECRET).
function createSitePin({ pin, secret }) {
  if (!pin) return null;
  const token = crypto.createHmac('sha256', String(secret || 'hamasah-pratinjau')).update(`pratinjau:${pin}`).digest('hex');

  function sudahMasuk(request) {
    const nilai = Buffer.from(bacaCookie(request.headers.cookie, COOKIE));
    const harap = Buffer.from(token);
    return nilai.length === harap.length && crypto.timingSafeEqual(nilai, harap);
  }

  // Hanya permintaan halaman (akar, alamat tanpa ekstensi, .html) yang dijaga.
  function halamanDijaga(pathname) {
    if (BEBAS.has(pathname)) return false;
    return pathname === '/' || /\/[^/.]+$/.test(pathname) || /\.html$/i.test(pathname) || pathname.endsWith('/');
  }

  // Mengembalikan true bila permintaan sudah dijawab gerbang.
  function tahan(request, response, url) {
    if (!halamanDijaga(url.pathname) || sudahMasuk(request)) return false;
    response.writeHead(401, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff'
    });
    const kembali = alamatAman(`${url.pathname}${url.search.replace(/[?&]pin=salah\b/, '').replace(/^&/, '?')}`);
    response.end(request.method === 'HEAD' ? undefined : halamanPin({ kembali, salah: url.searchParams.get('pin') === 'salah' }));
    return true;
  }

  // POST formulir PIN (application/x-www-form-urlencoded). body: Buffer isi formulir.
  function kirim(request, response, body, { secure }) {
    const isian = new URLSearchParams(body.toString('utf8'));
    const kembali = alamatAman(isian.get('kembali'));
    const dicoba = Buffer.from(String(isian.get('pin') || '').trim());
    const benar = Buffer.from(String(pin));
    const cocok = dicoba.length === benar.length && crypto.timingSafeEqual(dicoba, benar);
    const headers = { 'Cache-Control': 'no-store' };
    if (cocok) {
      headers['Set-Cookie'] = `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TIGA_PULUH_HARI}${secure ? '; Secure' : ''}`;
      headers.Location = kembali;
    } else {
      headers.Location = `${kembali}${kembali.includes('?') ? '&' : '?'}pin=salah`;
    }
    response.writeHead(303, headers);
    response.end();
  }

  return Object.freeze({ ALAMAT_KIRIM, sudahMasuk, halamanDijaga, tahan, kirim });
}

module.exports = { createSitePin, COOKIE };
