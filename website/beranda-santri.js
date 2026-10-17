// Beranda santri (17 Oktober 2026). Urutan dari yang paling sering dibuka:
//   1. Hari ini: jadwal rutin hari ini (yang sedang/berikutnya disorot), piket, acara
//      terdekat dengan hitung mundur, lanjutkan belajar, dan pintasan (izin, ruang belajar).
//   2. Laporanku 30 hari: status, angka utama dengan perbandingan bulan lalu.
//   3. Diagram (dari beranda-wali.js): sholat berjamaah, kegiatan, hafalan, catatan musyrif.
//   4. Prestasi, kelas online, jadwal asrama (kalender) dan acara mendatang, galeri asrama,
//      pengumuman, izin, dan catatan harian.
// Data: API yang sama dengan beranda wali (/api/students/:id/*, /api/asrama-saya,
// /api/announcements). Semua teks lewat textContent; tidak ada atribut style.
(function initBerandaSantri() {
  const K = window.HamasahBerandaKeluarga;
  const W = window.HamasahBerandaWali && window.HamasahBerandaWali.bagian;
  if (!K || !W) return;
  const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Ahad'];
  const TANGGAL_ACARA = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const TANGGAL_PENDEK = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  // Asrama di Kairo: "hari ini" dan jam mengikuti waktu Kairo.
  const ZONA = 'Africa/Cairo';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function sekarangKairo() {
    const bagian = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const tanggal = `${bagian.year}-${bagian.month}-${bagian.day}`;
    const hari = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
    return { tanggal, hariKe: hari === 0 ? 7 : hari, menit: Number(bagian.hour) * 60 + Number(bagian.minute) };
  }

  function menitDari(jam) {
    if (!jam) return null;
    const [h, m] = String(jam).split(':').map(Number);
    return h * 60 + m;
  }

  function selisihHari(dari, ke) {
    return Math.round((new Date(`${ke}T00:00:00Z`) - new Date(`${dari}T00:00:00Z`)) / 86400000);
  }

  function teksHitungMundur(n) {
    if (n === 0) return 'Hari ini';
    if (n === 1) return 'Besok';
    return `${n} hari lagi`;
  }

  // ------------------------------------------------------------ Hari ini
  function bagianHariIni({ student, asrama, data, kini, onIzin, onOpenFull }) {
    const wadah = el('section', 'snt-today');
    const utama = el('div', 'snt-today__main');
    utama.append(el('p', 'wali-eyebrow', `Hari ini · ${HARI[kini.hariKe - 1]}`));

    const rutin = asrama ? asrama.routine.filter((j) => j.dayOfWeek === kini.hariKe) : [];
    if (!asrama) {
      utama.append(el('p', 'snt-today__empty', 'Jadwal asrama belum tersedia. Musyrif mengisinya lewat Kelola Asrama.'));
    } else if (!rutin.length) {
      utama.append(el('p', 'snt-today__empty', 'Tidak ada kegiatan rutin hari ini. Manfaatkan untuk murajaah dan istirahat.'));
    } else {
      // Sorot kegiatan yang sedang berlangsung, atau yang berikutnya.
      const urut = rutin.slice().sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
      const sedang = urut.find((j) => menitDari(j.startTime) !== null && menitDari(j.startTime) <= kini.menit && kini.menit < (menitDari(j.endTime) ?? menitDari(j.startTime) + 60));
      const berikut = sedang ? null : urut.find((j) => menitDari(j.startTime) !== null && menitDari(j.startTime) > kini.menit);
      const daftar = el('ol', 'snt-agenda');
      urut.forEach((j) => {
        const mulai = menitDari(j.startTime);
        const lewat = mulai !== null && (menitDari(j.endTime) ?? mulai + 60) <= kini.menit;
        const li = el('li', `snt-agenda__item${j === sedang ? ' is-now' : ''}${j === berikut ? ' is-next' : ''}${lewat ? ' is-past' : ''}`);
        li.append(el('span', 'snt-agenda__time', j.startTime ? `${j.startTime}${j.endTime ? `–${j.endTime}` : ''}` : 'Sepanjang hari'));
        const teks = el('span', 'snt-agenda__text');
        teks.append(el('strong', '', j.title));
        if (j.location) teks.append(el('span', '', j.location));
        li.append(teks);
        if (j === sedang) li.append(el('span', 'snt-agenda__flag', 'Sedang berlangsung'));
        if (j === berikut) li.append(el('span', 'snt-agenda__flag', 'Berikutnya'));
        daftar.append(li);
      });
      utama.append(daftar);
    }

    const samping = el('div', 'snt-today__side');
    const piket = asrama ? asrama.duties.filter((d) => String(d.studentId) === String(student.id) && d.dayOfWeek === kini.hariKe) : [];
    const kotakPiket = el('div', `snt-tile${piket.length ? ' is-duty' : ''}`);
    kotakPiket.append(el('span', 'snt-tile__label', 'Piket hari ini'), el('strong', 'snt-tile__value', piket.length ? piket.map((p) => p.duty).join(', ') : 'Tidak ada'));
    if (!piket.length && asrama) {
      const besok = asrama.duties.filter((d) => String(d.studentId) === String(student.id)).map((d) => d.dayOfWeek).sort((a, b) => ((a - kini.hariKe + 7) % 7) - ((b - kini.hariKe + 7) % 7))[0];
      if (besok) kotakPiket.append(el('span', 'snt-tile__note', `Giliranmu berikutnya hari ${HARI[besok - 1]}`));
    }
    samping.append(kotakPiket);

    const acara = asrama ? asrama.events.filter((e) => e.date >= kini.tanggal).sort((a, b) => a.date.localeCompare(b.date))[0] : null;
    const kotakAcara = el('div', 'snt-tile snt-tile--event');
    kotakAcara.append(el('span', 'snt-tile__label', 'Acara terdekat'));
    if (acara) {
      const n = selisihHari(kini.tanggal, acara.date);
      kotakAcara.append(
        el('strong', 'snt-tile__count', teksHitungMundur(n)),
        el('span', 'snt-tile__value snt-tile__value--sm', acara.title),
        el('span', 'snt-tile__note', [TANGGAL_ACARA.format(new Date(`${acara.date}T00:00:00Z`)), acara.startTime, acara.location].filter(Boolean).join(' · '))
      );
    } else {
      kotakAcara.append(el('strong', 'snt-tile__value', 'Belum ada'), el('span', 'snt-tile__note', 'Acara asrama tampil di sini begitu dijadwalkan musyrif.'));
    }
    samping.append(kotakAcara);

    const bantuan = window.HamasahPerjalanan && window.HamasahPerjalanan.daftarTugas;
    const { berikutnya = [] } = bantuan && data.courses ? bantuan(data.courses) : {};
    const lanjut = berikutnya[0];
    if (lanjut) {
      const a = el('a', 'snt-tile snt-tile--learn');
      a.href = `lms#${new URLSearchParams({ maddah: lanjut.course.id, materi: lanjut.material.id })}`;
      a.append(el('span', 'snt-tile__label', 'Lanjutkan belajar'), el('strong', 'snt-tile__value snt-tile__value--sm', lanjut.material.title), el('span', 'snt-tile__note', `${lanjut.course.title} →`));
      samping.append(a);
    }

    const pintas = el('nav', 'snt-quick');
    pintas.setAttribute('aria-label', 'Pintasan santri');
    const izin = el('button', 'snt-quick__btn is-primary', 'Ajukan izin');
    izin.type = 'button';
    izin.addEventListener('click', onIzin);
    const belajar = el('a', 'snt-quick__btn', 'Ruang belajar');
    belajar.href = 'lms';
    const lengkap = el('button', 'snt-quick__btn', 'Rekam jejak lengkap');
    lengkap.type = 'button';
    lengkap.addEventListener('click', onOpenFull);
    pintas.append(izin, belajar, lengkap);

    wadah.append(utama, samping, pintas);
    return wadah;
  }

  // ------------------------------------------------------------ Laporanku
  function nilaiDiri(a) {
    const adaData = a.sholatDicatat || a.hadirTotal || a.setoran || a.catatan;
    if (!adaData) return { nada: 'netral', label: 'Belum banyak yang dicatat musyrif bulan ini.' };
    const perlu = [];
    if (a.sholat !== null && a.sholat < 60) perlu.push('sholat berjamaah');
    if (a.hadir !== null && a.hadir < 70) perlu.push('kehadiran kegiatan');
    if (a.ulang >= 2) perlu.push('setoran yang perlu diulang');
    if (perlu.length) return { nada: 'perlu', label: `Yuk perbaiki ${perlu.join(', ')}. Kamu pasti bisa.` };
    const bagus = (a.sholat === null || a.sholat >= 80) && (a.hadir === null || a.hadir >= 85);
    return bagus
      ? { nada: 'baik', label: 'Masya Allah, bulan ini kamu konsisten. Pertahankan.' }
      : { nada: 'cukup', label: 'Sudah cukup baik, masih bisa ditingkatkan lagi.' };
  }

  function bagianLaporan(data) {
    const a = W.hitung(data);
    const lalu = data.lalu ? W.hitung(data.lalu) : null;
    const status = nilaiDiri(a);
    const wadah = el('section', 'wali-summary snt-report');
    const kepala = el('header', 'snt-report__head');
    kepala.append(el('p', 'wali-eyebrow', `Laporanku · ${K.PERIODE_HARI} hari terakhir`), el('p', `wali-report__status is-${status.nada}`, status.label));
    const angka = el('div', 'wali-stats');
    angka.append(
      W.kotakAngka('sholat berjamaah', a.sholat === null ? '–' : `${a.sholat}%`, a.sholatDicatat ? `${a.sholatBerjamaah} dari ${a.sholatDicatat} waktu` : 'belum dicatat', lalu ? W.tren(W.selisih(a.sholat, lalu.sholat)) : null, W.nadaPersen(a.sholat, 80, 60)),
      W.kotakAngka('hadir kegiatan', a.hadir === null ? '–' : `${a.hadir}%`, a.hadirTotal ? `${a.hadirMasuk} dari ${a.hadirTotal} kegiatan` : 'belum dicatat', lalu ? W.tren(W.selisih(a.hadir, lalu.hadir)) : null, W.nadaPersen(a.hadir, 85, 70)),
      W.kotakAngka('setoran hafalan', `${a.setoran}×`, a.setoran ? `${a.lancar} lancar` : 'belum ada', lalu ? W.tren(a.setoran - lalu.setoran, '×') : null),
      W.kotakAngka('juz dihafal', data.juz ? String(data.juz.hafal) : '–', data.juz && data.juz.sedang ? `${data.juz.sedang} juz sedang dihafal` : 'dari 30 juz', null)
    );
    wadah.append(kepala, angka);
    return wadah;
  }

  // ------------------------------------------------------------ Prestasi
  function bagianPrestasi(data) {
    const prestasi = ((data.dashboard && data.dashboard.achievements) || []).slice().sort((x, y) => String(y.occurredAt).localeCompare(String(x.occurredAt)));
    const { wadah } = W.kartu('Prestasi', prestasi.length ? `${prestasi.length} apresiasi dari musyrif dalam ${K.PERIODE_HARI} hari terakhir.` : null, 'snt-badges-wrap');
    if (!prestasi.length) {
      wadah.append(W.kosong('Belum ada prestasi tercatat bulan ini. Terus semangat, setiap usaha dicatat.'));
      return wadah;
    }
    const daftar = el('ul', 'snt-badges');
    prestasi.slice(0, 6).forEach((p) => {
      const li = el('li', 'snt-badge');
      const ikon = el('span', 'snt-badge__icon', '★');
      ikon.setAttribute('aria-hidden', 'true');
      const teks = el('span', 'snt-badge__text');
      teks.append(el('strong', '', p.title), el('span', '', [p.description, K.tanggal(p.occurredAt)].filter(Boolean).join(' · ')));
      li.append(ikon, teks);
      daftar.append(li);
    });
    wadah.append(daftar);
    return wadah;
  }

  // ------------------------------------------------------------ Acara mendatang
  function bagianAcara(asrama, kini) {
    const acara = asrama ? asrama.events.filter((e) => e.date >= kini.tanggal).sort((a, b) => a.date.localeCompare(b.date)) : [];
    const { wadah } = W.kartu('Acara dan event', 'Agenda asrama 45 hari ke depan.', 'snt-events-wrap');
    if (!acara.length) {
      wadah.append(W.kosong('Belum ada acara terjadwal.'));
      return wadah;
    }
    const daftar = el('ol', 'snt-events');
    acara.slice(0, 5).forEach((e) => {
      const n = selisihHari(kini.tanggal, e.date);
      const tgl = new Date(`${e.date}T00:00:00Z`);
      const li = el('li', `snt-event${n <= 7 ? ' is-soon' : ''}`);
      const kal = el('span', 'snt-event__date');
      kal.append(el('strong', '', String(tgl.getUTCDate())), el('span', '', TANGGAL_PENDEK.format(tgl).split(' ').slice(1).join(' ')));
      const teks = el('span', 'snt-event__text');
      teks.append(el('strong', '', e.title), el('span', '', [e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : null, e.location].filter(Boolean).join(' · ') || 'Waktu menyusul'));
      li.append(kal, teks, el('span', 'snt-event__count', teksHitungMundur(n)));
      daftar.append(li);
    });
    wadah.append(daftar);
    return wadah;
  }

  // ------------------------------------------------------------ Galeri
  function bagianGaleri(asrama, headers) {
    const G = window.HamasahGaleri;
    const foto = (asrama && asrama.gallery) || [];
    if (!G || !foto.length) return null;
    const { wadah } = W.kartu('Galeri asrama', `Momen kegiatan ${asrama.name || 'asrama'}. Ketuk foto untuk melihat besar.`, 'snt-gallery');
    // Foto pertama besar (2x2) dan empat ubin kecil mengisi dua baris; bila lebih, ubin
    // kelima menjadi tombol "+n foto".
    wadah.append(G.grid(foto, { headers, batas: foto.length > 5 ? 4 : 5 }));
    return wadah;
  }

  // ------------------------------------------------------------ Rangka
  async function render(wadah, { student, headers, onOpenFull }) {
    wadah.classList.add('wali-page', 'snt-page');
    const memuat = el('p', 'wali-loading', 'Menyiapkan berandamu...');
    memuat.setAttribute('role', 'status');
    wadah.replaceChildren(memuat);

    const [data, jadwal, pengumuman] = await Promise.all([
      K.muatAnak(student.id, headers, { kelas: true, banding: true }),
      K.muatJadwalAsrama(headers),
      K.ambil('/api/announcements', headers)
    ]);
    const asrama = jadwal && jadwal.tersedia && Array.isArray(jadwal.dormitories)
      ? jadwal.dormitories.find((d) => d.students.some((s) => String(s.id) === String(student.id))) || null
      : null;
    const kini = sekarangKairo();

    // Kartu izin dari perjalanan-santri.js; tombol "Ajukan izin" menggulir ke sana.
    let kartuIzinEl = null;
    const kartuIzin = window.HamasahPerjalanan && window.HamasahPerjalanan.kartuIzin;
    if (kartuIzin && data.izinMentah) {
      const muatUlang = async (pesan = '') => {
        const segar = await K.ambil(`/api/students/${encodeURIComponent(student.id)}/leave?t=${Date.now()}`, headers);
        const baru = kartuIzin(segar, { studentId: student.id, headers, santri: true, muatUlang, pesan });
        if (kartuIzinEl && baru) { kartuIzinEl.replaceWith(baru); kartuIzinEl = baru; }
      };
      kartuIzinEl = kartuIzin(data.izinMentah, { studentId: student.id, headers, santri: true, muatUlang });
    }
    const keIzin = () => {
      if (!kartuIzinEl) { onOpenFull(); return; }
      // Formulir izin terlipat di balik tombol "Ajukan izin" di kartunya; buka sekalian.
      const buka = kartuIzinEl.querySelector('.santri-leave-open');
      if (buka && buka.getAttribute('aria-expanded') !== 'true') buka.click();
      kartuIzinEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const isian = kartuIzinEl.querySelector('form:not([hidden]) select, form:not([hidden]) input, form:not([hidden]) textarea');
      if (isian) setTimeout(() => isian.focus({ preventScroll: true }), 450);
    };

    const grafik = el('div', 'wali-grid');
    [
      W.kartuSholat(data),
      W.kartuKehadiran(data),
      W.kartuHafalan(data),
      W.kartuCatatan(data, { judul: 'Catatan musyrif', keterangan: 'Yang ditulis musyrif dan pembina tentang kamu.' })
    ].forEach((k) => grafik.append(k));

    const belajar = K.kartuKelas ? K.kartuKelas(data.courses, student) : null;
    if (belajar) belajar.classList.add('snt-class');

    const baris1 = el('div', 'wali-grid');
    [bagianAcara(asrama, kini), bagianPrestasi(data)].forEach((k) => baris1.append(k));

    const galeri = bagianGaleri(asrama, headers);
    const umum = K.kartuPengumuman(pengumuman, 3, { polos: true });
    const baris2 = el('div', 'wali-grid');
    [umum, kartuIzinEl].filter(Boolean).forEach((k) => baris2.append(k));

    wadah.replaceChildren(...[
      bagianHariIni({ student, asrama, data, kini, onIzin: keIzin, onOpenFull }),
      bagianLaporan(data),
      grafik,
      belajar,
      K.bagianJadwalAsrama(jadwal, student.id, { polos: true, santri: true }),
      baris1,
      galeri,
      baris2.childElementCount ? baris2 : null,
      K.kartuLinimasa(K.butirKegiatan(data, student.name), {
        judul: 'Catatan harian',
        keterangan: `Semua yang tercatat ${K.PERIODE_HARI} hari terakhir, terbaru di atas.`,
        perHalaman: 8,
        polos: true
      })
    ].filter(Boolean));
  }

  window.HamasahBerandaSantri = Object.freeze({ render });
})();
