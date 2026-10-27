'use strict';

// Notulen rapat (/rapat): daftar isi yang mengikuti bacaan, pencarian modul, penyaring keputusan,
// dan centang tindak lanjut. Isi halaman sudah lengkap tanpa skrip ini; skrip hanya menambah kemudahan.
// Centang disimpan di peramban ini saja (localStorage), tidak dikirim ke mana pun.

(function () {
  const KUNCI = 'hamasahRapat20261027';
  const baca = () => { try { return JSON.parse(localStorage.getItem(KUNCI)) || {}; } catch { return {}; } };
  const tulis = (data) => { try { localStorage.setItem(KUNCI, JSON.stringify(data)); } catch { /* boleh gagal */ } };
  const simpan = baca();

  const $ = (id) => document.getElementById(id);

  // Tombol cetak.
  const cetak = $('cetak');
  if (cetak) cetak.addEventListener('click', () => window.print());

  // Daftar isi: tandai bagian yang sedang dibaca.
  const tautan = Array.from(document.querySelectorAll('#toc a'));
  const target = tautan.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  if ('IntersectionObserver' in window && target.length) {
    const terlihat = new Set();
    const pilih = () => {
      const urut = target.filter((el) => terlihat.has(el.id));
      const aktif = urut.length ? urut[0].id : null;
      tautan.forEach((a) => a.classList.toggle('is-on', aktif !== null && a.getAttribute('href') === `#${aktif}`));
    };
    const pengamat = new IntersectionObserver((entri) => {
      entri.forEach((e) => { if (e.isIntersecting) terlihat.add(e.target.id); else terlihat.delete(e.target.id); });
      pilih();
    }, { rootMargin: '-80px 0px -60% 0px' });
    target.forEach((el) => pengamat.observe(el));
  }

  // Pencarian modul: menyaring artikel dan menandai kata yang cocok.
  const kolomCari = $('cari-modul');
  const hasilCari = $('cari-hasil');
  const kosongCari = $('cari-kosong');
  const modul = Array.from(document.querySelectorAll('.modul'));
  modul.forEach((m) => m.querySelectorAll('.butir li').forEach((li) => { li.dataset.asli = li.textContent; }));

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
      const judul = m.querySelector('h3').textContent.toLowerCase();
      let ada = kata ? judul.includes(kata) : true;
      m.querySelectorAll('.butir li').forEach((li) => { if (tandai(li, kata)) ada = true; });
      m.classList.toggle('is-sembunyi', !ada);
      if (ada) cocok += 1;
    });
    hasilCari.textContent = kata ? `${cocok} dari ${modul.length} modul memuat “${kolomCari.value.trim()}”.` : '';
    kosongCari.hidden = cocok > 0;
  }
  if (kolomCari) kolomCari.addEventListener('input', cari);

  // Keputusan: saring menurut pemilik dan centang yang sudah dijawab.
  const baris = Array.from(document.querySelectorAll('#tabel-putusan tbody tr'));
  const chip = Array.from(document.querySelectorAll('#saring .chip'));
  const hitungPutusan = $('hitung-putusan');
  let pemilik = 'semua';

  function segarkanPutusan() {
    let tampil = 0;
    let selesai = 0;
    baris.forEach((tr) => {
      const cek = tr.querySelector('input');
      tr.classList.toggle('is-selesai', cek.checked);
      if (cek.checked) selesai += 1;
      const cocok = pemilik === 'semua' || tr.dataset.pemilik.split('|').includes(pemilik);
      tr.classList.toggle('is-sembunyi', !cocok);
      if (cocok) tampil += 1;
    });
    hitungPutusan.textContent = `Menampilkan ${tampil} dari ${baris.length} keputusan. ${selesai} sudah dijawab.`;
  }

  baris.forEach((tr) => {
    const cek = tr.querySelector('input');
    cek.checked = Boolean(simpan[tr.dataset.id]);
    cek.addEventListener('change', () => {
      const data = baca();
      if (cek.checked) data[tr.dataset.id] = true; else delete data[tr.dataset.id];
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

  // Rencana aksi.
  const aksi = Array.from(document.querySelectorAll('#daftar-aksi input'));
  const hitungAksi = $('hitung-aksi');
  function segarkanAksi() {
    const selesai = aksi.filter((a) => a.checked).length;
    hitungAksi.textContent = `${selesai} dari ${aksi.length} aksi selesai.`;
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
})();
