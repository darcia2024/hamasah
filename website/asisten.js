// Asisten Hamasah untuk admin dan musyrif: chatbox. Pengguna bercerita dengan kalimat biasa; asisten menjawab dengan data
// atau menyusun KARTU USULAN (pengumuman, catatan urusan, draf laporan) yang diperiksa dulu. Tidak ada yang berlaku sebelum
// pengguna menekan tombol di kartunya. Percakapan hanya ada di halaman ini, tidak disimpan di server maupun peramban.
// API: /api/asisten-operasional (daftar pilihan) dan /api/asisten-operasional/percakapan (chat).
// Semua teks lewat textContent; tanpa gaya sebaris (CSP).
(function initAsisten() {
  const guard = document.querySelector('#as-guard');
  const guardCopy = document.querySelector('#as-guard-copy');
  const konsol = document.querySelector('#as-console');
  const app = document.querySelector('#as-app');
  const staffNav = document.querySelector('#staff-nav');
  const state = { akun: null, pilihan: null, santri: [], server: null, sibuk: false, log: null, kotak: null, kirim: null, ketik: null };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const IKON = Object.freeze({
    kilau: ['M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z', 'M20 3v4', 'M22 5h-4'],
    kirim: ['M12 19V5', 'm5 12 7-7 7 7'],
    baru: ['M12 5v14', 'M5 12h14'],
    pengumuman: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
    urusan: ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
    laporan: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
    asrama: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
    santri: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
    dokumen: ['M4 4h16v16H4z', 'M8 9h8', 'M8 13h8', 'M8 17h4']
  });

  function el(tag, kelas, teks) {
    const node = document.createElement(tag);
    if (kelas) node.className = kelas;
    if (teks !== undefined && teks !== null) node.textContent = teks;
    return node;
  }

  function ikon(nama, ukuran = 20) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(ukuran));
    svg.setAttribute('height', String(ukuran));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    IKON[nama].forEach((d) => { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); svg.append(p); });
    return svg;
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

  function tombol(teks, kelas, aksi) {
    const b = el('button', kelas, teks);
    b.type = 'button';
    if (aksi) b.addEventListener('click', aksi);
    return b;
  }

  const admin = () => state.akun && state.akun.role === 'admin';
  const reduksiGerak = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ kerangka halaman

  function contohAwal() {
    const s = state.santri[0];
    const depan = s ? s.name.split(' ')[0] : null;
    const daftar = [];
    daftar.push({ ikon: 'asrama', judul: 'Ringkas kondisi asrama', teks: admin() ? 'Ringkas kondisi asrama' : 'Ringkas kondisi asrama saya' });
    if (depan) daftar.push({ ikon: 'santri', judul: 'Lihat perkembangan santri', teks: `Bagaimana kabar ${depan}?` });
    daftar.push({ ikon: 'pengumuman', judul: 'Susun pengumuman', teks: admin() ? 'Besok ada rapat musyrif jam 8 malam di kantor, tolong umumkan ke semua musyrif' : 'Besok kegiatan pagi libur, tolong umumkan' });
    if (admin() && depan) daftar.push({ ikon: 'urusan', judul: 'Catat urusan santri', teks: `${depan} perlu lapor diri minggu depan` });
    else if (admin()) daftar.push({ ikon: 'dokumen', judul: 'Dokumen yang perlu ditindaklanjuti', teks: 'Dokumen apa yang perlu ditindaklanjuti?' });
    else daftar.push({ ikon: 'laporan', judul: 'Susun draf laporan', teks: 'Buat laporan kegiatan pekan ini' });
    return daftar;
  }

  function avatar(besar) {
    const a = el('span', `as-avatar${besar ? ' as-avatar--besar' : ''}`);
    a.append(ikon('kilau', besar ? 28 : 18));
    return a;
  }

  function sambutan() {
    const w = el('div', 'as-welcome');
    const depan = (state.akun.name || '').split(' ')[0];
    w.append(avatar(true), el('h2', 'as-welcome__title', depan ? `Halo, ${depan}. Mau dibantu apa?` : 'Mau dibantu apa?'));
    w.append(el('p', 'as-welcome__text', 'Ceritakan saja dengan kalimat biasa. Saya bantu meringkas, menyusun pengumuman, dan menyiapkan catatan urusan. Semua hasilnya Anda periksa dulu sebelum dipakai.'));
    const grid = el('div', 'as-starters');
    contohAwal().forEach((c) => {
      const k = el('button', 'as-starter');
      k.type = 'button';
      const i = el('span', 'as-starter__icon');
      i.append(ikon(c.ikon, 18));
      const t = el('span', 'as-starter__text');
      t.append(el('strong', '', c.judul), el('span', '', c.teks));
      k.append(i, t);
      k.addEventListener('click', () => kirim(c.teks));
      grid.append(k);
    });
    w.append(grid);
    return w;
  }

  function render() {
    const p = state.pilihan;
    const kepala = el('header', 'as-head');
    const teks = el('div', 'as-head__text');
    teks.append(el('p', 'wali-eyebrow', 'Asisten Hamasah'), el('h2', 'as-head__title', 'Ceritakan, saya bantu menyusunnya'));
    const aksi = el('div', 'as-head__actions');
    const mode = el('span', `as-mode ${p.external ? 'is-ai' : 'is-lokal'}`, p.external ? 'Dibantu AI' : 'Mode lokal');
    mode.title = p.external
      ? 'Kalimat disusun penyedia AI di luar dari data yang sudah dianonimkan: nama santri diganti alias, tanpa catatan bebas dan kontak.'
      : 'Disusun otomatis di server dari data yang boleh Anda akses. Tidak ada data yang dikirim ke penyedia AI di luar.';
    const baru = el('button', 'as-ghost');
    baru.type = 'button';
    baru.append(ikon('baru', 16), document.createTextNode('Percakapan baru'));
    baru.addEventListener('click', mulaiBaru);
    aksi.append(mode, baru);
    kepala.append(teks, aksi);

    const chat = el('section', 'as-chat');
    chat.setAttribute('aria-label', 'Percakapan dengan Asisten Hamasah');
    const log = el('div', 'as-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.tabIndex = 0;
    log.setAttribute('aria-label', 'Riwayat percakapan');
    state.log = log;

    const form = el('form', 'as-composer');
    const kotak = el('textarea', 'as-composer__input');
    kotak.rows = 1;
    kotak.maxLength = 1000;
    kotak.placeholder = 'Ceritakan apa yang terjadi atau apa yang ingin Anda lakukan...';
    kotak.setAttribute('aria-label', 'Pesan untuk asisten');
    const kirimBtn = el('button', 'as-composer__send');
    kirimBtn.type = 'submit';
    kirimBtn.setAttribute('aria-label', 'Kirim pesan');
    kirimBtn.append(ikon('kirim', 20));
    const bungkus = el('div', 'as-composer__box');
    bungkus.append(kotak, kirimBtn);
    form.append(bungkus, el('p', 'as-composer__note', 'Jangan menulis data pribadi yang tidak perlu. Percakapan tidak disimpan, dan asisten tidak mengubah data sebelum Anda menekan tombolnya.'));
    state.kotak = kotak;
    state.kirim = kirimBtn;

    const atur = () => { kotak.rows = Math.min(6, Math.max(1, kotak.value.split('\n').length + Math.floor(kotak.value.length / 80))); kirimBtn.disabled = state.sibuk || !kotak.value.trim(); };
    kotak.addEventListener('input', atur);
    kotak.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const isi = kotak.value.trim();
      if (!isi || state.sibuk) return;
      kotak.value = '';
      atur();
      kirim(isi);
    });
    atur();

    if (!p.enabled) {
      kotak.disabled = true;
      kirimBtn.disabled = true;
      log.append(el('p', 'as-off', 'Asisten sedang dimatikan oleh admin. Hubungi admin untuk menyalakannya kembali di Pengaturan.'));
    } else {
      log.append(sambutan());
    }
    chat.append(log, form);
    app.replaceChildren(kepala, chat);
  }

  function mulaiBaru() {
    state.server = null;
    state.sibuk = false;
    state.log.replaceChildren(sambutan());
    state.kotak.disabled = false;
    state.kotak.value = '';
    state.kotak.dispatchEvent(new Event('input'));
    state.kotak.focus();
  }

  // ------------------------------------------------------------------ pesan

  function gulir() {
    const log = state.log;
    if (reduksiGerak() || !log.scrollTo) log.scrollTop = log.scrollHeight;
    else log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
  }

  function bersihkanSambutan() {
    const w = state.log.querySelector('.as-welcome');
    if (w) w.remove();
  }

  function tambahPengguna(teks) {
    bersihkanSambutan();
    state.log.querySelectorAll('.as-chips').forEach((n) => n.remove());
    const m = el('div', 'as-msg as-msg--user');
    m.append(el('p', 'as-bubble as-bubble--user', teks));
    state.log.append(m);
    gulir();
  }

  function pesanAsisten() {
    const m = el('div', 'as-msg as-msg--asisten');
    const isi = el('div', 'as-msg__body');
    m.append(avatar(false), isi);
    state.log.append(m);
    return { m, isi };
  }

  function tampilkanKetik() {
    const { m, isi } = pesanAsisten();
    m.classList.add('as-msg--ketik');
    const b = el('div', 'as-bubble as-bubble--asisten as-typing');
    b.setAttribute('aria-label', 'Asisten sedang menyusun jawaban');
    for (let i = 0; i < 3; i += 1) b.append(el('span', 'as-typing__dot'));
    isi.append(b);
    state.ketik = m;
    gulir();
  }

  function hapusKetik() {
    if (state.ketik) state.ketik.remove();
    state.ketik = null;
  }

  function paragraf(induk, teks) {
    String(teks || '').split(/\n{2,}/).forEach((bagian) => { if (bagian.trim()) induk.append(el('p', 'as-text', bagian.trim())); });
  }

  function chips(daftar) {
    const c = el('div', 'as-chips');
    daftar.forEach((s) => c.append(tombol(s.label, 'as-chip', () => kirim(s.text || s.label))));
    return c;
  }

  function tambahGalat(teks, ulang) {
    const { isi } = pesanAsisten();
    const b = el('div', 'as-bubble as-bubble--asisten as-bubble--galat');
    b.append(el('p', 'as-text', teks));
    isi.append(b);
    if (ulang) isi.append(chips([{ label: 'Coba lagi', text: ulang }]));
    gulir();
  }

  function tambahBalasan(data) {
    const { isi } = pesanAsisten();
    const r = data.reply;
    const b = el('div', 'as-bubble as-bubble--asisten');
    if (r.title) b.append(el('h3', 'as-bubble__title', r.title));
    paragraf(b, r.text);
    if (r.facts && r.facts.length) {
      const f = el('dl', 'as-facts');
      r.facts.forEach((x) => { const d = el('div', 'as-fact'); d.append(el('dt', '', x.label), el('dd', '', String(x.value))); f.append(d); });
      b.append(f);
    }
    const catatan = [];
    if (r.dataUsed && r.dataUsed.length) catatan.push(`Sumber: ${r.dataUsed.join(', ')}.`);
    if (data.mode === 'ai') catatan.push('Kalimatnya dibantu AI; angka berasal langsung dari data.');
    if (catatan.length) b.append(el('p', 'as-note', catatan.join(' ')));
    isi.append(b);
    (data.proposals || []).forEach((p) => {
      const kartu = p.type === 'pengumuman' ? kartuPengumuman(p) : p.type === 'urusan' ? kartuUrusan(p) : p.type === 'laporan' ? kartuLaporan(p) : null;
      if (kartu) isi.append(kartu);
    });
    if (data.actions && data.actions.length) {
      const a = el('div', 'as-actions');
      data.actions.forEach((x) => { const l = el('a', 'as-link', x.label); l.href = x.href; a.append(l); });
      isi.append(a);
    }
    if (data.suggestions && data.suggestions.length) isi.append(chips(data.suggestions));
    gulir();
  }

  async function kirim(teks) {
    if (state.sibuk || !teks) return;
    state.sibuk = true;
    state.kirim.disabled = true;
    tambahPengguna(teks);
    tampilkanKetik();
    try {
      const data = await api('POST', '/api/asisten-operasional/percakapan', { message: teks, state: state.server });
      hapusKetik();
      state.server = data.state || null;
      tambahBalasan(data);
    } catch (error) {
      hapusKetik();
      tambahGalat(error.message || 'Asisten belum bisa menjawab.', teks);
    } finally {
      state.sibuk = false;
      state.kirim.disabled = !state.kotak.value.trim();
      if (!state.kotak.disabled) state.kotak.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------------ kartu usulan

  function kolom(label, kontrol) {
    const w = el('label', 'as-field');
    w.append(el('span', 'as-field__label', label), kontrol);
    return w;
  }

  function kepalaKartu(nama, judul) {
    const h = el('header', 'as-card__head');
    const i = el('span', 'as-card__icon');
    i.append(ikon(nama, 16));
    h.append(i, el('span', 'as-card__title', judul));
    return h;
  }

  async function salin(teks, tombolSalin) {
    try { await navigator.clipboard.writeText(teks); tombolSalin.textContent = 'Tersalin'; } catch { tombolSalin.textContent = 'Tidak bisa menyalin'; }
    setTimeout(() => { tombolSalin.textContent = 'Salin teks'; }, 2200);
  }

  function kartuPengumuman(p) {
    const k = el('article', 'as-card');
    k.append(kepalaKartu('pengumuman', 'Usulan pengumuman'));
    const judul = el('input', 'as-input');
    judul.maxLength = 120;
    judul.value = p.title;
    const isi = el('textarea', 'as-input as-input--area');
    isi.rows = 7;
    isi.maxLength = 2000;
    isi.value = p.body;
    k.append(kolom('Judul', judul), kolom('Isi pengumuman', isi));
    if (p.audienceHint) k.append(el('p', 'as-note', `Penerima yang Anda sebut: ${{ musyrif: 'semua musyrif', santri: 'semua santri', wali: 'semua wali' }[p.audienceHint]}. Pilih penerimanya di formulir.`));
    const aksi = el('div', 'as-card__actions');
    aksi.append(tombol('Buka di formulir pengumuman', 'button button--primary kg-small', () => {
      // Draf dibawa ke formulir pengumuman; baru terbit setelah Anda memilih penerima dan menekan "Terbitkan pengumuman".
      try { sessionStorage.setItem('hamasahDrafPengumuman', JSON.stringify({ title: judul.value, body: isi.value })); } catch { /* tanpa penyimpanan, salin manual */ }
      window.location.href = 'monitoring#pengumuman';
    }));
    const s = tombol('Salin teks', 'button button--secondary kg-small');
    s.addEventListener('click', () => salin(`${judul.value}\n\n${isi.value}`, s));
    aksi.append(s);
    k.append(aksi);
    return k;
  }

  function kartuLaporan(p) {
    const k = el('article', 'as-card');
    k.append(kepalaKartu('laporan', p.title || 'Draf laporan'));
    const isi = el('textarea', 'as-input as-input--area');
    isi.rows = 8;
    isi.value = p.text;
    isi.setAttribute('aria-label', 'Isi draf laporan');
    k.append(isi);
    const aksi = el('div', 'as-card__actions');
    const s = tombol('Salin teks', 'button button--primary kg-small');
    s.addEventListener('click', () => salin(isi.value, s));
    aksi.append(s);
    k.append(aksi);
    return k;
  }

  function kartuUrusan(p) {
    const k = el('article', 'as-card');
    k.append(kepalaKartu('urusan', 'Usulan catatan urusan'));
    const santri = el('p', 'as-card__santri');
    santri.append(el('strong', '', p.studentName), el('span', '', p.dormitory || 'Belum berasrama'));
    const jenis = el('select', 'as-input');
    [['lapor-diri', 'Lapor diri'], ['lapor-pendidikan', 'Lapor pendidikan'], ['status-pendidikan', 'Status pendidikan']].forEach(([v, t]) => jenis.append(new Option(t, v)));
    jenis.value = p.kind;
    const batas = el('input', 'as-input');
    batas.type = 'date';
    batas.value = p.dueOn;
    const pj = el('select', 'as-input');
    pj.append(new Option('Belum ditentukan', ''));
    (p.assignees || []).forEach((x) => pj.append(new Option(`${x.name} (${x.role})`, x.id)));
    pj.value = p.assigneeId || '';
    const catatan = el('textarea', 'as-input as-input--area');
    catatan.rows = 3;
    catatan.maxLength = 500;
    catatan.value = p.note;
    const baris = el('div', 'as-card__grid');
    baris.append(kolom('Jenis urusan', jenis), kolom('Batas waktu', batas));
    const status = el('p', 'as-card__status');
    status.setAttribute('role', 'status');
    const aksi = el('div', 'as-card__actions');
    const simpan = tombol('Catat urusan', 'button button--primary kg-small');
    simpan.addEventListener('click', async () => {
      simpan.disabled = true;
      status.textContent = 'Menyimpan...';
      status.classList.remove('is-error');
      try {
        await api('POST', '/api/admin/monitoring-pusat/masalah', { studentId: p.studentId, kind: jenis.value, note: catatan.value, dueOn: batas.value, assigneeAccountId: pj.value || undefined });
        const selesai = el('div', 'as-card__selesai');
        selesai.append(el('p', 'as-text', `Urusan ${jenis.selectedOptions[0].text.toLowerCase()} untuk ${p.studentName} sudah dicatat.`));
        const l = el('a', 'as-link', 'Lihat di Monitoring pusat');
        l.href = 'portal#admin-perhatian';
        selesai.append(l);
        k.replaceChildren(kepalaKartu('urusan', 'Urusan tercatat'), selesai);
        k.classList.add('is-selesai');
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('is-error');
        simpan.disabled = false;
      }
    });
    aksi.append(simpan);
    k.append(santri, baris, kolom('Penanggung jawab', pj), kolom('Catatan', catatan), status, aksi);
    return k;
  }

  // ------------------------------------------------------------------ mulai

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
