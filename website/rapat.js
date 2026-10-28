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
  // Tab Info / Report / PRD. Report dihitung dari isi tab Info; PRD teks statis di halaman.
  const tabbar = $('tabbar');
  const tab = { info: $('tab-info'), report: $('tab-report'), prd: $('tab-prd') };
  const panel = { info: $('panel-info'), report: $('panel-report'), prd: $('panel-prd') };
  let gambarReport = () => {};

  function tampil(nama) {
    Object.keys(tab).forEach((k) => {
      const on = k === nama;
      panel[k].hidden = !on;
      tab[k].classList.toggle('is-on', on);
      tab[k].setAttribute('aria-selected', String(on));
      tab[k].tabIndex = on ? 0 : -1;
    });
    $('menu').hidden = nama !== 'info';
    document.body.classList.toggle('lihat-report', nama === 'report');
    if (nama === 'report') gambarReport();
    if (nama !== 'info') window.scrollTo(0, 0);
  }
  const urut = Object.keys(tab);
  urut.forEach((k, i) => {
    tab[k].addEventListener('click', () => tampil(k));
    tab[k].addEventListener('keydown', (e) => {
      const arah = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!arah) return;
      const ke = tab[urut[(i + arah + urut.length) % urut.length]];
      ke.focus();
      ke.click();
    });
  });

  {  const el = (tag, kelas, teks) => {
    const n = document.createElement(tag);
    if (kelas) n.className = kelas;
    if (teks !== undefined) n.textContent = teks;
    return n;
  };
  const angkaID = (n) => String(n);

  const kelompok = Array.from(document.querySelectorAll('.grup')).map((g) => ({
    nama: g.querySelector('.grup__kepala h3').textContent,
    modul: Array.from(g.querySelectorAll('.mod')).map((m) => ({
      no: m.querySelector('.mod__no').textContent,
      nama: m.querySelector('h4').textContent,
      id: m.id,
      poin: m.querySelectorAll('.butir li').length,
      cek: m.querySelectorAll('.mod__awas li').length,
    })),
  }));
  kelompok.forEach((k) => {
    k.poin = k.modul.reduce((a, m) => a + m.poin, 0);
    k.cek = k.modul.reduce((a, m) => a + m.cek, 0);
  });
  const semuaModul = kelompok.flatMap((k) => k.modul.map((m) => ({ ...m, kelompok: k.nama })));
  const totalPoin = semuaModul.reduce((a, m) => a + m.poin, 0);
  const totalCek = semuaModul.reduce((a, m) => a + m.cek, 0);

  let pilihKelompok = -1; // -1 = semua
  let hanyaCek = false;

  function sel(teks, kelas) { return el('td', kelas, teks); }
  function barisTabel(sel1, sel2, sel3, sel4, total, bar) {
    const tr = el('tr', total ? 'is-total' : '');
    const th = el('th', '', sel1);
    th.scope = 'row';
    if (bar !== undefined) {
      const b = el('span', 'lap__bar');
      b.append(el('i', `l${Math.round(bar * 10)}`));
      th.append(b);
    }
    tr.append(th, sel(sel2, 'num'), sel(sel3, 'num'), sel(sel4, 'num'));
    return tr;
  }
  function tabel(kepala, isi) {
    const t = el('table', 'lap__t');
    const h = el('thead');
    const hr = el('tr');
    kepala.forEach((k, i) => { const th = el('th', i ? 'num' : '', k); th.scope = 'col'; hr.append(th); });
    h.append(hr);
    const b = el('tbody');
    isi.forEach((r) => b.append(r));
    t.append(h, b);
    return t;
  }

  function gambarAngka() {
    const jawab = baris.filter((li) => li.querySelector('input').checked).length;
    const data = [
      [baris.length - jawab, 'Keputusan menunggu', `${jawab} dari ${baris.length} sudah dijawab`],
      [semuaModul.length, 'Modul dibahas', `${kelompok.length} kelompok`],
      [totalCek, 'Catatan perlu dicek', `di ${semuaModul.filter((m) => m.cek).length} modul`],
    ];
    const dl = $('lap-angka');
    dl.textContent = '';
    data.forEach(([n, label, ket]) => {
      const d = el('div', 'lap__a');
      const dd = el('dd', 'lap__n', angkaID(n));
      d.append(el('dt', 'lap__l', label), dd, el('p', 'lap__k', ket));
      dl.append(d);
    });
  }

  function gambarStrip() {
    const strip = $('lap-strip');
    strip.textContent = '';
    const sel0 = [...kelompok.map((k) => ({ nama: k.nama, n: k.modul.length })), { nama: 'Total', n: semuaModul.length }];
    sel0.forEach((s, i) => {
      const idx = i === kelompok.length ? -1 : i;
      const b = el('button', 'lap__hari');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(pilihKelompok === idx));
      if (pilihKelompok === idx) b.classList.add('is-on');
      b.append(el('span', 'lap__hari-n', s.nama), el('strong', 'lap__hari-v', `${s.n} modul`));
      b.addEventListener('click', () => { pilihKelompok = idx; gambarStrip(); gambarEntri(); });
      strip.append(b);
    });
  }

  function gambarEntri() {
    const ul = $('lap-entri');
    ul.textContent = '';
    const daftar = semuaModul.filter((m) => (pilihKelompok < 0 || m.kelompok === kelompok[pilihKelompok].nama) && (!hanyaCek || m.cek));
    daftar.forEach((m) => {
      const li = el('li', 'lap__e');
      const a = el('a', 'lap__e-tautan');
      a.href = `#${m.id}`;
      a.append(el('span', 'lap__e-no', m.no));
      const teks = el('span', 'lap__e-teks');
      teks.append(el('strong', '', m.nama), el('span', 'lap__e-sub', m.kelompok));
      a.append(teks);
      if (m.cek) a.append(el('span', 'lap__tag', `${m.cek} perlu dicek`));
      a.append(el('span', 'lap__e-v', `${m.poin} poin`));
      a.addEventListener('click', () => { tampil('info'); });
      li.append(a);
      ul.append(li);
    });
    $('lap-kosong').hidden = daftar.length > 0;
  }

  function gambarTabel() {
    const maks = Math.max(...kelompok.map((k) => k.poin));
    const isi = kelompok.map((k) => barisTabel(k.nama, String(k.modul.length), String(k.poin), String(k.cek), false, k.poin / maks));
    isi.push(barisTabel('Total', String(semuaModul.length), String(totalPoin), String(totalCek), true));
    const r = $('lap-rincian');
    r.textContent = '';
    r.append(tabel(['Kelompok', 'Modul', 'Poin', 'Perlu dicek'], isi));

    const nama = chip.map((c) => c.dataset.pemilik).filter((p) => p !== 'semua');
    const maksP = Math.max(...nama.map((p) => baris.filter((li) => li.dataset.pemilik.split('|').includes(p)).length));
    const isiP = nama.map((p) => {
      const milik = baris.filter((li) => li.dataset.pemilik.split('|').includes(p));
      const jawab = milik.filter((li) => li.querySelector('input').checked).length;
      return barisTabel(p, String(milik.length), String(jawab), String(milik.length - jawab), false, milik.length / maksP);
    });
    const jawabSemua = baris.filter((li) => li.querySelector('input').checked).length;
    isiP.push(barisTabel('Keputusan unik', String(baris.length), String(jawabSemua), String(baris.length - jawabSemua), true));
    const p = $('lap-pemilik');
    p.textContent = '';
    p.append(tabel(['Pemilik', 'Keputusan', 'Dijawab', 'Menunggu'], isiP));
  }

  function gambarLaporan() { gambarAngka(); gambarStrip(); gambarEntri(); gambarTabel(); }
    gambarReport = gambarLaporan;
    document.querySelectorAll('[data-lap]').forEach((b) => b.addEventListener('click', () => {
      hanyaCek = b.dataset.lap === 'awas';
      document.querySelectorAll('[data-lap]').forEach((x) => x.classList.toggle('is-on', x === b));
      gambarEntri();
    }));
  }

  tabbar.hidden = false;
  if (location.hash === '#report') tampil('report');
  else if (location.hash === '#prd') tampil('prd');
})();