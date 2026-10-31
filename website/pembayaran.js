// Pembayaran (admin dan keuangan): status integrasi dengan website pembayaran (Xendit) dan rekonsiliasi transaksi.
// Tahap persiapan: tidak menghubungi Xendit. API: /api/pembayaran/*. Semua teks lewat textContent; tanpa gaya sebaris (CSP).
(function initPembayaran() {
  const guard = document.querySelector('#byr-guard');
  const guardCopy = document.querySelector('#byr-guard-copy');
  const konsol = document.querySelector('#byr-console');
  const app = document.querySelector('#byr-app');
  const staffNav = document.querySelector('#staff-nav');
  const RUPIAH = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const WAKTU = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' });
  const TAB = [['rekonsiliasi', 'Rekonsiliasi transaksi'], ['integrasi', 'Status integrasi']];
  const state = { akun: null, tab: 'rekonsiliasi', filter: 'baru' };

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

  function kolom(label, kontrol, petunjuk) {
    const b = el('div', 'wali-form__row');
    const l = el('label', 'wali-field__label', label);
    kontrol.id = `by-${Math.random().toString(36).slice(2, 8)}`;
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

  // ------------------------------------------------------------------ rekonsiliasi

  // Ekspor website pembayaran biasanya CSV: referensi, nominal, tanggal, nomor tagihan, nama. Kolom dikenali dari judulnya.
  function uraiCsv(teks) {
    const baris = teks.split(/\r?\n/).map((b) => b.trim()).filter(Boolean);
    if (baris.length < 2) throw new Error('Tempelkan judul kolom dan minimal satu baris data.');
    const pemisah = (baris[0].match(/;/g) || []).length > (baris[0].match(/,/g) || []).length ? ';' : (baris[0].includes('\t') ? '\t' : ',');
    const pecah = (b) => b.split(pemisah).map((x) => x.trim().replace(/^"|"$/g, ''));
    const judul = pecah(baris[0]).map((j) => j.toLowerCase());
    const cari = (...kata) => judul.findIndex((j) => kata.some((k) => j.includes(k)));
    const idx = { ref: cari('referensi', 'reference', 'ref', 'id transaksi', 'transaction'), nominal: cari('nominal', 'amount', 'jumlah'), tanggal: cari('tanggal', 'date', 'waktu'), tagihan: cari('tagihan', 'invoice'), nama: cari('nama', 'payer', 'pembayar') };
    if (idx.ref < 0 || idx.nominal < 0 || idx.tanggal < 0) throw new Error('Judul kolom harus memuat referensi, nominal, dan tanggal.');
    return baris.slice(1).map((b) => {
      const sel = pecah(b);
      const tanggalMentah = sel[idx.tanggal] || '';
      const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(tanggalMentah);
      const tanggal = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : tanggalMentah.slice(0, 10);
      return { source: 'xendit', externalRef: sel[idx.ref], amount: Number(String(sel[idx.nominal]).replace(/[^\d]/g, '')), paidOn: tanggal, invoiceNumber: idx.tagihan >= 0 ? sel[idx.tagihan] : '', payerName: idx.nama >= 0 ? sel[idx.nama] : '' };
    });
  }

  async function tabRekonsiliasi() {
    const akar = el('div', 'kg-stack');
    const b = bagian('Rekonsiliasi pembayaran dari website pembayaran', 'Catat transaksi dari website pembayaran, cocokkan ke tagihan, lalu terapkan. Semua pelunasan tetap lewat satu jalur yang sama dengan pelunasan manual (kuitansi dan jejak audit ikut), sehingga tidak ada dua sistem yang menandai lunas sendiri-sendiri.');
    const status = pesanStatus();
    const bar = el('div', 'kg-bar');
    const saring = pilihan([['baru', 'Menunggu diterapkan'], ['diterapkan', 'Sudah diterapkan'], ['ditolak', 'Ditolak'], ['', 'Semua']], state.filter);
    bar.append(kolom('Tampilkan', saring), tombol('Catat transaksi', 'button button--primary kg-small', () => catat().catch(() => {})), tombol('Impor dari ekspor (CSV)', 'button button--secondary kg-small', () => impor().catch(() => {})));
    const daftar = el('div');
    b.append(bar, status, daftar);
    akar.append(b);

    async function muat() {
      state.filter = saring.value;
      status.set('Memuat...');
      try {
        const data = await api('GET', `/api/pembayaran/transaksi?status=${encodeURIComponent(saring.value)}&t=${Date.now()}`);
        status.set(data.items.length ? `${data.items.length} transaksi.` : 'Tidak ada transaksi pada pilihan ini.');
        if (!data.items.length) { daftar.replaceChildren(); return; }
        daftar.replaceChildren(tabelStack(['Referensi', 'Tanggal', 'Nominal', 'Tagihan', 'Status', ''], data.items.map((t) => {
          const aksi = el('span', 'kg-bar');
          if (t.status === 'baru') {
            if (!t.matchedInvoiceId) aksi.append(tombol('Cocokkan', 'wali-link', async () => {
              const hasil = await window.HamasahDialog.formulir({ judul: 'Cocokkan ke tagihan', bidang: [{ nama: 'invoiceNumber', label: 'Nomor tagihan (INV/HI/…)', wajib: true }], labelSimpan: 'Cocokkan', kirim: (v) => api('PATCH', `/api/pembayaran/transaksi/${encodeURIComponent(t.id)}/tagihan`, v) });
              if (hasil) await muat();
            }));
            else aksi.append(tombol('Terapkan', 'button button--primary kg-small', () => terapkan(t, muat)));
            aksi.append(tombol('Tolak', 'wali-link', async () => {
              const hasil = await window.HamasahDialog.formulir({ judul: 'Tolak transaksi', bidang: [{ nama: 'reason', label: 'Alasan (mis. pembayaran ganda)', jenis: 'textarea', wajib: true }], labelSimpan: 'Tolak', kirim: (v) => api('POST', `/api/pembayaran/transaksi/${encodeURIComponent(t.id)}/tolak`, v) });
              if (hasil) await muat();
            }));
          }
          const tagihan = t.matchedInvoiceNumber ? `${t.matchedInvoiceNumber}${t.studentName ? ` · ${t.studentName}` : ''} (${RUPIAH.format(t.invoiceAmount)}${t.amountMatches === false ? ', nominal berbeda' : ''}${t.invoiceStatus === 'paid' ? ', sudah lunas' : ''})` : (t.invoiceNumberReported ? `${t.invoiceNumberReported} (tidak ditemukan)` : 'Belum dicocokkan');
          return [t.externalRef, t.paidOn, RUPIAH.format(t.amount), tagihan, t.statusLabel + (t.note && t.status === 'ditolak' ? ` (${t.note})` : ''), aksi];
        })));
      } catch (error) { status.set(error.message, true); }
    }

    async function terapkan(t, muatUlang) {
      const beda = t.amountMatches === false;
      const bidang = beda && admin() ? [{ nama: 'mismatchReason', label: 'Alasan selisih nominal', jenis: 'textarea', wajib: true }] : [];
      const hasil = await window.HamasahDialog.formulir({
        judul: `Terapkan ${t.externalRef}`,
        keterangan: `${RUPIAH.format(t.amount)} akan menandai ${t.matchedInvoiceNumber} lunas dan menerbitkan kuitansi.${beda ? ' Nominal transaksi berbeda dari tagihan; hanya admin yang dapat menerapkannya.' : ''}`,
        bidang,
        labelSimpan: 'Tandai lunas',
        kirim: (v) => api('POST', `/api/pembayaran/transaksi/${encodeURIComponent(t.id)}/terapkan`, beda ? { allowMismatch: true, mismatchReason: v.mismatchReason } : {})
      });
      if (hasil) await muatUlang();
    }

    async function catat() {
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Catat transaksi',
        bidang: [
          { nama: 'externalRef', label: 'Nomor referensi transaksi', wajib: true },
          { nama: 'amount', label: 'Nominal (Rp)', jenis: 'number', wajib: true },
          { nama: 'paidOn', label: 'Tanggal bayar', jenis: 'date', nilai: new Date().toISOString().slice(0, 10), wajib: true },
          { nama: 'invoiceNumber', label: 'Nomor tagihan (bila ada)', nilai: '' },
          { nama: 'payerName', label: 'Nama pembayar (opsional)', nilai: '' }
        ],
        labelSimpan: 'Catat',
        kirim: (v) => api('POST', '/api/pembayaran/transaksi', { source: 'xendit', externalRef: v.externalRef, amount: Number(v.amount), paidOn: v.paidOn, invoiceNumber: v.invoiceNumber, payerName: v.payerName })
      });
      if (hasil) await muat();
    }

    async function impor() {
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Impor transaksi',
        keterangan: 'Tempelkan isi ekspor CSV dari website pembayaran. Baris pertama berisi judul kolom: referensi, nominal, tanggal, dan (opsional) nomor tagihan dan nama. Referensi yang sudah pernah dicatat dilewati.',
        bidang: [{ nama: 'csv', label: 'Isi CSV', jenis: 'textarea', wajib: true }],
        labelSimpan: 'Impor',
        kirim: async (v) => api('POST', '/api/pembayaran/impor', { rows: uraiCsv(v.csv) })
      });
      if (hasil) {
        status.set(`${hasil.imported} transaksi masuk, ${hasil.failed} dilewati${hasil.errors.length ? `: ${hasil.errors.slice(0, 3).map((e) => `baris ${e.row} (${e.error})`).join('; ')}` : ''}.`, hasil.failed > 0);
        await muat();
      }
    }

    saring.addEventListener('change', () => muat().catch(() => {}));
    await muat();
    return akar;
  }

  // ------------------------------------------------------------------ status integrasi

  async function tabIntegrasi() {
    const akar = el('div', 'kg-stack');
    const data = await api('GET', `/api/pembayaran/pengaturan?t=${Date.now()}`);
    const c = data.config;
    const status = pesanStatus();

    const atas = bagian('Rekomendasi rapat', 'Jangan membangun ulang payment gateway. Audit website pembayaran yang sudah ada, periksa API dan webhook yang sah, lalu putuskan integrasi atau migrasi penuh bersama tim IT Hamasah.');
    atas.append(el('p', 'kg-warning', data.automaticSync.reason));

    const tautan = bagian('Tautan ke halaman pembayaran', 'Wali dan santri melihat tombol ini di tagihan, dan tautannya ikut dalam pesan pengingat WhatsApp. Harus alamat https.');
    const form = el('form', 'wali-form');
    form.noValidate = true;
    const url = isian('url', c.paymentUrl || '', { placeholder: 'https://…' });
    const nama = isian('text', c.providerName || 'Xendit', { maxlength: '60' });
    const mode = pilihan(data.modes.map((m) => [m.id, m.label]), c.mode);
    form.append(kolom('Nama penyedia', nama), kolom('Alamat halaman pembayaran', url), kolom('Mode', mode, data.canReconcileMode ? 'Rekonsiliasi dapat dipilih.' : 'Mode rekonsiliasi baru bisa dipilih setelah audit menyatakan akses integrasi yang sah ada dan nomor tagihan dapat dipetakan.'));
    if (admin()) {
      const simpan = el('button', 'button button--primary wali-action', 'Simpan');
      simpan.type = 'submit';
      form.append(simpan);
    } else form.querySelectorAll('input,select').forEach((x) => { x.disabled = true; });
    form.append(status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await api('PUT', '/api/pembayaran/pengaturan', { providerName: nama.value, paymentUrl: url.value, mode: mode.value }); status.set('Tersimpan.'); render().catch(() => {}); } catch (error) { status.set(error.message, true); }
    });
    tautan.append(form);

    const auditBagian = bagian('Daftar audit', 'Diisi bersama tim IT. Butir yang belum "ya" menahan mode rekonsiliasi.');
    auditBagian.append(tabelStack(['Butir', 'Status', 'Catatan', ''], data.audit.map((a) => {
      const aksi = el('span');
      if (admin()) aksi.append(tombol('Ubah', 'wali-link', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: a.title,
          bidang: [
            { nama: 'status', label: 'Status', jenis: 'select', pilihan: data.auditStatuses.map((s) => [s.id, s.label]), nilai: a.status },
            { nama: 'note', label: 'Catatan (wajib bila tidak tersedia atau perlu konfirmasi)', jenis: 'textarea', nilai: a.note || '' }
          ],
          labelSimpan: 'Simpan',
          kirim: (v) => api('PUT', `/api/pembayaran/audit/${encodeURIComponent(a.code)}`, v)
        });
        if (hasil) render().catch(() => {});
      }));
      return [a.title, a.statusLabel, a.note || '-', aksi];
    })));

    const keputusan = bagian('Keputusan', 'Migrasi penuh atau integrasi harus diputuskan bersama tim IT Hamasah.');
    keputusan.append(el('p', c.decision === 'belum-final' ? 'kg-warning' : 'kg-ok', `${data.decisions.find((d) => d.id === c.decision).label}${c.decidedAt ? ` · ${WAKTU.format(new Date(c.decidedAt))}` : ''}${c.decisionNote ? ` · ${c.decisionNote}` : ''}`));
    if (admin()) keputusan.append(tombol('Catat keputusan', 'button button--secondary kg-small', async () => {
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Catat keputusan',
        bidang: [
          { nama: 'decision', label: 'Keputusan', jenis: 'select', pilihan: data.decisions.map((d) => [d.id, d.label]), nilai: c.decision },
          { nama: 'decisionNote', label: 'Dasar keputusan (bersama tim IT)', jenis: 'textarea', nilai: c.decisionNote || '' }
        ],
        labelSimpan: 'Simpan',
        kirim: (v) => api('PUT', '/api/pembayaran/pengaturan', v)
      });
      if (hasil) render().catch(() => {});
    }));
    akar.append(atas, tautan, auditBagian, keputusan);
    return akar;
  }

  async function render() {
    const kepala = el('header', 'asr-head');
    const teks = el('div', 'asr-head__text');
    teks.append(el('p', 'wali-eyebrow', 'Pembayaran'), el('h2', 'asr-head__title', 'Integrasi dan rekonsiliasi pembayaran'), el('p', 'mus-note', 'Persiapan sebelum keputusan teknis final: satu jalur pelunasan, tautan ke website pembayaran, dan rekonsiliasi transaksi.'));
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
      isi.replaceChildren(await (state.tab === 'integrasi' ? tabIntegrasi() : tabRekonsiliasi()));
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
      renderStaffNav(staffNav, akun.role, 'pembayaran', akun);
      await render();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Pembayaran belum tersedia';
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
