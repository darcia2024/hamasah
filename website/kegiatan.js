// Kegiatan dan Rapor (admin dan musyrif): absensi kegiatan, buku setoran tahfidz, rapor bulanan, dan pengaturan.
// API: /api/kegiatan/*, /api/students/:id/setoran, /api/rapor/*, /api/students/:id/rapor.
// Semua teks dipasang lewat textContent; tanpa gaya sebaris (CSP).
(function initKegiatan() {
  const guard = document.querySelector('#kegiatan-guard');
  const guardCopy = document.querySelector('#kegiatan-guard-copy');
  const konsol = document.querySelector('#kegiatan-console');
  const app = document.querySelector('#kegiatan-app');
  const staffNav = document.querySelector('#staff-nav');
  const HARI = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const TAB = [['absensi', 'Absensi kegiatan'], ['setoran', 'Setoran tahfidz'], ['rapor', 'Rapor bulanan'], ['pengaturan', 'Pengaturan']];
  const STATUS_ABSENSI = [['hadir', 'Hadir'], ['izin', 'Izin'], ['sakit', 'Sakit'], ['alpa', 'Tidak hadir']];
  const state = { akun: null, tab: 'absensi', asrama: [], santri: [], pilihanSantri: '', sesiTerbuka: null };

  function el(tag, kelas, teks) {
    const node = document.createElement(tag);
    if (kelas) node.className = kelas;
    if (teks !== undefined && teks !== null) node.textContent = teks;
    return node;
  }

  function tombol(teks, kelas, aksi) {
    const b = el('button', kelas || 'button button--secondary kg-small', teks);
    b.type = 'button';
    if (aksi) b.addEventListener('click', aksi);
    return b;
  }

  function session() {
    try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; }
  }

  function headers() {
    const s = session();
    return s ? { Authorization: `Bearer ${s.accessToken}` } : {};
  }

  async function api(method, url, body) {
    const respons = await fetch(url, { method, headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const hasil = await respons.json().catch(() => ({}));
    if (!respons.ok) throw new Error(hasil.error || 'Permintaan belum berhasil.');
    return hasil;
  }

  const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const bulanIni = () => hariIni().slice(0, 7);
  const tanggal = (teks) => (teks ? HARI.format(new Date(`${teks}T00:00:00Z`)) : '-');
  const admin = () => state.akun && state.akun.role === 'admin';

  function pesanStatus() {
    const p = el('p', 'form-status');
    p.setAttribute('role', 'status');
    p.setAttribute('aria-live', 'polite');
    p.set = (teks, galat) => { p.textContent = teks || ''; p.classList.toggle('is-error', Boolean(galat)); };
    return p;
  }

  function bagian(judul, ket) {
    const w = el('section', 'wali-section kg-section');
    const k = el('header', 'wali-section__head');
    k.append(el('h3', 'wali-section__title', judul));
    if (ket) k.append(el('p', 'wali-section__note', ket));
    w.append(k);
    return w;
  }

  function kolom(label, kontrol, petunjuk) {
    const b = el('div', 'wali-form__row');
    const l = el('label', 'wali-field__label', label);
    kontrol.id = `kg-${Math.random().toString(36).slice(2, 8)}`;
    l.htmlFor = kontrol.id;
    b.append(l, kontrol);
    if (petunjuk) b.append(el('p', 'wali-field__hint', petunjuk));
    return b;
  }

  function pilihan(opsi, nilai) {
    const s = el('select', 'wali-field');
    opsi.forEach(([v, t]) => s.append(new Option(t, v)));
    if (nilai !== undefined) s.value = nilai;
    return s;
  }

  function isian(tipe, nilai, atribut = {}) {
    const i = el('input', 'wali-field');
    i.type = tipe;
    if (nilai !== undefined) i.value = nilai;
    Object.entries(atribut).forEach(([k, v]) => i.setAttribute(k, v));
    return i;
  }

  function kosong(teks) { return el('p', 'wali-empty', teks); }

  // ------------------------------------------------------------------ tab absensi

  async function tabAbsensi() {
    const akar = el('div', 'kg-stack');
    const aksi = el('div', 'kg-bar');
    const dari = isian('date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const sampai = isian('date', new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    aksi.append(kolom('Dari', dari), kolom('Sampai', sampai), tombol('Kegiatan baru', 'button button--primary kg-small', () => buatSesi().catch(() => {})));
    const status = pesanStatus();
    const daftar = el('div', 'kg-list');
    const rincian = el('div');
    const rekap = bagian('Rekap absensi', 'Persentase = hadir dibagi (hadir + tidak hadir). Izin, sakit, dan yang belum dicatat tidak dihitung; kegiatan yang tidak terlaksana tidak masuk hitungan.');
    akar.append(bagianDengan('Kegiatan', 'Jadwal kegiatan beserta status pelaksanaannya. Ketuk satu kegiatan untuk mengisi absensi.', aksi, status, daftar), rincian, rekap);

    async function muat() {
      status.set('Memuat...');
      try {
        const data = await api('GET', `/api/kegiatan/sesi?from=${encodeURIComponent(dari.value)}&to=${encodeURIComponent(sampai.value)}&t=${Date.now()}`);
        if (data.available === false) { status.set('Database belum diperbarui untuk absensi kegiatan. Terapkan pembaruan database di halaman Pengaturan.', true); daftar.replaceChildren(); return; }
        status.set(data.items.length ? '' : 'Tidak ada kegiatan pada rentang ini.');
        daftar.replaceChildren(...data.items.map((s) => {
          const kartu = el('button', `kg-card${state.sesiTerbuka === s.id ? ' is-active' : ''}`);
          kartu.type = 'button';
          kartu.append(
            el('strong', 'kg-card__title', `${s.typeName}${s.title ? ` · ${s.title}` : ''}`),
            el('span', 'kg-card__meta', `${tanggal(s.date)}${s.startTime ? ` · ${s.startTime}${s.endTime ? `–${s.endTime}` : ''}` : ''}${s.location ? ` · ${s.location}` : ''}`),
            el('span', 'kg-card__meta', `${s.groupLabel}${s.staffName ? ` · Petugas ${s.staffName}` : ''} · ${s.recorded}/${s.participants} dicatat`),
            el('span', `kg-chip is-${s.status}`, s.statusLabel)
          );
          kartu.addEventListener('click', () => { state.sesiTerbuka = s.id; bukaSesi(s.id, rincian, muat).catch(() => {}); muat().catch(() => {}); });
          return kartu;
        }));
      } catch (error) { status.set(error.message, true); }
    }

    async function buatSesi() {
      const jenis = await api('GET', '/api/kegiatan/jenis');
      const aktif = jenis.items.filter((j) => j.active);
      const kelompok = admin() ? [['asrama', 'Satu asrama'], ['semua', 'Semua santri']] : [['asrama', 'Satu asrama']];
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Kegiatan baru',
        keterangan: 'Atur jadwal, lokasi, kelompok peserta, dan petugas. Absensi diisi sesudah kegiatan ditandai terlaksana.',
        bidang: [
          { nama: 'typeId', label: 'Jenis kegiatan', jenis: 'select', pilihan: aktif.map((j) => [j.id, j.name]), nilai: aktif[0] && aktif[0].id, wajib: true },
          { nama: 'title', label: 'Judul (opsional)', nilai: '' },
          { nama: 'date', label: 'Tanggal', jenis: 'date', nilai: hariIni(), wajib: true },
          { nama: 'startTime', label: 'Jam mulai (HH:MM)', nilai: '', petunjuk: 'Contoh 05:30. Boleh dikosongkan.' },
          { nama: 'endTime', label: 'Jam selesai (HH:MM)', nilai: '' },
          { nama: 'location', label: 'Lokasi', nilai: '' },
          { nama: 'groupKind', label: 'Kelompok peserta', jenis: 'select', pilihan: kelompok, nilai: 'asrama' },
          { nama: 'dormitoryId', label: 'Asrama (bila satu asrama)', jenis: 'select', pilihan: state.asrama.map((d) => [d.id, d.name]), nilai: state.asrama[0] && state.asrama[0].id },
          { nama: 'staffAccountId', label: 'Petugas (opsional)', jenis: 'select', pilihan: [['', 'Belum ditentukan'], ...(state.akun ? [[state.akun.id, `${state.akun.name} (saya)`]] : [])], nilai: '' }
        ],
        labelSimpan: 'Buat kegiatan',
        kirim: (nilai) => api('POST', '/api/kegiatan/sesi', { ...nilai, staffAccountId: nilai.staffAccountId || undefined, startTime: nilai.startTime || undefined, endTime: nilai.endTime || undefined, dormitoryId: nilai.groupKind === 'asrama' ? nilai.dormitoryId : undefined })
      });
      if (hasil) { state.sesiTerbuka = hasil.id; await muat(); await bukaSesi(hasil.id, rincian, muat); }
    }

    // Rekap.
    const by = pilihan([['santri', 'Per santri'], ['asrama', 'Per asrama'], ['kegiatan', 'Per kegiatan']]);
    const periode = pilihan([['bulan', 'Bulanan'], ['tahun', 'Tahunan']]);
    const nilai = isian('month', bulanIni());
    const hasilRekap = el('div');
    const statusRekap = pesanStatus();
    periode.addEventListener('change', () => {
      const tahunan = periode.value === 'tahun';
      nilai.type = tahunan ? 'number' : 'month';
      nilai.value = tahunan ? String(new Date().getFullYear()) : bulanIni();
    });
    const barRekap = el('div', 'kg-bar');
    barRekap.append(kolom('Kelompokkan', by), kolom('Periode', periode), kolom('Waktu', nilai), tombol('Tampilkan', 'button button--primary kg-small', () => muatRekap().catch(() => {})));
    rekap.append(barRekap, statusRekap, hasilRekap);

    async function muatRekap() {
      statusRekap.set('Memuat...');
      try {
        const data = await api('GET', `/api/kegiatan/rekap?by=${by.value}&period=${periode.value}&value=${encodeURIComponent(nilai.value)}&t=${Date.now()}`);
        if (data.available === false) { statusRekap.set('Database belum diperbarui.', true); return; }
        statusRekap.set(`${data.items.length} baris. Kegiatan tidak terlaksana: ${data.sessionsNotHeld.notHeld}, dibatalkan: ${data.sessionsNotHeld.cancelled}.`);
        const tabel = el('table', 'kg-table kg-table--stack');
        const kepala = el('tr');
        ['Nama', 'Kegiatan', 'Hadir', 'Izin', 'Sakit', 'Tidak hadir', 'Belum dicatat', 'Kehadiran'].forEach((t) => kepala.append(el('th', '', t)));
        tabel.append(kepala);
        data.items.forEach((r) => {
          const tr = el('tr');
          const judulKolom = ['Nama', 'Kegiatan', 'Hadir', 'Izin', 'Sakit', 'Tidak hadir', 'Belum dicatat', 'Kehadiran'];
          [r.label, r.sessions, r.hadir, r.izin, r.sakit, r.alpa, r.belum, r.rate === null ? '-' : `${r.rate}%`].forEach((v, i) => { const c = el('td', '', String(v)); c.dataset.label = judulKolom[i]; tr.append(c); });
          tabel.append(tr);
        });
        hasilRekap.replaceChildren(data.items.length ? el('div', 'kg-scroll') : kosong('Belum ada kegiatan terlaksana pada periode ini.'));
        if (data.items.length) hasilRekap.firstChild.append(tabel);
      } catch (error) { statusRekap.set(error.message, true); }
    }

    dari.addEventListener('change', () => muat().catch(() => {}));
    sampai.addEventListener('change', () => muat().catch(() => {}));
    await muat();
    await muatRekap();
    return akar;
  }

  function bagianDengan(judul, ket, ...anak) {
    const b = bagian(judul, ket);
    b.append(...anak);
    return b;
  }

  async function bukaSesi(id, wadah, muatDaftar) {
    wadah.replaceChildren(kosong('Memuat kegiatan...'));
    const data = await api('GET', `/api/kegiatan/sesi/${encodeURIComponent(id)}?t=${Date.now()}`);
    const s = data.session;
    const b = bagian(`${s.typeName} · ${tanggal(s.date)}`, `${s.groupLabel}${s.location ? ` · ${s.location}` : ''}${s.startTime ? ` · ${s.startTime}` : ''}`);
    const status = pesanStatus();
    const bar = el('div', 'kg-bar');
    bar.append(el('span', `kg-chip is-${s.status}`, s.statusLabel));
    if (s.statusReason) bar.append(el('span', 'wali-field__hint', `Alasan: ${s.statusReason}`));
    if (s.manageable) {
      const ubah = async (st, alasan) => {
        try { await api('PATCH', `/api/kegiatan/sesi/${encodeURIComponent(id)}`, { status: st, reason: alasan }); await muatDaftar(); await bukaSesi(id, wadah, muatDaftar); } catch (error) { status.set(error.message, true); }
      };
      if (s.status !== 'terlaksana') bar.append(tombol('Tandai terlaksana', 'button button--primary kg-small', () => ubah('terlaksana')));
      if (s.status === 'terjadwal' || s.status === 'terlaksana') {
        bar.append(tombol('Tidak terlaksana', 'button button--secondary kg-small', async () => {
          const alasan = await window.HamasahDialog.formulir({ judul: 'Kegiatan tidak terlaksana', keterangan: 'Ini keputusan tentang kegiatannya, bukan tentang santri. Tidak ada santri yang dihitung tidak hadir.', bidang: [{ nama: 'reason', label: 'Alasan', jenis: 'textarea', wajib: true }], labelSimpan: 'Simpan', kirim: (v) => api('PATCH', `/api/kegiatan/sesi/${encodeURIComponent(id)}`, { status: 'tidak-terlaksana', reason: v.reason }) });
          if (alasan) { await muatDaftar(); await bukaSesi(id, wadah, muatDaftar); }
        }));
      }
    }
    b.append(bar, status);

    if (s.status === 'terlaksana') {
      const pilih = new Map();
      const awal = new Map(data.students.map((x) => [x.id, x.status]));
      const tabel = el('table', 'kg-table kg-table--stack');
      const kepala = el('tr');
      ['Santri', 'Asrama', 'Status', 'Catatan'].forEach((t) => kepala.append(el('th', '', t)));
      tabel.append(kepala);
      data.students.forEach((x) => {
        const sel = pilihan([['', 'Belum dicatat'], ...STATUS_ABSENSI], x.status || '');
        sel.disabled = !s.manageable;
        sel.setAttribute('aria-label', `Status ${x.name}`);
        const cat = isian('text', x.note || '', { maxlength: '200' });
        cat.disabled = !s.manageable;
        cat.setAttribute('aria-label', `Catatan ${x.name}`);
        pilih.set(x.id, { sel, cat });
        const tr = el('tr');
        const td = (n, label) => { const c = el('td'); c.dataset.label = label; c.append(n); return c; };
        const teksTd = (v, label) => { const c = el('td', '', v); c.dataset.label = label; return c; };
        tr.append(teksTd(x.name, 'Santri'), teksTd(x.dormitoryName || '-', 'Asrama'), td(sel, 'Status'), td(cat, 'Catatan'));
        tabel.append(tr);
      });
      const bungkus = el('div', 'kg-scroll');
      bungkus.append(tabel);
      b.append(data.students.length ? bungkus : kosong('Tidak ada peserta dalam tanggung jawab Anda.'));
      if (s.manageable && data.students.length) {
        const semua = tombol('Tandai semua hadir', 'button button--secondary kg-small', () => pilih.forEach(({ sel }) => { if (!sel.value) sel.value = 'hadir'; }));
        const simpan = tombol('Simpan absensi', 'button button--primary kg-small', async () => {
          const entries = [...pilih.entries()].filter(([, v]) => v.sel.value).map(([studentId, v]) => ({ studentId, status: v.sel.value, note: v.cat.value }));
          if (!entries.length) { status.set('Belum ada status yang dipilih.', true); return; }
          const berubah = entries.filter((e) => awal.get(e.studentId) && awal.get(e.studentId) !== e.status);
          let alasan;
          if (berubah.length) {
            const jawab = await window.HamasahDialog.formulir({ judul: 'Koreksi absensi', keterangan: `${berubah.length} absensi yang sudah tercatat akan diubah. Perubahan tersimpan beserta alasan dan nama Anda.`, bidang: [{ nama: 'reason', label: 'Alasan koreksi', jenis: 'textarea', wajib: true }], labelSimpan: 'Lanjut simpan', kirim: async (v) => v });
            if (!jawab) return;
            alasan = jawab.reason;
          }
          simpan.disabled = true;
          try {
            const hasil = await api('PUT', `/api/kegiatan/sesi/${encodeURIComponent(id)}/absensi`, { entries, reason: alasan });
            status.set(`Tersimpan: ${hasil.recorded} baru, ${hasil.corrected} dikoreksi, ${hasil.unchanged} tidak berubah.`);
            await muatDaftar();
            await bukaSesi(id, wadah, muatDaftar);
          } catch (error) { status.set(error.message, true); simpan.disabled = false; }
        });
        const aksi = el('div', 'kg-bar');
        aksi.append(semua, simpan);
        b.append(aksi);
      }
      if (data.corrections.length) {
        b.append(el('h4', 'wali-subtitle', 'Riwayat koreksi'));
        const ul = el('ul', 'wali-mini-list');
        data.corrections.forEach((k) => {
          const nama = (data.students.find((x) => x.id === k.studentId) || {}).name || 'Santri';
          const li = el('li');
          li.append(el('span', '', `${nama}: ${k.from} → ${k.to} · ${k.reason}`), el('strong', '', `${k.changedBy || 'Staf'} · ${new Date(k.changedAt).toLocaleDateString('id-ID')}`));
          ul.append(li);
        });
        b.append(ul);
      }
    } else if (s.status === 'terjadwal') {
      b.append(kosong('Tandai kegiatan terlaksana lebih dulu untuk mengisi absensi. Ketidakhadiran santri tidak pernah dianggap sebagai kegiatan tidak terlaksana.'));
    } else {
      b.append(kosong('Kegiatan ini tidak terlaksana, jadi tidak ada absensi dan tidak masuk rekap.'));
    }
    wadah.replaceChildren(b);
  }

  // ------------------------------------------------------------------ tab setoran

  async function tabSetoran() {
    const akar = el('div', 'kg-stack');
    const pilih = pilihan([['', 'Pilih santri...'], ...state.santri.map((s) => [s.id, `${s.name}${s.dormitoryName ? ` · ${s.dormitoryName}` : ''}`])], state.pilihanSantri);
    const bulan = isian('month', bulanIni());
    const bar = el('div', 'kg-bar');
    bar.append(kolom('Santri', pilih), kolom('Bulan rekap', bulan));
    const badan = el('div');
    akar.append(bagianDengan('Buku setoran', 'Pilih santri untuk mencatat setoran dan melihat perkembangan hafalannya.', bar), badan);

    async function muat() {
      state.pilihanSantri = pilih.value;
      if (!pilih.value) { badan.replaceChildren(kosong('Pilih santri terlebih dahulu.')); return; }
      badan.replaceChildren(kosong('Memuat...'));
      let data;
      try { data = await api('GET', `/api/students/${encodeURIComponent(pilih.value)}/setoran?month=${encodeURIComponent(bulan.value)}&t=${Date.now()}`); } catch (error) { badan.replaceChildren(kosong(error.message)); return; }
      if (data.available === false) { badan.replaceChildren(kosong('Database belum diperbarui untuk buku setoran. Terapkan pembaruan database di halaman Pengaturan.')); return; }
      badan.replaceChildren(formSetoran(data, pilih.value, muat), ringkasSetoran(data), riwayatSetoran(data, pilih.value, muat));
    }
    pilih.addEventListener('change', () => muat().catch(() => {}));
    bulan.addEventListener('change', () => muat().catch(() => {}));
    if (pilih.value) await muat(); else badan.replaceChildren(kosong('Pilih santri terlebih dahulu.'));
    return akar;
  }

  function formSetoran(data, studentId, muat) {
    const b = bagian('Catat setoran', 'Ayat yang sudah pernah disetor sebagai hafalan baru tidak dihitung dua kali. Murajaah tidak menambah jumlah hafalan.');
    const form = el('form', 'wali-form');
    form.noValidate = true;
    const tgl = isian('date', hariIni());
    const jenis = pilihan(data.options.kinds.map((k) => [k.id, k.label]));
    const surat = pilihan(data.options.surahs.map((s) => [String(s.number), `${s.number}. ${s.name} (${s.ayat} ayat)`]));
    const awal = isian('number', '1', { min: '1' });
    const akhir = isian('number', '1', { min: '1' });
    const mutu = pilihan(data.options.qualities.map((k) => [k.id, k.label]));
    const penguji = isian('text', '', { maxlength: '80' });
    const catatan = el('textarea', 'wali-field');
    catatan.rows = 2;
    catatan.maxLength = 300;
    const batas = () => { const s = data.options.surahs[Number(surat.value) - 1]; awal.max = String(s.ayat); akhir.max = String(s.ayat); };
    surat.addEventListener('change', batas);
    batas();
    const status = pesanStatus();
    const kirim = el('button', 'button button--primary wali-action', 'Simpan setoran');
    kirim.type = 'submit';
    form.append(kolom('Tanggal setoran', tgl), kolom('Jenis setoran', jenis), kolom('Surat', surat), kolom('Ayat awal', awal), kolom('Ayat akhir', akhir), kolom('Kualitas setoran', mutu), kolom('Penguji', penguji), kolom('Catatan perbaikan', catatan), kirim, status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      kirim.disabled = true;
      status.set('Menyimpan...');
      try {
        const hasil = await api('POST', `/api/students/${encodeURIComponent(studentId)}/setoran`, { date: tgl.value, kind: jenis.value, surah: Number(surat.value), ayahFrom: Number(awal.value), ayahTo: Number(akhir.value), quality: mutu.value, examiner: penguji.value, note: catatan.value });
        await muat();
        const info = document.querySelector('.kg-notice');
        if (info) info.textContent = `Tersimpan: ${hasil.newAyat} ayat baru. ${hasil.notice || ''} Total hafalan unik: ${hasil.totalUnique} ayat.`;
      } catch (error) { status.set(error.message, true); kirim.disabled = false; }
    });
    b.append(form, el('p', 'wali-pending-note kg-notice', ''));
    return b;
  }

  function ringkasSetoran(data) {
    const b = bagian('Perkembangan hafalan', `${data.progress.uniqueAyat} dari ${data.progress.totalAyat} ayat unik (${data.progress.percent}%) · ${data.progress.completeSurahs} surat lengkap.`);
    const batang = el('div', 'kg-progress');
    batang.setAttribute('role', 'progressbar');
    batang.setAttribute('aria-valuenow', String(data.progress.percent));
    batang.setAttribute('aria-valuemin', '0');
    batang.setAttribute('aria-valuemax', '100');
    const isi = el('span', 'kg-progress__fill');
    isi.style.width = `${Math.min(100, data.progress.percent)}%`;
    batang.append(isi);
    const m = data.month;
    const kartu = el('div', 'kg-metrics');
    [['Ayat baru bulan ini', m.newAyat], ['Ayat murajaah (unik)', m.murajaahAyat], ['Setoran bulan ini', m.entries], ['Perlu diulang', m.perluDiulang]].forEach(([l, v]) => {
      const k = el('div', 'kg-metric');
      k.append(el('strong', '', String(v)), el('span', '', l));
      kartu.append(k);
    });
    b.append(batang, kartu);
    if (data.daily.length) {
      b.append(el('h4', 'wali-subtitle', `Rekap harian ${m.month}`));
      const ul = el('ul', 'wali-mini-list');
      data.daily.forEach((d) => { const li = el('li'); li.append(el('span', '', tanggal(d.date)), el('strong', '', `${d.newAyat} baru · ${d.murajaahAyat} murajaah`)); ul.append(li); });
      b.append(ul);
    }
    b.append(el('h4', 'wali-subtitle', 'Rekap bulanan (12 bulan)'));
    const ul = el('ul', 'wali-mini-list');
    data.monthly.filter((x) => x.entries).forEach((x) => { const li = el('li'); li.append(el('span', '', x.month), el('strong', '', `${x.newAyat} ayat baru · ${x.murajaahAyat} murajaah · ${x.entries} setoran`)); ul.append(li); });
    b.append(ul.childElementCount ? ul : kosong('Belum ada setoran dalam 12 bulan terakhir.'));
    return b;
  }

  function riwayatSetoran(data, studentId, muat) {
    const b = bagian('Setoran terakhir', 'Setoran yang keliru dibatalkan dengan alasan; catatannya tetap tersimpan sebagai jejak.');
    if (!data.entries.length) { b.append(kosong('Belum ada setoran.')); return b; }
    const ul = el('ul', 'wali-notes');
    data.entries.forEach((e) => {
      const li = el('li', `wali-note is-${e.quality === 'lancar' ? 'baik' : e.quality === 'ulang' ? 'perlu' : 'catatan'}`);
      const meta = el('div', 'wali-note__meta');
      meta.append(el('span', 'wali-note__kind', e.kindLabel), el('span', '', `${tanggal(e.date)} · ${e.qualityLabel}`));
      li.append(meta, el('p', 'wali-note__body', `${e.surahName} ayat ${e.ayahFrom}${e.ayahTo !== e.ayahFrom ? `–${e.ayahTo}` : ''}${e.kind === 'ziyadah' ? ` · ${e.newAyat} ayat baru${e.repeatedAyat ? `, ${e.repeatedAyat} sudah pernah disetor` : ''}` : ''}`));
      if (e.examiner || e.note) li.append(el('p', 'wali-field__hint', [e.examiner ? `Penguji: ${e.examiner}` : '', e.note].filter(Boolean).join(' · ')));
      li.append(tombol('Batalkan setoran', 'wali-link', async () => {
        const hasil = await window.HamasahDialog.formulir({ judul: 'Batalkan setoran', keterangan: 'Setoran keluar dari hitungan, tetapi tetap tersimpan sebagai jejak.', bidang: [{ nama: 'reason', label: 'Alasan pembatalan', jenis: 'textarea', wajib: true }], labelSimpan: 'Batalkan', kirim: (v) => api('POST', `/api/students/${encodeURIComponent(studentId)}/setoran/${encodeURIComponent(e.id)}/batal`, v) });
        if (hasil) await muat();
      }));
      ul.append(li);
    });
    b.append(ul);
    if (data.voided && data.voided.length) {
      b.append(el('h4', 'wali-subtitle', 'Setoran yang dibatalkan'));
      const dv = el('ul', 'wali-mini-list');
      data.voided.forEach((v) => { const li = el('li'); li.append(el('span', '', `${v.surahName} ${v.ayahFrom}–${v.ayahTo} · ${v.voidReason}`), el('strong', '', v.voidedBy || '')); dv.append(li); });
      b.append(dv);
    }
    return b;
  }

  // ------------------------------------------------------------------ tab rapor

  async function tabRapor() {
    const akar = el('div', 'kg-stack');
    const bulan = isian('month', bulanIni());
    const bar = el('div', 'kg-bar');
    bar.append(kolom('Bulan rapor', bulan));
    const status = pesanStatus();
    const daftar = el('div');
    const rincian = el('div');
    const aturanAwal = await api('GET', '/api/rapor/pengaturan').catch(() => null);
    const peringatan = aturanAwal && !aturanAwal.config.confirmedAt
      ? el('p', 'kg-warning', 'Pengaturan penilaian (bobot dan batas A/B/C) belum dikonfirmasi admin, jadi rapor belum bisa diterbitkan. Rapor tetap bisa disusun dan diajukan. Admin mengonfirmasinya di tab Pengaturan.')
      : null;
    akar.append(bagianDengan('Rapor bulanan', 'Susun, ajukan tinjauan, lalu terbitkan. Wali dan santri hanya melihat rapor yang sudah terbit.', ...[peringatan, bar, status, daftar].filter(Boolean)), rincian);

    async function muat() {
      status.set('Memuat...');
      try {
        const data = await api('GET', `/api/rapor/bulan/${encodeURIComponent(bulan.value)}?t=${Date.now()}`);
        if (data.available === false) { status.set('Database belum diperbarui untuk rapor bulanan. Terapkan pembaruan database di halaman Pengaturan.', true); daftar.replaceChildren(); return; }
        status.set(data.canPublish ? 'Anda berwenang menerbitkan rapor.' : 'Anda menyusun dan mengajukan; penerbitan oleh pihak yang ditetapkan admin.');
        const tabel = el('table', 'kg-table kg-table--stack');
        const kepala = el('tr');
        ['Santri', 'Asrama', 'Status rapor', 'Nilai', ''].forEach((t) => kepala.append(el('th', '', t)));
        tabel.append(kepala);
        data.items.forEach((r) => {
          const tr = el('tr');
          const sel = el('td');
          sel.append(tombol('Buka', 'button button--secondary kg-small', () => bukaRapor(r.studentId, r.name, bulan.value, data.canPublish, rincian, muat).catch(() => {})));
          const isiTd = (v, label) => { const c = el('td', '', v); c.dataset.label = label; return c; };
          tr.append(isiTd(r.name, 'Santri'), isiTd(r.dormitoryName || '-', 'Asrama'), isiTd(r.statusLabel, 'Status rapor'), isiTd(r.grade ? `${r.grade} (${r.total})` : '-', 'Nilai'), sel);
          tabel.append(tr);
        });
        const bungkus = el('div', 'kg-scroll');
        bungkus.append(tabel);
        daftar.replaceChildren(data.items.length ? bungkus : kosong('Tidak ada santri dalam tanggung jawab Anda.'));
      } catch (error) { status.set(error.message, true); }
    }
    bulan.addEventListener('change', () => { rincian.replaceChildren(); muat().catch(() => {}); });
    await muat();
    return akar;
  }

  async function bukaRapor(studentId, nama, bulan, bolehTerbit, wadah, muatDaftar) {
    wadah.replaceChildren(kosong('Memuat rapor...'));
    const data = await api('GET', `/api/students/${encodeURIComponent(studentId)}/rapor?t=${Date.now()}`);
    const r = data.items.find((x) => x.month === bulan) || null;
    const b = bagian(`${nama} · ${bulan}`, r ? `${r.statusLabel}${r.generatedBy ? ` · disusun ${r.generatedBy}` : ''}${r.publishedBy ? ` · diterbitkan ${r.publishedBy}` : ''}` : 'Belum disusun.');
    const status = pesanStatus();
    const muatUlang = async () => { await muatDaftar(); await bukaRapor(studentId, nama, bulan, bolehTerbit, wadah, muatDaftar); };
    const panggil = async (method, url, body) => { try { await api(method, url, body); await muatUlang(); } catch (error) { status.set(error.message, true); } };
    const bar = el('div', 'kg-bar');
    if (!r || r.status !== 'published') bar.append(tombol(r ? 'Hitung ulang dari data' : 'Susun rapor', 'button button--primary kg-small', () => panggil('POST', `/api/students/${encodeURIComponent(studentId)}/rapor/${bulan}/susun`)));
    b.append(bar, status);
    if (r) {
      b.append(el('p', 'kg-score', r.total === null ? 'Belum ada data yang cukup untuk dinilai.' : `Nilai ${r.total} · Kategori ${r.grade}`));
      const ul = el('ul', 'wali-mini-list');
      const label = { attendance: 'Absensi kegiatan', tahfidz: 'Tahfidz', discipline: 'Kedisiplinan', participation: 'Partisipasi' };
      Object.keys(label).forEach((k) => {
        const li = el('li');
        li.append(el('span', '', `${label[k]}${r.weights ? ` (bobot ${r.weights[k]}%)` : ''}`), el('strong', '', r.scores[k] === null || r.scores[k] === undefined ? 'belum ada data' : String(r.scores[k])));
        ul.append(li);
      });
      b.append(ul);
      if (r.grades) b.append(el('p', 'wali-field__hint', `Kategori A mulai ${r.grades.A}, B mulai ${r.grades.B}, di bawahnya C. Pengaturan ini disalin saat rapor disusun.`));
      const dapat = r.raw.attendance, taf = r.raw.tahfidz;
      const rincianData = [dapat ? `Absensi (${dapat.source === 'presensi-asrama' ? 'presensi harian asrama, karena absensi kegiatan belum dipakai bulan ini' : 'absensi kegiatan'}): hadir ${dapat.hadir}, izin ${dapat.izin}, sakit ${dapat.sakit}, tidak hadir ${dapat.alpa}, belum dicatat ${dapat.belum}.` : '', taf ? `Tahfidz: ${taf.newAyat} ayat baru, ${taf.murajaahAyat} ayat murajaah.` : ''].filter(Boolean);
      rincianData.forEach((t) => b.append(el('p', 'wali-field__hint', t)));
      const bisaUbah = r.status !== 'published';
      const catatan = el('textarea', 'wali-field');
      catatan.rows = 4;
      catatan.maxLength = 2000;
      catatan.value = r.note;
      catatan.disabled = !bisaUbah;
      const rekom = el('textarea', 'wali-field');
      rekom.rows = 3;
      rekom.maxLength = 1000;
      rekom.value = r.recommendation;
      rekom.disabled = !bisaUbah;
      b.append(kolom('Catatan musyrif', catatan), kolom('Rekomendasi pembinaan', rekom));
      const aksi = el('div', 'kg-bar');
      if (bisaUbah) {
        aksi.append(tombol('Simpan catatan', 'button button--secondary kg-small', () => panggil('PATCH', `/api/students/${encodeURIComponent(studentId)}/rapor/${bulan}`, { note: catatan.value, recommendation: rekom.value })));
        if (r.status === 'draft') aksi.append(tombol('Ajukan untuk ditinjau', 'button button--primary kg-small', () => panggil('PATCH', `/api/students/${encodeURIComponent(studentId)}/rapor/${bulan}`, { note: catatan.value, recommendation: rekom.value, status: 'review' })));
        if (r.status === 'review') {
          aksi.append(tombol('Kembalikan ke draf', 'button button--secondary kg-small', () => panggil('PATCH', `/api/students/${encodeURIComponent(studentId)}/rapor/${bulan}`, { status: 'draft' })));
          if (bolehTerbit) aksi.append(tombol('Terbitkan ke wali dan santri', 'button button--primary kg-small', () => { if (window.confirm('Terbitkan rapor ini? Wali dan santri akan dapat melihatnya.')) panggil('POST', `/api/students/${encodeURIComponent(studentId)}/rapor/${bulan}/terbitkan`, {}); }));
        }
      } else if (bolehTerbit) {
        aksi.append(tombol('Tarik kembali dari wali', 'button button--secondary kg-small', () => panggil('POST', `/api/students/${encodeURIComponent(studentId)}/rapor/${bulan}/terbitkan`, { retract: true })));
      }
      aksi.append(tombol('Unduh PDF', 'button button--secondary kg-small', async () => {
        try {
          const respons = await fetch(`/api/students/${encodeURIComponent(studentId)}/rapor/${bulan}/pdf`, { headers: headers() });
          if (!respons.ok) throw new Error((await respons.json().catch(() => ({}))).error || 'PDF belum dapat dibuat.');
          const url = URL.createObjectURL(await respons.blob());
          const a = document.createElement('a');
          a.href = url;
          a.download = `rapor-${bulan}.pdf`;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { status.set(error.message, true); }
      }));
      b.append(aksi);
      if (data.trend.length) {
        b.append(el('h4', 'wali-subtitle', 'Tren rapor terbit'));
        const tr = el('ul', 'wali-mini-list');
        data.trend.forEach((t) => { const li = el('li'); li.append(el('span', '', t.label), el('strong', '', `${t.grade || '-'} (${t.total === null ? '-' : t.total})`)); tr.append(li); });
        b.append(tr);
      }
    }
    wadah.replaceChildren(b);
    wadah.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ------------------------------------------------------------------ tab pengaturan

  async function tabPengaturan() {
    const akar = el('div', 'kg-stack');
    const [jenis, aturan] = await Promise.all([api('GET', '/api/kegiatan/jenis'), api('GET', '/api/rapor/pengaturan')]);
    const bisa = admin();

    const j = bagian('Jenis kegiatan', bisa ? 'Admin dapat menambah jenis kegiatan baru atau menonaktifkannya.' : 'Hanya admin yang mengubah daftar ini.');
    const ul = el('ul', 'wali-mini-list');
    const statusJenis = pesanStatus();
    jenis.items.forEach((x) => {
      const li = el('li');
      li.append(el('span', '', `${x.name}${x.active ? '' : ' (nonaktif)'}${x.description ? ` · ${x.description}` : ''}`));
      if (bisa) li.append(tombol(x.active ? 'Nonaktifkan' : 'Aktifkan', 'wali-link', async () => { try { await api('PATCH', `/api/kegiatan/jenis/${encodeURIComponent(x.id)}`, { active: !x.active }); render().catch(() => {}); } catch (error) { statusJenis.set(error.message, true); } }));
      ul.append(li);
    });
    j.append(ul, statusJenis);
    if (bisa) {
      j.append(tombol('Tambah jenis kegiatan', 'button button--primary kg-small', async () => {
        const hasil = await window.HamasahDialog.formulir({ judul: 'Jenis kegiatan baru', bidang: [{ nama: 'name', label: 'Nama kegiatan', wajib: true }, { nama: 'description', label: 'Keterangan (opsional)', nilai: '' }], labelSimpan: 'Tambah', kirim: (v) => api('POST', '/api/kegiatan/jenis', v) });
        if (hasil) render().catch(() => {});
      }));
    }

    const c = aturan.config;
    const r = bagian('Penilaian rapor', bisa ? 'Bobot, batas nilai, target, dan penerbit rapor diatur di sini, bukan di kode. Rapor yang sudah disusun menyimpan salinan pengaturan saat itu.' : 'Hanya admin yang mengubah pengaturan ini.');
    const form = el('form', 'wali-form');
    form.noValidate = true;
    const angka = (v) => isian('number', String(v), { min: '0', step: '1' });
    const w = { attendance: angka(c.weights.attendance), tahfidz: angka(c.weights.tahfidz), discipline: angka(c.weights.discipline), participation: angka(c.weights.participation) };
    const gA = angka(c.grades.A);
    const gB = angka(c.grades.B);
    const tT = angka(c.tahfidzTargetAyat);
    const tP = angka(c.participationTarget);
    const p = { ringan: angka(c.disciplinePenalty.ringan), sedang: angka(c.disciplinePenalty.sedang), berat: angka(c.disciplinePenalty.berat) };
    const pdf = el('input');
    pdf.type = 'checkbox';
    pdf.checked = Boolean(c.pdfEnabled);
    const perMusyrif = el('input');
    perMusyrif.type = 'checkbox';
    perMusyrif.checked = c.publishRoles.includes('supervisor');
    form.append(
      kolom('Bobot absensi kegiatan (%)', w.attendance), kolom('Bobot tahfidz (%)', w.tahfidz), kolom('Bobot kedisiplinan (%)', w.discipline), kolom('Bobot partisipasi (%)', w.participation),
      kolom('Batas nilai A (mulai)', gA), kolom('Batas nilai B (mulai)', gB, 'Di bawah batas B adalah kategori C.'),
      kolom('Target ayat hafalan baru per bulan (nilai tahfidz 100)', tT), kolom('Target partisipasi per bulan (kegiatan + prestasi)', tP),
      kolom('Pengurang nilai disiplin: ringan', p.ringan), kolom('Pengurang nilai disiplin: sedang', p.sedang), kolom('Pengurang nilai disiplin: berat', p.berat),
      kolom('Musyrif ikut berwenang menerbitkan rapor', perMusyrif, 'Admin selalu berwenang. Musyrif hanya bisa menerbitkan rapor santri asramanya.'),
      kolom('Wali dan santri boleh mengunduh PDF rapor', pdf)
    );
    const statusAturan = pesanStatus();
    const terkonfirmasi = Boolean(c.confirmedAt);
    r.append(el('p', terkonfirmasi ? 'kg-ok' : 'kg-warning', terkonfirmasi
      ? `Pengaturan dikonfirmasi ${new Date(c.confirmedAt).toLocaleDateString('id-ID')}${c.confirmedBy ? ` oleh ${c.confirmedBy}` : ''}. Menyimpan perubahan akan mengonfirmasi ulang.`
      : 'Angka bawaan ini belum diperiksa. Rapor baru boleh diterbitkan setelah admin memeriksa dan menyimpan atau mengonfirmasi pengaturan ini.'));
    if (bisa && !terkonfirmasi) {
      r.append(tombol('Konfirmasi pengaturan ini', 'button button--secondary kg-small', async () => {
        try { await api('PUT', '/api/rapor/pengaturan', { confirm: true }); render().catch(() => {}); } catch (error) { statusAturan.set(error.message, true); }
      }));
    }
    if (bisa) {
      const simpan = el('button', 'button button--primary wali-action', 'Simpan pengaturan');
      simpan.type = 'submit';
      form.append(simpan);
    } else {
      form.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    }
    form.append(statusAturan);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('PUT', '/api/rapor/pengaturan', {
          weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v.value)])), grades: { A: Number(gA.value), B: Number(gB.value) },
          tahfidzTargetAyat: Number(tT.value), participationTarget: Number(tP.value), disciplinePenalty: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Number(v.value)])),
          publishRoles: perMusyrif.checked ? ['admin', 'supervisor'] : ['admin'], pdfEnabled: pdf.checked
        });
        statusAturan.set('Pengaturan tersimpan. Rapor baru memakai pengaturan ini; yang sudah disusun tidak berubah.');
      } catch (error) { statusAturan.set(error.message, true); }
    });
    r.append(form);
    akar.append(j, r);
    return akar;
  }

  // ------------------------------------------------------------------ rangka

  const BUAT = { absensi: tabAbsensi, setoran: tabSetoran, rapor: tabRapor, pengaturan: tabPengaturan };

  async function render() {
    const kepala = el('header', 'asr-head');
    const teks = el('div', 'asr-head__text');
    teks.append(el('p', 'wali-eyebrow', 'Kegiatan dan rapor'), el('h2', 'asr-head__title', 'Absensi, tahfidz, dan rapor santri'), el('p', 'mus-note', 'Catat kehadiran kegiatan, setoran hafalan, lalu susun rapor bulanan.'));
    kepala.append(teks);
    const tab = el('div', 'wali-tabs');
    tab.setAttribute('role', 'tablist');
    TAB.forEach(([id, label]) => {
      const b = el('button', `wali-tab${state.tab === id ? ' is-active' : ''}`, label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(state.tab === id));
      b.addEventListener('click', () => { state.tab = id; render().catch(() => {}); });
      tab.append(b);
    });
    const isi = el('div', 'wali-panel');
    isi.append(kosong('Memuat...'));
    app.replaceChildren(kepala, tab, isi);
    try {
      isi.replaceChildren(await BUAT[state.tab]());
    } catch (error) {
      isi.replaceChildren(kosong(error.message || 'Halaman belum dapat dimuat.'));
    }
  }

  (async function mulai() {
    if (session()) document.body.classList.add('in-crm');
    try {
      const me = await window.hamasahMintaAkun(headers());
      const akun = me.body && me.body.account;
      if (!me.ok || !akun || !['admin', 'supervisor'].includes(akun.role)) throw new Error('Halaman ini untuk admin dan musyrif.');
      state.akun = akun;
      guard.hidden = true;
      konsol.hidden = false;
      document.body.classList.add('in-crm');
      renderStaffNav(staffNav, akun.role, 'kegiatan', akun);
      const [asrama, santri] = await Promise.all([
        api('GET', '/api/announcements/asrama').catch(() => ({ dormitories: [] })),
        api('GET', '/api/my-students?limit=200').catch(() => ({ items: [] }))
      ]);
      state.asrama = asrama.dormitories || [];
      state.santri = santri.items || [];
      await render();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Kegiatan dan Rapor belum tersedia';
    }
  }());

  const keluar = document.querySelector('#logout-button');
  if (keluar) {
    keluar.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', headers: headers() }).catch(() => {});
      sessionStorage.removeItem('hamasahPortalSession');
      window.location.reload();
    });
  }
}());
