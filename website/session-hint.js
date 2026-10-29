// Dimuat di <head> keenam halaman konsol, sebelum halaman tergambar.
//
// Bila tab ini sudah memegang sesi, kartu "Memeriksa hak akses" dan form masuk tidak
// perlu dikedipkan selama pengecekan sesi berjalan: staff.css menyembunyikannya lewat
// kelas has-portal-session dan menampilkan tanda memuat yang tenang. Bila sesi ternyata
// tidak berlaku, internal-shell.js mencabut kelas ini sehingga kartunya langsung tampil.
(function sessionHint() {
  try {
    // Wali dan santri yang memilih "Tetap masuk" dipulihkan ke sesi tab ini (aplikasi terpasang dibuka ulang = tab baru).
    if (!sessionStorage.getItem('hamasahPortalSession')) {
      const ingat = JSON.parse(localStorage.getItem('hamasahIngat') || 'null');
      if (ingat && ingat.accessToken && ['parent', 'student'].includes(ingat.role)) sessionStorage.setItem('hamasahPortalSession', JSON.stringify({ accessToken: ingat.accessToken }));
    }
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
