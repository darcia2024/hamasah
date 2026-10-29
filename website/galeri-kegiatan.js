// Galeri kegiatan publik: hanya foto yang sudah disetujui (persetujuan wali atau pihak berwenang dan keputusan admin).
// Data dari /api/galeri-publik; gambar disajikan dari domain sendiri lewat /media/galeri-kegiatan (CSP img-src 'self').
(function initGaleriKegiatan() {
  const daftar = document.querySelector('#galeri-publik');
  const status = document.querySelector('#galeri-status');
  if (!daftar || !status) return;
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function kartu(f) {
    const li = document.createElement('li');
    li.className = 'team-card';
    const img = document.createElement('img');
    img.src = `/media/galeri-kegiatan/${encodeURIComponent(f.id)}.jpg?u=kecil`;
    img.alt = f.caption || 'Foto kegiatan santri Hamasah';
    img.loading = 'lazy';
    img.decoding = 'async';
    const nama = document.createElement('p');
    nama.className = 'team-card__name';
    nama.textContent = f.caption || 'Kegiatan santri';
    const info = document.createElement('p');
    info.className = 'team-card__role';
    info.textContent = [f.categoryLabel && f.category !== 'lainnya' ? f.categoryLabel : '', f.takenOn ? TANGGAL.format(new Date(`${f.takenOn}T00:00:00Z`)) : ''].filter(Boolean).join(' · ');
    li.append(img, nama, info);
    return li;
  }

  fetch('/api/galeri-publik')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('gagal'))))
    .then((data) => {
      const items = data.items || [];
      status.textContent = items.length ? '' : 'Belum ada foto yang ditampilkan. Kunjungi kembali nanti.';
      daftar.replaceChildren(...items.map(kartu));
    })
    .catch(() => { status.textContent = 'Galeri belum dapat dimuat. Muat ulang halaman beberapa saat lagi.'; });
}());
