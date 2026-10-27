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
  // Tab Info / PRD. PRD adalah teks statis di halaman, skrip hanya berpindah tampilan.
  const tabbar = $('tabbar');
  const tabInfo = $('tab-info');
  const tabPrd = $('tab-report');
  const panelInfo = $('panel-info');
  const panelPrd = $('panel-report');
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
    if (prd) window.scrollTo(0, 0);

  }
  tabInfo.addEventListener('click', () => tampil('info'));
  tabPrd.addEventListener('click', () => tampil('prd'));
  [tabInfo, tabPrd].forEach((t) => t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const ke = t === tabInfo ? tabPrd : tabInfo; ke.focus(); ke.click(); }
  }));
  tabbar.hidden = false;
  if (location.hash === '#prd' || location.hash === '#report') tampil('prd');
})();