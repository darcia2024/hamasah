// Halaman kelas daring (kelas): katalog, daftar atau masuk, membeli kelas, dan pesanan.
//
// Sesi disimpan di kunci yang sama dengan portal dan LMS (hamasahPortalSession), jadi setelah
// masuk di sini pembeli langsung bisa membuka Ruang belajar tanpa masuk lagi. Pembayaran
// lewat transfer: pembeli mengonfirmasi ke admin lewat WhatsApp, admin keuangan menandai
// tagihannya lunas, dan kelas terbuka otomatis (server/course-shop-service.js).

const KUNCI_SESI = 'hamasahPortalSession';
const NOMOR_ADMIN = String((document.querySelector('meta[name="hamasah-whatsapp"]') || {}).content || '6281288489997').replace(/\D/g, '');
const RUPIAH = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

const el = {
  akun: document.querySelector('#kelas-akun'),
  katalog: document.querySelector('#katalog'),
  katalogStatus: document.querySelector('#katalog-status'),
  pesanan: document.querySelector('#pesanan'),
  daftarPesanan: document.querySelector('#daftar-pesanan'),
  rekening: document.querySelector('#pesanan-rekening'),
  bagianAkun: document.querySelector('#akun'),
  tabDaftar: document.querySelector('#tab-daftar'),
  tabMasuk: document.querySelector('#tab-masuk'),
  formDaftar: document.querySelector('#form-daftar'),
  formMasuk: document.querySelector('#form-masuk')
};

const keadaan = { akun: null, katalog: [], ringkasan: null, kelasDitunda: null };

function sesi() {
  try { return JSON.parse(sessionStorage.getItem(KUNCI_SESI) || 'null'); } catch { return null; }
}

function simpanSesi(accessToken) {
  sessionStorage.setItem(KUNCI_SESI, JSON.stringify({ accessToken }));
}

async function api(path, options = {}) {
  const token = (sesi() || {}).accessToken;
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body: body || {} };
}

function pembeli() {
  return Boolean(keadaan.akun && keadaan.akun.role === 'student');
}

function setStatus(node, teks, jenis) {
  node.textContent = teks || '';
  node.classList.toggle('is-error', jenis === 'error');
}

function pilihTab(nama) {
  const daftar = nama !== 'masuk';
  el.tabDaftar.setAttribute('aria-selected', String(daftar));
  el.tabMasuk.setAttribute('aria-selected', String(!daftar));
  el.formDaftar.hidden = !daftar;
  el.formMasuk.hidden = daftar;
}

function bukaAkun(nama) {
  pilihTab(nama);
  el.bagianAkun.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const pertama = (nama === 'masuk' ? el.formMasuk : el.formDaftar).querySelector('input');
  if (pertama) setTimeout(() => pertama.focus({ preventScroll: true }), 400);
}

// ---------- Bilah akun di atas ----------

function renderAkun() {
  el.akun.replaceChildren();
  if (pembeli()) {
    const nama = document.createElement('span');
    nama.className = 'kelas-akun__nama';
    nama.textContent = `Masuk sebagai ${keadaan.akun.name}`;
    const belajar = document.createElement('a');
    belajar.className = 'button button--primary';
    belajar.href = 'lms';
    belajar.textContent = 'Buka Ruang belajar';
    const keluar = document.createElement('button');
    keluar.type = 'button';
    keluar.className = 'lp-link kelas-keluar';
    keluar.textContent = 'Keluar';
    keluar.addEventListener('click', keluarAkun);
    el.akun.append(nama, belajar, keluar);
    el.bagianAkun.hidden = true;
    return;
  }
  el.bagianAkun.hidden = false;
  if (keadaan.akun) {
    // Akun petugas atau wali: tidak bisa membeli dari akun ini.
    const catatan = document.createElement('span');
    catatan.className = 'kelas-akun__nama';
    catatan.textContent = `Anda masuk sebagai ${keadaan.akun.name} (akun petugas atau wali). Untuk membeli kelas, gunakan akun belajar terpisah.`;
    el.akun.append(catatan);
    return;
  }
  const daftar = document.createElement('a');
  daftar.className = 'button button--primary';
  daftar.href = '#akun';
  daftar.textContent = 'Daftar akun';
  daftar.addEventListener('click', (event) => { event.preventDefault(); bukaAkun('daftar'); });
  const masuk = document.createElement('a');
  masuk.className = 'lp-link';
  masuk.href = '#akun';
  masuk.textContent = 'Sudah punya akun? Masuk';
  masuk.addEventListener('click', (event) => { event.preventDefault(); bukaAkun('masuk'); });
  el.akun.append(daftar, masuk);
}

// ---------- Katalog ----------

function statusKelas(courseId) {
  const ringkasan = keadaan.ringkasan;
  if (!ringkasan) return 'beli';
  if (ringkasan.enrolledCourseIds.includes(courseId)) return 'aktif';
  if (ringkasan.orders.some((order) => order.courseId === courseId && order.status === 'unpaid')) return 'menunggu';
  return 'beli';
}

function renderKatalog() {
  el.katalog.replaceChildren(...keadaan.katalog.map((kelas) => {
    const li = document.createElement('li');
    li.className = 'kelas-kartu';
    const judul = document.createElement('h3');
    judul.textContent = kelas.title;
    const isi = document.createElement('p');
    isi.textContent = kelas.description;
    const info = document.createElement('p');
    info.className = 'kelas-kartu__info';
    info.textContent = kelas.materialCount ? `${kelas.materialCount} materi` : 'Materi sedang disiapkan';
    const kaki = document.createElement('div');
    kaki.className = 'kelas-kartu__kaki';
    const harga = document.createElement('strong');
    harga.className = 'kelas-kartu__harga';
    harga.textContent = RUPIAH.format(kelas.price);
    const status = statusKelas(kelas.id);
    let aksi;
    if (status === 'aktif') {
      aksi = document.createElement('a');
      aksi.className = 'button button--secondary';
      aksi.href = 'lms';
      aksi.textContent = 'Mulai belajar';
    } else {
      aksi = document.createElement('button');
      aksi.type = 'button';
      aksi.className = status === 'menunggu' ? 'button button--secondary' : 'button button--primary';
      aksi.textContent = status === 'menunggu' ? 'Lihat cara bayar' : 'Beli kelas';
      aksi.addEventListener('click', () => beliKelas(kelas.id, aksi));
    }
    kaki.append(harga, aksi);
    li.append(judul, isi, info, kaki);
    return li;
  }));
}

// Tanpa kelas yang bisa dibeli di sini, formulir daftar akun pembeli dan ajakannya tidak ditawarkan, supaya pengunjung
// tidak membuat akun yang tidak bisa dipakai. Pembeli yang sudah punya akun tetap melihat pesanannya.
function sembunyikanAkunPembeli() {
  if (pembeli()) return;
  const bagian = document.querySelector('#akun');
  if (bagian) bagian.hidden = true;
  document.querySelectorAll('a[href="#akun"], a[href="#form-daftar"], a[href="#form-masuk"]').forEach((a) => { a.hidden = true; });
}

async function muatKatalog() {
  try {
    const hasil = await api('/api/kelas');
    // Kelas berbayar umum dilayani di website learning terpisah bila admin mengaturnya; LMS di sini khusus santri.
    const alihan = hasil.ok && typeof hasil.body.redirectUrl === 'string' ? hasil.body.redirectUrl : '';
    if (alihan.startsWith('https://')) {
      const kartu = document.createElement('li');
      kartu.className = 'kelas-kartu';
      const judul = document.createElement('h3');
      judul.textContent = 'Kelas berbayar untuk umum';
      const isi = document.createElement('p');
      isi.textContent = 'Kelas Hamasah Courses untuk masyarakat umum dilayani di website learning kami. Pendaftaran dan pembayaran dilakukan di sana.';
      const tautan = document.createElement('a');
      tautan.className = 'button button--primary';
      tautan.href = alihan;
      tautan.rel = 'noopener noreferrer';
      tautan.textContent = 'Buka website learning';
      kartu.append(judul, isi, tautan);
      el.katalog.replaceChildren(kartu);
      setStatus(el.katalogStatus, '');
      sembunyikanAkunPembeli();
      return;
    }
    keadaan.katalog = hasil.ok ? hasil.body.items || [] : [];
    setStatus(el.katalogStatus, keadaan.katalog.length ? '' : 'Belum ada kelas daring yang dibuka. Kelas berbayar untuk umum sedang disiapkan di website learning Hamasah; tanyakan jadwal terdekat ke admin lewat WhatsApp.');
    if (!keadaan.katalog.length) sembunyikanAkunPembeli();
    renderKatalog();
  } catch {
    setStatus(el.katalogStatus, 'Daftar kelas belum dapat dimuat. Periksa koneksi lalu muat ulang halaman.', 'error');
  }
}

// ---------- Pesanan ----------

function pesanKonfirmasi(order) {
  const baris = [
    "Assalamu'alaikum, admin Hamasah International.",
    '',
    'Saya sudah memesan kelas daring dan ingin mengonfirmasi pembayaran.',
    `Nama: ${keadaan.akun ? keadaan.akun.name : ''}`,
    `Email: ${keadaan.akun ? keadaan.akun.email : ''}`,
    `Kelas: ${order.courseTitle}`,
    `Nomor tagihan: ${order.invoiceNumber}`,
    `Jumlah: ${RUPIAH.format(order.amount)}`,
    '',
    'Bukti transfer saya lampirkan. Terima kasih.'
  ];
  return `https://wa.me/${NOMOR_ADMIN}?text=${encodeURIComponent(baris.join('\n'))}`;
}

const LABEL_STATUS = { unpaid: 'Menunggu pembayaran', paid: 'Pembayaran diterima', voided: 'Dibatalkan' };

function renderPesanan() {
  const ringkasan = keadaan.ringkasan;
  if (!ringkasan || !ringkasan.orders.length) {
    el.pesanan.hidden = true;
    return;
  }
  el.pesanan.hidden = false;
  el.rekening.textContent = ringkasan.bankAccount
    ? `Transfer sesuai jumlah tagihan ke ${ringkasan.bankAccount}, lalu kirim bukti transfer ke admin lewat tombol konfirmasi. Kelas terbuka setelah pembayaran dicek.`
    : 'Tekan tombol konfirmasi untuk meminta nomor rekening dan mengirim bukti transfer ke admin. Kelas terbuka setelah pembayaran dicek.';
  el.daftarPesanan.replaceChildren(...ringkasan.orders.map((order) => {
    const li = document.createElement('li');
    li.className = `kelas-pesanan__item is-${order.status}`;
    const kiri = document.createElement('div');
    const judul = document.createElement('strong');
    judul.textContent = order.courseTitle;
    const detail = document.createElement('span');
    detail.textContent = `${order.invoiceNumber} · ${RUPIAH.format(order.amount)}`;
    const status = document.createElement('span');
    status.className = 'kelas-pesanan__status';
    const aksesAktif = ringkasan.enrolledCourseIds.includes(order.courseId);
    status.textContent = aksesAktif ? 'Aktif' : order.status === 'paid'
      ? 'Pembayaran diterima, akses sedang disiapkan' : LABEL_STATUS[order.status] || order.status;
    kiri.append(judul, detail, status);
    li.append(kiri);
    if (order.status === 'unpaid') {
      const wa = document.createElement('a');
      wa.className = 'button button--primary';
      wa.href = pesanKonfirmasi(order);
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.textContent = 'Konfirmasi lewat WhatsApp';
      li.append(wa);
    } else if (order.status === 'paid' && aksesAktif) {
      const belajar = document.createElement('a');
      belajar.className = 'button button--secondary';
      belajar.href = 'lms';
      belajar.textContent = 'Mulai belajar';
      li.append(belajar);
    }
    return li;
  }));
}

async function muatRingkasan() {
  keadaan.ringkasan = null;
  if (pembeli()) {
    const hasil = await api('/api/kelas/saya');
    if (hasil.ok) keadaan.ringkasan = hasil.body;
  }
  renderPesanan();
  renderKatalog();
}

async function beliKelas(courseId, tombol) {
  if (!pembeli()) {
    keadaan.kelasDitunda = courseId;
    bukaAkun(keadaan.akun ? 'masuk' : 'daftar');
    return;
  }
  if (statusKelas(courseId) === 'menunggu') {
    el.pesanan.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (tombol) {
    tombol.disabled = true;
    tombol.textContent = 'Memesan...';
  }
  const hasil = await api(`/api/kelas/${courseId}/beli`, { method: 'POST' });
  await muatRingkasan();
  if (!hasil.ok) {
    setStatus(el.katalogStatus, hasil.body.error || 'Kelas belum dapat dipesan. Coba lagi sebentar.', 'error');
    return;
  }
  setStatus(el.katalogStatus, `Pesanan ${hasil.body.order.invoiceNumber} dibuat. Lanjutkan pembayaran di bagian Pesanan saya.`);
  el.pesanan.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Akun ----------

async function muatAkun() {
  keadaan.akun = null;
  if ((sesi() || {}).accessToken) {
    const hasil = await api('/api/me');
    if (hasil.ok) keadaan.akun = hasil.body.account;
    else sessionStorage.removeItem(KUNCI_SESI);
  }
  renderAkun();
}

async function setelahMasuk(accessToken) {
  simpanSesi(accessToken);
  await muatAkun();
  await muatRingkasan();
  const ditunda = keadaan.kelasDitunda;
  keadaan.kelasDitunda = null;
  if (ditunda && pembeli()) await beliKelas(ditunda);
  else document.querySelector('#katalog-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function keluarAkun() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  sessionStorage.removeItem(KUNCI_SESI);
  keadaan.akun = null;
  keadaan.ringkasan = null;
  renderAkun();
  renderPesanan();
  renderKatalog();
}

el.tabDaftar.addEventListener('click', () => pilihTab('daftar'));
el.tabMasuk.addEventListener('click', () => pilihTab('masuk'));

el.formDaftar.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = el.formDaftar.querySelector('#daftar-status');
  const tombol = el.formDaftar.querySelector('button[type="submit"]');
  const data = {
    name: el.formDaftar.querySelector('#daftar-nama').value,
    email: el.formDaftar.querySelector('#daftar-email').value,
    city: el.formDaftar.querySelector('#daftar-kota').value,
    password: el.formDaftar.querySelector('#daftar-sandi').value,
    consent: el.formDaftar.querySelector('#daftar-setuju').checked
  };
  if (data.password.length < 12) {
    setStatus(status, 'Kata sandi minimal 12 karakter.', 'error');
    return;
  }
  tombol.disabled = true;
  setStatus(status, 'Membuat akun...');
  try {
    const hasil = await api('/api/kelas/daftar', { method: 'POST', body: data });
    if (!hasil.ok) {
      setStatus(status, hasil.status === 429 ? 'Terlalu banyak percobaan. Coba lagi sekitar satu jam lagi.' : hasil.body.error || 'Akun belum dapat dibuat.', 'error');
      if (hasil.body.field === 'email') pilihTab('masuk');
      return;
    }
    setStatus(status, '');
    el.formDaftar.reset();
    await setelahMasuk(hasil.body.accessToken);
  } catch {
    setStatus(status, 'Layanan belum dapat dihubungi. Periksa koneksi lalu coba lagi.', 'error');
  } finally {
    tombol.disabled = false;
  }
});

el.formMasuk.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = el.formMasuk.querySelector('#masuk-status');
  const tombol = el.formMasuk.querySelector('button[type="submit"]');
  tombol.disabled = true;
  setStatus(status, 'Memeriksa...');
  try {
    const hasil = await api('/api/auth/login', {
      method: 'POST',
      body: { email: el.formMasuk.querySelector('#masuk-email').value, password: el.formMasuk.querySelector('#masuk-sandi').value }
    });
    if (!hasil.ok) {
      setStatus(status, hasil.status === 429 ? 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.' : hasil.body.error || 'Email atau kata sandi tidak tepat.', 'error');
      return;
    }
    setStatus(status, '');
    el.formMasuk.reset();
    await setelahMasuk(hasil.body.accessToken);
  } catch {
    setStatus(status, 'Layanan belum dapat dihubungi. Periksa koneksi lalu coba lagi.', 'error');
  } finally {
    tombol.disabled = false;
  }
});

(async function mulai() {
  // Akun dimuat dulu: katalog perlu tahu apakah pengunjung pembeli yang sudah masuk.
  await muatAkun();
  await muatKatalog();
  await muatRingkasan();
})();
