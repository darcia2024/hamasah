// Surat dan Arsip (admin, petugas pendaftaran, musyrif): surat masuk dan keluar, verifikasi, persetujuan, arsip PDF, dan daftar
// periksa keluar santri. API: /api/surat/*. Semua teks lewat textContent; tanpa gaya sebaris (CSP).
(function initSurat() {
  const guard = document.querySelector('#surat-guard');
  const guardCopy = document.querySelector('#surat-guard-copy');
  const konsol = document.querySelector('#surat-console');
  const app = document.querySelector('#surat-app');
  const staffNav = document.querySelector('#staff-nav');
  const WAKTU = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const AKSI = { dibuat: 'Dicatat', verifikasi: 'Diverifikasi', persetujuan: 'Disetujui', penolakan: 'Ditolak', 'daftar-keluar': 'Daftar periksa keluar', keluar: 'Santri dinyatakan keluar' };
  const state = { akun: null, tab: 'surat', jenis: null, santri: [], filter: { status: '', typeId: '', q: '' }, terbuka: null };

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

  function kolom(label, kontrol) {
    const b = el('div', 'wali-form__row');
    const l = el('label', 'wali-field__label', label);
    kontrol.id = `sr-${Math.random().toString(36).slice(2, 8)}`;
    l.htmlFor = kontrol.id;
    b.append(l, kontrol);
    return b;
  }

  function pilihan(opsi, nilai) {
    const s = el('select', 'wali-field');
    opsi.forEach(([v, t]) => s.append(new Option(t, v)));
    if (nilai !== undefined) s.value = nilai;
    return s;
  }

  // ------------------------------------------------------------------ daftar surat

  async function tabSurat() {
    const akar = el('div', 'kg-stack');
    const jenis = state.jenis;
    const ringkas = bagian('Surat masuk dan keluar', 'Catat surat, verifikasi, minta persetujuan admin, lalu unduh arsip PDF-nya.');
    if (jenis.unconfirmed) {
      ringkas.append(el('p', 'kg-warning', `Daftar jenis surat belum dikonfirmasi dari template asli (${jenis.unconfirmed} jenis masih bawaan). Surat tetap bisa dicatat; admin mengonfirmasi daftarnya di tab Jenis surat.`));
    }
    const bar = el('div', 'kg-bar');
    const status = pilihan([['', 'Semua status'], ['diajukan', 'Diajukan'], ['diverifikasi', 'Diverifikasi'], ['disetujui', 'Disetujui'], ['ditolak', 'Ditolak']], state.filter.status);
    const tipe = pilihan([['', 'Semua jenis'], ...jenis.items.map((j) => [j.id, j.name])], state.filter.typeId);
    const cari = el('input', 'wali-field');
    cari.type = 'search';
    cari.placeholder = 'Nama santri, perihal, atau nomor';
    cari.value = state.filter.q;
    bar.append(kolom('Status', status), kolom('Jenis', tipe), kolom('Cari', cari), tombol('Surat baru', 'button button--primary kg-small', () => suratBaru().catch(() => {})));
    const pesan = pesanStatus();
    const daftar = el('div');
    const rincian = el('div');
    ringkas.append(bar, pesan, daftar);
    akar.append(ringkas, rincian);

    async function muat() {
      state.filter = { status: status.value, typeId: tipe.value, q: cari.value.trim() };
      pesan.set('Memuat...');
      try {
        const params = new URLSearchParams();
        Object.entries(state.filter).forEach(([k, v]) => { if (v) params.set(k, v); });
        const data = await api('GET', `/api/surat?${params}&t=${Date.now()}`);
        if (data.available === false) { pesan.set('Database belum diperbarui untuk surat dan arsip. Terapkan pembaruan database di halaman Pengaturan.', true); daftar.replaceChildren(); return; }
        pesan.set(data.items.length ? `${data.items.length} surat.` : 'Belum ada surat yang cocok.');
        if (!data.items.length) { daftar.replaceChildren(); return; }
        const tabel = el('table', 'kg-table kg-table--stack');
        const kepala = el('tr');
        ['Nomor', 'Jenis', 'Santri', 'Perihal', 'Status', ''].forEach((t) => kepala.append(el('th', '', t)));
        tabel.append(kepala);
        data.items.forEach((s) => {
          const tr = el('tr');
          const sel = (v, label) => { const c = el('td', '', v); c.dataset.label = label; return c; };
          const aksi = el('td');
          aksi.append(tombol('Buka', 'button button--secondary kg-small', () => { state.terbuka = s.id; bukaSurat(s.id, rincian, muat).catch(() => {}); }));
          tr.append(sel(s.referenceNo, 'Nomor'), sel(s.typeName, 'Jenis'), sel(s.studentName, 'Santri'), sel(s.subject, 'Perihal'), sel(s.statusLabel, 'Status'), aksi);
          tabel.append(tr);
        });
        const bungkus = el('div', 'kg-scroll');
        bungkus.append(tabel);
        daftar.replaceChildren(bungkus);
      } catch (error) { pesan.set(error.message, true); }
    }
    status.addEventListener('change', () => muat().catch(() => {}));
    tipe.addEventListener('change', () => muat().catch(() => {}));
    cari.addEventListener('change', () => muat().catch(() => {}));

    async function suratBaru() {
      const aktif = jenis.items.filter((j) => j.active);
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Catat surat',
        keterangan: 'Pilih jenis surat dan santri yang bersangkutan. Pindaian surat bertanda tangan bersifat privat dan dapat dilampirkan sekarang.',
        bidang: [
          { nama: 'typeId', label: 'Jenis surat', jenis: 'select', pilihan: aktif.map((j) => [j.id, `${j.name} (${j.directionLabel.toLowerCase()})`]), nilai: aktif[0] && aktif[0].id, wajib: true },
          { nama: 'studentId', label: 'Santri', jenis: 'select', pilihan: state.santri.map((s) => [s.id, `${s.name}${s.dormitoryName ? ` · ${s.dormitoryName}` : ''}`]), nilai: state.santri[0] && state.santri[0].id, wajib: true },
          { nama: 'subject', label: 'Perihal', wajib: true, nilai: '' },
          { nama: 'letterDate', label: 'Tanggal surat', jenis: 'date', nilai: new Date().toISOString().slice(0, 10), wajib: true },
          { nama: 'notes', label: 'Catatan (opsional)', jenis: 'textarea', nilai: '' },
          { nama: 'scan', label: 'Pindaian surat (opsional)', jenis: 'file', accept: 'application/pdf,image/jpeg,image/png', petunjuk: 'PDF, JPG, atau PNG maksimal 8 MB.' }
        ],
        labelSimpan: 'Catat surat',
        kirim: async (nilai) => {
          const fileId = nilai.scan ? await window.HamasahUnggah.kirim({ purpose: 'letter-scan', entityId: nilai.studentId, berkas: nilai.scan, headers: headers() }) : undefined;
          return api('POST', '/api/surat', { typeId: nilai.typeId, studentId: nilai.studentId, subject: nilai.subject, letterDate: nilai.letterDate, notes: nilai.notes, fileId });
        }
      });
      if (hasil) { state.terbuka = hasil.id; await muat(); await bukaSurat(hasil.id, rincian, muat); }
    }

    await muat();
    if (state.terbuka) bukaSurat(state.terbuka, rincian, muat).catch(() => {});
    return akar;
  }

  async function bukaSurat(id, wadah, muatDaftar) {
    wadah.replaceChildren(kosong('Memuat surat...'));
    const data = await api('GET', `/api/surat/${encodeURIComponent(id)}?t=${Date.now()}`);
    const s = data.letter;
    const b = bagian(`${s.referenceNo} · ${s.typeName}`, `${s.studentName}${s.dormitoryName ? ` (${s.dormitoryName})` : ''} · ${s.directionLabel} · ${s.letterDate}`);
    const pesan = pesanStatus();
    const segarkan = async () => { await muatDaftar(); await bukaSurat(id, wadah, muatDaftar); };
    const jalankan = async (fn) => { try { await fn(); await segarkan(); } catch (error) { pesan.set(error.message, true); } };

    b.append(el('p', 'kg-score', s.subject), el('span', `kg-chip is-${s.status === 'disetujui' ? 'terlaksana' : s.status === 'ditolak' ? 'dibatalkan' : 'terjadwal'}`, s.statusLabel));
    if (s.notes) b.append(el('p', 'wali-note-text', s.notes));
    const aksi = el('div', 'kg-bar');
    if (s.fileId) aksi.append(tombol('Buka pindaian', 'button button--secondary kg-small', () => window.HamasahUnggah.buka(s.fileId, headers()).catch((error) => pesan.set(error.message, true))));
    if (data.can.verify) aksi.append(tombol('Verifikasi', 'button button--primary kg-small', async () => {
      const hasil = await window.HamasahDialog.formulir({ judul: 'Verifikasi surat', keterangan: 'Pastikan data dan tanda tangan pada surat sudah lengkap.', bidang: [{ nama: 'note', label: 'Catatan verifikasi (opsional)', jenis: 'textarea', nilai: '' }], labelSimpan: 'Verifikasi', kirim: (v) => api('POST', `/api/surat/${encodeURIComponent(id)}/verifikasi`, v) });
      if (hasil) await segarkan();
    }));
    if (data.can.decide && admin()) {
      const putusan = (keputusan) => async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: keputusan === 'disetujui' ? 'Setujui surat' : 'Tolak surat',
          keterangan: keputusan === 'disetujui' ? 'Surat harus sudah diverifikasi.' : 'Tulis alasan penolakan.',
          bidang: [{ nama: 'note', label: keputusan === 'disetujui' ? 'Catatan (opsional)' : 'Alasan penolakan', jenis: 'textarea', nilai: '', wajib: keputusan === 'ditolak' }],
          labelSimpan: keputusan === 'disetujui' ? 'Setujui' : 'Tolak',
          kirim: (v) => api('POST', `/api/surat/${encodeURIComponent(id)}/putusan`, { decision: keputusan, note: v.note })
        });
        if (hasil) await segarkan();
      };
      aksi.append(tombol('Setujui', 'button button--primary kg-small', putusan('disetujui')), tombol('Tolak', 'button button--secondary kg-small', putusan('ditolak')));
    }
    if (data.can.archive) {
      aksi.append(tombol('Unduh arsip PDF', 'button button--secondary kg-small', async () => {
        try {
          const respons = await fetch(`/api/surat/${encodeURIComponent(id)}/arsip.pdf`, { headers: headers() });
          if (!respons.ok) throw new Error((await respons.json().catch(() => ({}))).error || 'Arsip belum dapat dibuat.');
          const url = URL.createObjectURL(await respons.blob());
          const a = document.createElement('a');
          a.href = url;
          a.download = `arsip-${s.referenceNo.replace(/[^\w.-]+/g, '-')}.pdf`;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { pesan.set(error.message, true); }
      }));
    }
    b.append(aksi, pesan);

    if (data.exitChecklist) {
      const dk = data.exitChecklist;
      b.append(el('h4', 'wali-subtitle', 'Daftar periksa keluar'));
      b.append(el('p', 'wali-field__hint', 'Semua butir harus beres atau tidak berlaku sebelum admin menyatakan santri keluar.'));
      const ul = el('ul', 'wali-notes');
      dk.items.forEach((butir) => {
        const li = el('li', `wali-note is-${butir.status === 'beres' ? 'baik' : butir.status === 'bermasalah' ? 'perlu' : 'catatan'}`);
        const meta = el('div', 'wali-note__meta');
        meta.append(el('span', 'wali-note__kind', butir.label), el('span', '', butir.statusLabel));
        li.append(meta);
        if (butir.hint) li.append(el('p', 'wali-field__hint', butir.hint));
        if (butir.note) li.append(el('p', 'wali-note__body', butir.note));
        if (!s.exitCompletedAt && s.status !== 'ditolak') {
          li.append(tombol('Perbarui butir', 'wali-link', async () => {
            const hasil = await window.HamasahDialog.formulir({
              judul: butir.label,
              keterangan: butir.hint || '',
              bidang: [
                { nama: 'status', label: 'Status', jenis: 'select', pilihan: dk.statuses.map((x) => [x.id, x.label]), nilai: butir.status },
                { nama: 'note', label: 'Catatan (wajib bila bermasalah atau tidak berlaku)', jenis: 'textarea', nilai: butir.note || '' }
              ],
              labelSimpan: 'Simpan',
              kirim: (v) => api('PATCH', `/api/surat/${encodeURIComponent(id)}/daftar-keluar/${encodeURIComponent(butir.kind)}`, v)
            });
            if (hasil) await segarkan();
          }));
        }
        ul.append(li);
      });
      b.append(ul);
      if (s.exitCompletedAt) b.append(el('p', 'kg-ok', `Santri dinyatakan keluar ${WAKTU.format(new Date(s.exitCompletedAt))}${s.exitCompletedBy ? ` oleh ${s.exitCompletedBy}` : ''}.`));
      else if (dk.canFinalize) {
        b.append(tombol('Nyatakan santri keluar', 'button button--primary kg-small', async () => {
          const hasil = await window.HamasahDialog.formulir({
            judul: 'Nyatakan santri keluar',
            keterangan: `${s.studentName} akan berstatus mengundurkan diri dan kamarnya dilepas. Tindakan ini tercatat di riwayat status.`,
            bidang: [{ nama: 'reason', label: 'Alasan (masuk riwayat status)', jenis: 'textarea', nilai: '' }],
            labelSimpan: 'Nyatakan keluar',
            kirim: (v) => api('POST', `/api/surat/${encodeURIComponent(id)}/proses-keluar`, v)
          });
          if (hasil) await segarkan();
        }));
      }
    }

    b.append(el('h4', 'wali-subtitle', 'Jejak proses'));
    const jejak = el('ul', 'wali-mini-list');
    data.events.forEach((e) => { const li = el('li'); li.append(el('span', '', `${AKSI[e.action] || e.action}${e.note ? ` · ${e.note}` : ''}`), el('strong', '', `${e.by || 'Sistem'} · ${WAKTU.format(new Date(e.at))}`)); jejak.append(li); });
    b.append(jejak);
    wadah.replaceChildren(b);
    wadah.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ------------------------------------------------------------------ jenis surat

  async function tabJenis() {
    const akar = el('div', 'kg-stack');
    const j = state.jenis;
    const b = bagian('Jenis surat', admin() ? 'Rapat menyebut empat jenis surat, tetapi daftar finalnya perlu dicocokkan dengan template asli. Ubah, tambah, lalu konfirmasi bila sudah sesuai.' : 'Hanya admin yang mengubah daftar ini.');
    if (j.unconfirmed) b.append(el('p', 'kg-warning', `${j.unconfirmed} jenis surat masih bawaan dan belum dikonfirmasi dari template asli.`));
    else b.append(el('p', 'kg-ok', 'Daftar jenis surat sudah dikonfirmasi.'));
    const pesan = pesanStatus();
    const ul = el('ul', 'wali-mini-list');
    j.items.forEach((x) => {
      const li = el('li');
      li.append(el('span', '', `${x.name} · ${x.directionLabel}${x.exitFlow ? ' · dengan daftar periksa keluar' : ''}${x.active ? '' : ' (nonaktif)'}${x.confirmed ? '' : ' · belum dikonfirmasi'}`));
      if (admin()) {
        const aksi = el('span');
        aksi.append(tombol('Ubah', 'wali-link', async () => {
          const hasil = await window.HamasahDialog.formulir({
            judul: 'Ubah jenis surat',
            bidang: [
              { nama: 'name', label: 'Nama jenis surat', nilai: x.name, wajib: true },
              { nama: 'direction', label: 'Arah', jenis: 'select', pilihan: [['masuk', 'Surat masuk'], ['keluar', 'Surat keluar']], nilai: x.direction },
              { nama: 'exitFlow', label: 'Dengan daftar periksa keluar', jenis: 'select', pilihan: [['false', 'Tidak'], ['true', 'Ya']], nilai: String(x.exitFlow) },
              { nama: 'active', label: 'Status', jenis: 'select', pilihan: [['true', 'Aktif'], ['false', 'Nonaktif']], nilai: String(x.active) }
            ],
            labelSimpan: 'Simpan',
            kirim: (v) => api('PATCH', `/api/surat/jenis/${encodeURIComponent(x.id)}`, { name: v.name, direction: v.direction, exitFlow: v.exitFlow === 'true', active: v.active === 'true' })
          });
          if (hasil) { await muatJenis(); render().catch(() => {}); }
        }));
        li.append(aksi);
      }
      ul.append(li);
    });
    b.append(ul, pesan);
    if (admin()) {
      const bar = el('div', 'kg-bar');
      bar.append(tombol('Tambah jenis surat', 'button button--primary kg-small', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: 'Jenis surat baru',
          bidang: [
            { nama: 'name', label: 'Nama jenis surat', wajib: true, nilai: '' },
            { nama: 'direction', label: 'Arah', jenis: 'select', pilihan: [['masuk', 'Surat masuk'], ['keluar', 'Surat keluar']], nilai: 'masuk' }
          ],
          labelSimpan: 'Tambah',
          kirim: (v) => api('POST', '/api/surat/jenis', v)
        });
        if (hasil) { await muatJenis(); render().catch(() => {}); }
      }));
      if (j.unconfirmed) bar.append(tombol('Konfirmasi daftar sudah sesuai template', 'button button--secondary kg-small', async () => { try { await api('POST', '/api/surat/jenis/konfirmasi'); await muatJenis(); render().catch(() => {}); } catch (error) { pesan.set(error.message, true); } }));
      b.append(bar);
    }
    akar.append(b);
    return akar;
  }

  async function muatJenis() {
    state.jenis = await api('GET', `/api/surat/jenis?t=${Date.now()}`);
  }

  async function render() {
    const kepala = el('header', 'asr-head');
    const teks = el('div', 'asr-head__text');
    teks.append(el('p', 'wali-eyebrow', 'Surat dan arsip'), el('h2', 'asr-head__title', 'Surat masuk, surat keluar, dan arsip'), el('p', 'mus-note', 'Simpan surat penting santri dan wali, lengkap dengan verifikasi, persetujuan, dan arsip PDF.'));
    kepala.append(teks);
    const tab = el('div', 'wali-tabs');
    tab.setAttribute('role', 'tablist');
    [['surat', 'Surat'], ['jenis', 'Jenis surat']].forEach(([id, label]) => {
      const t = el('button', `wali-tab${state.tab === id ? ' is-active' : ''}`, label);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(state.tab === id));
      t.addEventListener('click', () => { state.tab = id; render().catch(() => {}); });
      tab.append(t);
    });
    const isi = el('div', 'wali-panel');
    isi.append(kosong('Memuat...'));
    app.replaceChildren(kepala, tab, isi);
    try {
      isi.replaceChildren(await (state.tab === 'jenis' ? tabJenis() : tabSurat()));
    } catch (error) {
      isi.replaceChildren(kosong(error.message || 'Halaman belum dapat dimuat.'));
    }
  }

  (async function mulai() {
    if (session()) document.body.classList.add('in-crm');
    try {
      const me = await window.hamasahMintaAkun(headers());
      const akun = me.body && me.body.account;
      if (!me.ok || !akun || !['admin', 'registration-officer', 'supervisor'].includes(akun.role)) throw new Error('Halaman ini untuk admin, petugas pendaftaran, dan musyrif.');
      state.akun = akun;
      guard.hidden = true;
      konsol.hidden = false;
      document.body.classList.add('in-crm');
      renderStaffNav(staffNav, akun.role, 'surat', akun);
      await muatJenis();
      state.santri = (await api('GET', '/api/surat/santri').catch(() => ({ items: [] }))).items || [];
      await render();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Surat dan Arsip belum tersedia';
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
