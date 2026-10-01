// Build command Vercel (vercel.json). Membuat folder statis nyaris kosong sebagai output
// supaya Vercel tidak menyajikan isi repo (server/, database/, server.js) sebagai
// file publik. Semua permintaan, termasuk halaman website, dilayani api/index.js,
// sehingga header keamanan dan CSP selalu berlaku.
const fs = require('node:fs');
const path = require('node:path');

const output = path.join(__dirname, '..', 'vercel-static');
fs.mkdirSync(output, { recursive: true });
// Vercel menolak folder output yang benar-benar kosong, jadi diisi satu penanda.
fs.writeFileSync(path.join(output, '_static.txt'), 'Halaman Hamasah dilayani api/index.js.\n');
console.log('[vercel-static] folder output statis siap (hanya berisi penanda).');
