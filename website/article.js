// Isi artikel dirender server (server/article-page.js, Task R7.3), supaya crawler dan
// pratinjau tautan melihat judul dan isi yang sama dengan pembaca. Skrip ini hanya mengurus
// tombol bagikan dan cover yang gagal dimuat.
document.addEventListener('DOMContentLoaded', () => {
  const articleContent = document.querySelector('#article-content');
  const canonical = document.querySelector('link[rel="canonical"]');
  const pageUrl = () => (canonical && canonical.href) || window.location.href;

  const cover = articleContent && articleContent.querySelector('.article-cover[src]');
  if (cover) {
    // Sampul yang gagal dimuat dibuang beserta bingkainya, bukan diganti kotak kosong.
    const replaceCover = () => {
      const bingkai = cover.closest('figure');
      (bingkai || cover).remove();
    };
    if (cover.complete && cover.naturalWidth === 0) replaceCover();
    else cover.addEventListener('error', replaceCover, { once: true });
  }

  document.querySelectorAll('[data-share="wa"]').forEach((tombol) => {
    tombol.addEventListener('click', () => {
      const text = encodeURIComponent(`Baca wawasan resmi Al-Azhar di Pena Hamasah: ${document.title}\n${pageUrl()}`);
      window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
    });
  });

  document.querySelectorAll('[data-share="copy"]').forEach((tombol) => {
    const label = tombol.querySelector('[data-share-label]') || tombol;
    const asli = label.textContent;
    tombol.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pageUrl());
        label.textContent = 'Tautan disalin';
        setTimeout(() => { label.textContent = asli; }, 2500);
      } catch {
        alert('Tautan artikel: ' + pageUrl());
      }
    });
  });
});
