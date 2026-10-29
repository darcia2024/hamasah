// Pengingat Tagihan lewat WhatsApp klik-untuk-chat (admin dan keuangan). API: /api/pengingat-tagihan/*.
// Membuka chat dicatat sebagai "dibuka", bukan "terkirim". Semua teks lewat textContent; tanpa gaya sebaris (CSP).
(function initPengingat() {
  const guard = document.querySelector('#pgt-guard');
  const guardCopy = document.querySelector('#pgt-guard-copy');
  const konsol = document.querySelector('#pgt-console');
  const app = document.querySelector('#pgt-app');
  const staffNav = document.querySelector('#staff-nav');
  const WAKTU = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const RUPIAH = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const TAB = [['daftar', 'Wali dengan tagihan'], ['riwayat', 'Riwayat pengingat'], ['pengaturan', 'Templat dan aturan']];
  const state = { akun: null, tab: 'daftar', filter: { period: '', due: 'semua', q: '' } };

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

  const kosong = (teks) => el('p', 'wali-empty', teks);
  const tgl = (t) => TANGGAL.format(new Date(`${t}T00:00:00Z`));

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
    kontrol.id = `pg-${Math.random().toString(36).slice(2, 8)}`;
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

  // ------------------------------------------------------------------ daftar wali

  async function tabDaftar() {
    const akar = el('div', 'kg-stack');
    const periode = isian('month', state.filter.period);
    const jatuh = pilihan([['semua', 'Semua tagihan belum lunas'], ['lewat', 'Sudah lewat jatuh tempo'], ['7-hari', 'Jatuh tempo 7 hari ke depan'], ['belum-diatur', 'Jatuh tempo belum diatur']], state.filter.due);
    const cari = isian('search', state.filter.q, { placeholder: 'Nama wali, santri, atau nomor tagihan' });
    const bar = el('div', 'kg-bar');
    bar.append(kolom('Bulan terbit tagihan', periode), kolom('Jatuh tempo', jatuh), kolom('Cari', cari));
    const status = pesanStatus();
    const hasil = el('div');
    const b = bagian('Wali dengan tagihan belum lunas', 'Pengingat hanya untuk tagihan yang masih belum lunas. Membuka WhatsApp dicatat sebagai "dibuka", bukan "terkirim": Anda tetap perlu menekan kirim di WhatsApp.');
    b.append(bar, status, hasil);
    akar.append(b);

    async function muat() {
      state.filter = { period: periode.value, due: jatuh.value, q: cari.value.trim() };
      status.set('Memuat...');
      try {
        const params = new URLSearchParams();
        if (state.filter.period) params.set('period', state.filter.period);
        if (state.filter.due !== 'semua') params.set('due', state.filter.due);
        if (state.filter.q) params.set('q', state.filter.q);
        const data = await api('GET', `/api/pengingat-tagihan?${params}&t=${Date.now()}`);
        if (data.available === false) { status.set('Database belum diperbarui untuk pengingat tagihan. Terapkan pembaruan database di halaman Pengaturan.', true); hasil.replaceChildren(); return; }
        status.set(data.items.length ? `${data.totalParents} wali · total ${RUPIAH.format(data.totalAmount)} belum lunas.` : 'Tidak ada wali dengan tagihan yang cocok.');
        if (!data.items.length) { hasil.replaceChildren(); return; }
        hasil.replaceChildren(tabelStack(['Wali', 'Santri', 'Tagihan', 'Total', 'Jatuh tempo', 'Bulan ini', ''], data.items.map((w) => {
          const aksi = el('span', 'kg-bar');
          aksi.append(tombol('Rincian', 'wali-link', () => rincian(w, data.today, muat)), tombol(w.allowed ? 'Pratinjau dan WhatsApp' : 'Pratinjau', 'button button--primary kg-small', () => pratinjau(w, data.config, muat).catch((error) => status.set(error.message, true))));
          const terlambat = w.maxDaysLate > 0 ? `Terlambat ${w.maxDaysLate} hari` : (w.maxDaysLate === 0 ? 'Hari ini' : `${-w.maxDaysLate} hari lagi`);
          return [w.parentName + (w.hasPhone ? '' : ' (nomor belum ada)'), w.students.join(', '), w.invoices.length, RUPIAH.format(w.total), terlambat, `${w.remindersThisMonth}/${data.config.monthlyTarget}${w.waitDays ? ` · tunggu ${w.waitDays} hari` : ''}`, aksi];
        })));
      } catch (error) { status.set(error.message, true); }
    }
    [periode, jatuh].forEach((x) => x.addEventListener('change', () => muat().catch(() => {})));
    cari.addEventListener('change', () => muat().catch(() => {}));
    await muat();
    return akar;
  }

  function rincian(w, hariIni, muat) {
    const hasil = window.HamasahDialog.formulir({
      judul: `Tagihan ${w.parentName}`,
      keterangan: w.invoices.map((i) => `${i.number} · ${i.description}${w.students.length > 1 ? ` (${i.studentName})` : ''} · ${RUPIAH.format(i.amount)} · jatuh tempo ${tgl(i.dueOn)}${i.dueSet ? '' : ' (bawaan)'}`).join('\n'),
      bidang: [
        { nama: 'invoiceId', label: 'Atur jatuh tempo untuk tagihan', jenis: 'select', pilihan: w.invoices.map((i) => [i.id, `${i.number} · ${i.description}`]), nilai: w.invoices[0].id },
        { nama: 'dueOn', label: 'Jatuh tempo baru', jenis: 'date', nilai: w.invoices[0].dueOn, wajib: true }
      ],
      labelSimpan: 'Simpan jatuh tempo',
      kirim: (v) => api('PATCH', `/api/pengingat-tagihan/tagihan/${encodeURIComponent(v.invoiceId)}/jatuh-tempo`, { dueOn: v.dueOn })
    });
    return hasil.then((ok) => { if (ok) return muat(); return undefined; });
  }

  async function pratinjau(w, config, muat) {
    const data = await api('POST', `/api/pengingat-tagihan/wali/${encodeURIComponent(w.parentId)}/pratinjau`, {});
    const catatan = [
      data.hasPhone ? '' : 'Nomor WhatsApp wali belum tercatat: WhatsApp akan terbuka tanpa tujuan dan Anda memilih kontaknya sendiri.',
      data.allowed ? `Sisa pengingat bulan ini: ${data.quotaRemaining} dari ${data.monthlyTarget}.` : (data.quotaRemaining <= 0 ? `Target ${data.monthlyTarget} pengingat bulan ini sudah tercapai. Hanya admin yang dapat menambah.` : `Pengingat terakhir belum lama; tunggu ${data.waitDays} hari lagi (admin dapat melanjutkan).`)
    ].filter(Boolean).join(' ');
    const admin = state.akun.role === 'admin';
    if (!data.allowed && !admin) {
      await window.HamasahDialog.pesan({ judul: 'Belum bisa diingatkan', isi: [catatan, 'Pesan yang akan dikirim:', data.message] });
      return;
    }
    const hasil = await window.HamasahDialog.formulir({
      judul: `Pesan untuk ${w.parentName}`,
      keterangan: `${catatan}\n\n${data.message}`,
      bidang: [],
      labelSimpan: 'Buka WhatsApp',
      kirim: async () => {
        const buka = await api('POST', `/api/pengingat-tagihan/wali/${encodeURIComponent(w.parentId)}/buka`, { force: !data.allowed && admin });
        const jendela = window.open(buka.url, '_blank', 'noopener');
        return { ...buka, diblokir: !jendela };
      }
    });
    if (hasil) {
      await window.HamasahDialog.pesan({
        judul: 'WhatsApp dibuka',
        isi: [hasil.notice, hasil.diblokir ? `Peramban memblokir jendela baru. Salin tautan ini: ${hasil.url}` : '', 'Setelah benar-benar menekan kirim di WhatsApp, tandai terkirim di tab Riwayat pengingat.'].filter(Boolean)
      });
      await muat();
    }
  }

  // ------------------------------------------------------------------ riwayat

  async function tabRiwayat() {
    const akar = el('div', 'kg-stack');
    const b = bagian('Riwayat pengingat', '"Chat dibuka" hanya berarti WhatsApp dibuka dari sistem. Tandai terkirim bila Anda memang sudah menekan kirim.');
    const status = pesanStatus();
    const isi = el('div');
    b.append(status, isi);
    akar.append(b);
    async function muat() {
      const data = await api('GET', `/api/pengingat-tagihan/riwayat?t=${Date.now()}`);
      if (!data.items.length) { isi.replaceChildren(kosong('Belum ada pengingat yang dibuka.')); return; }
      isi.replaceChildren(tabelStack(['Waktu', 'Wali', 'Tagihan', 'Status', 'Dibuka oleh', ''], data.items.map((r) => {
        const aksi = el('span');
        if (r.status === 'dibuka') aksi.append(tombol('Tandai terkirim', 'wali-link', async () => { try { await api('POST', `/api/pengingat-tagihan/riwayat/${encodeURIComponent(r.batchId)}/terkirim`); await muat(); } catch (error) { status.set(error.message, true); } }));
        return [WAKTU.format(new Date(r.openedAt)), r.parentName || '-', r.invoices, r.statusLabel + (r.confirmedBy ? ` oleh ${r.confirmedBy}` : '') + (r.noPhone ? ' · tanpa nomor' : ''), r.openedBy || '-', aksi];
      })));
    }
    await muat();
    return akar;
  }

  // ------------------------------------------------------------------ pengaturan

  async function tabPengaturan() {
    const akar = el('div', 'kg-stack');
    const data = await api('GET', `/api/pengingat-tagihan/pengaturan?t=${Date.now()}`);
    const c = data.config;
    const b = bagian('Templat dan aturan pengingat', 'Templat dipakai untuk semua pengingat. Variabel diisi otomatis dari tagihan wali.');
    const form = el('form', 'wali-form');
    form.noValidate = true;
    const templat = el('textarea', 'wali-field');
    templat.rows = 12;
    templat.maxLength = 2000;
    templat.value = c.template;
    const target = isian('number', String(c.monthlyTarget), { min: '1', max: '10' });
    const jarak = isian('number', String(c.minGapDays), { min: '0', max: '60' });
    const bawaan = isian('number', String(c.defaultDueDays), { min: '0', max: '365' });
    const status = pesanStatus();
    form.append(
      kolom('Templat pesan', templat, `Variabel: ${data.variables.join(' ')}. Wajib memuat {daftar_tagihan}.`),
      kolom('Target pengingat per wali per bulan', target, 'Pengingat hanya dihitung untuk tagihan yang memang belum lunas; wali yang sudah melunasi tidak diingatkan.'),
      kolom('Jarak minimum antar pengingat (hari)', jarak),
      kolom('Jatuh tempo bawaan (hari sesudah terbit)', bawaan, 'Dipakai untuk tagihan yang jatuh temponya belum diatur.')
    );
    const simpan = el('button', 'button button--primary wali-action', 'Simpan');
    simpan.type = 'submit';
    form.append(simpan, status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('PUT', '/api/pengingat-tagihan/pengaturan', { template: templat.value, monthlyTarget: Number(target.value), minGapDays: Number(jarak.value), defaultDueDays: Number(bawaan.value) });
        status.set('Tersimpan.');
      } catch (error) { status.set(error.message, true); }
    });
    b.append(form);
    akar.append(b);
    return akar;
  }

  async function render() {
    const kepala = el('header', 'asr-head');
    const teks = el('div', 'asr-head__text');
    teks.append(el('p', 'wali-eyebrow', 'Pengingat tagihan'), el('h2', 'asr-head__title', 'Pengingat tagihan lewat WhatsApp'), el('p', 'mus-note', 'Lihat wali yang tagihannya belum lunas, susun pesan, dan buka WhatsApp untuk mengirim manual.'));
    kepala.append(teks);
    const tab = el('div', 'wali-tabs');
    tab.setAttribute('role', 'tablist');
    TAB.forEach(([id, label]) => {
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
      isi.replaceChildren(await { daftar: tabDaftar, riwayat: tabRiwayat, pengaturan: tabPengaturan }[state.tab]());
    } catch (error) {
      isi.replaceChildren(kosong(error.message || 'Halaman belum dapat dimuat.'));
    }
  }

  (async function mulai() {
    if (session()) document.body.classList.add('in-crm');
    try {
      const me = await window.hamasahMintaAkun(headers());
      const akun = me.body && me.body.account;
      if (!me.ok || !akun || !['admin', 'finance'].includes(akun.role)) throw new Error('Halaman ini untuk admin dan keuangan.');
      state.akun = akun;
      guard.hidden = true;
      konsol.hidden = false;
      document.body.classList.add('in-crm');
      renderStaffNav(staffNav, akun.role, 'pengingat', akun);
      await render();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Pengingat Tagihan belum tersedia';
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
