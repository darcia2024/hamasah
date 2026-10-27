'use strict';

// Hasil rapat (/rapat): menu bagian yang mengikuti bacaan, pencarian modul, penyaring keputusan, dan
// centang tindak lanjut. Isi halaman sudah lengkap tanpa skrip ini; skrip hanya menambah kemudahan.
// Centang disimpan di peramban ini saja (localStorage), tidak dikirim ke mana pun.

(function () {
  const KUNCI = 'hamasahRapat20261027';
  const baca = () => { try { return JSON.parse(localStorage.getItem(KUNCI)) || {}; } catch { return {}; } };
  const tulis = (data) => { try { localStorage.setItem(KUNCI, JSON.stringify(data)); } catch { /* boleh gagal */ } };
  const simpan = baca();
  const $ = (id) => document.getElementById(id);

  // Cetak: buka semua rincian dulu, lalu kembalikan seperti semula.
  const rincian = Array.from(document.querySelectorAll('.mod__rinci'));
  let dibukaSebelumCetak = [];
  window.addEventListener('beforeprint', () => { dibukaSebelumCetak = rincian.map((d) => d.open); rincian.forEach((d) => { d.open = true; }); });
  window.addEventListener('afterprint', () => { rincian.forEach((d, i) => { d.open = dibukaSebelumCetak[i]; }); });
  $('cetak').addEventListener('click', () => window.print());

  // Menu atas: tandai bagian yang sedang dibaca.
  const tautan = Array.from(document.querySelectorAll('#menu a'));
  const target = tautan.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  if ('IntersectionObserver' in window && target.length) {
    const terlihat = new Set();
    const pilih = () => {
      const urut = target.filter((el) => terlihat.has(el.id));
      const aktif = urut.length ? urut[urut.length - 1].id : null;
      tautan.forEach((a) => a.classList.toggle('is-on', aktif !== null && a.getAttribute('href') === `#${aktif}`));
    };
    const pengamat = new IntersectionObserver((entri) => {
      entri.forEach((e) => { if (e.isIntersecting) terlihat.add(e.target.id); else terlihat.delete(e.target.id); });
      pilih();
    }, { rootMargin: '-80px 0px -55% 0px' });
    target.forEach((el) => pengamat.observe(el));
  }

  // Buka atau tutup semua rincian modul.
  $('buka-semua').addEventListener('click', () => rincian.forEach((d) => { d.open = true; }));
  $('tutup-semua').addEventListener('click', () => rincian.forEach((d) => { d.open = false; }));

  // Pencarian: menyaring kartu modul dan menandai kata yang cocok di rincian dan kotak merah.
  const kolomCari = $('cari-modul');
  const hasilCari = $('cari-hasil');
  const kosongCari = $('cari-kosong');
  const modul = Array.from(document.querySelectorAll('.mod'));
  const butirTeks = Array.from(document.querySelectorAll('.butir li, .mod__awas li'));
  butirTeks.forEach((li) => { li.dataset.asli = li.textContent; });

  function tandai(li, kata) {
    const asli = li.dataset.asli;
    li.textContent = '';
    if (!kata) { li.textContent = asli; return false; }
    const huruf = asli.toLowerCase();
    let dari = 0;
    let ada = false;
    for (let i = huruf.indexOf(kata); i !== -1; i = huruf.indexOf(kata, dari)) {
      li.append(document.createTextNode(asli.slice(dari, i)));
      const m = document.createElement('mark');
      m.textContent = asli.slice(i, i + kata.length);
      li.append(m);
      dari = i + kata.length;
      ada = true;
    }
    li.append(document.createTextNode(asli.slice(dari)));
    return ada;
  }

  function cari() {
    const kata = kolomCari.value.trim().toLowerCase();
    let cocok = 0;
    modul.forEach((m) => {
      const judul = `${m.querySelector('h4').textContent} ${m.querySelector('.mod__ringkas').textContent}`.toLowerCase();
      let ada = kata ? judul.includes(kata) : true;
      let adaDiRinci = false;
      m.querySelectorAll('.butir li, .mod__awas li').forEach((li) => {
        const kena = tandai(li, kata);
        if (kena) { ada = true; if (li.closest('.butir')) adaDiRinci = true; }
      });
      m.classList.toggle('is-sembunyi', !ada);
      const d = m.querySelector('.mod__rinci');
      if (kata && adaDiRinci) d.open = true;
      if (ada) cocok += 1;
    });
    hasilCari.textContent = kata ? `${cocok} dari ${modul.length} modul memuat “${kolomCari.value.trim()}”.` : '';
    kosongCari.hidden = cocok > 0;
  }
  kolomCari.addEventListener('input', cari);

  // Keputusan: saring menurut pemilik, centang yang sudah dijawab.
  const baris = Array.from(document.querySelectorAll('#daftar-putusan li'));
  const chip = Array.from(document.querySelectorAll('#saring .chip'));
  const hitungPutusan = $('hitung-putusan');
  let pemilik = 'semua';

  function segarkanPutusan() {
    let tampil = 0;
    let selesai = 0;
    baris.forEach((li) => {
      const cek = li.querySelector('input');
      li.classList.toggle('is-selesai', cek.checked);
      if (cek.checked) selesai += 1;
      const cocok = pemilik === 'semua' || li.dataset.pemilik.split('|').includes(pemilik);
      li.classList.toggle('is-sembunyi', !cocok);
      if (cocok) tampil += 1;
    });
    hitungPutusan.textContent = `Menampilkan ${tampil} dari ${baris.length} keputusan. ${selesai} sudah dijawab.`;
  }
  baris.forEach((li) => {
    const cek = li.querySelector('input');
    cek.checked = Boolean(simpan[li.dataset.id]);
    cek.addEventListener('change', () => {
      const data = baca();
      if (cek.checked) data[li.dataset.id] = true; else delete data[li.dataset.id];
      tulis(data);
      segarkanPutusan();
    });
  });
  chip.forEach((c) => c.addEventListener('click', () => {
    pemilik = c.dataset.pemilik;
    chip.forEach((x) => x.classList.toggle('is-on', x === c));
    segarkanPutusan();
  }));
  segarkanPutusan();

  // Langkah berikutnya.
  const aksi = Array.from(document.querySelectorAll('#daftar-aksi input'));
  const hitungAksi = $('hitung-aksi');
  function segarkanAksi() {
    hitungAksi.textContent = `${aksi.filter((a) => a.checked).length} dari ${aksi.length} langkah selesai.`;
  }
  aksi.forEach((a) => {
    a.checked = Boolean(simpan[a.dataset.aksi]);
    a.addEventListener('change', () => {
      const data = baca();
      if (a.checked) data[a.dataset.aksi] = true; else delete data[a.dataset.aksi];
      tulis(data);
      segarkanAksi();
    });
  });
  segarkanAksi();
  // Tampilan PRD: dokumen persyaratan produk yang disusun dari isi tab Info, jadi tidak ada angka atau teks ganda untuk dirawat.
  const tabbar = $('tabbar');
  const tabInfo = $('tab-info');
  const tabPrd = $('tab-report');
  const panelInfo = $('panel-info');
  const panelPrd = $('panel-report');
  const el = (tag, kelas, teks) => {
    const n = document.createElement(tag);
    if (kelas) n.className = kelas;
    if (teks !== undefined) n.textContent = teks;
    return n;
  };
  const teks = (akar, sel) => { const n = akar.querySelector(sel); return n ? n.textContent.trim() : ''; };
  const tabel = (kepala, isi, kelas) => {
    const t = el('table', `prd__t ${kelas || ''}`.trim());
    const h = el('thead');
    const hr = el('tr');
    kepala.forEach((k) => { const th = el('th', '', k); th.scope = 'col'; hr.append(th); });
    h.append(hr);
    const b = el('tbody');
    isi.forEach((baris2) => {
      const tr = el('tr');
      baris2.forEach((s, i) => {
        const sel = el(i === 0 ? 'th' : 'td');
        if (i === 0) sel.scope = 'row';
        if (s instanceof Node) sel.append(s); else sel.textContent = s;
        tr.append(sel);
      });
      b.append(tr);
    });
    t.append(h, b);
    const bungkus = el('div', 'prd__tabel');
    bungkus.append(t);
    return bungkus;
  };
  const daftar = (butir, kelas) => { const ul = el('ul', kelas || 'prd__ul'); butir.forEach((b) => ul.append(el('li', '', b))); return ul; };
  const label = (t, jenis) => el('span', `prd__lb prd__lb--${jenis}`, t);

  function susunPrd() {
    const akar = $('prd');
    if (akar.dataset.siap) return;
    akar.dataset.siap = '1';
    const toc = [];
    let no = 0;
    const bagian = (judul, id) => {
      no += 1;
      const s = el('section', 'prd__bagian');
      s.id = id;
      const h = el('h2', '', `${no}. ${judul}`);
      s.append(h);
      toc.push([`${no}. ${judul}`, id]);
      akar.append(s);
      return s;
    };
    const isiKartu = Array.from(document.querySelectorAll('.intisari__kartu'));

    // Kepala dokumen
    const kepala = el('header', 'prd__kepala');
    kepala.append(el('p', 'prd__kicker', 'Product Requirements Document'), el('h1', '', 'Platform Hamasah International'));
    kepala.append(tabel(['Keterangan', 'Isi'], [
      ['Status', 'Draf versi kerja 1.0, menunggu koreksi fakta dan persetujuan prioritas'],
      ['Sumber', 'Notulen rapat 27 Oktober 2026'],
      ['Pembaca', 'Tim Hamasah dan tim pengembang'],
      ['Batasan', 'Rangkuman ucapan di rapat, bukan hasil audit kode. “Sudah didemokan” belum berarti sudah lolos uji.'],
    ], 'prd__t--meta'));
    akar.append(kepala);

    // 1. Ringkasan
    let s = bagian('Ringkasan', 'prd-ringkasan');
    s.append(el('p', '', teks(isiKartu[0], 'p')));
    s.append(el('p', '', teks(isiKartu[1], 'p')));

    // 2. Tujuan dan di luar lingkup
    s = bagian('Tujuan dan di luar lingkup', 'prd-tujuan');
    s.append(el('h3', '', 'Tujuan'));
    s.append(daftar([
      'Satu platform untuk santri, asrama, musyrif, pembinaan, laporan wali, administrasi, inventaris, dan LMS.',
      'Unit Mesir dan Indonesia berada di satu sistem, dengan akses dan laporan dipisah per lokasi.',
      'Data nyata (sekitar 108 santri) masuk lewat impor, dan tiap peran hanya melihat data yang menjadi haknya.',
    ]));
    s.append(el('h3', '', 'Di luar lingkup'));
    s.append(daftar([
      'Pembayaran dan kelas berbayar tetap di layanan masing-masing, dengan opsi disambungkan.',
      'Booklet kompetisi dan konten promosi dikerjakan sebagai proyek desain terpisah (lihat bagian 8).',
      'Ruang lingkup AI, editorial lanjutan, dan otomasi tambahan disetujui terpisah (tahap P4).',
    ]));

    // 3. Pengguna dan peran
    s = bagian('Pengguna dan peran', 'prd-peran');
    s.append(tabel(['Peran', 'Akses menurut notulen'], [
      ['Admin', 'Boleh lebih dari satu. Mengelola data, akun, pengumuman, dokumen, dan audit hak akses.'],
      ['Musyrif dan musyrifah', 'Hanya melihat santri dan asrama yang menjadi tanggung jawabnya.'],
      ['Santri', 'Portal LMS, laporan, progres hafalan, dan catatan pembinaan pribadi yang tidak otomatis terlihat wali.'],
      ['Wali', 'Portal anak: profil, absensi, tahfidz, rapor, tagihan (bila terintegrasi), galeri, pengumuman. Satu wali bisa tertaut ke beberapa anak setelah relasinya diverifikasi.'],
      ['Petugas', 'Akun untuk tugas operasional, dengan hak akses diaudit.'],
    ]));

    // 4. Persyaratan fungsional
    s = bagian('Persyaratan fungsional', 'prd-fr');
    s.append(el('p', 'prd__catatan', 'Nomor modul mengikuti notulen (2.1 sampai 2.13). Persyaratan ditulis dari poin rincian tiap modul. Butir yang belum pasti dikaitkan ke keputusan di bagian 7.'));
    document.querySelectorAll('.grup').forEach((g) => {
      s.append(el('h3', 'prd__grup', teks(g, '.grup__kepala h3')));
      g.querySelectorAll('.mod').forEach((m) => {
        const no2 = teks(m, '.mod__no');
        const kotak = el('div', 'prd__mod');
        kotak.id = `prd-m${no2.replace('.', '-')}`;
        const h = el('h4', '');
        h.append(el('span', 'prd__id', `FR-${no2}`), document.createTextNode(` ${teks(m, 'h4')}`));
        kotak.append(h, el('p', 'prd__desk', teks(m, '.mod__ringkas')));
        const butir = Array.from(m.querySelectorAll('.butir li'));
        if (butir.length) {
          const ol = el('ol', 'prd__req');
          butir.forEach((b, k) => {
            const li = el('li');
            li.append(el('span', 'prd__rid', `${no2}.${k + 1}`), el('span', '', (b.dataset.asli || b.textContent).trim()));
            ol.append(li);
          });
          kotak.append(ol);
        }
        const awas = Array.from(m.querySelectorAll('.mod__awas li'));
        if (awas.length) {
          const q = el('div', 'prd__tanya');
          q.append(el('strong', '', 'Pertanyaan terbuka'));
          const ul = el('ul');
          awas.forEach((a) => {
            const li = el('li');
            li.append(document.createTextNode((a.dataset.asli || a.textContent).trim()));
            if (a.dataset.ref) li.append(label(a.dataset.ref, 'ref'));
            ul.append(li);
          });
          q.append(ul);
          kotak.append(q);
        }
        s.append(kotak);
      });
    });

    // 5. Klasifikasi perubahan
    s = bagian('Klasifikasi pekerjaan', 'prd-klasifikasi');
    s.append(el('p', '', 'Pekerjaan dipilah supaya revisi bug tidak tercampur dengan permintaan baru.'));
    s.append(tabel(['Golongan', 'Contoh', 'Perlakuan'], Array.from(document.querySelectorAll('.batas__kartu')).map((k) => [
      teks(k, 'h4'), teks(k, '.batas__contoh'), teks(k, 'p:last-child').replace(/^Perlakuan:\s*/, ''),
    ])));

    // 6. Fase rilis
    s = bagian('Fase rilis', 'prd-fase');
    s.append(tabel(['Fase', 'Cakupan', 'Kriteria selesai'], Array.from(document.querySelectorAll('.tahap__kartu')).map((k) => {
      const dd = k.querySelectorAll('dd');
      const nama = el('span');
      nama.append(el('strong', '', teks(k, '.tahap__kode')), document.createTextNode(` ${teks(k, 'h3')}`));
      const isi = el('span');
      isi.append(document.createTextNode(dd[0].textContent.trim()));
      return [nama, isi, dd[1].textContent.trim()];
    })));
    s.append(el('p', 'prd__catatan', 'Estimasi waktu dan biaya menyusul setelah audit kode dan database yang ada.'));

    // 7. Keputusan terbuka
    s = bagian('Keputusan terbuka', 'prd-keputusan');
    const jawab = (li) => li.querySelector('input').checked;
    s.append(el('p', '', 'Belum ada komitmen final untuk butir di bawah sebelum dijawab pemiliknya. Status mengikuti centang di tab Info (disimpan di perangkat ini).'));
    s.append(tabel(['ID', 'Keputusan', 'Pemilik', 'Status'], baris.map((li) => [
      li.dataset.id, teks(li, '.putusan__isi'), teks(li, '.putusan__pemilik'), label(jawab(li) ? 'Dijawab' : 'Terbuka', jawab(li) ? 'ok' : 'buka'),
    ])));

    // 8. Proyek terpisah
    s = bagian('Proyek terpisah: booklet kompetisi dan takrim', 'prd-booklet');
    s.append(el('p', '', document.querySelector('#booklet .kepala__sub').textContent.trim()));
    const rinci = Array.from(document.querySelectorAll('#booklet .tanggal')).map((t) => [teks(t, 'span'), `${teks(t, 'strong')}. ${teks(t, 'small')}`])
      .concat(Array.from(document.querySelectorAll('#booklet .rinci > div')).map((d) => [teks(d, 'dt'), teks(d, 'dd')]));
    s.append(tabel(['Butir', 'Keterangan'], rinci));
    s.append(el('h3', '', 'Dibutuhkan lebih dulu'));
    s.append(daftar(Array.from(document.querySelectorAll('.butuh__daftar li')).map((x) => x.textContent.trim())));

    // 9. Langkah berikutnya
    s = bagian('Langkah berikutnya', 'prd-langkah');
    const ol = el('ol', 'prd__ul prd__ul--no');
    Array.from(document.querySelectorAll('#daftar-aksi li')).forEach((li) => ol.append(el('li', '', teks(li, '.aksi__isi'))));
    s.append(ol);

    // 10. Risiko dan catatan
    s = bagian('Risiko dan catatan', 'prd-risiko');
    s.append(el('p', '', teks(document.querySelector('.hati'), 'p')));

    // Daftar isi
    const nav = el('nav', 'prd__toc');
    nav.setAttribute('aria-label', 'Daftar isi PRD');
    nav.append(el('strong', '', 'Isi dokumen'));
    toc.forEach(([t, id]) => { const a = el('a', '', t); a.href = `#${id}`; nav.append(a); });
    akar.prepend(nav);
  }

  function tampil(nama) {
    const prd = nama === 'prd';
    panelInfo.hidden = prd;
    panelPrd.hidden = !prd;
    $('menu').hidden = prd;
    document.body.classList.toggle('lihat-report', prd);
    tabInfo.classList.toggle('is-on', !prd);
    tabPrd.classList.toggle('is-on', prd);
    tabInfo.setAttribute('aria-selected', String(!prd));
    tabPrd.setAttribute('aria-selected', String(prd));
    tabInfo.tabIndex = prd ? -1 : 0;
    tabPrd.tabIndex = prd ? 0 : -1;
    if (prd) {
      const akar = $('prd');
      akar.querySelectorAll('.prd__bagian,.prd__toc,.prd__kepala').forEach((n) => n.remove());
      delete akar.dataset.siap;
      susunPrd();
      window.scrollTo(0, 0);
    }
  }
  tabInfo.addEventListener('click', () => tampil('info'));
  tabPrd.addEventListener('click', () => tampil('prd'));
  [tabInfo, tabPrd].forEach((t) => t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const ke = t === tabInfo ? tabPrd : tabInfo; ke.focus(); ke.click(); }
  }));
  tabbar.hidden = false;
  if (location.hash === '#prd' || location.hash === '#report') tampil('prd');
})();