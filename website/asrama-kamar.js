// Kelola Asrama: tab Kamar (kamar, kapasitas, AC, penghuni, pemindahan dengan riwayat), tab
// Masalah (urusan administrasi penghuni asrama ini saja), dan tab Laporan (akses cepat per
// asrama). Data dari /api/asrama/:id/kamar dan /api/asrama/:id/masalah
// (server/dormitory-room-service.js). Semua teks dipasang lewat textContent.
(function initAsramaKamar() {
  const WAKTU = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  const LABEL_KEADAAN = Object.freeze({ kosong: 'Kosong', sebagian: 'Ada tempat', penuh: 'Penuh', melebihi: 'Melebihi kapasitas' });
  const LABEL_STATUS = Object.freeze({ baru: 'Baru', diproses: 'Sedang diproses', selesai: 'Selesai' });
  const NEGARA = Object.freeze(['Mesir', 'Indonesia']);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tombol(teks, kelas, aksi) {
    const node = el('button', kelas || 'button button--secondary rm-small', teks);
    node.type = 'button';
    if (aksi) node.addEventListener('click', aksi);
    return node;
  }

  function peringatan(teks) {
    return el('p', 'asr-warning', teks);
  }

  // Panel yang memuat datanya sendiri. gambar(wadah, data, muatUlang) menggambar isinya.
  function panelMuat(ctx, url, gambar) {
    const wadah = el('div', 'rm');
    const pesan = el('p', 'mus-note', 'Memuat...');
    pesan.setAttribute('role', 'status');
    wadah.append(pesan);
    async function muat(kabar) {
      try {
        const data = await ctx.api('GET', url);
        wadah.replaceChildren();
        if (kabar) {
          const k = el('p', 'mus-status is-ok asr-flash', kabar);
          k.setAttribute('role', 'status');
          wadah.append(k);
        }
        gambar(wadah, data, muat);
      } catch (error) {
        wadah.replaceChildren(peringatan(error.message));
      }
    }
    muat();
    return [wadah];
  }

  function lencana(teks, kelas) {
    return el('span', `rm-chip ${kelas}`, teks);
  }

  // ------------------------------------------------------------------ tab Kamar

  // Pilihan tujuan pemindahan: kamar yang masih punya tempat di asrama yang boleh dikelola,
  // ditambah "tanpa kamar" per asrama. Asrama lain dimuat hanya saat dialog dibuka.
  async function pilihanTujuan(ctx, data, kecualiKamarId) {
    const hasil = [];
    for (const asrama of ctx.daftarAsrama) {
      let rooms;
      let nama = asrama.name;
      if (asrama.id === data.dormitory.id) {
        rooms = data.rooms;
      } else {
        try {
          const lain = await ctx.api('GET', `/api/asrama/${encodeURIComponent(asrama.id)}/kamar`);
          rooms = lain.rooms;
        } catch {
          continue;
        }
      }
      rooms.filter((k) => k.free > 0 && k.id !== kecualiKamarId)
        .forEach((k) => hasil.push([`${asrama.id}|${k.id}`, `${nama} · kamar ${k.name} (${k.hasAc ? 'AC' : 'non-AC'}, sisa ${k.free})`]));
      hasil.push([`${asrama.id}|`, `${nama} · tanpa kamar dulu`]);
    }
    return hasil;
  }

  async function dialogPindah(ctx, data, santri, kamarAsal, muatUlang) {
    const pilihan = await pilihanTujuan(ctx, data, kamarAsal ? kamarAsal.id : null);
    if (!pilihan.length) {
      window.alert('Belum ada kamar tujuan yang masih punya tempat.');
      return;
    }
    const awal = pilihan.find(([nilai]) => nilai.startsWith(`${data.dormitory.id}|`) && !nilai.endsWith('|')) || pilihan[0];
    const hasil = await window.HamasahDialog.formulir({
      judul: kamarAsal ? `Pindahkan ${santri.name}` : `Tempatkan ${santri.name}`,
      keterangan: kamarAsal ? `Sekarang di kamar ${kamarAsal.name}. Pemindahan dicatat di riwayat.` : 'Santri ini belum punya kamar. Penempatan dicatat di riwayat.',
      bidang: [
        { nama: 'tujuan', label: 'Pindah ke', jenis: 'select', pilihan, nilai: awal[0], wajib: true },
        { nama: 'reason', label: 'Alasan (opsional)', jenis: 'textarea', nilai: '', petunjuk: 'Contoh: permintaan sendiri, kamar diperbaiki, naik tingkat.' }
      ],
      labelSimpan: kamarAsal ? 'Pindahkan' : 'Tempatkan',
      kirim: (nilai) => {
        const [dormitoryId, roomId] = String(nilai.tujuan).split('|');
        return ctx.api('POST', `/api/students/${encodeURIComponent(santri.id)}/kamar`, { dormitoryId, roomId: roomId || null, reason: nilai.reason });
      }
    });
    if (hasil) await muatUlang(`${santri.name} dipindahkan.`);
  }

  function formKamar(ctx, data, awal, muatUlang) {
    const form = el('form', 'rm-form');
    const baris = (label, input) => {
      const l = el('label', 'rm-field');
      l.append(el('span', '', label), input);
      form.append(l);
      return input;
    };
    const nama = baris('Nama atau nomor kamar', el('input'));
    nama.maxLength = 60;
    nama.required = true;
    nama.value = awal ? awal.name : '';
    const kapasitas = baris('Kapasitas maksimal (orang)', el('input'));
    kapasitas.type = 'number';
    kapasitas.min = '1';
    kapasitas.max = '40';
    kapasitas.required = true;
    kapasitas.value = awal ? String(awal.capacity) : '4';
    const ac = baris('Fasilitas', el('select'));
    ac.append(new Option('Non-AC', 'tidak'), new Option('AC', 'ya'));
    ac.value = awal && awal.hasAc ? 'ya' : 'tidak';
    const penanggung = baris('Musyrif penanggung jawab', el('select'));
    penanggung.append(new Option('Belum ditentukan', ''));
    data.supervisors.forEach((m) => penanggung.append(new Option(m.name, m.id)));
    penanggung.value = awal && awal.supervisorId ? awal.supervisorId : '';
    const catatan = baris('Catatan (opsional)', el('input'));
    catatan.maxLength = 300;
    catatan.value = awal ? awal.note : '';
    const st = el('p', 'mus-status');
    st.setAttribute('role', 'status');
    const simpan = el('button', 'button button--primary rm-small', awal ? 'Simpan perubahan' : 'Tambah kamar');
    simpan.type = 'submit';
    form.append(st, simpan);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      simpan.disabled = true;
      try {
        const isi = { name: nama.value, capacity: Number(kapasitas.value), hasAc: ac.value === 'ya', supervisorId: penanggung.value || null, note: catatan.value };
        if (awal) await ctx.api('PATCH', `/api/asrama/${encodeURIComponent(data.dormitory.id)}/kamar/${encodeURIComponent(awal.id)}`, isi);
        else await ctx.api('POST', `/api/asrama/${encodeURIComponent(data.dormitory.id)}/kamar`, isi);
        await muatUlang(awal ? 'Kamar diperbarui.' : 'Kamar ditambahkan.');
      } catch (error) {
        st.textContent = error.message;
        st.className = 'mus-status is-galat';
      } finally {
        simpan.disabled = false;
      }
    });
    return form;
  }

  function kartuKamar(ctx, data, kamar, muatUlang) {
    const kartu = el('article', `rm-room is-${kamar.state}`);
    const atas = el('div', 'rm-room__top');
    atas.append(el('h4', 'rm-room__name', `Kamar ${kamar.name}`), lencana(LABEL_KEADAAN[kamar.state], `rm-chip--${kamar.state}`), lencana(kamar.hasAc ? 'AC' : 'Non-AC', kamar.hasAc ? 'rm-chip--ac' : 'rm-chip--noac'));
    const angka = el('p', 'rm-room__count', `Terisi ${kamar.occupied} dari ${kamar.capacity}`);
    angka.append(el('strong', '', kamar.state === 'melebihi' ? ` · lebih ${kamar.occupied - kamar.capacity}` : ` · sisa ${kamar.free}`));
    kartu.append(atas, angka);
    const meta = [kamar.supervisorName ? `Penanggung jawab: ${kamar.supervisorName}` : '', kamar.note].filter(Boolean).join(' · ');
    if (meta) kartu.append(el('p', 'rm-room__meta', meta));
    if (kamar.occupants.length) {
      const ul = el('ul', 'rm-people');
      kamar.occupants.forEach((s) => {
        const li = el('li');
        li.append(el('span', '', s.name), tombol('Pindahkan', 'button button--secondary rm-small', () => dialogPindah(ctx, data, s, kamar, muatUlang)));
        ul.append(li);
      });
      kartu.append(ul);
    } else {
      kartu.append(el('p', 'rm-room__meta', 'Belum ada penghuni.'));
    }
    const aksi = el('div', 'rm-room__actions');
    if (kamar.free > 0 && data.unplaced.length) {
      aksi.append(tombol('Tempatkan santri', 'button button--secondary rm-small', async () => {
        const hasil = await window.HamasahDialog.formulir({
          judul: `Tempatkan santri di kamar ${kamar.name}`,
          keterangan: `Sisa ${kamar.free} tempat.`,
          bidang: [{ nama: 'studentId', label: 'Santri', jenis: 'select', pilihan: data.unplaced.map((s) => [s.id, s.name]), nilai: data.unplaced[0].id, wajib: true }],
          labelSimpan: 'Tempatkan',
          kirim: (nilai) => ctx.api('POST', `/api/students/${encodeURIComponent(nilai.studentId)}/kamar`, { dormitoryId: data.dormitory.id, roomId: kamar.id, reason: '' })
        });
        if (hasil) await muatUlang('Santri ditempatkan.');
      }));
    }
    const ubah = el('details', 'rm-edit');
    ubah.append(el('summary', '', 'Ubah kamar'), formKamar(ctx, data, kamar, muatUlang));
    const hapus = tombol('Hapus kamar', 'button button--secondary rm-small', async () => {
      if (!window.confirm(`Hapus kamar ${kamar.name}? Kamar harus sudah kosong.`)) return;
      try {
        await ctx.api('DELETE', `/api/asrama/${encodeURIComponent(data.dormitory.id)}/kamar/${encodeURIComponent(kamar.id)}`);
        await muatUlang('Kamar dihapus.');
      } catch (error) {
        window.alert(error.message);
      }
    });
    aksi.append(hapus);
    kartu.append(aksi, ubah);
    return kartu;
  }

  async function aturLokasi(ctx, data, muatUlang) {
    const daftar = (await ctx.api('GET', '/api/lokasi')).locations;
    const pilihan = [['', 'Belum ada lokasi'], ...daftar.map((l) => [l.id, `${l.name} (${l.country})`]), ['__baru', '+ Lokasi baru...']];
    const hasil = await window.HamasahDialog.formulir({
      judul: `Lokasi ${data.dormitory.name}`,
      keterangan: 'Negara asrama mengikuti negara lokasi. Dipakai untuk saringan Negara di Monitoring pusat.',
      bidang: [
        { nama: 'locationId', label: 'Lokasi', jenis: 'select', pilihan, nilai: data.location ? data.location.id : '' },
        { nama: 'name', label: 'Nama lokasi baru (bila memilih lokasi baru)', jenis: 'text', nilai: '' },
        { nama: 'country', label: 'Negara lokasi baru', jenis: 'select', pilihan: NEGARA.map((n) => [n, n]), nilai: 'Mesir' }
      ],
      labelSimpan: 'Simpan lokasi',
      kirim: async (nilai) => {
        let locationId = nilai.locationId;
        if (locationId === '__baru') locationId = (await ctx.api('POST', '/api/lokasi', { name: nilai.name, country: nilai.country })).id;
        return ctx.api('PUT', `/api/asrama/${encodeURIComponent(data.dormitory.id)}/lokasi`, { locationId: locationId || null });
      }
    });
    if (hasil) await muatUlang('Lokasi diperbarui.');
  }

  function kamar(ctx) {
    return panelMuat(ctx, `/api/asrama/${encodeURIComponent(ctx.dormitoryId)}/kamar`, (wadah, data, muatUlang) => {
      if (!data.available) {
        wadah.append(peringatan('Struktur kamar menunggu pembaruan database (migrasi 059). Admin dapat menerapkannya di halaman Pengaturan.'));
        return;
      }
      const s = data.summary;
      const kepala = el('section', 'mus-section asr-section');
      const tajuk = el('header', 'mus-section__head');
      tajuk.append(el('h3', 'mus-title', 'Kamar dan penghuni'));
      const lokasi = el('p', 'mus-note');
      lokasi.append(document.createTextNode(`Lokasi: ${data.location ? `${data.location.name} (${data.location.country})` : 'belum diatur'} · Musyrif: ${data.supervisors.length ? data.supervisors.map((m) => m.name).join(', ') : 'belum ada'} `));
      if (ctx.admin) lokasi.append(tombol('Atur lokasi', 'rm-linkbtn', () => aturLokasi(ctx, data, muatUlang).catch((e) => window.alert(e.message))));
      tajuk.append(lokasi);
      kepala.append(tajuk);
      const ringkas = el('dl', 'rm-summary');
      [
        ['Kamar', s.rooms], ['Kapasitas', s.capacity], ['Terisi', s.occupied], ['Sisa tempat', s.free],
        ['Kamar kosong', s.empty], ['Kamar penuh', s.full], ['AC', s.withAc], ['Non-AC', s.withoutAc], ['Belum berkamar', s.unplaced]
      ].forEach(([label, nilai]) => {
        const d = el('div');
        d.append(el('dt', '', label), el('dd', '', String(nilai)));
        ringkas.append(d);
      });
      kepala.append(ringkas);
      wadah.append(kepala);

      const grid = el('div', 'rm-grid');
      if (!data.rooms.length) grid.append(el('p', 'asr-empty', 'Belum ada kamar. Tambahkan kamar pertama di bawah.'));
      data.rooms.forEach((k) => grid.append(kartuKamar(ctx, data, k, muatUlang)));
      wadah.append(grid);

      if (data.unplaced.length) {
        const belum = el('section', 'mus-section asr-section');
        const h = el('header', 'mus-section__head');
        h.append(el('h3', 'mus-title', `Belum berkamar (${data.unplaced.length})`), el('p', 'mus-note', 'Penghuni asrama ini yang belum punya kamar.'));
        belum.append(h);
        const ul = el('ul', 'rm-people');
        data.unplaced.forEach((st) => {
          const li = el('li');
          li.append(el('span', '', st.name), tombol('Tempatkan', 'button button--secondary rm-small', () => dialogPindah(ctx, data, st, null, muatUlang)));
          ul.append(li);
        });
        belum.append(ul);
        wadah.append(belum);
      }

      const tambah = el('section', 'mus-section asr-section');
      const th = el('header', 'mus-section__head');
      th.append(el('h3', 'mus-title', 'Tambah kamar'));
      tambah.append(th, formKamar(ctx, data, null, muatUlang));
      wadah.append(tambah);

      const riwayat = el('details', 'rm-history');
      riwayat.append(el('summary', '', `Riwayat pemindahan (${data.history.length})`));
      if (!data.history.length) riwayat.append(el('p', 'asr-empty', 'Belum ada pemindahan.'));
      const ul = el('ul', 'rm-history__list');
      data.history.forEach((h) => {
        const li = el('li');
        li.append(el('strong', '', h.studentName), el('span', '', ` dari ${h.from} ke ${h.to}`));
        li.append(el('p', 'rm-room__meta', [WAKTU.format(new Date(h.movedAt)), h.movedBy ? `oleh ${h.movedBy}` : '', h.reason].filter(Boolean).join(' · ')));
        ul.append(li);
      });
      riwayat.append(ul);
      wadah.append(riwayat);
    });
  }

  // ------------------------------------------------------------------ tab Masalah

  function masalah(ctx) {
    return panelMuat(ctx, `/api/asrama/${encodeURIComponent(ctx.dormitoryId)}/masalah`, (wadah, data) => {
      const kepala = el('section', 'mus-section asr-section');
      const tajuk = el('header', 'mus-section__head');
      tajuk.append(el('h3', 'mus-title', 'Urusan administrasi penghuni'), el('p', 'mus-note',
        data.canChangeStatus
          ? 'Hanya penghuni asrama ini. Ubah statusnya di Monitoring pusat (Portal).'
          : 'Hanya penghuni asrama ini. Lapor diri, lapor pendidikan, dan status pendidikan dicatat di beranda musyrif; status paspor dan iqamah diurus admin.'));
      kepala.append(tajuk);
      const hitung = el('p', 'rm-counts');
      ['baru', 'diproses', 'selesai'].forEach((k) => hitung.append(lencana(`${LABEL_STATUS[k]}: ${data.counts[k]}`, `rm-chip--st-${k}`)));
      if (data.urgent) hitung.append(lencana(`Segera: ${data.urgent}`, 'rm-chip--penuh'));
      kepala.append(hitung);
      if (!data.items.length) {
        kepala.append(el('p', 'asr-empty', 'Tidak ada urusan administrasi untuk penghuni asrama ini.'));
        wadah.append(kepala);
        return;
      }
      const ul = el('ul', 'rm-cases');
      data.items.forEach((item) => {
        const li = el('li', `rm-case is-${item.severity} is-${item.status}`);
        const atas = el('div', 'rm-case__top');
        atas.append(el('strong', '', item.studentName), lencana(LABEL_STATUS[item.status], `rm-chip--st-${item.status}`));
        if (item.daysLeft !== null && item.status !== 'selesai') {
          const lewat = item.daysLeft < 0;
          atas.append(lencana(lewat ? `Terlambat ${-item.daysLeft} hari` : item.daysLeft === 0 ? 'Hari ini' : `Sisa ${item.daysLeft} hari`, lewat || item.severity === 'tinggi' ? 'rm-chip--penuh' : 'rm-chip--sebagian'));
        }
        li.append(atas, el('p', 'rm-case__title', item.title), el('p', 'rm-room__meta', item.detail));
        if (item.recordedBy) li.append(el('p', 'rm-room__meta', `Dicatat ${item.recordedBy}`));
        ul.append(li);
      });
      kepala.append(ul);
      wadah.append(kepala);
    });
  }

  // ------------------------------------------------------------------ tab Laporan

  function unduhCsv(data) {
    const baris = [['Asrama', 'Kamar', 'Fasilitas', 'Kapasitas', 'Penghuni']];
    data.rooms.forEach((k) => {
      if (!k.occupants.length) baris.push([data.dormitory.name, k.name, k.hasAc ? 'AC' : 'Non-AC', k.capacity, '']);
      k.occupants.forEach((s) => baris.push([data.dormitory.name, k.name, k.hasAc ? 'AC' : 'Non-AC', k.capacity, s.name]));
    });
    data.unplaced.forEach((s) => baris.push([data.dormitory.name, '(belum berkamar)', '', '', s.name]));
    const teks = baris.map((b) => b.map((v) => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿', teks], { type: 'text/csv;charset=utf-8' });
    const tautan = el('a');
    tautan.href = URL.createObjectURL(blob);
    tautan.download = `penghuni-${data.dormitory.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    document.body.append(tautan);
    tautan.click();
    tautan.remove();
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
  }

  function laporan(ctx) {
    return panelMuat(ctx, `/api/asrama/${encodeURIComponent(ctx.dormitoryId)}/kamar`, (wadah, data) => {
      const bagian = el('section', 'mus-section asr-section');
      const tajuk = el('header', 'mus-section__head');
      tajuk.append(el('h3', 'mus-title', `Akses cepat ${data.dormitory.name}`), el('p', 'mus-note', 'Semua data di bawah hanya untuk asrama ini.'));
      bagian.append(tajuk);
      const grid = el('div', 'rm-links');
      const tautan = (teks, ket, aksi) => {
        const b = el('button', 'rm-link');
        b.type = 'button';
        b.append(el('strong', '', teks), el('span', '', ket));
        b.addEventListener('click', aksi);
        return b;
      };
      const ke = (alamat) => () => { window.location.href = alamat; };
      grid.append(
        tautan('Kamar dan penghuni', 'Kapasitas, AC, dan pemindahan', () => ctx.bukaTab('kamar')),
        tautan('Inventaris', 'Barang dan kondisinya', () => ctx.bukaTab('inventaris')),
        tautan('Galeri', 'Foto kegiatan asrama', () => ctx.bukaTab('galeri')),
        tautan('Absensi', 'Presensi sholat dan kegiatan', ke(`monitoring#presensi`)),
        tautan('Urusan administrasi', 'Paspor, iqamah, lapor diri', () => ctx.bukaTab('masalah')),
        tautan('Iqamah', 'Masa berlaku per santri', () => ctx.bukaTab('iqamah')),
        tautan('Unduh daftar penghuni', 'File CSV per kamar', () => unduhCsv(data))
      );
      bagian.append(grid);
      if (data.available) {
        const s = data.summary;
        bagian.append(el('p', 'mus-note', `${s.occupied} penghuni di ${s.rooms} kamar, sisa ${s.free} tempat${s.unplaced ? `, ${s.unplaced} santri belum berkamar` : ''}.`));
      }
      wadah.append(bagian);
    });
  }

  window.HamasahAsramaKamar = Object.freeze({ kamar, masalah, laporan });
}());
