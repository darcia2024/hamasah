// Dashboard super admin: ringkasan santri, asrama, dan musyrif dari /api/admin/overview.
//
// Dipakai portal.js untuk akun admin. Semua isi dibangun lewat textContent; tidak ada
// data dari server yang masuk innerHTML. Tidak ada angka karangan: setiap angka berasal
// dari catatan yang benar-benar diisi musyrif, petugas keuangan, atau admin.
(function initAdminOverview() {
  const RUPIAH = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  // "Rp 45,5 jt": muat di kartu angka tanpa terpotong; angka lengkap ada di bawahnya.
  const RUPIAH_RINGKAS = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', notation: 'compact', maximumFractionDigits: 1 });
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const WAKTU = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

  const LABEL_VISA = Object.freeze({
    'not-started': 'Belum dimulai',
    'collecting-documents': 'Kumpulkan berkas',
    legalization: 'Legalisasi',
    submitted: 'Diajukan',
    approved: 'Visa terbit',
    expired: 'Kedaluwarsa'
  });
  const LABEL_HAFALAN = Object.freeze({ lancar: 'Lancar', 'kurang-lancar': 'Kurang lancar', ulang: 'Diulang' });
  const LABEL_TINGKAT = Object.freeze({ tinggi: 'Segera', sedang: 'Pekan ini', info: 'Untuk diketahui' });
  const PERHATIAN_AWAL = 6;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tanggal(nilai) {
    return nilai ? TANGGAL.format(new Date(`${nilai}T00:00:00Z`)) : '';
  }

  function sisaHari(dari, ke) {
    return Math.round((new Date(`${ke}T00:00:00Z`) - new Date(`${dari}T00:00:00Z`)) / 86400000);
  }

  async function muat(headers) {
    const response = await fetch('/api/admin/overview', { headers });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Ringkasan belum dapat dimuat.');
    return body;
  }

  // ---------------------------------------------------------------------------
  // Angka utama

  function kartuAngka(label, nilai, catatan, nada) {
    const kartu = el('div', `admin-kpi${nada ? ` admin-kpi--${nada}` : ''}`);
    kartu.append(el('p', 'admin-kpi__label', label), el('p', 'admin-kpi__value', nilai), el('p', 'admin-kpi__note', catatan));
    return kartu;
  }

  function kpi(data) {
    const s = data.summary;
    const wadah = el('section', 'admin-kpi-section');
    wadah.setAttribute('aria-label', 'Ringkasan angka');
    const grid = el('div', 'admin-kpi-grid');
    const kosong = s.capacity > 0 ? Math.max(0, s.capacity - s.occupied) : null;
    grid.append(
      kartuAngka('Santri aktif', String(s.activeStudents),
        `${s.putra} putra, ${s.putri} putri${s.unplaced ? `, ${s.unplaced} belum berasrama` : ''}`, s.unplaced ? 'warn' : ''),
      kartuAngka('Keterisian asrama', s.capacity > 0 ? `${s.occupied}/${s.capacity}` : String(s.occupied),
        s.capacity > 0 ? `${s.dormitories} asrama, ${kosong} tempat kosong` : `${s.dormitories} asrama, kapasitas belum diisi`),
      kartuAngka('Musyrif aktif', String(s.supervisors),
        s.supervisorsWithoutDormitory ? `${s.supervisorsWithoutDormitory} belum ditugaskan` : 'Semua sudah memegang asrama', s.supervisorsWithoutDormitory ? 'warn' : ''),
      kartuAngka('Kehadiran 7 hari', s.attendanceRate7 === null ? 'Belum ada' : `${s.attendanceRate7}%`,
        s.prayerRate7 === null ? 'Sholat belum dicatat' : `Sholat berjamaah ${s.prayerRate7}%`),
      kartuAngka('Tagihan belum lunas', RUPIAH_RINGKAS.format(s.unpaidAmount),
        s.unpaidInvoices ? `${s.unpaidInvoices} tagihan, ${RUPIAH.format(s.unpaidAmount)}` : 'Semua tagihan lunas', s.unpaidInvoices ? 'warn' : ''),
      kartuAngka('Perlu perhatian', String(data.alerts.length),
        s.alertsHigh ? `${s.alertsHigh} perlu segera ditangani` : 'Tidak ada yang mendesak', s.alertsHigh ? 'danger' : '')
    );
    const program = s.programs.map((p) => `${p.label} ${p.count}`).join(', ');
    const rincian = el('p', 'admin-kpi-detail',
      `${program ? `Program: ${program}. ` : ''}${s.withoutParentAccount} santri belum terhubung ke akun wali.${s.truncated ? ' Daftar dipotong pada 1000 santri pertama.' : ''}`);
    wadah.append(grid, rincian);
    return wadah;
  }

  // ---------------------------------------------------------------------------
  // Perlu perhatian

  function tautanMonitoring() {
    const link = el('a', 'admin-link', 'Buka Monitoring');
    link.href = 'monitoring.html';
    return link;
  }

  function perhatian(data, { onOpenStudent }) {
    const wadah = el('section', 'admin-alerts');
    const kepala = el('div', 'admin-section-head');
    kepala.append(el('h3', 'admin-section-title', 'Perlu perhatian'),
      el('p', 'admin-section-note', `Diperbarui ${WAKTU.format(new Date(data.generatedAt))}`));
    wadah.append(kepala);

    if (!data.alerts.length) {
      wadah.append(el('p', 'admin-empty', 'Tidak ada yang perlu ditindaklanjuti saat ini.'));
      return wadah;
    }

    const daftar = el('ul', 'admin-alert-list');
    data.alerts.forEach((alert, indeks) => {
      const item = el('li', `admin-alert admin-alert--${alert.level}`);
      if (indeks >= PERHATIAN_AWAL) item.hidden = true;
      const isi = el('div', 'admin-alert__body');
      isi.append(el('p', 'admin-alert__level', LABEL_TINGKAT[alert.level] || alert.level), el('p', 'admin-alert__title', alert.title), el('p', 'admin-alert__detail', alert.detail));
      item.append(isi);
      if (alert.studentId) {
        const buka = el('button', 'admin-link', 'Buka santri');
        buka.type = 'button';
        buka.addEventListener('click', () => onOpenStudent(alert.studentId));
        item.append(buka);
      } else {
        item.append(tautanMonitoring());
      }
      daftar.append(item);
    });
    wadah.append(daftar);

    if (data.alerts.length > PERHATIAN_AWAL) {
      const semua = el('button', 'button button--secondary admin-more', `Tampilkan semua (${data.alerts.length})`);
      semua.type = 'button';
      semua.addEventListener('click', () => {
        daftar.querySelectorAll('.admin-alert[hidden]').forEach((item) => { item.hidden = false; });
        semua.remove();
      });
      wadah.append(semua);
    }
    return wadah;
  }

  // ---------------------------------------------------------------------------
  // Tabel santri

  function sel(baris, isi, nada) {
    const td = el('td', nada ? `is-${nada}` : '');
    if (Array.isArray(isi)) td.append(...isi);
    else td.textContent = isi;
    baris.append(td);
    return td;
  }

  function duaBaris(utama, kecil) {
    return [el('span', 'admin-cell-main', utama), el('span', 'admin-cell-sub', kecil)];
  }

  function perluPerhatian(data) {
    return new Set(data.alerts.filter((a) => a.studentId).map((a) => a.studentId));
  }

  function barisSantri(data, s, onOpenStudent) {
    const tr = el('tr');
    const nama = el('button', 'admin-student-name', s.name);
    nama.type = 'button';
    nama.addEventListener('click', () => onOpenStudent(s.id));
    sel(tr, [nama, el('span', 'admin-cell-sub', s.program)]);
    sel(tr, s.dormitory ? s.dormitory.name : 'Belum ditempatkan', s.dormitory ? '' : 'warn');

    const hadir = s.attendance7;
    if (!hadir.recorded) sel(tr, 'Belum dicatat', 'muted');
    else sel(tr, duaBaris(`${hadir.present + hadir.late}/${hadir.recorded} hadir`, hadir.absent ? `${hadir.absent} alpa` : (hadir.late ? `${hadir.late} terlambat` : 'Tanpa alpa')), hadir.absent >= 2 ? 'danger' : (hadir.absent ? 'warn' : ''));

    const sholat = s.prayers7;
    if (!sholat.recorded) sel(tr, 'Belum dicatat', 'muted');
    else sel(tr, duaBaris(`${sholat.congregational}/${sholat.recorded} berjamaah`, sholat.missed ? `${sholat.missed} terlewat` : 'Tidak ada yang terlewat'), sholat.missed >= 2 ? 'warn' : '');

    const hafalan = s.memorization.last;
    if (!hafalan) sel(tr, 'Belum ada setoran', 'muted');
    else sel(tr, duaBaris(hafalan.portion, `${LABEL_HAFALAN[hafalan.grade] || hafalan.grade}, ${tanggal(hafalan.date)}`), hafalan.grade === 'ulang' ? 'warn' : '');

    if (data.healthEnabled) {
      if (!s.health) sel(tr, 'Tidak ada catatan', 'muted');
      else sel(tr, duaBaris(s.health.label, tanggal(s.health.date)), ['dirujuk', 'perlu-perhatian'].includes(s.health.condition) ? 'danger' : (s.health.condition === 'sakit-ringan' ? 'warn' : ''));
    }

    const bayar = s.billing;
    sel(tr, bayar.unpaidCount ? duaBaris(RUPIAH.format(bayar.unpaidAmount), `${bayar.unpaidCount} belum lunas`) : 'Lunas', bayar.unpaidCount ? 'warn' : '');

    if (!s.visa) {
      sel(tr, 'Belum dicatat', 'muted');
    } else {
      const habis = s.visa.visaExpiresAt ? sisaHari(data.today, s.visa.visaExpiresAt) : null;
      const nada = habis !== null && habis < 0 ? 'danger' : (habis !== null && habis <= 30 ? 'warn' : '');
      sel(tr, duaBaris(LABEL_VISA[s.visa.status] || s.visa.status, s.visa.visaExpiresAt ? `Berlaku s.d. ${tanggal(s.visa.visaExpiresAt)}` : 'Tanggal belum diisi'), nada);
    }

    sel(tr, s.parentAccounts ? 'Terhubung' : 'Belum', s.parentAccounts ? '' : 'muted');
    return tr;
  }

  function pilihan(label, nilaiDanTeks) {
    const wadah = el('label', 'admin-filter');
    wadah.append(el('span', 'admin-filter__label', label));
    const select = el('select', 'monitoring-select');
    nilaiDanTeks.forEach(([nilai, teks]) => select.add(new Option(teks, nilai)));
    wadah.append(select);
    return { wadah, select };
  }

  function panelSantri(data, { onOpenStudent }) {
    const wadah = el('div', 'admin-panel');
    const alat = el('div', 'admin-toolbar');
    const cari = el('input', 'portal-student-search');
    cari.type = 'search';
    cari.placeholder = 'Cari nama santri...';
    cari.setAttribute('aria-label', 'Cari nama santri');
    const asrama = pilihan('Asrama', [['', 'Semua asrama'], ...data.dormitories.map((d) => [d.id, d.name]), ['-', 'Belum ditempatkan']]);
    const program = pilihan('Program', [['', 'Semua program'], ...data.summary.programs.map((p) => [p.label, p.label])]);
    const fokus = el('label', 'admin-check');
    const centang = el('input');
    centang.type = 'checkbox';
    fokus.append(centang, el('span', '', 'Perlu perhatian saja'));
    alat.append(cari, asrama.wadah, program.wadah, fokus);

    const info = el('p', 'admin-table-info');
    info.setAttribute('role', 'status');
    const gulir = el('div', 'admin-table-scroll');
    const tabel = el('table', 'admin-table');
    const kepala = el('tr');
    ['Santri', 'Asrama', 'Kehadiran 7 hari', 'Sholat 7 hari', 'Hafalan terakhir', ...(data.healthEnabled ? ['Kesehatan'] : []), 'Tagihan', 'Visa', 'Wali']
      .forEach((judul) => { const th = el('th', '', judul); th.scope = 'col'; kepala.append(th); });
    const thead = el('thead');
    thead.append(kepala);
    const tbody = el('tbody');
    tabel.append(thead, tbody);
    gulir.append(tabel);

    const ditandai = perluPerhatian(data);
    function gambar() {
      const kata = cari.value.trim().toLocaleLowerCase('id-ID');
      const hasil = data.students.filter((s) => (!kata || s.name.toLocaleLowerCase('id-ID').includes(kata))
        && (!asrama.select.value || (asrama.select.value === '-' ? !s.dormitory : s.dormitory && s.dormitory.id === asrama.select.value))
        && (!program.select.value || s.programGroup === program.select.value)
        && (!centang.checked || ditandai.has(s.id)));
      tbody.replaceChildren(...hasil.map((s) => barisSantri(data, s, onOpenStudent)));
      info.textContent = hasil.length === data.students.length
        ? `${hasil.length} santri aktif.`
        : `Menampilkan ${hasil.length} dari ${data.students.length} santri.`;
      gulir.hidden = !hasil.length;
    }
    cari.addEventListener('input', gambar);
    [asrama.select, program.select, centang].forEach((kontrol) => kontrol.addEventListener('change', gambar));
    gambar();

    wadah.append(alat, info, gulir);
    return wadah;
  }

  // ---------------------------------------------------------------------------
  // Asrama

  // Kartu asrama berupa pratinjau, dua per baris. Klik membuka pop up berisi semua
  // penghuni beserta catatannya dan kegiatan asrama 30 hari terakhir.

  // studentId -> daftar peringatan untuk santri itu.
  function peringatanPerSantri(data) {
    const peta = new Map();
    data.alerts.filter((a) => a.studentId).forEach((a) => {
      if (!peta.has(a.studentId)) peta.set(a.studentId, []);
      peta.get(a.studentId).push(a);
    });
    return peta;
  }

  function persenTeks(nilai) {
    return nilai === null || nilai === undefined ? 'belum dicatat' : `${nilai}%`;
  }

  function barKeterisian(d) {
    const persen = d.capacity > 0 ? Math.min(100, Math.round((d.occupied / d.capacity) * 100)) : 0;
    const bar = el('div', 'admin-occupancy__bar');
    const isiBar = el('div', `admin-occupancy__fill${persen >= 100 ? ' is-full' : (persen >= 90 ? ' is-near' : '')}`);
    isiBar.style.width = `${persen}%`;
    bar.append(isiBar);
    return bar;
  }

  function kartuAsrama(d, buka) {
    const kartu = el('button', 'admin-dorm-card');
    kartu.type = 'button';
    kartu.setAttribute('aria-haspopup', 'dialog');
    kartu.append(
      el('span', 'admin-dorm-card__title', d.name),
      el('span', 'admin-dorm-card__meta', `${d.gender === 'putra' ? 'Putra' : 'Putri'} · ${d.area}`),
      el('span', 'admin-dorm-card__occupancy', d.capacity > 0 ? `${d.occupied}/${d.capacity} terisi` : `${d.occupied} santri`)
    );
    if (d.capacity > 0) kartu.append(barKeterisian(d));
    kartu.append(el('span', `admin-dorm-card__line${d.supervisors.length ? '' : ' is-warn'}`,
      d.supervisors.length ? `Musyrif: ${d.supervisors.map((m) => m.name).join(', ')}` : 'Belum ada musyrif'));
    if (d.occupied) {
      kartu.append(el('span', 'admin-dorm-card__line', `Hadir ${persenTeks(d.attendanceRate7)} · Berjamaah ${persenTeks(d.prayerRate7)}`));
    }
    const terakhir = d.activities[0];
    kartu.append(el('span', 'admin-dorm-card__line', terakhir ? `Kegiatan terakhir: ${terakhir.title}, ${tanggal(terakhir.date)}` : 'Belum ada kegiatan bulan ini'));
    kartu.append(el('span', 'admin-dorm-card__open', 'Lihat detail'));
    kartu.addEventListener('click', buka);
    return kartu;
  }

  function dialogDetail(judul, subjudul, isi) {
    const dialog = el('dialog', 'op-dialog admin-dorm-dialog');
    dialog.setAttribute('aria-labelledby', 'admin-dorm-dialog-judul');
    const badan = el('div', 'admin-dorm-dialog__body');
    const kepala = el('div', 'admin-dorm-dialog__head');
    const teks = el('div');
    const h = el('h3', 'admin-dorm-dialog__title', judul);
    h.id = 'admin-dorm-dialog-judul';
    teks.append(h, el('p', 'admin-card__meta', subjudul));
    const tutup = tombol('Tutup', 'button--secondary', () => dialog.close());
    tutup.autofocus = true;
    kepala.append(teks, tutup);
    badan.append(kepala, ...isi);
    dialog.append(badan);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  function daftarPenghuni(data, santriDiAsrama, ditandai, bukaSantri) {
    if (!santriDiAsrama.length) return el('p', 'admin-empty', 'Belum ada santri di asrama ini.');
    const daftar = el('ul', 'admin-resident-list');
    santriDiAsrama.forEach((s) => {
      const item = el('li', 'admin-resident');
      const kiri = el('div', 'admin-resident__main');
      const nama = el('button', 'admin-student-name', s.name);
      nama.type = 'button';
      nama.addEventListener('click', () => bukaSantri(s.id));
      kiri.append(nama, el('span', 'admin-cell-sub', s.program));
      const kanan = el('div', 'admin-resident__facts');
      const hadir = s.attendance7;
      kanan.append(el('span', hadir.absent ? 'is-warn' : '', hadir.recorded ? `Hadir ${hadir.present + hadir.late}/${hadir.recorded}${hadir.absent ? `, ${hadir.absent} alpa` : ''}` : 'Presensi belum dicatat'));
      const hafalan = s.memorization.last;
      kanan.append(el('span', hafalan && hafalan.grade === 'ulang' ? 'is-warn' : '', hafalan ? `Hafalan: ${hafalan.portion} (${LABEL_HAFALAN[hafalan.grade] || hafalan.grade})` : 'Belum ada setoran'));
      if (s.health && s.health.condition !== 'sehat') kanan.append(el('span', 'is-danger', `${s.health.label}, ${tanggal(s.health.date)}`));
      // Isi peringatan (tanpa nama di depannya), selain kesehatan yang sudah tampil di atas.
      (ditandai.get(s.id) || []).filter((alert) => alert.kind !== 'kesehatan').slice(0, 2).forEach((alert) => {
        kanan.append(el('span', alert.level === 'tinggi' ? 'is-danger' : 'is-warn', alert.title.replace(`${s.name}: `, '')));
      });
      item.append(kiri, kanan);
      daftar.append(item);
    });
    return daftar;
  }

  function daftarKegiatan(kegiatan) {
    if (!kegiatan.length) return el('p', 'admin-empty', 'Belum ada kegiatan yang dicatat dalam 30 hari terakhir.');
    const daftar = el('ul', 'admin-activity-list');
    kegiatan.forEach((k) => {
      const item = el('li');
      item.append(
        el('p', 'admin-activity-list__title', k.title),
        el('p', 'admin-cell-sub', `${tanggal(k.date)} · ${k.participants} santri`)
      );
      if (k.description) item.append(el('p', 'admin-activity-list__desc', k.description));
      daftar.append(item);
    });
    return daftar;
  }

  function bukaDetailAsrama(data, d, onOpenStudent) {
    const santriDiAsrama = data.students.filter((s) => s.dormitory && s.dormitory.id === d.id);
    const ditandai = peringatanPerSantri(data);
    let dialog = null;
    const bukaSantri = (id) => { dialog.close(); onOpenStudent(id); };

    const fakta = el('dl', 'admin-facts admin-facts--grid');
    const tambah = (judul, nilai, nada) => fakta.append(el('dt', '', judul), el('dd', nada ? `is-${nada}` : '', nilai));
    tambah('Keterisian', d.capacity > 0 ? `${d.occupied} dari ${d.capacity} tempat` : `${d.occupied} santri, kapasitas belum diisi`);
    tambah('Musyrif', d.supervisors.length ? d.supervisors.map((m) => m.name).join(', ') : 'Belum ditugaskan', d.supervisors.length ? '' : 'warn');
    tambah('Kehadiran 7 hari', persenTeks(d.attendanceRate7));
    tambah('Sholat berjamaah 7 hari', persenTeks(d.prayerRate7));
    tambah('Setoran hafalan 7 hari', String(d.deposits7));
    const jumlahDitandai = santriDiAsrama.filter((s) => ditandai.has(s.id)).length;
    tambah('Perlu perhatian', jumlahDitandai ? `${jumlahDitandai} santri` : 'Tidak ada', jumlahDitandai ? 'warn' : '');

    const bagian = (judul, ...isi) => {
      const wadah = el('section', 'admin-dorm-dialog__section');
      wadah.append(el('p', 'admin-card__label', judul), ...isi);
      return wadah;
    };
    dialog = dialogDetail(d.name, `${d.gender === 'putra' ? 'Asrama putra' : 'Asrama putri'} · ${d.area}`, [
      fakta,
      bagian(`Penghuni (${santriDiAsrama.length})`, daftarPenghuni(data, santriDiAsrama, ditandai, bukaSantri)),
      bagian('Kegiatan 30 hari terakhir', daftarKegiatan(d.activities))
    ]);
  }

  function bukaBelumDitempatkan(data, belum, onOpenStudent) {
    let dialog = null;
    const bukaSantri = (id) => { dialog.close(); onOpenStudent(id); };
    dialog = dialogDetail('Belum ditempatkan', `${belum.length} santri aktif belum punya asrama. Tempatkan lewat halaman Monitoring.`, [
      daftarPenghuni(data, belum, peringatanPerSantri(data), bukaSantri)
    ]);
  }

  function panelAsrama(data, { onOpenStudent }) {
    const wadah = el('div', 'admin-panel');
    if (!data.dormitories.length) {
      wadah.append(el('p', 'admin-empty', 'Belum ada asrama. Tambahkan lewat halaman Monitoring.'));
      return wadah;
    }
    const grid = el('div', 'admin-dorm-grid');
    data.dormitories.forEach((d) => grid.append(kartuAsrama(d, () => bukaDetailAsrama(data, d, onOpenStudent))));
    const belum = data.students.filter((s) => !s.dormitory);
    if (belum.length) {
      const kartu = el('button', 'admin-dorm-card admin-dorm-card--warn');
      kartu.type = 'button';
      kartu.setAttribute('aria-haspopup', 'dialog');
      kartu.append(
        el('span', 'admin-dorm-card__title', 'Belum ditempatkan'),
        el('span', 'admin-dorm-card__meta', `${belum.length} santri aktif belum punya asrama`),
        el('span', 'admin-dorm-card__open', 'Lihat daftar')
      );
      kartu.addEventListener('click', () => bukaBelumDitempatkan(data, belum, onOpenStudent));
      grid.append(kartu);
    }
    wadah.append(grid);
    return wadah;
  }

  // ---------------------------------------------------------------------------
  // Musyrif

  function panelMusyrif(data) {
    const wadah = el('div', 'admin-panel admin-card-grid');
    if (!data.supervisors.length) {
      wadah.append(el('p', 'admin-empty', 'Belum ada akun musyrif. Buat lewat tab Kelola akun internal.'));
      return wadah;
    }
    const sekarang = new Date(data.generatedAt).getTime();
    data.supervisors.forEach((m) => {
      const kartu = el('article', `admin-card${m.active ? '' : ' admin-card--muted'}`);
      kartu.append(el('h4', 'admin-card__title', m.name), el('p', 'admin-card__meta', `${m.email}${m.active ? '' : ', akun nonaktif'}`));
      const rincian = el('dl', 'admin-facts');
      const fakta = (judul, nilai, nada) => {
        const dt = el('dt', '', judul);
        const dd = el('dd', nada ? `is-${nada}` : '', nilai);
        rincian.append(dt, dd);
      };
      fakta('Asrama', m.dormitories.length ? m.dormitories.map((d) => d.name).join(', ') : 'Belum ditugaskan', m.dormitories.length ? '' : 'warn');
      fakta('Santri binaan', String(m.studentCount));
      fakta('Catatan 7 hari', String(m.records7), m.studentCount && !m.records7 ? 'warn' : '');
      const lama = m.lastRecordedAt ? sekarang - new Date(m.lastRecordedAt).getTime() > 2 * 86400000 : true;
      fakta('Terakhir mencatat', m.lastRecordedAt ? WAKTU.format(new Date(m.lastRecordedAt)) : 'Belum pernah', m.studentCount && lama ? 'warn' : '');
      kartu.append(rincian);
      wadah.append(kartu);
    });
    return wadah;
  }

  // ---------------------------------------------------------------------------
  // Data demo: isi, kata sandi baru, dan hapus langsung dari dashboard.
  // Pengisian berjalan per langkah (satu permintaan per langkah) supaya tidak ada yang
  // terkena batas waktu server. Bila terhenti, tombol yang sama melanjutkannya.

  const LABEL_STATUS_PENDAFTAR = Object.freeze({
    submitted: 'Baru masuk',
    'document-review': 'Pemeriksaan berkas',
    'needs-revision': 'Perlu perbaikan',
    'academic-preparation': 'Persiapan akademik',
    'ready-for-departure': 'Siap berangkat',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  });

  async function mintaJson(url, headers, opsi = {}) {
    const response = await fetch(url, {
      ...opsi,
      headers: { ...headers, ...(opsi.body ? { 'Content-Type': 'application/json' } : {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Permintaan belum berhasil. Coba lagi.');
    return body;
  }

  function tombol(teks, kelas, aksi) {
    const button = el('button', `button ${kelas}`, teks);
    button.type = 'button';
    button.addEventListener('click', aksi);
    return button;
  }

  function teksUntukDisalin({ kataSandi, akunDemo, pendaftar }) {
    const baris = [];
    if (kataSandi) {
      baris.push(`Kata sandi semua akun demo: ${kataSandi}`, '', 'Akun demo (masuk lewat /portal.html):');
      akunDemo.forEach((akun) => baris.push(`${akun.email}  ${akun.peran}`));
    }
    if (pendaftar.length) {
      baris.push('', 'Kode akses pendaftar (cek status di /cek-status.html):');
      pendaftar.forEach((p) => baris.push(`${p.nomor}  ${p.kode}  ${p.nama}`));
    }
    return baris.join('\n');
  }

  // Kata sandi dan kode akses hanya ada di jawaban server saat itu, jadi ditampilkan
  // di dialog yang tetap terbuka sampai admin menutupnya sendiri.
  function dialogHasil({ judul, kataSandi = null, akunDemo = [], pendaftar = [], catatan = '', onTutup }) {
    const dialog = el('dialog', 'op-dialog admin-demo-dialog');
    dialog.setAttribute('aria-labelledby', 'admin-demo-judul');
    const isi = el('div', 'op-dialog__form admin-demo-result');
    const kepala = el('h3', '', judul);
    kepala.id = 'admin-demo-judul';
    isi.append(kepala);

    if (kataSandi || pendaftar.length) {
      isi.append(el('p', 'op-dialog__summary', 'Kata sandi dan kode akses di bawah hanya ditampilkan sekali. Salin dan simpan sekarang.'));
    }
    if (kataSandi) {
      isi.append(el('p', 'admin-card__label', 'Kata sandi semua akun demo'), el('code', 'admin-demo-code', kataSandi));
      const daftar = el('ul', 'admin-demo-list');
      akunDemo.forEach((akun) => {
        const item = el('li');
        item.append(el('span', 'admin-cell-main', akun.email), el('span', 'admin-cell-sub', `${akun.peran}, ${akun.nama}`));
        daftar.append(item);
      });
      isi.append(el('p', 'admin-card__label', 'Akun demo, masuk lewat Portal'), daftar);
    }
    if (pendaftar.length) {
      const daftar = el('ul', 'admin-demo-list');
      pendaftar.forEach((p) => {
        const item = el('li');
        item.append(el('span', 'admin-cell-main', `${p.nomor}  ${p.kode}`), el('span', 'admin-cell-sub', `${p.nama}, ${LABEL_STATUS_PENDAFTAR[p.status] || p.status}`));
        daftar.append(item);
      });
      isi.append(el('p', 'admin-card__label', 'Kode akses pendaftar, untuk halaman Cek status'), daftar);
    }
    if (catatan) isi.append(el('p', 'admin-card__meta', catatan));

    const pesan = el('p', 'admin-card__meta');
    pesan.setAttribute('role', 'status');
    const aksi = el('div', 'op-dialog__actions');
    if (kataSandi || pendaftar.length) {
      aksi.append(tombol('Salin semua', 'button--secondary', async () => {
        try {
          await navigator.clipboard.writeText(teksUntukDisalin({ kataSandi, akunDemo, pendaftar }));
          pesan.textContent = 'Tersalin. Tempel ke catatan yang aman.';
        } catch {
          pesan.textContent = 'Browser menolak menyalin. Blok teksnya lalu salin manual.';
        }
      }));
    }
    aksi.append(tombol('Selesai', 'button--primary', () => dialog.close()));
    isi.append(pesan, aksi);
    dialog.append(isi);
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (onTutup) onTutup();
    });
    document.body.append(dialog);
    dialog.showModal();
  }

  function kartuDemo({ headers, onSelesai }) {
    const kartu = el('section', 'admin-card admin-demo');
    kartu.append(el('h4', 'admin-card__title', 'Data demo'));
    const badan = el('div', 'admin-demo__body');
    badan.append(el('p', 'admin-card__meta', 'Memeriksa data demo...'));
    kartu.append(badan);

    async function muatStatus() {
      try {
        gambar(await mintaJson('/api/admin/demo-data', headers()));
      } catch (error) {
        badan.replaceChildren(el('p', 'admin-card__meta', error.message));
      }
    }

    function gambar(status) {
      badan.replaceChildren();
      const j = status.jumlah;
      badan.append(el('p', 'admin-card__meta', status.ada
        ? `Aktif: ${j.akun} akun, ${j.santri} santri, ${j.pendaftar} pendaftar, ${j.tagihan} tagihan.${status.lengkap ? '' : ' Pengisian belum selesai.'}`
        : 'Belum ada data demo. Isi untuk mencoba aplikasi dari sisi setiap peran: petugas, musyrif, guru, keuangan, wali, dan santri.'));
      if (status.latensiMs > 60) {
        badan.append(el('p', 'admin-card__line is-warn', `Database berjarak ${status.latensiMs} ms dari server, jadi pengisian bisa lambat. Bila berhenti di tengah, tekan tombolnya lagi untuk melanjutkan.`));
      }
      const aksi = el('div', 'admin-demo__actions');
      if (!status.ada || !status.lengkap) {
        aksi.append(tombol(status.ada ? 'Lanjutkan pengisian' : 'Isi data demo', 'button--primary', () => isiData(status)));
      }
      if (status.ada) {
        aksi.append(tombol('Kata sandi baru', 'button--secondary', () => sandiBaru(status)));
        aksi.append(tombol('Hapus data demo', 'button--secondary', hapusData));
      }
      badan.append(aksi, el('p', 'admin-card__meta', 'Akun demo adalah akun sungguhan sesuai perannya. Hapus data demo sebelum aplikasi dipakai untuk data asli.'));
    }

    async function isiData(status) {
      if (!window.confirm('Isi data demo sekarang? Akun demo (petugas, musyrif, guru, keuangan, wali, santri) adalah akun sungguhan dengan hak sesuai perannya.')) return;
      const progres = el('p', 'admin-card__meta');
      progres.setAttribute('role', 'status');
      const bar = el('div', 'admin-occupancy__bar');
      const isiBar = el('div', 'admin-occupancy__fill');
      isiBar.style.width = '0%';
      bar.append(isiBar);
      badan.replaceChildren(progres, bar);

      let kataSandi = null;
      const pendaftar = [];
      const total = status.langkah.length;
      for (const [indeks, langkah] of status.langkah.entries()) {
        progres.textContent = `Langkah ${indeks + 1} dari ${total}: ${langkah.label}`;
        isiBar.style.width = `${Math.round((indeks / total) * 100)}%`;
        try {
          const hasil = await mintaJson('/api/admin/demo-data/langkah', headers(), { method: 'POST', body: JSON.stringify({ langkah: langkah.id }) });
          if (hasil.kataSandi) kataSandi = hasil.kataSandi;
          (hasil.pendaftar || []).forEach((p) => pendaftar.push(p));
        } catch (error) {
          progres.textContent = `Berhenti di langkah ${indeks + 1} (${langkah.label}): ${error.message}`;
          badan.append(tombol('Lanjutkan pengisian', 'button--primary', () => isiData(status)));
          if (kataSandi || pendaftar.length) {
            dialogHasil({
              judul: 'Pengisian berhenti di tengah',
              kataSandi, akunDemo: status.akunDemo, pendaftar,
              catatan: 'Simpan dulu kata sandi dan kode di atas, lalu tekan Lanjutkan pengisian. Langkah yang sudah selesai tidak diulang.'
            });
          }
          return;
        }
      }
      isiBar.style.width = '100%';
      progres.textContent = 'Data demo siap.';
      dialogHasil({
        judul: 'Data demo siap',
        kataSandi, akunDemo: status.akunDemo, pendaftar,
        catatan: kataSandi ? '' : 'Akun demo sudah ada dari pengisian sebelumnya, jadi kata sandinya tidak berubah. Pakai tombol Kata sandi baru bila lupa.',
        onTutup: onSelesai
      });
    }

    async function sandiBaru(status) {
      if (!window.confirm('Buat kata sandi baru untuk semua akun demo? Kata sandi lama dan sesi yang sedang masuk langsung tidak berlaku.')) return;
      try {
        const hasil = await mintaJson('/api/admin/demo-data/sandi', headers(), { method: 'POST' });
        dialogHasil({ judul: 'Kata sandi baru akun demo', kataSandi: hasil.kataSandi, akunDemo: status.akunDemo, pendaftar: hasil.pendaftar });
      } catch (error) {
        window.alert(error.message);
      }
    }

    async function hapusData() {
      const ketik = window.prompt('Semua akun, santri, pendaftar, tagihan, dan catatan demo akan dihapus permanen. Akun admin dan data asli tidak disentuh. Ketik HAPUS untuk melanjutkan.');
      if (ketik === null) return;
      try {
        const hasil = await mintaJson('/api/admin/demo-data/hapus', headers(), { method: 'POST', body: JSON.stringify({ konfirmasi: ketik.trim().toUpperCase() }) });
        const d = hasil.dihapus;
        dialogHasil({
          judul: 'Data demo dihapus',
          catatan: `${d.akun} akun, ${d.santri} santri, ${d.pendaftar} pendaftar, dan ${d.tagihan} tagihan demo sudah dihapus.${hasil.dilewati.length ? ` Dilewati: ${hasil.dilewati.join(' ')}` : ''}`,
          onTutup: onSelesai
        });
      } catch (error) {
        window.alert(error.message);
      }
    }

    muatStatus();
    return kartu;
  }

  window.HamasahAdminOverview = Object.freeze({ muat, kpi, perhatian, panelSantri, panelAsrama, panelMusyrif, kartuDemo });
}());
