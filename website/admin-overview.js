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

  function daftarNamaSantri(santri, onOpenStudent) {
    const daftar = el('ul', 'admin-name-list');
    santri.forEach((s) => {
      const item = el('li');
      const tombol = el('button', 'admin-link', s.name);
      tombol.type = 'button';
      tombol.addEventListener('click', () => onOpenStudent(s.id));
      item.append(tombol, el('span', 'admin-cell-sub', s.program));
      daftar.append(item);
    });
    return daftar;
  }

  function panelAsrama(data, { onOpenStudent }) {
    const wadah = el('div', 'admin-panel admin-card-grid');
    if (!data.dormitories.length) {
      wadah.append(el('p', 'admin-empty', 'Belum ada asrama. Tambahkan lewat halaman Monitoring.'));
      return wadah;
    }
    data.dormitories.forEach((d) => {
      const kartu = el('article', 'admin-card');
      kartu.append(el('h4', 'admin-card__title', d.name), el('p', 'admin-card__meta', `${d.gender === 'putra' ? 'Putra' : 'Putri'}, ${d.area}`));

      const isi = el('div', 'admin-occupancy');
      const persen = d.capacity > 0 ? Math.min(100, Math.round((d.occupied / d.capacity) * 100)) : 0;
      isi.append(el('p', 'admin-occupancy__text', d.capacity > 0 ? `${d.occupied} dari ${d.capacity} tempat terisi` : `${d.occupied} santri, kapasitas belum diisi`));
      if (d.capacity > 0) {
        const bar = el('div', 'admin-occupancy__bar');
        const isiBar = el('div', `admin-occupancy__fill${persen >= 100 ? ' is-full' : (persen >= 90 ? ' is-near' : '')}`);
        isiBar.style.width = `${persen}%`;
        bar.append(isiBar);
        isi.append(bar);
      }
      kartu.append(isi);

      kartu.append(el('p', `admin-card__line${d.supervisors.length ? '' : ' is-warn'}`,
        d.supervisors.length ? `Musyrif: ${d.supervisors.map((m) => m.name).join(', ')}` : 'Belum ada musyrif yang ditugaskan'));
      if (d.students.length) {
        kartu.append(el('p', 'admin-card__label', 'Penghuni'), daftarNamaSantri(d.students, onOpenStudent));
      } else {
        kartu.append(el('p', 'admin-empty', 'Belum ada santri di asrama ini.'));
      }
      wadah.append(kartu);
    });

    const belum = data.students.filter((s) => !s.dormitory);
    if (belum.length) {
      const kartu = el('article', 'admin-card admin-card--warn');
      kartu.append(el('h4', 'admin-card__title', 'Belum ditempatkan'), el('p', 'admin-card__meta', `${belum.length} santri aktif belum punya asrama.`), daftarNamaSantri(belum, onOpenStudent));
      wadah.append(kartu);
    }
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

  window.HamasahAdminOverview = Object.freeze({ muat, kpi, perhatian, panelSantri, panelAsrama, panelMusyrif });
}());
