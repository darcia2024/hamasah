// Titik masuk untuk platform serverless (Vercel).
//
// Aplikasi ini aslinya satu server Node yang menyala terus. Di Vercel tidak ada
// proses yang hidup antar permintaan, jadi yang diekspor di sini bukan server,
// melainkan satu fungsi penangan permintaan. Aplikasi dirakit sekali per instance
// lalu dipakai ulang selama instance itu masih hangat.
//
// Yang WAJIB diketahui saat memakai jalur ini:
//   - Timer di dalam proses tidak pernah jalan. Pembersihan sesi, catatan audit,
//     unggahan tertunda, dan baris pembatas laju dikerjakan cron yang memanggil
//     POST /api/tasks/maintenance. Lihat vercel.json.
//   - Worker notifikasi juga tidak jalan. Kalau email diaktifkan, jalankan
//     `npm run worker:notifications` di tempat lain atau panggil lewat cron.
//   - Hitungan pembatas laju untuk kredensial disimpan di database (migrasi 041),
//     karena memori proses hilang setiap instance mati.

const path = require('node:path');
const { createHamasahApp } = require('../server/app.js');
const { appOptionsFromConfig, readProductionConfig } = require('../server/production-config.js');
const { createRequestId, errorFields, logEvent } = require('../server/http/request-log.js');

// Rewrite Vercel ("/(.*)" ke "/api/index.js") membuat fungsi menerima request.url
// "/api/index.js", bukan alamat yang diminta pengunjung. Karena itu rewrite di
// vercel.json membawa alamat asli sebagai parameter __path, dan di sini alamat itu
// dikembalikan sebelum aplikasi melihatnya. Query asli pengunjung tetap utuh.
const PATH_PARAM = '__path';

const ENTRY_PATH = /^\/api\/index(\.js)?$/;

function withQuery(pathname, searchParams) {
  const query = searchParams.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}

function restoreOriginalUrl(rawUrl, headers = {}) {
  const url = new URL(rawUrl || '/', 'http://localhost');
  // Bentuk lain yang mungkin: alamat asli ditempel di belakang titik masuk,
  // mis. "/api/index.js/website/biaya.html".
  const appended = url.pathname.match(/^\/api\/index(?:\.js)?(\/.+)$/);
  if (appended) {
    url.searchParams.delete(PATH_PARAM);
    return withQuery(appended[1], url.searchParams);
  }
  if (!ENTRY_PATH.test(url.pathname)) return rawUrl;
  if (url.searchParams.has(PATH_PARAM)) {
    const original = `/${String(url.searchParams.get(PATH_PARAM) || '').replace(/^\/+/, '')}`;
    url.searchParams.delete(PATH_PARAM);
    return withQuery(original, url.searchParams);
  }
  // Cadangan bila parameter rewrite tidak sampai: tangkapan "$1" yang dikirim Vercel
  // lewat x-now-route-matches ("1=website%2Fbiaya.html"), atau alamat asli dari proxy.
  const matches = headers['x-now-route-matches'];
  if (matches) {
    const captured = new URLSearchParams(String(matches)).get('1');
    if (captured !== null) return withQuery(`/${captured.replace(/^\/+/, '')}`, url.searchParams);
  }
  for (const name of ['x-forwarded-uri', 'x-original-url']) {
    const value = headers[name];
    if (value && String(value).startsWith('/') && !ENTRY_PATH.test(new URL(String(value), 'http://localhost').pathname)) return String(value);
  }
  return rawUrl;
}

let handlerPromise = null;

function buatHandler() {
  const config = readProductionConfig(process.env);
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    // Opsi yang sama persis dengan server.js, termasuk penyimpanan Supabase dan email.
    ...appOptionsFromConfig(config),
    trustProxy: true,
    // Timer tidak berguna di serverless: instance mati sebelum jadwal berikutnya.
    // Pekerjaannya dipanggil cron lewat POST /api/tasks/maintenance.
    auditRetention: false
  });
  return app.requestListener();
}

module.exports = async function handler(request, response) {
  if (!handlerPromise) {
    handlerPromise = Promise.resolve().then(buatHandler).catch((error) => {
      handlerPromise = null;
      throw error;
    });
  }
  let listener;
  try {
    listener = await handlerPromise;
  } catch (error) {
    // Konfigurasi salah atau kurang. Pesannya aman dicatat: readProductionConfig
    // tidak pernah memasukkan nilai rahasia ke pesan error.
    const requestId = createRequestId();
    logEvent('error', 'startup_failed', { requestId, ...errorFields(error) });
    response.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId
    });
    response.end(JSON.stringify({ error: `Layanan belum siap. Sebutkan kode ${requestId} saat melapor ke petugas.`, requestId }));
    return;
  }
  const receivedUrl = request.url;
  request.url = restoreOriginalUrl(receivedUrl, request.headers);
  const received = new URL(receivedUrl || '/', 'http://localhost');
  if (received.pathname.startsWith('/api/index')) {
    // Diagnosis rewrite: path yang diterima dan hasilnya, NAMA parameter dan header saja
    // (tanpa nilai, supaya kode akses, cookie, atau token tidak ikut tercatat).
    logEvent('info', 'rewrite_path', {
      receivedPath: received.pathname,
      queryNames: [...received.searchParams.keys()].join(','),
      restoredPath: new URL(request.url, 'http://localhost').pathname,
      headerNames: Object.keys(request.headers || {}).sort().join(',')
    });
  }
  return listener(request, response);
};

module.exports.restoreOriginalUrl = restoreOriginalUrl;
