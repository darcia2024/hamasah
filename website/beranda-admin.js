// Beranda super admin (16 Oktober 2026): bagian "Operasional" di bawah angka utama,
// supaya pemilik melihat pendaftaran, belajar (LMS), dan keuangan dalam satu layar
// bersama pembinaan. Data dari ringkasan yang sudah dipakai beranda peran lain:
//   GET /api/registrations/ringkasan, GET /api/lms/ringkasan-guru, GET /api/operations/ringkasan.
// Kartu yang gagal dimuat menampilkan pesan sendiri tanpa mengganggu kartu lain.
(function initBerandaAdmin() {
  const TAHAP = [
    ['submitted', 'Data baru masuk'],
    ['document-review', 'Pemeriksaan berkas'],
    ['needs-revision', 'Perlu perbaikan'],
    ['academic-preparation', 'Persiapan akademik'],
    ['ready-for-departure', 'Siap berangkat']
  ];
  const BULAN = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function rupiahRingkas(nilai) {
    const n = Number(nilai) || 0;
    if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
    if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
    return `Rp ${n.toLocaleString('id-ID')}`;
  }

  async function ambil(url, headers) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('Ringkasan belum dapat dimuat.');
    return response.json();
  }

  function kartu(judul, href, labelTautan) {
    const wadah = el('section', 'admin-ops-card');
    const kepala = el('div', 'admin-ops-card__head');
    kepala.append(el('h4', 'admin-ops-card__title', judul));
    const tautan = el('a', 'admin-link', labelTautan);
    tautan.href = href;
    kepala.append(tautan);
    const isi = el('div', 'admin-ops-card__body');
    const memuat = el('p', 'admin-empty', 'Memuat...');
    memuat.setAttribute('role', 'status');
    isi.append(memuat);
    wadah.append(kepala, isi);
    return { wadah, isi };
  }

  function angka(label, nilai, catatan, nada = '') {
    const kotak = el('div', `admin-ops-figure ${nada ? `is-${nada}` : ''}`.trim());
    kotak.append(el('span', 'admin-ops-figure__label', label), el('strong', 'admin-ops-figure__value', nilai));
    if (catatan) kotak.append(el('span', 'admin-ops-figure__note', catatan));
    return kotak;
  }

  function butirTindak(teks, href) {
    const a = el('a', 'admin-ops-flag', teks);
    a.href = href;
    return a;
  }

  function isiPendaftaran(isi, r) {
    const per = r.byStatus || {};
    const berjalan = TAHAP.reduce((jumlah, [status]) => jumlah + (per[status] || 0), 0);
    const terbesar = Math.max(1, ...TAHAP.map(([status]) => per[status] || 0));
    const ringkas = el('p', 'admin-ops-lead');
    ringkas.append(el('strong', '', String(berjalan)), document.createTextNode(` pendaftaran berjalan · ${per.completed || 0} selesai`));
    const corong = el('ul', 'admin-ops-funnel');
    TAHAP.forEach(([status, label]) => {
      const nilai = per[status] || 0;
      const baris = el('li', `admin-ops-funnel__row ${status === 'needs-revision' && nilai ? 'is-perlu' : ''}`.trim());
      const batang = el('span', 'admin-ops-funnel__bar');
      const isiBatang = el('span', 'admin-ops-funnel__fill');
      isiBatang.style.width = `${Math.round((nilai / terbesar) * 100)}%`;
      batang.append(isiBatang);
      baris.append(el('span', 'admin-ops-funnel__label', label), batang, el('strong', 'admin-ops-funnel__value', String(nilai)));
      corong.append(baris);
    });
    const tindak = el('div', 'admin-ops-flags');
    if (r.stale) tindak.append(butirTindak(`${r.stale} belum disentuh > ${r.staleDays || 3} hari`, 'staff#baru-tertunda'));
    if (r.overdueSteps) tindak.append(butirTindak(`${r.overdueSteps} tindak lanjut lewat tenggat`, 'staff#agenda'));
    if (r.pendingDocuments) tindak.append(butirTindak(`${r.pendingDocuments} berkas menunggu review`, 'staff#berkas-menunggu'));
    if (r.newInquiries) tindak.append(butirTindak(`${r.newInquiries} pesan konsultasi baru`, 'staff#pesan-konsultasi'));
    isi.replaceChildren(ringkas, corong, ...(tindak.childElementCount ? [tindak] : []));
  }

  function isiBelajar(isi, r) {
    const totals = r.totals || {};
    const courses = (r.courses || []).slice().sort((a, b) => (b.students || 0) - (a.students || 0));
    const grid = el('div', 'admin-ops-figures');
    grid.append(
      angka('Maddah aktif', String(totals.courses || 0)),
      angka('Peserta', String(totals.students || 0), 'santri x maddah'),
      angka('Tugas belum dinilai', String(totals.pending || 0), null, totals.pending ? 'perlu' : '')
    );
    const daftar = el('ul', 'admin-ops-list');
    if (!courses.length) daftar.append(el('li', 'admin-empty', 'Belum ada maddah. Guru membuat maddah dari halaman LMS.'));
    courses.slice(0, 4).forEach((c) => {
      const baris = el('li', 'admin-ops-list__row');
      baris.append(el('span', 'admin-ops-list__name', c.title), el('span', 'admin-ops-list__meta', `${c.materials} materi · ${c.students} santri${c.pending ? ` · ${c.pending} menunggu dinilai` : ''}`));
      daftar.append(baris);
    });
    isi.replaceChildren(grid, daftar);
  }

  function isiKeuangan(isi, r) {
    const bulan = r.month ? BULAN.format(new Date(`${r.month}-01T00:00:00Z`)) : 'bulan ini';
    const grid = el('div', 'admin-ops-figures');
    grid.append(
      angka('Terkumpul', rupiahRingkas(r.collectedThisMonth && r.collectedThisMonth.total), `${(r.collectedThisMonth && r.collectedThisMonth.count) || 0} pembayaran, ${bulan}`, 'baik'),
      angka('Belum lunas', rupiahRingkas(r.outstanding && r.outstanding.total), `${(r.outstanding && r.outstanding.count) || 0} tagihan`),
      angka(`Menunggak > ${r.overdueDays || 30} hari`, rupiahRingkas(r.overdue && r.overdue.total), `${(r.overdue && r.overdue.count) || 0} tagihan`, r.overdue && r.overdue.count ? 'perlu' : '')
    );
    const tindak = el('div', 'admin-ops-flags');
    const visa = r.visa || {};
    if (visa.expired) tindak.append(butirTindak(`${visa.expired} visa sudah habis`, 'operations#visa'));
    if (visa.expiring) tindak.append(butirTindak(`${visa.expiring} visa segera habis`, 'operations#visa'));
    if (r.issuedThisMonth) {
      tindak.append(el('span', 'admin-ops-flag is-netral', `${r.issuedThisMonth.count} tagihan terbit ${bulan}, ${rupiahRingkas(r.issuedThisMonth.total)}`));
    }
    isi.replaceChildren(grid, ...(tindak.childElementCount ? [tindak] : []));
  }

  // Bagian "Operasional": tiga kartu yang dimuat bersamaan.
  function operasional(headers) {
    const bagian = el('section', 'admin-ops');
    bagian.setAttribute('aria-labelledby', 'admin-ops-title');
    const kepala = el('div', 'admin-section-head');
    const judul = el('h3', 'admin-section-title', 'Operasional');
    judul.id = 'admin-ops-title';
    kepala.append(judul);
    const grid = el('div', 'admin-ops-grid');
    const daftar = kartu('Pendaftaran', 'staff', 'Buka pendaftaran');
    const belajar = kartu('Belajar (LMS)', 'lms', 'Buka LMS');
    const uang = kartu('Keuangan & visa', 'operations', 'Buka keuangan');
    grid.append(daftar.wadah, belajar.wadah, uang.wadah);
    bagian.append(kepala, grid);

    const pasang = (url, wadah, isi) => ambil(url, headers)
      .then((data) => isi(wadah, data))
      .catch((error) => { wadah.replaceChildren(el('p', 'admin-empty', error.message)); });
    pasang('/api/registrations/ringkasan', daftar.isi, isiPendaftaran);
    pasang('/api/lms/ringkasan-guru', belajar.isi, isiBelajar);
    pasang('/api/operations/ringkasan', uang.isi, isiKeuangan);
    return bagian;
  }

  window.HamasahBerandaAdmin = Object.freeze({ operasional });
})();
