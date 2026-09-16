// Menentukan alamat IP pemanggil.
//
// X-Forwarded-For bisa diisi siapa saja. Kalau header itu dipercaya tanpa syarat,
// penyerang cukup mengganti isinya setiap permintaan untuk membuat pembatas laju
// tidak berguna, dan catatan audit jadi berisi alamat karangan. Karena itu header
// hanya dibaca kalau TRUST_PROXY=true, yaitu ketika aplikasi memang berada di
// belakang proxy platform yang menulis header itu sendiri.
//
// Saat dipercaya, yang diambil adalah alamat PALING KANAN, karena itulah yang
// ditambahkan proxy terdekat. Alamat di sebelah kirinya berasal dari pengirim dan
// bisa dikarang.

function clientIp(request, { trustProxy = false } = {}) {
  const alamatSoket = (request.socket && request.socket.remoteAddress) || '';
  if (!trustProxy) {
    return alamatSoket;
  }
  const header = String(request.headers['x-forwarded-for'] || '');
  const daftar = header.split(',').map((bagian) => bagian.trim()).filter(Boolean);
  return daftar.length ? daftar[daftar.length - 1] : alamatSoket;
}

module.exports = { clientIp };
