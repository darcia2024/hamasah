// Penyajian berkas statis: halaman website dan aset.
// Hanya folder website/ dan assets/ yang boleh dibaca.

const fs = require('node:fs');
const path = require('node:path');

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
  '.webp': 'image/webp'
});

const ALLOWED_PREFIXES = Object.freeze(['website/', 'assets/']);

function notFound(response) {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Halaman tidak ditemukan.');
}

function serveStaticFile(response, { pathname, rootDirectory }) {
  if (pathname === '/website') {
    response.writeHead(301, { Location: '/website/' });
    response.end();
    return;
  }

  if (pathname === '/proposal' || pathname === '/hamasah') {
    response.writeHead(301, { Location: `${pathname}/` });
    response.end();
    return;
  }

  const requestedPath = pathname === '/' ? '/website/' : pathname;
  // Backslash disamakan dengan garis miring lebih dulu. Di Windows path.resolve
  // memperlakukan "\" sebagai pemisah folder, sedangkan path.posix.normalize tidak,
  // jadi "/website/..\.env" bisa lolos pemeriksaan awalan lalu keluar dari folder.
  // Parser URL memang sudah merapikannya, tetapi modul ini tidak boleh bergantung
  // pada pemanggilnya untuk urusan ini.
  const withSlashes = requestedPath.replaceAll('\\', '/');
  // normalize lebih dulu, supaya "/website/../.env" tidak lolos pemeriksaan awalan.
  let normalizedPath = path.posix.normalize(withSlashes).replace(/^\/+/, '');

  if (normalizedPath.startsWith('proposal/') || normalizedPath.startsWith('hamasah/')) {
    const subPath = normalizedPath.replace(/^(proposal|hamasah)\/?/, '');
    const proposalFile = subPath === '' ? 'index.html' : subPath;
    const safeProposalPath = path.posix.normalize(proposalFile);
    const allowedProposalFiles = ['index.html', 'styles.css', 'cinematic.css', 'proposal.css', 'app.js'];
    if (allowedProposalFiles.includes(safeProposalPath)) {
      const target = path.resolve(rootDirectory, safeProposalPath);
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        const ext = path.extname(target).toLocaleLowerCase('en-US');
        response.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff'
        });
        fs.createReadStream(target).pipe(response);
        return;
      }
    }
  }

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
        notFound(response);
        return;
      }
    } else {
      notFound(response);
      return;
    }
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
    notFound(response);
    return;
  }

  const extension = path.extname(filePath).toLocaleLowerCase('en-US');
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(filePath).pipe(response);
}

module.exports = { MIME_TYPES, serveStaticFile };
