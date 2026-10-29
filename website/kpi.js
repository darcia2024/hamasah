// KPI Musyrif. Admin: penilaian bulanan, perbandingan kinerja, verifikasi pekerjaan tambahan, indikator dan pengaturan,
// penghargaan. Musyrif: KPI dirinya sendiri, bukti pelaksanaan, pekerjaan tambahan, dan riwayat penghargaan.
// API: /api/kpi/*. Semua teks lewat textContent; tanpa gaya sebaris (CSP).
(function initKpi() {
  const guard = document.querySelector('#kpi-guard');
  const guardCopy = document.querySelector('#kpi-guard-copy');
  const konsol = document.querySelector('#kpi-console');
  const app = document.querySelector('#kpi-app');
  const staffNav = document.querySelector('#staff-nav');
  const TAB_ADMIN = [['penilaian', 'Penilaian bulanan'], ['perbandingan', 'Perbandingan'], ['kerja', 'Pekerjaan tambahan'], ['indikator', 'Indikator dan pengaturan'], ['penghargaan', 'Penghargaan']];
  const state = { akun: null, tab: 'penilaian', musyrif: [], pilihMusyrif: '', bulan: new Date().toISOString().slice(0, 7), tahun: String(new Date().getFullYear()) };

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

  const admin = () => state.akun && state.akun.role === 'admin';
  const kosong = (teks) => el('p', 'wali-empty', teks);
  const NAMA_BULAN = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const labelBulan = (b) => NAMA_BULAN.format(new Date(`${b}-01T00:00:00Z`));

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
    kontrol.id = `kp-${Math.random().toString(36).slice(2, 8)}`;
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

  function tabelStack(kepalaTeks, baris) {
    const tabel = el('table', 'kg-table kg-table--stack');
    const kepala = el('tr');
    kepalaTeks.forEach((t) => kepala.append(el('th', '', t)));
    tabel.append(kepala);
    baris.forEach((sel) => {
      const tr = el('tr');
      sel.forEach((v, i) => {
        const td = v instanceof Node ? el('td') : el('td', '', v === null || v === undefined ? '-' : String(v));
        if (v instanceof Node) td.append(v);
        td.dataset.label = kepalaTeks[i];
        tr.append(td);
      });
      tabel.append(tr);
    });
    const bungkus = el('div', 'kg-scroll');
    bungkus.append(tabel);
    return bungkus;
  }

  // ------------------------------------------------------------------ admin: penilaian bulanan

  async function tabPenilaian() {
    const akar = el('div', 'kg-stack');
    const pilih = pilihan([['', 'Pilih musyrif...'], ...state.musyrif.map((m) => [m.id, `${m.name}${m.dormitories ? ` · ${m.dormitories}` : ''}`])], state.pilihMusyrif);
    const bulan = isian('month', state.bulan);
    const bar = el('div', 'kg-bar');
    bar.append(kolom('Musyrif', pilih), kolom('Bulan', bulan));
    const badan = el('div');
    akar.append(bagian('Penilaian bulanan', 'Hitung dari data sistem, sesuaikan nilai bila perlu (wajib berkomentar), lalu finalkan. Keluhan wali yang belum diverifikasi tidak pernah menurunkan nilai.'), badan);
    akar.firstChild.append(bar);

    async function muat() {
      state.pilihMusyrif = pilih.value;
      state.bulan = bulan.value;
      if (!pilih.value) { badan.replaceChildren(kosong('Pilih musyrif terlebih dahulu.')); return; }
      badan.replaceChildren(kosong('Memuat...'));
      let data;
      try { data = await api('GET', `/api/kpi/penilaian?musyrifId=${encodeURIComponent(pilih.value)}&month=${encodeURIComponent(bulan.value)}&t=${Date.now()}`); } catch (error) { badan.replaceChildren(kosong(error.message)); return; }
      badan.replaceChildren(rincianPenilaian(data, muat));
    }
    pilih.addEventListener('change', () => muat().catch(() => {}));
    bulan.addEventListener('change', () => muat().catch(() => {}));
    if (pilih.value) await muat();
    else badan.replaceChildren(kosong('Pilih musyrif terlebih dahulu.'));
    return akar;
  }

  function rincianPenilaian(data, muat) {
    const ev = data.evaluation;
    const b = bagian(`${labelBulan(state.bulan)}`, ev ? `${ev.statusLabel}${ev.finalizedBy ? ` · difinalkan ${ev.finalizedBy}` : ''}` : 'Belum dihitung.');
    const status = pesanStatus();
    const bar = el('div', 'kg-bar');
    if (!ev || ev.status === 'draft') {
      bar.append(tombol(ev ? 'Hitung ulang dari data' : 'Hitung penilaian', 'button button--primary kg-small', async () => {
        try { await api('POST', '/api/kpi/penilaian', { musyrifId: state.pilihMusyrif, month: state.bulan }); await muat(); } catch (error) { status.set(error.message, true); }
      }));
    }
    b.append(bar, status);
    if (!data.settingsConfirmed) b.append(el('p', 'kg-warning', 'Bobot dan batas nilai KPI belum dikonfirmasi admin, jadi penilaian belum bisa difinalkan. Konfirmasi di tab Indikator dan pengaturan.'));
    if (ev) {
      b.append(el('p', 'kg-score', ev.total === null ? 'Belum ada data yang cukup untuk dinilai.' : `Nilai ${ev.total} · Kategori ${ev.grade}`));
      const bisaUbah = ev.status === 'draft';
      const penyesuaian = new Map();
      const baris = ev.items.map((i) => {
        const skor = isian('number', i.adjusted ? String(i.score) : '', { min: '0', max: '100', placeholder: 'tetap' });
        const komentar = isian('text', i.adjustmentComment || '', { maxlength: '500', placeholder: 'Komentar bila disesuaikan' });
        skor.disabled = !bisaUbah;
        komentar.disabled = !bisaUbah;
        skor.setAttribute('aria-label', `Penyesuaian nilai ${i.name}`);
        komentar.setAttribute('aria-label', `Komentar penyesuaian ${i.name}`);
        penyesuaian.set(i.id, { skor, komentar });
        return [i.name, `${i.weight}%`, i.autoScore === null ? '-' : String(i.autoScore), i.detail, skor, komentar, i.score === null ? '-' : String(i.score)];
      });
      b.append(tabelStack(['Indikator', 'Bobot', 'Otomatis', 'Dasar penilaian', 'Sesuaikan', 'Komentar', 'Nilai akhir'], baris));
      if (ev.missing.length) b.append(el('p', 'wali-field__hint', `Tanpa data, tidak dihitung: ${ev.missing.join(', ')}.`));
      const komentarAkhir = el('textarea', 'wali-field');
      komentarAkhir.rows = 3;
      komentarAkhir.maxLength = 2000;
      komentarAkhir.value = ev.comment;
      komentarAkhir.disabled = !bisaUbah;
      b.append(kolom('Komentar penilai', komentarAkhir));
      const aksi = el('div', 'kg-bar');
      if (bisaUbah) {
        aksi.append(tombol('Simpan penyesuaian dan komentar', 'button button--secondary kg-small', async () => {
          const adjustments = {};
          penyesuaian.forEach(({ skor, komentar }, id) => { adjustments[id] = skor.value === '' ? { score: null } : { score: Number(skor.value), comment: komentar.value }; });
          try { await api('PATCH', `/api/kpi/penilaian/${encodeURIComponent(ev.id)}`, { adjustments, comment: komentarAkhir.value }); await muat(); } catch (error) { status.set(error.message, true); }
        }));
        if (data.canFinalize) {
          aksi.append(tombol('Finalkan penilaian', 'button button--primary kg-small', async () => {
            if (!window.confirm('Finalkan penilaian ini? Setelah final tidak bisa diubah dan musyrif dapat melihatnya.')) return;
            try { await api('POST', `/api/kpi/penilaian/${encodeURIComponent(ev.id)}/final`); await muat(); } catch (error) { status.set(error.message, true); }
          }));
        }
      }
      b.append(aksi);
    }
    b.append(el('h4', 'wali-subtitle', 'Bukti pelaksanaan dari musyrif'));
    if (!data.evidence.length) b.append(kosong('Belum ada bukti pada bulan ini.'));
    else {
      const ul = el('ul', 'wali-notes');
      data.evidence.forEach((e) => {
        const li = el('li', 'wali-note is-catatan');
        const meta = el('div', 'wali-note__meta');
        meta.append(el('span', 'wali-note__kind', e.indicatorName || 'Umum'), el('span', '', new Date(e.createdAt).toLocaleDateString('id-ID')));
        li.append(meta, el('p', 'wali-note__body', e.description));
        if (e.fileId) li.append(tombol('Buka berkas bukti', 'wali-link', () => window.HamasahUnggah.buka(e.fileId, headers()).catch((error) => status.set(error.message, true))));
        if (e.reviewerComment) li.append(el('p', 'wali-note__reply', `Komentar penilai: ${e.reviewerComment}`));
        li.append(tombol(e.reviewerComment ? 'Ubah komentar' : 'Beri komentar', 'wali-link', async () => {
          const hasil = await window.HamasahDialog.formulir({ judul: 'Komentar penilai', bidang: [{ nama: 'comment', label: 'Komentar', jenis: 'textarea', nilai: e.reviewerComment || '', wajib: true }], labelSimpan: 'Simpan', kirim: (v) => api('PATCH', `/api/kpi/bukti/${encodeURIComponent(e.id)}/komentar`, v) });
          if (hasil) await muat();
        }));
        ul.append(li);
      });
      b.append(ul);
    }
    b.append(el('h4', 'wali-subtitle', 'Pekerjaan tambahan bulan ini'));
    b.append(data.extraWork.length ? tabelStack(['Tanggal', 'Jenis', 'Uraian', 'Status'], data.extraWork.map((k) => [k.workDate, k.kindLabel, k.description, k.statusLabel])) : kosong('Tidak ada pekerjaan tambahan yang dicatat.'));
    return b;
  }

  // ------------------------------------------------------------------ admin: perbandingan

  async function tabPerbandingan() {
    const akar = el('div', 'kg-stack');
    const tahun = isian('number', state.tahun, { min: '2020', max: '2100' });
    const bar = el('div', 'kg-bar');
    bar.append(kolom('Tahun', tahun));
    const badan = el('div');
    const b = bagian('Perbandingan kinerja', 'Hanya penilaian yang sudah final. Digunakan untuk melihat pola dan menindaklanjuti dengan pendampingan, bukan sebagai satu-satunya dasar keputusan.');
    b.append(bar, badan);
    akar.append(b);
    async function muat() {
      state.tahun = tahun.value;
      badan.replaceChildren(kosong('Memuat...'));
      try {
        const data = await api('GET', `/api/kpi/perbandingan?year=${encodeURIComponent(tahun.value)}&t=${Date.now()}`);
        const bulanKolom = Array.from({ length: 12 }, (_, i) => `${data.year}-${String(i + 1).padStart(2, '0')}`);
        const ringkas = tabelStack(['Musyrif', 'Asrama', 'Bulan final', 'Rata-rata', 'Kategori', ...bulanKolom.map((m) => m.slice(5))], data.items.map((r) => [r.name, r.dormitories || '-', r.finalMonths, r.average === null ? '-' : r.average, r.grade || '-', ...bulanKolom.map((m) => (r.months[m] === undefined ? '-' : r.months[m]))]));
        const wadah = el('div');
        wadah.append(data.items.length ? ringkas : kosong('Belum ada musyrif aktif.'));
        if (data.indicators.length) {
          wadah.append(el('h4', 'wali-subtitle', 'Rata-rata per indikator (seluruh musyrif)'));
          const ul = el('ul', 'wali-mini-list');
          data.indicators.forEach((i) => { const li = el('li'); li.append(el('span', '', i.name), el('strong', '', String(i.average))); ul.append(li); });
          wadah.append(ul);
        }
        badan.replaceChildren(wadah);
      } catch (error) { badan.replaceChildren(kosong(error.message)); }
    }
    tahun.addEventListener('change', () => muat().catch(() => {}));
    await muat();
    return akar;
  }

  // ------------------------------------------------------------------ admin: pekerjaan tambahan

  async function tabKerja() {
    const akar = el('div', 'kg-stack');
    const b = bagian('Pekerjaan tambahan', 'Pekerjaan di luar tugas rutin yang dicatat musyrif. Hanya yang terverifikasi masuk penilaian (sebagai bonus).');
    const status = pesanStatus();
    const daftar = el('div');
    b.append(status, daftar);
    akar.append(b);
    async function muat() {
      const data = await api('GET', `/api/kpi/pekerjaan-tambahan?t=${Date.now()}`);
      if (!data.items.length) { daftar.replaceChildren(kosong('Belum ada pekerjaan tambahan.')); return; }
      daftar.replaceChildren(tabelStack(['Musyrif', 'Tanggal', 'Jenis', 'Uraian', 'Status', ''], data.items.map((k) => {
        const aksi = el('span');
        if (k.status === 'diajukan') {
          aksi.append(tombol('Verifikasi', 'button button--primary kg-small', async () => { try { await api('PATCH', `/api/kpi/pekerjaan-tambahan/${encodeURIComponent(k.id)}`, { decision: 'diverifikasi', note: 'Terverifikasi.' }); await muat(); } catch (error) { status.set(error.message, true); } }));
          aksi.append(tombol('Tolak', 'button button--secondary kg-small', async () => {
            const hasil = await window.HamasahDialog.formulir({ judul: 'Tolak pekerjaan tambahan', bidang: [{ nama: 'note', label: 'Alasan penolakan', jenis: 'textarea', wajib: true }], labelSimpan: 'Tolak', kirim: (v) => api('PATCH', `/api/kpi/pekerjaan-tambahan/${encodeURIComponent(k.id)}`, { decision: 'ditolak', note: v.note }) });
            if (hasil) await muat();
          }));
        }
        if (k.fileId) aksi.append(tombol('Bukti', 'wali-link', () => window.HamasahUnggah.buka(k.fileId, headers()).catch((error) => status.set(error.message, true))));
        return [k.musyrifName, k.workDate, k.kindLabel, k.description, k.statusLabel + (k.verificationNote ? ` (${k.verificationNote})` : ''), aksi];
      })));
    }
    await muat();
    return akar;
  }

  // ------------------------------------------------------------------ admin: indikator dan pengaturan

  async function tabIndikator() {
    const akar = el('div', 'kg-stack');
    const data = await api('GET', `/api/kpi/pengaturan?t=${Date.now()}`);
    const c = data.config;
    const status = pesanStatus();

    const i = bagian('Indikator KPI', 'Bobot dibagi ulang di antara indikator yang punya data pada bulan itu, jadi total bobot tidak harus 100.');
    i.append(tabelStack(['Indikator', 'Sumber', 'Bobot', 'Status', ''], data.indicators.map((x) => {
      const aksi = el('span');
      aksi.append(tombol('Ubah', 'wali-link', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: 'Ubah indikator',
          keterangan: x.description,
          bidang: [
            { nama: 'name', label: 'Nama indikator', nilai: x.name, wajib: true },
            { nama: 'weight', label: 'Bobot (0 sampai 100)', jenis: 'number', nilai: x.weight, wajib: true },
            ...(x.source === 'kegiatan' ? [{ nama: 'activityTypeId', label: 'Jenis kegiatan yang dinilai', jenis: 'select', pilihan: [['', 'Semua jenis kegiatan'], ...data.activityTypes.map((t) => [t.id, t.name])], nilai: x.activityTypeId || '' }] : []),
            { nama: 'active', label: 'Status', jenis: 'select', pilihan: [['true', 'Aktif'], ['false', 'Nonaktif']], nilai: String(x.active) }
          ],
          labelSimpan: 'Simpan',
          kirim: (v) => api('PATCH', `/api/kpi/indikator/${encodeURIComponent(x.id)}`, { name: v.name, weight: Number(v.weight), active: v.active === 'true', ...(v.activityTypeId !== undefined ? { activityTypeId: v.activityTypeId || null } : {}) })
        });
        if (hasil) render().catch(() => {});
      }));
      return [x.name + (x.description ? ` · ${x.description}` : ''), x.sourceLabel + (x.activityTypeName ? ` (${x.activityTypeName})` : ''), x.weight, x.active ? 'Aktif' : 'Nonaktif', aksi];
    })));
    i.append(tombol('Tambah indikator', 'button button--primary kg-small', async () => {
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Indikator baru',
        bidang: [
          { nama: 'name', label: 'Nama indikator', wajib: true },
          { nama: 'source', label: 'Sumber nilai', jenis: 'select', pilihan: data.sources.map((s) => [s.id, s.label]), nilai: 'manual' },
          { nama: 'weight', label: 'Bobot (0 sampai 100)', jenis: 'number', nilai: 10 },
          { nama: 'description', label: 'Keterangan (opsional)', nilai: '' }
        ],
        labelSimpan: 'Tambah',
        kirim: (v) => api('POST', '/api/kpi/indikator', { name: v.name, source: v.source, weight: Number(v.weight), description: v.description })
      });
      if (hasil) render().catch(() => {});
    }));

    const p = bagian('Pengaturan penilaian', 'Batas kategori, target, dan program reward diatur di sini, bukan di kode.');
    p.append(el('p', c.confirmedAt ? 'kg-ok' : 'kg-warning', c.confirmedAt ? `Dikonfirmasi ${new Date(c.confirmedAt).toLocaleDateString('id-ID')}. Menyimpan perubahan mengonfirmasi ulang.` : 'Angka bawaan ini belum diperiksa. Penilaian baru bisa difinalkan setelah admin memeriksa dan menyimpan atau mengonfirmasi pengaturan ini.'));
    const form = el('form', 'wali-form');
    form.noValidate = true;
    const gA = isian('number', String(c.grades.A), { min: '1', max: '100' });
    const gB = isian('number', String(c.grades.B), { min: '1', max: '100' });
    const kerja = isian('number', String(c.extraWorkTarget), { min: '1' });
    const keluhan = isian('number', String(c.complaintPenalty), { min: '0', max: '100' });
    const reward = el('input');
    reward.type = 'checkbox';
    reward.checked = Boolean(c.rewardEnabled);
    form.append(kolom('Batas nilai A (mulai)', gA), kolom('Batas nilai B (mulai)', gB, 'Di bawah batas B adalah kategori C.'), kolom('Target pekerjaan tambahan per bulan (nilai bonus 100)', kerja), kolom('Pengurang nilai per keluhan terverifikasi', keluhan, 'Hanya berlaku bila indikator keluhan diaktifkan dan keluhannya diverifikasi serta ditautkan ke musyrif.'), kolom('Program penghargaan dijalankan', reward));
    const simpan = el('button', 'button button--primary wali-action', c.confirmedAt ? 'Simpan pengaturan' : 'Simpan dan konfirmasi');
    simpan.type = 'submit';
    form.append(simpan, status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('PUT', '/api/kpi/pengaturan', { grades: { A: Number(gA.value), B: Number(gB.value) }, extraWorkTarget: Number(kerja.value), complaintPenalty: Number(keluhan.value), rewardEnabled: reward.checked });
        render().catch(() => {});
      } catch (error) { status.set(error.message, true); }
    });
    p.append(form);
    akar.append(i, p);
    return akar;
  }

  // ------------------------------------------------------------------ admin: penghargaan

  async function tabPenghargaan() {
    const akar = el('div', 'kg-stack');
    const data = await api('GET', `/api/kpi/pengaturan?t=${Date.now()}`);
    const b = bagian('Penghargaan', 'Riwayat penghargaan muncul di halaman KPI musyrif bila program reward dijalankan.');
    if (!data.config.rewardEnabled) {
      b.append(kosong('Program penghargaan belum dijalankan. Aktifkan di tab Indikator dan pengaturan bila program reward dimulai.'));
      akar.append(b);
      return akar;
    }
    const status = pesanStatus();
    b.append(tombol('Beri penghargaan', 'button button--primary kg-small', async () => {
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Beri penghargaan',
        bidang: [
          { nama: 'musyrifId', label: 'Musyrif', jenis: 'select', pilihan: state.musyrif.map((m) => [m.id, m.name]), nilai: state.musyrif[0] && state.musyrif[0].id, wajib: true },
          { nama: 'title', label: 'Judul penghargaan', wajib: true, nilai: '' },
          { nama: 'reason', label: 'Alasan', jenis: 'textarea', nilai: '' },
          { nama: 'awardedOn', label: 'Tanggal', jenis: 'date', nilai: new Date().toISOString().slice(0, 10), wajib: true }
        ],
        labelSimpan: 'Simpan',
        kirim: (v) => api('POST', '/api/kpi/penghargaan', v)
      });
      if (hasil) status.set('Penghargaan dicatat dan tampil di halaman KPI musyrif.');
    }), status);
    akar.append(b);
    return akar;
  }

  // ------------------------------------------------------------------ musyrif: KPI saya

  async function tampilanMusyrif() {
    const akar = el('div', 'kg-stack');
    const tahun = isian('number', state.tahun, { min: '2020', max: '2100' });
    const bar = el('div', 'kg-bar');
    bar.append(kolom('Tahun', tahun));
    const badan = el('div', 'kg-stack');
    const kepala = bagian('KPI saya', 'Penilaian yang sudah final oleh admin. Tambahkan bukti pelaksanaan dan catat pekerjaan tambahan agar tercatat dengan baik.');
    kepala.append(bar);
    akar.append(kepala, badan);

    async function muat() {
      state.tahun = tahun.value;
      badan.replaceChildren(kosong('Memuat...'));
      let data;
      try { data = await api('GET', `/api/kpi/saya?year=${encodeURIComponent(tahun.value)}&t=${Date.now()}`); } catch (error) { badan.replaceChildren(kosong(error.message)); return; }
      const ringkas = bagian('Rekap tahun ' + data.year, data.annual.finalMonths ? `${data.annual.finalMonths} bulan final.` : 'Belum ada penilaian final tahun ini.');
      if (data.annual.average !== null) ringkas.append(el('p', 'kg-score', `Rata-rata ${data.annual.average} · Kategori ${data.annual.grade}`));
      const bulanan = bagian('Penilaian bulanan', 'Nilai tiap indikator dan komentar penilai.');
      if (!data.evaluations.length) bulanan.append(kosong('Belum ada penilaian final.'));
      data.evaluations.forEach((e) => {
        const kartu = el('div', 'wali-note is-catatan');
        const meta = el('div', 'wali-note__meta');
        meta.append(el('span', 'wali-note__kind', labelBulan(e.month)), el('span', '', e.total === null ? 'Belum dinilai' : `Nilai ${e.total} · Kategori ${e.grade}`));
        kartu.append(meta);
        const ul = el('ul', 'wali-mini-list');
        e.items.forEach((i) => { const li = el('li'); li.append(el('span', '', `${i.name}${i.adjusted ? ' (disesuaikan penilai)' : ''}`), el('strong', '', i.score === null ? 'belum ada data' : String(i.score))); ul.append(li); });
        kartu.append(ul);
        if (e.comment) kartu.append(el('p', 'wali-note__reply', `Komentar penilai: ${e.comment}`));
        e.items.filter((i) => i.adjusted && i.adjustmentComment).forEach((i) => kartu.append(el('p', 'wali-field__hint', `${i.name}: ${i.adjustmentComment}`)));
        bulanan.append(kartu);
      });

      const bukti = bagian('Bukti pelaksanaan', 'Lampirkan bukti (foto, daftar hadir, dokumen) untuk bulan tertentu.');
      const statusBukti = pesanStatus();
      bukti.append(tombol('Tambah bukti', 'button button--primary kg-small', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: 'Tambah bukti pelaksanaan',
          bidang: [
            { nama: 'month', label: 'Bulan', jenis: 'month', nilai: new Date().toISOString().slice(0, 7), wajib: true },
            { nama: 'indicatorId', label: 'Indikator terkait', jenis: 'select', pilihan: [['', 'Umum'], ...data.indicators.map((i) => [i.id, i.name])], nilai: '' },
            { nama: 'description', label: 'Uraian bukti', jenis: 'textarea', wajib: true },
            { nama: 'scan', label: 'Berkas bukti (opsional)', jenis: 'file', accept: 'application/pdf,image/jpeg,image/png', petunjuk: 'PDF, JPG, atau PNG maksimal 5 MB. Disimpan privat.' }
          ],
          labelSimpan: 'Simpan bukti',
          kirim: async (v) => {
            const fileId = v.scan ? await window.HamasahUnggah.kirim({ purpose: 'kpi-evidence', entityId: state.akun.id, berkas: v.scan, headers: headers() }) : undefined;
            return api('POST', '/api/kpi/bukti', { month: v.month, indicatorId: v.indicatorId || undefined, description: v.description, fileId });
          }
        });
        if (hasil) await muat();
      }), statusBukti);
      if (data.evidence.length) {
        const ul = el('ul', 'wali-notes');
        data.evidence.forEach((e) => {
          const li = el('li', 'wali-note is-catatan');
          const meta = el('div', 'wali-note__meta');
          meta.append(el('span', 'wali-note__kind', `${labelBulan(e.month)} · ${e.indicatorName || 'Umum'}`));
          li.append(meta, el('p', 'wali-note__body', e.description));
          if (e.fileId) li.append(tombol('Buka berkas', 'wali-link', () => window.HamasahUnggah.buka(e.fileId, headers()).catch((error) => statusBukti.set(error.message, true))));
          if (e.reviewerComment) li.append(el('p', 'wali-note__reply', `Komentar penilai: ${e.reviewerComment}`));
          ul.append(li);
        });
        bukti.append(ul);
      }

      const kerja = bagian('Pekerjaan tambahan', 'Mengurus santri sakit, pengadaan kebutuhan, pengurusan institusi, atau kegiatan tambahan. Admin memverifikasi sebelum dihitung sebagai bonus.');
      kerja.append(tombol('Catat pekerjaan tambahan', 'button button--primary kg-small', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: 'Pekerjaan tambahan',
          bidang: [
            { nama: 'workDate', label: 'Tanggal', jenis: 'date', nilai: new Date().toISOString().slice(0, 10), wajib: true },
            { nama: 'kind', label: 'Jenis', jenis: 'select', pilihan: data.workKinds.map((k) => [k.id, k.label]), nilai: data.workKinds[0].id },
            { nama: 'description', label: 'Uraian pekerjaan', jenis: 'textarea', wajib: true },
            { nama: 'scan', label: 'Berkas bukti (opsional)', jenis: 'file', accept: 'application/pdf,image/jpeg,image/png' }
          ],
          labelSimpan: 'Catat',
          kirim: async (v) => {
            const fileId = v.scan ? await window.HamasahUnggah.kirim({ purpose: 'kpi-evidence', entityId: state.akun.id, berkas: v.scan, headers: headers() }) : undefined;
            return api('POST', '/api/kpi/pekerjaan-tambahan', { workDate: v.workDate, kind: v.kind, description: v.description, fileId });
          }
        });
        if (hasil) await muat();
      }));
      kerja.append(data.extraWork.length ? tabelStack(['Tanggal', 'Jenis', 'Uraian', 'Status'], data.extraWork.map((k) => [k.workDate, k.kindLabel, k.description, k.statusLabel + (k.verificationNote ? ` (${k.verificationNote})` : '')])) : kosong('Belum ada pekerjaan tambahan yang dicatat.'));

      const bagianAkhir = [ringkas, bulanan, bukti, kerja];
      if (data.rewardsEnabled) {
        const hadiah = bagian('Penghargaan', 'Riwayat penghargaan yang pernah diterima.');
        if (!data.rewards.length) hadiah.append(kosong('Belum ada penghargaan.'));
        else { const ul = el('ul', 'wali-mini-list'); data.rewards.forEach((h) => { const li = el('li'); li.append(el('span', '', `${h.title}${h.reason ? ` · ${h.reason}` : ''}`), el('strong', '', h.awardedOn)); ul.append(li); }); hadiah.append(ul); }
        bagianAkhir.push(hadiah);
      }
      badan.replaceChildren(...bagianAkhir);
    }
    tahun.addEventListener('change', () => muat().catch(() => {}));
    await muat();
    return akar;
  }

  async function render() {
    const kepala = el('header', 'asr-head');
    const teks = el('div', 'asr-head__text');
    teks.append(el('p', 'wali-eyebrow', 'KPI musyrif'), el('h2', 'asr-head__title', admin() ? 'KPI musyrif dan musyrifah' : 'KPI saya'), el('p', 'mus-note', admin() ? 'Nilai kinerja bulanan dari data sistem, dengan bukti dan komentar penilai.' : 'Lihat penilaian kinerjamu, tambahkan bukti, dan catat pekerjaan tambahan.'));
    kepala.append(teks);
    const isi = el('div', 'wali-panel');
    isi.append(kosong('Memuat...'));
    const bagianAwal = [kepala];
    if (admin()) {
      const tab = el('div', 'wali-tabs');
      tab.setAttribute('role', 'tablist');
      TAB_ADMIN.forEach(([id, label]) => {
        const t = el('button', `wali-tab${state.tab === id ? ' is-active' : ''}`, label);
        t.type = 'button';
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', String(state.tab === id));
        t.addEventListener('click', () => { state.tab = id; render().catch(() => {}); });
        tab.append(t);
      });
      bagianAwal.push(tab);
    }
    app.replaceChildren(...bagianAwal, isi);
    try {
      const tampil = admin() ? { penilaian: tabPenilaian, perbandingan: tabPerbandingan, kerja: tabKerja, indikator: tabIndikator, penghargaan: tabPenghargaan }[state.tab] : tampilanMusyrif;
      isi.replaceChildren(await tampil());
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
      renderStaffNav(staffNav, akun.role, 'kpi', akun);
      if (admin()) state.musyrif = (await api('GET', '/api/kpi/musyrif').catch(() => ({ items: [] }))).items || [];
      await render();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses KPI Musyrif belum tersedia';
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
