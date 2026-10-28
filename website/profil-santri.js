// Profil santri terintegrasi: satu tempat untuk seluruh informasi santri, bukan hanya biodata.
// Sepuluh tab: Data pribadi, Pendidikan, Tahfidz, Rapor, Pembinaan, Asrama dan kamar, Absensi dan
// izin, Dokumen, Tagihan, Riwayat. Biodata, pendidikan, status paspor, dokumen, dan penempatan dari
// /api/students/:id/profil (server/student-profile-service.js); selebihnya memakai data dashboard
// yang sudah dimuat portal dan endpoint yang sudah ada (izin, tagihan, riwayat pembinaan).
// Hak akses ditentukan server; tab yang tidak boleh dibuka peran ini tidak ditampilkan.
// Semua teks dipasang lewat textContent.
(function initProfilSantri() {
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const TANGGAL_PENDEK = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const RUPIAH = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const NILAI_HAFALAN = { lancar: 'Lancar', 'kurang-lancar': 'Kurang lancar', ulang: 'Perlu diulang' };
  const JENIS_HAFALAN = { ziyadah: 'Hafalan baru (ziyadah)', murajaah: 'Murajaah' };
  const STATUS_IZIN = { menunggu: 'Menunggu keputusan', disetujui: 'Disetujui', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };
  const STATUS_TAGIHAN = { unpaid: 'Belum dibayar', paid: 'Lunas', voided: 'Dibatalkan' };
  const STATUS_PESERTA = { aktif: 'Sedang mengikuti', lulus: 'Lulus', keluar: 'Keluar', pindah: 'Pindah' };
  const LABEL_KASUS = { 'lapor-diri': 'Lapor diri', 'lapor-pendidikan': 'Lapor pendidikan', 'status-pendidikan': 'Status pendidikan' };
  const GENDER = { putra: 'Putra', putri: 'Putri' };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tanggal(nilai) {
    if (!nilai) return '';
    const bagian = String(nilai).slice(0, 10);
    return TANGGAL.format(new Date(`${bagian}T00:00:00Z`));
  }

  function waktu(nilai) {
    try { return TANGGAL_PENDEK.format(new Date(nilai)); } catch { return String(nilai || ''); }
  }

  function ukuran(byte) {
    if (!byte) return '';
    return byte >= 1048576 ? `${(byte / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(byte / 1024))} KB`;
  }

  function kosong(teks) {
    return el('p', 'ps-empty', teks);
  }

  // Daftar "label: nilai". Nilai kosong ditulis "Belum diisi" supaya jelas mana yang perlu dilengkapi.
  function daftarField(pasangan) {
    const dl = el('dl', 'ps-fields');
    pasangan.forEach(([label, nilai, catatan]) => {
      const baris = el('div', 'ps-field');
      baris.append(el('dt', '', label));
      const dd = el('dd', nilai ? '' : 'is-empty', nilai || 'Belum diisi');
      if (catatan) dd.append(el('small', '', ` ${catatan}`));
      baris.append(dd);
      dl.append(baris);
    });
    return dl;
  }

  function seksi(judul, ...isi) {
    const wadah = el('section', 'ps-section');
    const kepala = el('div', 'ps-section__head');
    kepala.append(el('h4', '', judul));
    wadah.append(kepala, ...isi.filter(Boolean));
    return { wadah, kepala };
  }

  function tombol(teks, kelas, aksi) {
    const b = el('button', kelas || 'button button--secondary ps-small', teks);
    b.type = 'button';
    if (aksi) b.addEventListener('click', aksi);
    return b;
  }

  function chip(teks, nada) {
    return el('span', `ps-chip ps-chip--${nada || 'netral'}`, teks);
  }

  function nadaDokumen(state) {
    return { aktif: 'ok', 'hampir-kedaluwarsa': 'waspada', kedaluwarsa: 'bahaya', hilang: 'bahaya', rusak: 'bahaya', diurus: 'info' }[state] || 'netral';
  }

  async function ambilJson(url, headers) {
    const response = await fetch(url, { headers });
    const hasil = await response.json().catch(() => ({}));
    if (!response.ok) {
      const galat = new Error(hasil.error || 'Data belum dapat dimuat.');
      galat.status = response.status;
      throw galat;
    }
    return hasil;
  }

  async function kirimJson(method, url, headers, body) {
    const response = await fetch(url, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const hasil = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(hasil.error || 'Belum berhasil disimpan.');
    return hasil;
  }

  // ------------------------------------------------------------------ render utama

  // ctx: { student, dashboard, care, account, headers, unduh(url, namaBerkas, tombol) }.
  async function render(wadah, ctx) {
    const { student, account, headers } = ctx;
    const id = encodeURIComponent(student.id);
    let profil = null;
    let galatProfil = '';
    try {
      profil = await ambilJson(`/api/students/${id}/profil`, headers);
    } catch (error) {
      galatProfil = error.message;
    }
    wadah.replaceChildren();
    wadah.classList.add('ps');
    const judul = el('div', 'ps-head');
    judul.append(el('h3', '', 'Profil santri'), el('p', '', 'Seluruh informasi santri di satu tempat.'));
    wadah.append(judul);
    if (!profil) {
      wadah.append(kosong(galatProfil || 'Profil belum dapat dimuat.'));
      return;
    }
    const pesanDb = profil.available ? null : el('p', 'ps-warning', 'Sebagian profil menunggu pembaruan database (migrasi 061). Data dasar tetap tampil; admin dapat menerapkannya di halaman Pengaturan.');
    if (pesanDb) wadah.append(pesanDb);

    const staf = ['admin', 'supervisor'].includes(account.role);
    const keuangan = account.role !== 'supervisor';
    const state = { profil };
    const muatUlang = async (pesan) => {
      state.profil = await ambilJson(`/api/students/${id}/profil`, headers);
      state.pesan = pesan || '';
      gambarTab();
    };
    const ctxTab = { ...ctx, id, staf, state, muatUlang };

    const TAB = [
      ['pribadi', 'Data pribadi', tabPribadi],
      ['pendidikan', 'Pendidikan', tabPendidikan],
      ['tahfidz', 'Tahfidz', tabTahfidz],
      ['rapor', 'Rapor', tabRapor],
      ['pembinaan', 'Pembinaan', tabPembinaan],
      ['asrama', 'Asrama dan kamar', tabAsrama],
      ['absensi', 'Absensi dan izin', tabAbsensi],
      ['dokumen', 'Dokumen', tabDokumen],
      ...(keuangan ? [['tagihan', 'Tagihan', tabTagihan]] : []),
      ['riwayat', 'Riwayat', tabRiwayat]
    ];
    let aktif = 'pribadi';
    const bar = el('div', 'ps-tabs');
    bar.setAttribute('role', 'tablist');
    const isi = el('div', 'ps-body');
    isi.setAttribute('role', 'tabpanel');
    wadah.append(bar, isi);

    async function gambarTab() {
      bar.replaceChildren();
      TAB.forEach(([kunci, label]) => {
        const b = tombol(label, `ps-tab${kunci === aktif ? ' is-on' : ''}`, () => { aktif = kunci; state.pesan = ''; gambarTab(); });
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(kunci === aktif));
        bar.append(b);
      });
      isi.replaceChildren(kosong('Memuat...'));
      const fn = TAB.find(([kunci]) => kunci === aktif)[2];
      try {
        const node = await fn(ctxTab);
        isi.replaceChildren();
        if (state.pesan) {
          const p = el('p', 'ps-flash', state.pesan);
          p.setAttribute('role', 'status');
          isi.append(p);
        }
        isi.append(node);
      } catch (error) {
        isi.replaceChildren(kosong(error.message));
      }
    }
    await gambarTab();
  }

  // ------------------------------------------------------------------ dialog

  async function dialogKontak(ctx) {
    const { profil } = ctx.state;
    const p = profil.personal;
    const hasil = await window.HamasahDialog.formulir({
      judul: 'Ubah kontak santri',
      bidang: [
        { nama: 'phone', label: 'Nomor telepon', jenis: 'text', nilai: p.phone },
        { nama: 'email', label: 'Email', jenis: 'email', nilai: p.email },
        { nama: 'homeAddress', label: 'Alamat asal', jenis: 'textarea', nilai: p.homeAddress },
        { nama: 'emergencyName', label: 'Kontak darurat (nama)', jenis: 'text', nilai: p.emergencyName },
        { nama: 'emergencyPhone', label: 'Kontak darurat (telepon)', jenis: 'text', nilai: p.emergencyPhone }
      ],
      labelSimpan: 'Simpan',
      kirim: (nilai) => kirimJson('PATCH', `/api/students/${ctx.id}/profil`, ctx.headers, nilai)
    });
    if (hasil) await ctx.muatUlang('Kontak diperbarui.');
  }

  async function dialogIdentitas(ctx) {
    const { profil } = ctx.state;
    const hasil = await window.HamasahDialog.formulir({
      judul: 'Ubah identitas santri',
      keterangan: 'Nomor paspor dan iqamah hanya terlihat penuh oleh admin.',
      bidang: [
        { nama: 'birthPlace', label: 'Tempat lahir', jenis: 'text', nilai: profil.personal.birthPlace },
        { nama: 'nationality', label: 'Kewarganegaraan', jenis: 'text', nilai: profil.personal.nationality },
        { nama: 'passportNumber', label: 'Nomor paspor', jenis: 'text', nilai: profil.identifiers.passportNumber },
        { nama: 'iqamahNumber', label: 'Nomor iqamah', jenis: 'text', nilai: profil.identifiers.iqamahNumber }
      ],
      labelSimpan: 'Simpan',
      kirim: (nilai) => kirimJson('PATCH', `/api/students/${ctx.id}/profil`, ctx.headers, nilai)
    });
    if (hasil) await ctx.muatUlang('Identitas diperbarui.');
  }

  async function dialogPendidikan(ctx) {
    const { profil } = ctx.state;
    const e = profil.education;
    const hasil = await window.HamasahDialog.formulir({
      judul: 'Ubah data pendidikan',
      bidang: [
        { nama: 'educationLevel', label: 'Jenjang', jenis: 'text', nilai: e.level, petunjuk: 'Contoh: Ma\'had, S1, S2.' },
        { nama: 'institution', label: 'Lembaga', jenis: 'text', nilai: e.institution },
        { nama: 'major', label: 'Jurusan atau fakultas', jenis: 'text', nilai: e.major },
        { nama: 'studyYear', label: 'Tahun studi ke-', jenis: 'number', min: 1, nilai: e.studyYear === null ? '' : e.studyYear },
        { nama: 'educationStatus', label: 'Status pendidikan', jenis: 'select', pilihan: [['', 'Belum diisi'], ...profil.options.educationStatuses.map((s) => [s.id, s.label])], nilai: e.status },
        { nama: 'educationNote', label: 'Catatan administrasi', jenis: 'textarea', nilai: e.note }
      ],
      labelSimpan: 'Simpan',
      kirim: (nilai) => kirimJson('PATCH', `/api/students/${ctx.id}/profil`, ctx.headers, { ...nilai, studyYear: nilai.studyYear === '' ? null : Number(nilai.studyYear) })
    });
    if (hasil) await ctx.muatUlang('Data pendidikan diperbarui.');
  }

  async function dialogPaspor(ctx) {
    const { profil } = ctx.state;
    const hasil = await window.HamasahDialog.formulir({
      judul: 'Status paspor',
      keterangan: 'Aktif, hampir kedaluwarsa, dan kedaluwarsa dihitung otomatis dari tanggal habis. Isi di sini hanya bila paspor hilang, rusak, atau sedang diurus.',
      bidang: [{ nama: 'passportState', label: 'Keadaan khusus', jenis: 'select', pilihan: [['', 'Tidak ada (ikuti tanggal)'], ...profil.options.passportStates.map((s) => [s.id, s.label])], nilai: profil.passport.manual }],
      labelSimpan: 'Simpan',
      kirim: (nilai) => kirimJson('PATCH', `/api/students/${ctx.id}/profil`, ctx.headers, nilai)
    });
    if (hasil) await ctx.muatUlang('Status paspor diperbarui.');
  }

  async function dialogStatus(ctx) {
    const { profil } = ctx.state;
    const hasil = await window.HamasahDialog.formulir({
      judul: 'Ubah status santri',
      keterangan: 'Selain "Aktif", santri dilepas dari asramanya dan kamarnya. Perubahan dicatat di riwayat.',
      bidang: [
        { nama: 'status', label: 'Status', jenis: 'select', pilihan: profil.options.statuses.map((s) => [s.id, s.label]), nilai: profil.status.value, wajib: true },
        { nama: 'statusReason', label: 'Alasan', jenis: 'textarea', nilai: '', wajib: true, petunjuk: 'Contoh: cuti satu semester, mengundurkan diri atas permintaan wali.' }
      ],
      labelSimpan: 'Ubah status',
      kirim: (nilai) => kirimJson('PATCH', `/api/students/${ctx.id}`, ctx.headers, nilai)
    });
    if (hasil) {
      await ctx.muatUlang('Status santri diperbarui.');
      if (typeof ctx.onStatusDiubah === 'function') ctx.onStatusDiubah();
    }
  }

  // ------------------------------------------------------------------ tab

  function tabPribadi(ctx) {
    const { profil } = ctx.state;
    const p = profil.personal;
    const wadah = el('div', 'ps-stack');
    const data = seksi('Data pribadi', daftarField([
      ['Nama', profil.name],
      ['Jenis', p.gender ? GENDER[p.gender] || p.gender : ''],
      ['Tempat dan tanggal lahir', [p.birthPlace, p.birthDate ? tanggal(p.birthDate) : ''].filter(Boolean).join(', ')],
      ['Kewarganegaraan', p.nationality],
      ['Kota asal', p.city],
      ['Bergabung', p.joinDate ? tanggal(p.joinDate) : '']
    ]));
    if (profil.can.editIdentity) data.kepala.append(tombol('Ubah identitas', null, () => dialogIdentitas(ctx).catch((e) => window.alert(e.message))));
    const kontak = seksi('Kontak', daftarField([
      ['Telepon', p.phone], ['Email', p.email], ['Alamat asal', p.homeAddress],
      ['Kontak darurat', [p.emergencyName, p.emergencyPhone].filter(Boolean).join(', ')]
    ]));
    if (profil.can.editContact) kontak.kepala.append(tombol('Ubah kontak', null, () => dialogKontak(ctx).catch((e) => window.alert(e.message))));
    const identitas = seksi('Nomor identitas', daftarField([
      ['Nomor paspor', profil.identifiers.passportNumber, profil.identifiers.masked && profil.identifiers.passportNumber ? '(tersamar, penuh hanya untuk admin)' : ''],
      ['Nomor iqamah', profil.identifiers.iqamahNumber, profil.identifiers.masked && profil.identifiers.iqamahNumber ? '(tersamar, penuh hanya untuk admin)' : '']
    ]));
    const status = seksi('Status santri');
    const baris = el('div', 'ps-statusrow');
    baris.append(chip(profil.status.label, profil.status.value === 'active' ? 'ok' : 'waspada'));
    if (profil.can.changeStatus) baris.append(tombol('Ubah status', null, () => dialogStatus(ctx).catch((e) => window.alert(e.message))));
    status.wadah.append(baris);
    if (profil.status.history.length) {
      const ul = el('ul', 'ps-list');
      profil.status.history.forEach((h) => {
        const li = el('li');
        li.append(el('strong', '', `${h.from} → ${h.to}`), el('p', 'ps-meta', [waktu(h.changedAt), h.changedBy ? `oleh ${h.changedBy}` : '', h.reason].filter(Boolean).join(' · ')));
        ul.append(li);
      });
      status.wadah.append(ul);
    }
    wadah.append(data.wadah, kontak.wadah, identitas.wadah, status.wadah);
    return wadah;
  }

  function tabPendidikan(ctx) {
    const { profil } = ctx.state;
    const e = profil.education;
    const wadah = el('div', 'ps-stack');
    const pendidikan = seksi('Pendidikan', daftarField([
      ['Program', e.program], ['Jenjang', e.level], ['Lembaga', e.institution], ['Jurusan atau fakultas', e.major],
      ['Tahun studi', e.studyYear ? `Tahun ke-${e.studyYear}` : ''], ['Status pendidikan', e.statusLabel], ['Catatan administrasi', e.note]
    ]));
    if (profil.can.editEducation) pendidikan.kepala.append(tombol('Ubah pendidikan', null, () => dialogPendidikan(ctx).catch((x) => window.alert(x.message))));
    const dok = seksi('Paspor dan iqamah');
    const baris = el('div', 'ps-docstate');
    const kartu = (judul, d, ubah) => {
      const k = el('div', 'ps-docstate__item');
      k.append(el('strong', '', judul), chip(d.label, nadaDokumen(d.state)));
      k.append(el('p', 'ps-meta', d.expiresOn ? `Berlaku sampai ${tanggal(d.expiresOn)}${d.daysLeft !== null ? (d.daysLeft < 0 ? ` (lewat ${-d.daysLeft} hari)` : ` (${d.daysLeft} hari lagi)`) : ''}` : 'Tanggal berlaku belum dicatat.'));
      if (ubah) k.append(ubah);
      return k;
    };
    baris.append(
      kartu('Paspor', profil.passport, profil.can.editPassportState ? tombol('Ubah keadaan paspor', null, () => dialogPaspor(ctx).catch((x) => window.alert(x.message))) : null),
      kartu('Iqamah', profil.iqamah, null)
    );
    dok.wadah.append(baris);
    wadah.append(pendidikan.wadah, dok.wadah);
    if (profil.administrativeCases.length) {
      const kasus = seksi('Urusan administrasi yang berjalan');
      const ul = el('ul', 'ps-list');
      profil.administrativeCases.forEach((k) => {
        const li = el('li');
        li.append(el('strong', '', LABEL_KASUS[k.kind] || k.kind), el('p', 'ps-meta', [k.dueOn ? `Batas ${tanggal(k.dueOn)}` : '', k.note].filter(Boolean).join(' · ')));
        ul.append(li);
      });
      kasus.wadah.append(ul);
      wadah.append(kasus.wadah);
    }
    return wadah;
  }

  function tabTahfidz(ctx) {
    const hafalan = ctx.care && ctx.care.memorization ? ctx.care.memorization : [];
    const wadah = el('div', 'ps-stack');
    const s = seksi('Setoran hafalan terbaru');
    if (!hafalan.length) {
      s.wadah.append(kosong('Belum ada setoran hafalan yang dicatat.'));
    } else {
      const ul = el('ul', 'ps-list');
      hafalan.slice(0, 10).forEach((h) => {
        const li = el('li');
        li.append(el('strong', '', `${JENIS_HAFALAN[h.kind] || h.kind}: ${h.portion}`), el('p', 'ps-meta', [tanggal(h.occurredOn), NILAI_HAFALAN[h.grade] || h.grade, h.note].filter(Boolean).join(' · ')));
        ul.append(li);
      });
      s.wadah.append(ul);
    }
    wadah.append(s.wadah);
    return wadah;
  }

  function tabRapor(ctx) {
    const d = ctx.dashboard;
    const wadah = el('div', 'ps-stack');
    const ringkas = seksi('Rapor');
    ringkas.wadah.append(daftarField([
      ['Kehadiran kegiatan', d.attendance.rate === null ? '' : `${d.attendance.rate}% hadir (${d.attendance.present || 0} dari ${d.attendance.total || 0})`],
      ['Catatan pembina terakhir', d.evaluations.length ? d.evaluations[0].note : ''],
      ['Prestasi tercatat', d.achievements.length ? `${d.achievements.length} prestasi` : '']
    ]));
    const unduh = tombol('Unduh rapor (PDF)', 'button button--primary ps-small', () => ctx.unduh(`/api/students/${ctx.id}/report`, `rapor-${ctx.student.name.replace(/[^\w]+/g, '-').toLowerCase()}.pdf`, unduh));
    ringkas.kepala.append(unduh);
    wadah.append(ringkas.wadah);
    return wadah;
  }

  function tabPembinaan(ctx) {
    const d = ctx.dashboard;
    const wadah = el('div', 'ps-stack');
    const bagian = (judul, daftar, isi) => {
      const s = seksi(judul);
      if (!daftar.length) s.wadah.append(kosong('Belum ada catatan.'));
      else {
        const ul = el('ul', 'ps-list');
        daftar.slice(0, 8).forEach((item) => { const li = el('li'); isi(li, item); ul.append(li); });
        s.wadah.append(ul);
      }
      return s.wadah;
    };
    wadah.append(
      bagian('Catatan pembina', d.evaluations, (li, e) => { li.append(el('strong', '', e.area || 'Evaluasi'), el('p', 'ps-meta', [waktu(e.occurredAt), e.note].filter(Boolean).join(' · '))); }),
      bagian('Prestasi', d.achievements, (li, a) => { li.append(el('strong', '', a.title), el('p', 'ps-meta', [waktu(a.occurredAt), a.description].filter(Boolean).join(' · '))); }),
      bagian('Pelanggaran dan pembinaan disiplin', d.discipline, (li, v) => { li.append(el('strong', '', v.level || 'Catatan'), el('p', 'ps-meta', [waktu(v.occurredAt), v.note].filter(Boolean).join(' · '))); })
    );
    return wadah;
  }

  function tabAsrama(ctx) {
    const { placement } = ctx.state.profil;
    const wadah = el('div', 'ps-stack');
    const s = seksi('Asrama dan kamar', daftarField([
      ['Asrama', placement.dormitory ? placement.dormitory.name : ''],
      ['Kamar', placement.room ? `${placement.room.name} (${placement.room.hasAc ? 'AC' : 'non-AC'}, kapasitas ${placement.room.capacity})` : (placement.dormitory ? '' : '')],
      ['Musyrif asrama', placement.supervisors.join(', ')],
      ['Penanggung jawab kamar', placement.room ? placement.room.supervisorName || '' : '']
    ]));
    if (!placement.dormitory) s.wadah.append(kosong('Santri ini belum ditempatkan di asrama.'));
    wadah.append(s.wadah);
    const riwayat = seksi('Riwayat perpindahan');
    if (!placement.history.length) riwayat.wadah.append(kosong('Belum ada perpindahan yang tercatat.'));
    else {
      const ul = el('ul', 'ps-list');
      placement.history.forEach((h) => {
        const li = el('li');
        li.append(el('strong', '', `${h.from} → ${h.to}`), el('p', 'ps-meta', [waktu(h.movedAt), h.reason].filter(Boolean).join(' · ')));
        ul.append(li);
      });
      riwayat.wadah.append(ul);
    }
    wadah.append(riwayat.wadah);
    if (ctx.staf) {
      const tautan = el('a', 'ps-link', 'Kelola kamar dan penempatan di Kelola Asrama');
      tautan.href = placement.dormitory ? `asrama?asrama=${encodeURIComponent(placement.dormitory.id)}` : 'asrama';
      wadah.append(tautan);
    }
    return wadah;
  }

  async function tabAbsensi(ctx) {
    const d = ctx.dashboard;
    const wadah = el('div', 'ps-stack');
    const absen = seksi('Absensi kegiatan');
    absen.wadah.append(daftarField([
      ['Kehadiran', d.attendance.rate === null ? '' : `${d.attendance.rate}% hadir (${d.attendance.present || 0} dari ${d.attendance.total || 0})`],
      ['Tidak hadir tanpa keterangan', d.attendance.byStatus && d.attendance.byStatus.absent ? `${d.attendance.byStatus.absent} kali` : 'Tidak ada'],
      ['Izin', d.attendance.byStatus && d.attendance.byStatus.excused ? `${d.attendance.byStatus.excused} kali` : 'Tidak ada']
    ]));
    const recent = d.attendance.entries.slice(0, 8);
    if (recent.length) {
      const ul = el('ul', 'ps-list');
      recent.forEach((a) => {
        const li = el('li');
        li.append(el('strong', '', a.category), el('p', 'ps-meta', [waktu(a.occurredAt), { present: 'Hadir', late: 'Terlambat', excused: 'Izin', absent: 'Tidak hadir' }[a.status] || a.status, a.note].filter(Boolean).join(' · ')));
        ul.append(li);
      });
      absen.wadah.append(ul);
    }
    wadah.append(absen.wadah);
    const izin = seksi('Riwayat izin dan kepulangan');
    try {
      const data = await ambilJson(`/api/students/${ctx.id}/leave`, ctx.headers);
      if (!data.items.length) izin.wadah.append(kosong('Belum ada izin yang diajukan.'));
      else {
        const ul = el('ul', 'ps-list');
        data.items.forEach((i) => {
          const li = el('li');
          li.append(el('strong', '', `${i.kindLabel}, ${STATUS_IZIN[i.status] || i.status}`),
            el('p', 'ps-meta', [`${waktu(i.startsAt)} sampai ${waktu(i.endsAt)}`, i.returnedAt ? `Kembali ${waktu(i.returnedAt)}` : '', i.reason].filter(Boolean).join(' · ')));
          ul.append(li);
        });
        izin.wadah.append(ul);
      }
    } catch (error) {
      izin.wadah.append(kosong(error.message));
    }
    wadah.append(izin.wadah);
    return wadah;
  }

  // Unggah dokumen: minta tempat, kirim isi, lalu daftarkan dengan jenis dan visibilitas.
  async function unggahDokumen(ctx, berkas, isian) {
    const minta = await kirimJson('POST', '/api/uploads', ctx.headers, { purpose: 'student-document', entityId: ctx.student.id, fileName: berkas.name, contentType: berkas.type, size: berkas.size });
    const fileId = encodeURIComponent(minta.upload.id);
    if (minta.directUpload) {
      const tautan = await kirimJson('POST', `/api/uploads/${fileId}/direct`, ctx.headers);
      const terkirim = await fetch(tautan.uploadUrl, { method: 'PUT', headers: { 'Content-Type': berkas.type }, body: berkas });
      if (!terkirim.ok) throw new Error('Berkas gagal dikirim ke penyimpanan.');
      await kirimJson('POST', `/api/uploads/${fileId}/confirm`, ctx.headers);
    } else {
      const response = await fetch(`/api/uploads/${fileId}/content`, { method: 'PUT', headers: { ...ctx.headers, 'Content-Type': berkas.type }, body: berkas });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.error || 'Berkas gagal diunggah.');
    }
    await kirimJson('POST', `/api/students/${ctx.id}/dokumen`, ctx.headers, { fileId: minta.upload.id, ...isian });
  }

  function tabDokumen(ctx) {
    const { profil } = ctx.state;
    const wadah = el('div', 'ps-stack');
    const s = seksi('Dokumen pribadi', el('p', 'ps-meta', 'Disimpan privat. Setiap dokumen hanya dibuka untuk pihak yang berhak sesuai pengaturannya.'));
    if (!profil.documents.length) s.wadah.append(kosong('Belum ada dokumen yang bisa Anda lihat.'));
    else {
      const ul = el('ul', 'ps-docs');
      profil.documents.forEach((d) => {
        const li = el('li');
        const info = el('div', 'ps-docs__info');
        info.append(el('strong', '', d.title), el('p', 'ps-meta', [d.kindLabel, d.fileName, ukuran(d.sizeBytes), `Dibuka oleh: ${d.visibilityLabel}`, waktu(d.createdAt)].filter(Boolean).join(' · ')));
        const aksi = el('div', 'ps-docs__actions');
        const unduh = tombol('Unduh', 'button button--secondary ps-small', () => ctx.unduh(`/api/files/${encodeURIComponent(d.fileId)}`, d.fileName || `${d.title}.pdf`, unduh));
        aksi.append(unduh);
        if (profil.can.archiveDocuments) {
          aksi.append(tombol('Arsipkan', 'button button--secondary ps-small', async () => {
            if (!window.confirm(`Arsipkan dokumen "${d.title}"? Dokumen tidak lagi terlihat dan tidak bisa diunduh.`)) return;
            try {
              await kirimJson('DELETE', `/api/students/${ctx.id}/dokumen/${encodeURIComponent(d.id)}`, ctx.headers);
              await ctx.muatUlang('Dokumen diarsipkan.');
            } catch (error) {
              window.alert(error.message);
            }
          }));
        }
        li.append(info, aksi);
        ul.append(li);
      });
      s.wadah.append(ul);
    }
    wadah.append(s.wadah);
    if (profil.can.uploadDocuments) {
      const tambah = seksi('Tambah dokumen');
      const form = el('form', 'ps-form');
      const baris = (label, input) => { const l = el('label', 'ps-form__field'); l.append(el('span', '', label), input); form.append(l); return input; };
      const berkas = baris('Berkas (PDF, JPG, atau PNG, maksimal 5 MB)', el('input'));
      berkas.type = 'file';
      berkas.accept = 'application/pdf,image/jpeg,image/png';
      berkas.required = true;
      const jenis = baris('Jenis', el('select'));
      profil.options.documentKinds.forEach((k) => jenis.add(new Option(k.label, k.id)));
      const judul = baris('Judul', el('input'));
      judul.maxLength = 120;
      judul.required = true;
      const visibilitas = baris('Siapa yang boleh membuka', el('select'));
      profil.options.visibilities.forEach((v) => visibilitas.add(new Option(v.label, v.id)));
      visibilitas.value = 'staf';
      const st = el('p', 'ps-flash');
      st.setAttribute('role', 'status');
      const kirim = el('button', 'button button--primary ps-small', 'Unggah dokumen');
      kirim.type = 'submit';
      form.append(st, kirim);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const file = berkas.files[0];
        if (!file) return;
        kirim.disabled = true;
        st.textContent = 'Mengunggah...';
        try {
          await unggahDokumen(ctx, file, { kind: jenis.value, title: judul.value, visibility: visibilitas.value });
          await ctx.muatUlang('Dokumen ditambahkan.');
        } catch (error) {
          st.textContent = error.message;
        } finally {
          kirim.disabled = false;
        }
      });
      tambah.wadah.append(form);
      wadah.append(tambah.wadah);
    }
    return wadah;
  }

  async function tabTagihan(ctx) {
    const wadah = el('div', 'ps-stack');
    const s = seksi('Tagihan');
    try {
      const data = await ambilJson(`/api/students/${ctx.id}/invoices`, ctx.headers);
      const daftar = Array.isArray(data) ? data : (data.items || data.invoices || []);
      if (!daftar.length) s.wadah.append(kosong('Belum ada tagihan.'));
      else {
        const belum = daftar.filter((t) => t.status === 'unpaid');
        s.wadah.append(daftarField([
          ['Belum dibayar', belum.length ? `${belum.length} tagihan, ${RUPIAH.format(belum.reduce((jumlah, t) => jumlah + Number(t.amount || 0), 0))}` : 'Tidak ada'],
          ['Total tagihan', `${daftar.length} tagihan`]
        ]));
        const ul = el('ul', 'ps-list');
        daftar.slice(0, 12).forEach((t) => {
          const li = el('li');
          li.append(el('strong', '', `${t.description}, ${RUPIAH.format(Number(t.amount || 0))}`), el('p', 'ps-meta', [STATUS_TAGIHAN[t.status] || t.status, t.number, t.issuedAt ? waktu(t.issuedAt) : ''].filter(Boolean).join(' · ')));
          ul.append(li);
        });
        s.wadah.append(ul);
      }
    } catch (error) {
      s.wadah.append(kosong(error.status === 403 ? 'Tagihan tidak dibuka untuk peran Anda.' : error.message));
    }
    wadah.append(s.wadah);
    return wadah;
  }

  async function tabRiwayat(ctx) {
    const { profil } = ctx.state;
    const wadah = el('div', 'ps-stack');
    const s = seksi('Riwayat pembinaan lintas lokasi');
    try {
      const data = await ambilJson(`/api/students/${ctx.id}/riwayat-pembinaan`, ctx.headers);
      if (!data.available || !data.items.length) s.wadah.append(kosong('Belum ada riwayat program atau penempatan.'));
      else {
        const ul = el('ul', 'ps-list');
        data.items.forEach((item) => {
          const li = el('li');
          const atas = el('div', 'ps-statusrow');
          atas.append(el('strong', '', item.title));
          if (item.type === 'program') atas.append(chip(STATUS_PESERTA[item.status] || item.status, item.status === 'aktif' ? 'info' : 'netral'));
          li.append(atas, el('p', 'ps-meta', [tanggal(item.date), item.type === 'program' ? `${item.kindLabel}, ${item.location} (${item.country})` : 'Penempatan asrama', item.reason, item.note].filter(Boolean).join(' · ')));
          ul.append(li);
        });
        s.wadah.append(ul);
      }
    } catch (error) {
      s.wadah.append(kosong(error.message));
    }
    wadah.append(s.wadah);
    if (profil.status.history.length) {
      const st = seksi('Riwayat status santri');
      const ul = el('ul', 'ps-list');
      profil.status.history.forEach((h) => {
        const li = el('li');
        li.append(el('strong', '', `${h.from} → ${h.to}`), el('p', 'ps-meta', [waktu(h.changedAt), h.changedBy ? `oleh ${h.changedBy}` : '', h.reason].filter(Boolean).join(' · ')));
        ul.append(li);
      });
      st.wadah.append(ul);
      wadah.append(st.wadah);
    }
    return wadah;
  }

  window.HamasahProfilSantri = Object.freeze({ render });
}());
