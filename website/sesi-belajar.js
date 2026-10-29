// Program LMS dan sesi belajar bersama. Admin, pengajar, musyrif.
// Tab "Maddah per program": pengelompokan program/jenjang dan hak akses otomatis. Tab "Sesi belajar bersama":
// musyrif membuat sesi untuk asramanya dan mencatat kehadiran. API: /api/lms/katalog, /api/courses/:id/cakupan|sesi, /api/lms/sesi.
(function initSesiBelajar() {
  const guard = document.querySelector('#sb-guard');
  const guardCopy = document.querySelector('#sb-guard-copy');
  const konsol = document.querySelector('#sb-console');
  const app = document.querySelector('#sb-app');
  const staffNav = document.querySelector('#staff-nav');
  const state = { akun: null, tab: 'katalog', katalog: null, asrama: [] };

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

  const role = () => state.akun && state.akun.role;
  const kosong = (teks) => el('p', 'wali-empty', teks);
  const hariIni = () => new Date().toISOString().slice(0, 10);

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

  async function muatKatalog() {
    state.katalog = await api('GET', `/api/lms/katalog?t=${Date.now()}`);
    return state.katalog;
  }

  const semuaMaddah = () => (state.katalog ? state.katalog.groups.flatMap((g) => g.courses) : []);

  // ------------------------------------------------------------------ maddah per program

  async function tabKatalog() {
    const akar = el('div', 'kg-stack');
    const k = await muatKatalog();
    const status = pesanStatus();
    const b = bagian('Maddah per program dan jenjang', 'Kelompokkan maddah per program dan jenjang. Dengan akses otomatis, peserta batch aktif program itu langsung bisa membuka maddahnya, dan aksesnya dicabut saat mereka keluar dari program. Pendaftaran manual tidak pernah dicabut otomatis.');
    b.append(status);
    if (!k.groups.length) b.append(kosong('Belum ada maddah.'));
    k.groups.forEach((g) => {
      const kepala = el('h4', 'wali-subtitle', `${g.programName}${g.level ? ` · ${g.level}` : ''}`);
      b.append(kepala, tabelStack(['Maddah', 'Materi', 'Terdaftar', 'Akses otomatis', ''], g.courses.map((c) => {
        const aksi = el('span', 'kg-bar');
        if (c.canEdit) {
          aksi.append(tombol('Atur', 'wali-link', () => aturCakupan(c).catch((error) => status.set(error.message, true))));
          if (c.autoAccess) aksi.append(tombol('Sinkronkan', 'wali-link', async () => {
            try { const h = await api('POST', `/api/courses/${encodeURIComponent(c.id)}/sinkron`); status.set(`Akses disinkronkan: ${h.added} ditambah, ${h.removed} dicabut.`); await render(); } catch (error) { status.set(error.message, true); }
          }));
        }
        return [c.title, c.materials, c.enrolled, c.autoAccess ? `Aktif (${c.automatic} santri)` : 'Tidak', aksi];
      })));
    });
    akar.append(b);

    async function aturCakupan(c) {
      const hasil = await window.HamasahDialog.formulir({
        judul: `Program dan jenjang: ${c.title}`,
        keterangan: 'Akses otomatis mendaftarkan peserta batch aktif program yang dipilih. Mematikannya hanya mencabut pendaftaran yang dibuat otomatis.',
        bidang: [
          { nama: 'programId', label: 'Program', jenis: 'select', pilihan: [['', 'Tanpa program'], ...k.programs.map((p) => [p.id, p.name])], nilai: c.programId || '' },
          { nama: 'level', label: 'Jenjang (misalnya Dasar, Menengah, Tingkat 1)', nilai: c.level || '' },
          { nama: 'autoAccess', label: 'Akses otomatis untuk peserta program', jenis: 'select', pilihan: [['false', 'Tidak (daftarkan manual)'], ['true', 'Ya (ikuti keanggotaan program)']], nilai: String(c.autoAccess) }
        ],
        labelSimpan: 'Simpan',
        kirim: (v) => api('PATCH', `/api/courses/${encodeURIComponent(c.id)}/cakupan`, { programId: v.programId || null, level: v.level, autoAccess: v.autoAccess === 'true' })
      });
      if (hasil) { status.set(`Tersimpan. ${hasil.added} santri ditambahkan, ${hasil.removed} dicabut.`); await render(); }
    }
    return akar;
  }

  // ------------------------------------------------------------------ sesi belajar bersama

  async function tabSesi() {
    const akar = el('div', 'kg-stack');
    if (!state.katalog) await muatKatalog();
    const status = pesanStatus();
    const data = await api('GET', `/api/lms/sesi?t=${Date.now()}`);
    const rincian = el('div');
    const b = bagian('Sesi belajar bersama', 'Catat kehadiran santri asrama Anda pada sesi belajar bersama. Peserta adalah santri yang sudah terdaftar di maddah itu.');
    b.append(tombol('Sesi baru', 'button button--primary kg-small', () => sesiBaru().catch((error) => status.set(error.message, true))), status);
    b.append(data.items.length ? tabelStack(['Tanggal', 'Sesi', 'Maddah', 'Asrama', 'Kehadiran', ''], data.items.map((s) => [s.heldOn, s.title, s.courseTitle, s.dormitoryName || 'Semua', `${s.present} hadir dari ${s.recorded} dicatat`, tombol('Catat kehadiran', 'wali-link', () => buka(s.id).catch((error) => status.set(error.message, true)))])) : kosong('Belum ada sesi.'));
    akar.append(b, rincian);

    async function sesiBaru() {
      const maddah = semuaMaddah();
      if (!maddah.length) { status.set('Belum ada maddah untuk dibuatkan sesi.', true); return; }
      if (role() === 'supervisor' && !state.asrama.length) { status.set('Anda belum memegang asrama.', true); return; }
      const bidang = [
        { nama: 'courseId', label: 'Maddah', jenis: 'select', pilihan: maddah.map((c) => [c.id, c.title]), nilai: maddah[0].id },
        { nama: 'title', label: 'Judul sesi', wajib: true, nilai: '' },
        { nama: 'heldOn', label: 'Tanggal', jenis: 'date', nilai: hariIni(), wajib: true },
        { nama: 'dormitoryId', label: role() === 'supervisor' ? 'Asrama' : 'Asrama (opsional)', jenis: 'select', pilihan: [...(role() === 'supervisor' ? [] : [['', 'Semua asrama']]), ...state.asrama.map((d) => [d.id, d.name])], nilai: state.asrama[0] ? state.asrama[0].id : '' },
        { nama: 'note', label: 'Catatan (opsional)', nilai: '' }
      ];
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Sesi belajar bersama',
        keterangan: 'Sesi dibuat untuk satu asrama; hanya santri asrama itu yang terdaftar di maddah yang muncul sebagai peserta.',
        bidang,
        labelSimpan: 'Buat sesi',
        kirim: (v) => api('POST', `/api/courses/${encodeURIComponent(v.courseId)}/sesi`, { title: v.title, heldOn: v.heldOn, dormitoryId: v.dormitoryId || null, note: v.note })
      });
      if (hasil) { state.bukaSesi = hasil.id; await render(); }
    }

    async function buka(id) {
      const d = await api('GET', `/api/lms/sesi/${encodeURIComponent(id)}?t=${Date.now()}`);
      const r = bagian(`${d.title} · ${d.heldOn}`, `${d.courseTitle}${d.dormitoryName ? ` · ${d.dormitoryName}` : ''}`);
      const msg = pesanStatus();
      if (!d.students.length) { r.append(kosong('Belum ada peserta: belum ada santri asrama ini yang terdaftar di maddah tersebut.')); rincian.replaceChildren(r); return; }
      const input = new Map();
      const baris = d.students.map((s) => {
        const pil = el('select', 'wali-field');
        pil.append(new Option('Pilih...', ''));
        d.statuses.forEach((x) => pil.append(new Option(x.label, x.id)));
        pil.value = s.status || '';
        pil.setAttribute('aria-label', `Kehadiran ${s.name}`);
        const cat = el('input', 'wali-field');
        cat.type = 'text'; cat.maxLength = 200; cat.value = s.note || ''; cat.setAttribute('aria-label', `Catatan ${s.name}`);
        input.set(s.studentId, { pil, cat });
        return [s.name, pil, cat];
      });
      r.append(tabelStack(['Santri', 'Kehadiran', 'Catatan'], baris));
      const aksi = el('div', 'kg-bar');
      aksi.append(
        tombol('Semua hadir', 'button button--secondary kg-small', () => input.forEach((x) => { if (!x.pil.value) x.pil.value = 'hadir'; })),
        tombol('Simpan kehadiran', 'button button--primary kg-small', async () => {
          const entries = [...input.entries()].filter(([, x]) => x.pil.value).map(([studentId, x]) => ({ studentId, status: x.pil.value, note: x.cat.value }));
          if (!entries.length) { msg.set('Pilih kehadiran minimal satu santri.', true); return; }
          try { const h = await api('PUT', `/api/lms/sesi/${encodeURIComponent(id)}/kehadiran`, { entries }); msg.set(`${h.saved} kehadiran tersimpan.`); } catch (error) { msg.set(error.message, true); }
        })
      );
      r.append(aksi, msg);
      rincian.replaceChildren(r);
      r.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Sesi yang baru dibuat langsung terbuka untuk mencatat kehadiran.
    if (state.bukaSesi) {
      const id = state.bukaSesi;
      state.bukaSesi = null;
      await buka(id).catch((error) => status.set(error.message, true));
    }
    return akar;
  }

  // ------------------------------------------------------------------ rangka

  async function render() {
    const kepala = el('header', 'asr-head');
    const teks = el('div', 'asr-head__text');
    teks.append(el('p', 'wali-eyebrow', 'LMS internal'), el('h2', 'asr-head__title', 'Program dan sesi belajar bersama'), el('p', 'mus-note', 'LMS khusus santri Hamasah: kelompokkan maddah per program dan catat kehadiran sesi bersama.'));
    kepala.append(teks);
    const tab = el('div', 'wali-tabs');
    tab.setAttribute('role', 'tablist');
    [['katalog', 'Maddah per program'], ['sesi', 'Sesi belajar bersama']].forEach(([id, label]) => {
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
      isi.replaceChildren(await (state.tab === 'sesi' ? tabSesi : tabKatalog)());
    } catch (error) {
      isi.replaceChildren(kosong(error.message || 'Halaman belum dapat dimuat.'));
    }
  }

  (async function mulai() {
    if (session()) document.body.classList.add('in-crm');
    try {
      const me = await window.hamasahMintaAkun(headers());
      const akun = me.body && me.body.account;
      if (!me.ok || !akun || !['admin', 'teacher', 'supervisor'].includes(akun.role)) throw new Error('Halaman ini untuk admin, pengajar, dan musyrif.');
      state.akun = akun;
      guard.hidden = true;
      konsol.hidden = false;
      document.body.classList.add('in-crm');
      renderStaffNav(staffNav, akun.role, 'sesi-belajar', akun);
      if (akun.role === 'supervisor') {
        const d = await api('GET', '/api/inventaris/asrama').catch(() => ({ items: [] }));
        state.asrama = d.items || [];
      } else {
        const d = await api('GET', '/api/dormitories').catch(() => ({ items: [], dormitories: [] }));
        state.asrama = (d.items || d.dormitories || []).map((x) => ({ id: x.id, name: x.name }));
      }
      await render();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Program LMS belum tersedia';
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
