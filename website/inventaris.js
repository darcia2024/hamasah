// Inventaris asrama dan AC patungan. Admin dan musyrif: aset, pemeriksaan bulanan, dashboard. Admin, keuangan, dan musyrif (baca): AC.
// API: /api/inventaris/*, /api/ac/*. Semua teks lewat textContent; tanpa gaya sebaris (CSP).
(function initInventaris() {
  const guard = document.querySelector('#inv-guard');
  const guardCopy = document.querySelector('#inv-guard-copy');
  const konsol = document.querySelector('#inv-console');
  const app = document.querySelector('#inv-app');
  const staffNav = document.querySelector('#staff-nav');
  const RUPIAH = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const state = { akun: null, tab: null, asrama: [], opsi: null, pilihAsrama: '', bulan: new Date().toISOString().slice(0, 7) };

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
  const admin = () => role() === 'admin';
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
    kontrol.id = `iv-${Math.random().toString(36).slice(2, 8)}`;
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

  function pilihAsrama(ubah) {
    const s = pilihan(state.asrama.map((d) => [d.id, d.name]), state.pilihAsrama || (state.asrama[0] && state.asrama[0].id));
    state.pilihAsrama = s.value;
    s.addEventListener('change', () => { state.pilihAsrama = s.value; ubah(); });
    return s;
  }

  // ------------------------------------------------------------------ aset

  async function tabAset() {
    const akar = el('div', 'kg-stack');
    if (!state.asrama.length) { akar.append(kosong('Belum ada asrama yang Anda pegang.')); return akar; }
    const sel = pilihAsrama(() => muat().catch(() => {}));
    const cari = isian('search', '', { placeholder: 'Nama, kode, atau lokasi' });
    const kategori = pilihan([['', 'Semua kategori'], ...state.opsi.categories.map((c) => [c.id, c.label])]);
    const kondisi = pilihan([['', 'Semua kondisi'], ...state.opsi.conditions.map((c) => [c.id, c.label])]);
    const bar = el('div', 'kg-bar');
    bar.append(kolom('Asrama', sel), kolom('Cari', cari), kolom('Kategori', kategori), kolom('Kondisi', kondisi), tombol('Aset baru', 'button button--primary kg-small', () => formAset(null).catch(() => {})));
    const status = pesanStatus();
    const isi = el('div');
    const rincian = el('div');
    const b = bagian('Aset asrama', 'Kode, kategori, lokasi, jumlah, kondisi, foto, dan bukti pembelian. Setiap perubahan kondisi dan kejadian tercatat di riwayat aset.');
    b.append(bar, status, isi);
    akar.append(b, rincian);

    async function muat() {
      const params = new URLSearchParams();
      if (cari.value.trim()) params.set('q', cari.value.trim());
      if (kategori.value) params.set('category', kategori.value);
      if (kondisi.value) params.set('condition', kondisi.value);
      status.set('Memuat...');
      try {
        const data = await api('GET', `/api/inventaris/asrama/${encodeURIComponent(sel.value)}/aset?${params}&t=${Date.now()}`);
        status.set(`${data.totals.count} jenis aset · ${data.totals.quantity} unit · nilai ${RUPIAH.format(data.totals.value)} · rusak ${data.totals.damaged} · hilang ${data.totals.lost}.`);
        if (!data.items.length) { isi.replaceChildren(kosong('Belum ada aset yang cocok.')); return; }
        isi.replaceChildren(tabelStack(['Kode', 'Aset', 'Kategori', 'Lokasi', 'Jumlah', 'Kondisi', ''], data.items.map((a) => {
          const aksi = el('span', 'kg-bar');
          aksi.append(tombol('Rincian', 'wali-link', () => riwayat(a).catch((error) => status.set(error.message, true))), tombol('Ubah', 'wali-link', () => formAset(a).catch((error) => status.set(error.message, true))));
          return [a.code, a.name, a.categoryLabel, a.location || '-', a.quantity, a.conditionLabel, aksi];
        })));
      } catch (error) { status.set(error.message, true); }
    }

    async function formAset(aset) {
      const hasil = await window.HamasahDialog.formulir({
        judul: aset ? `Ubah ${aset.name}` : 'Aset baru',
        keterangan: aset ? '' : 'Kode dibuat otomatis bila dikosongkan. Foto dan bukti pembelian bersifat privat dan hanya terlihat staf asrama.',
        bidang: [
          { nama: 'name', label: 'Nama aset', nilai: aset ? aset.name : '', wajib: true },
          { nama: 'category', label: 'Kategori', jenis: 'select', pilihan: state.opsi.categories.map((c) => [c.id, c.label]), nilai: aset ? aset.category : 'lainnya' },
          { nama: 'code', label: 'Kode aset (opsional)', nilai: aset ? aset.code : '' },
          { nama: 'location', label: 'Lokasi (kamar atau ruang)', nilai: aset ? aset.location : '' },
          { nama: 'quantity', label: 'Jumlah', jenis: 'number', nilai: aset ? aset.quantity : 1, wajib: true },
          { nama: 'condition', label: 'Kondisi', jenis: 'select', pilihan: state.opsi.conditions.map((c) => [c.id, c.label]), nilai: aset ? aset.condition : 'baik' },
          { nama: 'purchasedOn', label: 'Tanggal beli (opsional)', jenis: 'date', nilai: aset ? aset.purchasedOn || '' : '' },
          { nama: 'unitPrice', label: 'Harga satuan Rp (opsional)', jenis: 'number', nilai: aset && aset.unitPrice !== null ? aset.unitPrice : '' },
          { nama: 'photo', label: 'Foto aset (opsional)', jenis: 'file', accept: 'image/jpeg,image/png,application/pdf', petunjuk: aset && aset.photoFileId ? 'Biarkan kosong untuk mempertahankan foto yang ada.' : 'JPG, PNG, atau PDF maksimal 5 MB.' },
          { nama: 'proof', label: 'Bukti pembelian (opsional)', jenis: 'file', accept: 'image/jpeg,image/png,application/pdf', petunjuk: aset && aset.proofFileId ? 'Biarkan kosong untuk mempertahankan bukti yang ada.' : '' },
          ...(aset ? [{ nama: 'eventNote', label: 'Keterangan bila kondisi berubah', jenis: 'textarea', nilai: '' }] : [])
        ],
        labelSimpan: aset ? 'Simpan' : 'Tambah aset',
        kirim: async (v) => {
          const badan = { name: v.name, category: v.category, code: v.code, location: v.location, quantity: Number(v.quantity), condition: v.condition, purchasedOn: v.purchasedOn || null, unitPrice: v.unitPrice === '' ? null : Number(v.unitPrice), eventNote: v.eventNote };
          if (v.photo) badan.photoFileId = await window.HamasahUnggah.kirim({ purpose: 'inventory-file', entityId: sel.value, berkas: v.photo, headers: headers() });
          if (v.proof) badan.proofFileId = await window.HamasahUnggah.kirim({ purpose: 'inventory-file', entityId: sel.value, berkas: v.proof, headers: headers() });
          return aset ? api('PATCH', `/api/inventaris/asrama/${encodeURIComponent(sel.value)}/aset/${encodeURIComponent(aset.id)}`, badan) : api('POST', `/api/inventaris/asrama/${encodeURIComponent(sel.value)}/aset`, badan);
        }
      });
      if (hasil) await muat();
    }

    async function riwayat(aset) {
      rincian.replaceChildren(kosong('Memuat riwayat...'));
      const data = await api('GET', `/api/inventaris/asrama/${encodeURIComponent(sel.value)}/aset/${encodeURIComponent(aset.id)}/riwayat?t=${Date.now()}`);
      const a = data.item;
      const r = bagian(`${a.code} · ${a.name}`, `${a.categoryLabel} · ${a.quantity} unit · ${a.conditionLabel}${a.location ? ` · ${a.location}` : ''}${a.value !== null ? ` · nilai ${RUPIAH.format(a.value)}` : ''}`);
      const aksi = el('div', 'kg-bar');
      if (a.photoFileId) aksi.append(tombol('Lihat foto', 'button button--secondary kg-small', () => window.HamasahUnggah.buka(a.photoFileId, headers()).catch((e) => status.set(e.message, true))));
      if (a.proofFileId) aksi.append(tombol('Lihat bukti pembelian', 'button button--secondary kg-small', () => window.HamasahUnggah.buka(a.proofFileId, headers()).catch((e) => status.set(e.message, true))));
      aksi.append(tombol('Catat kejadian', 'button button--primary kg-small', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: `Catat kejadian: ${a.name}`,
          keterangan: 'Kerusakan, kehilangan, perbaikan, dan temuan sekaligus mengubah kondisi aset. Perawatan dan catatan hanya masuk riwayat.',
          bidang: [
            { nama: 'kind', label: 'Jenis kejadian', jenis: 'select', pilihan: state.opsi.eventKinds.map((k) => [k.id, k.label]), nilai: 'perawatan' },
            { nama: 'note', label: 'Keterangan', jenis: 'textarea', wajib: true },
            { nama: 'occurredOn', label: 'Tanggal', jenis: 'date', nilai: new Date().toISOString().slice(0, 10), wajib: true },
            { nama: 'costRupiah', label: 'Biaya Rp (opsional)', jenis: 'number', nilai: '' },
            { nama: 'file', label: 'Bukti (opsional)', jenis: 'file', accept: 'image/jpeg,image/png,application/pdf' }
          ],
          labelSimpan: 'Catat',
          kirim: async (v) => {
            const fileId = v.file ? await window.HamasahUnggah.kirim({ purpose: 'inventory-file', entityId: sel.value, berkas: v.file, headers: headers() }) : undefined;
            return api('POST', `/api/inventaris/asrama/${encodeURIComponent(sel.value)}/aset/${encodeURIComponent(a.id)}/riwayat`, { kind: v.kind, note: v.note, occurredOn: v.occurredOn, costRupiah: v.costRupiah === '' ? undefined : Number(v.costRupiah), fileId });
          }
        });
        if (hasil) { await muat(); await riwayat(a); }
      }));
      r.append(aksi, el('h4', 'wali-subtitle', 'Riwayat'));
      if (!data.events.length) r.append(kosong('Belum ada riwayat.'));
      else {
        const ul = el('ul', 'wali-notes');
        data.events.forEach((e) => {
          const li = el('li', `wali-note is-${['kerusakan', 'kehilangan'].includes(e.kind) ? 'perlu' : ['perbaikan', 'temuan'].includes(e.kind) ? 'baik' : 'catatan'}`);
          const meta = el('div', 'wali-note__meta');
          meta.append(el('span', 'wali-note__kind', e.kindLabel), el('span', '', `${e.occurredOn}${e.by ? ` · ${e.by}` : ''}${e.cost !== null ? ` · ${RUPIAH.format(e.cost)}` : ''}`));
          li.append(meta, el('p', 'wali-note__body', e.note));
          if (e.fileId) li.append(tombol('Lihat bukti', 'wali-link', () => window.HamasahUnggah.buka(e.fileId, headers()).catch((error) => status.set(error.message, true))));
          ul.append(li);
        });
        r.append(ul);
      }
      rincian.replaceChildren(r);
      r.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    [kategori, kondisi].forEach((x) => x.addEventListener('change', () => muat().catch(() => {})));
    cari.addEventListener('change', () => muat().catch(() => {}));
    await muat();
    return akar;
  }

  // ------------------------------------------------------------------ pemeriksaan bulanan

  async function tabPemeriksaan() {
    const akar = el('div', 'kg-stack');
    if (!state.asrama.length) { akar.append(kosong('Belum ada asrama yang Anda pegang.')); return akar; }
    const sel = pilihAsrama(() => muat().catch(() => {}));
    const bulan = isian('month', state.bulan);
    const bar = el('div', 'kg-bar');
    bar.append(kolom('Asrama', sel), kolom('Bulan', bulan));
    const status = pesanStatus();
    const isi = el('div');
    const b = bagian('Pemeriksaan inventaris bulanan', 'Cocokkan jumlah dan kondisi aset dengan catatan. Saat diselesaikan, selisih diterapkan ke aset dan masuk riwayat.');
    b.append(bar, status, isi);
    akar.append(b);

    function gambar(c) {
      const wadah = el('div');
      wadah.append(el('p', c.status === 'selesai' ? 'kg-ok' : 'kg-warning', `${c.statusLabel}: ${c.checked} dari ${c.total} aset sudah diperiksa.`));
      const input = new Map();
      const baris = c.items.map((i) => {
        const jumlah = isian('number', i.foundQuantity === null ? '' : String(i.foundQuantity), { min: '0' });
        const kond = pilihan([['', 'Pilih...'], ...state.opsi.conditions.map((k) => [k.id, k.label])], i.foundCondition || '');
        const cat = isian('text', i.note || '', { maxlength: '300' });
        [jumlah, kond, cat].forEach((x) => { x.disabled = c.status === 'selesai'; });
        jumlah.setAttribute('aria-label', `Jumlah ditemukan ${i.name}`);
        kond.setAttribute('aria-label', `Kondisi ${i.name}`);
        cat.setAttribute('aria-label', `Catatan ${i.name}`);
        input.set(i.itemId, { jumlah, kond, cat });
        return [`${i.code ? `${i.code} · ` : ''}${i.name}${i.location ? ` (${i.location})` : ''}`, `${i.expectedQuantity} · ${i.expectedConditionLabel}`, jumlah, kond, cat];
      });
      wadah.append(c.items.length ? tabelStack(['Aset', 'Tercatat', 'Ditemukan', 'Kondisi', 'Catatan'], baris) : kosong('Belum ada aset di asrama ini.'));
      if (c.status !== 'selesai' && c.items.length) {
        const aksi = el('div', 'kg-bar');
        aksi.append(
          tombol('Isi sesuai catatan', 'button button--secondary kg-small', () => c.items.forEach((i) => { const x = input.get(i.itemId); if (x.jumlah.value === '') x.jumlah.value = String(i.expectedQuantity); if (!x.kond.value) x.kond.value = i.expectedCondition; })),
          tombol('Simpan hasil', 'button button--secondary kg-small', async () => { try { await api('PUT', `/api/inventaris/pemeriksaan/${encodeURIComponent(c.id)}`, { entries: kumpul(c, input) }); status.set('Hasil tersimpan.'); await muat(); } catch (error) { status.set(error.message, true); } }),
          tombol('Selesaikan pemeriksaan', 'button button--primary kg-small', async () => {
            if (!window.confirm('Selesaikan pemeriksaan? Selisih jumlah dan kondisi akan diterapkan ke aset dan tidak bisa diubah lagi.')) return;
            try {
              await api('PUT', `/api/inventaris/pemeriksaan/${encodeURIComponent(c.id)}`, { entries: kumpul(c, input) });
              const hasil = await api('POST', `/api/inventaris/pemeriksaan/${encodeURIComponent(c.id)}/selesai`, {});
              status.set(`Pemeriksaan selesai. ${hasil.adjusted} aset disesuaikan.`);
              await muat();
            } catch (error) { status.set(error.message, true); }
          })
        );
        wadah.append(aksi);
      }
      return wadah;
    }

    function kumpul(c, input) {
      return c.items.filter((i) => { const x = input.get(i.itemId); return x.jumlah.value !== '' && x.kond.value; }).map((i) => { const x = input.get(i.itemId); return { itemId: i.itemId, foundQuantity: Number(x.jumlah.value), foundCondition: x.kond.value, note: x.cat.value }; });
    }

    async function muat() {
      state.bulan = bulan.value;
      isi.replaceChildren(kosong('Memuat...'));
      status.set('');
      try {
        const data = await api('GET', `/api/inventaris/asrama/${encodeURIComponent(sel.value)}/pemeriksaan/${encodeURIComponent(bulan.value)}?t=${Date.now()}`);
        if (!data || data.id === undefined) {
          const mulai = tombol('Mulai pemeriksaan bulan ini', 'button button--primary kg-small', async () => { try { await api('POST', `/api/inventaris/asrama/${encodeURIComponent(sel.value)}/pemeriksaan`, { month: bulan.value }); await muat(); } catch (error) { status.set(error.message, true); } });
          isi.replaceChildren(kosong('Pemeriksaan bulan ini belum dimulai.'), mulai);
          return;
        }
        isi.replaceChildren(gambar(data));
      } catch (error) { isi.replaceChildren(kosong(error.message)); }
    }
    bulan.addEventListener('change', () => muat().catch(() => {}));
    await muat();
    return akar;
  }

  // ------------------------------------------------------------------ dashboard

  async function tabDashboard() {
    const akar = el('div', 'kg-stack');
    const data = await api('GET', `/api/inventaris/dashboard?t=${Date.now()}`);
    const b = bagian('Dashboard aset per asrama', `Ringkasan bulan ${data.month}. Pemeriksaan bulanan yang belum selesai ditandai.`);
    const kartu = el('div', 'kg-metrics');
    [['Total unit', data.totals.units], ['Nilai tercatat', RUPIAH.format(data.totals.value)], ['Unit rusak', data.totals.damaged], ['Unit hilang', data.totals.lost], ['Asrama belum diperiksa', data.totals.checkDue]].forEach(([l, v]) => {
      const k = el('div', 'kg-metric');
      k.append(el('strong', '', String(v)), el('span', '', l));
      kartu.append(k);
    });
    b.append(kartu);
    if (!data.items.length) b.append(kosong('Belum ada asrama.'));
    else b.append(tabelStack(['Asrama', 'Jenis aset', 'Unit', 'Nilai', 'Rusak', 'Hilang', 'Perlu perawatan', 'AC', 'Pemeriksaan bulan ini'], data.items.map((i) => [i.name, i.itemTypes, i.units, RUPIAH.format(i.value), i.damaged, i.lost, i.maintenance, `${i.ac.hamasah} milik Hamasah, ${i.ac.patungan} patungan`, i.thisMonthCheck === 'selesai' ? `Selesai (terakhir ${i.lastCheck})` : (i.thisMonthCheck === 'berjalan' ? 'Sedang berjalan' : `Belum dimulai${i.lastCheck ? ` (terakhir ${i.lastCheck})` : ''}`)])));
    akar.append(b);
    return akar;
  }

  // ------------------------------------------------------------------ AC patungan

  async function tabAc() {
    const akar = el('div', 'kg-stack');
    const data = await api('GET', `/api/ac/unit?t=${Date.now()}`);
    const status = pesanStatus();
    const unit = bagian('AC asrama', 'Tandai AC milik Hamasah sepenuhnya atau hasil patungan. Pada AC patungan, kontribusi santri dicatat terpisah antara pembelian dan pemasangan, beserta ketentuan pengembaliannya.');
    if (data.canManage) unit.append(tombol('Tambah AC', 'button button--primary kg-small', () => formUnit(null).catch((error) => status.set(error.message, true))));
    unit.append(status);
    unit.append(data.items.length ? tabelStack(['AC', 'Asrama', 'Kamar', 'Kepemilikan', 'Beli / pasang', 'Penyumbang', ''], data.items.map((u) => {
      const aksi = el('span', 'kg-bar');
      if (data.canManage) aksi.append(tombol('Ubah', 'wali-link', () => formUnit(u).catch((error) => status.set(error.message, true))));
      if (data.canManage && u.ownership === 'patungan') aksi.append(tombol('Kontribusi', 'button button--secondary kg-small', () => kontribusi(u).catch((error) => status.set(error.message, true))));
      return [u.label, u.dormitoryName, u.roomName || '-', u.ownershipLabel, `${RUPIAH.format(u.purchaseTotal)} / ${RUPIAH.format(u.installTotal)}`, u.ownership === 'patungan' ? u.contributors : '-', aksi];
    })) : kosong('Belum ada AC yang dicatat.'));
    akar.append(unit);
    const rincian = el('div');
    akar.append(rincian);

    async function formUnit(u) {
      const hasil = await window.HamasahDialog.formulir({
        judul: u ? `Ubah ${u.label}` : 'AC baru',
        keterangan: 'AC patungan wajib memuat ketentuan pengembalian: apa yang dikembalikan, kapan, dan dengan potongan apa.',
        bidang: [
          { nama: 'dormitoryId', label: 'Asrama', jenis: 'select', pilihan: data.dormitories.map((d) => [d.id, d.name]), nilai: u ? u.dormitoryId : data.dormitories[0] && data.dormitories[0].id },
          { nama: 'roomId', label: 'Kamar (opsional)', jenis: 'select', pilihan: [['', 'Tidak dikaitkan ke kamar'], ...data.rooms.map((r) => [r.id, r.name])], nilai: u ? u.roomId || '' : '' },
          { nama: 'label', label: 'Label AC', nilai: u ? u.label : '', wajib: true },
          { nama: 'ownership', label: 'Kepemilikan', jenis: 'select', pilihan: [['patungan', 'Hasil patungan santri'], ['hamasah', 'Milik Hamasah sepenuhnya']], nilai: u ? u.ownership : 'patungan' },
          { nama: 'purchaseTotal', label: 'Total biaya pembelian (Rp)', jenis: 'number', nilai: u ? u.purchaseTotal : 0 },
          { nama: 'installTotal', label: 'Total biaya pemasangan (Rp)', jenis: 'number', nilai: u ? u.installTotal : 0 },
          { nama: 'purchasedOn', label: 'Tanggal beli (opsional)', jenis: 'date', nilai: u ? u.purchasedOn || '' : '' },
          { nama: 'refundPurchase', label: 'Kontribusi pembelian dapat dikembalikan', jenis: 'select', pilihan: [['true', 'Ya'], ['false', 'Tidak']], nilai: u ? String(u.refundPurchase) : 'true' },
          { nama: 'refundInstall', label: 'Biaya pemasangan dapat dikembalikan', jenis: 'select', pilihan: [['false', 'Tidak'], ['true', 'Ya']], nilai: u ? String(u.refundInstall) : 'false' },
          { nama: 'terms', label: 'Ketentuan pengembalian', jenis: 'textarea', nilai: u ? u.terms : '' },
          { nama: 'proof', label: 'Bukti pembelian AC (opsional)', jenis: 'file', accept: 'image/jpeg,image/png,application/pdf' }
        ],
        labelSimpan: u ? 'Simpan' : 'Tambah AC',
        kirim: async (v) => {
          const badan = { dormitoryId: v.dormitoryId, roomId: v.roomId || null, label: v.label, ownership: v.ownership, purchaseTotal: Number(v.purchaseTotal || 0), installTotal: Number(v.installTotal || 0), purchasedOn: v.purchasedOn || null, refundPurchase: v.refundPurchase === 'true', refundInstall: v.refundInstall === 'true', terms: v.terms };
          if (v.proof) badan.proofFileId = await window.HamasahUnggah.kirim({ purpose: 'ac-proof', entityId: v.dormitoryId, berkas: v.proof, headers: headers() });
          return u ? api('PATCH', `/api/ac/unit/${encodeURIComponent(u.id)}`, badan) : api('POST', '/api/ac/unit', badan);
        }
      });
      if (hasil) render().catch(() => {});
    }

    async function kontribusi(u) {
      rincian.replaceChildren(kosong('Memuat kontribusi...'));
      const d = await api('GET', `/api/ac/unit/${encodeURIComponent(u.id)}/kontribusi?t=${Date.now()}`);
      const r = bagian(`Kontribusi ${d.unit.label}`, `Ketentuan: ${d.unit.terms || '-'} · pembelian terkumpul ${RUPIAH.format(d.unit.purchaseCollected)} dari ${RUPIAH.format(d.unit.purchaseTotal)}, pemasangan ${RUPIAH.format(d.unit.installCollected)} dari ${RUPIAH.format(d.unit.installTotal)}.`);
      r.append(tombol('Catat kontribusi', 'button button--primary kg-small', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: 'Catat kontribusi santri',
          bidang: [
            { nama: 'studentId', label: 'Santri', jenis: 'select', pilihan: d.students.map((s) => [s.id, s.name]), nilai: d.students[0] && d.students[0].id, wajib: true },
            { nama: 'kind', label: 'Jenis kontribusi', jenis: 'select', pilihan: data.kinds.map((k) => [k.id, k.label]), nilai: 'pembelian' },
            { nama: 'amount', label: 'Nominal (Rp)', jenis: 'number', wajib: true },
            { nama: 'paidOn', label: 'Tanggal bayar', jenis: 'date', nilai: new Date().toISOString().slice(0, 10), wajib: true },
            { nama: 'note', label: 'Catatan (opsional)', nilai: '' },
            { nama: 'proof', label: 'Bukti pembayaran (opsional)', jenis: 'file', accept: 'image/jpeg,image/png,application/pdf' }
          ],
          labelSimpan: 'Catat',
          kirim: async (v) => {
            const fileId = v.proof ? await window.HamasahUnggah.kirim({ purpose: 'ac-proof', entityId: d.unit.dormitoryId, berkas: v.proof, headers: headers() }) : undefined;
            return api('POST', `/api/ac/unit/${encodeURIComponent(u.id)}/kontribusi`, { studentId: v.studentId, kind: v.kind, amount: Number(v.amount), paidOn: v.paidOn, note: v.note, proofFileId: fileId });
          }
        });
        if (hasil) { await kontribusi(u); }
      }));
      r.append(d.items.length ? tabelStack(['Santri', 'Jenis', 'Nominal', 'Tanggal', 'Status', ''], d.items.map((k) => {
        const aksi = el('span', 'kg-bar');
        if (k.proofFileId) aksi.append(tombol('Bukti', 'wali-link', () => window.HamasahUnggah.buka(k.proofFileId, headers()).catch((error) => status.set(error.message, true))));
        if (!k.voided) aksi.append(tombol('Batalkan', 'wali-link', async () => {
          const hasil = await window.HamasahDialog.formulir({ judul: 'Batalkan kontribusi', bidang: [{ nama: 'reason', label: 'Alasan', jenis: 'textarea', wajib: true }], labelSimpan: 'Batalkan', kirim: (v) => api('POST', `/api/ac/kontribusi/${encodeURIComponent(k.id)}/batal`, v) });
          if (hasil) await kontribusi(u);
        }));
        return [k.studentName, k.kindLabel, RUPIAH.format(k.amount), k.paidOn, k.voided ? `Dibatalkan: ${k.voidReason}` : 'Tercatat', aksi];
      })) : kosong('Belum ada kontribusi.'));
      rincian.replaceChildren(r);
      r.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (data.canManage) akar.append(await bagianRefund(data, status));
    return akar;
  }

  async function bagianRefund(dataUnit, status) {
    const r = bagian('Refund AC saat santri keluar', 'Hanya santri yang berkontribusi pada AC patungan yang berhak. Tinggal di kamar ber-AC tidak otomatis berhak atas pengembalian dana.');
    r.append(tombol('Periksa hak refund santri', 'button button--secondary kg-small', async () => {
      // Hanya santri yang punya kontribusi tercatat yang bisa berhak refund, jadi daftar diambil dari kontribusi AC patungan.
      const unik = new Map();
      for (const u of dataUnit.items.filter((x) => x.ownership === 'patungan' && x.contributors > 0)) {
        const k = await api('GET', `/api/ac/unit/${encodeURIComponent(u.id)}/kontribusi`).catch(() => ({ items: [] }));
        k.items.filter((c) => !c.voided).forEach((c) => unik.set(c.studentId, { id: c.studentId, name: c.studentName }));
      }
      const siswa = [...unik.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
      if (!siswa.length) { status.set('Belum ada santri yang punya kontribusi AC tercatat, jadi belum ada yang berhak refund.', true); return; }
      const hasil = await window.HamasahDialog.formulir({
        judul: 'Periksa hak refund',
        keterangan: 'Pilih santri yang keluar. Sistem menampilkan hak refund menurut kontribusi dan ketentuan tiap AC.',
        bidang: [{ nama: 'studentId', label: 'Santri', jenis: 'select', pilihan: siswa.map((s) => [s.id, s.name]), nilai: siswa[0] && siswa[0].id, wajib: true }],
        labelSimpan: 'Periksa',
        kirim: (v) => api('GET', `/api/ac/santri/${encodeURIComponent(v.studentId)}/refund`)
      });
      if (!hasil) return;
      const ringkas = [hasil.note, ...hasil.entitlements.map((h) => `${h.label} (${h.dormitoryName}): hak ${RUPIAH.format(h.eligibleAmount)} · pembelian ${RUPIAH.format(h.purchaseContribution)}${h.refundPurchase ? '' : ' (tidak dikembalikan)'} · pemasangan ${RUPIAH.format(h.installContribution)}${h.refundInstall ? '' : ' (tidak dikembalikan)'}${h.existingRefundStatus ? ` · refund ${h.existingRefundStatus}` : ''}`)];
      if (!hasil.left) ringkas.push('Santri ini masih aktif: pengajuan refund dibuat setelah santri keluar.');
      await window.HamasahDialog.pesan({ judul: `Hak refund ${hasil.studentName}`, isi: ringkas });
      if (hasil.left && hasil.entitlements.some((h) => h.eligibleAmount > 0 && !h.existingRefundId) && window.confirm('Buat pengajuan refund untuk santri ini?')) {
        try { await api('POST', `/api/ac/santri/${encodeURIComponent(hasil.studentId)}/refund`, {}); render().catch(() => {}); } catch (error) { status.set(error.message, true); }
      }
    }));
    const isi = el('div');
    r.append(isi);
    const data = await api('GET', `/api/ac/refund?t=${Date.now()}`);
    isi.append(data.items.length ? tabelStack(['Santri', 'AC', 'Hak', 'Disetujui', 'Status', ''], data.items.map((f) => {
      const aksi = el('span', 'kg-bar');
      if (f.status === 'diajukan' && data.canApprove) aksi.append(tombol('Putuskan', 'button button--primary kg-small', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: `Putusan refund ${f.studentName}`,
          keterangan: `${f.basis}\nHak refund: ${RUPIAH.format(f.eligibleAmount)}.`,
          bidang: [
            { nama: 'decision', label: 'Keputusan', jenis: 'select', pilihan: [['disetujui', 'Setujui'], ['ditolak', 'Tolak']], nilai: 'disetujui' },
            { nama: 'approvedAmount', label: 'Nominal disetujui (Rp)', jenis: 'number', nilai: f.eligibleAmount },
            { nama: 'note', label: 'Catatan (wajib bila ditolak atau nominal dikurangi)', jenis: 'textarea', nilai: '' }
          ],
          labelSimpan: 'Simpan putusan',
          kirim: (v) => api('POST', `/api/ac/refund/${encodeURIComponent(f.id)}/putusan`, { decision: v.decision, approvedAmount: v.decision === 'disetujui' ? Number(v.approvedAmount) : undefined, note: v.note })
        });
        if (hasil) render().catch(() => {});
      }));
      if (f.status === 'disetujui') aksi.append(tombol('Cairkan', 'button button--primary kg-small', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: `Pencairan refund ${f.studentName}`,
          keterangan: `Nominal ${RUPIAH.format(f.approvedAmount)}. Bukti pencairan wajib dilampirkan.`,
          bidang: [
            { nama: 'disbursedOn', label: 'Tanggal pencairan', jenis: 'date', nilai: new Date().toISOString().slice(0, 10), wajib: true },
            { nama: 'proof', label: 'Bukti pencairan', jenis: 'file', accept: 'image/jpeg,image/png,application/pdf', wajib: true }
          ],
          labelSimpan: 'Tandai dicairkan',
          kirim: async (v) => {
            const fileId = await window.HamasahUnggah.kirim({ purpose: 'ac-proof', entityId: await dormitoriAc(f), berkas: v.proof, headers: headers() });
            return api('POST', `/api/ac/refund/${encodeURIComponent(f.id)}/cairkan`, { disbursedOn: v.disbursedOn, proofFileId: fileId });
          }
        });
        if (hasil) render().catch(() => {});
      }));
      if (f.disbursementProofFileId) aksi.append(tombol('Bukti pencairan', 'wali-link', () => window.HamasahUnggah.buka(f.disbursementProofFileId, headers()).catch((error) => status.set(error.message, true))));
      return [f.studentName, `${f.acLabel} (${f.dormitoryName})`, RUPIAH.format(f.eligibleAmount), f.approvedAmount === null ? '-' : RUPIAH.format(f.approvedAmount), f.statusLabel + (f.decisionNote ? ` (${f.decisionNote})` : ''), aksi];
    })) : kosong('Belum ada pengajuan refund.'));
    return r;
  }

  // Bukti pencairan diunggah atas nama asrama AC yang bersangkutan (kunci kepemilikan berkas).
  async function dormitoriAc(refund) {
    const unit = (await api('GET', '/api/ac/unit')).items.find((u) => u.id === refund.acId);
    return unit ? unit.dormitoryId : '';
  }

  // ------------------------------------------------------------------ rangka

  function daftarTab() {
    if (role() === 'finance') return [['ac', 'AC dan refund']];
    return [['aset', 'Aset asrama'], ['pemeriksaan', 'Pemeriksaan bulanan'], ['dashboard', 'Dashboard aset'], ['ac', 'AC patungan']];
  }

  async function render() {
    const tabs = daftarTab();
    if (!state.tab || !tabs.some(([id]) => id === state.tab)) state.tab = tabs[0][0];
    const kepala = el('header', 'asr-head');
    const teks = el('div', 'asr-head__text');
    teks.append(el('p', 'wali-eyebrow', 'Inventaris dan AC'), el('h2', 'asr-head__title', 'Inventaris asrama dan AC patungan'), el('p', 'mus-note', 'Catat aset, periksa tiap bulan, dan kelola kontribusi serta refund AC.'));
    kepala.append(teks);
    const tab = el('div', 'wali-tabs');
    tab.setAttribute('role', 'tablist');
    tabs.forEach(([id, label]) => {
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
      isi.replaceChildren(await { aset: tabAset, pemeriksaan: tabPemeriksaan, dashboard: tabDashboard, ac: tabAc }[state.tab]());
    } catch (error) {
      isi.replaceChildren(kosong(error.message || 'Halaman belum dapat dimuat.'));
    }
  }

  (async function mulai() {
    if (session()) document.body.classList.add('in-crm');
    try {
      const me = await window.hamasahMintaAkun(headers());
      const akun = me.body && me.body.account;
      if (!me.ok || !akun || !['admin', 'supervisor', 'finance'].includes(akun.role)) throw new Error('Halaman ini untuk admin, musyrif, dan keuangan.');
      state.akun = akun;
      guard.hidden = true;
      konsol.hidden = false;
      document.body.classList.add('in-crm');
      renderStaffNav(staffNav, akun.role, 'inventaris', akun);
      if (akun.role !== 'finance') {
        const d = await api('GET', '/api/inventaris/asrama');
        state.asrama = d.items;
        state.opsi = d;
      }
      await render();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Inventaris dan AC belum tersedia';
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
