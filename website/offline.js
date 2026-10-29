// Halaman offline: tombol mencoba memuat ulang halaman yang tadi dibuka.
document.querySelector('#coba-lagi').addEventListener('click', () => window.location.reload());
window.addEventListener('online', () => window.location.reload());