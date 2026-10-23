// Kalender asrama (17 Oktober 2026): satu komponen untuk Kelola Asrama (musyrif, admin)
// dan beranda santri serta wali.
//   - Pekan: kisi jam tujuh hari; kegiatan rutin dan acara tampil sebagai blok sesuai jamnya,
//     garis "sekarang" di kolom hari ini. Di layar sempit menjadi pemilih hari + daftar.
//   - Bulan: kisi enam pekan; tiap hari menampilkan beberapa kegiatan dan "+n lagi".
//   - Panel hari: semua kegiatan, acara, dan piket pada hari yang dipilih.
// Data masuk sebagai larik biasa; komponen tidak memanggil API. Posisi blok memakai CSSOM
// (style.top/height), bukan atribut style, supaya lolos CSP.
(function initKalenderAsrama() {
  const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Ahad'];
  const HARI_PENDEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Ahd'];
  const BULAN = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const BULAN_PENDEK = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });
  const TANGGAL_PANJANG = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const TINGGI_JAM = 52;
  const SEMPIT = '(max-width: 720px)';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tombol(teks, kelas, label) {
    const b = el('button', kelas, teks);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
  }

  // Tanggal sebagai teks YYYY-MM-DD, dihitung di UTC supaya tidak bergeser zona waktu.
  function keTanggal(iso) { return new Date(`${iso}T00:00:00Z`); }
  function keIso(d) { return d.toISOString().slice(0, 10); }
  function geser(iso, hari) { const d = keTanggal(iso); d.setUTCDate(d.getUTCDate() + hari); return keIso(d); }
  function hariKe(iso) { return ((keTanggal(iso).getUTCDay() + 6) % 7) + 1; }
  function awalPekan(iso) { return geser(iso, 1 - hariKe(iso)); }
  function menit(jam) {
    if (!jam) return null;
    const [h, m] = String(jam).split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function rentang(item) {
    if (!item.startTime) return 'Sepanjang hari';
    return item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime;
  }

  function sekarangKairo() {
    const bagian = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    return menit(bagian);
  }

  // opsi: { rutin, acara, piket, today, tampilan, onPilih(item, tanggal), aksiItem(item, tanggal),
  //         onTambah({ tanggal, hari, jam }), labelTambah }
  function buat(opsi) {
    const rutin = (opsi.rutin || []).map((r) => ({ ...r, jenis: 'rutin' }));
    const acara = (opsi.acara || []).map((a) => ({ ...a, jenis: 'acara' }));
    const piket = opsi.piket || [];
    const today = opsi.today || keIso(new Date());
    let tampilan = opsi.tampilan || 'pekan';
    let jangkar = today;
    let dipilih = today;

    function itemTanggal(iso) {
      const dow = hariKe(iso);
      return [
        ...rutin.filter((r) => r.dayOfWeek === dow),
        ...acara.filter((a) => a.date === iso)
      ].sort((a, b) => (menit(a.startTime) ?? -1) - (menit(b.startTime) ?? -1) || a.title.localeCompare(b.title));
    }

    function piketTanggal(iso) {
      const dow = hariKe(iso);
      return piket.filter((p) => p.dayOfWeek === dow);
    }

    const wadah = el('div', 'kal');
    const alat = el('div', 'kal__toolbar');
    const nav = el('div', 'kal__nav');
    const mundur = tombol('‹', 'kal__btn kal__btn--icon', 'Sebelumnya');
    const maju = tombol('›', 'kal__btn kal__btn--icon', 'Berikutnya');
    const hariIni = tombol('Hari ini', 'kal__btn');
    const judul = el('h4', 'kal__title');
    judul.setAttribute('aria-live', 'polite');
    nav.append(mundur, hariIni, maju, judul);
    const pilihTampilan = el('div', 'kal__views');
    pilihTampilan.setAttribute('role', 'group');
    pilihTampilan.setAttribute('aria-label', 'Tampilan kalender');
    const btnPekan = tombol('Pekan', 'kal__view');
    const btnBulan = tombol('Bulan', 'kal__view');
    const btnAgenda = tombol('Agenda', 'kal__view');
    pilihTampilan.append(btnBulan, btnPekan, btnAgenda);
    alat.append(nav, pilihTampilan);
    const papan = el('div', 'kal__board');
    const panel = el('div', 'kal__day');
    const legenda = el('div', 'kal__legend');
    legenda.setAttribute('aria-label', 'Jenis kegiatan');
    [['rutin','Kegiatan rutin'],['acara','Acara khusus'],['piket','Piket']].forEach(([kind,label]) => { const item = el('span',''); item.append(el('i', `kal__dot is-${kind}`),document.createTextNode(label)); legenda.append(item); });
    wadah.append(alat, legenda, papan, panel);

    function navigasi(arah) {
      jangkar = tampilan === 'bulan' ? geserBulan(jangkar, arah) : geser(jangkar, arah * 7);
      dipilih = jangkar;
      lukis();
    }
    mundur.addEventListener('click', () => navigasi(-1));
    maju.addEventListener('click', () => navigasi(1));
    hariIni.addEventListener('click', () => { jangkar = today; dipilih = today; lukis(); });
    btnPekan.addEventListener('click', () => { tampilan = 'pekan'; jangkar = dipilih; lukis(); });
    btnBulan.addEventListener('click', () => { tampilan = 'bulan'; jangkar = dipilih; lukis(); });
    btnAgenda.addEventListener('click', () => { tampilan = 'agenda'; jangkar = dipilih; lukis(); });

    function geserBulan(iso, n) {
      const d = keTanggal(iso);
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + n);
      return keIso(d);
    }

    function sempit() {
      return Boolean(window.matchMedia && window.matchMedia(SEMPIT).matches);
    }

    function pilihHari(iso, { gulir = false } = {}) {
      dipilih = iso;
      lukis();
      if (gulir) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ---------------------------------------------------------------- Pekan
    function lukisPekan() {
      const awal = awalPekan(jangkar);
      const hari = Array.from({ length: 7 }, (_, i) => geser(awal, i));
      const a = keTanggal(hari[0]);
      const b = keTanggal(hari[6]);
      judul.textContent = a.getUTCMonth() === b.getUTCMonth()
        ? `${a.getUTCDate()}–${b.getUTCDate()} ${BULAN.format(b)}`
        : `${a.getUTCDate()} ${BULAN_PENDEK.format(a)} – ${b.getUTCDate()} ${BULAN.format(b)}`;

      if (sempit()) {
        // Layar sempit: deretan tujuh hari, lalu daftar hari terpilih di panel.
        if (!hari.includes(dipilih)) dipilih = hari.includes(today) ? today : hari[0];
        const strip = el('div', 'kal__strip');
        hari.forEach((iso, i) => {
          const isi = itemTanggal(iso);
          const b2 = tombol('', `kal__strip-day ${iso === today ? 'is-today' : ''} ${iso === dipilih ? 'is-selected' : ''}`.trim(), `${HARI[i]} ${keTanggal(iso).getUTCDate()}, ${isi.length} kegiatan`);
          b2.append(el('span', 'kal__strip-name', HARI_PENDEK[i]), el('strong', 'kal__strip-num', String(keTanggal(iso).getUTCDate())));
          const titik = el('span', 'kal__dots');
          isi.slice(0, 3).forEach((it) => titik.append(el('i', `kal__dot is-${it.jenis}`)));
          b2.append(titik);
          b2.addEventListener('click', () => pilihHari(iso));
          strip.append(b2);
        });
        papan.replaceChildren(strip);
        return;
      }

      const semua = hari.flatMap(itemTanggal);
      const berjam = semua.filter((it) => it.startTime);
      const mulaiJam = berjam.length ? Math.max(0, Math.min(...berjam.map((it) => Math.floor(menit(it.startTime) / 60))) - 1) : 7;
      const akhirJam = berjam.length ? Math.min(24, Math.max(...berjam.map((it) => Math.ceil((menit(it.endTime) ?? menit(it.startTime) + 60) / 60))) + 1) : 18;

      const kisi = el('div', 'kal__week');
      // Kepala kolom.
      const kepala = el('div', 'kal__week-head');
      kepala.append(el('div', 'kal__gutter'));
      hari.forEach((iso, i) => {
        const k = tombol('', `kal__col-head ${iso === today ? 'is-today' : ''} ${iso === dipilih ? 'is-selected' : ''}`.trim(), `${HARI[i]}, ${TANGGAL_PANJANG.format(keTanggal(iso))}`);
        k.append(el('span', 'kal__col-name', HARI_PENDEK[i]), el('strong', 'kal__col-num', String(keTanggal(iso).getUTCDate())));
        k.addEventListener('click', () => pilihHari(iso, { gulir: true }));
        kepala.append(k);
      });
      // Baris "sepanjang hari": acara tanpa jam dan piket.
      const seharian = el('div', 'kal__allday');
      seharian.append(el('div', 'kal__gutter kal__gutter--label', 'Seharian'));
      hari.forEach((iso) => {
        const sel = el('div', `kal__allday-cell ${iso === today ? 'is-today' : ''}`.trim());
        itemTanggal(iso).filter((it) => !it.startTime).forEach((it) => sel.append(blok(it, iso, true)));
        piketTanggal(iso).forEach((p) => sel.append(el('span', 'kal__chip is-piket', p.label)));
        seharian.append(sel);
      });
      // Kisi jam.
      const badan = el('div', 'kal__grid');
      const jamKolom = el('div', 'kal__hours');
      for (let h = mulaiJam; h < akhirJam; h += 1) jamKolom.append(el('span', 'kal__hour', `${String(h).padStart(2, '0')}:00`));
      badan.append(jamKolom);
      hari.forEach((iso, i) => {
        const kolom = el('div', `kal__col ${iso === today ? 'is-today' : ''}`.trim());
        kolom.style.height = `${(akhirJam - mulaiJam) * TINGGI_JAM}px`;
        if (opsi.onTambah) {
          kolom.addEventListener('click', (event) => {
            if (event.target !== kolom) return;
            const kotak = kolom.getBoundingClientRect();
            const jam = Math.min(23, mulaiJam + Math.floor((event.clientY - kotak.top) / TINGGI_JAM));
            opsi.onTambah({ tanggal: iso, hari: i + 1, jam: `${String(jam).padStart(2, '0')}:00` });
          });
          kolom.title = 'Klik ruang kosong untuk menambah kegiatan';
        }
        // Blok berjam, ditata berdampingan bila bertabrakan.
        const isi = itemTanggal(iso).filter((it) => it.startTime);
        const jalur = [];
        isi.forEach((it) => {
          const s = menit(it.startTime);
          const e = menit(it.endTime) ?? s + 60;
          let j = jalur.findIndex((akhir) => akhir <= s);
          if (j === -1) { j = jalur.length; jalur.push(e); } else jalur[j] = e;
          it.__jalur = j;
          it.__s = s;
          it.__e = e;
        });
        const lebar = Math.max(1, jalur.length);
        isi.forEach((it) => {
          const b2 = blok(it, iso, false);
          // Blok di bawah satu jam: jam dan judul dalam satu baris supaya judul tidak terpotong.
          if (it.__e - it.__s < 70) {
            b2.classList.add('is-short');
            const waktu = b2.querySelector('.kal__event-time');
            if (waktu) waktu.textContent = it.startTime;
          }
          b2.style.top = `${((it.__s - mulaiJam * 60) / 60) * TINGGI_JAM}px`;
          b2.style.height = `${Math.max(26, ((it.__e - it.__s) / 60) * TINGGI_JAM - 3)}px`;
          b2.style.left = `${(it.__jalur / lebar) * 100}%`;
          b2.style.width = `calc(${100 / lebar}% - 4px)`;
          kolom.append(b2);
        });
        if (iso === today) {
          const kini = sekarangKairo();
          if (kini !== null && kini >= mulaiJam * 60 && kini <= akhirJam * 60) {
            const garis = el('div', 'kal__now');
            garis.style.top = `${((kini - mulaiJam * 60) / 60) * TINGGI_JAM}px`;
            kolom.append(garis);
          }
        }
        badan.append(kolom);
      });
      kisi.append(kepala, seharian, badan);
      papan.replaceChildren(kisi);
      // Gulir kisi ke sekitar kegiatan pertama.
      requestAnimationFrame(() => {
        const pertama = berjam.length ? Math.min(...berjam.map((it) => menit(it.startTime))) : mulaiJam * 60;
        badan.scrollTop = Math.max(0, ((pertama - mulaiJam * 60) / 60) * TINGGI_JAM - 12);
      });
    }

    function blok(it, iso, kecil) {
      const b2 = tombol('', `kal__event is-${it.jenis} ${kecil ? 'is-compact' : ''}`.trim(), `${it.title}, ${rentang(it)}${it.location ? `, ${it.location}` : ''}`);
      if (!kecil) b2.append(el('span', 'kal__event-time', rentang(it)));
      b2.append(el('span', 'kal__event-title', it.title));
      if (!kecil && it.location) b2.append(el('span', 'kal__event-meta', it.location));
      b2.addEventListener('click', (event) => {
        event.stopPropagation();
        dipilih = iso;
        lukis();
        if (opsi.onPilih) opsi.onPilih(it, iso);
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return b2;
    }

    // ---------------------------------------------------------------- Bulan
    function lukisBulan() {
      const awalBulan = keTanggal(jangkar);
      awalBulan.setUTCDate(1);
      judul.textContent = BULAN.format(awalBulan);
      const mulai = awalPekan(keIso(awalBulan));
      const kisi = el('div', 'kal__month');
      HARI_PENDEK.forEach((h) => kisi.append(el('span', 'kal__month-name', h)));
      const akhirBulan = new Date(awalBulan.getTime()); akhirBulan.setUTCMonth(akhirBulan.getUTCMonth()+1); akhirBulan.setUTCDate(0);
      const jumlahSel = Math.ceil((hariKe(keIso(awalBulan)) - 1 + akhirBulan.getUTCDate()) / 7) * 7;
      for (let i = 0; i < jumlahSel; i += 1) {
        const iso = geser(mulai, i);
        const d = keTanggal(iso);
        const luar = d.getUTCMonth() !== awalBulan.getUTCMonth();
        const isi = itemTanggal(iso);
        const sel = tombol('', `kal__cell ${luar ? 'is-outside' : ''} ${iso === today ? 'is-today' : ''} ${iso === dipilih ? 'is-selected' : ''}`.trim(), `${TANGGAL_PANJANG.format(d)}, ${isi.length} kegiatan`);
        sel.setAttribute('aria-pressed', String(iso === dipilih));
        if (iso === today) sel.setAttribute('aria-current','date');
        sel.append(el('span', 'kal__cell-num', String(d.getUTCDate())));
        const daftar = el('span', 'kal__cell-list');
        // Bulan: acara ditonjolkan, kegiatan rutin cukup diringkas jumlahnya supaya kisi
        // tidak penuh oleh jadwal yang sama setiap hari. Rinciannya di panel hari.
        const acaraHari = isi.filter((x) => x.jenis === 'acara');
        const rutinHari = isi.filter((x) => x.jenis === 'rutin');
        acaraHari.slice(0, 2).forEach((it) => {
          const baris = el('span', 'kal__cell-item is-acara');
          baris.append(el('i', 'kal__dot'), document.createTextNode(`${it.startTime ? `${it.startTime} ` : ''}${it.title}`));
          daftar.append(baris);
        });
        if (acaraHari.length > 2) daftar.append(el('span', 'kal__cell-more', `+${acaraHari.length - 2} acara`));
        if (rutinHari.length) {
          const baris = el('span', 'kal__cell-item is-rutin');
          baris.append(el('i', 'kal__dot'), document.createTextNode(`${rutinHari.length} kegiatan rutin`));
          daftar.append(baris);
        }
        if (piketTanggal(iso).length) daftar.append(el('span', 'kal__cell-item is-piket', `Piket: ${piketTanggal(iso).map((p) => p.label).join(', ')}`));
        sel.append(daftar);
        sel.addEventListener('click', () => pilihHari(iso, { gulir: true }));
        kisi.append(sel);
      }
      papan.replaceChildren(kisi);
    }

    // ---------------------------------------------------------------- Panel hari
    function lukisPanel() {
      const d = keTanggal(dipilih);
      const isi = itemTanggal(dipilih);
      const tugas = piketTanggal(dipilih);
      const kepala = el('div', 'kal__day-head');
      const teks = el('div');
      teks.append(
        el('span', 'kal__day-eyebrow', dipilih === today ? 'Hari ini' : (dipilih < today ? 'Sudah lewat' : 'Akan datang')),
        el('h5', 'kal__day-title', TANGGAL_PANJANG.format(d))
      );
      kepala.append(teks);
      if (opsi.onTambah) {
        const tambah = tombol(opsi.labelTambah || '+ Tambah kegiatan', 'kal__btn kal__btn--add', `Tambah kegiatan pada ${TANGGAL_PANJANG.format(d)}`);
        tambah.addEventListener('click', () => opsi.onTambah({ tanggal: dipilih, hari: hariKe(dipilih), jam: '' }));
        kepala.append(tambah);
      }
      const daftar = el('ol', 'kal__agenda');
      if (!isi.length && !tugas.length) daftar.append(el('li', 'kal__empty', 'Tidak ada kegiatan di hari ini.'));
      isi.forEach((it) => {
        const li = el('li', `kal__agenda-item is-${it.jenis}`);
        const waktu = el('span', 'kal__agenda-time', rentang(it));
        const badan = el('div', 'kal__agenda-body');
        const atas = el('div', 'kal__agenda-top');
        atas.append(el('strong', '', it.title), el('span', `kal__tag is-${it.jenis}`, it.jenis === 'acara' ? 'Acara' : 'Rutin'));
        badan.append(atas);
        if (it.location) badan.append(el('span', 'kal__agenda-meta', it.location));
        if (it.note) badan.append(el('p', 'kal__agenda-note', it.note));
        li.append(waktu, badan);
        if (opsi.aksiItem) {
          const aksi = opsi.aksiItem(it, dipilih);
          if (aksi) li.append(aksi);
        }
        daftar.append(li);
      });
      tugas.forEach((p) => {
        const li = el('li', 'kal__agenda-item is-piket');
        const badan = el('div', 'kal__agenda-body');
        const atas = el('div', 'kal__agenda-top');
        atas.append(el('strong', '', p.label), el('span', 'kal__tag is-piket', 'Piket'));
        badan.append(atas);
        if (p.note) badan.append(el('span', 'kal__agenda-meta', p.note));
        li.append(el('span', 'kal__agenda-time', 'Seharian'), badan);
        daftar.append(li);
      });
      panel.replaceChildren(kepala, daftar);
    }

    function lukis() {
      btnPekan.classList.toggle('is-active', tampilan === 'pekan');
      btnBulan.classList.toggle('is-active', tampilan === 'bulan');
      btnPekan.setAttribute('aria-pressed', String(tampilan === 'pekan'));
      btnBulan.setAttribute('aria-pressed', String(tampilan === 'bulan'));
      btnAgenda.classList.toggle('is-active', tampilan === 'agenda');
      btnAgenda.setAttribute('aria-pressed', String(tampilan === 'agenda'));
      wadah.classList.toggle('is-month', tampilan === 'bulan');
      if (tampilan === 'pekan') lukisPekan(); else if (tampilan === 'agenda') lukisAgenda(); else lukisBulan();
      lukisPanel();
    }

    function lukisAgenda() {
      const awal = awalPekan(jangkar), akhir = geser(awal,6);
      judul.textContent = `${keTanggal(awal).getUTCDate()} ${BULAN_PENDEK.format(keTanggal(awal))} – ${keTanggal(akhir).getUTCDate()} ${BULAN.format(keTanggal(akhir))}`;
      const list = el('div','kal__agenda-week');
      for(let i=0;i<7;i++) {
        const iso=geser(awal,i), items=itemTanggal(iso), duties=piketTanggal(iso);
        const button=tombol('',`kal__agenda-date ${iso===dipilih?'is-selected':''}`,`Lihat ${TANGGAL_PANJANG.format(keTanggal(iso))}`);
        button.setAttribute('aria-pressed',String(iso===dipilih));
        button.append(el('strong','',`${HARI_PENDEK[i]}, ${keTanggal(iso).getUTCDate()}`),el('span','',items.length?items.map(item=>`${rentang(item)} ${item.title}`).join(' · '):'Tidak ada kegiatan terjadwal'),el('span','kal__agenda-count',`${items.length} kegiatan${duties.length?` · ${duties.length} piket`:''}`));
        button.addEventListener('click',()=>pilihHari(iso,{gulir:true}));list.append(button);
      }
      papan.replaceChildren(list);
    }

    // Lebar layar berubah (putar ponsel, ubah jendela): gambar ulang tampilan pekan.
    if (window.matchMedia) {
      const mq = window.matchMedia(SEMPIT);
      const ubah = () => { if (tampilan === 'pekan' && wadah.isConnected) lukis(); };
      if (mq.addEventListener) mq.addEventListener('change', ubah);
    }

    lukis();
    return {
      el: wadah,
      pilih(iso) { dipilih = iso; jangkar = iso; lukis(); }
    };
  }

  window.HamasahKalender = Object.freeze({ buat, HARI });
})();
