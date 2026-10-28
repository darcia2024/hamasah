// Bagian tambahan portal wali (16 Oktober 2026 dan sesudahnya): status pendidikan dan administrasi,
// absensi per jenis kegiatan, rapor bulanan, dokumentasi asrama, dan formulir kritik, saran,
// apresiasi, serta keluhan privat. Dipakai beranda-wali.js. Semua data memakai API yang dibatasi
// server: wali hanya melihat anak yang ditautkan admin ke akunnya.
(function initWaliBagian() {
  const K = window.HamasahBerandaKeluarga;
  if (!K) return;
  const BULAN = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function bagian(judul, keterangan, kelas = '') {
    const wadah = el('section', `wali-section ${kelas}`.trim());
    const kepala = el('header', 'wali-section__head');
    kepala.append(el('h3', 'wali-section__title', judul));
    if (keterangan) kepala.append(el('p', 'wali-section__note', keterangan));
    wadah.append(kepala);
    return wadah;
  }

  function baris(label, nilai, nada = '') {
    const item = el('li', 'wali-fact');
    item.append(el('span', 'wali-fact__label', label), el('strong', `wali-fact__value ${nada ? `is-${nada}` : ''}`.trim(), nilai || '-'));
    return item;
  }

  function daftarFakta(butir) {
    const daftar = el('ul', 'wali-facts');
    butir.forEach(([label, nilai, nada]) => daftar.append(baris(label, nilai, nada)));
    return daftar;
  }

  const NADA_DOKUMEN = { aktif: 'baik', 'hampir-kedaluwarsa': 'cukup', kedaluwarsa: 'perlu', 'belum-dicatat': '' };
  const JENIS_URUSAN = { 'lapor-diri': 'Lapor diri', 'lapor-pendidikan': 'Lapor pendidikan', 'status-pendidikan': 'Status pendidikan' };
  const STATUS_URUSAN = { baru: 'Belum diurus', proses: 'Sedang diurus', menunggu: 'Menunggu' };

  function tanggalPendek(teks) {
    return teks ? K.tanggal(`${teks}T00:00:00Z`) : '-';
  }

  // ------------------------------------------------------------ Pendidikan dan administrasi
  function kartuPendidikan(profil, izin) {
    const wadah = bagian('Pendidikan dan administrasi', 'Status belajar, dokumen tinggal, dan urusan yang sedang diurus musyrif untuk ananda.');
    if (!profil || profil.available === false) {
      wadah.append(el('p', 'wali-empty', 'Data pendidikan dan administrasi ananda belum dapat ditampilkan.'));
      return wadah;
    }
    const e = profil.education || {};
    wadah.append(el('h4', 'wali-subtitle', 'Pendidikan'));
    wadah.append(daftarFakta([
      ['Program', e.program],
      ['Status pendidikan', e.statusLabel || 'Belum dicatat', e.status ? '' : ''],
      ['Kampus / lembaga', e.institution],
      ['Jurusan', e.major],
      ['Tahun studi', e.studyYear ? `Tahun ke-${e.studyYear}` : '']
    ]));
    if (e.note) wadah.append(el('p', 'wali-note-text', e.note));

    wadah.append(el('h4', 'wali-subtitle', 'Dokumen tinggal'));
    const paspor = profil.passport || {};
    const iqamah = profil.iqamah || {};
    wadah.append(daftarFakta([
      ['Paspor', `${paspor.label || 'Belum dicatat'}${paspor.expiresOn ? ` · berlaku sampai ${tanggalPendek(paspor.expiresOn)}` : ''}`, NADA_DOKUMEN[paspor.state]],
      ['Iqamah / visa', `${iqamah.label || 'Belum dicatat'}${iqamah.expiresOn ? ` · berlaku sampai ${tanggalPendek(iqamah.expiresOn)}` : ''}`, NADA_DOKUMEN[iqamah.state]]
    ]));

    wadah.append(el('h4', 'wali-subtitle', 'Urusan yang sedang diurus'));
    const kasus = profil.administrativeCases || [];
    if (!kasus.length) wadah.append(el('p', 'wali-empty', 'Tidak ada urusan administrasi yang tertunda.'));
    else {
      const daftar = el('ul', 'wali-mini-list');
      kasus.forEach((k) => {
        const item = el('li');
        item.append(el('span', '', `${JENIS_URUSAN[k.kind] || k.kind}${k.dueOn ? ` · tenggat ${tanggalPendek(k.dueOn)}` : ''}`), el('strong', 'wali-grade is-kurang', STATUS_URUSAN[k.status] || k.status));
        daftar.append(item);
      });
      wadah.append(daftar);
    }

    const p = profil.placement || {};
    wadah.append(el('h4', 'wali-subtitle', 'Tempat tinggal'));
    wadah.append(daftarFakta([
      ['Asrama', p.dormitory ? p.dormitory.name : 'Belum ditempatkan'],
      ['Kamar', p.room ? p.room.name : ''],
      ['Musyrif', (p.supervisors || []).join(', ')]
    ]));

    const aktif = (izin || []).filter((i) => i.status === 'menunggu' || (i.status === 'disetujui' && !i.returnedAt)).slice(0, 3);
    if (aktif.length) {
      wadah.append(el('h4', 'wali-subtitle', 'Izin ananda'));
      const daftar = el('ul', 'wali-mini-list');
      aktif.forEach((i) => {
        const item = el('li');
        item.append(el('span', '', `${i.kindLabel || i.kind || 'Izin'} · ${i.reason || ''}`.trim()), el('strong', 'wali-grade', i.status === 'menunggu' ? 'Menunggu' : 'Disetujui'));
        daftar.append(item);
      });
      wadah.append(daftar);
    }
    return wadah;
  }

  // ------------------------------------------------------------ Absensi per jenis kegiatan
  // Mengelompokkan catatan kehadiran menurut kategori (sekolah, halaqah, kajian, dan lainnya).
  function kartuAbsensiJenis(data) {
    const wadah = bagian('Absensi per kegiatan', 'Sekolah atau kampus, halaqah, kajian, dan kegiatan lain dalam 30 hari terakhir.');
    const entri = (data.dashboard && data.dashboard.attendance && data.dashboard.attendance.entries) || [];
    if (!entri.length) {
      wadah.append(el('p', 'wali-empty', 'Belum ada absensi yang dicatat dalam 30 hari terakhir.'));
      return wadah;
    }
    const kelompok = new Map();
    entri.forEach((e) => {
      const nama = e.category || 'Kegiatan asrama';
      const v = kelompok.get(nama) || { total: 0, hadir: 0, telat: 0, izin: 0, alpa: 0 };
      v.total += 1;
      if (e.status === 'present') v.hadir += 1;
      else if (e.status === 'late') { v.hadir += 1; v.telat += 1; }
      else if (e.status === 'excused') v.izin += 1;
      else v.alpa += 1;
      kelompok.set(nama, v);
    });
    const daftar = el('ul', 'wali-bars');
    [...kelompok.entries()].sort((a, b) => b[1].total - a[1].total).forEach(([nama, v]) => {
      const persen = Math.round((v.hadir / v.total) * 100);
      const item = el('li', 'wali-bars__row wali-bars__row--wide');
      const batang = el('span', 'wali-bars__track');
      const isi = el('span', `wali-bars__fill ${persen >= 85 ? 'is-baik' : persen < 70 ? 'is-perlu' : ''}`.trim());
      isi.style.width = `${persen}%`;
      batang.append(isi);
      const rincian = [v.telat ? `${v.telat} terlambat` : null, v.izin ? `${v.izin} izin` : null, v.alpa ? `${v.alpa} tidak hadir` : null].filter(Boolean).join(', ');
      item.append(el('span', 'wali-bars__label', nama), batang, el('strong', 'wali-bars__value', `${v.hadir}/${v.total}`));
      if (rincian) item.append(el('span', 'wali-bars__detail', rincian));
      daftar.append(item);
    });
    wadah.append(daftar);
    return wadah;
  }

  // ------------------------------------------------------------ Rapor bulanan
  function enamBulan() {
    const kini = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const awal = new Date(Date.UTC(kini.getUTCFullYear(), kini.getUTCMonth() - i, 1));
      const akhir = new Date(Date.UTC(awal.getUTCFullYear(), awal.getUTCMonth() + 1, 0));
      const iso = (d) => d.toISOString().slice(0, 10);
      return { label: BULAN.format(awal), from: iso(awal), to: iso(akhir) };
    });
  }

  function kartuRapor(student, headers) {
    const wadah = bagian('Rapor bulanan', 'Unduh rapor PDF ananda: kehadiran, hafalan, ibadah, dan catatan pembina.');
    const bulan = enamBulan();
    const label = el('label', 'wali-field__label', 'Pilih bulan');
    const pilih = el('select', 'wali-field');
    pilih.id = `wali-rapor-${student.id}`;
    label.htmlFor = pilih.id;
    bulan.forEach((b, i) => pilih.append(new Option(b.label, String(i))));
    const status = el('p', 'form-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const tombol = el('button', 'button button--primary wali-action', 'Unduh rapor');
    tombol.type = 'button';
    tombol.addEventListener('click', async () => {
      const b = bulan[Number(pilih.value)];
      tombol.disabled = true;
      status.textContent = 'Menyiapkan rapor...';
      status.classList.remove('is-error');
      try {
        const respons = await fetch(`/api/students/${encodeURIComponent(student.id)}/report.pdf?from=${b.from}&to=${b.to}`, { headers });
        if (!respons.ok) throw new Error('Rapor belum dapat disiapkan. Coba lagi sebentar lagi.');
        const url = URL.createObjectURL(await respons.blob());
        const tautan = document.createElement('a');
        tautan.href = url;
        tautan.download = `rapor-${student.name.replace(/[^\w]+/g, '-').toLowerCase()}-${b.from.slice(0, 7)}.pdf`;
        document.body.append(tautan);
        tautan.click();
        tautan.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = `Rapor ${b.label} diunduh.`;
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('is-error');
      } finally {
        tombol.disabled = false;
      }
    });
    wadah.append(label, pilih, tombol, status);
    return wadah;
  }

  // ------------------------------------------------------------ Dokumentasi asrama
  function kartuDokumentasi(jadwal, studentId, headers) {
    const G = window.HamasahGaleri;
    const asrama = jadwal && Array.isArray(jadwal.dormitories) && jadwal.dormitories.find((d) => d.students.some((s) => String(s.id) === String(studentId)));
    const foto = (asrama && asrama.gallery) || [];
    if (!G || !foto.length) return null;
    const wadah = bagian('Dokumentasi asrama', `Foto kegiatan ${asrama.name || 'asrama'}. Ketuk foto untuk melihat besar.`);
    wadah.append(G.grid(foto, { headers, batas: foto.length > 5 ? 4 : 5 }));
    return wadah;
  }

  // ------------------------------------------------------------ Kritik, saran, apresiasi, keluhan
  const PETUNJUK = {
    kritik: 'Sampaikan hal yang menurut Bapak/Ibu perlu diperbaiki.',
    saran: 'Usulan agar layanan Hamasah makin baik.',
    apresiasi: 'Ungkapan terima kasih untuk musyrif, asatidz, atau tim.',
    keluhan: 'Bersifat privat: hanya admin Hamasah yang membacanya, musyrif tidak.'
  };

  function kartuMasukan(students, aktifId, headers) {
    const wadah = bagian('Kritik, saran, apresiasi, dan keluhan', 'Kirim langsung ke Hamasah. Keluhan dijaga privat dan hanya dibaca admin.', 'wali-feedback');
    const form = el('form', 'wali-form');
    form.noValidate = true;
    const unik = `wali-fb-${Math.random().toString(36).slice(2, 7)}`;

    function medan(label, kontrol, petunjuk) {
      const blok = el('div', 'wali-form__row');
      const l = el('label', 'wali-field__label', label);
      kontrol.id = `${unik}-${label.replace(/\W+/g, '')}`;
      l.htmlFor = kontrol.id;
      blok.append(l, kontrol);
      if (petunjuk) blok.append(el('p', 'wali-field__hint', petunjuk));
      return blok;
    }

    const jenis = el('select', 'wali-field');
    [['saran', 'Saran'], ['kritik', 'Kritik'], ['apresiasi', 'Apresiasi'], ['keluhan', 'Keluhan (privat)']].forEach(([v, t]) => jenis.append(new Option(t, v)));
    const petunjuk = el('p', 'wali-field__hint', PETUNJUK.saran);
    jenis.addEventListener('change', () => { petunjuk.textContent = PETUNJUK[jenis.value]; });
    const blokJenis = medan('Jenis masukan', jenis);
    blokJenis.append(petunjuk);

    const anak = el('select', 'wali-field');
    anak.append(new Option('Umum (tidak tentang ananda tertentu)', ''));
    students.forEach((s) => anak.append(new Option(s.name, s.id)));
    anak.value = aktifId;
    const judul = el('input', 'wali-field');
    judul.type = 'text';
    judul.maxLength = 120;
    judul.autocomplete = 'off';
    const isi = el('textarea', 'wali-field');
    isi.rows = 5;
    isi.maxLength = 2000;

    const status = el('p', 'form-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const kirim = el('button', 'button button--primary wali-action', 'Kirim masukan');
    kirim.type = 'submit';
    form.append(blokJenis, medan('Tentang ananda', anak), medan('Judul singkat', judul), medan('Isi masukan', isi, 'Minimal 10 karakter, maksimal 2000.'), kirim, status);

    const riwayat = el('div', 'wali-feedback__history');

    function gambarRiwayat(data) {
      riwayat.replaceChildren(el('h4', 'wali-subtitle', 'Masukan yang pernah Bapak/Ibu kirim'));
      if (!data || data.available === false) {
        riwayat.append(el('p', 'wali-empty', 'Fitur ini belum aktif. Hubungi admin Hamasah.'));
        return;
      }
      if (!data.items.length) {
        riwayat.append(el('p', 'wali-empty', 'Belum ada masukan yang dikirim.'));
        return;
      }
      const daftar = el('ul', 'wali-notes');
      data.items.forEach((m) => {
        const item = el('li', `wali-note is-${m.status === 'ditindaklanjuti' ? 'baik' : 'catatan'}`);
        const meta = el('div', 'wali-note__meta');
        meta.append(el('span', 'wali-note__kind', m.kindLabel), el('span', '', `${K.tanggal(m.createdAt)} · ${m.statusLabel}`));
        item.append(meta, el('p', 'wali-note__body', m.subject), el('p', 'wali-note__body', m.body));
        if (m.reply) item.append(el('p', 'wali-note__reply', `Balasan Hamasah: ${m.reply}`));
        daftar.append(item);
      });
      riwayat.append(daftar);
    }

    async function muat() {
      gambarRiwayat(await K.ambil(`/api/masukan/saya?t=${Date.now()}`, headers));
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.classList.remove('is-error');
      if (judul.value.trim().length < 3) { status.textContent = 'Judul minimal 3 karakter.'; status.classList.add('is-error'); judul.focus(); return; }
      if (isi.value.trim().length < 10) { status.textContent = 'Isi masukan minimal 10 karakter.'; status.classList.add('is-error'); isi.focus(); return; }
      kirim.disabled = true;
      status.textContent = 'Mengirim...';
      try {
        const respons = await fetch('/api/masukan', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: jenis.value, subject: judul.value, body: isi.value, studentId: anak.value || undefined })
        });
        const hasil = await respons.json().catch(() => ({}));
        if (!respons.ok) throw new Error(hasil.error || 'Masukan belum terkirim. Coba lagi.');
        status.textContent = jenis.value === 'keluhan' ? 'Keluhan terkirim dan hanya akan dibaca admin. Terima kasih.' : 'Masukan terkirim. Terima kasih.';
        judul.value = '';
        isi.value = '';
        await muat();
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('is-error');
      } finally {
        kirim.disabled = false;
      }
    });

    wadah.append(form, riwayat);
    muat();
    return wadah;
  }

  window.HamasahWaliBagian = Object.freeze({ kartuPendidikan, kartuAbsensiJenis, kartuRapor, kartuDokumentasi, kartuMasukan });
}());
