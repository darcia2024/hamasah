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
  const TAB_KUNCI = 'hamasahWaliTab';

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

  // Satu bagian laporan: judul dan keterangan singkat, tanpa bingkai kartu.
  function kartu(judul, keterangan, kelas = '') {
    const wadah = el('section', `wali-section ${kelas}`.trim());
    const kepala = el('header', 'wali-section__head');
    kepala.append(el('h3', 'wali-section__title', judul));
    if (keterangan) kepala.append(el('p', 'wali-section__note', keterangan));
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
    node.textContent = nilai > 0 ? `naik ${nilai}${satuan}` : nilai < 0 ? `turun ${Math.abs(nilai)}${satuan}` : 'tidak berubah';
    node.title = 'Dibanding 30 hari sebelumnya';
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
    if (!adaData) return { nada: 'netral', label: 'Belum banyak yang dicatat musyrif bulan ini.', alasan: [] };
    if (alasan.length) return { nada: 'perlu', label: `Ada yang perlu diperhatikan: ${alasan.join(', ')}.`, alasan };
    const bagus = (a.sholat === null || a.sholat >= 80) && (a.hadir === null || a.hadir >= 85);
    return bagus
      ? { nada: 'baik', label: 'Alhamdulillah, perkembangannya baik bulan ini.', alasan: [] }
      : { nada: 'cukup', label: 'Secara umum cukup baik, masih bisa ditingkatkan.', alasan: [] };
  }

  function kaliTeks(n) {
    return n === 1 ? 'sekali' : `${n} kali`;
  }

  // Laporan sebagai paragraf yang enak dibaca, seperti surat dari musyrif.
  function kalimatLaporan(nama, a, lalu, data) {
    const depan = String(nama || 'Ananda').split(/\s+/)[0];
    const kalimat = [];
    if (a.sholatDicatat) {
      const beda = lalu ? selisih(a.sholat, lalu.sholat) : null;
      const banding = beda === null ? '' : beda > 0 ? `, naik ${beda} poin dari bulan sebelumnya` : beda < 0 ? `, turun ${Math.abs(beda)} poin dari bulan sebelumnya` : ', sama seperti bulan sebelumnya';
      kalimat.push(`Bulan ini ${depan} sholat berjamaah di ${a.sholatBerjamaah} dari ${a.sholatDicatat} waktu yang dicatat (${a.sholat}%)${banding}.`);
    } else {
      kalimat.push(`Presensi sholat ${depan} belum dicatat musyrif bulan ini.`);
    }
    if (a.hadirTotal) {
      const telat = a.byStatus.late || 0;
      const alpa = a.byStatus.absent || 0;
      const tambahan = [telat ? `${kaliTeks(telat)} terlambat` : null, alpa ? `${kaliTeks(alpa)} tidak hadir` : null].filter(Boolean);
      kalimat.push(`Ananda hadir di ${a.hadirMasuk} dari ${a.hadirTotal} kegiatan asrama${tambahan.length ? `, ${tambahan.join(' dan ')}` : ''}.`);
    }
    const juz = data.juz;
    const hafalan = [];
    if (a.setoran) hafalan.push(`menyetor hafalan ${kaliTeks(a.setoran)}${a.lancar ? `, ${a.lancar === a.setoran ? 'semuanya' : `${a.lancar} di antaranya`} lancar` : ''}`);
    if (juz && (juz.hafal || juz.sedang)) hafalan.push(`sudah ${juz.hafal} juz yang dihafal${juz.sedang ? ` dengan ${juz.sedang} juz sedang berjalan` : ''}`);
    if (hafalan.length) kalimat.push(`Untuk Al-Qur'an, ananda ${hafalan.join(', dan kini ')}.`);
    if (a.ulang) kalimat.push(`Ada ${a.ulang} setoran yang perlu diulang.`);
    const pembinaan = [];
    if (a.catatan) pembinaan.push(`menulis ${a.catatan} catatan`);
    if (a.prestasi) pembinaan.push(`mencatat ${a.prestasi} prestasi`);
    if (pembinaan.length) kalimat.push(`Musyrif ${pembinaan.join(' dan ')}${a.disiplin ? `, serta ${a.disiplin} catatan disiplin` : ', tanpa catatan disiplin'}.`);
    else if (a.disiplin) kalimat.push(`Ada ${a.disiplin} catatan disiplin dari musyrif.`);
    return kalimat;
  }

  function kotakAngka(label, nilai, catatan, trenNode, nada = '') {
    const kotak = el('div', `wali-stat ${nada ? `is-${nada}` : ''}`.trim());
    kotak.append(el('strong', 'wali-stat__value', nilai), el('span', 'wali-stat__label', label));
    const bawah = el('span', 'wali-stat__note', catatan);
    if (trenNode) bawah.append(document.createTextNode(' · '), trenNode);
    kotak.append(bawah);
    return kotak;
  }

  function nadaPersen(nilai, baik, buruk) {
    if (nilai === null || nilai === undefined) return '';
    return nilai >= baik ? 'baik' : nilai < buruk ? 'perlu' : '';
  }

  // Urusan yang menunggu wali (tagihan, izin) sebagai satu kalimat, bukan deretan lencana.
  function kalimatUrusan(data) {
    const butir = [];
    if (data.tagihan) {
      const belum = data.tagihan.filter((item) => item.status === 'unpaid');
      const total = belum.reduce((jumlah, item) => jumlah + (Number(item.amount) || 0), 0);
      if (belum.length) butir.push(`${belum.length} tagihan belum lunas (${K.rupiah(total)})`);
    }
    if (data.izin) {
      const menunggu = data.izin.filter((item) => item.status === 'menunggu').length;
      if (menunggu) butir.push(`${menunggu} izin menunggu keputusan musyrif`);
    }
    if (!butir.length) return null;
    const baris = el('p', 'wali-pending');
    baris.append(el('span', 'wali-pending__dot'), document.createTextNode(`Perlu Bapak/Ibu ketahui: ${butir.join(' dan ')}.`));
    return baris;
  }

  function ringkasanPembina(data) {
    const { wadah } = kartu('Ringkasan musyrif', 'Catatan pembina dalam 7 hari terakhir.', 'wali-weekly');
    const batas = Date.now() - 7 * 86400000;
    const notes = ((data.dashboard || {}).evaluations || []).filter(n => n.note && Date.parse(n.occurredAt) >= batas && Date.parse(n.occurredAt) <= Date.now()).sort((a,b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
    if (!notes.length) wadah.append(kosong('Belum ada catatan musyrif untuk pekan ini. Catatan sebelumnya tetap tersedia di bagian Catatan pembina.'));
    else {
      const list = el('ul', 'wali-weekly__list');
      notes.slice(0, 3).forEach(n => {
        const item = el('li');
        item.append(el('p', 'wali-weekly__meta', [n.area || 'Pembinaan', K.tanggal(n.occurredAt)].join(' · ')), el('p', 'wali-weekly__text', n.note));
        list.append(item);
      });
      wadah.append(list);
      if (notes.length > 3) wadah.append(kosong('Catatan lainnya tersedia di bagian Catatan pembina.'));
    }
    return wadah;
  }

  function perhatian(data, iqamah, studentId, onOpen) {
    const box = el('section', 'wali-attention');
    box.append(el('h4', 'wali-attention__title', 'Perlu perhatian'));
    const items = [];
    const unpaid = (data.tagihan || []).filter(t => t.status === 'unpaid');
    if (unpaid.length) items.push(`${unpaid.length} tagihan belum lunas (${K.rupiah(unpaid.reduce((sum,t) => sum + (Number(t.amount) || 0), 0))}). Lihat rincian dan petunjuk pembayaran di rekam jejak ananda.`);
    const q = iqamah && (iqamah.students || []).find(s => String(s.id) === String(studentId));
    if (q && q.iqamah) {
      const stage = q.iqamah.tahap;
      if (stage === 'kosong') items.push('Tanggal habis iqamah belum tercatat. Ingatkan ananda untuk melaporkannya kepada musyrif.');
      if (['habis','urus','siapkan'].includes(stage)) items.push(stage === 'habis' ? 'Iqamah sudah habis. Koordinasikan perpanjangan dengan ananda dan musyrif.' : 'Iqamah memasuki masa persiapan perpanjangan. Pastikan ananda berkoordinasi dengan musyrif.');
    }
    const pending = (data.izin || []).filter(i => i.status === 'menunggu').length;
    if (pending) items.push(`${pending} pengajuan izin menunggu keputusan musyrif. Wali tidak perlu memberikan persetujuan di sini.`);
    const complete = data.tagihan !== null && data.izin !== null && !!q;
    if (items.length) {
      const ul = el('ul', 'wali-attention__list'); items.forEach(text => ul.append(el('li', '', text))); box.append(ul);
      const button = el('button', 'wali-link', 'Lihat rekam jejak ananda →'); button.type = 'button'; button.addEventListener('click', onOpen); box.append(button);
    } else box.append(el('p', 'wali-empty', complete ? 'Tidak ada hal yang perlu ditindaklanjuti dari data yang tersedia.' : 'Informasi perhatian belum lengkap karena sebagian data belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.'));
    if (items.length && !complete) box.append(el('p', 'wali-empty', 'Sebagian data belum dapat dimuat. Daftar ini mungkin belum lengkap.'));
    return box;
  }

  function kartuRingkasan(student, data, onOpen, iqamah) {
    const a = hitung(data);
    const lalu = data.lalu ? hitung(data.lalu) : null;
    const status = nilaiKeseluruhan(a, data);
    const wadah = el('section', 'wali-summary');

    const kepala = el('header', 'wali-summary__head');
    const avatar = el('span', 'wali-avatar', K.inisial(student.name));
    avatar.setAttribute('aria-hidden', 'true');
    const id = el('div', 'wali-summary__id');
    const supervisors = data.dashboard && data.dashboard.student && data.dashboard.student.dormitory && data.dashboard.student.dormitory.supervisors;
    id.append(
      el('h3', 'wali-summary__name', student.name),
      el('p', 'wali-summary__meta', [student.program, student.dormitoryName, supervisors && supervisors.length ? `Musyrif ${supervisors.join(', ')}` : null].filter(Boolean).join(' · '))
    );
    const buka = el('button', 'wali-link', 'Rekam jejak lengkap →');
    buka.type = 'button';
    buka.addEventListener('click', onOpen);
    kepala.append(avatar, id, buka);

    const laporan = el('div', 'wali-report');
    laporan.append(el('p', 'wali-eyebrow', `Laporan ${K.PERIODE_HARI} hari terakhir`));
    laporan.append(el('p', `wali-report__status is-${status.nada}`, status.label));
    laporan.append(el('p', 'wali-report__body', kalimatLaporan(student.name, a, lalu, data).join(' ')));
    const records = Object.values(data.dashboard || {}).filter(Array.isArray).flat();
    const updated = records.flatMap(r => [r.updatedAt, r.createdAt]).filter(v => v && Number.isFinite(Date.parse(v)) && Date.parse(v) <= Date.now()).sort((a,b) => Date.parse(b)-Date.parse(a))[0];
    const freshness = el('p', 'wali-freshness', updated ? `Catatan perkembangan terakhir diperbarui: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(updated))} waktu Kairo.` : 'Waktu pembaruan catatan belum tersedia. Tanggal pada laporan menunjukkan tanggal kegiatan.');
    freshness.append(el('span', '', ' Data yang belum dicatat tidak berarti ananda tidak hadir.'));
    laporan.append(freshness);

    const angka = el('div', 'wali-stats');
    angka.append(
      kotakAngka('sholat berjamaah', a.sholat === null ? '–' : `${a.sholat}%`, a.sholatDicatat ? `${a.sholatBerjamaah} dari ${a.sholatDicatat} waktu` : 'belum dicatat', lalu ? tren(selisih(a.sholat, lalu.sholat)) : null, nadaPersen(a.sholat, 80, 60)),
      kotakAngka('hadir kegiatan', a.hadir === null ? '–' : `${a.hadir}%`, a.hadirTotal ? `${a.hadirMasuk} dari ${a.hadirTotal} kegiatan` : 'belum dicatat', lalu ? tren(selisih(a.hadir, lalu.hadir)) : null, nadaPersen(a.hadir, 85, 70)),
      kotakAngka('setoran hafalan', `${a.setoran}×`, a.setoran ? `${a.lancar} lancar` : 'belum ada', lalu ? tren(a.setoran - lalu.setoran, '×') : null),
      kotakAngka('juz dihafal', data.juz ? String(data.juz.hafal) : '–', data.juz && data.juz.sedang ? `${data.juz.sedang} juz sedang dihafal` : 'dari 30 juz', null)
    );

    wadah.append(kepala, perhatian(data, iqamah, student.id, onOpen), laporan, angka);
    return wadah;
  }

  // ------------------------------------------------------- Peta sholat 30 hari
  function kartuSholat(data) {
    const { wadah } = kartu('Sholat berjamaah', 'Lima waktu selama 30 hari terakhir, hari terbaru di kanan.', 'wali-chart');
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
    const { wadah } = kartu('Kegiatan asrama', 'Talaqqi, mudzakarah, kajian, dan kegiatan bersama lainnya.', 'wali-chart');
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
    const { wadah } = kartu('Hafalan Al-Qur\'an', 'Juz yang sudah ditandai musyrif dan mutu setoran bulan ini.', 'wali-chart');
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
  function kartuCatatan(data, { judul = 'Catatan pembina', keterangan = 'Yang ditulis musyrif tentang ananda.' } = {}) {
    const { wadah } = kartu(judul, keterangan, 'wali-chart');
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
    const { wadah } = kartu('Tagihan', null, 'wali-chart');
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
      tombol.append(el('span', 'wali-switch__name', s.name), el('span', 'wali-switch__meta', s.dormitoryName || s.program || ''));
      tombol.addEventListener('click', () => onPilih(s.id));
      wadah.append(tombol);
    });
    return wadah;
  }

  async function render(wadah, { students, headers, onOpenStudent }) {
    wadah.classList.add('wali-page');
    if (!students.length) {
      wadah.replaceChildren(el('p', 'wali-loading', 'Belum ada ananda yang terhubung dengan akun ini. Hubungi admin Hamasah untuk menautkan akun.'));
      return;
    }
    let tersimpan = null;
    try { tersimpan = localStorage.getItem(PILIHAN_KUNCI); } catch { tersimpan = null; }
    let aktifId = students.some((s) => s.id === tersimpan) ? tersimpan : students[0].id;
    const cache = new Map();
    const pengumumanJanji = K.ambil('/api/announcements', headers);
    const iqamahJanji = K.ambil('/api/iqamah-saya', headers);

    async function tampilkan() {
      const student = students.find((s) => s.id === aktifId);
      const memuat = el('p', 'wali-loading', `Menyiapkan laporan ${student.name}...`);
      memuat.setAttribute('role', 'status');
      const atas = students.length > 1 ? [pemilihAnak(students, aktifId, pilih)] : [];
      wadah.replaceChildren(...atas, memuat);

      if (!cache.has(aktifId)) {
        cache.set(aktifId, Promise.all([
          K.muatAnak(aktifId, headers, { banding: true }),
          K.ambil(`/api/students/${encodeURIComponent(aktifId)}/profil`, headers)
        ]));
      }
      const [[data, profil], pengumuman, jadwalAsrama, iqamah] = await Promise.all([cache.get(aktifId), pengumumanJanji, K.muatJadwalAsrama(headers), iqamahJanji]);
      if (student.id !== aktifId) return;

      const B = window.HamasahWaliBagian;
      const tagihan = kartuTagihan(data);
      const umum = K.kartuPengumuman(pengumuman, 3, { polos: true });
      // Iqamah ananda, hanya dilihat; laporan tanggal baru dikirim santri sendiri.
      const iqamahAnanda = window.HamasahIqamah ? window.HamasahIqamah.kartu(iqamah, { studentId: student.id, headers }) : null;
      const jadwal = K.bagianJadwalAsrama(jadwalAsrama, student.id, { polos: true });
      const grup = (...anak) => {
        const baris = el('div', 'wali-grid');
        anak.filter(Boolean).forEach((k) => baris.append(k));
        return baris.childElementCount ? baris : null;
      };

      // Menu dikelompokkan menurut keperluan wali; di ponsel menjadi baris yang bisa digeser.
      const kategori = [
        { id: 'ringkasan', label: 'Ringkasan', isi: [kartuRingkasan(student, data, () => onOpenStudent(student.id), iqamah), ringkasanPembina(data)] },
        { id: 'pendidikan', label: 'Pendidikan & administrasi', isi: [B ? B.kartuPendidikan(profil, data.izin) : null, grup(iqamahAnanda)] },
        { id: 'absensi', label: 'Absensi', isi: [grup(kartuKehadiran(data), B ? B.kartuAbsensiJenis(data) : null, kartuSholat(data)), jadwal] },
        {
          id: 'hafalan',
          label: 'Hafalan & rapor',
          isi: [grup(kartuHafalan(data), B ? B.kartuRapor(student, headers) : null), kartuCatatan(data), K.kartuLinimasa(K.butirKegiatan(data, student.name), {
            judul: 'Catatan harian',
            keterangan: `Semua yang tercatat ${K.PERIODE_HARI} hari terakhir, terbaru di atas.`,
            perHalaman: 8,
            polos: true
          })]
        },
        { id: 'info', label: 'Info & tagihan', isi: [grup(tagihan, umum), B ? B.kartuDokumentasi(jadwalAsrama, student.id, headers) : null] },
        { id: 'masukan', label: 'Kritik & saran', isi: [B ? B.kartuMasukan(students, student.id, headers) : null] }
      ].map((k) => ({ ...k, isi: k.isi.filter(Boolean) })).filter((k) => k.isi.length);

      let tersimpanTab = null;
      try { tersimpanTab = localStorage.getItem(TAB_KUNCI); } catch { tersimpanTab = null; }
      const tab = el('div', 'wali-tabs');
      tab.setAttribute('role', 'tablist');
      tab.setAttribute('aria-label', 'Kategori laporan ananda');
      const panel = new Map();
      const tombol = new Map();
      function aktifkan(id, fokus = false) {
        kategori.forEach((k) => {
          const aktif = k.id === id;
          panel.get(k.id).hidden = !aktif;
          tombol.get(k.id).classList.toggle('is-active', aktif);
          tombol.get(k.id).setAttribute('aria-selected', String(aktif));
          tombol.get(k.id).tabIndex = aktif ? 0 : -1;
        });
        if (fokus) tombol.get(id).focus();
        try { localStorage.setItem(TAB_KUNCI, id); } catch { /* tanpa penyimpanan tetap jalan */ }
      }
      kategori.forEach((k, indeks) => {
        const b = el('button', 'wali-tab', k.label);
        b.type = 'button';
        b.id = `wali-tab-${k.id}`;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-controls', `wali-panel-${k.id}`);
        b.addEventListener('click', () => aktifkan(k.id));
        b.addEventListener('keydown', (event) => {
          const geser = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
          if (!geser) return;
          event.preventDefault();
          aktifkan(kategori[(indeks + geser + kategori.length) % kategori.length].id, true);
        });
        tombol.set(k.id, b);
        tab.append(b);
        const p = el('div', 'wali-panel');
        p.id = `wali-panel-${k.id}`;
        p.setAttribute('role', 'tabpanel');
        p.setAttribute('aria-labelledby', b.id);
        p.append(...k.isi);
        panel.set(k.id, p);
      });
      wadah.replaceChildren(...atas, tab, ...kategori.map((k) => panel.get(k.id)));
      aktifkan(kategori.some((k) => k.id === tersimpanTab) ? tersimpanTab : kategori[0].id);
    }

    function pilih(id) {
      aktifId = id;
      try { localStorage.setItem(PILIHAN_KUNCI, id); } catch { /* tanpa penyimpanan tetap jalan */ }
      tampilkan().catch(() => {
        wadah.replaceChildren(el('p', 'wali-loading', 'Laporan belum dapat dimuat. Coba muat ulang halaman.'));
      });
    }

    await tampilkan();
  }

  // Bagian yang dipakai ulang beranda santri (beranda-santri.js).
  window.HamasahBerandaWali = Object.freeze({
    render,
    bagian: Object.freeze({ hitung, selisih, tren, kotakAngka, nadaPersen, kartu, kosong, kartuSholat, kartuKehadiran, kartuHafalan, kartuCatatan })
  });
})();
