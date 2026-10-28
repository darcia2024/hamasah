// Impor santri massal: unggah CSV atau XLSX, petakan kolom, tinjau hasil validasi, konfirmasi, lalu
// baca laporannya. Berkas dibaca di peramban (berkas-tabel.js); server memvalidasi dan menyimpan
// (/api/impor-santri, server/student-import-service.js). Akun hanya diundang, tanpa kata sandi
// bersama. Semua teks dipasang lewat textContent.
(function initImpor() {
  const guard = document.querySelector('#impor-guard');
  const guardCopy = document.querySelector('#impor-guard-copy');
  const konsol = document.querySelector('#impor-console');
  const app = document.querySelector('#impor-app');
  const staffNav = document.querySelector('#staff-nav');
  const WAKTU = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  const MAKS_BARIS = 500;

  // Kolom yang dikenal. kata: nama kolom di berkas (tanpa tanda baca, huruf kecil) yang dikenali otomatis.
  const FIELD = [
    { id: 'name', label: 'Nama santri', wajib: true, kata: ['nama', 'nama lengkap', 'nama santri', 'name', 'nama siswa'] },
    { id: 'gender', label: 'Jenis (putra/putri)', kata: ['jenis kelamin', 'jk', 'gender', 'jenis', 'l p', 'lp', 'sex'] },
    { id: 'birthDate', label: 'Tanggal lahir', kata: ['tanggal lahir', 'tgl lahir', 'lahir', 'birth date', 'tanggal'] },
    { id: 'birthPlace', label: 'Tempat lahir', kata: ['tempat lahir', 'tmp lahir', 'birth place'] },
    { id: 'program', label: 'Jenjang / program', wajib: true, kata: ['jenjang', 'program', 'jenjang pendidikan', 'pendidikan', 'tingkat', 'program studi'] },
    { id: 'city', label: 'Kota asal', kata: ['kota', 'kota asal', 'asal', 'domisili', 'daerah asal'] },
    { id: 'joinDate', label: 'Tanggal bergabung', kata: ['tanggal bergabung', 'tgl bergabung', 'tanggal masuk', 'tgl masuk', 'bergabung', 'masuk'] },
    { id: 'dormitory', label: 'Asrama', kata: ['asrama', 'nama asrama', 'dorm'] },
    { id: 'room', label: 'Kamar', kata: ['kamar', 'no kamar', 'nomor kamar', 'room'] },
    { id: 'phone', label: 'Telepon / WhatsApp santri', kata: ['telepon', 'no hp', 'hp', 'whatsapp', 'wa', 'telp', 'nomor telepon', 'no telepon', 'nomor hp'] },
    { id: 'email', label: 'Email santri (untuk undangan akun)', kata: ['email', 'email santri', 'e mail', 'surel'] },
    { id: 'address', label: 'Alamat', kata: ['alamat', 'alamat asal', 'address'] },
    { id: 'institution', label: 'Lembaga / kampus', kata: ['lembaga', 'kampus', 'universitas', 'sekolah', 'institusi', 'nama kampus'] },
    { id: 'major', label: 'Jurusan / fakultas', kata: ['jurusan', 'fakultas', 'prodi', 'major'] },
    { id: 'studyYear', label: 'Tahun studi ke-', kata: ['tahun studi', 'tahun ke', 'semester', 'tingkat studi'] },
    { id: 'guardianName', label: 'Nama wali', kata: ['nama wali', 'wali', 'orang tua', 'nama orang tua', 'ayah', 'nama ayah'] },
    { id: 'guardianEmail', label: 'Email wali (untuk undangan akun)', kata: ['email wali', 'email orang tua', 'email ortu', 'email ayah'] },
    { id: 'guardianPhone', label: 'Telepon wali', kata: ['telepon wali', 'hp wali', 'no hp wali', 'wa wali', 'whatsapp wali', 'telp wali', 'no telepon wali'] }
  ];
  const LABEL_STATUS = { siap: 'Siap', peringatan: 'Peringatan', bermasalah: 'Bermasalah', duplikat: 'Duplikat' };
  const LABEL_BATCH = { previewed: 'Menunggu konfirmasi', committing: 'Sedang diproses', committed: 'Selesai', cancelled: 'Dibatalkan' };

  const state = { tahap: 'unggah', berkas: null, namaBerkas: '', pemetaan: {}, batch: null, saring: 'semua', dipilih: new Set(), riwayat: null, pesan: '' };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tombol(teks, kelas, aksi) {
    const b = el('button', kelas || 'button button--secondary ip-small', teks);
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
    const response = await fetch(url, { method, headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const hasil = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(hasil.error || 'Permintaan belum berhasil.');
    return hasil;
  }

  function normal(teks) {
    return String(teks || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Tebakan pemetaan: nama kolom persis, lalu yang memuat kata kunci. Satu kolom hanya dipakai satu kolom tujuan.
  function tebakPemetaan(headerBerkas) {
    const peta = {};
    const terpakai = new Set();
    const nama = headerBerkas.map(normal);
    FIELD.forEach((f) => {
      const persis = nama.findIndex((n, i) => !terpakai.has(i) && f.kata.includes(n));
      if (persis >= 0) { peta[f.id] = persis; terpakai.add(persis); }
    });
    return peta;
  }

  function stepBar() {
    const bar = el('ol', 'ip-steps');
    [['unggah', '1. Unggah'], ['petakan', '2. Petakan kolom'], ['tinjau', '3. Tinjau'], ['laporan', '4. Laporan']].forEach(([id, label]) => {
      bar.append(el('li', `ip-step${state.tahap === id ? ' is-on' : ''}`, label));
    });
    return bar;
  }

  function kotak(judul, ket) {
    const wadah = el('section', 'ip-card');
    wadah.append(el('h3', '', judul));
    if (ket) wadah.append(el('p', 'ip-note', ket));
    return wadah;
  }

  // ------------------------------------------------------------------ 1. unggah

  function templateCsv() {
    const contoh = [FIELD.map((f) => f.label), ['Ahmad Fauzi', 'putra', '2005-09-30', 'Bogor', 'Kuliah S1 Al-Azhar', 'Bogor', '2025-09-01', 'Asrama Al-Fath', '', '+20 100 000 0000', 'ahmad@contoh.id', '', 'Universitas Al-Azhar', 'Syariah', '1', 'Bapak Fauzi', 'wali@contoh.id', '+62 811 000 000']];
    window.HamasahBerkasTabel.unduh('template-impor-santri.csv', window.HamasahBerkasTabel.keCsv(contoh));
  }

  function tahapUnggah() {
    const isi = [];
    const k = kotak('Unggah berkas santri', `Pakai CSV atau XLSX (dari Excel, atau Google Sheets lewat File, Unduh). Maksimal ${MAKS_BARIS} santri per impor. Baris pertama berisi nama kolom.`);
    const input = el('input', 'ip-file');
    input.type = 'file';
    input.accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.setAttribute('aria-label', 'Berkas santri');
    const st = el('p', 'ip-status');
    st.setAttribute('role', 'status');
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      st.textContent = 'Membaca berkas...';
      try {
        const hasil = await window.HamasahBerkasTabel.baca(file);
        if (!hasil.rows.length) throw new Error('Berkas hanya berisi baris judul, belum ada data santri.');
        if (hasil.rows.length > MAKS_BARIS) throw new Error(`Berkas berisi ${hasil.rows.length} baris. Satu impor paling banyak ${MAKS_BARIS}; bagi berkasnya.`);
        state.berkas = hasil;
        state.namaBerkas = file.name;
        state.pemetaan = tebakPemetaan(hasil.headers);
        state.tahap = 'petakan';
        lukis();
      } catch (error) {
        st.textContent = error.message;
        st.className = 'ip-status is-galat';
      }
    });
    k.append(input, st, tombol('Unduh template CSV', null, templateCsv));
    isi.push(k);
    const aturan = kotak('Yang diperiksa sebelum disimpan');
    const ul = el('ul', 'ip-list');
    ['Identitas: nama, jenis, tanggal lahir, dan tanggal bergabung.', 'Asrama dan kamar harus ada, sesuai jenis santri, dan masih punya tempat.', 'Jenjang dikenali (Kuliah atau Ma’had); yang lain tetap bisa disimpan dengan peringatan.', 'Wali: nama dan email, termasuk wali yang sama untuk saudara kandung.', 'Duplikat: santri yang sudah ada atau muncul dua kali di berkas.', 'Belum ada yang disimpan sampai Anda mengonfirmasi.'].forEach((t) => ul.append(el('li', '', t)));
    aturan.append(ul, el('p', 'ip-note', 'Akun santri dan wali hanya diundang lewat email; tidak ada kata sandi bawaan. Pemilik akun membuat kata sandinya sendiri.'));
    isi.push(aturan);
    isi.push(kotakRiwayat());
    return isi;
  }

  function kotakRiwayat() {
    const k = kotak('Riwayat impor');
    if (!state.riwayat) { k.append(el('p', 'ip-note', 'Memuat...')); return k; }
    if (!state.riwayat.available) { k.append(el('p', 'ip-warning', 'Impor santri menunggu pembaruan database (migrasi 063). Admin dapat menerapkannya di halaman Pengaturan.')); return k; }
    if (!state.riwayat.items.length) { k.append(el('p', 'ip-note', 'Belum ada impor.')); return k; }
    const ul = el('ul', 'ip-history');
    state.riwayat.items.forEach((b) => {
      const li = el('li');
      const info = el('div');
      info.append(el('strong', '', b.fileName || 'Tanpa nama berkas'), el('p', 'ip-note', `${WAKTU.format(new Date(b.createdAt))} · ${LABEL_BATCH[b.status]} · ${b.rowCount} baris${b.summary.created !== undefined ? ` · ${b.summary.created} dibuat` : ''}`));
      li.append(info);
      if (['previewed', 'committing', 'committed'].includes(b.status)) {
        li.append(tombol(b.status === 'committed' ? 'Lihat laporan' : 'Buka', null, async () => {
          try {
            state.batch = await api('GET', `/api/impor-santri/${encodeURIComponent(b.id)}`);
            state.saring = 'semua';
            state.dipilih = pilihanAwal(state.batch);
            state.tahap = b.status === 'committed' ? 'laporan' : 'tinjau';
            lukis();
          } catch (error) {
            window.alert(error.message);
          }
        }));
      }
      ul.append(li);
    });
    k.append(ul);
    return k;
  }

  // ------------------------------------------------------------------ 2. petakan

  function tahapPetakan() {
    const k = kotak('Petakan kolom', `Berkas ${state.namaBerkas} berisi ${state.berkas.rows.length} baris. Pilih kolom berkas untuk tiap data santri. Kolom bertanda * wajib.`);
    const tabel = el('div', 'ip-map');
    FIELD.forEach((f) => {
      const baris = el('label', 'ip-map__row');
      baris.append(el('span', '', `${f.label}${f.wajib ? ' *' : ''}`));
      const pilih = el('select');
      pilih.append(new Option('(tidak dipakai)', ''));
      state.berkas.headers.forEach((h, i) => pilih.append(new Option(h, String(i))));
      pilih.value = state.pemetaan[f.id] === undefined ? '' : String(state.pemetaan[f.id]);
      pilih.addEventListener('change', () => {
        if (pilih.value === '') delete state.pemetaan[f.id]; else state.pemetaan[f.id] = Number(pilih.value);
      });
      baris.append(pilih);
      const contoh = el('span', 'ip-map__sample');
      const perbarui = () => { contoh.textContent = pilih.value === '' ? '' : `Contoh: ${state.berkas.rows.slice(0, 2).map((r) => r[Number(pilih.value)]).filter(Boolean).join(' | ')}`; };
      pilih.addEventListener('change', perbarui);
      perbarui();
      baris.append(contoh);
      tabel.append(baris);
    });
    k.append(tabel);
    const st = el('p', 'ip-status');
    st.setAttribute('role', 'status');
    const aksi = el('div', 'ip-actions');
    aksi.append(tombol('Kembali', null, () => { state.tahap = 'unggah'; lukis(); }));
    const periksa = tombol('Periksa data', 'button button--primary ip-small', async () => {
      const kurang = FIELD.filter((f) => f.wajib && state.pemetaan[f.id] === undefined).map((f) => f.label);
      if (kurang.length) { st.textContent = `Petakan dulu kolom wajib: ${kurang.join(', ')}.`; st.className = 'ip-status is-galat'; return; }
      periksa.disabled = true;
      st.textContent = 'Memeriksa data...';
      try {
        const rows = state.berkas.rows.map((r) => Object.fromEntries(Object.entries(state.pemetaan).map(([id, i]) => [id, r[i] || ''])));
        state.batch = await api('POST', '/api/impor-santri/pratinjau', { fileName: state.namaBerkas, rows });
        state.saring = 'semua';
        state.dipilih = pilihanAwal(state.batch);
        state.tahap = 'tinjau';
        lukis();
      } catch (error) {
        st.textContent = error.message;
        st.className = 'ip-status is-galat';
        periksa.disabled = false;
      }
    });
    aksi.append(periksa);
    k.append(st, aksi);
    return [k];
  }

  // ------------------------------------------------------------------ 3. tinjau

  // Baris yang diimpor secara bawaan: yang siap dan yang berperingatan. Duplikat harus dipilih sengaja.
  function pilihanAwal(batch) {
    return new Set(batch.rows.filter((b) => ['siap', 'peringatan'].includes(b.status)).map((b) => b.row));
  }

  function chip(teks, kelas) {
    return el('span', `ip-chip ip-chip--${kelas}`, teks);
  }

  function pesanBaris(b) {
    const ul = el('ul', 'ip-msgs');
    b.errors.forEach((t) => ul.append(el('li', 'is-error', t)));
    b.duplicates.forEach((d) => ul.append(el('li', 'is-dup', d.pesan)));
    b.warnings.forEach((t) => ul.append(el('li', 'is-warn', t)));
    b.info.forEach((t) => ul.append(el('li', 'is-info', t)));
    return ul;
  }

  // Baris bermasalah dan duplikat sebagai CSV bernama kolom baku, supaya bisa diperbaiki lalu diunggah ulang.
  function unduhMasalah() {
    const hasil = [[...FIELD.map((f) => f.label), 'Catatan sistem']];
    state.batch.rows.filter((b) => ['bermasalah', 'duplikat'].includes(b.status)).forEach((b) => {
      hasil.push([...FIELD.map((f) => b.data[f.id] || ''), [...b.errors, ...b.duplicates.map((d) => d.pesan)].join(' | ')]);
    });
    window.HamasahBerkasTabel.unduh('baris-bermasalah.csv', window.HamasahBerkasTabel.keCsv(hasil));
  }

  function tahapTinjau() {
    const batch = state.batch;
    const s = batch.summary;
    const k = kotak(`Tinjau hasil pemeriksaan: ${batch.fileName || 'berkas'}`, 'Belum ada yang disimpan. Centang santri yang mau diimpor, lalu konfirmasi.');
    const ringkas = el('div', 'ip-summary');
    [['Total baris', s.total, 'netral'], ['Siap', s.ready, 'siap'], ['Peringatan', s.warning, 'peringatan'], ['Bermasalah', s.problem, 'bermasalah'], ['Duplikat', s.duplicate, 'duplikat']].forEach(([label, nilai, kelas]) => {
      const d = el('div', `ip-summary__item ip-summary__item--${kelas}`);
      d.append(el('strong', '', String(nilai)), el('span', '', label));
      ringkas.append(d);
    });
    k.append(ringkas);
    k.append(el('p', 'ip-note', `Akun yang akan diundang: ${s.newStudentAccounts} akun santri dan ${s.newGuardianAccounts} akun wali baru; ${s.linkedGuardians} santri ditautkan ke wali yang sudah punya akun.`));

    const saring = el('div', 'ip-filter');
    saring.setAttribute('role', 'group');
    [['semua', 'Semua'], ['siap', 'Siap'], ['peringatan', 'Peringatan'], ['bermasalah', 'Bermasalah'], ['duplikat', 'Duplikat']].forEach(([id, label]) => {
      const b = tombol(label, `ip-tab${state.saring === id ? ' is-on' : ''}`, () => { state.saring = id; lukis(); });
      b.setAttribute('aria-pressed', String(state.saring === id));
      saring.append(b);
    });
    k.append(saring);

    const tampil = batch.rows.filter((b) => state.saring === 'semua' || b.status === state.saring);
    const bungkus = el('div', 'ip-table-wrap');
    const tabel = el('table', 'ip-table');
    const kepala = el('tr');
    ['Impor', 'No', 'Nama', 'Status', 'Jenjang', 'Asrama', 'Wali', 'Catatan'].forEach((t) => { const th = el('th', '', t); th.scope = 'col'; kepala.append(th); });
    const thead = el('thead');
    thead.append(kepala);
    const tbody = el('tbody');
    tampil.forEach((b) => {
      const tr = el('tr', `is-${b.status}`);
      const sel = el('td');
      const cek = el('input');
      cek.type = 'checkbox';
      cek.checked = state.dipilih.has(b.row);
      cek.disabled = b.status === 'bermasalah';
      cek.setAttribute('aria-label', `Impor baris ${b.row}, ${b.data.name || 'tanpa nama'}`);
      cek.addEventListener('change', () => { if (cek.checked) state.dipilih.add(b.row); else state.dipilih.delete(b.row); perbaruiTombol(); });
      sel.append(cek);
      tr.append(sel, el('td', '', String(b.row)), el('td', '', b.data.name || '(kosong)'));
      const st = el('td');
      st.append(chip(LABEL_STATUS[b.status], b.status));
      const wali = b.data.guardian === 'baru' ? 'Akun baru' : b.data.guardian === 'tautkan' ? 'Akun ditautkan' : (b.data.guardianName ? 'Tanpa akun' : '');
      tr.append(st, el('td', '', b.data.program), el('td', '', b.data.dormitoryName || ''), el('td', '', [b.data.guardianName, wali].filter(Boolean).join(' · ')));
      const catatan = el('td');
      catatan.append(pesanBaris(b));
      tr.append(catatan);
      tbody.append(tr);
    });
    if (!tampil.length) { const tr = el('tr'); const td = el('td', 'ip-note', 'Tidak ada baris untuk saringan ini.'); td.colSpan = 8; tr.append(td); tbody.append(tr); }
    tabel.append(thead, tbody);
    bungkus.append(tabel);
    k.append(bungkus);

    const aksi = el('div', 'ip-actions');
    aksi.append(tombol('Mulai ulang', null, () => { state.tahap = 'unggah'; state.batch = null; muatRiwayat(); lukis(); }));
    if (s.problem || s.duplicate) aksi.append(tombol('Unduh baris bermasalah (CSV)', null, unduhMasalah));
    if (s.problem) aksi.append(el('span', 'ip-note', 'Perbaiki barisnya di berkas, lalu unggah ulang.'));
    const st = el('p', 'ip-status');
    st.setAttribute('role', 'status');
    const konfirmasi = tombol('', 'button button--primary ip-small', async () => {
      const jumlah = state.dipilih.size;
      if (!jumlah) { st.textContent = 'Pilih minimal satu santri.'; st.className = 'ip-status is-galat'; return; }
      const duplikatDipilih = batch.rows.filter((b) => b.status === 'duplikat' && state.dipilih.has(b.row)).length;
      const teks = `Impor ${jumlah} santri sekarang?${duplikatDipilih ? ` ${duplikatDipilih} di antaranya ditandai duplikat dan tetap dibuat.` : ''}\n\nAkun santri dan wali hanya diundang lewat email; tidak ada kata sandi bawaan.`;
      if (!window.confirm(teks)) return;
      konfirmasi.disabled = true;
      st.textContent = 'Menyimpan... jangan tutup halaman ini.';
      try {
        const exclude = batch.rows.filter((b) => ['siap', 'peringatan'].includes(b.status) && !state.dipilih.has(b.row)).map((b) => b.row);
        const force = batch.rows.filter((b) => b.status === 'duplikat' && state.dipilih.has(b.row)).map((b) => b.row);
        state.batch = await api('POST', `/api/impor-santri/${encodeURIComponent(batch.id)}/konfirmasi`, { exclude, force });
        state.tahap = 'laporan';
        lukis();
      } catch (error) {
        st.textContent = error.message;
        st.className = 'ip-status is-galat';
        konfirmasi.disabled = false;
      }
    });
    function perbaruiTombol() { konfirmasi.textContent = `Impor ${state.dipilih.size} santri`; }
    perbaruiTombol();
    aksi.append(konfirmasi);
    k.append(st, aksi);
    return [k];
  }

  // ------------------------------------------------------------------ 4. laporan

  function tahapLaporan() {
    const batch = state.batch;
    const s = batch.summary;
    const k = kotak(`Laporan impor: ${batch.fileName || 'berkas'}`, batch.status === 'committed' ? `Selesai ${batch.committedAt ? WAKTU.format(new Date(batch.committedAt)) : ''}` : 'Impor belum selesai.');
    const ringkas = el('div', 'ip-summary');
    [['Santri dibuat', s.created || 0, 'siap'], ['Gagal diproses', s.failed || 0, 'bermasalah'], ['Dilewati', s.skipped || 0, 'duplikat'], ['Akun diundang', s.invitedAccounts || 0, 'netral'], ['Undangan terkirim', s.invitationsSent || 0, 'siap'], ['Wali ditautkan', s.guardiansLinked || 0, 'netral']].forEach(([label, nilai, kelas]) => {
      const d = el('div', `ip-summary__item ip-summary__item--${kelas}`);
      d.append(el('strong', '', String(nilai)), el('span', '', label));
      ringkas.append(d);
    });
    k.append(ringkas);
    if (s.invitationsPending) k.append(el('p', 'ip-warning', `${s.invitationsPending} akun belum menerima email undangan (email belum tersedia atau gagal). Kirim ulang dari halaman Kelola Akun; tautan aktivasi dibuat saat itu.`));
    k.append(el('p', 'ip-note', 'Akun hanya berupa undangan: pemilik akun membuat kata sandi sendiri lewat tautan aktivasi. Tautan tidak ditampilkan di laporan ini.'));
    const bungkus = el('div', 'ip-table-wrap');
    const tabel = el('table', 'ip-table');
    const thead = el('thead');
    const kepala = el('tr');
    ['No', 'Nama', 'Hasil', 'Keterangan'].forEach((t) => { const th = el('th', '', t); th.scope = 'col'; kepala.append(th); });
    thead.append(kepala);
    const tbody = el('tbody');
    [...batch.results].sort((a, b) => a.row - b.row).forEach((r) => {
      const tr = el('tr', r.ok ? 'is-siap' : r.skipped ? 'is-duplikat' : 'is-bermasalah');
      const td = el('td');
      td.append(chip(r.ok ? (r.notes && r.notes.length ? 'Dibuat, ada catatan' : 'Dibuat') : r.skipped ? 'Dilewati' : 'Gagal', r.ok ? (r.notes && r.notes.length ? 'peringatan' : 'siap') : r.skipped ? 'duplikat' : 'bermasalah'));
      const ket = el('td');
      const ul = el('ul', 'ip-msgs');
      if (r.error) ul.append(el('li', 'is-error', r.error));
      if (r.reason) ul.append(el('li', 'is-info', r.reason));
      (r.notes || []).forEach((t) => ul.append(el('li', 'is-warn', t)));
      (r.invited || []).forEach((u) => ul.append(el('li', 'is-info', u.ditautkan ? `Wali ditautkan ke akun yang sudah ada (${u.email}).` : `Undangan akun ${u.peran} ${u.terkirim ? 'terkirim' : 'belum terkirim'} (${u.email}).`)));
      ket.append(ul);
      tr.append(el('td', '', String(r.row)), el('td', '', r.name || ''), td, ket);
      tbody.append(tr);
    });
    tabel.append(thead, tbody);
    bungkus.append(tabel);
    k.append(bungkus);
    const aksi = el('div', 'ip-actions');
    aksi.append(tombol('Unduh laporan (CSV)', null, () => {
      const baris = [['No', 'Nama', 'Hasil', 'Keterangan']];
      [...batch.results].sort((a, b) => a.row - b.row).forEach((r) => baris.push([r.row, r.name, r.ok ? 'Dibuat' : r.skipped ? 'Dilewati' : 'Gagal', [r.error, r.reason, ...(r.notes || []), ...(r.invited || []).map((u) => `${u.peran}: ${u.ditautkan ? 'ditautkan' : u.terkirim ? 'undangan terkirim' : 'undangan belum terkirim'}`)].filter(Boolean).join(' | ')]));
      window.HamasahBerkasTabel.unduh('laporan-impor-santri.csv', window.HamasahBerkasTabel.keCsv(baris));
    }));
    const kelolaAkun = el('a', 'button button--secondary ip-small', 'Buka Kelola Akun');
    kelolaAkun.href = 'akun';
    aksi.append(kelolaAkun, tombol('Impor berkas lain', 'button button--primary ip-small', () => { state.tahap = 'unggah'; state.batch = null; state.berkas = null; muatRiwayat(); lukis(); }));
    k.append(aksi);
    return [k];
  }

  // ------------------------------------------------------------------ gambar

  async function muatRiwayat() {
    try {
      state.riwayat = await api('GET', '/api/impor-santri');
    } catch (error) {
      state.riwayat = { available: true, items: [] };
    }
    if (state.tahap === 'unggah') lukis();
  }

  function lukis() {
    const kepala = el('header', 'asr-head');
    const judul = el('div', 'asr-head__text');
    judul.append(el('p', 'wali-eyebrow', 'Impor santri'), el('h2', 'asr-head__title', 'Impor data santri secara massal'), el('p', 'mus-note', 'Masukkan data santri dari Excel atau Google Sheets tanpa mengetik satu per satu.'));
    kepala.append(judul);
    const isi = state.tahap === 'petakan' ? tahapPetakan() : state.tahap === 'tinjau' ? tahapTinjau() : state.tahap === 'laporan' ? tahapLaporan() : tahapUnggah();
    app.replaceChildren(kepala, stepBar(), ...isi);
  }

  (async function mulai() {
    if (session()) document.body.classList.add('in-crm');
    try {
      const me = await window.hamasahMintaAkun(headers());
      const akun = me.body && me.body.account;
      if (!me.ok || !akun || akun.role !== 'admin') throw new Error('Halaman ini hanya untuk admin.');
      guard.hidden = true;
      konsol.hidden = false;
      document.body.classList.add('in-crm');
      renderStaffNav(staffNav, akun.role, 'impor', akun);
      lukis();
      await muatRiwayat();
    } catch (error) {
      guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
      const judul = guard.querySelector('h1');
      if (judul) judul.textContent = 'Akses Impor Santri belum tersedia';
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
