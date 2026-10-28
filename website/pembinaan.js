// Program dan Batch: lokasi operasional (Mesir, Indonesia), program pembinaan, batch beserta
// pesertanya. Batch BUKAN asrama: batch adalah rombongan peserta dalam satu program pada rentang
// tanggal tertentu, asrama adalah tempat tinggal. Data dari /api/pembinaan (server/program-service.js).
// Semua teks dipasang lewat textContent.
(function initPembinaan() {
  const guard = document.querySelector('#pembinaan-guard');
  const guardCopy = document.querySelector('#pembinaan-guard-copy');
  const konsol = document.querySelector('#pembinaan-console');
  const app = document.querySelector('#pembinaan-app');
  const staffNav = document.querySelector('#staff-nav');
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const LABEL_STATUS = Object.freeze({ direncanakan: 'Direncanakan', berjalan: 'Berjalan', selesai: 'Selesai', dibatalkan: 'Dibatalkan' });
  const AKSI_STATUS = Object.freeze({ berjalan: 'Mulai batch', selesai: 'Selesaikan batch', dibatalkan: 'Batalkan batch' });
  const LABEL_PESERTA = Object.freeze({ aktif: 'Aktif', lulus: 'Lulus', keluar: 'Keluar', pindah: 'Pindah' });
  const KUNCI_LOKASI = 'hamasahPembinaanLokasi';

  let daftar = null;
  let lokasiId = null;
  let laporan = null;
  let batchId = null;
  let detail = null;
  let tabAktif = 'program';
  let kabar = '';
  let akunSaya = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tombol(teks, kelas, aksi) {
    const b = el('button', kelas || 'button button--secondary pb-small', teks);
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
    const response = await fetch(url, {
      method,
      headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const hasil = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(hasil.error || 'Permintaan belum berhasil.');
    return hasil;
  }

  function tanggal(nilai) {
    return nilai ? TANGGAL.format(new Date(`${nilai}T00:00:00Z`)) : '';
  }

  function chip(teks, kelas) {
    return el('span', `rm-chip ${kelas}`, teks);
  }

  function kelasStatus(status) {
    return { direncanakan: 'rm-chip--penuh', berjalan: 'rm-chip--sebagian', selesai: 'rm-chip--kosong', dibatalkan: 'rm-chip--melebihi' }[status] || 'rm-chip--kosong';
  }

  function rentang(b) {
    return b.endsOn ? `${tanggal(b.startsOn)} sampai ${tanggal(b.endsOn)}` : `Mulai ${tanggal(b.startsOn)}, tanggal selesai belum ditentukan`;
  }

  function bagian(judul, keterangan) {
    const wadah = el('section', 'mus-section asr-section');
    const kepala = el('header', 'mus-section__head');
    kepala.append(el('h3', 'mus-title', judul));
    if (keterangan) kepala.append(el('p', 'mus-note', keterangan));
    wadah.append(kepala);
    return wadah;
  }

  function peringatan(teks) {
    return el('p', 'asr-warning', teks);
  }

  // ------------------------------------------------------------------ muat

  async function muatDaftar() {
    daftar = await api('GET', '/api/pembinaan/lokasi');
    if (!daftar.available) return;
    let simpan = null;
    try { simpan = localStorage.getItem(KUNCI_LOKASI); } catch { /* opsional */ }
    const dariAlamat = new URLSearchParams(window.location.search).get('lokasi');
    const pilih = [dariAlamat, lokasiId, simpan].find((id) => id && daftar.locations.some((l) => l.id === id));
    lokasiId = pilih || (daftar.locations[0] && daftar.locations[0].id) || null;
  }

  async function muatLaporan() {
    laporan = lokasiId ? await api('GET', `/api/pembinaan/lokasi/${encodeURIComponent(lokasiId)}`) : null;
  }

  async function muatDetail() {
    detail = batchId ? await api('GET', `/api/pembinaan/batch/${encodeURIComponent(batchId)}`) : null;
  }

  async function segarkan(pesan = '') {
    kabar = pesan;
    await muatDaftar();
    await muatLaporan();
    if (batchId) await muatDetail();
    lukis();
  }

  async function lakukan(fn, pesan) {
    try {
      await fn();
      await segarkan(pesan);
      return true;
    } catch (error) {
      window.alert(error.message);
      return false;
    }
  }

  // ------------------------------------------------------------------ pilihan lokasi

  function kartuLokasi(l) {
    const aktif = l.id === lokasiId;
    const b = el('button', `pb-loc${aktif ? ' is-on' : ''}`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(aktif));
    b.append(el('strong', '', l.name), el('span', 'pb-loc__country', l.country));
    const angka = el('span', 'pb-loc__stats', `${l.dormitories} asrama · ${l.residents} penghuni · ${l.programs} program · ${l.activeBatches} batch berjalan · ${l.participants} peserta aktif`);
    b.append(angka);
    b.addEventListener('click', async () => {
      lokasiId = l.id;
      batchId = null;
      detail = null;
      try { localStorage.setItem(KUNCI_LOKASI, l.id); } catch { /* opsional */ }
      try {
        await muatLaporan();
        lukis();
      } catch (error) {
        window.alert(error.message);
      }
    });
    return b;
  }

  // ------------------------------------------------------------------ dialog

  async function dialogProgram(awal) {
    const hasil = await window.HamasahDialog.formulir({
      judul: awal ? `Ubah program ${awal.name}` : `Tambah program di ${laporan.location.name}`,
      keterangan: laporan.location.country === 'Indonesia'
        ? 'Di Indonesia program umumnya berupa karantina.'
        : 'Di Mesir program umumnya berupa pembinaan dan hunian berkelanjutan.',
      bidang: [
        { nama: 'name', label: 'Nama program', jenis: 'text', nilai: awal ? awal.name : '', wajib: true },
        { nama: 'kind', label: 'Jenis', jenis: 'select', pilihan: [['karantina', 'Karantina'], ['pembinaan', 'Pembinaan']], nilai: awal ? awal.kind : (laporan.location.country === 'Indonesia' ? 'karantina' : 'pembinaan'), wajib: true },
        { nama: 'durationDays', label: 'Lama program (hari, opsional)', jenis: 'number', min: 1, nilai: awal && awal.durationDays ? awal.durationDays : '' },
        { nama: 'description', label: 'Keterangan (opsional)', jenis: 'textarea', nilai: awal ? awal.description : '' },
        ...(awal ? [{ nama: 'active', label: 'Status program', jenis: 'select', pilihan: [['ya', 'Aktif'], ['tidak', 'Tidak aktif']], nilai: awal.active ? 'ya' : 'tidak' }] : [])
      ],
      labelSimpan: awal ? 'Simpan' : 'Tambah program',
      kirim: (nilai) => {
        const isi = { name: nilai.name, kind: nilai.kind, durationDays: nilai.durationDays ? Number(nilai.durationDays) : null, description: nilai.description };
        if (awal) return api('PATCH', `/api/pembinaan/program/${encodeURIComponent(awal.id)}`, { ...isi, active: nilai.active === 'ya' });
        return api('POST', `/api/pembinaan/lokasi/${encodeURIComponent(lokasiId)}/program`, isi);
      }
    });
    if (hasil) await segarkan(awal ? 'Program diperbarui.' : 'Program ditambahkan.');
  }

  async function dialogBatch(program, awal) {
    const hasil = await window.HamasahDialog.formulir({
      judul: awal ? `Ubah ${awal.name}` : `Batch baru di ${program.name}`,
      keterangan: 'Tanggal selesai boleh dikosongkan bila belum pasti; batch yang diselesaikan mengisinya otomatis.',
      bidang: [
        { nama: 'name', label: 'Nama batch', jenis: 'text', nilai: awal ? awal.name : '', wajib: true, petunjuk: 'Contoh: Batch 5, Januari 2027.' },
        { nama: 'startsOn', label: 'Tanggal mulai', jenis: 'date', nilai: awal ? awal.startsOn : '', wajib: true },
        { nama: 'endsOn', label: 'Tanggal selesai (opsional)', jenis: 'date', nilai: awal && awal.endsOn ? awal.endsOn : '' },
        { nama: 'note', label: 'Catatan (opsional)', jenis: 'textarea', nilai: awal ? awal.note : '' }
      ],
      labelSimpan: awal ? 'Simpan' : 'Buat batch',
      kirim: (nilai) => {
        const isi = { name: nilai.name, startsOn: nilai.startsOn, endsOn: nilai.endsOn || null, note: nilai.note };
        if (awal) return api('PATCH', `/api/pembinaan/batch/${encodeURIComponent(awal.id)}`, isi);
        return api('POST', `/api/pembinaan/program/${encodeURIComponent(program.id)}/batch`, isi);
      }
    });
    if (hasil) await segarkan(awal ? 'Batch diperbarui.' : 'Batch dibuat.');
  }

  async function dialogPetugas() {
    const kandidat = (await api('GET', '/api/pembinaan/petugas')).accounts;
    const sudah = new Set(laporan.staff.filter((s) => s.via === 'lokasi').map((s) => s.id));
    const belum = kandidat.filter((a) => !sudah.has(a.id));
    const hasil = await window.HamasahDialog.formulir({
      judul: `Tugaskan petugas ke ${laporan.location.name}`,
      keterangan: 'Petugas hanya mengelola program dan batch di lokasi yang ditugaskan kepadanya.',
      bidang: [{ nama: 'accountId', label: 'Akun', jenis: 'select', pilihan: belum.length ? belum.map((a) => [a.id, `${a.name} (${a.role === 'supervisor' ? 'musyrif' : 'petugas pendaftaran'})`]) : [['', 'Semua akun sudah ditugaskan']], nilai: belum[0] ? belum[0].id : '', wajib: true }],
      labelSimpan: 'Tugaskan',
      kirim: (nilai) => api('PUT', `/api/pembinaan/lokasi/${encodeURIComponent(lokasiId)}/petugas`, { accountId: nilai.accountId, assigned: true })
    });
    if (hasil) await segarkan('Petugas ditugaskan.');
  }

  // ------------------------------------------------------------------ tampilan lokasi

  function panelProgram() {
    const wadah = bagian('Program dan batch', 'Program adalah jenis pembinaannya; batch adalah rombongan pesertanya pada rentang tanggal tertentu.');
    wadah.append(tombol('Tambah program', 'button button--primary pb-small', () => dialogProgram(null).catch((e) => window.alert(e.message))));
    if (!laporan.programs.length) wadah.append(el('p', 'asr-empty', 'Belum ada program di lokasi ini.'));
    laporan.programs.forEach((p) => {
      const kartu = el('article', `pb-program${p.active ? '' : ' is-off'}`);
      const atas = el('div', 'rm-room__top');
      atas.append(el('h4', 'rm-room__name', p.name), chip(p.kindLabel, p.kind === 'karantina' ? 'rm-chip--penuh' : 'rm-chip--ac'));
      if (!p.active) atas.append(chip('Tidak aktif', 'rm-chip--kosong'));
      kartu.append(atas);
      const meta = [p.durationDays ? `${p.durationDays} hari` : '', p.description].filter(Boolean).join(' · ');
      if (meta) kartu.append(el('p', 'rm-room__meta', meta));
      const aksi = el('div', 'rm-room__actions');
      aksi.append(tombol('Ubah program', 'button button--secondary pb-small', () => dialogProgram(p).catch((e) => window.alert(e.message))));
      if (p.active) aksi.append(tombol('Batch baru', 'button button--secondary pb-small', () => dialogBatch(p, null).catch((e) => window.alert(e.message))));
      kartu.append(aksi);
      if (p.batches.length) {
        const ul = el('ul', 'pb-batches');
        p.batches.forEach((b) => {
          const li = el('li');
          const kiri = el('div', 'pb-batch__main');
          const judul = el('div', 'pb-batch__title');
          judul.append(el('strong', '', b.name), chip(LABEL_STATUS[b.status], kelasStatus(b.status)));
          kiri.append(judul, el('p', 'rm-room__meta', `${rentang(b)} · ${b.activeParticipants} peserta aktif dari ${b.participants}`));
          li.append(kiri, tombol('Buka batch', 'button button--secondary pb-small', async () => {
            batchId = b.id;
            try {
              await muatDetail();
              lukis();
            } catch (error) {
              batchId = null;
              window.alert(error.message);
            }
          }));
          ul.append(li);
        });
        kartu.append(ul);
      } else {
        kartu.append(el('p', 'rm-room__meta', 'Belum ada batch.'));
      }
      wadah.append(kartu);
    });
    return wadah;
  }

  function panelAsrama() {
    const wadah = bagian('Asrama dan petugas', 'Asrama di lokasi ini. Asrama dan batch dikelola terpisah: penghuni asrama belum tentu peserta batch, dan sebaliknya.');
    const grid = el('div', 'rm-grid');
    if (!laporan.dormitories.length) grid.append(el('p', 'asr-empty', 'Belum ada asrama di lokasi ini.'));
    laporan.dormitories.forEach((d) => {
      const kartu = el('article', 'rm-room is-sebagian');
      kartu.append(el('h4', 'rm-room__name', d.name));
      kartu.append(el('p', 'rm-room__count', `${d.residents} penghuni${d.capacity ? ` dari kapasitas ${d.capacity}` : ''}`));
      kartu.append(el('p', 'rm-room__meta', [d.area, d.gender, d.supervisors.length ? `Musyrif: ${d.supervisors.join(', ')}` : 'Belum ada musyrif'].filter(Boolean).join(' · ')));
      const tautan = el('a', 'rm-linkbtn', 'Kelola asrama');
      tautan.href = `asrama?asrama=${encodeURIComponent(d.id)}`;
      kartu.append(tautan);
      grid.append(kartu);
    });
    wadah.append(grid);
    const petugas = bagian('Petugas lokasi', 'Musyrif asrama di lokasi ini otomatis menangani lokasinya. Petugas lain ditugaskan admin.');
    if (laporan.canAssignStaff) petugas.append(tombol('Tugaskan petugas', 'button button--secondary pb-small', () => dialogPetugas().catch((e) => window.alert(e.message))));
    const ul = el('ul', 'rm-people');
    if (!laporan.staff.length) ul.append(el('li', '', 'Belum ada petugas.'));
    laporan.staff.forEach((s) => {
      const li = el('li');
      li.append(el('span', '', `${s.name} · ${s.role === 'supervisor' ? 'Musyrif' : 'Petugas pendaftaran'} · ${s.via === 'lokasi' ? 'ditugaskan ke lokasi' : 'memegang asrama di lokasi ini'}`));
      if (laporan.canAssignStaff && s.via === 'lokasi') {
        li.append(tombol('Cabut tugas', 'button button--secondary pb-small', async () => {
          if (!window.confirm(`Cabut tugas ${s.name} dari ${laporan.location.name}?`)) return;
          await lakukan(() => api('PUT', `/api/pembinaan/lokasi/${encodeURIComponent(lokasiId)}/petugas`, { accountId: s.id, assigned: false }), 'Tugas dicabut.');
        }));
      }
      ul.append(li);
    });
    petugas.append(ul);
    const gabung = el('div');
    gabung.append(wadah, petugas);
    return gabung;
  }

  function panelRingkasan() {
    const wadah = bagian(`Laporan ${laporan.location.name}`, 'Angka di bawah hanya untuk lokasi ini.');
    const s = laporan.summary;
    const ringkas = el('dl', 'rm-summary');
    [
      ['Asrama', s.dormitories], ['Penghuni asrama', s.residents], ['Petugas', s.staff], ['Program aktif', s.programs],
      ['Batch direncanakan', s.plannedBatches], ['Batch berjalan', s.activeBatches], ['Batch selesai', s.finishedBatches],
      ['Peserta aktif', s.activeParticipants], ['Peserta tanpa asrama', s.participantsWithoutDormitory]
    ].forEach(([label, nilai]) => {
      const d = el('div');
      d.append(el('dt', '', label), el('dd', '', String(nilai)));
      ringkas.append(d);
    });
    wadah.append(ringkas);
    wadah.append(el('p', 'mus-note', 'Peserta tanpa asrama adalah peserta batch yang belum ditempatkan di asrama mana pun, misalnya peserta karantina di Indonesia sebelum masuk asrama di Mesir.'));
    return wadah;
  }

  function tampilanLokasi() {
    const isi = [];
    const kartu = el('div', 'pb-locs');
    daftar.locations.forEach((l) => kartu.append(kartuLokasi(l)));
    isi.push(kartu);
    if (!laporan) return isi;
    const tab = el('div', 'mus-tabs asr-tabs');
    tab.setAttribute('role', 'tablist');
    [['program', 'Program dan batch'], ['asrama', 'Asrama dan petugas'], ['ringkasan', 'Laporan']].forEach(([kunci, label]) => {
      const b = tombol(label, `mus-tab ${kunci === tabAktif ? 'is-active' : ''}`.trim(), () => { tabAktif = kunci; lukis(); });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(kunci === tabAktif));
      tab.append(b);
    });
    isi.push(tab);
    if (kabar) {
      const p = el('p', 'mus-status is-ok asr-flash', kabar);
      p.setAttribute('role', 'status');
      isi.push(p);
      kabar = '';
    }
    const panel = el('div', 'asr-panel');
    panel.append(tabAktif === 'asrama' ? panelAsrama() : tabAktif === 'ringkasan' ? panelRingkasan() : panelProgram());
    isi.push(panel);
    return isi;
  }

  // ------------------------------------------------------------------ tampilan batch

  function daftarCalon(wadahCalon) {
    const kotak = bagian('Tambah peserta', 'Peserta bisa santri yang belum berasrama atau yang tinggal di lokasi ini. Batch tidak mengubah asrama santri.');
    if (!detail.candidates.length) {
      kotak.append(el('p', 'asr-empty', 'Tidak ada santri yang bisa ditambahkan.'));
      return kotak;
    }
    const cari = el('input', 'mus-input pb-search');
    cari.type = 'search';
    cari.placeholder = 'Cari nama santri';
    cari.setAttribute('aria-label', 'Cari santri');
    const ul = el('ul', 'pb-candidates');
    const kotakCentang = detail.candidates.map((s) => {
      const li = el('li');
      const label = el('label');
      const cek = el('input');
      cek.type = 'checkbox';
      cek.value = s.id;
      label.append(cek, document.createTextNode(` ${s.name}`), el('span', 'rm-room__meta', s.dormitory ? ` · ${s.dormitory}` : ' · belum berasrama'));
      li.append(label);
      ul.append(li);
      return { li, cek, nama: s.name.toLowerCase() };
    });
    cari.addEventListener('input', () => {
      const kata = cari.value.trim().toLowerCase();
      kotakCentang.forEach((k) => { k.li.hidden = Boolean(kata) && !k.nama.includes(kata); });
    });
    const tambah = tombol('Tambahkan yang dipilih', 'button button--primary pb-small', async () => {
      const ids = kotakCentang.filter((k) => k.cek.checked).map((k) => k.cek.value);
      if (!ids.length) { window.alert('Pilih minimal satu santri.'); return; }
      await lakukan(() => api('POST', `/api/pembinaan/batch/${encodeURIComponent(batchId)}/peserta`, { studentIds: ids }), `${ids.length} peserta ditambahkan.`);
    });
    kotak.append(cari, ul, tambah);
    wadahCalon.append(kotak);
    return kotak;
  }

  function tampilanBatch() {
    const b = detail.batch;
    const isi = [];
    const kembali = tombol('← Kembali ke lokasi', 'button button--secondary pb-small', () => { batchId = null; detail = null; lukis(); });
    isi.push(kembali);
    const kepala = bagian(`${detail.program.name}, ${b.name}`, `${detail.location.name} · ${detail.program.kindLabel}`);
    const info = el('div', 'rm-room__top');
    info.append(chip(LABEL_STATUS[b.status], kelasStatus(b.status)), el('span', 'rm-room__meta', rentang(b)));
    kepala.append(info);
    if (b.note) kepala.append(el('p', 'rm-room__meta', b.note));
    const aksi = el('div', 'rm-room__actions');
    if (!['selesai', 'dibatalkan'].includes(b.status)) aksi.append(tombol('Ubah data batch', 'button button--secondary pb-small', () => dialogBatch(detail.program, b).catch((e) => window.alert(e.message))));
    b.nextStatuses.forEach((status) => {
      aksi.append(tombol(AKSI_STATUS[status], status === 'dibatalkan' ? 'button button--secondary pb-small' : 'button button--primary pb-small', async () => {
        const peringatanSelesai = status === 'selesai' ? 'Peserta yang masih aktif akan ditandai lulus. ' : status === 'dibatalkan' ? 'Peserta yang masih aktif akan ditandai keluar. ' : '';
        const ditutup = status !== 'berjalan' ? 'Batch yang ditutup tidak bisa dibuka lagi.' : '';
        if (!window.confirm(`${AKSI_STATUS[status]}? ${peringatanSelesai}${ditutup}`.trim())) return;
        await lakukan(() => api('PATCH', `/api/pembinaan/batch/${encodeURIComponent(batchId)}`, { status }), `Batch ${LABEL_STATUS[status].toLowerCase()}.`);
      }));
    });
    kepala.append(aksi);
    isi.push(kepala);
    if (kabar) {
      const p = el('p', 'mus-status is-ok asr-flash', kabar);
      p.setAttribute('role', 'status');
      isi.push(p);
      kabar = '';
    }

    const peserta = bagian(`Peserta (${detail.participants.length})`, 'Riwayat peserta tidak dihapus; yang berubah hanya statusnya.');
    if (!detail.participants.length) peserta.append(el('p', 'asr-empty', 'Belum ada peserta.'));
    const ul = el('ul', 'rm-people');
    detail.participants.forEach((p) => {
      const li = el('li');
      const nama = el('span', '', p.name);
      nama.append(el('span', 'rm-room__meta', ` · ${p.dormitory ? p.dormitory : 'belum berasrama'} · masuk ${tanggal(p.joinedOn)}${p.leftOn ? ` · selesai ${tanggal(p.leftOn)}` : ''}${p.note ? ` · ${p.note}` : ''}`));
      li.append(nama);
      const kanan = el('span', 'pb-peserta__side');
      kanan.append(chip(LABEL_PESERTA[p.status], p.status === 'aktif' ? 'rm-chip--sebagian' : 'rm-chip--kosong'));
      const pilih = el('select', 'pb-peserta__select');
      pilih.setAttribute('aria-label', `Status ${p.name}`);
      Object.entries(LABEL_PESERTA).forEach(([nilai, label]) => pilih.add(new Option(label, nilai)));
      pilih.value = p.status;
      pilih.addEventListener('change', async () => {
        const catatan = pilih.value === 'aktif' ? undefined : (window.prompt(`Catatan untuk ${p.name} (opsional):`, p.note) ?? p.note);
        const ok = await lakukan(() => api('PATCH', `/api/pembinaan/batch/${encodeURIComponent(batchId)}/peserta/${encodeURIComponent(p.studentId)}`, { status: pilih.value, note: catatan }), `${p.name}: ${LABEL_PESERTA[pilih.value].toLowerCase()}.`);
        if (!ok) pilih.value = p.status;
      });
      kanan.append(pilih);
      li.append(kanan);
      ul.append(li);
    });
    peserta.append(ul);
    isi.push(peserta);
    const wadahCalon = el('div');
    if (['direncanakan', 'berjalan'].includes(b.status)) daftarCalon(wadahCalon);
    isi.push(wadahCalon);
    return isi;
  }

  // ------------------------------------------------------------------ gambar

  function lukis() {
    const isi = [];
    const kepala = el('header', 'asr-head');
    const judul = el('div', 'asr-head__text');
    judul.append(el('p', 'wali-eyebrow', 'Program dan Batch'), el('h2', 'asr-head__title', 'Lokasi, program, dan batch'));
    judul.append(el('p', 'mus-note', 'Batch bukan asrama: batch adalah rombongan peserta dalam satu program, asrama adalah tempat tinggal. Santri bisa mengikuti batch di Indonesia lebih dulu, lalu masuk asrama di Mesir; riwayatnya tetap melekat pada santri.'));
    kepala.append(judul);
    isi.push(kepala);
    if (!daftar.available) {
      isi.push(peringatan('Program dan batch menunggu pembaruan database (migrasi 060). Admin dapat menerapkannya di halaman Pengaturan, bagian Pembaruan database.'));
    } else if (!daftar.locations.length) {
      isi.push(peringatan(akunSaya && akunSaya.role === 'admin' ? 'Belum ada lokasi.' : 'Anda belum ditugaskan ke lokasi mana pun. Minta admin menugaskan Anda ke lokasi (Mesir atau Indonesia).'));
    } else {
      isi.push(...(batchId && detail ? tampilanBatch() : tampilanLokasi()));
    }
    app.replaceChildren(...isi);
  }

  (async function mulai() {
    if (session()) document.body.classList.add('in-crm');
    try {
      const me = await window.hamasahMintaAkun(headers());
      akunSaya = me.body && me.body.account;
      if (!me.ok || !akunSaya || !['admin', 'supervisor', 'registration-officer'].includes(akunSaya.role)) throw new Error('Halaman ini untuk admin, musyrif, dan petugas lokasi.');
      guard.hidden = true;
      konsol.hidden = false;
      document.body.classList.add('in-crm');
      renderStaffNav(staffNav, akunSaya.role, 'pembinaan', akunSaya);
      const muatData = () => segarkan().catch((e) => { app.replaceChildren(el('p', 'asr-warning', e.message)); });
      window.hamasahSaatDataSegar(muatData);
      await muatData();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Program dan Batch belum tersedia';
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
