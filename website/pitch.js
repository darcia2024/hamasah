'use strict';

// Halaman pitch (/pitch): pembaruan setelah rapat pimpinan. Skrip ini hanya untuk gerak masuk, angka yang menghitung
// naik, dan penanda menu yang sedang dibaca; isi halamannya semua ada di pitch.html.

(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  // ---- Masuk saat terlihat. Bagian yang sudah dekat layar tetap muncul bila observer tidak jalan.
  const reveal = Array.from(document.querySelectorAll('[data-reveal]'));
  if (!reduce && 'IntersectionObserver' in window) {
    root.classList.add('is-anim');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
    reveal.forEach((el) => io.observe(el));
    window.setTimeout(() => {
      reveal.forEach((el) => { if (el.getBoundingClientRect().top < window.innerHeight * 1.5) el.classList.add('is-in'); });
    }, 2500);
  }

  // ---- Angka yang menghitung naik.
  function countUp(el) {
    const target = Number(el.getAttribute('data-count'));
    if (reduce || Number.isNaN(target)) return;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 1100);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    const counters = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        counters.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-count]').forEach((el) => counters.observe(el));

    // Tautan nav yang sesuai bagian yang sedang dibaca.
    const links = Array.from(document.querySelectorAll('.links a'));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    links.forEach((a) => { const target = document.querySelector(a.getAttribute('href')); if (target) spy.observe(target); });
  }
})();
