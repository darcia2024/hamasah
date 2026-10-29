// Testimoni wali sebagai carousel geser (scroll-snap): tanpa putar otomatis, supaya cerita panjang bisa dibaca dengan tenang
// dan nyaman bagi pembaca layar. Kartu tetap berisi markup dari Konten Website; skrip ini hanya menambah tombol dan penanda.
(function initTestimoniCarousel() {
  const daftar = document.querySelector('.lp-testimonials');
  if (!daftar) return;
  const kartu = [...daftar.querySelectorAll(':scope > .lp-testi')];
  if (kartu.length < 2) return;

  daftar.classList.add('is-carousel');
  if (kartu.length > 3) daftar.classList.add('is-carousel--banyak');
  daftar.setAttribute('tabindex', '0');
  daftar.setAttribute('role', 'group');
  daftar.setAttribute('aria-roledescription', 'carousel');
  daftar.setAttribute('aria-label', 'Testimoni wali santri');
  kartu.forEach((k, i) => { k.setAttribute('role', 'group'); k.setAttribute('aria-roledescription', 'slide'); k.setAttribute('aria-label', `${i + 1} dari ${kartu.length}`); });

  const kontrol = document.createElement('div');
  kontrol.className = 'lp-carousel__controls';
  const tombol = (teks, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'lp-carousel__btn'; b.textContent = teks; b.setAttribute('aria-label', label); return b; };
  const sebelum = tombol('‹', 'Testimoni sebelumnya');
  const sesudah = tombol('›', 'Testimoni berikutnya');
  const penanda = document.createElement('span');
  penanda.className = 'lp-carousel__count';
  penanda.setAttribute('aria-live', 'polite');
  kontrol.append(sebelum, penanda, sesudah);
  daftar.after(kontrol);

  const langkah = () => (kartu[1].offsetLeft - kartu[0].offsetLeft) || daftar.clientWidth;
  const aktif = () => Math.min(kartu.length - 1, Math.max(0, Math.round(daftar.scrollLeft / Math.max(1, langkah()))));
  const hemat = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function perbarui() {
    const bisaGeser = daftar.scrollWidth > daftar.clientWidth + 4;
    kontrol.hidden = !bisaGeser;
    const i = aktif();
    penanda.textContent = `${i + 1} dari ${kartu.length}`;
    sebelum.disabled = daftar.scrollLeft <= 2;
    sesudah.disabled = daftar.scrollLeft + daftar.clientWidth >= daftar.scrollWidth - 2;
  }

  const geser = (arah) => daftar.scrollBy({ left: arah * langkah(), behavior: hemat ? 'auto' : 'smooth' });
  sebelum.addEventListener('click', () => geser(-1));
  sesudah.addEventListener('click', () => geser(1));
  daftar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); geser(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); geser(-1); }
  });
  let tunda = 0;
  daftar.addEventListener('scroll', () => { window.clearTimeout(tunda); tunda = window.setTimeout(perbarui, 60); }, { passive: true });
  window.addEventListener('resize', perbarui);
  perbarui();
}());