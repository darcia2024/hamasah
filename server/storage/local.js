// Penyimpanan berkas di disk, untuk pengembangan dan test.
//
// Folder tujuannya di luar folder yang disajikan web server (website/ dan assets/),
// jadi berkas di sini tidak bisa diambil lewat URL biasa. Satu-satunya jalan
// mengunduhnya adalah lewat endpoint yang memeriksa izin lebih dulu.

const fs = require('node:fs');
const path = require('node:path');

function createLocalStorage({ rootDirectory } = {}) {
  const root = rootDirectory || path.join(process.cwd(), 'data', 'dev-storage');

  // Kunci penyimpanan dibuat sendiri oleh aplikasi, tetapi jalurnya tetap diperiksa
  // supaya perubahan di kemudian hari tidak diam-diam membuka jalan keluar folder.
  function resolveKey(bucket, key) {
    const bucketRoot = path.resolve(root, bucket);
    const target = path.resolve(bucketRoot, key.replaceAll('\\', '/'));
    if (target !== bucketRoot && !target.startsWith(bucketRoot + path.sep)) {
      throw new Error('Kunci penyimpanan keluar dari folder bucket.');
    }
    return target;
  }

  return {
    kind: 'local',
    // Driver lokal tidak bisa membuat tautan bertanda tangan, jadi unduhan
    // di-stream oleh aplikasi sendiri.
    supportsSignedUrl: false,

    async upload(bucket, key, buffer) {
      const target = resolveKey(bucket, key);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      // flag 'wx' gagal kalau berkasnya sudah ada, sama seperti upsert: false.
      await fs.promises.writeFile(target, buffer, { flag: 'wx' });
    },

    async read(bucket, key) {
      return fs.promises.readFile(resolveKey(bucket, key));
    },

    async remove(bucket, key) {
      await fs.promises.rm(resolveKey(bucket, key), { force: true });
    },

    async signedUrl() {
      return null;
    }
  };
}

module.exports = { createLocalStorage };
