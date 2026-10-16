// Kelola Asrama (16 Oktober 2026): jadwal kegiatan rutin, agenda acara, piket, uang kas
// dan iuran, serta inventaris asrama. Untuk musyrif (asrama yang dipegang) dan admin.
// Data: /api/asrama (dormitory-management-service.js). Jadwal dan piket ikut tampil di
// beranda santri dan wali. Semua teks dipasang lewat textContent.
(function initKelolaAsrama() {
  const guard = document.querySelector('#asrama-guard');
  const guardCopy = document.querySelector('#asrama-guard-copy');
  const konsol = document.querySelector('#asrama-console');
  const app = document.querySelector('#asrama-app');
  const staffNav = document.querySelector('#staff-nav');
  const K = window.HamasahBerandaKeluarga || {};
  const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Ahad'];
  const KATEGORI_KAS = ['iuran', 'konsumsi', 'kebersihan', 'perlengkapan', 'kegiatan', 'lainnya'];
  const KONDISI = [['baik', 'Baik'], ['rusak', 'Rusak'], ['hilang', 'Hilang']];
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const BULAN = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const TAB_KUNCI = 'hamasahAsramaTab';

  let asramaAktif = null;
  let daftarAsrama = [];
  let data = null;
  let tabAktif = 'kalender';
  let bulan = null;
  let nomor = 0;
  // Pesan berhasil tingkat halaman: panel digambar ulang setelah data dimuat ulang, jadi
  // pesan di dalam formulir lama ikut hilang.
  let kabar = '';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tombol(teks, kelas = 'button button--secondary') {
    const b = el('button', kelas, teks);
    b.type = 'button';
    return b;
  }

  function idBaru(awalan) {
    nomor += 1;
    return `${awalan}-${nomor}`;
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

  function rupiah(n) {
    return `Rp${(Number(n) || 0).toLocaleString('id-ID')}`;
  }

  function tanggal(iso) {
    return iso ? TANGGAL.format(new Date(`${iso}T00:00:00Z`)) : '';
  }

  function bidang(label, jenis = 'text', { nilai = '', placeholder = '', daftar = null } = {}) {
    const wadah = el('div', 'mus-field');
    const id = idBaru('asr');
    const lbl = el('label', 'mus-label', label);
    lbl.htmlFor = id;
    const input = jenis === 'textarea' ? el('textarea', 'mus-input mus-input--area') : el('input', 'mus-input');
    if (jenis !== 'textarea') input.type = jenis;
    input.id = id;
    input.value = nilai;
    input.placeholder = placeholder;
    wadah.append(lbl, input);
    if (daftar) {
      const dl = el('datalist');
      dl.id = idBaru('saran');
      daftar.forEach((v) => { const o = el('option'); o.value = v; dl.append(o); });
      input.setAttribute('list', dl.id);
      wadah.append(dl);
    }
    return { el: wadah, input, nilai: () => input.value.trim(), setel: (v) => { input.value = v; } };
  }

  function pilihan(label, opsi, awal, { banyak = false } = {}) {
    const wadah = el('fieldset', 'mus-seg mus-seg--kecil');
    if (label) wadah.append(el('legend', 'mus-label', label));
    const baris = el('div', 'mus-seg__row');
    const nama = idBaru('pilih');
    const input = opsi.map(([nilai, teks]) => {
      const id = idBaru('opsi');
      const r = el('input');
      r.type = banyak ? 'checkbox' : 'radio';
      r.name = nama;
      r.value = String(nilai);
      r.id = id;
      r.checked = Array.isArray(awal) ? awal.map(String).includes(String(nilai)) : String(nilai) === String(awal);
      const l = el('label', `mus-seg__opt is-${nilai}`, teks);
      l.htmlFor = id;
      baris.append(r, l);
      return r;
    });
    wadah.append(baris);
    return {
      el: wadah,
      nilai: () => (input.find((r) => r.checked) || {}).value || '',
      semua: () => input.filter((r) => r.checked).map((r) => r.value),
      setel: (v) => input.forEach((r) => { r.checked = r.value === String(v); })
    };
  }

  function status() {
    const p = el('p', 'mus-status');
    p.setAttribute('role', 'status');
    return {
      el: p,
      ok(t) { p.textContent = t; p.className = 'mus-status is-ok'; },
      galat(t) { p.textContent = t; p.className = 'mus-status is-galat'; },
      kosong() { p.textContent = ''; p.className = 'mus-status'; }
    };
  }

  function bagian(judul, keterangan) {
    const wadah = el('section', 'mus-section asr-section');
    const kepala = el('header', 'mus-section__head');
    kepala.append(el('h3', 'mus-title', judul));
    if (keterangan) kepala.append(el('p', 'mus-note', keterangan));
    wadah.append(kepala);
    return wadah;
  }

  async function muat() {
    const params = bulan ? `?bulan=${encodeURIComponent(bulan)}` : '';
    data = await api('GET', `/api/asrama/${encodeURIComponent(asramaAktif)}${params}`);
    if (!bulan && data.cash) bulan = data.cash.month;
    lukis();
  }

  async function lakukan(fn, st, pesanOk) {
    try {
      await fn();
      kabar = pesanOk || 'Tersimpan.';
      await muat();
      return true;
    } catch (error) {
      if (st) st.galat(error.message);
      else window.alert(error.message);
      return false;
    }
  }

  // ------------------------------------------------------------ Jadwal
  function formJadwal(awal = null, { onSelesai, hariAwal = null, jamAwal = '' } = {}) {
    const wadah = el('div', 'mus-form asr-form');
    const hari = pilihan(awal ? 'Hari' : 'Hari (boleh lebih dari satu)', HARI.map((h, i) => [i + 1, h]), awal ? [awal.dayOfWeek] : (hariAwal ? [hariAwal] : []), { banyak: !awal });
    const nama = bidang('Kegiatan', 'text', { nilai: awal ? awal.title : '', placeholder: 'Talaqqi kitab', daftar: [...new Set(data.schedule.map((j) => j.title))] });
    const baris = el('div', 'mus-form__row');
    const mulai = bidang('Mulai', 'time', { nilai: awal ? awal.startTime || '' : jamAwal });
    const selesai = bidang('Selesai', 'time', { nilai: awal ? awal.endTime || '' : '' });
    const tempat = bidang('Tempat', 'text', { nilai: awal ? awal.location : '', placeholder: 'Musholla asrama' });
    baris.append(mulai.el, selesai.el, tempat.el);
    const catatan = bidang('Catatan (opsional)', 'text', { nilai: awal ? awal.note : '' });
    const st = status();
    const simpan = tombol(awal ? 'Simpan perubahan' : 'Tambah ke jadwal', 'button button--primary');
    const aksi = el('div', 'mus-actions');
    aksi.append(simpan);
    if (onSelesai) {
      const batal = tombol('Batal');
      batal.addEventListener('click', onSelesai);
      aksi.append(batal);
    }
    simpan.addEventListener('click', async () => {
      const hariDipilih = awal ? [hari.nilai()] : hari.semua();
      if (!hariDipilih.filter(Boolean).length) { st.galat('Pilih minimal satu hari.'); return; }
      const isi = { kind: 'rutin', title: nama.nilai(), startTime: mulai.nilai(), endTime: selesai.nilai(), location: tempat.nilai(), note: catatan.nilai() };
      simpan.disabled = true;
      await lakukan(async () => {
        if (awal) await api('PATCH', `/api/asrama/${asramaAktif}/jadwal/${awal.id}`, { ...isi, dayOfWeek: Number(hariDipilih[0]) });
        else for (const h of hariDipilih) await api('POST', `/api/asrama/${asramaAktif}/jadwal`, { ...isi, dayOfWeek: Number(h) });
      }, st, awal ? 'Jadwal diperbarui.' : `Ditambahkan ke ${hariDipilih.length} hari.`);
      simpan.disabled = false;
    });
    wadah.append(hari.el, nama.el, baris, catatan.el, aksi, st.el);
    return wadah;
  }

  // ------------------------------------------------------------ Agenda
  function formAcara(awal = null, { onSelesai, tanggalAwal = null, jamAwal = '' } = {}) {
    const wadah = el('div', 'mus-form asr-form');
    const nama = bidang('Nama acara', 'text', { nilai: awal ? awal.title : '', placeholder: 'Rihlah ke Alexandria' });
    const baris = el('div', 'mus-form__row');
    const tgl = bidang('Tanggal', 'date', { nilai: awal ? awal.date : (tanggalAwal || data.today) });
    const mulai = bidang('Mulai', 'time', { nilai: awal ? awal.startTime || '' : jamAwal });
    const selesai = bidang('Selesai', 'time', { nilai: awal ? awal.endTime || '' : '' });
    baris.append(tgl.el, mulai.el, selesai.el);
    const tempat = bidang('Tempat', 'text', { nilai: awal ? awal.location : '' });
    const ket = bidang('Keterangan (opsional)', 'textarea', { nilai: awal ? awal.note : '', placeholder: 'Yang perlu dibawa, biaya, atau titik kumpul' });
    ket.input.rows = 3;
    const st = status();
    const simpan = tombol(awal ? 'Simpan perubahan' : 'Tambah acara', 'button button--primary');
    const aksi = el('div', 'mus-actions');
    aksi.append(simpan);
    if (onSelesai) {
      const batal = tombol('Batal');
      batal.addEventListener('click', onSelesai);
      aksi.append(batal);
    }
    simpan.addEventListener('click', async () => {
      const isi = { kind: 'acara', title: nama.nilai(), date: tgl.nilai(), startTime: mulai.nilai(), endTime: selesai.nilai(), location: tempat.nilai(), note: ket.nilai() };
      simpan.disabled = true;
      await lakukan(() => (awal ? api('PATCH', `/api/asrama/${asramaAktif}/jadwal/${awal.id}`, isi) : api('POST', `/api/asrama/${asramaAktif}/jadwal`, isi)), st, awal ? 'Acara diperbarui.' : 'Acara ditambahkan.');
      simpan.disabled = false;
    });
    wadah.append(nama.el, baris, tempat.el, ket.el, aksi, st.el);
    return wadah;
  }

  // Kalender: kegiatan rutin dan acara dalam satu tampilan pekan atau bulan. Klik kegiatan
  // untuk mengubah atau menghapus; klik ruang kosong atau "+ Tambah" untuk menambah.
  function panelKalender() {
    const lihat = bagian('Kalender asrama', 'Kegiatan rutin dan acara. Santri dan wali melihat kalender yang sama di beranda mereka.');
    const editor = el('div', 'asr-editor');
    const tambahBagian = bagian('Tambah ke kalender');
    const jenis = pilihan(null, [['rutin', 'Kegiatan rutin mingguan'], ['acara', 'Acara sekali']], 'rutin');
    const formWadah = el('div');
    // Hari, tanggal, dan jam yang terakhir diklik di kalender ikut terbawa saat jenis diganti.
    let isianTerakhir = {};
    function bukaForm(isian = isianTerakhir) {
      isianTerakhir = isian;
      const j = jenis.nilai();
      formWadah.replaceChildren(j === 'rutin'
        ? formJadwal(null, { hariAwal: isian.hari || null, jamAwal: isian.jam || '' })
        : formAcara(null, { tanggalAwal: isian.tanggal || null, jamAwal: isian.jam || '' }));
    }
    jenis.el.addEventListener('change', () => bukaForm());
    tambahBagian.append(jenis.el, formWadah);
    bukaForm();

    const kalender = window.HamasahKalender.buat({
      rutin: data.schedule.filter((j) => j.kind === 'rutin'),
      acara: data.schedule.filter((j) => j.kind === 'acara'),
      today: data.today,
      labelTambah: '+ Tambah di hari ini',
      onTambah: ({ tanggal, hari, jam }) => {
        bukaForm({ tanggal, hari, jam });
        tambahBagian.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      aksiItem: (item) => {
        const aksi = el('span', 'asr-item__actions');
        const ubah = tombol('Ubah', 'mus-link');
        const hapus = tombol('Hapus', 'mus-link asr-danger');
        ubah.addEventListener('click', () => {
          const tutup = () => editor.replaceChildren();
          const judulEditor = el('h4', 'wali-subtitle', `Ubah ${item.kind === 'acara' ? 'acara' : 'kegiatan rutin'}: ${item.title}`);
          editor.replaceChildren(judulEditor, item.kind === 'acara' ? formAcara(item, { onSelesai: tutup }) : formJadwal(item, { onSelesai: tutup }));
          editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        hapus.addEventListener('click', async () => {
          const keterangan = item.kind === 'acara' ? `acara "${item.title}"` : `"${item.title}" dari jadwal ${HARI[item.dayOfWeek - 1]}`;
          if (!window.confirm(`Hapus ${keterangan}?`)) return;
          await lakukan(() => api('DELETE', `/api/asrama/${asramaAktif}/jadwal/${item.id}`), null, 'Jadwal dihapus.');
        });
        aksi.append(ubah, hapus);
        return aksi;
      }
    });
    lihat.append(kalender.el, editor);
    return [lihat, tambahBagian];
  }

  // ------------------------------------------------------------ Piket
  function panelPiket() {
    const santri = data.students;
    // Salinan kerja: dutyId -> hari -> Set(studentId). Disimpan sekaligus.
    const kerja = new Map(data.duties.map((d) => [d.id, Object.fromEntries(Object.entries(d.days).map(([h, list]) => [h, new Set(list.map((s) => String(s.id)))]))]));
    let berubah = false;
    const lihat = bagian('Jadwal piket', 'Ketuk kotak untuk memilih santri yang bertugas. Santri melihat jadwal piketnya sendiri, wali melihat piket anaknya.');
    const st = status();
    const simpan = tombol('Simpan jadwal piket', 'button button--primary');
    const acak = tombol('Bagi rata otomatis', 'mus-chip');
    const kosongkan = tombol('Kosongkan', 'mus-chip');
    const aksiAtas = el('div', 'mus-actions');
    aksiAtas.append(acak, kosongkan);

    const tabel = el('div', 'asr-duty-wrap');
    function namaSantri(id) {
      const s = santri.find((x) => String(x.id) === String(id));
      return s ? s.name.split(/\s+/)[0] : '?';
    }
    function tandai() {
      berubah = true;
      simpan.textContent = 'Simpan jadwal piket *';
      st.kosong();
    }
    function gambar() {
      tabel.replaceChildren();
      if (!data.duties.length) {
        tabel.append(el('p', 'asr-empty', 'Belum ada tugas piket. Tambahkan dulu di bawah, misal Dapur, Kamar mandi, Halaman.'));
        return;
      }
      const t = el('table', 'asr-duty');
      const thead = el('thead');
      const tr = el('tr');
      tr.append(el('th', '', 'Tugas'));
      HARI.forEach((h) => tr.append(el('th', '', h)));
      thead.append(tr);
      const tbody = el('tbody');
      data.duties.forEach((d) => {
        const baris = el('tr');
        const th = el('th', 'asr-duty__name');
        th.append(el('span', '', d.name));
        const hapus = tombol('Hapus', 'mus-link asr-danger');
        hapus.addEventListener('click', async () => {
          if (!window.confirm(`Hapus tugas piket "${d.name}" beserta pembagiannya?`)) return;
          await lakukan(() => api('DELETE', `/api/asrama/${asramaAktif}/piket/tugas/${d.id}`));
        });
        th.append(hapus);
        baris.append(th);
        for (let h = 1; h <= 7; h += 1) {
          const td = el('td');
          const sel = tombol('', 'asr-duty__cell');
          sel.setAttribute('aria-label', `${d.name}, ${HARI[h - 1]}: pilih santri`);
          const terpilih = [...kerja.get(d.id)[h]];
          if (terpilih.length) terpilih.forEach((id) => sel.append(el('span', 'asr-chip', namaSantri(id))));
          else sel.append(el('span', 'asr-duty__add', '+'));
          sel.addEventListener('click', () => pilihSantri(d, h));
          td.append(sel);
          baris.append(td);
        }
        tbody.append(baris);
      });
      t.append(thead, tbody);
      tabel.append(t);
    }

    async function pilihSantri(d, h) {
      const sekarang = kerja.get(d.id)[h];
      const dialog = el('dialog', 'op-dialog');
      const form = el('form', 'staff-form op-dialog__form');
      form.method = 'dialog';
      form.append(el('h3', '', `${d.name} · ${HARI[h - 1]}`));
      const daftar = el('div', 'asr-pick');
      santri.forEach((s) => {
        const id = idBaru('pk');
        const c = el('input');
        c.type = 'checkbox';
        c.id = id;
        c.value = String(s.id);
        c.checked = sekarang.has(String(s.id));
        const l = el('label', '', s.name);
        l.htmlFor = id;
        const baris = el('div', 'asr-pick__row');
        baris.append(c, l);
        daftar.append(baris);
      });
      if (!santri.length) daftar.append(el('p', 'asr-empty', 'Belum ada santri aktif di asrama ini.'));
      const aksi = el('div', 'op-dialog__actions');
      const batal = tombol('Batal');
      const ok = el('button', 'button button--primary', 'Pakai');
      ok.type = 'submit';
      aksi.append(batal, ok);
      form.append(daftar, aksi);
      dialog.append(form);
      document.body.append(dialog);
      batal.addEventListener('click', () => dialog.close('batal'));
      form.addEventListener('submit', () => {
        kerja.get(d.id)[h] = new Set([...daftar.querySelectorAll('input:checked')].map((c) => c.value));
        tandai();
        gambar();
      });
      dialog.addEventListener('close', () => dialog.remove());
      dialog.showModal();
    }

    acak.addEventListener('click', () => {
      if (!data.duties.length || !santri.length) return;
      // Bergiliran: setiap slot (tugas x hari) mendapat santri berikutnya dalam urutan,
      // jadi beban tersebar rata sepanjang pekan.
      const perSlot = Math.max(1, Math.floor(santri.length / data.duties.length));
      let i = 0;
      for (let h = 1; h <= 7; h += 1) {
        data.duties.forEach((d) => {
          const set = new Set();
          for (let k = 0; k < perSlot; k += 1) { set.add(String(santri[i % santri.length].id)); i += 1; }
          kerja.get(d.id)[h] = set;
        });
      }
      tandai();
      gambar();
    });
    kosongkan.addEventListener('click', () => {
      data.duties.forEach((d) => { for (let h = 1; h <= 7; h += 1) kerja.get(d.id)[h] = new Set(); });
      tandai();
      gambar();
    });
    simpan.addEventListener('click', async () => {
      const assignments = [];
      kerja.forEach((hari, dutyId) => Object.entries(hari).forEach(([h, set]) => assignments.push({ dutyId, day: Number(h), studentIds: [...set] })));
      simpan.disabled = true;
      const ok = await lakukan(() => api('PUT', `/api/asrama/${asramaAktif}/piket`, { assignments }), null, 'Jadwal piket tersimpan.');
      simpan.disabled = false;
      if (ok) { berubah = false; }
    });
    gambar();
    const aksi = el('div', 'mus-actions');
    aksi.append(simpan);
    lihat.append(aksiAtas, tabel, aksi, st.el);

    const tambah = bagian('Tugas piket', 'Daftar tugas yang dibagi ke santri.');
    const nama = bidang('Nama tugas', 'text', { placeholder: 'Dapur' });
    const st2 = status();
    const tambahBtn = tombol('Tambah tugas', 'button button--primary');
    tambahBtn.addEventListener('click', async () => {
      if (berubah && !window.confirm('Pembagian piket yang belum disimpan akan hilang. Lanjutkan?')) return;
      await lakukan(() => api('POST', `/api/asrama/${asramaAktif}/piket/tugas`, { name: nama.nilai() }), st2, 'Tugas ditambahkan.');
    });
    const baris = el('div', 'mus-form__row');
    baris.append(nama.el, tambahBtn);
    tambah.append(baris, st2.el);
    return [lihat, tambah];
  }

  // ------------------------------------------------------------ Uang kas
  function panelKas() {
    const kas = data.cash;
    const isi = [];
    const ringkas = el('div', 'mus-stats');
    [
      [rupiah(kas.balance), 'saldo kas', 'semua waktu'],
      [rupiah(kas.monthIn), 'pemasukan', BULAN.format(new Date(`${kas.month}-01T00:00:00Z`))],
      [rupiah(kas.monthOut), 'pengeluaran', BULAN.format(new Date(`${kas.month}-01T00:00:00Z`))]
    ].forEach(([nilai, label, catatan]) => {
      const s = el('div', 'mus-stat');
      s.append(el('strong', 'mus-stat__value', nilai), el('span', 'mus-stat__label', label), el('span', 'mus-stat__note', catatan));
      ringkas.append(s);
    });
    const pilihBulan = bidang('Bulan', 'month', { nilai: kas.month });
    pilihBulan.input.addEventListener('change', () => { bulan = pilihBulan.nilai() || bulan; muat().catch((e) => window.alert(e.message)); });
    const atas = el('div', 'asr-cash-top');
    atas.append(ringkas, pilihBulan.el);
    isi.push(atas);

    // Catat transaksi.
    const catat = bagian('Catat transaksi');
    const arah = pilihan('Jenis', [['masuk', 'Pemasukan'], ['keluar', 'Pengeluaran']], 'masuk');
    const baris = el('div', 'mus-form__row');
    const jumlah = bidang('Jumlah (Rp)', 'number', { placeholder: '50000' });
    jumlah.input.min = '1';
    jumlah.input.inputMode = 'numeric';
    const kategori = bidang('Kategori', 'text', { placeholder: 'konsumsi', daftar: KATEGORI_KAS });
    const tgl = bidang('Tanggal', 'date', { nilai: data.today });
    tgl.input.max = data.today;
    baris.append(jumlah.el, kategori.el, tgl.el);
    const chips = el('div', 'mus-chips');
    KATEGORI_KAS.forEach((k) => {
      const c = tombol(k, 'mus-chip');
      c.addEventListener('click', () => { kategori.setel(k); perbaruiIuran(); });
      chips.append(c);
    });
    const pilihSantri = el('div', 'mus-field');
    const idSantri = idBaru('kas-santri');
    const lblSantri = el('label', 'mus-label', 'Santri yang membayar iuran');
    lblSantri.htmlFor = idSantri;
    const selSantri = el('select', 'mus-input');
    selSantri.id = idSantri;
    selSantri.add(new Option('Pilih santri', ''));
    data.students.forEach((s) => selSantri.add(new Option(s.name, s.id)));
    pilihSantri.append(lblSantri, selSantri);
    const catatan = bidang('Keterangan (opsional)', 'text', { placeholder: 'Beli sabun dan pel lantai' });
    function perbaruiIuran() {
      const iuran = kategori.nilai().toLowerCase() === 'iuran';
      pilihSantri.hidden = !iuran;
      if (iuran) {
        arah.setel('masuk');
        if (!jumlah.nilai() && kas.dues.monthlyAmount) jumlah.setel(String(kas.dues.monthlyAmount));
      }
    }
    kategori.input.addEventListener('input', perbaruiIuran);
    perbaruiIuran();
    const st = status();
    const simpan = tombol('Simpan', 'button button--primary');
    simpan.addEventListener('click', async () => {
      simpan.disabled = true;
      const ok = await lakukan(() => api('POST', `/api/asrama/${asramaAktif}/kas`, {
        direction: arah.nilai(), amount: Number(jumlah.nilai()), category: kategori.nilai(), date: tgl.nilai(),
        note: catatan.nilai(), studentId: selSantri.value || undefined, period: kas.month
      }), st, 'Transaksi tersimpan.');
      simpan.disabled = false;
      if (ok) { jumlah.setel(''); catatan.setel(''); }
    });
    const aksi = el('div', 'mus-actions');
    aksi.append(simpan);
    catat.append(arah.el, baris, chips, pilihSantri, catatan.el, aksi, st.el);
    isi.push(catat);

    // Iuran bulan ini.
    const iuran = bagian(`Iuran ${BULAN.format(new Date(`${kas.month}-01T00:00:00Z`))}`, kas.dues.monthlyAmount ? `Besaran iuran ${rupiah(kas.dues.monthlyAmount)} per santri per bulan.` : 'Besaran iuran belum diatur.');
    const besaran = bidang('Besaran iuran per bulan (Rp)', 'number', { nilai: kas.dues.monthlyAmount ? String(kas.dues.monthlyAmount) : '' });
    const simpanBesaran = tombol('Simpan besaran', 'mus-chip');
    const st3 = status();
    simpanBesaran.addEventListener('click', () => lakukan(() => api('PUT', `/api/asrama/${asramaAktif}/iuran`, { monthlyAmount: Number(besaran.nilai() || 0) }), st3, 'Besaran iuran tersimpan.'));
    const barisBesaran = el('div', 'mus-form__row');
    barisBesaran.append(besaran.el, simpanBesaran);
    const lunas = kas.dues.students.filter((s) => s.settled).length;
    const daftarIuran = el('ul', 'asr-dues');
    kas.dues.students.forEach((s) => {
      const li = el('li', `asr-dues__row ${s.settled ? 'is-lunas' : ''}`.trim());
      li.append(el('span', 'asr-dues__name', s.name), el('span', 'asr-dues__state', s.settled ? `Lunas ${rupiah(s.paid)}` : (s.paid ? `Kurang, baru ${rupiah(s.paid)}` : 'Belum bayar')));
      if (!s.settled) {
        const bayar = tombol('Catat bayar', 'mus-link');
        bayar.addEventListener('click', () => {
          kategori.setel('iuran');
          selSantri.value = s.id;
          jumlah.setel(String(Math.max(0, (kas.dues.monthlyAmount || 0) - s.paid) || ''));
          perbaruiIuran();
          catat.scrollIntoView({ behavior: 'smooth', block: 'start' });
          jumlah.input.focus();
        });
        li.append(bayar);
      }
      daftarIuran.append(li);
    });
    iuran.append(barisBesaran, st3.el, el('p', 'mus-note', `${lunas} dari ${kas.dues.students.length} santri sudah lunas.`), daftarIuran);
    isi.push(iuran);

    // Buku kas bulan ini.
    const buku = bagian('Buku kas', 'Catatan yang salah dibatalkan dengan alasan, tidak dihapus.');
    const pager = K.penomoran({
      perHalaman: 12,
      tagDaftar: 'ul',
      kelasDaftar: 'asr-ledger',
      kosong: 'Belum ada transaksi di bulan ini.',
      render(halaman, ul) {
        halaman.forEach((e) => {
          const li = el('li', `asr-ledger__row is-${e.direction} ${e.voided ? 'is-batal' : ''}`.trim());
          const kiri = el('div', 'asr-ledger__info');
          kiri.append(
            el('strong', '', e.category + (e.studentName ? ` · ${e.studentName}` : '')),
            el('span', 'asr-item__meta', [tanggal(e.date), e.note, e.voided ? `Dibatalkan: ${e.voidReason}` : null].filter(Boolean).join(' · '))
          );
          const nilai = el('span', 'asr-ledger__amount', `${e.direction === 'masuk' ? '+' : '−'} ${rupiah(e.amount)}`);
          li.append(kiri, nilai);
          if (!e.voided) {
            const batal = tombol('Batalkan', 'mus-link asr-danger');
            batal.addEventListener('click', async () => {
              const hasil = await window.HamasahDialog.formulir({
                judul: 'Batalkan catatan kas',
                keterangan: `${e.category} ${rupiah(e.amount)}, ${tanggal(e.date)}. Saldo dihitung ulang tanpa catatan ini.`,
                bidang: [{ nama: 'reason', label: 'Alasan', wajib: true, nilai: '' }],
                labelSimpan: 'Batalkan catatan',
                kirim: (n) => api('POST', `/api/asrama/${asramaAktif}/kas/${e.id}/batal`, { reason: n.reason })
              });
              if (hasil) await muat();
            });
            li.append(batal);
          }
          ul.append(li);
        });
      }
    });
    pager.setel(kas.entries);
    buku.append(pager.wadah);
    isi.push(buku);
    return isi;
  }

  // ------------------------------------------------------------ Inventaris
  function panelInventaris() {
    const barang = data.inventory;
    const lihat = bagian('Inventaris asrama', 'Barang milik asrama. Ubah jumlah atau kondisi saat ada yang rusak, hilang, atau baru dibeli.');
    const ringkas = el('p', 'mus-note');
    const hitung = (k) => barang.filter((b) => b.condition === k).length;
    ringkas.textContent = `${barang.length} jenis barang · ${hitung('rusak')} rusak · ${hitung('hilang')} hilang`;
    const ul = el('ul', 'asr-inv');
    if (!barang.length) ul.append(el('li', 'asr-empty', 'Belum ada barang dicatat.'));
    barang.forEach((b) => {
      const li = el('li', `asr-inv__row is-${b.condition}`);
      const info = el('div', 'asr-inv__info');
      info.append(el('strong', '', b.name), el('span', 'asr-item__meta', [b.note, `Diubah ${new Date(b.updatedAt).toLocaleDateString('id-ID')}`].filter(Boolean).join(' · ')));
      const jml = el('span', 'asr-inv__qty', String(b.quantity));
      const kondisi = el('span', `asr-inv__cond is-${b.condition}`, (KONDISI.find(([k]) => k === b.condition) || [])[1] || b.condition);
      const aksi = el('span', 'asr-item__actions');
      const ubah = tombol('Ubah', 'mus-link');
      ubah.addEventListener('click', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: `Ubah ${b.name}`,
          bidang: [
            { nama: 'name', label: 'Nama barang', nilai: b.name, wajib: true },
            { nama: 'quantity', label: 'Jumlah', jenis: 'number', min: 0, nilai: b.quantity, wajib: true },
            { nama: 'condition', label: 'Kondisi', jenis: 'select', nilai: b.condition, pilihan: KONDISI },
            { nama: 'note', label: 'Catatan', nilai: b.note }
          ],
          kirim: (n) => api('PATCH', `/api/asrama/${asramaAktif}/inventaris/${b.id}`, { ...n, quantity: Number(n.quantity) })
        });
        if (hasil) await muat();
      });
      const arsip = tombol('Arsipkan', 'mus-link asr-danger');
      arsip.addEventListener('click', async () => {
        if (!window.confirm(`Arsipkan ${b.name}? Barang tidak tampil lagi di daftar.`)) return;
        await lakukan(() => api('DELETE', `/api/asrama/${asramaAktif}/inventaris/${b.id}`));
      });
      aksi.append(ubah, arsip);
      li.append(info, jml, kondisi, aksi);
      ul.append(li);
    });
    lihat.append(ringkas, ul);

    const tambah = bagian('Tambah barang');
    const baris = el('div', 'mus-form__row');
    const nama = bidang('Nama barang', 'text', { placeholder: 'Kasur lipat' });
    const jumlah = bidang('Jumlah', 'number', { nilai: '1' });
    jumlah.input.min = '0';
    baris.append(nama.el, jumlah.el);
    const kondisi = pilihan('Kondisi', KONDISI, 'baik');
    const catatan = bidang('Catatan (opsional)', 'text', { placeholder: 'Disimpan di gudang lantai 2' });
    const st = status();
    const simpan = tombol('Tambah barang', 'button button--primary');
    simpan.addEventListener('click', () => lakukan(() => api('POST', `/api/asrama/${asramaAktif}/inventaris`, {
      name: nama.nilai(), quantity: Number(jumlah.nilai()), condition: kondisi.nilai(), note: catatan.nilai()
    }), st, 'Barang ditambahkan.'));
    const aksi = el('div', 'mus-actions');
    aksi.append(simpan);
    tambah.append(baris, kondisi.el, catatan.el, aksi, st.el);
    return [lihat, tambah];
  }

  // ------------------------------------------------------------ Rangka
  const TAB = [
    ['kalender', 'Kalender', panelKalender],
    ['piket', 'Piket', panelPiket],
    ['kas', 'Uang kas', panelKas],
    ['inventaris', 'Inventaris', panelInventaris]
  ];

  function lukis() {
    const isi = [];
    const kepala = el('header', 'asr-head');
    const judul = el('div', 'asr-head__text');
    judul.append(el('p', 'wali-eyebrow', 'Kelola Asrama'), el('h2', 'asr-head__title', data.dormitory.name));
    judul.append(el('p', 'mus-note', [data.dormitory.area, `${data.students.length} santri aktif`].filter(Boolean).join(' · ')));
    kepala.append(judul);
    if (daftarAsrama.length > 1) {
      const pilih = el('select', 'mus-input asr-head__select');
      pilih.setAttribute('aria-label', 'Pilih asrama');
      daftarAsrama.forEach((d) => pilih.add(new Option(d.name, d.id)));
      pilih.value = asramaAktif;
      pilih.addEventListener('change', () => {
        asramaAktif = pilih.value;
        bulan = null;
        muat().catch((e) => window.alert(e.message));
      });
      kepala.append(pilih);
    }
    isi.push(kepala);

    if (!data.tersedia) {
      isi.push(el('p', 'asr-warning', 'Fitur Kelola Asrama menunggu pembaruan database. Admin dapat menerapkannya di halaman Pengaturan, bagian Pembaruan database.'));
      app.replaceChildren(...isi);
      return;
    }

    const tab = el('div', 'mus-tabs asr-tabs');
    tab.setAttribute('role', 'tablist');
    TAB.forEach(([kunci, label]) => {
      const b = tombol(label, `mus-tab ${kunci === tabAktif ? 'is-active' : ''}`.trim());
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(kunci === tabAktif));
      b.addEventListener('click', () => {
        tabAktif = kunci;
        try { localStorage.setItem(TAB_KUNCI, kunci); } catch { /* opsional */ }
        lukis();
      });
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
    panel.append(...(TAB.find(([k]) => k === tabAktif) || TAB[0])[2]());
    isi.push(panel);
    app.replaceChildren(...isi);
  }

  (async function mulai() {
    if (session()) document.body.classList.add('in-crm');
    try {
      const me = await window.hamasahMintaAkun(headers());
      const akun = me.body && me.body.account;
      if (!me.ok || !akun || !['admin', 'supervisor'].includes(akun.role)) throw new Error('Halaman ini untuk musyrif asrama dan admin.');
      guard.hidden = true;
      konsol.hidden = false;
      document.body.classList.add('in-crm');
      renderStaffNav(staffNav, akun.role, 'asrama', akun);
      try { tabAktif = localStorage.getItem(TAB_KUNCI) || tabAktif; } catch { /* opsional */ }
      // Tab lama "Jadwal mingguan" dan "Agenda" kini satu tab Kalender.
      if (['jadwal', 'agenda'].includes(tabAktif)) tabAktif = 'kalender';
      if (!TAB.some(([k]) => k === tabAktif)) tabAktif = 'kalender';
      daftarAsrama = (await api('GET', '/api/asrama')).dormitories;
      if (!daftarAsrama.length) {
        app.replaceChildren(el('p', 'asr-warning', akun.role === 'admin' ? 'Belum ada asrama. Buat asrama lewat halaman Monitoring.' : 'Anda belum ditugaskan ke asrama mana pun. Minta admin menugaskan asrama lewat halaman Monitoring.'));
        return;
      }
      const dariAlamat = new URLSearchParams(window.location.search).get('asrama');
      asramaAktif = daftarAsrama.some((d) => d.id === dariAlamat) ? dariAlamat : daftarAsrama[0].id;
      const muatData = () => muat().catch((e) => { app.replaceChildren(el('p', 'asr-warning', e.message)); });
      window.hamasahSaatDataSegar(muatData);
      await muatData();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Kelola Asrama belum tersedia';
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
})();
