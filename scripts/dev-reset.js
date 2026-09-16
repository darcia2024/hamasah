// Menghapus database pengembangan lokal supaya bisa dimulai dari kosong.
const fs = require('node:fs');
const path = require('node:path');

const DEV_DATABASE_DIRECTORY = path.join(__dirname, '..', 'data', 'dev-db');

// Pengaman: hanya folder data/dev-db yang boleh dihapus.
if (path.basename(DEV_DATABASE_DIRECTORY) !== 'dev-db' || path.basename(path.dirname(DEV_DATABASE_DIRECTORY)) !== 'data') {
  console.error('[dev] Folder yang akan dihapus tidak sesuai. Perintah dibatalkan.');
  process.exitCode = 1;
} else if (!fs.existsSync(DEV_DATABASE_DIRECTORY)) {
  console.log('[dev] Database pengembangan belum ada, tidak ada yang dihapus.');
} else {
  fs.rmSync(DEV_DATABASE_DIRECTORY, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  console.log('[dev] Database pengembangan dihapus. Jalankan npm run dev untuk membuatnya kembali.');
}
