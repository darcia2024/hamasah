// Beranda musyrif (16 Oktober 2026).
//   - Beranda: cerita AI untuk semua santri binaan, ringkasan pekan ini, dan kartu santri
//     berfoto. Kartu yang perlu perhatian diletakkan paling depan.
//   - Halaman satu santri: foto (bisa diganti), formulir cepat (sholat, setoran, kegiatan,
//     catatan, prestasi, disiplin, cerita AI), dan semua laporan yang bisa dikoreksi.
// Data dari GET /api/musyrif/ringkasan (hanya asrama yang dipegang) dan endpoint rekam
// jejak santri. Cerita AI: POST /api/musyrif/cerita mengembalikan usulan; tidak ada yang
// tersimpan sebelum musyrif menekan Simpan. Semua teks dipasang lewat textContent.
(function initBerandaMusyrif() {
  const K = window.HamasahBerandaKeluarga || {};
  const NILAI_HAFALAN = { lancar: 'Lancar', 'kurang-lancar': 'Kurang lancar', ulang: 'Perlu diulang' };
  const SHOLAT = [['subuh', 'Subuh'], ['dzuhur', 'Dzuhur'], ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya']];
  const STATUS_SHOLAT = [['berjamaah', 'Jamaah'], ['munfarid', 'Sendiri'], ['izin', 'Izin'], ['tidak', 'Tidak']];
  const STATUS_HADIR = [['present', 'Hadir'], ['late', 'Terlambat'], ['excused', 'Izin/sakit'], ['absent', 'Tidak hadir']];
  const AREA = ['Akhlak', 'Akademik', 'Hafalan', 'Ibadah', 'Kedisiplinan', 'Kesehatan', 'Sosial'];
  const TINGKAT = [['ringan', 'Ringan'], ['sedang', 'Sedang'], ['berat', 'Berat']];
  const ALASAN_KOREKSI = ['Salah ketik', 'Isi kurang lengkap', 'Salah tanggal', 'Salah status'];
  const JENIS_LABEL = {
    sholat: 'Sholat', setoran: 'Setoran hafalan', kehadiran: 'Presensi kegiatan', catatan: 'Catatan pembina',
    prestasi: 'Prestasi', disiplin: 'Disiplin', kegiatan: 'Kegiatan'
  };
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const HARI = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fotoCache = new Map();
  let statusAi = null;

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

  function hariIni() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  }

  function mundur(hari) {
    const d = new Date(`${hariIni()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - hari);
    return d.toISOString().slice(0, 10);
  }

  function tanggalPendek(iso) {
    if (!iso) return '';
    const teks = String(iso);
    const d = new Date(teks.length === 10 ? `${teks}T00:00:00Z` : teks);
    return Number.isNaN(d.getTime()) ? teks : TANGGAL.format(d);
  }

  function tanggalPanjang(isoDate) {
    return HARI.format(new Date(`${isoDate}T00:00:00Z`));
  }

  // Waktu catatan dari tanggal yang dipilih: sekarang bila hari ini, tengah hari WIB bila
  // tanggal lampau (supaya tidak bergeser hari karena zona waktu).
  function waktuDari(tanggal) {
    return tanggal === hariIni() ? new Date().toISOString() : new Date(`${tanggal}T12:00:00+07:00`).toISOString();
  }

  function persen(bagian, total) {
    return total ? Math.round((bagian / total) * 100) : null;
  }

  function inisial(nama) {
    return String(nama || '').trim().split(/\s+/).slice(0, 2).map((k) => k[0] || '').join('').toUpperCase() || '?';
  }

  async function mintaJson(url, headers, init = {}) {
    const response = await fetch(url, { ...init, headers: { ...headers, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const galat = new Error(data.error || 'Permintaan belum berhasil.');
      galat.status = response.status;
      throw galat;
    }
    return data;
  }

  function kirim(method, url, headers, body) {
    return mintaJson(url, headers, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  // ------------------------------------------------------------------ Foto
  async function fotoUrl(studentId, headers) {
    if (fotoCache.has(studentId)) return fotoCache.get(studentId);
    const janji = fetch(`/api/students/${encodeURIComponent(studentId)}/photo`, { headers })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    fotoCache.set(studentId, janji);
    return janji;
  }

  function avatar(student, headers, kelas = '') {
    const wadah = el('span', `mus-photo ${kelas}`.trim());
    wadah.append(el('span', 'mus-photo__initials', inisial(student.name)));
    if (student.hasPhoto) {
      fotoUrl(student.id, headers).then((url) => {
        if (!url) return;
        const img = el('img', 'mus-photo__img');
        img.alt = `Foto ${student.name}`;
        img.src = url;
        img.decoding = 'async';
        wadah.append(img);
        wadah.classList.add('has-img');
      });
    }
    return wadah;
  }

  // Foto dikecilkan di peramban (sisi terpanjang 800 px, JPEG) lalu diunggah lewat alur
  // /api/uploads yang sama dengan berkas lain.
  async function kecilkan(file) {
    let gambar;
    try {
      gambar = await createImageBitmap(file);
    } catch {
      throw new Error('Berkas ini tidak bisa dibaca sebagai foto. Gunakan JPG, PNG, atau WebP.');
    }
    const skala = Math.min(1, 800 / Math.max(gambar.width, gambar.height));
    const kanvas = document.createElement('canvas');
    kanvas.width = Math.round(gambar.width * skala);
    kanvas.height = Math.round(gambar.height * skala);
    const ktx = kanvas.getContext('2d');
    ktx.fillStyle = '#FFFFFF';
    ktx.fillRect(0, 0, kanvas.width, kanvas.height);
    ktx.drawImage(gambar, 0, 0, kanvas.width, kanvas.height);
    if (typeof gambar.close === 'function') gambar.close();
    const blob = await new Promise((resolve) => kanvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Foto belum dapat diproses. Coba foto lain.');
    return blob;
  }

  async function unggahFoto(studentId, file, headers) {
    const blob = await kecilkan(file);
    const minta = await kirim('POST', '/api/uploads', headers, { purpose: 'student-photo', entityId: studentId, fileName: 'foto-santri.jpg', contentType: 'image/jpeg', size: blob.size });
    const id = encodeURIComponent(minta.upload.id);
    if (minta.directUpload) {
      const tautan = await kirim('POST', `/api/uploads/${id}/direct`, headers);
      const terkirim = await fetch(tautan.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!terkirim.ok) throw new Error('Foto gagal dikirim ke penyimpanan.');
      await kirim('POST', `/api/uploads/${id}/confirm`, headers);
    } else {
      const response = await fetch(`/api/uploads/${id}/content`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'image/jpeg' }, body: blob });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.error || 'Foto gagal diunggah.');
    }
    const lama = fotoCache.get(studentId);
    if (lama) lama.then((url) => { if (url) URL.revokeObjectURL(url); });
    fotoCache.set(studentId, Promise.resolve(URL.createObjectURL(blob)));
  }

  // ------------------------------------------------------------- Simpan
  // Satu pintu penyimpanan untuk formulir cepat dan hasil cerita AI.
  const simpan = {
    sholat: (id, tanggal, entries, h) => kirim('PUT', `/api/students/${id}/prayers`, h, { date: tanggal, entries }),
    setoran: (id, tanggal, v, h) => kirim('POST', `/api/students/${id}/memorization`, h, { occurredOn: tanggal, kind: v.kind, portion: v.portion, grade: v.grade, note: v.note || '' }),
    kehadiran: (id, tanggal, v, h) => kirim('POST', `/api/students/${id}/attendance`, h, { status: v.status, category: v.category, note: v.note || '', occurredAt: waktuDari(tanggal) }),
    catatan: (id, tanggal, v, h) => kirim('POST', `/api/students/${id}/evaluations`, h, { area: v.area, note: v.note, occurredAt: waktuDari(tanggal) }),
    prestasi: (id, tanggal, v, h) => kirim('POST', `/api/students/${id}/achievements`, h, { title: v.title, description: v.description || '', occurredAt: waktuDari(tanggal) }),
    disiplin: (id, tanggal, v, h) => kirim('POST', `/api/students/${id}/violations`, h, { level: v.level, note: v.note, occurredAt: waktuDari(tanggal) }),
    kegiatan: (id, tanggal, v, h) => kirim('POST', `/api/students/${id}/activities`, h, { title: v.title, description: v.description || '', occurredAt: waktuDari(tanggal) })
  };

  // ---------------------------------------------------- Kontrol formulir
  let nomor = 0;
  function idBaru(awalan) {
    nomor += 1;
    return `${awalan}-${nomor}`;
  }

  // Pilihan bersegmen (radio bergaya tombol). Mengembalikan { el, nilai(), setel(v) }.
  function pilihan(label, opsi, awal, { kecil = false } = {}) {
    const nama = idBaru('pilih');
    const wadah = el('fieldset', `mus-seg ${kecil ? 'mus-seg--kecil' : ''}`.trim());
    if (label) wadah.append(el('legend', 'mus-label', label));
    const baris = el('div', 'mus-seg__row');
    const input = opsi.map(([nilai, teks]) => {
      const id = idBaru('opsi');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = nama;
      radio.value = nilai;
      radio.id = id;
      radio.checked = nilai === awal;
      const lbl = el('label', `mus-seg__opt is-${nilai}`, teks);
      lbl.htmlFor = id;
      baris.append(radio, lbl);
      return radio;
    });
    wadah.append(baris);
    return {
      el: wadah,
      nilai: () => (input.find((r) => r.checked) || {}).value || '',
      setel: (v) => input.forEach((r) => { r.checked = r.value === v; })
    };
  }

  function bidang(label, jenis = 'text', { placeholder = '', nilai = '', daftar = null, wajib = false } = {}) {
    const id = idBaru('bidang');
    const wadah = el('div', 'mus-field');
    const lbl = el('label', 'mus-label', label);
    lbl.htmlFor = id;
    const input = jenis === 'textarea' ? el('textarea', 'mus-input mus-input--area') : el('input', 'mus-input');
    if (jenis !== 'textarea') input.type = jenis;
    input.id = id;
    input.placeholder = placeholder;
    input.value = nilai;
    if (wajib) input.required = true;
    if (daftar && daftar.length) {
      const dl = el('datalist');
      dl.id = idBaru('saran');
      daftar.forEach((v) => { const o = el('option'); o.value = v; dl.append(o); });
      input.setAttribute('list', dl.id);
      wadah.append(dl);
    }
    wadah.prepend(lbl);
    wadah.append(input);
    return { el: wadah, input, nilai: () => input.value.trim(), setel: (v) => { input.value = v; } };
  }

  function bidangTanggal(nilai = hariIni()) {
    const b = bidang('Tanggal', 'date', { nilai });
    b.input.max = hariIni();
    return b;
  }

  function pesanStatus() {
    const p = el('p', 'mus-status');
    p.setAttribute('role', 'status');
    return {
      el: p,
      ok(teks) { p.textContent = teks; p.className = 'mus-status is-ok'; },
      galat(teks) { p.textContent = teks; p.className = 'mus-status is-galat'; },
      kosong() { p.textContent = ''; p.className = 'mus-status'; }
    };
  }

  // ---------------------------------------------------- Cerita AI
  async function cekAi(headers) {
    if (statusAi === null) {
      statusAi = mintaJson('/api/musyrif/cerita/status', headers).then((d) => Boolean(d.active)).catch(() => false);
    }
    return statusAi;
  }

  // Satu usulan menjadi baris yang bisa dikoreksi sebelum disimpan.
  function barisUsulan(p) {
    const baris = el('li', 'mus-proposal');
    const centang = el('input');
    centang.type = 'checkbox';
    centang.checked = true;
    centang.setAttribute('aria-label', `Simpan ${JENIS_LABEL[p.type]} ini`);
    const isi = el('div', 'mus-proposal__body');
    isi.append(el('span', 'mus-proposal__kind', JENIS_LABEL[p.type] || p.type));
    const kontrol = el('div', 'mus-proposal__fields');
    let ambil = () => p.value;

    if (p.type === 'sholat') {
      const w = pilihan(null, SHOLAT, p.value.prayer, { kecil: true });
      const s = pilihan(null, STATUS_SHOLAT, p.value.status, { kecil: true });
      kontrol.append(w.el, s.el);
      ambil = () => ({ prayer: w.nilai(), status: s.nilai() });
    } else if (p.type === 'setoran') {
      const j = pilihan(null, [['ziyadah', 'Hafalan baru'], ['murajaah', 'Murajaah']], p.value.kind, { kecil: true });
      const bagian = bidang('Bagian', 'text', { nilai: p.value.portion });
      const g = pilihan(null, Object.entries(NILAI_HAFALAN), p.value.grade, { kecil: true });
      kontrol.append(j.el, bagian.el, g.el);
      ambil = () => ({ kind: j.nilai(), portion: bagian.nilai(), grade: g.nilai(), note: p.value.note || '' });
    } else if (p.type === 'kehadiran') {
      const kg = bidang('Kegiatan', 'text', { nilai: p.value.category });
      const s = pilihan(null, STATUS_HADIR, p.value.status, { kecil: true });
      kontrol.append(kg.el, s.el);
      ambil = () => ({ category: kg.nilai() || 'Kegiatan harian', status: s.nilai(), note: p.value.note || '' });
    } else if (p.type === 'catatan') {
      const a = pilihan(null, AREA.map((x) => [x, x]), p.value.area, { kecil: true });
      const n = bidang('Catatan', 'textarea', { nilai: p.value.note });
      kontrol.append(a.el, n.el);
      ambil = () => ({ area: a.nilai() || 'Pembinaan', note: n.nilai() });
    } else if (p.type === 'disiplin') {
      const l = pilihan(null, TINGKAT, p.value.level, { kecil: true });
      const n = bidang('Pelanggaran', 'text', { nilai: p.value.note });
      kontrol.append(l.el, n.el);
      ambil = () => ({ level: l.nilai(), note: n.nilai() });
    } else {
      const t = bidang('Judul', 'text', { nilai: p.value.title });
      const d = bidang('Keterangan', 'text', { nilai: p.value.description || '' });
      kontrol.append(t.el, d.el);
      ambil = () => ({ title: t.nilai(), description: d.nilai() });
    }
    isi.append(kontrol);
    baris.append(centang, isi);
    return { el: baris, aktif: () => centang.checked, ambil };
  }

  async function simpanUsulan(daftar, tanggal, headers) {
    // Sholat digabung per santri: satu permintaan untuk semua waktu di tanggal itu.
    const sholat = new Map();
    const lain = [];
    daftar.forEach(({ studentId, type, value }) => {
      if (type === 'sholat') {
        if (!sholat.has(studentId)) sholat.set(studentId, new Map());
        sholat.get(studentId).set(value.prayer, value.status);
      } else lain.push({ studentId, type, value });
    });
    let berhasil = 0;
    const gagal = [];
    for (const [studentId, peta] of sholat) {
      try {
        await simpan.sholat(encodeURIComponent(studentId), tanggal, [...peta].map(([prayer, status]) => ({ prayer, status })), headers);
        berhasil += peta.size;
      } catch (error) { gagal.push(error.message); }
    }
    for (const u of lain) {
      try {
        await simpan[u.type](encodeURIComponent(u.studentId), tanggal, u.value, headers);
        berhasil += 1;
      } catch (error) { gagal.push(error.message); }
    }
    return { berhasil, gagal };
  }

  // Kotak cerita. studentIds: batasi ke santri tertentu (halaman satu santri).
  function kotakCerita({ headers, studentIds = null, judul = 'Ceritakan hari ini', onSaved }) {
    const wadah = el('section', 'mus-story');
    const kepala = el('header', 'mus-story__head');
    kepala.append(
      el('h3', 'mus-title', judul),
      el('p', 'mus-note', studentIds
        ? 'Tulis apa saja tentang santri ini. AI memilahnya menjadi catatan yang bisa Anda periksa dulu.'
        : 'Tulis seperti bercerita. AI memetakan siapa melakukan apa ke laporan tiap santri; Anda periksa dulu sebelum disimpan.')
    );
    const tanggal = bidangTanggal();
    const teks = bidang('Cerita', 'textarea', {
      placeholder: studentIds
        ? 'Contoh: Hari ini setor Al-Mulk 1-15, lancar. Subuh dan isya berjamaah, dzuhur terlambat ikut jamaah. Membantu teman merapikan kamar.'
        : 'Contoh: Subuh tadi semua berjamaah kecuali Ahmad yang sholat sendiri karena kesiangan. Hana setor Al-Mulk 1-15 lancar. Talaqqi kitab sore, Fikri terlambat.'
    });
    teks.input.rows = studentIds ? 4 : 5;
    const aksi = el('div', 'mus-actions');
    const petakan = tombol('Petakan dengan AI', 'button button--primary');
    aksi.append(petakan);
    const status = pesanStatus();
    const hasil = el('div', 'mus-review');
    wadah.append(kepala, teks.el, tanggal.el, aksi, status.el, hasil);

    cekAi(headers).then((aktif) => {
      if (aktif) return;
      petakan.disabled = true;
      status.galat('Cerita AI belum aktif di server ini (kunci OpenRouter belum diisi). Untuk sementara, isi lewat formulir cepat.');
    });

    petakan.addEventListener('click', async () => {
      status.kosong();
      hasil.replaceChildren();
      if (teks.nilai().length < 10) { status.galat('Ceritanya terlalu pendek.'); return; }
      petakan.disabled = true;
      petakan.textContent = 'Memetakan...';
      try {
        const data = await kirim('POST', '/api/musyrif/cerita', headers, { story: teks.nilai(), date: tanggal.nilai(), studentIds: studentIds || undefined });
        tampilkanTinjauan(data);
      } catch (error) {
        status.galat(error.message);
      } finally {
        petakan.disabled = false;
        petakan.textContent = 'Petakan dengan AI';
      }
    });

    function tampilkanTinjauan(data) {
      if (!data.proposals.length) {
        status.galat('AI tidak menemukan catatan yang bisa dipetakan. Coba sebut nama santri dan apa yang terjadi.');
        return;
      }
      const kelompok = new Map();
      data.proposals.forEach((p) => {
        if (!kelompok.has(p.studentId)) kelompok.set(p.studentId, { nama: p.studentName, butir: [] });
        kelompok.get(p.studentId).butir.push(p);
      });
      const semua = [];
      const daftar = el('div', 'mus-review__groups');
      kelompok.forEach(({ nama, butir }, studentId) => {
        const grup = el('section', 'mus-review__group');
        grup.append(el('h4', 'mus-review__name', nama));
        const ul = el('ul', 'mus-proposals');
        butir.forEach((p) => {
          const baris = barisUsulan(p);
          semua.push({ studentId, type: p.type, baris });
          ul.append(baris.el);
        });
        grup.append(ul);
        daftar.append(grup);
      });
      const kepalaTinjau = el('div', 'mus-review__head');
      kepalaTinjau.append(
        el('p', 'mus-review__summary', data.summary || `${data.proposals.length} catatan untuk ${kelompok.size} santri, tanggal ${tanggalPendek(data.date)}.`),
        el('p', 'mus-note', 'Hapus centang yang tidak ingin disimpan, atau perbaiki isinya.')
      );
      const simpanSemua = tombol(`Simpan ${data.proposals.length} catatan`, 'button button--primary');
      const batal = tombol('Batal');
      const aksiTinjau = el('div', 'mus-actions');
      aksiTinjau.append(simpanSemua, batal);
      const isi = [kepalaTinjau, daftar];
      if (data.unmatched && data.unmatched.length) {
        const lepas = el('div', 'mus-unmatched');
        lepas.append(el('p', 'mus-label', 'Tidak terpetakan, mungkin perlu dicatat manual:'));
        const ul = el('ul');
        data.unmatched.forEach((t) => ul.append(el('li', '', t)));
        lepas.append(ul);
        isi.push(lepas);
      }
      isi.push(aksiTinjau);
      hasil.replaceChildren(...isi);
      const hitungUlang = () => { simpanSemua.textContent = `Simpan ${semua.filter((s) => s.baris.aktif()).length} catatan`; };
      hasil.addEventListener('change', hitungUlang);
      batal.addEventListener('click', () => { hasil.replaceChildren(); status.kosong(); });
      simpanSemua.addEventListener('click', async () => {
        const dipilih = semua.filter((s) => s.baris.aktif()).map((s) => ({ studentId: s.studentId, type: s.type, value: s.baris.ambil() }));
        if (!dipilih.length) { status.galat('Belum ada catatan yang dicentang.'); return; }
        simpanSemua.disabled = true;
        simpanSemua.textContent = 'Menyimpan...';
        const { berhasil, gagal } = await simpanUsulan(dipilih, data.date, headers);
        simpanSemua.disabled = false;
        if (gagal.length) {
          status.galat(`${berhasil} catatan tersimpan, ${gagal.length} gagal: ${[...new Set(gagal)].join(' ')}`);
          hitungUlang();
        } else {
          status.ok(`${berhasil} catatan tersimpan.`);
          hasil.replaceChildren();
          teks.setel('');
        }
        if (berhasil && onSaved) onSaved();
      });
    }
    return wadah;
  }

  // ------------------------------------------------------------ Beranda
  function alasanPerhatian(s) {
    const alasan = [];
    const sholat = persen(s.prayers7.congregational, s.prayers7.recorded);
    if (sholat !== null && sholat < 60) alasan.push(`Sholat berjamaah ${sholat}%`);
    if (s.prayers7.missed) alasan.push(`${s.prayers7.missed} waktu tidak sholat`);
    if (s.attendance7.absent) alasan.push(`${s.attendance7.absent}x tidak hadir`);
    if (s.memorization.repeats14) alasan.push(`${s.memorization.repeats14} setoran diulang`);
    if (s.violations30) alasan.push(`${s.violations30} catatan disiplin`);
    if (s.health && s.health.condition !== 'sehat') alasan.push(s.health.label);
    if (!s.prayers7.recorded && !s.attendance7.recorded) alasan.push('Belum dicatat pekan ini');
    return alasan;
  }

  function kartuSantri(s, headers, onOpen) {
    const alasan = alasanPerhatian(s);
    const kartu = el('button', `mus-card ${alasan.length ? 'is-perhatian' : ''}`.trim());
    kartu.type = 'button';
    kartu.setAttribute('aria-label', `Buka laporan ${s.name}`);
    const sholat = persen(s.prayers7.congregational, s.prayers7.recorded);
    const hadir = persen(s.attendance7.present + s.attendance7.late, s.attendance7.recorded);
    const info = el('span', 'mus-card__info');
    info.append(
      el('span', 'mus-card__name', s.name),
      el('span', 'mus-card__meta', [s.program, s.dormitory && s.dormitory.name].filter(Boolean).join(' · '))
    );
    const angka = el('span', 'mus-card__stats');
    angka.append(
      el('span', '', `Sholat ${sholat === null ? '–' : `${sholat}%`}`),
      el('span', '', `Hadir ${hadir === null ? '–' : `${hadir}%`}`),
      el('span', '', `${s.memorization.deposits7} setoran`)
    );
    info.append(angka);
    info.append(el('span', `mus-card__state ${alasan.length ? 'is-watch' : ''}`, alasan.length ? 'Perlu ditinjau' : 'Tidak ada tanda perhatian'));
    if (alasan.length) info.append(el('span', 'mus-card__flag', alasan.join(' · ')));
    kartu.append(avatar(s, headers, 'mus-photo--card'), info);
    kartu.addEventListener('click', () => onOpen(s));
    return kartu;
  }

  async function render(wadah, { headers, onOpenSantri }) {
    const memuat = el('p', 'mus-loading', 'Memuat santri binaan...');
    memuat.setAttribute('role', 'status');
    wadah.replaceChildren(memuat);
    wadah.classList.add('mus-page');
    wadah.classList.add('mus-dashboard');

    const data = await mintaJson('/api/musyrif/ringkasan', headers);
    const { summary, students, dormitories } = data;
    if (!dormitories.length) {
      wadah.replaceChildren(el('p', 'mus-loading', 'Anda belum ditugaskan ke asrama mana pun. Minta admin menugaskan asrama lewat halaman Monitoring.'));
      return;
    }

    const urut = students.slice().sort((a, b) => alasanPerhatian(b).length - alasanPerhatian(a).length || a.name.localeCompare(b.name));
    const perhatian = urut.filter((s) => alasanPerhatian(s).length).length;

    const kepalaSantri = el('header', 'mus-section__head');
    kepalaSantri.append(
      el('h3', 'mus-title', 'Santri binaan'),
      el('p', 'mus-note', `${students.length} santri · ${dormitories.map((d) => d.name).join(', ')}. Buka santri untuk mencatat dan melihat perkembangannya.`)
    );
    const grid = el('div', 'mus-grid');
    urut.forEach((s) => grid.append(kartuSantri(s, headers, onOpenSantri)));
    if (!urut.length) grid.append(el('p', 'mus-loading', 'Belum ada santri di asrama Anda.'));
    const bagianSantri = el('section', 'mus-section');
    const controls = el('div', 'mus-roster-controls');
    const search = bidang('Cari santri', 'search', { placeholder: 'Nama santri…' });
    const filter = el('select', 'mus-input'); filter.setAttribute('aria-label', 'Saring kondisi santri');
    [['all','Semua santri'],['attention','Perlu ditinjau']].forEach(([value,label]) => { const option = el('option','',label); option.value = value; filter.append(option); });
    const count = el('p', 'mus-note'); count.setAttribute('role','status');
    function filterRoster() {
      const visible = urut.filter(s => s.name.toLocaleLowerCase('id').includes(search.nilai().toLocaleLowerCase('id')) && (filter.value !== 'attention' || alasanPerhatian(s).length));
      grid.replaceChildren(...visible.map(s => kartuSantri(s, headers, onOpenSantri)));
      if (!visible.length) grid.append(el('p','mus-empty','Tidak ada santri yang sesuai pencarian.'));
      count.textContent = `${visible.length} dari ${students.length} santri ditampilkan`;
    }
    search.input.addEventListener('input',filterRoster); filter.addEventListener('change',filterRoster);
    controls.append(search.el,filter); filterRoster();
    bagianSantri.append(kepalaSantri, controls, count, grid);

    const angka = el('div', 'mus-stats');
    [
      [summary.attendanceRate7 === null ? '–' : `${summary.attendanceRate7}%`, 'kehadiran kegiatan', '7 hari terakhir'],
      [summary.prayerRate7 === null ? '–' : `${summary.prayerRate7}%`, 'sholat berjamaah', '7 hari terakhir'],
      [String(summary.deposits7), 'setoran hafalan', 'pekan ini'],
      [String(summary.violations30), 'catatan disiplin', '30 hari terakhir']
    ].forEach(([nilai, label, catatan]) => {
      const s = el('div', 'mus-stat');
      s.append(el('strong', 'mus-stat__value', nilai), el('span', 'mus-stat__label', label), el('span', 'mus-stat__note', catatan));
      angka.append(s);
    });

    const overview = el('section','mus-section mus-overview');
    const overviewHead = el('header','mus-section__head');
    overviewHead.append(el('h3','mus-title','Ringkasan asrama'),el('p','mus-note','Perkembangan dari laporan yang sudah dicatat. Data kosong tidak dihitung sebagai ketidakhadiran.'));
    overview.append(overviewHead,angka);
    const watch = el('section','mus-section mus-watch');
    const watchHead = el('header','mus-section__head');
    watchHead.append(el('h3','mus-title','Prioritas pembinaan'),el('p','mus-note',`${perhatian} santri memiliki catatan yang perlu ditinjau. Buka laporan untuk melihat konteksnya.`));
    watch.append(watchHead);
    const watchList = el('div','mus-watch__list');
    urut.filter(s => alasanPerhatian(s).length).slice(0,5).forEach(s => { const b = tombol('','mus-watch__item'); b.append(el('strong','',s.name),el('span','',alasanPerhatian(s).join(' · ')),el('span','mus-link','Buka laporan →')); b.addEventListener('click',()=>onOpenSantri(s)); watchList.append(b); });
    if (!perhatian) watchList.append(el('p','mus-empty','Tidak ada tanda perhatian dari laporan yang tersedia. Tetap lengkapi pencatatan harian.'));
    if (perhatian > 5) watchList.append(el('p','mus-note','Gunakan filter Perlu ditinjau pada daftar santri untuk melihat semuanya.'));
    watch.append(watchList);
    const assistant = el('details','mus-section mus-assistant');
    assistant.append(el('summary','mus-title','Bantu susun laporan dengan AI'));
    assistant.append(kotakCerita({ headers, onSaved: () => render(wadah, { headers, onOpenSantri }).catch(() => {}) }));
    wadah.replaceChildren(overview,watch,bagianSantri,assistant);
  }

  // ------------------------------------------------------ Halaman santri
  // dataKini: fungsi yang mengembalikan data terbaru, karena laporan dimuat ulang tiap simpan.
  function formSholat(student, headers, dataKini, onSaved) {
    const wadah = el('div', 'mus-form');
    const tanggal = bidangTanggal();
    const baris = SHOLAT.map(([kunci, label]) => {
      const p = pilihan(label, STATUS_SHOLAT, '', { kecil: true });
      p.el.classList.add('mus-prayer');
      return { kunci, p };
    });
    const isiDari = () => {
      const data = dataKini();
      const hari = ((data.care && data.care.prayers && data.care.prayers.days) || []).find((d) => d.date === tanggal.nilai());
      baris.forEach(({ kunci, p }) => p.setel(hari ? hari.prayers[kunci] || '' : ''));
    };
    tanggal.input.addEventListener('change', isiDari);
    isiDari();
    const semua = tombol('Semua jamaah', 'mus-chip');
    semua.addEventListener('click', () => baris.forEach(({ p }) => p.setel('berjamaah')));
    const status = pesanStatus();
    const simpanBtn = tombol('Simpan sholat', 'button button--primary');
    simpanBtn.addEventListener('click', async () => {
      const entries = baris.map(({ kunci, p }) => ({ prayer: kunci, status: p.nilai() })).filter((e) => e.status);
      if (!entries.length) { status.galat('Pilih status minimal satu waktu sholat.'); return; }
      simpanBtn.disabled = true;
      try {
        await simpan.sholat(encodeURIComponent(student.id), tanggal.nilai(), entries, headers);
        status.ok(`Sholat ${tanggalPendek(tanggal.nilai())} tersimpan (${entries.length} waktu).`);
        onSaved();
      } catch (error) { status.galat(error.message); } finally { simpanBtn.disabled = false; }
    });
    const atas = el('div', 'mus-form__row');
    atas.append(tanggal.el, semua);
    const aksi = el('div', 'mus-actions');
    aksi.append(simpanBtn);
    wadah.append(atas, ...baris.map((b) => b.p.el), aksi, status.el);
    return { el: wadah, setelTanggal(t) { tanggal.setel(t); isiDari(); } };
  }

  function formUmum(student, headers, jenis, data, onSaved) {
    const wadah = el('div', 'mus-form');
    const tanggal = bidangTanggal();
    const status = pesanStatus();
    let ambil;
    let isi = [];
    const riwayat = data.dashboard || {};
    if (jenis === 'setoran') {
      const portions = [...new Set(((data.care && data.care.memorization) || []).map((m) => m.portion))].slice(0, 12);
      const j = pilihan('Jenis', [['ziyadah', 'Hafalan baru'], ['murajaah', 'Murajaah']], 'ziyadah');
      const b = bidang('Bagian yang disetor', 'text', { placeholder: 'QS. Al-Mulk 1-15', daftar: portions });
      const g = pilihan('Hasil', Object.entries(NILAI_HAFALAN), 'lancar');
      const n = bidang('Catatan (opsional)', 'text', { placeholder: 'Misal: tajwid mad perlu diperbaiki' });
      isi = [j.el, b.el, g.el, n.el];
      ambil = () => {
        if (b.nilai().length < 2) throw new Error('Isi bagian yang disetor.');
        return { kind: j.nilai(), portion: b.nilai(), grade: g.nilai(), note: n.nilai() };
      };
    } else if (jenis === 'kehadiran') {
      const kategori = [...new Set(((riwayat.attendance && riwayat.attendance.entries) || []).map((e) => e.category).filter(Boolean))];
      const k = bidang('Kegiatan', 'text', { placeholder: 'Talaqqi kitab', daftar: kategori });
      const cepat = el('div', 'mus-chips');
      kategori.slice(0, 6).forEach((nama) => {
        const c = tombol(nama, 'mus-chip');
        c.addEventListener('click', () => k.setel(nama));
        cepat.append(c);
      });
      const s = pilihan('Kehadiran', STATUS_HADIR, 'present');
      const n = bidang('Catatan (opsional)', 'text');
      isi = [k.el, ...(kategori.length ? [cepat] : []), s.el, n.el];
      ambil = () => ({ category: k.nilai() || 'Kegiatan harian', status: s.nilai(), note: n.nilai() });
    } else if (jenis === 'catatan') {
      const a = pilihan('Bidang', AREA.map((x) => [x, x]), 'Akhlak');
      const n = bidang('Catatan pembina', 'textarea', { placeholder: 'Tulis singkat apa yang Anda amati. Wali akan membaca catatan ini.' });
      isi = [a.el, n.el];
      ambil = () => {
        if (n.nilai().length < 8) throw new Error('Catatan perlu sedikit lebih lengkap (minimal 8 huruf).');
        return { area: a.nilai(), note: n.nilai() };
      };
    } else if (jenis === 'prestasi') {
      const t = bidang('Prestasi', 'text', { placeholder: 'Juara 2 lomba khitobah asrama' });
      const d = bidang('Keterangan (opsional)', 'text');
      isi = [t.el, d.el];
      ambil = () => {
        if (t.nilai().length < 3) throw new Error('Tulis prestasinya.');
        return { title: t.nilai(), description: d.nilai() };
      };
    } else if (jenis === 'disiplin') {
      const l = pilihan('Tingkat', TINGKAT, 'ringan');
      const n = bidang('Pelanggaran', 'text', { placeholder: 'Keluar asrama tanpa izin' });
      isi = [l.el, n.el];
      ambil = () => {
        if (n.nilai().length < 3) throw new Error('Tulis pelanggarannya.');
        return { level: l.nilai(), note: n.nilai() };
      };
    }
    const simpanBtn = tombol('Simpan', 'button button--primary');
    simpanBtn.addEventListener('click', async () => {
      status.kosong();
      let nilai;
      try { nilai = ambil(); } catch (error) { status.galat(error.message); return; }
      simpanBtn.disabled = true;
      try {
        await simpan[jenis](encodeURIComponent(student.id), tanggal.nilai(), nilai, headers);
        status.ok(`${JENIS_LABEL[jenis]} tersimpan.`);
        wadah.querySelectorAll('input[type="text"], textarea').forEach((i) => { i.value = ''; });
        onSaved();
      } catch (error) { status.galat(error.message); } finally { simpanBtn.disabled = false; }
    });
    const aksi = el('div', 'mus-actions');
    aksi.append(simpanBtn);
    wadah.append(...isi, tanggal.el, aksi, status.el);
    return { el: wadah };
  }

  // Semua laporan satu santri dalam satu daftar. koleksi: nama koleksi untuk koreksi.
  function butirLaporan(data) {
    const d = data.dashboard || {};
    const butir = [];
    ((d.attendance && d.attendance.entries) || []).forEach((e) => butir.push({ waktu: e.occurredAt, jenis: 'kehadiran', koleksi: 'attendance', rekaman: e, judul: `${e.category || 'Kegiatan'}: ${(STATUS_HADIR.find(([v]) => v === e.status) || [])[1] || e.status}`, isi: e.note }));
    (d.activities || []).forEach((e) => butir.push({ waktu: e.occurredAt, jenis: 'kegiatan', koleksi: 'activities', rekaman: e, judul: e.title, isi: e.description }));
    (d.evaluations || []).forEach((e) => butir.push({ waktu: e.occurredAt, jenis: 'catatan', koleksi: 'evaluations', rekaman: e, judul: e.area || 'Catatan', isi: e.note }));
    (d.achievements || []).forEach((e) => butir.push({ waktu: e.occurredAt, jenis: 'prestasi', koleksi: 'achievements', rekaman: e, judul: e.title, isi: e.description }));
    (d.discipline || []).forEach((e) => butir.push({ waktu: e.occurredAt, jenis: 'disiplin', koleksi: 'violations', rekaman: e, judul: `Disiplin (${e.level || 'ringan'})`, isi: e.note }));
    ((data.care && data.care.memorization) || []).forEach((m) => butir.push({ waktu: m.occurredOn, jenis: 'setoran', judul: `${m.kind === 'ziyadah' ? 'Hafalan baru' : 'Murajaah'}: ${m.portion}`, isi: [NILAI_HAFALAN[m.grade] || m.grade, m.note].filter(Boolean).join('. ') }));
    ((data.care && data.care.prayers && data.care.prayers.days) || []).forEach((h) => butir.push({
      waktu: h.date, jenis: 'sholat', tanggal: h.date,
      judul: SHOLAT.map(([k, l]) => `${l} ${h.prayers[k] ? (STATUS_SHOLAT.find(([v]) => v === h.prayers[k]) || [])[1] : '–'}`).join(' · ')
    }));
    return butir.sort((a, b) => String(b.waktu).localeCompare(String(a.waktu)));
  }

  function formKoreksi(b, headers, studentId, onDone) {
    const r = b.rekaman;
    const wadah = el('div', 'mus-edit');
    let ambil;
    if (b.koleksi === 'attendance') {
      const k = bidang('Kegiatan', 'text', { nilai: r.category || '' });
      const s = pilihan('Kehadiran', STATUS_HADIR, r.status, { kecil: true });
      const n = bidang('Catatan', 'text', { nilai: r.note || '' });
      wadah.append(k.el, s.el, n.el);
      ambil = () => ({ category: k.nilai(), status: s.nilai(), note: n.nilai() });
    } else if (b.koleksi === 'evaluations') {
      const a = pilihan('Bidang', AREA.map((x) => [x, x]), r.area, { kecil: true });
      const n = bidang('Catatan', 'textarea', { nilai: r.note || '' });
      wadah.append(a.el, n.el);
      ambil = () => ({ area: a.nilai() || r.area, note: n.nilai() });
    } else if (b.koleksi === 'violations') {
      const l = pilihan('Tingkat', TINGKAT, r.level, { kecil: true });
      const n = bidang('Pelanggaran', 'text', { nilai: r.note || '' });
      wadah.append(l.el, n.el);
      ambil = () => ({ level: l.nilai() || r.level, note: n.nilai() });
    } else {
      const t = bidang('Judul', 'text', { nilai: r.title || '' });
      const d = bidang('Keterangan', 'text', { nilai: r.description || '' });
      wadah.append(t.el, d.el);
      ambil = () => ({ title: t.nilai(), description: d.nilai() });
    }
    const alasan = pilihan('Alasan koreksi', ALASAN_KOREKSI.map((a) => [a, a]), ALASAN_KOREKSI[0], { kecil: true });
    const status = pesanStatus();
    const simpanBtn = tombol('Simpan koreksi', 'button button--primary');
    const batal = tombol('Batal');
    const aksi = el('div', 'mus-actions');
    aksi.append(simpanBtn, batal);
    wadah.append(alasan.el, aksi, status.el);
    batal.addEventListener('click', () => onDone(false));
    simpanBtn.addEventListener('click', async () => {
      simpanBtn.disabled = true;
      try {
        await kirim('PATCH', `/api/students/${encodeURIComponent(studentId)}/${b.koleksi}/${encodeURIComponent(r.id)}`, headers, { reason: alasan.nilai(), value: ambil() });
        onDone(true);
      } catch (error) { status.galat(error.message); simpanBtn.disabled = false; }
    });
    return wadah;
  }

  async function muatSantri(studentId, headers) {
    const id = encodeURIComponent(studentId);
    const [dasbor, care, juz] = await Promise.all([
      mintaJson(`/api/students/${id}/dashboard`, headers),
      mintaJson(`/api/students/${id}/care?from=${mundur(89)}&to=${hariIni()}`, headers).catch(() => null),
      mintaJson(`/api/students/${id}/juz`, headers).catch(() => null)
    ]);
    return { dashboard: dasbor.dashboard, care: care && care.care, juz: juz && juz.tersedia ? juz : null };
  }

  // Halaman satu santri. student: baris dari ringkasan musyrif (id, name, program, hasPhoto, ...).
  async function santri(wadah, { student, headers, onBack, onOpenFull }) {
    wadah.classList.add('mus-page');
    const memuat = el('p', 'mus-loading', `Memuat laporan ${student.name}...`);
    memuat.setAttribute('role', 'status');
    wadah.replaceChildren(memuat);

    let data = await muatSantri(student.id, headers);
    let filter = null;
    const kembali = tombol('← Santri binaan', 'mus-back');
    kembali.addEventListener('click', onBack);

    // Kepala: foto, nama, angka singkat.
    const kepala = el('header', 'mus-profile');
    let foto = avatar(student, headers, 'mus-photo--profile');
    const ganti = el('label', 'mus-photo__change', student.hasPhoto ? 'Ganti foto' : 'Tambah foto');
    const berkas = el('input');
    berkas.type = 'file';
    berkas.accept = 'image/jpeg,image/png,image/webp';
    berkas.className = 'mus-visually-hidden';
    berkas.id = idBaru('foto');
    ganti.htmlFor = berkas.id;
    const fotoStatus = pesanStatus();
    berkas.addEventListener('change', async () => {
      const file = berkas.files && berkas.files[0];
      if (!file) return;
      fotoStatus.ok('Mengunggah foto...');
      try {
        await unggahFoto(student.id, file, headers);
        student.hasPhoto = true;
        const baru = avatar(student, headers, 'mus-photo--profile');
        foto.replaceWith(baru);
        foto = baru;
        ganti.textContent = 'Ganti foto';
        fotoStatus.ok('Foto tersimpan.');
      } catch (error) {
        fotoStatus.galat(error.message);
      } finally { berkas.value = ''; }
    });
    const kolomFoto = el('div', 'mus-profile__photo');
    kolomFoto.append(foto, ganti, berkas, fotoStatus.el);
    const id = el('div', 'mus-profile__id');
    const s = data.dashboard.student;
    id.append(
      el('h2', 'mus-profile__name', student.name),
      el('p', 'mus-note', [s.program, s.dormitory && s.dormitory.name, s.city].filter(Boolean).join(' · '))
    );
    const ringkas = el('div', 'mus-stats mus-stats--inline');
    const pr = data.care && data.care.prayers;
    const hd = data.dashboard.attendance;
    [
      [pr && pr.berjamaahRate !== null && pr.berjamaahRate !== undefined ? `${pr.berjamaahRate}%` : '–', 'sholat berjamaah', '90 hari'],
      [hd && hd.rate !== null ? `${hd.rate}%` : '–', 'hadir kegiatan', 'semua catatan'],
      [data.juz ? `${data.juz.hafal}` : '–', 'juz dihafal', data.juz && data.juz.sedang ? `${data.juz.sedang} sedang` : 'dari 30']
    ].forEach(([nilai, label, catatan]) => {
      const st = el('div', 'mus-stat');
      st.append(el('strong', 'mus-stat__value', nilai), el('span', 'mus-stat__label', label), el('span', 'mus-stat__note', catatan));
      ringkas.append(st);
    });
    const lihatWali = tombol('Lihat seperti wali →', 'mus-link');
    lihatWali.addEventListener('click', onOpenFull);
    id.append(ringkas, lihatWali);
    kepala.append(kolomFoto, id);

    // Formulir cepat.
    const bagianIsi = el('section', 'mus-section');
    const kepalaIsi = el('header', 'mus-section__head');
    kepalaIsi.append(el('h3', 'mus-title', 'Isi laporan'), el('p', 'mus-note', 'Pilih jenisnya, isi seperlunya, simpan. Tanggal otomatis hari ini.'));
    const tab = el('div', 'mus-tabs');
    tab.setAttribute('role', 'tablist');
    const panel = el('div', 'mus-tabpanel');
    const muatUlang = async () => {
      data = await muatSantri(student.id, headers);
      lukisLaporan();
    };
    const formSholatAktif = formSholat(student, headers, () => data, () => muatUlang().catch(() => {}));
    const jenisTab = [
      ['sholat', 'Sholat', () => formSholatAktif.el],
      ['setoran', 'Setoran', () => formUmum(student, headers, 'setoran', data, () => muatUlang().catch(() => {})).el],
      ['kehadiran', 'Kegiatan', () => formUmum(student, headers, 'kehadiran', data, () => muatUlang().catch(() => {})).el],
      ['catatan', 'Catatan', () => formUmum(student, headers, 'catatan', data, () => muatUlang().catch(() => {})).el],
      ['prestasi', 'Prestasi', () => formUmum(student, headers, 'prestasi', data, () => muatUlang().catch(() => {})).el],
      ['disiplin', 'Disiplin', () => formUmum(student, headers, 'disiplin', data, () => muatUlang().catch(() => {})).el],
      ['cerita', 'Cerita AI', () => kotakCerita({ headers, studentIds: [student.id], judul: 'Ceritakan tentang ananda', onSaved: () => muatUlang().catch(() => {}) })]
    ];
    const tombolTab = jenisTab.map(([kunci, label, buat], i) => {
      const b = tombol(label, `mus-tab ${i === 0 ? 'is-active' : ''}`.trim());
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === 0));
      b.addEventListener('click', () => bukaTab(kunci));
      tab.append(b);
      return { kunci, b, buat };
    });
    function bukaTab(kunci) {
      tombolTab.forEach((t) => {
        const aktif = t.kunci === kunci;
        t.b.classList.toggle('is-active', aktif);
        t.b.setAttribute('aria-selected', String(aktif));
        if (aktif) panel.replaceChildren(t.buat());
      });
    }
    bukaTab('sholat');
    bagianIsi.append(kepalaIsi, tab, panel);

    // Laporan.
    const bagianLaporan = el('section', 'mus-section');
    const kepalaLap = el('header', 'mus-section__head');
    kepalaLap.append(el('h3', 'mus-title', 'Laporan'), el('p', 'mus-note', 'Semua yang sudah tercatat, terbaru di atas. Catatan bisa dikoreksi; setoran hafalan tidak bisa diubah.'));
    const saring = el('div', 'mus-filter');
    const pager = K.penomoran({
      perHalaman: 10,
      tagDaftar: 'ul',
      kelasDaftar: 'mus-report',
      kosong: 'Belum ada laporan untuk santri ini.',
      render(halaman, daftar) {
        halaman.forEach((b) => {
          const li = el('li', `mus-report__item is-${b.jenis}`);
          const meta = el('div', 'mus-report__meta');
          meta.append(el('span', 'mus-report__kind', JENIS_LABEL[b.jenis]), el('span', 'mus-report__date', tanggalPendek(b.waktu)));
          const isi = el('div', 'mus-report__body');
          isi.append(el('p', 'mus-report__title', b.judul));
          if (b.isi) isi.append(el('p', 'mus-report__text', b.isi));
          li.append(meta, isi);
          if (b.koleksi || b.jenis === 'sholat') {
            const ubah = tombol('Ubah', 'mus-link');
            ubah.addEventListener('click', () => {
              if (b.jenis === 'sholat') {
                bukaTab('sholat');
                formSholatAktif.setelTanggal(b.tanggal);
                bagianIsi.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
              }
              const form = formKoreksi(b, headers, student.id, (berubah) => {
                form.remove();
                ubah.hidden = false;
                if (berubah) muatUlang().catch(() => {});
              });
              ubah.hidden = true;
              li.append(form);
            });
            li.append(ubah);
          }
          daftar.append(li);
        });
      }
    });
    bagianLaporan.append(kepalaLap, saring, pager.wadah);

    function lukisLaporan() {
      const semua = butirLaporan(data);
      const jenisAda = Object.keys(JENIS_LABEL).filter((j) => semua.some((b) => b.jenis === j));
      saring.replaceChildren();
      [['Semua', null], ...jenisAda.map((j) => [JENIS_LABEL[j], j])].forEach(([label, j]) => {
        const jumlah = j ? semua.filter((b) => b.jenis === j).length : semua.length;
        const b = tombol(`${label} (${jumlah})`, `mus-filter__btn ${filter === j ? 'is-active' : ''}`.trim());
        b.addEventListener('click', () => { filter = j; lukisLaporan(); });
        saring.append(b);
      });
      pager.setel(filter ? semua.filter((b) => b.jenis === filter) : semua);
    }
    lukisLaporan();

    wadah.replaceChildren(kembali, kepala, bagianIsi, bagianLaporan);
  }

  // fotoUrl dan unggahFoto juga dipakai detail santri di portal.js, supaya cache foto dan
// cara mengecilkan foto sama di kedua tempat.
window.HamasahBerandaMusyrif = Object.freeze({ render, santri, fotoUrl, unggahFoto });
})();
