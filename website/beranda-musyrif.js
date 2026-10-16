// Beranda musyrif (16 Oktober 2026): perkembangan santri binaan dalam satu layar.
// Data dari GET /api/musyrif/ringkasan, yang hanya memuat santri di asrama yang dipegang
// musyrif ini. Santri yang perlu perhatian diletakkan paling atas. Semua teks dipasang
// lewat textContent.
(function initBerandaMusyrif() {
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const NILAI_HAFALAN = { lancar: 'Lancar', 'kurang-lancar': 'Kurang lancar', ulang: 'Perlu diulang' };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tanggal(isoDate) {
    if (!isoDate) return '';
    try { return TANGGAL.format(new Date(`${isoDate}T00:00:00Z`)); } catch { return isoDate; }
  }

  function persen(bagian, total) {
    return total ? Math.round((bagian / total) * 100) : null;
  }

  // Alasan seorang santri perlu diperhatikan musyrif pekan ini.
  function alasanPerhatian(s) {
    const alasan = [];
    const sholat = persen(s.prayers7.congregational, s.prayers7.recorded);
    if (sholat !== null && sholat < 60) alasan.push(`Sholat berjamaah ${sholat}%`);
    if (s.prayers7.missed) alasan.push(`${s.prayers7.missed} waktu tidak sholat`);
    if (s.attendance7.absent) alasan.push(`${s.attendance7.absent} kali tidak hadir`);
    if (s.memorization.repeats14) alasan.push(`${s.memorization.repeats14} setoran perlu diulang`);
    if (s.violations30) alasan.push(`${s.violations30} catatan disiplin`);
    if (s.health && s.health.condition !== 'sehat') alasan.push(s.health.label);
    if (!s.prayers7.recorded && !s.attendance7.recorded) alasan.push('Belum ada catatan pekan ini');
    return alasan;
  }

  function angka(label, nilai, catatan, nada = '') {
    const kotak = el('div', `beranda-stat ${nada ? `is-${nada}` : ''}`.trim());
    kotak.append(el('span', 'beranda-stat__label', label), el('strong', 'beranda-stat__value', nilai), el('span', 'beranda-stat__note', catatan));
    return kotak;
  }

  function nadaPersen(nilai, baik, buruk) {
    if (nilai === null || nilai === undefined) return '';
    return nilai >= baik ? 'baik' : nilai < buruk ? 'perlu' : '';
  }

  function sel(label, nilai, catatan, nada = '') {
    const kotak = el('div', `musyrif-row__cell ${nada ? `is-${nada}` : ''}`.trim());
    kotak.append(el('span', 'musyrif-row__label', label), el('strong', 'musyrif-row__value', nilai));
    if (catatan) kotak.append(el('span', 'musyrif-row__note', catatan));
    return kotak;
  }

  function barisSantri(s, onOpenStudent) {
    const alasan = alasanPerhatian(s);
    const baris = el('li', `musyrif-row ${alasan.length ? 'is-perhatian' : ''}`.trim());

    const identitas = el('div', 'musyrif-row__id');
    identitas.append(el('strong', 'musyrif-row__name', s.name), el('span', 'musyrif-row__meta', [s.program, s.dormitory && s.dormitory.name].filter(Boolean).join(' · ')));
    if (alasan.length) {
      const chip = el('div', 'beranda-chips');
      alasan.forEach((teks) => chip.append(el('span', 'crm-summary-chip is-perlu', teks)));
      identitas.append(chip);
    }

    const hadir = persen(s.attendance7.present + s.attendance7.late, s.attendance7.recorded);
    const sholat = persen(s.prayers7.congregational, s.prayers7.recorded);
    const terakhir = s.memorization.last;
    const sel1 = sel('Kehadiran 7 hari', hadir === null ? '-' : `${hadir}%`, s.attendance7.recorded ? `${s.attendance7.present + s.attendance7.late}/${s.attendance7.recorded} kegiatan` : 'Belum dicatat', nadaPersen(hadir, 85, 70));
    const sel2 = sel('Sholat berjamaah', sholat === null ? '-' : `${sholat}%`, s.prayers7.recorded ? `${s.prayers7.congregational}/${s.prayers7.recorded} waktu` : 'Belum dicatat', nadaPersen(sholat, 80, 60));
    const sel3 = sel('Hafalan terakhir', terakhir ? terakhir.portion : '-', terakhir ? `${NILAI_HAFALAN[terakhir.grade] || terakhir.grade}, ${tanggal(terakhir.date)} · ${s.memorization.deposits7} setoran pekan ini` : 'Belum ada setoran');

    const aksi = el('div', 'musyrif-row__actions');
    const buka = el('button', 'button button--secondary', 'Rekam jejak');
    buka.type = 'button';
    buka.setAttribute('aria-label', `Buka rekam jejak ${s.name}`);
    buka.addEventListener('click', () => onOpenStudent(s.id));
    const catat = el('a', 'button button--primary', 'Catat');
    catat.href = `monitoring?studentId=${encodeURIComponent(s.id)}`;
    catat.setAttribute('aria-label', `Catat pembinaan ${s.name}`);
    aksi.append(catat, buka);

    baris.append(identitas, sel1, sel2, sel3, aksi);
    return baris;
  }

  function kartuKegiatan(dormitories) {
    const kegiatan = dormitories.flatMap((d) => d.activities.map((k) => ({ ...k, asrama: d.name })))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);
    if (!kegiatan.length) return null;
    const wadah = el('section', 'crm-white-card beranda-card');
    const kepala = el('div', 'beranda-card__head');
    const teks = el('div');
    teks.append(el('h3', 'beranda-card__title', 'Kegiatan asrama terbaru'), el('p', 'beranda-card__note', 'Kegiatan bersama yang dicatat 30 hari terakhir.'));
    kepala.append(teks);
    wadah.append(kepala);
    const daftar = el('ol', 'beranda-timeline__list');
    kegiatan.forEach((k) => {
      const baris = el('li', 'beranda-timeline__item is-kegiatan');
      const meta = el('div', 'beranda-timeline__meta');
      meta.append(el('span', 'beranda-timeline__kind', tanggal(k.date)));
      if (dormitories.length > 1) meta.append(el('span', '', k.asrama));
      meta.append(el('span', '', `${k.participants} santri`));
      baris.append(meta, el('p', 'beranda-timeline__title', k.title));
      if (k.description) baris.append(el('p', 'beranda-timeline__body', k.description));
      daftar.append(baris);
    });
    wadah.append(daftar);
    return wadah;
  }

  async function render(wadah, { headers, onOpenStudent }) {
    const memuat = el('div', 'crm-white-card beranda-loading', 'Memuat perkembangan santri binaan...');
    memuat.setAttribute('role', 'status');
    wadah.replaceChildren(memuat);

    const response = await fetch('/api/musyrif/ringkasan', { headers });
    if (!response.ok) throw new Error('Ringkasan musyrif belum dapat dimuat.');
    const data = await response.json();
    const { summary, students, dormitories } = data;

    if (!dormitories.length) {
      wadah.replaceChildren(el('div', 'crm-white-card beranda-loading', 'Anda belum ditugaskan ke asrama mana pun. Minta admin menugaskan asrama lewat halaman Monitoring.'));
      return;
    }

    const angkaAtas = el('div', 'beranda-stats musyrif-stats');
    angkaAtas.append(
      angka('Santri binaan', String(summary.students), dormitories.map((d) => d.name).join(', ')),
      angka('Kehadiran 7 hari', summary.attendanceRate7 === null ? '-' : `${summary.attendanceRate7}%`, 'Kegiatan asrama', nadaPersen(summary.attendanceRate7, 85, 70)),
      angka('Sholat berjamaah', summary.prayerRate7 === null ? '-' : `${summary.prayerRate7}%`, '7 hari terakhir', nadaPersen(summary.prayerRate7, 80, 60)),
      angka('Setoran hafalan', String(summary.deposits7), `Pekan ini${summary.violations30 ? ` · ${summary.violations30} catatan disiplin 30 hari` : ''}`)
    );

    const urut = students.slice().sort((a, b) => alasanPerhatian(b).length - alasanPerhatian(a).length || a.name.localeCompare(b.name));
    const jumlahPerhatian = urut.filter((s) => alasanPerhatian(s).length).length;

    const kartu = el('section', 'crm-white-card beranda-card');
    const kepala = el('div', 'beranda-card__head');
    const teks = el('div');
    teks.append(
      el('h3', 'beranda-card__title', 'Perkembangan santri binaan'),
      el('p', 'beranda-card__note', jumlahPerhatian
        ? `${jumlahPerhatian} santri perlu perhatian pekan ini, ditampilkan paling atas.`
        : 'Semua santri dalam kondisi baik pekan ini.')
    );
    kepala.append(teks);
    let hanyaPerhatian = false;
    const daftar = el('ul', 'musyrif-rows');
    if (jumlahPerhatian && jumlahPerhatian < urut.length) {
      const saring = el('button', 'crm-pill-btn', 'Perlu perhatian saja');
      saring.type = 'button';
      saring.setAttribute('aria-pressed', 'false');
      saring.addEventListener('click', () => {
        hanyaPerhatian = !hanyaPerhatian;
        saring.classList.toggle('is-active', hanyaPerhatian);
        saring.setAttribute('aria-pressed', String(hanyaPerhatian));
        lukis();
      });
      kepala.append(saring);
    }
    function lukis() {
      const tampil = hanyaPerhatian ? urut.filter((s) => alasanPerhatian(s).length) : urut;
      daftar.replaceChildren(...(tampil.length
        ? tampil.map((s) => barisSantri(s, onOpenStudent))
        : [el('li', 'beranda-empty', 'Belum ada santri di asrama Anda.')]));
    }
    lukis();
    kartu.append(kepala, daftar);

    const isi = [angkaAtas, kartu];
    const kegiatan = kartuKegiatan(dormitories);
    if (kegiatan) isi.push(kegiatan);
    wadah.replaceChildren(...isi);
  }

  window.HamasahBerandaMusyrif = Object.freeze({ render });
})();
