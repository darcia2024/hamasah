// Dimuat di <head> keenam halaman konsol, sebelum halaman tergambar.
//
// Bila tab ini sudah memegang sesi, kartu "Memeriksa hak akses" dan form masuk tidak
// perlu dikedipkan selama pengecekan sesi berjalan: staff.css menyembunyikannya lewat
// kelas has-portal-session dan menampilkan tanda memuat yang tenang. Bila sesi ternyata
// tidak berlaku, internal-shell.js mencabut kelas ini sehingga kartunya langsung tampil.
(function sessionHint() {
  try {
    if (sessionStorage.getItem('hamasahPortalSession')) {
      document.documentElement.classList.add('has-portal-session');
    } else {
      // Sisa jawaban /api/me dari sesi yang sudah keluar tidak perlu disimpan.
      sessionStorage.removeItem('hamasahMeCache');
    }
  } catch {
    /* penyimpanan tidak tersedia: tampilan bawaan dipakai */
  }
}());
