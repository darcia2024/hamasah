// Beranda wali (16 Oktober 2026): laporan perkembangan ananda yang mudah dibaca.
//   1. Pemilih ananda (bila lebih dari satu).
//   2. Laporan singkat 30 hari: kalimat ringkas, status keseluruhan, dan angka utama
//      dengan perbandingan 30 hari sebelumnya.
//   3. Diagram: peta sholat berjamaah per waktu, donut kehadiran kegiatan, cincin hafalan
//      30 juz dengan mutu setoran, dan catatan pembina (berhalaman).
//   4. Laporan kegiatan dan pengumuman (berhalaman, dari beranda-keluarga.js).
// Data dari API yang sama dengan rekam jejak; tidak ada angka karangan. SVG dibuat lewat
// DOM (tanpa atribut style) supaya lolos CSP.
(function initBerandaWali() {
  const K = window.HamasahBerandaKeluarga;
  if (!K) return;
  const SVG = 'http://www.w3.org/2000/svg';
  const SHOLAT = [['subuh', 'Subuh'], ['dzuhur', 'Dzuhur'], ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya']];
  const STATUS_SHOLAT = { berjamaah: 'Berjamaah', munfarid: 'Munfarid', izin: 'Izin', tidak: 'Tidak sholat' };
  const HARI_PENDEK = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const PILIHAN_KUNCI = 'hamasahWaliAnanda';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  }

  function persen(bagian, total) {
    return total ? Math.round((bagian / total) * 100) : null;
  }

  function tanggalIso(mundur) {
    const d = new Date();
    d.setDate(d.getDate() - mundur);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function kartu(judul, keterangan, kelas = '') {
    const wadah = el('section', `crm-white-card beranda-card ${kelas}`.trim());
    const kepala = el('div', 'beranda-card__head');
    const teks = el('div');
    teks.append(el('h3', 'beranda-card__title', judul));
    if (keterangan) teks.append(el('p', 'beranda-card__note', keterangan));
    kepala.append(teks);
    wadah.append(kepala);
    return { wadah, kepala };
  }

  function kosong(teks) {
    return el('p', 'wali-empty', teks);
  }

  // ------------------------------------------------------------ Angka & tren
  function hitung(data) {
    const d = data.dashboard || {};
    const care = data.care || {};
    const prayers = care.prayers || { recorded: 0, totals: {} };
    const hadir = d.attendance || { total: 0, present: 0, byStatus: {} };
    const setoran = care.memorization || [];
    return {
      sholat: prayers.berjamaahRate,
      sholatDicatat: prayers.recorded || 0,
      sholatBerjamaah: (prayers.totals && prayers.totals.berjamaah) || 0,
      hadir: hadir.rate === undefined ? null : hadir.rate,
      hadirTotal: hadir.total || 0,
      hadirMasuk: hadir.present || 0,
      byStatus: hadir.byStatus || {},
      setoran: setoran.length,
      lancar: setoran.filter((m) => m.grade === 'lancar').length,
      kurang: setoran.filter((m) => m.grade === 'kurang-lancar').length,
      ulang: setoran.filter((m) => m.grade === 'ulang').length,
      catatan: (d.evaluations || []).length,
      prestasi: (d.achievements || []).length,
      disiplin: (d.discipline || []).length
    };
  }

  function selisih(kini, lalu) {
    if (kini === null || kini === undefined || lalu === null || lalu === undefined) return null;
    return kini - lalu;
  }

  function tren(nilai, satuan = ' poin') {
    if (nilai === null) return null;
    const node = el('span', `wali-trend ${nilai > 0 ? 'is-naik' : nilai < 0 ? 'is-turun' : 'is-tetap'}`);
    node.textContent = nilai > 0 ? `▲ ${nilai}${satuan}` : nilai < 0 ? `▼ ${Math.abs(nilai)}${satuan}` : '● sama';
    node.setAttribute('aria-label', nilai > 0 ? `naik ${nilai}${satuan}` : nilai < 0 ? `turun ${Math.abs(nilai)}${satuan}` : 'sama dengan periode sebelumnya');
    return node;
  }

  // Status keseluruhan: baik / cukup / perlu perhatian, beserta alasannya.
  function nilaiKeseluruhan(a, data) {
    const alasan = [];
    if (a.sholat !== null && a.sholat < 60) alasan.push('sholat berjamaah di bawah 60%');
    if (a.hadir !== null && a.hadir < 70) alasan.push('kehadiran kegiatan di bawah 70%');
    if (a.ulang >= 2) alasan.push(`${a.ulang} setoran perlu diulang`);
    if (a.disiplin) alasan.push(`${a.disiplin} catatan disiplin`);
    const adaData = a.sholatDicatat || a.hadirTotal || a.setoran || a.catatan;
    if (!adaData) return { nada: 'netral', label: 'Belum banyak catatan', alasan: ['musyrif belum mencatat kegiatan 30 hari ini'] };
    if (alasan.length) return { nada: 'perlu', label: 'Perlu perhatian', alasan };
    const bagus = (a.sholat === null || a.sholat >= 80) && (a.hadir === null || a.hadir >= 85);
    return bagus
      ? { nada: 'baik', label: 'Perkembangan baik', alasan: [] }
      : { nada: 'cukup', label: 'Cukup baik', alasan: [] };
  }

  function kalimatLaporan(nama, a, lalu, data) {
    const depan = String(nama || 'Ananda').split(/\s+/)[0];
    const kalimat = [];
    if (a.sholatDicatat) {
      const beda = lalu ? selisih(a.sholat, lalu.sholat) : null;
      kalimat.push(`${depan} sholat berjamaah ${a.sholat}% dari ${a.sholatDicatat} waktu yang dicatat musyrif${beda === null ? '' : beda > 0 ? `, naik ${beda} poin dari 30 hari sebelumnya` : beda < 0 ? `, turun ${Math.abs(beda)} poin dari 30 hari sebelumnya` : ', sama seperti 30 hari sebelumnya'}.`);
    } else {
      kalimat.push('Presensi sholat belum dicatat musyrif dalam 30 hari ini.');
    }
    if (a.hadirTotal) {
      const telat = a.byStatus.late || 0;
      const alpa = a.byStatus.absent || 0;
      kalimat.push(`Hadir di ${a.hadirMasuk} dari ${a.hadirTotal} kegiatan asrama${telat ? ` (${telat} kali terlambat)` : ''}${alpa ? `, ${alpa} kali tidak hadir` : ''}.`);
    }
    const juz = data.juz;
    if (a.setoran) {
      kalimat.push(`Menyetor hafalan ${a.setoran} kali: ${a.lancar} lancar${a.kurang ? `, ${a.kurang} kurang lancar` : ''}${a.ulang ? `, ${a.ulang} perlu diulang` : ''}.`);
    }
    if (juz) kalimat.push(juz.hafal || juz.sedang ? `Total hafalan ${juz.hafal} juz${juz.sedang ? `, ${juz.sedang} juz sedang dihafal` : ''}.` : 'Belum ada juz yang ditandai hafal.');
    const pembinaan = [];
    if (a.catatan) pembinaan.push(`${a.catatan} catatan pembina`);
    if (a.prestasi) pembinaan.push(`${a.prestasi} prestasi`);
    pembinaan.push(a.disiplin ? `${a.disiplin} catatan disiplin` : 'tanpa catatan disiplin');
    kalimat.push(`Pembinaan: ${pembinaan.join(', ')}.`);
    return kalimat;
  }

  function kotakAngka(label, nilai, catatan, trenNode, nada = '') {
    const kotak = el('div', `wali-kpi ${nada ? `is-${nada}` : ''}`.trim());
    const atas = el('div', 'wali-kpi__top');
    atas.append(el('span', 'wali-kpi__label', label));
    if (trenNode) atas.append(trenNode);
    kotak.append(atas, el('strong', 'wali-kpi__value', nilai), el('span', 'wali-kpi__note', catatan));
    return kotak;
  }

  function nadaPersen(nilai, baik, buruk) {
    if (nilai === null || nilai === undefined) return '';
    return nilai >= baik ? 'baik' : nilai < buruk ? 'perlu' : '';
  }

  function kartuRingkasan(student, data, onOpen) {
    const a = hitung(data);
    const lalu = data.lalu ? hitung(data.lalu) : null;
    const status = nilaiKeseluruhan(a, data);
    const wadah = el('section', 'crm-white-card wali-summary');

    const kepala = el('div', 'wali-summary__head');
    const avatar = el('span', 'wali-avatar', K.inisial(student.name));
    avatar.setAttribute('aria-hidden', 'true');
    const id = el('div', 'wali-summary__id');
    const supervisors = data.dashboard && data.dashboard.student && data.dashboard.student.dormitory && data.dashboard.student.dormitory.supervisors;
    id.append(
      el('h3', 'wali-summary__name', student.name),
      el('p', 'wali-summary__meta', [student.program, student.dormitoryName, supervisors && supervisors.length ? `Musyrif: ${supervisors.join(', ')}` : null].filter(Boolean).join(' · '))
    );
    const buka = el('button', 'button button--secondary', 'Rekam jejak lengkap');
    buka.type = 'button';
    buka.addEventListener('click', onOpen);
    kepala.append(avatar, id, buka);

    const laporan = el('div', `wali-report is-${status.nada}`);
    const lencana = el('div', 'wali-report__head');
    lencana.append(el('span', 'wali-report__eyebrow', `Laporan singkat · ${K.PERIODE_HARI} hari terakhir`), el('span', `wali-badge is-${status.nada}`, status.label));
    const daftar = el('ul', 'wali-report__list');
    kalimatLaporan(student.name, a, lalu, data).forEach((teks) => daftar.append(el('li', '', teks)));
    laporan.append(lencana, daftar);
    if (status.alasan.length && status.nada === 'perlu') {
      laporan.append(el('p', 'wali-report__why', `Yang perlu diperhatikan: ${status.alasan.join(', ')}.`));
    }

    const angka = el('div', 'wali-kpis');
    angka.append(
      kotakAngka('Sholat berjamaah', a.sholat === null ? '-' : `${a.sholat}%`, a.sholatDicatat ? `${a.sholatBerjamaah} dari ${a.sholatDicatat} waktu` : 'Belum dicatat', lalu ? tren(selisih(a.sholat, lalu.sholat)) : null, nadaPersen(a.sholat, 80, 60)),
      kotakAngka('Kehadiran kegiatan', a.hadir === null ? '-' : `${a.hadir}%`, a.hadirTotal ? `${a.hadirMasuk} dari ${a.hadirTotal} kegiatan` : 'Belum dicatat', lalu ? tren(selisih(a.hadir, lalu.hadir)) : null, nadaPersen(a.hadir, 85, 70)),
      kotakAngka('Setoran hafalan', `${a.setoran}x`, a.setoran ? `${a.lancar} lancar` : 'Belum ada setoran', lalu ? tren(a.setoran - lalu.setoran, 'x') : null),
      kotakAngka('Hafalan Al-Qur\'an', data.juz ? `${data.juz.hafal} juz` : '-', data.juz && data.juz.sedang ? `${data.juz.sedang} juz sedang dihafal` : 'dari 30 juz', null)
    );

    wadah.append(kepala);
    const chip = K.chipUrusan(data);
    if (chip) wadah.append(chip);
    wadah.append(laporan, angka);
    return wadah;
  }

  // ------------------------------------------------------- Peta sholat 30 hari
  function kartuSholat(data) {
    const { wadah } = kartu('Sholat berjamaah', 'Setiap kotak satu waktu sholat, 30 hari terakhir. Hari terbaru di paling kanan.', 'wali-chart');
    const prayers = data.care && data.care.prayers;
    if (!prayers || !prayers.recorded) {
      wadah.append(kosong('Presensi sholat belum dicatat musyrif dalam 30 hari terakhir.'));
      return wadah;
    }
    const perTanggal = new Map((prayers.days || []).map((hari) => [hari.date, hari.prayers]));
    const tanggal = Array.from({ length: K.PERIODE_HARI }, (_, i) => tanggalIso(K.PERIODE_HARI - 1 - i));

    const peta = el('div', 'wali-heatmap');
    peta.setAttribute('role', 'img');
    peta.setAttribute('aria-label', `Peta sholat berjamaah 30 hari: ${prayers.berjamaahRate}% berjamaah dari ${prayers.recorded} waktu yang dicatat.`);
    SHOLAT.forEach(([kunci, label]) => {
      const baris = el('div', 'wali-heatmap__row');
      baris.append(el('span', 'wali-heatmap__label', label));
      const sel = el('div', 'wali-heatmap__cells');
      tanggal.forEach((tgl) => {
        const status = (perTanggal.get(tgl) || {})[kunci] || null;
        const kotak = el('span', `wali-cell ${status ? `is-${status}` : 'is-kosong'}`);
        kotak.title = `${HARI_PENDEK.format(new Date(`${tgl}T00:00:00Z`))} · ${label}: ${status ? STATUS_SHOLAT[status] : 'belum dicatat'}`;
        sel.append(kotak);
      });
      baris.append(sel);
      peta.append(baris);
    });
    const sumbu = el('div', 'wali-heatmap__axis');
    sumbu.append(el('span', '', HARI_PENDEK.format(new Date(`${tanggal[0]}T00:00:00Z`))), el('span', '', 'Hari ini'));
    peta.append(sumbu);

    // Persentase berjamaah per waktu: bar horizontal.
    const bars = el('ul', 'wali-bars');
    SHOLAT.forEach(([kunci, label]) => {
      let dicatat = 0;
      let jamaah = 0;
      (prayers.days || []).forEach((hari) => {
        const status = hari.prayers[kunci];
        if (status) dicatat += 1;
        if (status === 'berjamaah') jamaah += 1;
      });
      const nilai = persen(jamaah, dicatat);
      const baris = el('li', 'wali-bars__row');
      const batang = el('span', 'wali-bars__track');
      const isi = el('span', `wali-bars__fill ${nadaPersen(nilai, 80, 60) ? `is-${nadaPersen(nilai, 80, 60)}` : ''}`.trim());
      isi.style.width = `${nilai || 0}%`;
      batang.append(isi);
      baris.append(el('span', 'wali-bars__label', label), batang, el('strong', 'wali-bars__value', nilai === null ? '-' : `${nilai}%`));
      bars.append(baris);
    });

    const legenda = el('ul', 'wali-legend');
    [['berjamaah', 'Berjamaah'], ['munfarid', 'Munfarid'], ['izin', 'Izin'], ['tidak', 'Tidak sholat'], ['kosong', 'Belum dicatat']].forEach(([k, l]) => {
      const item = el('li', '');
      item.append(el('span', `wali-cell is-${k}`), document.createTextNode(l));
      legenda.append(item);
    });
    wadah.append(peta, legenda, el('h4', 'wali-subtitle', 'Berjamaah per waktu'), bars);
    return wadah;
  }

  // ------------------------------------------------------- Donut kehadiran
  function donut(bagian, { tengah, sub, label }) {
    const total = bagian.reduce((jumlah, b) => jumlah + b.nilai, 0);
    const r = 42;
    const keliling = 2 * Math.PI * r;
    const gambar = svg('svg', { viewBox: '0 0 120 120', class: 'wali-donut', role: 'img', 'aria-label': label });
    gambar.append(svg('circle', { cx: 60, cy: 60, r, class: 'wali-donut__track' }));
    let geser = 0;
    bagian.filter((b) => b.nilai > 0).forEach((b) => {
      const panjang = (b.nilai / total) * keliling;
      gambar.append(svg('circle', {
        cx: 60, cy: 60, r,
        class: `wali-donut__seg is-${b.kelas}`,
        'stroke-dasharray': `${Math.max(0, panjang - 1.5)} ${keliling}`,
        'stroke-dashoffset': -geser,
        transform: 'rotate(-90 60 60)'
      }));
      geser += panjang;
    });
    const teks1 = svg('text', { x: 60, y: 58, class: 'wali-donut__value', 'text-anchor': 'middle' });
    teks1.textContent = tengah;
    const teks2 = svg('text', { x: 60, y: 76, class: 'wali-donut__sub', 'text-anchor': 'middle' });
    teks2.textContent = sub;
    gambar.append(teks1, teks2);
    return gambar;
  }

  function legendaAngka(bagian) {
    const daftar = el('ul', 'wali-legend wali-legend--stack');
    bagian.forEach((b) => {
      const item = el('li', '');
      item.append(el('span', `wali-dot is-${b.kelas}`), el('span', 'wali-legend__label', b.label), el('strong', 'wali-legend__value', String(b.nilai)));
      daftar.append(item);
    });
    return daftar;
  }

  function kartuKehadiran(data) {
    const { wadah } = kartu('Kehadiran kegiatan', 'Kegiatan asrama: talaqqi, mudzakarah, kajian, dan lainnya.', 'wali-chart');
    const hadir = data.dashboard && data.dashboard.attendance;
    if (!hadir || !hadir.total) {
      wadah.append(kosong('Belum ada kegiatan asrama yang dicatat dalam 30 hari terakhir.'));
      return wadah;
    }
    const s = hadir.byStatus || {};
    const bagian = [
      { kelas: 'hadir', label: 'Hadir', nilai: s.present || 0 },
      { kelas: 'telat', label: 'Terlambat', nilai: s.late || 0 },
      { kelas: 'izin', label: 'Izin / sakit', nilai: s.excused || 0 },
      { kelas: 'alpa', label: 'Tidak hadir', nilai: s.absent || 0 }
    ];
    const isi = el('div', 'wali-donut-wrap');
    isi.append(donut(bagian, { tengah: `${hadir.rate}%`, sub: 'hadir', label: `Kehadiran ${hadir.rate}% dari ${hadir.total} kegiatan` }), legendaAngka(bagian));
    wadah.append(isi);

    // Kegiatan yang paling sering diikuti.
    const perKegiatan = new Map();
    (hadir.entries || []).forEach((e) => {
      const nama = e.category || 'Kegiatan asrama';
      const v = perKegiatan.get(nama) || { total: 0, masuk: 0 };
      v.total += 1;
      if (e.status === 'present' || e.status === 'late') v.masuk += 1;
      perKegiatan.set(nama, v);
    });
    const teratas = [...perKegiatan.entries()].sort((x, y) => y[1].total - x[1].total).slice(0, 4);
    if (teratas.length) {
      const daftar = el('ul', 'wali-mini-list');
      teratas.forEach(([nama, v]) => {
        const item = el('li', '');
        item.append(el('span', '', nama), el('strong', '', `${v.masuk}/${v.total}`));
        daftar.append(item);
      });
      wadah.append(el('h4', 'wali-subtitle', 'Per kegiatan'), daftar);
    }
    return wadah;
  }

  // ------------------------------------------------------- Hafalan
  function kartuHafalan(data) {
    const { wadah } = kartu('Hafalan Al-Qur\'an', 'Juz yang ditandai musyrif dan mutu setoran 30 hari terakhir.', 'wali-chart');
    const juz = data.juz;
    const setoran = (data.care && data.care.memorization) || [];
    if (!juz && !setoran.length) {
      wadah.append(kosong('Belum ada catatan hafalan.'));
      return wadah;
    }
    const isi = el('div', 'wali-donut-wrap');
    if (juz) {
      const bagian = [
        { kelas: 'hafal', label: 'Sudah hafal', nilai: juz.hafal || 0 },
        { kelas: 'sedang', label: 'Sedang dihafal', nilai: juz.sedang || 0 },
        { kelas: 'belum', label: 'Belum', nilai: Math.max(0, 30 - (juz.hafal || 0) - (juz.sedang || 0)) }
      ];
      isi.append(donut(bagian, { tengah: `${juz.hafal}`, sub: 'dari 30 juz', label: `${juz.hafal} dari 30 juz sudah hafal` }), legendaAngka(bagian));
      wadah.append(isi);
      const strip = el('div', 'wali-juz');
      strip.setAttribute('aria-hidden', 'true');
      (juz.juz || []).forEach((j) => {
        const kotak = el('span', `wali-juz__cell is-${j.status}`, String(j.number));
        kotak.title = `Juz ${j.number}: ${j.status === 'hafal' ? 'sudah hafal' : j.status === 'sedang' ? 'sedang dihafal' : 'belum'}`;
        strip.append(kotak);
      });
      wadah.append(strip);
    }

    wadah.append(el('h4', 'wali-subtitle', 'Mutu setoran'));
    if (!setoran.length) {
      wadah.append(kosong('Belum ada setoran dalam 30 hari terakhir.'));
      return wadah;
    }
    const mutu = [
      ['lancar', 'Lancar', setoran.filter((m) => m.grade === 'lancar').length],
      ['kurang', 'Kurang lancar', setoran.filter((m) => m.grade === 'kurang-lancar').length],
      ['ulang', 'Perlu diulang', setoran.filter((m) => m.grade === 'ulang').length]
    ];
    const tumpuk = el('div', 'wali-stack');
    tumpuk.setAttribute('role', 'img');
    tumpuk.setAttribute('aria-label', mutu.map(([, l, n]) => `${l} ${n}`).join(', '));
    mutu.forEach(([k, l, n]) => {
      if (!n) return;
      const bagian = el('span', `wali-stack__part is-${k}`, String(n));
      bagian.style.flexGrow = String(n);
      bagian.title = `${l}: ${n}`;
      tumpuk.append(bagian);
    });
    const legenda = el('ul', 'wali-legend');
    mutu.forEach(([k, l, n]) => {
      const item = el('li', '');
      item.append(el('span', `wali-dot is-${k}`), document.createTextNode(`${l} (${n})`));
      legenda.append(item);
    });
    const terakhir = setoran.slice().sort((x, y) => String(y.occurredOn).localeCompare(String(x.occurredOn))).slice(0, 3);
    const daftar = el('ul', 'wali-mini-list');
    terakhir.forEach((m) => {
      const item = el('li', '');
      item.append(el('span', '', `${m.kind === 'ziyadah' ? 'Baru' : 'Murajaah'} · ${m.portion}`), el('strong', `wali-grade is-${m.grade}`, K.NILAI_HAFALAN[m.grade] || m.grade));
      daftar.append(item);
    });
    wadah.append(tumpuk, legenda, el('h4', 'wali-subtitle', 'Setoran terakhir'), daftar);
    return wadah;
  }

  // ------------------------------------------------------- Catatan pembina
  function kartuCatatan(data) {
    const { wadah } = kartu('Catatan pembina', 'Evaluasi, prestasi, dan catatan disiplin dari musyrif.', 'wali-chart');
    const d = data.dashboard || {};
    const items = [
      ...(d.evaluations || []).map((e) => ({ waktu: e.occurredAt, jenis: e.area || 'Evaluasi', isi: e.note, nada: 'catatan' })),
      ...(d.achievements || []).map((e) => ({ waktu: e.occurredAt, jenis: 'Prestasi', isi: [e.title, e.description].filter(Boolean).join('. '), nada: 'baik' })),
      ...(d.discipline || []).map((e) => ({ waktu: e.occurredAt, jenis: 'Disiplin', isi: e.note, nada: 'perlu' }))
    ].sort((x, y) => String(y.waktu).localeCompare(String(x.waktu)));
    const pager = K.penomoran({
      perHalaman: 3,
      tagDaftar: 'ul',
      kelasDaftar: 'wali-notes',
      kosong: 'Belum ada catatan pembina dalam 30 hari terakhir.',
      render(halaman, daftar) {
        halaman.forEach((c) => {
          const item = el('li', `wali-note is-${c.nada}`);
          const meta = el('div', 'wali-note__meta');
          meta.append(el('span', 'wali-note__kind', c.jenis), el('span', '', K.tanggal(c.waktu)));
          item.append(meta, el('p', 'wali-note__body', c.isi));
          daftar.append(item);
        });
      }
    });
    wadah.append(pager.wadah);
    pager.setel(items);
    return wadah;
  }

  // ------------------------------------------------------- Keuangan
  function kartuTagihan(data) {
    if (!data.tagihan || !data.tagihan.length) return null;
    const { wadah } = kartu('Tagihan', 'Tagihan ananda yang belum lunas dan pembayaran terakhir.', 'wali-chart');
    const belum = data.tagihan.filter((t) => t.status === 'unpaid');
    const lunas = data.tagihan.filter((t) => t.status === 'paid').sort((x, y) => String(y.paidAt).localeCompare(String(x.paidAt)));
    const total = belum.reduce((jumlah, t) => jumlah + (Number(t.amount) || 0), 0);
    const angka = el('div', 'wali-bill');
    angka.append(
      el('span', 'wali-kpi__label', 'Belum lunas'),
      el('strong', `wali-bill__value ${belum.length ? 'is-perlu' : 'is-baik'}`, belum.length ? K.rupiah(total) : 'Lunas semua'),
      el('span', 'wali-kpi__note', belum.length ? `${belum.length} tagihan. Petunjuk bayar ada di Rekam jejak lengkap, tab Tagihan.` : 'Tidak ada tagihan tertunda.')
    );
    const pager = K.penomoran({
      perHalaman: 3,
      tagDaftar: 'ul',
      kelasDaftar: 'wali-mini-list',
      kosong: 'Belum ada tagihan.',
      render(halaman, daftar) {
        halaman.forEach((t) => {
          const item = el('li', '');
          item.append(el('span', '', t.description), el('strong', t.status === 'unpaid' ? 'wali-grade is-ulang' : 'wali-grade is-lancar', t.status === 'unpaid' ? K.rupiah(t.amount) : 'Lunas'));
          daftar.append(item);
        });
      }
    });
    wadah.append(angka, pager.wadah);
    pager.setel([...belum, ...lunas]);
    return wadah;
  }

  // ------------------------------------------------------- Rangkai
  function pemilihAnak(students, aktifId, onPilih) {
    const wadah = el('div', 'wali-switch');
    wadah.setAttribute('role', 'tablist');
    wadah.setAttribute('aria-label', 'Pilih ananda');
    students.forEach((s) => {
      const tombol = el('button', `wali-switch__btn ${s.id === aktifId ? 'is-active' : ''}`.trim());
      tombol.type = 'button';
      tombol.setAttribute('role', 'tab');
      tombol.setAttribute('aria-selected', String(s.id === aktifId));
      const avatar = el('span', 'wali-avatar wali-avatar--sm', K.inisial(s.name));
      avatar.setAttribute('aria-hidden', 'true');
      const teks = el('span', 'wali-switch__text');
      teks.append(el('strong', '', s.name), el('span', '', s.dormitoryName || s.program || ''));
      tombol.append(avatar, teks);
      tombol.addEventListener('click', () => onPilih(s.id));
      wadah.append(tombol);
    });
    return wadah;
  }

  async function render(wadah, { students, headers, onOpenStudent }) {
    if (!students.length) {
      wadah.replaceChildren(el('div', 'crm-white-card beranda-loading', 'Belum ada ananda yang terhubung dengan akun ini. Hubungi admin Hamasah untuk menautkan akun.'));
      return;
    }
    let tersimpan = null;
    try { tersimpan = localStorage.getItem(PILIHAN_KUNCI); } catch { tersimpan = null; }
    let aktifId = students.some((s) => s.id === tersimpan) ? tersimpan : students[0].id;
    const cache = new Map();
    const pengumumanJanji = K.ambil('/api/announcements', headers);

    async function tampilkan() {
      const student = students.find((s) => s.id === aktifId);
      const memuat = el('div', 'crm-white-card beranda-loading', `Menyiapkan laporan ${student.name}...`);
      memuat.setAttribute('role', 'status');
      const atas = students.length > 1 ? [pemilihAnak(students, aktifId, pilih)] : [];
      wadah.replaceChildren(...atas, memuat);

      if (!cache.has(aktifId)) cache.set(aktifId, K.muatAnak(aktifId, headers, { banding: true }));
      const [data, pengumuman] = await Promise.all([cache.get(aktifId), pengumumanJanji]);
      if (student.id !== aktifId) return;

      const grid = el('div', 'wali-grid');
      [kartuSholat(data), kartuKehadiran(data), kartuHafalan(data), kartuCatatan(data)].forEach((k) => grid.append(k));
      const isi = [
        ...atas,
        kartuRingkasan(student, data, () => onOpenStudent(student.id)),
        grid,
        K.kartuLinimasa(K.butirKegiatan(data, student.name), {
          judul: 'Laporan kegiatan',
          keterangan: `Semua catatan ${K.PERIODE_HARI} hari terakhir: kegiatan, presensi, hafalan, pembinaan, izin, dan tagihan.`,
          perHalaman: 6
        })
      ];
      const bawah = el('div', 'wali-grid');
      const tagihan = kartuTagihan(data);
      const umum = K.kartuPengumuman(pengumuman);
      [tagihan, umum].filter(Boolean).forEach((k) => bawah.append(k));
      if (bawah.childElementCount) isi.push(bawah);
      wadah.replaceChildren(...isi);
    }

    function pilih(id) {
      aktifId = id;
      try { localStorage.setItem(PILIHAN_KUNCI, id); } catch { /* tanpa penyimpanan tetap jalan */ }
      tampilkan().catch(() => {
        wadah.replaceChildren(el('div', 'crm-white-card beranda-loading', 'Laporan belum dapat dimuat. Coba muat ulang halaman.'));
      });
    }

    await tampilkan();
  }

  window.HamasahBerandaWali = Object.freeze({ render });
})();
