// Isi artikel dirender server (server/article-page.js, Task R7.3), supaya crawler dan
// pratinjau tautan melihat judul dan isi yang sama dengan pembaca. Skrip ini hanya mengurus
// tombol bagikan dan cover yang gagal dimuat.
document.addEventListener('DOMContentLoaded', () => {
  const articleContent = document.querySelector('#article-content');
  const btnShareWa = document.querySelector('#btn-share-wa');
  const btnCopyUrl = document.querySelector('#btn-copy-url');
  const canonical = document.querySelector('link[rel="canonical"]');
  const pageUrl = () => (canonical && canonical.href) || window.location.href;

  const cover = articleContent && articleContent.querySelector('.article-cover[src]');
  if (cover) {
    const replaceCover = () => {
      const failed = document.createElement('div');
      failed.className = 'article-cover article-cover--empty';
      failed.setAttribute('role', 'img');
      failed.setAttribute('aria-label', 'Cover artikel tidak tersedia');
      failed.textContent = 'Cover tidak tersedia';
      cover.replaceWith(failed);
    };
    if (cover.complete && cover.naturalWidth === 0) replaceCover();
    else cover.addEventListener('error', replaceCover, { once: true });
  }

  if (btnShareWa) {
    btnShareWa.addEventListener('click', () => {
      const text = encodeURIComponent(`Baca wawasan resmi Al-Azhar di Pena Hamasah: ${document.title}\n${pageUrl()}`);
      window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
    });
  }

  if (btnCopyUrl) {
    btnCopyUrl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pageUrl());
        const originalText = btnCopyUrl.innerHTML;
        btnCopyUrl.innerHTML = '<span>Tautan Disalin!</span> <span aria-hidden="true"><svg class="m3-icon m3-icon--sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>';
        setTimeout(() => { btnCopyUrl.innerHTML = originalText; }, 2500);
      } catch {
        alert('Tautan artikel: ' + pageUrl());
      }
    });
  }
});
