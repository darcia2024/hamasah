// Monitoring pusat di dashboard admin: angka hari ini, absensi hari ini, dan daftar masalah santri
// beserta status tindak lanjutnya. Data dari /api/admin/monitoring-pusat (server/central-monitoring-service.js).
//
// Semua isi dibangun lewat textContent; tidak ada data dari server yang masuk innerHTML.
(function initMonitoringPusat() {
  const WAKTU = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const LABEL_STATUS = Object.freeze({ baru: 'Baru', diproses: 'Sedang diproses', selesai: 'Selesai' });
  const JENIS_MANUAL = Object.freeze([
    ['lapor-diri', 'Lapor diri belum selesai'],
    ['lapor-pendidikan', 'Lapor pendidikan belum selesai'],
    ['status-pendidikan', 'Status pendidikan bermasalah']
  ]);
  const TAB_STATUS = Object.freeze([['aktif', 'Belum selesai'], ['baru', 'Baru'], ['diproses', 'Sedang diproses'], ['selesai', 'Selesai'], ['semua', 'Semua']]);

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

  function render({ headers, onOpenStudent }) {
    const akar = el('section', 'mp');
    akar.id = 'admin-perhatian';
    akar.tabIndex = -1;
    akar.setAttribute('aria-label', 'Monitoring pusat');

    const filter = { country: '', dormitoryId: '', level: '', kind: '', status: 'aktif' };
    let data = null;
    let sedangMuat = false;

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
      ['kind', 'Jenis masalah', 'Semua jenis']
    ];
    FILTER.forEach(([kunci, label, semua]) => {
      const kotak = el('label', 'mp-filter');
      kotak.append(el('span', 'mp-filter__label', label));
      const select = el('select', 'mp-filter__select');
      select.append(new Option(semua, ''));
      select.addEventListener('change', () => { filter[kunci] = select.value; muat(); });
      kotak.append(select);
      filterBar.append(kotak);
      pilihan[kunci] = { select, semua };
    });
    const reset = tombol('Atur ulang', 'mp-reset', () => {
      Object.assign(filter, { country: '', dormitoryId: '', level: '', kind: '', status: 'aktif' });
      muat();
    });
    filterBar.append(reset);

    const status = el('p', 'mp-status');
    status.setAttribute('role', 'status');
    const kartuAngka = el('div', 'mp-kpis');
    const kartuAbsensi = el('div', 'mp-card mp-attendance');
    const kartuMasalah = el('div', 'mp-card mp-cases');
    akar.append(kepala, filterBar, status, kartuAngka, kartuAbsensi, kartuMasalah);

    function isiPilihan(select, semuaTeks, daftar, nilai) {
      select.replaceChildren(new Option(semuaTeks, ''));
      daftar.forEach(([id, label]) => select.append(new Option(label, id)));
      select.value = daftar.some(([id]) => id === nilai) ? nilai : '';
    }

    function gambarFilter() {
      const o = data.options;
      isiPilihan(pilihan.country.select, pilihan.country.semua, o.countries.map((n) => [n, n]), filter.country);
      isiPilihan(pilihan.dormitoryId.select, pilihan.dormitoryId.semua, o.dormitories.map((d) => [d.id, `${d.name}${d.country ? ` (${d.country})` : ''}`]), filter.dormitoryId);
      isiPilihan(pilihan.level.select, pilihan.level.semua, o.levels.map((n) => [n, n]), filter.level);
      isiPilihan(pilihan.kind.select, pilihan.kind.semua, o.kinds.map((k) => [k.id, k.label]), filter.kind);
      const aktif = filter.country || filter.dormitoryId || filter.level || filter.kind || filter.status !== 'aktif';
      reset.hidden = !aktif;
    }

    function angka(label, nilai, catatan, nada) {
      const kartu = el('div', `mp-kpi${nada ? ` mp-kpi--${nada}` : ''}`);
      kartu.append(el('p', 'mp-kpi__label', label), el('p', 'mp-kpi__value', String(nilai)), el('p', 'mp-kpi__note', catatan));
      return kartu;
    }

    function gambarAngka() {
      const t = data.totals;
      kartuAngka.replaceChildren(
        angka('Santri aktif', t.activeStudents, t.truncated ? 'Dibatasi 1000 santri pertama' : 'Sesuai saringan di atas'),
        angka('Santri izin', t.onLeave, 'Izin disetujui yang sedang berjalan', t.onLeave ? 'info' : ''),
        angka('Santri sakit', t.sick, data.healthEnabled ? 'Catatan kesehatan 3 hari terakhir' : 'Hanya dari izin sakit; catatan kesehatan belum aktif', t.sick ? 'warn' : ''),
        angka('Asrama', t.dormitories, 'Asrama yang berpenghuni'),
        angka('Musyrif aktif', t.supervisors, 'Seluruh lembaga')
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

    function gambarAbsensi() {
      const a = data.attendanceToday;
      const total = data.totals.activeStudents;
      kartuAbsensi.replaceChildren();
      const atas = el('div', 'mp-card__head');
      atas.append(el('h4', 'mp-card__title', 'Absensi kegiatan hari ini'), el('span', 'mp-card__meta', TANGGAL.format(new Date(`${data.today}T00:00:00Z`))));
      kartuAbsensi.append(atas);
      if (!total) {
        kartuAbsensi.append(el('p', 'mp-empty', 'Tidak ada santri pada saringan ini.'));
        return;
      }
      const izinTotal = a.excused + a.onLeaveUnrecorded;
      const bagian = [
        ['present', 'Hadir', a.present], ['late', 'Terlambat', a.late], ['excused', 'Izin', izinTotal],
        ['absent', 'Belum hadir', a.absent], ['pending', 'Belum dilaporkan', a.notReported]
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
      if (a.recordedStudents === 0) {
        kartuAbsensi.append(el('p', 'mp-note', 'Belum ada absensi yang dicatat hari ini.'));
      }
      const daftar = el('div', 'mp-names-wrap');
      daftar.append(
        daftarNama('Belum hadir', a.absentStudents, 'Tidak ada santri yang dicatat tidak hadir.'),
        daftarNama('Belum dilaporkan', a.notReportedStudents, 'Semua santri sudah dilaporkan.')
      );
      kartuAbsensi.append(daftar);
    }

    async function ubah(item, statusBaru, catatan) {
      status.textContent = 'Menyimpan...';
      try {
        const body = { studentId: item.studentId, kind: item.kind, ref: item.ref, status: statusBaru };
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

    function barisMasalah(item) {
      const li = el('li', `mp-case is-${item.severity} is-${item.status}`);
      const utama = el('div', 'mp-case__main');
      const nama = tombol(item.studentName, 'mp-link mp-case__name', () => onOpenStudent(item.studentId));
      nama.setAttribute('aria-label', `Buka santri ${item.studentName}`);
      const meta = [item.dormitory || 'Belum berasrama', item.country !== 'Belum berasrama' ? item.country : '', item.level].filter(Boolean).join(' · ');
      const judulMasalah = el('p', 'mp-case__title');
      if (item.severity === 'tinggi' && item.status !== 'selesai') judulMasalah.append(el('span', 'mp-badge mp-badge--urgent', 'Segera'));
      judulMasalah.append(el('span', '', item.title));
      utama.append(nama, el('p', 'mp-case__meta', meta), judulMasalah, el('p', 'mp-case__detail', item.detail));
      const jejak = [];
      if (item.dueOn) jejak.push(`Batas ${TANGGAL.format(new Date(`${item.dueOn}T00:00:00Z`))}`);
      if (item.since) jejak.push(`Dicatat ${WAKTU.format(new Date(item.since))}`);
      if (jejak.length) utama.append(el('p', 'mp-case__trail', jejak.join(' · ')));
      // Pada masalah manual catatannya sudah menjadi keterangan di atas.
      if (item.note && (item.kind === 'paspor' || item.kind === 'iqamah')) utama.append(el('p', 'mp-case__note', `Catatan: ${item.note}`));

      const sisi = el('div', 'mp-case__side');
      sisi.append(el('span', `mp-status-badge mp-status-badge--${item.status}`, LABEL_STATUS[item.status]));
      const aksi = el('div', 'mp-case__actions');
      if (item.status === 'baru') {
        aksi.append(tombol('Mulai proses', 'button button--secondary mp-small', () => ubah(item, 'diproses')));
        aksi.append(tombol('Selesai', 'button button--secondary mp-small', () => ubah(item, 'selesai')));
      } else if (item.status === 'diproses') {
        aksi.append(tombol('Tandai selesai', 'button button--primary mp-small', () => ubah(item, 'selesai')));
        aksi.append(tombol('Kembalikan ke baru', 'button button--secondary mp-small', () => ubah(item, 'baru')));
      } else {
        aksi.append(tombol('Buka lagi', 'button button--secondary mp-small', () => ubah(item, 'baru')));
      }
      const buka = tombol('Buka santri', 'button button--secondary mp-small', () => onOpenStudent(item.studentId));
      aksi.append(buka);
      sisi.append(aksi);

      const catatan = el('details', 'mp-case__notes');
      catatan.append(el('summary', '', item.note ? 'Lihat atau ubah catatan' : 'Tambah catatan'), formCatatan(item));
      li.append(utama, sisi, catatan);
      return li;
    }

    function dialogMasalah() {
      const dialog = el('dialog', 'mp-dialog');
      const form = el('form', 'mp-dialog__form');
      form.method = 'dialog';
      form.append(el('h4', 'mp-dialog__title', 'Catat masalah santri'));
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
      baris('Jenis masalah', jenis);
      const catatan = el('textarea');
      catatan.rows = 3;
      catatan.maxLength = 500;
      catatan.required = true;
      catatan.minLength = 3;
      baris('Apa masalahnya?', catatan);
      const batas = el('input');
      batas.type = 'date';
      baris('Batas waktu (opsional)', batas);
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
            body: JSON.stringify({ studentId: santri.value, kind: jenis.value, note: catatan.value, dueOn: batas.value || undefined })
          });
          const hasil = await response.json();
          if (!response.ok) throw new Error(hasil.error || 'Masalah belum dapat dicatat.');
          dialog.close();
          await muat('Masalah dicatat.');
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
      atas.append(el('h4', 'mp-card__title', 'Santri yang perlu perhatian'), tombol('Catat masalah', 'button button--secondary mp-small', dialogMasalah));
      kartuMasalah.append(atas);

      const tab = el('div', 'mp-tabs');
      tab.setAttribute('role', 'group');
      tab.setAttribute('aria-label', 'Status tindak lanjut');
      TAB_STATUS.forEach(([id, label]) => {
        const jumlah = id === 'aktif' ? c.counts.baru + c.counts.diproses
          : id === 'semua' ? c.counts.baru + c.counts.diproses + c.counts.selesai : c.counts[id];
        const b = tombol('', `mp-tab${filter.status === id ? ' is-on' : ''}`, () => { filter.status = id; muat(); });
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
          ? 'Tidak ada masalah yang perlu ditindaklanjuti pada saringan ini.'
          : 'Tidak ada masalah dengan status ini pada saringan ini.'));
        return;
      }
      const daftar = el('ul', 'mp-list');
      c.items.forEach((item) => daftar.append(barisMasalah(item)));
      kartuMasalah.append(daftar);
    }

    async function muat(pesan) {
      if (sedangMuat) return;
      sedangMuat = true;
      segarkan.disabled = true;
      if (!data) status.textContent = 'Memuat monitoring...';
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
