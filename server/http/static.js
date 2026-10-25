// Penyajian berkas statis: halaman website dan aset.
// Hanya folder website/ dan assets/ yang boleh dibaca.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
});

const ALLOWED_PREFIXES = Object.freeze(['website/', 'assets/']);

// Cache dan kompresi (Task R6.3). Sebelumnya setiap navigasi mengunduh ulang seluruh CSS
// dan JS (sekitar 300 KB) tanpa validasi, tanpa cache, dan tanpa kompresi.
//
//   HTML                      -> no-cache: selalu divalidasi ulang lewat ETag (304 bila sama),
//                                supaya halaman baru dan versi aset barunya langsung dipakai.
//   CSS/JS dengan ?v=<versi>  -> cache setahun dan immutable. Versinya diberi scripts/stamp-assets.js
//                                dari isi berkas, jadi berkas yang berubah otomatis berganti URL.
//   CSS/JS tanpa versi        -> no-cache (validasi ulang).
//   Gambar dan font           -> cache sehari, tetap divalidasi lewat ETag.
const COMPRESSIBLE = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
const IMMUTABLE_CANDIDATES = new Set(['.css', '.js']);
const YEAR_SECONDS = 31536000;
const DAY_SECONDS = 86400;
// Variasi terkompresi disimpan di memori supaya biayanya dibayar sekali per versi berkas.
const COMPRESSION_CACHE_LIMIT = 200;
const compressionCache = new Map();

function cacheControlFor(extension, search) {
  if (IMMUTABLE_CANDIDATES.has(extension) && /(?:^|[?&])v=[\w.-]+/.test(search || '')) {
    return `public, max-age=${YEAR_SECONDS}, immutable`;
  }
  if (extension === '.html' || IMMUTABLE_CANDIDATES.has(extension) || extension === '.json' || extension === '.txt' || extension === '.xml') {
    return 'no-cache';
  }
  return `public, max-age=${DAY_SECONDS}`;
}

// Di Vercel setiap permintaan, termasuk HTML dan CSS, dilayani fungsi api/index.js.
// Header ini mengizinkan CDN Vercel menyimpan jawabannya di lokasi terdekat pengguna,
// jadi halaman dan aset tidak perlu membangunkan fungsi lagi (yang bisa makan ratusan
// milidetik, lebih lama lagi bila fungsinya sedang tidur). CDN Vercel tidak memakai
// simpanan deploy lama setelah ada deploy baru, jadi halaman yang berubah tetap tampil.
// Browser tidak membaca header ini dan tetap mengikuti Cache-Control di atas.
function cdnCacheControlFor(extension, search) {
  if (IMMUTABLE_CANDIDATES.has(extension) && /(?:^|[?&])v=[\w.-]+/.test(search || '')) {
    return `max-age=${YEAR_SECONDS}, immutable`;
  }
  if (extension === '.html' || COMPRESSIBLE.has(extension)) {
    return `max-age=300, stale-while-revalidate=${DAY_SECONDS}`;
  }
  return `max-age=${DAY_SECONDS}, stale-while-revalidate=${DAY_SECONDS * 7}`;
}

// ETag lemah dari ukuran dan waktu ubah. Lemah, karena isi yang sama dapat terkirim dalam
// beberapa bentuk kompresi.
function etagFor(stat) {
  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function matchesEtag(header, etag) {
  if (!header) return false;
  if (header.trim() === '*') return true;
  const strip = (value) => value.trim().replace(/^W\//, '');
  return header.split(',').some((candidate) => strip(candidate) === strip(etag));
}

// Pilihan kompresi dari Accept-Encoding: brotli bila diterima, lalu gzip, selain itu tidak
// dikompresi. Permintaan tanpa header itu (atau q=0) mendapat berkas apa adanya.
function chooseEncoding(acceptEncoding) {
  const accepted = new Map();
  for (const part of String(acceptEncoding || '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    accepted.set(name, q ? Number(q.slice(2)) : 1);
  }
  const ok = (name) => (accepted.has(name) ? accepted.get(name) > 0 : (accepted.get('*') || 0) > 0);
  if (ok('br')) return 'br';
  if (ok('gzip')) return 'gzip';
  return null;
}

function compressedVariant(filePath, etag, encoding, content) {
  const key = `${filePath}|${encoding}`;
  const cached = compressionCache.get(key);
  if (cached && cached.etag === etag) return cached.body;
  const source = content || fs.readFileSync(filePath);
  const body = encoding === 'br'
    ? zlib.brotliCompressSync(source, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
    : zlib.gzipSync(source, { level: 6 });
  if (compressionCache.size >= COMPRESSION_CACHE_LIMIT) compressionCache.delete(compressionCache.keys().next().value);
  compressionCache.set(key, { etag, body });
  return body;
}

// Mengirim satu berkas dengan ETag, Cache-Control, 304, dan kompresi. `request` boleh
// kosong (test dan pemanggil lama): hasilnya berkas apa adanya tanpa validasi.
// `transform(html)` (opsional, hanya HTML) mengembalikan isi pengganti, mis. halaman publik
// yang diberi tag bagikan; ETag-nya lalu dihitung dari isi hasil, bukan dari berkas.
// `privateHtml`: HTML hanya untuk peramban ini (mis. di balik gerbang PIN), jadi CDN tidak
// boleh menyimpannya.
function sendFile(response, request, filePath, search, transform, privateHtml = false) {
  const extension = path.extname(filePath).toLocaleLowerCase('en-US');
  const stat = fs.statSync(filePath);
  let content = null;
  if (transform && extension === '.html') {
    const replaced = transform(fs.readFileSync(filePath, 'utf8'));
    if (typeof replaced === 'string') content = Buffer.from(replaced, 'utf8');
  }
  const etag = content
    ? `W/"${crypto.createHash('sha1').update(content).digest('hex').slice(0, 16)}"`
    : etagFor(stat);
  const size = content ? content.length : stat.size;
  const headers = {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    ETag: etag,
    'Cache-Control': cacheControlFor(extension, search),
    'Vercel-CDN-Cache-Control': cdnCacheControlFor(extension, search)
  };
  if (privateHtml && extension === '.html') {
    headers['Cache-Control'] = 'private, no-cache';
    headers['Vercel-CDN-Cache-Control'] = 'no-store';
  }
  const compressible = COMPRESSIBLE.has(extension);
  if (compressible) headers.Vary = 'Accept-Encoding';

  const requestHeaders = (request && request.headers) || {};
  if (matchesEtag(requestHeaders['if-none-match'], etag)) {
    const notModified = { ETag: etag, 'Cache-Control': headers['Cache-Control'], 'Vercel-CDN-Cache-Control': headers['Vercel-CDN-Cache-Control'] };
    if (compressible) notModified.Vary = 'Accept-Encoding';
    response.writeHead(304, notModified);
    response.end();
    return;
  }

  const encoding = compressible && size > 512 ? chooseEncoding(requestHeaders['accept-encoding']) : null;
  if (encoding) {
    const body = compressedVariant(filePath, etag, encoding, content);
    headers['Content-Encoding'] = encoding;
    headers['Content-Length'] = body.length;
    response.writeHead(200, headers);
    response.end(body);
    return;
  }

  headers['Content-Length'] = size;
  response.writeHead(200, headers);
  if (content) {
    response.end(content);
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}

// Daftar-izin ekstensi, bukan daftar-tolak. Sebelum Task R2.2 modul ini menyajikan
// ekstensi apa pun yang diminta: MIME_TYPES hanya menentukan Content-Type, dan
// berkas yang ekstensinya tidak terdaftar tetap terkirim sebagai
// application/octet-stream. Akibatnya satu berkas .env, .sql, .pem, atau .bak yang
// tidak sengaja jatuh ke website/ langsung dapat diunduh siapa pun. Seluruh isi
// website/ dan assets/ saat ini hanya css, html, js, txt, xml, jpg, dan png, jadi
// daftar ini tidak memutus apa pun yang sah.
const SERVABLE_EXTENSIONS = Object.freeze(Object.keys(MIME_TYPES));

// Nama yang lolos daftar-izin ekstensi tetapi tidak pernah boleh tersaji publik.
// Task R2.1 sudah memindahkan berkas semacam ini keluar dari website/; daftar ini
// yang menjaga agar kesalahan penempatan berikutnya tidak langsung jadi eksposur.
const DENIED_FILE_NAMES = Object.freeze([
  /\.test\.js$/i,
  /\.metadata\.json$/i
]);

// Permintaan yang tidak lolos dijawab 404, bukan 403, supaya jawaban server tidak
// membedakan "ada tapi dilarang" dari "tidak ada".
function isServablePath(normalizedPath) {
  const segments = normalizedPath.split('/');

  // Berkas dan folder berawalan titik: .env, .git/, .htaccess.
  if (segments.some((segment) => segment.startsWith('.'))) {
    return false;
  }

  const fileName = segments[segments.length - 1];
  // Permintaan folder, mis. "website/". index.html-nya diurus di bawah.
  if (fileName === '') {
    return true;
  }

  const extension = path.posix.extname(fileName).toLocaleLowerCase('en-US');
  if (!SERVABLE_EXTENSIONS.includes(extension)) {
    return false;
  }

  return !DENIED_FILE_NAMES.some((pattern) => pattern.test(fileName));
}

function notFound(response, rootDirectory) {
  const customPage = rootDirectory && path.join(rootDirectory, 'website', '404.html');
  if (customPage && fs.existsSync(customPage) && fs.statSync(customPage).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(customPage).pipe(response);
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Halaman tidak ditemukan.');
}

// `transformHtml(relativePath, html)` (opsional) boleh mengembalikan isi pengganti untuk
// satu halaman HTML, atau null untuk menyajikannya apa adanya.
// Halaman publik dan konsol disajikan di akar tanpa .html: /biaya menyajikan
// website/biaya.html. Alamat lama (/website/biaya, /website/biaya.html, /biaya.html,
// /website/) dialihkan permanen ke alamat baru beserta parameternya, supaya tautan di
// email, WhatsApp, dan hasil pencarian tetap jalan.
function halamanAda(rootDirectory, nama) {
  if (!/^[a-z0-9-]+$/i.test(nama) || nama === '404') return false;
  const lokasi = path.resolve(rootDirectory, 'website', `${nama}.html`);
  return fs.existsSync(lokasi) && fs.statSync(lokasi).isFile();
}

function alihkan(response, lokasi) {
  response.writeHead(301, { Location: lokasi, 'Cache-Control': 'public, max-age=86400' });
  response.end();
}

function serveStaticFile(response, { pathname, rootDirectory, request, search, transformHtml, privateHtml = false }) {
  const ambil = !request || ['GET', 'HEAD'].includes(request.method);
  let requestedPath = pathname === '/' ? '/website/' : pathname;
  if (ambil) {
    if (['/website', '/website/', '/website/index.html', '/index.html', '/index'].includes(pathname)) {
      alihkan(response, `/${search || ''}`);
      return;
    }
    const lama = /^\/(?:website\/)?([a-z0-9-]+)\.html$/i.exec(pathname) || /^\/website\/([a-z0-9-]+)$/i.exec(pathname);
    if (lama && halamanAda(rootDirectory, lama[1])) {
      alihkan(response, `/${lama[1]}${search || ''}`);
      return;
    }
    const bersih = /^\/([a-z0-9-]+)$/i.exec(pathname);
    if (bersih && halamanAda(rootDirectory, bersih[1])) requestedPath = `/website/${bersih[1]}.html`;
  }
  // Backslash disamakan dengan garis miring lebih dulu. Di Windows path.resolve
  // memperlakukan "\" sebagai pemisah folder, sedangkan path.posix.normalize tidak,
  // jadi "/website/..\.env" bisa lolos pemeriksaan awalan lalu keluar dari folder.
  // Parser URL memang sudah merapikannya, tetapi modul ini tidak boleh bergantung
  // pada pemanggilnya untuk urusan ini.
  const withSlashes = requestedPath.replaceAll('\\', '/');
  // normalize lebih dulu, supaya "/website/../.env" tidak lolos pemeriksaan awalan.
  let normalizedPath = path.posix.normalize(withSlashes).replace(/^\/+/, '');

  // /proposal/ dan /hamasah/ (prototipe lama di root) dihapus sesuai keputusan KR6 (Task R8.1);
  // keduanya kini jatuh ke 404 seperti alamat lain yang tidak ada.
  if (!ALLOWED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    // Jika berkas diminta tanpa awalan /website/ (mis. /website.css saat halaman / dibuka),
    // periksa apakah berkas tersebut ada langsung di folder website/.
    const candidateRel = path.posix.normalize('website/' + normalizedPath);
    if (candidateRel.startsWith('website/')) {
      const candidateAbs = path.resolve(rootDirectory, candidateRel);
      const websiteDir = path.resolve(rootDirectory, 'website');
      if (candidateAbs.startsWith(websiteDir) && fs.existsSync(candidateAbs) && fs.statSync(candidateAbs).isFile()) {
        normalizedPath = candidateRel;
      } else {
        notFound(response, rootDirectory);
        return;
      }
    } else {
      notFound(response, rootDirectory);
      return;
    }
  }

  if (!isServablePath(normalizedPath)) {
    notFound(response, rootDirectory);
    return;
  }

  const sourcePath = path.resolve(rootDirectory, normalizedPath);
  const rootPath = path.resolve(rootDirectory);
  if (!sourcePath.startsWith(rootPath)) {
    response.writeHead(403).end();
    return;
  }

  let filePath = sourcePath;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // Foto di assets/ yang dulu JPEG/PNG dan kini WebP: alamat lama (halaman yang masih
    // ter-cache, tautan lama, hasil pencarian gambar) dialihkan ke berkas WebP-nya.
    const penggantiWebp = /^assets\/.+\.(jpe?g|png)$/i.test(normalizedPath) ? filePath.replace(/\.(jpe?g|png)$/i, '.webp') : null;
    if (penggantiWebp && fs.existsSync(penggantiWebp) && fs.statSync(penggantiWebp).isFile()) {
      response.writeHead(301, {
        Location: `/${normalizedPath.replace(/\.(jpe?g|png)$/i, '.webp')}`,
        'Cache-Control': 'public, max-age=86400'
      });
      response.end();
      return;
    }
    notFound(response, rootDirectory);
    return;
  }

  const relativePath = path.relative(rootPath, filePath).split(path.sep).join('/');
  sendFile(response, request, filePath, search, transformHtml && ((html) => transformHtml(relativePath, html)), privateHtml);
}

module.exports = { MIME_TYPES, SERVABLE_EXTENSIONS, sendFile, serveStaticFile };
