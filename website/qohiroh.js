'use strict';

// Halaman penawaran /qohiroh: pergantian peran di bagian Tampilan dan tombol WhatsApp.
// Isi NOMOR_WA (format 62812xxxxxxx, tanpa tanda plus) supaya tombol diskusi muncul.
// Selama kosong, tombolnya tersembunyi dan halaman memakai kalimat penutup biasa.

(function () {
  const NOMOR_WA = '';
  const PESAN_WA = 'Assalamu’alaikum. Saya dari Qohiroh Center, sudah membaca penawaran sistemnya dan ingin berdiskusi.';

  const nomor = NOMOR_WA.replace(/\D/g, '');
  if (nomor) {
    const alamat = `https://wa.me/${nomor}?text=${encodeURIComponent(PESAN_WA)}`;
    document.querySelectorAll('[data-wa]').forEach((a) => {
      a.hidden = false;
      a.href = alamat;
      a.target = '_blank';
      a.rel = 'noopener';
    });
    document.querySelectorAll('[data-nowa]').forEach((n) => { n.hidden = true; });
    const nav = document.getElementById('nav-aksi');
    nav.href = alamat;
    nav.target = '_blank';
    nav.rel = 'noopener';
    // Dengan kontak, ajakan diskusi jadi aksi utama dan melihat tampilan jadi aksi kedua.
    const lihat = document.getElementById('aksi-lihat');
    const hero = document.querySelector('.hero [data-wa]');
    if (lihat && hero) {
      lihat.classList.replace('btn--primary', 'btn--ghost');
      hero.classList.replace('btn--ghost', 'btn--primary');
    }
  }

  // Tab peran (WAI-ARIA): klik dan panah atas/bawah/kiri/kanan.
  const tabs = Array.from(document.querySelectorAll('.roles [role="tab"]'));
  const panes = Array.from(document.querySelectorAll('.tour__stage [role="tabpanel"]'));
  function show(index, focus) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    panes.forEach((pane, i) => { pane.hidden = i !== index; });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(i));
    tab.addEventListener('keydown', (event) => {
      const next = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      if (!next) return;
      event.preventDefault();
      show((i + next + tabs.length) % tabs.length, true);
    });
  });
})();
