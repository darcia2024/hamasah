// Monitoring pusat di dashboard admin: angka hari ini, absensi hari ini, dan daftar urusan
// administrasi santri beserta status tindak lanjutnya. Data dari /api/admin/monitoring-pusat
// (server/central-monitoring-service.js).
//
// Semua isi dibangun lewat textContent; tidak ada data dari server yang masuk innerHTML.
(function initMonitoringPusat() {
  const WAKTU = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const LABEL_STATUS = Object.freeze({ baru: 'Baru', diproses: 'Sedang diproses', selesai: 'Selesai' });
  const LABEL_SHOLAT = Object.freeze({ subuh: 'Subuh', dzuhur: 'Dzuhur', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya' });
  const JENIS_MANUAL = Object.freeze([
    ['lapor-diri', 'Lapor diri'],
    ['lapor-pendidikan', 'Lapor pendidikan'],
    ['status-pendidikan', 'Status pendidikan']
  ]);
  const TAB_STATUS = Object.freeze([['aktif', 'Belum selesai'], ['baru', 'Baru'], ['diproses', 'Sedang diproses'], ['selesai', 'Selesai'], ['semua', 'Semua']]);
  const BARIS_AWAL = 10;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tombol(teks, kelas, aksi) {
    const node = el('button', kelas, teks);
    node.type = 'button';
    node.addEventListener('click', aksi);
    return node;
  }

  // Tabel kecil untuk rincian absensi. Kolom pertama menjadi judul baris.
  function tabelKecil(kepala, baris) {
    const bungkus = el('div', 'mp-table-wrap');
    const tabel = el('table', 'mp-table');
    const thead = el('thead');
    const hr = el('tr');
    kepala.forEach((k, i) => { const th = el('th', i ? 'num' : '', k); th.scope = 'col'; hr.append(th); });
    thead.append(hr);
    const tbody = el('tbody');
    baris.forEach((cells) => {
      const tr = el('tr');
      cells.forEach((teks, i) => {
        const sel = el(i === 0 ? 'th' : 'td', i ? 'num' : '', teks);
        if (i === 0) sel.scope = 'row';
        tr.append(sel);
      });
      tbody.append(tr);
    });
    tabel.append(thead, tbody);
    bungkus.append(tabel);
    return bungkus;
  }

  function render({ headers, onOpenStudent }) {
    const akar = el('section', 'mp');
    akar.id = 'admin-perhatian';
    akar.tabIndex = -1;
    akar.setAttribute('aria-label', 'Monitoring pusat');

    const filter = { country: '', dormitoryId: '', level: '', kind: '', status: 'aktif' };
    let data = null;
    let sedangMuat = false;
    let tampilSemua = false;

    const kepala = el('div', 'mp-head');
    const judul = el('div', 'mp-head__title');
    judul.append(el('h3', 'admin-section-title', 'Monitoring pusat'), el('p', 'mp-sub', 'Kondisi seluruh santri dan asrama hari ini.'));
    const kanan = el('div', 'mp-head__side');
    const diperbarui = el('span', 'mp-updated');
    const segarkan = tombol('Perbarui', 'button button--secondary mp-refresh', () => muat());
    kanan.append(diperbarui, segarkan);
    kepala.append(judul, kanan);

    const filterBar = el('div', 'mp-filters');
    filterBar.setAttribute('role', 'group');
    filterBar.setAttribute('aria-label', 'Saring monitoring');
    const pilihan = {};
    const FILTER = [
      ['country', 'Negara', 'Semua negara'],
      ['dormitoryId', 'Asrama', 'Semua asrama'],
      ['level', 'Jenjang pendidikan', 'Semua jenjang'],
      ['kind', 'Jenis urusan', 'Semua jenis']
    ];
    FILTER.forEach(([kunci, label, semua]) => {
      const kotak = el('label', 'mp-filter');
      kotak.append(el('span', 'mp-filter__label', label));
      const select = el('select', 'mp-filter__select');
      select.append(new Option(semua, ''));
      select.addEventListener('change', () => { filter[kunci] = select.value; tampilSemua = false; muat(); });
      kotak.append(select);
      filterBar.append(kotak);
      pilihan[kunci] = { select, semua };
    });
    const reset = tombol('Atur ulang', 'mp-reset', () => {
      Object.assign(filter, { country: '', dormitoryId: '', level: '', kind: '', status: 'aktif' });
      tampilSemua = false;
      muat();
    });
    filterBar.append(reset);

    const status = el('p', 'mp-status');
    status.setAttribute('role', 'status');
    const kartuAngka = el('div', 'mp-kpis');
    const kartuAbsensi = el('div', 'mp-card mp-attendance');
    const kartuMasalah = el('div', 'mp-card mp-cases');
    const kartuNegara = el('details', 'mp-country');
    const kartuDokumen = el('details', 'mp-country');
    akar.append(kepala, filterBar, status, kartuAngka, kartuAbsensi, kartuMasalah, kartuDokumen, kartuNegara);

    function isiPilihan(select, semuaTeks, daftar, nilai) {
      select.replaceChildren(new Option(semuaTeks, ''));
      daftar.forEach(([id, label]) => select.append(new Option(label, id)));
      select.value = daftar.some(([id]) => id === nilai) ? nilai : '';
    }

    function gambarFilter() {
      const o = data.options;
      isiPilihan(pilihan.country.select, pilihan.country.semua, o.countries.map((n) => [n, n]), filter.country);
      isiPilihan(pilihan.dormitoryId.select, pilihan.dormitoryId.semua, o.dormitories.map((d) => [d.id, `${d.name} (${d.country})`]), filter.dormitoryId);
      isiPilihan(pilihan.level.select, pilihan.level.semua, o.levels.map((n) => [n, n]), filter.level);
      isiPilihan(pilihan.kind.select, pilihan.kind.semua, o.kinds.map((k) => [k.id, k.label]), filter.kind);
      reset.hidden = !(filter.country || filter.dormitoryId || filter.level || filter.kind || filter.status !== 'aktif');
    }

    function angka(label, nilai, catatan, nada) {
      const kartu = el('div', `mp-kpi${nada ? ` mp-kpi--${nada}` : ''}`);
      kartu.append(el('p', 'mp-kpi__label', label), el('p', 'mp-kpi__value', String(nilai)), el('p', 'mp-kpi__note', catatan));
      return kartu;
    }

    function gambarAngka() {
      const t = data.totals;
      const urgen = data.cases.urgent;
      kartuAngka.replaceChildren(
        angka('Santri aktif', t.activeStudents, t.truncated ? 'Dibatasi 1000 santri pertama' : (t.onLongLeave ? `Belum termasuk ${t.onLongLeave} yang cuti panjang` : 'Sesuai saringan di atas')),
        angka('Santri izin', t.onLeave, t.homeLeave ? `Termasuk ${t.homeLeave} pulang ke Indonesia` : 'Izin disetujui yang sedang berjalan', t.onLeave ? 'info' : ''),
        angka('Santri sakit', t.sick, data.healthEnabled ? 'Catatan kesehatan 3 hari terakhir' : 'Dari izin sakit; catatan kesehatan belum aktif', t.sick ? 'warn' : ''),
        angka('Asrama', t.dormitories, 'Yang berpenghuni'),
        angka('Musyrif aktif', t.supervisors, 'Seluruh lembaga'),
        angka('Perlu segera', urgen, urgen ? 'Urusan yang mendesak' : 'Tidak ada yang mendesak', urgen ? 'danger' : '')
      );
    }

    function daftarNama(judulDaftar, santri, kosong) {
      const d = el('details', 'mp-names');
      d.append(el('summary', '', `${judulDaftar} (${santri.length})`));
      if (!santri.length) {
        d.append(el('p', 'mp-empty', kosong));
        return d;
      }
      const ul = el('ul', 'mp-names__list');
      santri.forEach((s) => {
        const li = el('li');
        const b = tombol(s.name, 'mp-link', () => onOpenStudent(s.id));
        b.setAttribute('aria-label', `Buka santri ${s.name}`);
        li.append(b);
        if (s.dormitory) li.append(el('span', 'mp-names__meta', s.dormitory));
        ul.append(li);
      });
      d.append(ul);
      return d;
    }

    function rincianAsrama(asrama) {
      const ul = el('ul', 'mp-dorms');
      asrama.forEach((a) => {
        const li = el('li', 'mp-dorm');
        const atas = el('div', 'mp-dorm__top');
        atas.append(el('strong', '', a.name), el('span', 'mp-dorm__meta', `${a.country} · Musyrif: ${a.supervisors.length ? a.supervisors.join(', ') : 'belum ada'}`));
        const sudah = a.notReported === 0;
        const kosong = a.reported === 0 && a.prayersFilled === 0;
        const label = sudah ? 'Semua sudah dilaporkan' : kosong ? 'Belum ada yang diisi' : `${a.notReported} santri belum dilaporkan`;
        const badge = el('span', `mp-chip ${sudah ? 'mp-chip--ok' : 'mp-chip--wait'}`, label);
        const info = el('p', 'mp-dorm__info', `${a.reported} dari ${a.students} santri sudah dilaporkan · ${a.activitiesFilled} kegiatan dan ${a.prayersFilled} dari 5 waktu sholat sudah diisi.`);
        li.append(atas, badge, info);
        if (a.notReportedStudents.length) li.append(daftarNama('Santri yang belum dilaporkan', a.notReportedStudents.map((s) => ({ ...s, dormitory: null })), ''));
        ul.append(li);
      });
      return ul;
    }

    function gambarAbsensi() {
      const a = data.attendanceToday;
      const total = data.totals.activeStudents;
      kartuAbsensi.replaceChildren();
      const atas = el('div', 'mp-card__head');
      atas.append(el('h4', 'mp-card__title', 'Absensi hari ini'), el('span', 'mp-card__meta', TANGGAL.format(new Date(`${data.today}T00:00:00Z`))));
      kartuAbsensi.append(atas);
      if (!total) {
        kartuAbsensi.append(el('p', 'mp-empty', 'Tidak ada santri pada saringan ini.'));
        return;
      }
      const izinTotal = a.excused + a.onLeaveUnrecorded;
      const bagian = [
        ['present', 'Hadir', a.present], ['late', 'Terlambat', a.late], ['excused', 'Izin', izinTotal],
        ['absent', 'Tidak hadir', a.absent], ['pending', 'Belum dilaporkan', a.notReported]
      ];
      const bar = el('div', 'mp-bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', bagian.map(([, label, n]) => `${label} ${n}`).join(', '));
      bagian.forEach(([kelas, , n]) => {
        if (!n) return;
        const potong = el('span', `mp-bar__seg mp-bar__seg--${kelas}`);
        potong.style.flexGrow = String(n);
        bar.append(potong);
      });
      const legenda = el('ul', 'mp-legend');
      bagian.forEach(([kelas, label, n]) => {
        const li = el('li');
        li.append(el('span', `mp-dot mp-dot--${kelas}`), el('span', 'mp-legend__label', label), el('strong', '', String(n)));
        legenda.append(li);
      });
      kartuAbsensi.append(bar, legenda);
      kartuAbsensi.append(el('p', 'mp-note', a.notReported === total
        ? 'Belum ada kegiatan yang dicatat hari ini. Musyrif mengisinya di halaman Presensi asrama, jadi angka ini bergerak sepanjang hari.'
        : '“Belum dilaporkan” berarti belum ada catatan kegiatan hari ini dan santrinya tidak sedang izin. Musyrif mengisinya di Presensi asrama.'));

      const rincian = el('div', 'mp-details');
      const kegiatan = el('details', 'mp-detail');
      kegiatan.append(el('summary', '', `Per kegiatan (${a.activities.length})`));
      kegiatan.append(a.activities.length
        ? tabelKecil(['Kegiatan', 'Hadir', 'Terlambat', 'Izin', 'Tidak hadir', 'Asrama mengisi'],
          a.activities.map((k) => [k.category, k.present, k.late, k.excused, k.absent, `${k.dormitoriesFilled}/${k.dormitoriesTotal}`]))
        : el('p', 'mp-empty', 'Belum ada kegiatan yang dicatat hari ini.'));
      const sholat = el('details', 'mp-detail');
      sholat.append(el('summary', '', 'Sholat lima waktu'));
      sholat.append(tabelKecil(['Waktu', 'Berjamaah', 'Munfarid', 'Tidak', 'Izin', 'Asrama mengisi'],
        a.prayers.map((p) => [LABEL_SHOLAT[p.prayer], p.berjamaah, p.munfarid, p.tidak, p.izin, `${p.dormitoriesFilled}/${p.dormitoriesTotal}`])));
      const perAsrama = el('details', 'mp-detail');
      perAsrama.open = a.notReported > 0 && a.notReported < total;
      perAsrama.append(el('summary', '', `Per asrama dan musyrif (${a.dormitories.length})`));
      perAsrama.append(a.dormitories.length ? rincianAsrama(a.dormitories) : el('p', 'mp-empty', 'Belum ada asrama berpenghuni pada saringan ini.'));
      const tautan = el('a', 'mp-link-out', 'Buka Presensi asrama');
      tautan.href = 'monitoring#presensi';
      rincian.append(kegiatan, sholat, perAsrama, daftarNama('Tidak hadir', a.absentStudents, 'Tidak ada santri yang dicatat tidak hadir.'), tautan);
      kartuAbsensi.append(rincian);
    }

    async function ubah(item, statusBaru, catatan, ekstra = {}) {
      status.textContent = 'Menyimpan...';
      try {
        const body = { studentId: item.studentId, kind: item.kind, ref: item.ref, status: statusBaru, ...ekstra };
        if (catatan !== undefined) body.note = catatan;
        const response = await fetch('/api/admin/monitoring-pusat/masalah', {
          method: 'PATCH', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const hasil = await response.json();
        if (!response.ok) throw new Error(hasil.error || 'Status belum dapat diubah.');
        await muat(`Status ${item.studentName} diubah menjadi ${LABEL_STATUS[statusBaru].toLowerCase()}.`);
      } catch (error) {
        status.textContent = error.message;
      }
    }

    // Menyelesaikan urusan wajib disertai bukti: catatan bukti dan/atau berkas (privat).
    async function selesaikan(item) {
      const sudahAda = Boolean(item.evidenceNote || item.evidenceFileId);
      const hasil = await window.HamasahDialog.formulir({
        judul: `Selesaikan: ${item.title}`,
        keterangan: `${item.studentName}. Tulis bukti penyelesaian supaya ada jejak bahwa urusan ini benar-benar beres.${sudahAda ? ' Bukti sebelumnya sudah ada; boleh dikosongkan.' : ''}`,
        bidang: [
          { nama: 'evidenceNote', label: 'Bukti penyelesaian', jenis: 'textarea', nilai: item.evidenceNote || '', wajib: !sudahAda, petunjuk: 'Misalnya: nomor tanda terima, tanggal diserahkan, atau siapa yang menerima.' },
          { nama: 'evidenceFile', label: 'Berkas bukti (opsional)', jenis: 'file', accept: 'application/pdf,image/jpeg,image/png', petunjuk: 'PDF, JPG, atau PNG maksimal 5 MB. Disimpan privat.' }
        ],
        labelSimpan: 'Tandai selesai',
        kirim: async (nilai) => {
          const ekstra = {};
          if (nilai.evidenceNote) ekstra.evidenceNote = nilai.evidenceNote;
          if (nilai.evidenceFile) ekstra.evidenceFileId = await window.HamasahUnggah.kirim({ purpose: 'case-evidence', entityId: item.studentId, berkas: nilai.evidenceFile, headers: headers() });
          const respons = await fetch('/api/admin/monitoring-pusat/masalah', { method: 'PATCH', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: item.studentId, kind: item.kind, ref: item.ref, status: 'selesai', ...ekstra }) });
          const jawab = await respons.json().catch(() => ({}));
          if (!respons.ok) throw new Error(jawab.error || 'Urusan belum dapat diselesaikan.');
          return jawab;
        }
      });
      if (hasil) await muat(`${item.studentName}: urusan ditandai selesai.`);
    }

    function pilihPenanggungJawab(item) {
      const baris = el('label', 'mp-assign');
      baris.append(el('span', '', 'Penanggung jawab'));
      const pilih = el('select');
      pilih.append(new Option('Belum ditentukan', ''));
      (data.options.staff || []).forEach((p) => pilih.append(new Option(`${p.name} (${p.role === 'admin' ? 'admin' : 'musyrif'})`, p.id)));
      pilih.value = item.assignee ? item.assignee.id : '';
      pilih.addEventListener('change', () => ubah(item, item.status, undefined, { assigneeAccountId: pilih.value }));
      baris.append(pilih);
      return baris;
    }

    function formCatatan(item) {
      const form = el('form', 'mp-note-form');
      const area = el('textarea', 'mp-note-form__input');
      area.rows = 2;
      area.maxLength = 500;
      area.value = item.note || '';
      area.setAttribute('aria-label', `Catatan tindak lanjut untuk ${item.studentName}`);
      area.placeholder = 'Catatan tindak lanjut (opsional)';
      const simpan = el('button', 'button button--secondary mp-small', 'Simpan catatan');
      simpan.type = 'submit';
      form.append(area, simpan);
      form.addEventListener('submit', (event) => { event.preventDefault(); ubah(item, item.status, area.value); });
      return form;
    }

    function chipHitung(item) {
      if (item.daysLeft === null || item.status === 'selesai') return null;
      const lewat = item.daysLeft < 0;
      const teks = lewat ? `Terlambat ${-item.daysLeft} hari` : item.daysLeft === 0 ? 'Hari ini' : `Sisa ${item.daysLeft} hari`;
      return el('span', `mp-chip ${lewat || item.severity === 'tinggi' ? 'mp-chip--urgent' : 'mp-chip--soon'}`, teks);
    }

    function barisMasalah(item) {
      const li = el('li', `mp-case is-${item.severity} is-${item.status}`);
      const utama = el('div', 'mp-case__main');
      const atas = el('div', 'mp-case__top');
      const nama = tombol(item.studentName, 'mp-link mp-case__name', () => onOpenStudent(item.studentId));
      nama.setAttribute('aria-label', `Buka santri ${item.studentName}`);
      atas.append(nama);
      const meta = [item.dormitory || 'Belum berasrama', item.country !== 'Belum berasrama' ? item.country : '', item.level].filter(Boolean).join(' · ');
      atas.append(el('span', 'mp-case__meta', meta));
      const chip = chipHitung(item);
      utama.append(atas, el('p', 'mp-case__title', item.kind === 'paspor' || item.kind === 'iqamah' ? item.title : item.title), el('p', 'mp-case__detail', item.detail));
      const jejak = [];
      if (item.recordedBy) jejak.push(`Dicatat ${item.recordedBy}`);
      if (item.since) jejak.push(WAKTU.format(new Date(item.since)));
      if (jejak.length) utama.append(el('p', 'mp-case__trail', jejak.join(' · ')));
      if (item.note && (item.kind === 'paspor' || item.kind === 'iqamah')) utama.append(el('p', 'mp-case__note', `Catatan: ${item.note}`));
      if (item.assignee) utama.append(el('p', 'mp-case__trail', `Penanggung jawab: ${item.assignee.name || 'staf'}`));
      if (item.evidenceNote || item.evidenceFileId) {
        const bukti = el('p', 'mp-case__note', item.evidenceNote ? `Bukti penyelesaian: ${item.evidenceNote}` : 'Bukti penyelesaian terlampir.');
        if (item.evidenceFileId) {
          const lihat = tombol('Lihat berkas bukti', 'mp-link', () => window.HamasahUnggah.buka(item.evidenceFileId, headers()).catch((error) => { status.textContent = error.message; }));
          bukti.append(document.createTextNode(' '), lihat);
        }
        utama.append(bukti);
      }
      if (item.history && item.history.length) {
        const riwayat = el('details', 'mp-case__history');
        riwayat.append(el('summary', '', `Riwayat (${item.history.length})`));
        const ul = el('ul');
        const ARTI = { dibuat: 'Dibuat', status: 'Status', 'penanggung-jawab': 'Penanggung jawab', catatan: 'Catatan' };
        item.history.forEach((h) => ul.append(el('li', '', `${WAKTU.format(new Date(h.at))} · ${ARTI[h.action] || h.action}${h.to ? `: ${LABEL_STATUS[h.to] || h.to}` : ''}${h.by ? ` oleh ${h.by}` : ''}${h.note ? ` · ${h.note}` : ''}`)));
        riwayat.append(ul);
        utama.append(riwayat);
      }

      const sisi = el('div', 'mp-case__side');
      const lencana = el('div', 'mp-case__badges');
      if (chip) lencana.append(chip);
      lencana.append(el('span', `mp-status-badge mp-status-badge--${item.status}`, LABEL_STATUS[item.status]));
      sisi.append(lencana);
      const aksiUtama = item.status === 'baru'
        ? tombol('Mulai proses', 'button button--primary mp-small', () => ubah(item, 'diproses'))
        : item.status === 'diproses'
          ? tombol('Tandai selesai', 'button button--primary mp-small', () => selesaikan(item))
          : tombol('Buka lagi', 'button button--secondary mp-small', () => ubah(item, 'baru'));
      sisi.append(aksiUtama);

      const lain = el('details', 'mp-case__more');
      lain.append(el('summary', '', 'Tindakan lain'));
      const isi = el('div', 'mp-case__more-body');
      const aksi = el('div', 'mp-case__actions');
      aksi.append(tombol('Buka profil santri', 'button button--secondary mp-small', () => onOpenStudent(item.studentId)));
      if (item.status === 'baru') aksi.append(tombol('Langsung selesai', 'button button--secondary mp-small', () => selesaikan(item)));
      if (item.status === 'diproses') aksi.append(tombol('Kembalikan ke baru', 'button button--secondary mp-small', () => ubah(item, 'baru')));
      isi.append(aksi, pilihPenanggungJawab(item), formCatatan(item));
      lain.append(isi);
      li.append(utama, sisi, lain);
      return li;
    }

    function dialogMasalah() {
      const dialog = el('dialog', 'mp-dialog');
      const form = el('form', 'mp-dialog__form');
      form.method = 'dialog';
      form.append(el('h4', 'mp-dialog__title', 'Catat urusan santri'));
      form.append(el('p', 'mp-sub', 'Biasanya diisi musyrif. Batas waktu dipakai untuk hitung mundur.'));
      const baris = (label, input) => {
        const l = el('label', 'mp-dialog__field');
        l.append(el('span', '', label), input);
        form.append(l);
        return input;
      };
      const santri = el('select');
      santri.required = true;
      santri.append(new Option('Pilih santri', ''));
      data.options.students.forEach((s) => santri.append(new Option(`${s.name}${s.dormitory ? ` · ${s.dormitory}` : ''}`, s.id)));
      baris('Santri', santri);
      const jenis = el('select');
      JENIS_MANUAL.forEach(([id, label]) => jenis.append(new Option(label, id)));
      baris('Jenis urusan', jenis);
      const batas = el('input');
      batas.type = 'date';
      batas.required = true;
      baris('Batas waktu', batas);
      const catatan = el('textarea');
      catatan.rows = 3;
      catatan.maxLength = 500;
      catatan.required = true;
      catatan.minLength = 3;
      baris('Catatan', catatan);
      const penanggung = el('select');
      penanggung.append(new Option('Belum ditentukan', ''));
      (data.options.staff || []).forEach((p) => penanggung.append(new Option(`${p.name} (${p.role === 'admin' ? 'admin' : 'musyrif'})`, p.id)));
      baris('Penanggung jawab', penanggung);
      const galat = el('p', 'mp-dialog__error');
      galat.setAttribute('role', 'alert');
      const aksi = el('div', 'mp-dialog__actions');
      const batal = tombol('Batal', 'button button--secondary', () => dialog.close());
      const simpan = el('button', 'button button--primary', 'Simpan');
      simpan.type = 'submit';
      aksi.append(batal, simpan);
      form.append(galat, aksi);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        simpan.disabled = true;
        galat.textContent = '';
        try {
          const response = await fetch('/api/admin/monitoring-pusat/masalah', {
            method: 'POST',
            headers: { ...headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: santri.value, kind: jenis.value, note: catatan.value, dueOn: batas.value, assigneeAccountId: penanggung.value || undefined })
          });
          const hasil = await response.json();
          if (!response.ok) throw new Error(hasil.error || 'Urusan belum dapat dicatat.');
          dialog.close();
          await muat('Urusan dicatat.');
        } catch (error) {
          galat.textContent = error.message;
        } finally {
          simpan.disabled = false;
        }
      });
      dialog.addEventListener('close', () => dialog.remove());
      dialog.append(form);
      document.body.append(dialog);
      dialog.showModal();
    }

    function gambarMasalah() {
      const c = data.cases;
      kartuMasalah.replaceChildren();
      const atas = el('div', 'mp-card__head');
      atas.append(el('h4', 'mp-card__title', 'Urusan administrasi santri'), tombol('Catat urusan', 'button button--secondary mp-small', dialogMasalah));
      kartuMasalah.append(atas);

      const tab = el('div', 'mp-tabs');
      tab.setAttribute('role', 'group');
      tab.setAttribute('aria-label', 'Status tindak lanjut');
      TAB_STATUS.forEach(([id, label]) => {
        const jumlah = id === 'aktif' ? c.counts.baru + c.counts.diproses
          : id === 'semua' ? c.counts.baru + c.counts.diproses + c.counts.selesai : c.counts[id];
        const b = tombol('', `mp-tab${filter.status === id ? ' is-on' : ''}`, () => { filter.status = id; tampilSemua = false; muat(); });
        b.setAttribute('aria-pressed', String(filter.status === id));
        b.append(document.createTextNode(label), el('span', 'mp-tab__count', String(jumlah)));
        tab.append(b);
      });
      kartuMasalah.append(tab);

      const jenisRingkas = data.options.kinds.filter((k) => c.byKind[k.id]);
      if (jenisRingkas.length) {
        const ringkas = el('p', 'mp-kinds');
        jenisRingkas.forEach((k) => ringkas.append(el('span', 'mp-kinds__item', `${k.label}: ${c.byKind[k.id]}`)));
        kartuMasalah.append(ringkas);
      }

      if (!c.items.length) {
        kartuMasalah.append(el('p', 'mp-empty', filter.status === 'aktif'
          ? 'Tidak ada urusan yang perlu ditindaklanjuti pada saringan ini.'
          : 'Tidak ada urusan dengan status ini pada saringan ini.'));
        return;
      }
      const daftar = el('ul', 'mp-list');
      const tampil = tampilSemua ? c.items : c.items.slice(0, BARIS_AWAL);
      tampil.forEach((item) => daftar.append(barisMasalah(item)));
      kartuMasalah.append(daftar);
      if (c.items.length > BARIS_AWAL) {
        kartuMasalah.append(tombol(tampilSemua ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${c.items.length})`, 'button button--secondary mp-more',
          () => { tampilSemua = !tampilSemua; gambarMasalah(); }));
      }
    }

    function gambarNegara() {
      const o = data.options;
      kartuNegara.replaceChildren(el('summary', '', 'Atur negara tiap asrama'));
      if (!o.countrySettable) {
        kartuNegara.append(el('p', 'mp-empty', 'Pengaturan negara aktif setelah pembaruan database diterapkan di halaman Pengaturan. Sementara ini semua asrama dianggap di Mesir kecuali wilayahnya menyebut Indonesia.'));
        return;
      }
      kartuNegara.append(el('p', 'mp-sub', 'Dipakai untuk saringan Negara. Bawaannya Mesir.'));
      const ul = el('ul', 'mp-country__list');
      o.allDormitories.forEach((d) => {
        const li = el('li');
        const select = el('select', 'mp-filter__select');
        ['Mesir', 'Indonesia'].forEach((n) => select.append(new Option(n, n)));
        select.value = d.country;
        select.setAttribute('aria-label', `Negara ${d.name}`);
        select.addEventListener('change', async () => {
          status.textContent = 'Menyimpan...';
          try {
            const response = await fetch(`/api/admin/monitoring-pusat/asrama/${encodeURIComponent(d.id)}/negara`, {
              method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ country: select.value })
            });
            const hasil = await response.json();
            if (!response.ok) throw new Error(hasil.error || 'Negara belum dapat disimpan.');
            await muat(`Negara ${d.name} diubah menjadi ${select.value}.`);
          } catch (error) {
            status.textContent = error.message;
            select.value = d.country;
          }
        });
        li.append(el('span', '', d.name), select);
        ul.append(li);
      });
      kartuNegara.append(ul);
    }

    // Batas peringatan paspor dan iqamah. Paspor yang tersisa kurang dari enam bulan (180 hari) dapat diubah di sini.
    function gambarDokumen() {
      const a = data.options.documentAlerts;
      const terbuka = kartuDokumen.open;
      kartuDokumen.replaceChildren(el('summary', '', 'Atur batas peringatan paspor dan iqamah'));
      if (!a) return;
      kartuDokumen.append(el('p', 'mp-sub', 'Dokumen yang sisa masa berlakunya kurang dari batas peringatan muncul di daftar urusan; kurang dari batas segera ditandai mendesak. Berlaku juga di profil santri.'));
      const form = el('form', 'mp-note-form');
      const kolom = [['passportWarningDays', 'Peringatan paspor (hari)'], ['passportUrgentDays', 'Paspor segera (hari)'], ['iqamahWarningDays', 'Peringatan iqamah (hari)'], ['iqamahUrgentDays', 'Iqamah segera (hari)']];
      const isian = {};
      kolom.forEach(([kunci, label]) => {
        const l = el('label', 'mp-dialog__field');
        const i = el('input');
        i.type = 'number';
        i.min = '1';
        i.max = '730';
        i.value = String(a[kunci]);
        isian[kunci] = i;
        l.append(el('span', '', label), i);
        form.append(l);
      });
      const simpan = el('button', 'button button--secondary mp-small', 'Simpan batas');
      simpan.type = 'submit';
      form.append(simpan);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.textContent = 'Menyimpan...';
        try {
          const respons = await fetch('/api/pengaturan-dokumen', { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(kolom.map(([kunci]) => [kunci, Number(isian[kunci].value)]))) });
          const hasil = await respons.json().catch(() => ({}));
          if (!respons.ok) throw new Error(hasil.error || 'Batas belum dapat disimpan.');
          await muat('Batas peringatan dokumen disimpan.');
        } catch (error) { status.textContent = error.message; }
      });
      kartuDokumen.append(form);
      kartuDokumen.open = terbuka;
    }

    async function muat(pesan) {
      if (sedangMuat) return;
      sedangMuat = true;
      segarkan.disabled = true;
      if (!data) status.textContent = 'Memuat monitoring...';
      const terbuka = kartuNegara.open;
      try {
        const params = new URLSearchParams();
        Object.entries(filter).forEach(([k, v]) => { if (v) params.set(k, v); });
        const response = await fetch(`/api/admin/monitoring-pusat?${params}`, { headers: headers() });
        const hasil = await response.json();
        if (!response.ok) throw new Error(hasil.error || 'Monitoring belum dapat dimuat.');
        data = hasil;
        diperbarui.textContent = `Diperbarui ${WAKTU.format(new Date(data.generatedAt))}`;
        status.textContent = typeof pesan === 'string' ? pesan : '';
        gambarFilter();
        gambarAngka();
        gambarAbsensi();
        gambarMasalah();
        gambarNegara();
        gambarDokumen();
        kartuNegara.open = terbuka;
      } catch (error) {
        status.textContent = error.message;
      } finally {
        sedangMuat = false;
        segarkan.disabled = false;
      }
    }

    muat();
    return akar;
  }

  window.HamasahMonitoringPusat = Object.freeze({ render });
}());
