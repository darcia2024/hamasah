// Beranda keluarga di portal (16 Oktober 2026): wali dan santri tidak lagi langsung
// dilempar ke rekam jejak lengkap, tetapi melihat beranda yang sesuai perannya.
//   - Wali: kartu perkembangan tiap ananda (sholat, hafalan, kehadiran, catatan pembina)
//     dan "Laporan kegiatan", linimasa gabungan semua ananda.
//   - Santri: kelas online di bagian paling atas, lalu perkembangan diri, izin, dan
//     kegiatan terbaru.
// Semua angka berasal dari API yang sudah dipakai rekam jejak (dashboard, care, juz,
// invoices, leave, courses). Bagian yang gagal dimuat dilewati, bukan diisi karangan.
// Semua teks dipasang lewat textContent.
(function initBerandaKeluarga() {
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const TANGGAL_PENDEK = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
  const HARI = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  const NILAI_HAFALAN = { lancar: 'Lancar', 'kurang-lancar': 'Kurang lancar', ulang: 'Perlu diulang' };
  const PRESENSI = { present: 'Hadir', late: 'Terlambat', excused: 'Izin / sakit', absent: 'Tidak hadir' };
  const STATUS_IZIN = { menunggu: 'menunggu keputusan musyrif', disetujui: 'disetujui', ditolak: 'ditolak', dibatalkan: 'dibatalkan' };
  const PERIODE_HARI = 30;
  const LINIMASA_AWAL = 8;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tanggal(iso) {
    if (!iso) return '';
    try { return TANGGAL.format(new Date(iso)); } catch { return String(iso); }
  }

  function tanggalIso(mundur) {
    const d = new Date();
    d.setDate(d.getDate() - mundur);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function rupiah(nilai) {
    return `Rp${(Number(nilai) || 0).toLocaleString('id-ID')}`;
  }

  function inisial(nama) {
    return String(nama || '').trim().split(/\s+/).slice(0, 2).map((kata) => kata[0] || '').join('').toUpperCase() || '?';
  }

  async function ambil(url, headers) {
    try {
      const response = await fetch(url, { headers });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  // Semua data satu ananda, periode 30 hari terakhir. Setiap permintaan berdiri sendiri.
  async function muatAnak(studentId, headers, { kelas = false } = {}) {
    const id = encodeURIComponent(studentId);
    const rentang = `from=${tanggalIso(PERIODE_HARI - 1)}&to=${tanggalIso(0)}`;
    const [dasbor, care, juz, tagihan, izin, courses] = await Promise.all([
      ambil(`/api/students/${id}/dashboard?${rentang}`, headers),
      ambil(`/api/students/${id}/care?${rentang}`, headers),
      ambil(`/api/students/${id}/juz`, headers),
      ambil(`/api/students/${id}/invoices`, headers),
      ambil(`/api/students/${id}/leave`, headers),
      kelas ? ambil(`/api/students/${id}/courses`, headers) : null
    ]);
    return {
      dashboard: dasbor && dasbor.dashboard,
      care: care && care.care,
      juz: juz && juz.tersedia ? juz : null,
      tagihan: tagihan && Array.isArray(tagihan.items) ? tagihan.items : null,
      izin: izin && Array.isArray(izin.items) ? izin.items : null,
      izinMentah: izin,
      courses: courses && Array.isArray(courses.items) ? courses.items : null
    };
  }

  function terbaru(daftar, kunci = 'occurredAt') {
    return (daftar || []).slice().sort((a, b) => String(b[kunci] || '').localeCompare(String(a[kunci] || '')))[0] || null;
  }

  // ------------------------------------------------------------ Kotak angka
  function kotak(label, nilai, catatan, nada = '') {
    const wadah = el('div', `beranda-stat ${nada ? `is-${nada}` : ''}`.trim());
    wadah.append(el('span', 'beranda-stat__label', label), el('strong', 'beranda-stat__value', nilai), el('span', 'beranda-stat__note', catatan));
    return wadah;
  }

  function kotakPerkembangan(data) {
    const hasil = [];
    const prayers = data.care && data.care.prayers;
    if (prayers) {
      const rate = prayers.berjamaahRate;
      hasil.push(kotak(
        'Sholat berjamaah',
        rate === null || rate === undefined ? '-' : `${rate}%`,
        prayers.recorded ? `${prayers.totals.berjamaah} dari ${prayers.recorded} waktu, ${PERIODE_HARI} hari` : 'Belum dicatat musyrif',
        rate === null || rate === undefined ? '' : rate >= 80 ? 'baik' : rate < 60 ? 'perlu' : ''
      ));
    }
    if (data.juz) {
      hasil.push(kotak(
        'Hafalan Al-Qur\'an',
        `${data.juz.hafal} juz`,
        data.juz.sedang ? `${data.juz.sedang} juz sedang dihafal` : (data.juz.hafal ? 'Sudah hafal' : 'Belum ada juz ditandai')
      ));
    }
    const hadir = data.dashboard && data.dashboard.attendance;
    if (hadir) {
      hasil.push(kotak(
        'Kehadiran kegiatan',
        hadir.rate === null ? '-' : `${hadir.rate}%`,
        hadir.total ? `${hadir.present || 0} dari ${hadir.total} kegiatan, ${PERIODE_HARI} hari` : 'Belum ada kegiatan dicatat',
        hadir.rate === null ? '' : hadir.rate >= 85 ? 'baik' : hadir.rate < 70 ? 'perlu' : ''
      ));
    }
    const setoran = terbaru(data.care && data.care.memorization, 'occurredOn');
    hasil.push(setoran
      ? kotak('Setoran terakhir', setoran.portion, `${NILAI_HAFALAN[setoran.grade] || setoran.grade} · ${tanggal(setoran.occurredOn)}`)
      : kotak('Setoran terakhir', '-', 'Belum ada setoran dicatat'));
    const grid = el('div', 'beranda-stats');
    grid.append(...hasil);
    return grid;
  }

  function catatanPembina(data) {
    const catatan = terbaru(data.dashboard && data.dashboard.evaluations);
    const wadah = el('div', 'beranda-note');
    wadah.append(el('span', 'beranda-note__label', 'Catatan pembina terakhir'));
    if (catatan) {
      wadah.append(
        el('p', 'beranda-note__body', catatan.note),
        el('span', 'beranda-note__meta', [catatan.area, tanggal(catatan.occurredAt)].filter(Boolean).join(' · '))
      );
    } else {
      wadah.append(el('p', 'beranda-note__body is-empty', `Belum ada catatan pembina dalam ${PERIODE_HARI} hari terakhir.`));
    }
    return wadah;
  }

  function chipUrusan(data) {
    const chip = [];
    if (data.tagihan) {
      const belum = data.tagihan.filter((item) => item.status === 'unpaid');
      const total = belum.reduce((jumlah, item) => jumlah + (Number(item.amount) || 0), 0);
      chip.push(belum.length
        ? [`${belum.length} tagihan belum lunas, ${rupiah(total)}`, 'perlu']
        : ['Tagihan lunas', 'baik']);
    }
    if (data.izin) {
      const menunggu = data.izin.filter((item) => item.status === 'menunggu').length;
      if (menunggu) chip.push([`${menunggu} izin menunggu keputusan`, 'tunggu']);
    }
    if (!chip.length) return null;
    const baris = el('div', 'beranda-chips');
    chip.forEach(([teks, jenis]) => baris.append(el('span', `crm-summary-chip is-${jenis}`, teks)));
    return baris;
  }

  // ------------------------------------------------------------- Linimasa
  // Setiap butir: { waktu, jenis, nada, judul, isi, anak }.
  function butirKegiatan(data, nama) {
    const butir = [];
    const d = data.dashboard || {};
    (d.activities || []).forEach((item) => butir.push({ waktu: item.occurredAt, jenis: 'Kegiatan', nada: 'kegiatan', judul: item.title, isi: item.description }));
    ((d.attendance && d.attendance.entries) || []).forEach((item) => butir.push({
      waktu: item.occurredAt, jenis: 'Presensi', nada: item.status === 'present' ? 'baik' : item.status === 'absent' ? 'perlu' : 'tunggu',
      judul: `${item.category || 'Kegiatan asrama'}: ${PRESENSI[item.status] || item.status}`, isi: item.note
    }));
    (d.evaluations || []).forEach((item) => butir.push({ waktu: item.occurredAt, jenis: 'Catatan pembina', nada: 'catatan', judul: item.area || 'Catatan pembina', isi: item.note }));
    (d.achievements || []).forEach((item) => butir.push({ waktu: item.occurredAt, jenis: 'Prestasi', nada: 'baik', judul: item.title, isi: item.description }));
    (d.discipline || []).forEach((item) => butir.push({ waktu: item.occurredAt, jenis: 'Disiplin', nada: 'perlu', judul: item.level ? `Catatan disiplin (${item.level})` : 'Catatan disiplin', isi: item.note }));
    ((data.care && data.care.memorization) || []).forEach((item) => butir.push({
      waktu: item.occurredOn, jenis: 'Setoran hafalan', nada: 'hafalan',
      judul: `${item.kind === 'ziyadah' ? 'Hafalan baru' : 'Murajaah'}: ${item.portion}`,
      isi: [NILAI_HAFALAN[item.grade] || item.grade, item.note].filter(Boolean).join('. ')
    }));
    (data.izin || []).forEach((item) => butir.push({
      waktu: item.decidedAt || item.createdAt, jenis: 'Izin', nada: item.status === 'ditolak' ? 'perlu' : item.status === 'menunggu' ? 'tunggu' : 'baik',
      judul: `${item.kindLabel || 'Izin'} ${STATUS_IZIN[item.status] || item.status}`, isi: item.reason
    }));
    (data.tagihan || []).forEach((item) => {
      if (item.status === 'void') return;
      if (item.paidAt) butir.push({ waktu: item.paidAt, jenis: 'Pembayaran', nada: 'baik', judul: `${item.description} lunas`, isi: rupiah(item.amount) });
      butir.push({ waktu: item.issuedAt, jenis: 'Tagihan', nada: item.status === 'unpaid' ? 'perlu' : 'netral', judul: `${item.description} diterbitkan`, isi: rupiah(item.amount) });
    });
    return butir.filter((item) => item.waktu).map((item) => ({ ...item, anak: nama }));
  }

  function kartuLinimasa(semuaButir, { judul, keterangan, daftarAnak = [] }) {
    const wadah = el('section', 'crm-white-card beranda-card beranda-timeline');
    const kepala = el('div', 'beranda-card__head');
    const teks = el('div');
    teks.append(el('h3', 'beranda-card__title', judul), el('p', 'beranda-card__note', keterangan));
    kepala.append(teks);
    wadah.append(kepala);

    const urut = semuaButir.slice().sort((a, b) => String(b.waktu).localeCompare(String(a.waktu)));
    let saringan = null;
    let batas = LINIMASA_AWAL;

    if (daftarAnak.length > 1) {
      const pil = el('div', 'beranda-filter');
      pil.setAttribute('role', 'group');
      pil.setAttribute('aria-label', 'Saring per ananda');
      const tombol = [['Semua ananda', null], ...daftarAnak.map((nama) => [nama, nama])].map(([label, nilai]) => {
        const b = el('button', `crm-pill-btn ${nilai === null ? 'is-active' : ''}`.trim(), label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(nilai === null));
        b.addEventListener('click', () => {
          saringan = nilai;
          batas = LINIMASA_AWAL;
          tombol.forEach((lain) => { lain.classList.toggle('is-active', lain === b); lain.setAttribute('aria-pressed', String(lain === b)); });
          lukis();
        });
        return b;
      });
      pil.append(...tombol);
      wadah.append(pil);
    }

    const daftar = el('ol', 'beranda-timeline__list');
    const lebih = el('button', 'button button--secondary beranda-timeline__more', 'Tampilkan lebih banyak');
    lebih.type = 'button';
    lebih.addEventListener('click', () => { batas += LINIMASA_AWAL; lukis(); });
    wadah.append(daftar, lebih);

    function lukis() {
      const tampil = urut.filter((item) => !saringan || item.anak === saringan);
      daftar.replaceChildren();
      if (!tampil.length) {
        daftar.append(el('li', 'beranda-timeline__empty', `Belum ada kegiatan tercatat dalam ${PERIODE_HARI} hari terakhir.`));
      }
      let hariSebelumnya = '';
      tampil.slice(0, batas).forEach((item) => {
        const hari = HARI.format(new Date(item.waktu));
        if (hari !== hariSebelumnya) {
          daftar.append(el('li', 'beranda-timeline__day', hari));
          hariSebelumnya = hari;
        }
        const baris = el('li', `beranda-timeline__item is-${item.nada}`);
        const meta = el('div', 'beranda-timeline__meta');
        meta.append(el('span', 'beranda-timeline__kind', item.jenis));
        if (daftarAnak.length > 1 && item.anak) meta.append(el('span', 'beranda-timeline__child', item.anak));
        baris.append(meta, el('p', 'beranda-timeline__title', item.judul));
        if (item.isi) baris.append(el('p', 'beranda-timeline__body', item.isi));
        daftar.append(baris);
      });
      lebih.hidden = tampil.length <= batas;
    }
    lukis();
    return wadah;
  }

  function kartuPengumuman(data) {
    const items = data && Array.isArray(data.items) ? data.items.slice(0, 3) : [];
    if (!items.length) return null;
    const wadah = el('section', 'crm-white-card beranda-card');
    const kepala = el('div', 'beranda-card__head');
    kepala.append(el('h3', 'beranda-card__title', 'Pengumuman asrama'));
    wadah.append(kepala);
    const daftar = el('ul', 'beranda-announce');
    items.forEach((item) => {
      const baris = el('li', 'beranda-announce__item');
      baris.append(
        el('strong', 'beranda-announce__title', item.title),
        el('p', 'beranda-announce__body', item.body),
        el('span', 'beranda-announce__meta', [item.dormitoryName || 'Semua asrama', tanggal(item.createdAt)].filter(Boolean).join(' · '))
      );
      daftar.append(baris);
    });
    wadah.append(daftar);
    return wadah;
  }

  function judulBagian(teks) {
    return el('h3', 'beranda-section-title', teks);
  }

  function kerangkaMemuat(teks) {
    const wadah = el('div', 'crm-white-card beranda-loading', teks);
    wadah.setAttribute('role', 'status');
    return wadah;
  }

  // ------------------------------------------------------------------ Wali
  function kartuAnak(student, data, onOpen) {
    const wadah = el('article', 'crm-white-card beranda-child');
    const kepala = el('div', 'beranda-child__head');
    const avatar = el('span', 'beranda-child__avatar', inisial(student.name));
    avatar.setAttribute('aria-hidden', 'true');
    const identitas = el('div', 'beranda-child__id');
    identitas.append(
      el('h4', 'beranda-child__name', student.name),
      el('p', 'beranda-child__meta', [student.program, student.dormitoryName || 'Belum ditempatkan di asrama'].filter(Boolean).join(' · '))
    );
    const buka = el('button', 'button button--secondary beranda-child__open', 'Rekam jejak lengkap');
    buka.type = 'button';
    buka.setAttribute('aria-label', `Buka rekam jejak lengkap ${student.name}`);
    buka.addEventListener('click', onOpen);
    kepala.append(avatar, identitas, buka);
    wadah.append(kepala);
    const chip = chipUrusan(data);
    if (chip) wadah.append(chip);
    wadah.append(kotakPerkembangan(data), catatanPembina(data));
    return wadah;
  }

  async function wali(wadah, { students, headers, onOpenStudent }) {
    wadah.replaceChildren(judulBagian('Perkembangan ananda'), kerangkaMemuat('Memuat perkembangan ananda...'));
    if (!students.length) {
      wadah.replaceChildren(el('div', 'crm-white-card beranda-loading', 'Belum ada ananda yang terhubung dengan akun ini. Hubungi admin Hamasah untuk menautkan akun.'));
      return;
    }
    const [semuaData, pengumuman] = await Promise.all([
      Promise.all(students.map((student) => muatAnak(student.id, headers))),
      ambil('/api/announcements', headers)
    ]);
    const kartuKartu = students.map((student, i) => kartuAnak(student, semuaData[i], () => onOpenStudent(student.id)));
    const butir = students.flatMap((student, i) => butirKegiatan(semuaData[i], student.name));
    const isi = [judulBagian('Perkembangan ananda'), el('div', 'beranda-children')];
    isi[1].append(...kartuKartu);
    isi.push(kartuLinimasa(butir, {
      judul: 'Laporan kegiatan',
      keterangan: `Kegiatan, presensi, setoran hafalan, catatan pembina, izin, dan tagihan ${students.length > 1 ? 'semua ananda' : 'ananda'} dalam ${PERIODE_HARI} hari terakhir.`,
      daftarAnak: students.map((student) => student.name)
    }));
    const umum = kartuPengumuman(pengumuman);
    if (umum) isi.push(umum);
    wadah.replaceChildren(...isi);
  }

  // ---------------------------------------------------------------- Santri
  function kartuKelas(courses, student) {
    const wadah = el('section', 'crm-white-card beranda-card beranda-class');
    const kepala = el('div', 'beranda-card__head');
    const teks = el('div');
    teks.append(el('h3', 'beranda-card__title', 'Kelas online'), el('p', 'beranda-card__note', 'Maddah yang kamu ikuti di ruang belajar.'));
    const masuk = el('a', 'button button--primary', 'Masuk ruang belajar');
    masuk.href = 'lms';
    kepala.append(teks, masuk);
    wadah.append(kepala);

    if (!courses) {
      wadah.append(el('p', 'beranda-card__note', 'Daftar kelas belum dapat dimuat. Buka ruang belajar untuk melihatnya.'));
      return wadah;
    }
    if (!courses.length) {
      wadah.append(el('p', 'beranda-empty', 'Belum ada maddah yang dibuka untukmu. Maddah akan muncul di sini setelah guru menambahkanmu.'));
      return wadah;
    }

    const bantuan = window.HamasahPerjalanan && window.HamasahPerjalanan.daftarTugas;
    const { tugas = [], berikutnya = [] } = bantuan ? bantuan(courses) : {};
    const tautan = (course, material) => `lms#${new URLSearchParams({ maddah: course.id, materi: material.id })}`;

    const lanjut = berikutnya[0];
    if (lanjut) {
      const sorot = el('a', 'beranda-class__next');
      sorot.href = tautan(lanjut.course, lanjut.material);
      sorot.append(
        el('span', 'beranda-class__next-label', 'Lanjutkan belajar'),
        el('strong', 'beranda-class__next-title', lanjut.material.title),
        el('span', 'beranda-class__next-meta', lanjut.course.title)
      );
      wadah.append(sorot);
    }

    if (tugas.length) {
      const blok = el('div', 'beranda-class__tasks');
      blok.append(el('h4', 'beranda-class__label', `Tugas dan kuis tertunda (${tugas.length})`));
      const daftar = el('ul', 'beranda-class__task-list');
      tugas.slice(0, 4).forEach(({ course, material, label, tingkat }) => {
        const baris = el('li', `beranda-class__task is-${tingkat}`);
        const a = el('a', '', material.title);
        a.href = tautan(course, material);
        baris.append(a, el('span', '', `${course.title} · ${label}`));
        daftar.append(baris);
      });
      blok.append(daftar);
      wadah.append(blok);
    }

    const daftar = el('ul', 'beranda-class__courses');
    courses.forEach((course) => {
      const materi = course.materials || [];
      const selesai = materi.filter((m) => m.completed).length;
      const persen = typeof course.progress === 'number' ? course.progress : (materi.length ? Math.round((selesai / materi.length) * 100) : 0);
      const baris = el('li', 'beranda-class__course');
      const a = el('a', 'beranda-class__course-title', course.title);
      a.href = `lms#${new URLSearchParams({ maddah: course.id })}`;
      const bar = el('div', 'beranda-progress');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(persen));
      bar.setAttribute('aria-label', `Progres ${course.title}`);
      const isiBar = el('span', 'beranda-progress__fill');
      isiBar.style.width = `${Math.max(0, Math.min(100, persen))}%`;
      bar.append(isiBar);
      baris.append(a, bar, el('span', 'beranda-class__course-meta', `${selesai} dari ${materi.length} materi selesai · ${persen}%`));
      daftar.append(baris);
    });
    wadah.append(daftar);
    if (student && !tugas.length && !lanjut) wadah.append(el('p', 'beranda-empty', 'Semua materi sudah selesai. Masya Allah, pertahankan!'));
    return wadah;
  }

  async function santri(wadah, { student, headers, onOpenFull, onReload }) {
    wadah.replaceChildren(kerangkaMemuat('Memuat beranda...'));
    const data = await muatAnak(student.id, headers, { kelas: true });
    const isi = [];
    isi.push(kartuKelas(data.courses, student));

    const kartuDiri = el('section', 'crm-white-card beranda-card');
    const kepala = el('div', 'beranda-card__head');
    const teks = el('div');
    teks.append(el('h3', 'beranda-card__title', 'Perkembanganku'), el('p', 'beranda-card__note', `Dicatat musyrif dan pembina, ${PERIODE_HARI} hari terakhir.`));
    const buka = el('button', 'button button--secondary', 'Rekam jejak lengkap');
    buka.type = 'button';
    buka.addEventListener('click', onOpenFull);
    kepala.append(teks, buka);
    kartuDiri.append(kepala);
    const chip = chipUrusan(data);
    if (chip) kartuDiri.append(chip);
    kartuDiri.append(kotakPerkembangan(data), catatanPembina(data));
    isi.push(kartuDiri);

    const kartuIzin = window.HamasahPerjalanan && window.HamasahPerjalanan.kartuIzin;
    if (kartuIzin && data.izinMentah) {
      const muatUlang = async (pesan = '') => {
        const segar = await ambil(`/api/students/${encodeURIComponent(student.id)}/leave?t=${Date.now()}`, headers);
        const lama = wadah.querySelector('.santri-leave-card');
        const baru = kartuIzin(segar, { studentId: student.id, headers, santri: true, muatUlang, pesan });
        if (lama && baru) lama.replaceWith(baru);
        if (onReload) onReload();
      };
      const izin = kartuIzin(data.izinMentah, { studentId: student.id, headers, santri: true, muatUlang });
      if (izin) isi.push(izin);
    }

    isi.push(kartuLinimasa(butirKegiatan(data, student.name), {
      judul: 'Kegiatan terbaru',
      keterangan: `Kegiatan, presensi, setoran hafalan, dan catatan pembina ${PERIODE_HARI} hari terakhir.`
    }));
    wadah.replaceChildren(...isi);
  }

  window.HamasahBerandaKeluarga = Object.freeze({ wali, santri, inisial, tanggalPendek: (iso) => TANGGAL_PENDEK.format(new Date(iso)) });
})();
