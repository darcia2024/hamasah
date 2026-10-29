// Asisten Hamasah untuk admin dan musyrif (tahap awal): ringkasan asrama, perkembangan santri, dokumen yang perlu
// ditindaklanjuti, dan draf pengumuman atau laporan. Asisten hanya membaca dan menyusun teks; draf pengumuman baru
// terbit setelah Anda memeriksa dan menerbitkannya di formulir pengumuman. API: /api/asisten-operasional.
(function initAsisten() {
  const guard = document.querySelector('#as-guard');
  const guardCopy = document.querySelector('#as-guard-copy');
  const konsol = document.querySelector('#as-console');
  const app = document.querySelector('#as-app');
  const staffNav = document.querySelector('#staff-nav');
  const state = { akun: null, pilihan: null, santri: [] };

  function el(tag, kelas, teks) {
    const node = document.createElement(tag);
    if (kelas) node.className = kelas;
    if (teks !== undefined && teks !== null) node.textContent = teks;
    return node;
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

  function kolom(label, kontrol, petunjuk) {
    const b = el('div', 'wali-form__row');
    kontrol.id = `as-${Math.random().toString(36).slice(2, 8)}`;
    const l = el('label', 'wali-field__label', label);
    l.htmlFor = kontrol.id;
    b.append(l, kontrol);
    if (petunjuk) b.append(el('p', 'wali-field__hint', petunjuk));
    return b;
  }

  function pilih(opsi) {
    const s = el('select', 'wali-field');
    opsi.forEach(([v, t]) => s.append(new Option(t, v)));
    return s;
  }

  function render() {
    const p = state.pilihan;
    const kepala = el('header', 'asr-head');
    const teks = el('div', 'asr-head__text');
    teks.append(el('p', 'wali-eyebrow', 'Asisten Hamasah'), el('h2', 'asr-head__title', 'Ringkasan dan draf dibantu AI'), el('p', 'mus-note', p.disclaimer));
    kepala.append(teks);

    const mode = el('p', p.external ? 'kg-warning' : 'kg-ok', p.external
      ? 'Mode AI aktif: ringkasan disusun penyedia AI di luar dari data yang sudah dianonimkan (nama diganti "Santri 1", tanpa catatan bebas dan kontak).'
      : 'Mode lokal: ringkasan disusun otomatis di server dari data yang boleh Anda akses. Tidak ada data yang dikirim ke penyedia AI di luar.');
    if (!p.enabled) mode.textContent = 'Asisten operasional sedang dimatikan oleh admin.';

    const bagianForm = el('section', 'wali-section kg-section');
    const kepalaForm = el('header', 'wali-section__head');
    kepalaForm.append(el('h3', 'wali-section__title', 'Minta bantuan'));
    bagianForm.append(kepalaForm);

    const tugas = pilih(p.tasks.map((t) => [t.id, t.label]));
    const keterangan = el('p', 'wali-field__hint');
    const asrama = pilih(p.dormitories.map((d) => [d.id, d.name]));
    const santri = pilih(state.santri.map((s) => [s.id, s.name]));
    const instruksi = el('textarea', 'wali-field');
    instruksi.rows = 4; instruksi.maxLength = 600;
    const kAsrama = kolom('Asrama', asrama);
    const kSantri = kolom('Santri', santri);
    const kInstruksi = kolom('Instruksi', instruksi, 'Tulis apa yang ingin diumumkan atau dilaporkan, untuk siapa, dan kapan. Jangan menulis data pribadi yang tidak perlu.');
    const jalan = el('button', 'button button--primary kg-small', 'Susun');
    jalan.type = 'button';
    const status = el('p', 'form-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const hasil = el('div');

    function ganti() {
      const id = tugas.value;
      keterangan.textContent = (p.tasks.find((t) => t.id === id) || {}).description || '';
      kAsrama.hidden = id !== 'ringkasan-asrama';
      kSantri.hidden = id !== 'perkembangan-santri';
      kInstruksi.hidden = !['draft-pengumuman', 'draft-laporan'].includes(id);
    }
    tugas.addEventListener('change', ganti);
    ganti();

    jalan.addEventListener('click', async () => {
      const id = tugas.value;
      const badan = id === 'ringkasan-asrama' ? { dormitoryId: asrama.value } : id === 'perkembangan-santri' ? { studentId: santri.value } : ['draft-pengumuman', 'draft-laporan'].includes(id) ? { instruction: instruksi.value } : {};
      jalan.disabled = true;
      status.textContent = 'Menyusun...';
      status.classList.remove('is-error');
      hasil.replaceChildren();
      try {
        const data = await api('POST', `/api/asisten-operasional/${encodeURIComponent(id)}`, badan);
        status.textContent = '';
        hasil.replaceChildren(kartuHasil(data));
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('is-error');
      } finally { jalan.disabled = false; }
    });

    bagianForm.append(kolom('Tugas', tugas), keterangan, kAsrama, kSantri, kInstruksi, jalan, status);
    app.replaceChildren(kepala, mode, bagianForm, hasil);
  }

  function kartuHasil(data) {
    const w = el('section', 'wali-section kg-section');
    const k = el('header', 'wali-section__head');
    k.append(el('h3', 'wali-section__title', data.title), el('p', 'wali-section__note', `${data.mode === 'ai' ? 'Dibantu AI' : 'Disusun otomatis dari data'} · ${new Date(data.generatedAt).toLocaleString('id-ID')}`));
    w.append(k, el('p', 'asisten-teks', data.text));
    if (data.facts && data.facts.length) {
      const ul = el('ul', 'asisten-fakta');
      data.facts.forEach((f) => ul.append(el('li', '', `${f.label}: ${f.value}`)));
      w.append(el('h4', 'wali-subtitle', 'Fakta dari data'), ul);
    }
    w.append(el('p', 'wali-field__hint', `Data yang dipakai: ${data.dataUsed.join(', ')}.`), el('p', 'wali-field__hint', data.disclaimer));
    const aksi = el('div', 'kg-bar');
    const salin = el('button', 'button button--secondary kg-small', 'Salin teks');
    salin.type = 'button';
    salin.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(data.text); salin.textContent = 'Tersalin'; } catch { salin.textContent = 'Tidak bisa menyalin'; }
    });
    aksi.append(salin);
    if (data.proposal) {
      const buka = el('button', 'button button--primary kg-small', 'Buka di formulir pengumuman');
      buka.type = 'button';
      buka.addEventListener('click', () => {
        // Draf dibawa ke formulir pengumuman; baru terbit setelah Anda menekan "Terbitkan pengumuman".
        try { sessionStorage.setItem('hamasahDrafPengumuman', JSON.stringify({ title: data.proposal.title, body: data.proposal.body })); } catch { /* tanpa penyimpanan, salin manual */ }
        window.location.href = 'monitoring#pengumuman';
      });
      aksi.append(buka);
    }
    w.append(aksi);
    return w;
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
      renderStaffNav(staffNav, akun.role, 'asisten', akun);
      state.pilihan = await api('GET', '/api/asisten-operasional');
      state.santri = (await api('GET', '/api/my-students?limit=200').catch(() => ({ items: [] }))).items || [];
      render();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Asisten Hamasah belum tersedia';
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
