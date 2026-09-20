document.addEventListener('DOMContentLoaded', () => {
  const articleContent = document.querySelector('#article-content');
  const breadcrumbTitle = document.querySelector('#breadcrumb-current-title');
  const btnShareWa = document.querySelector('#btn-share-wa');
  const btnCopyUrl = document.querySelector('#btn-copy-url');

  const slug = new URLSearchParams(window.location.search).get('slug');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }


  function renderArticle(article) {
    const rawTitle = String(article.title || 'Artikel Hamasah');
    const category = escapeHtml(article.category || 'Pena Hamasah');
    const title = escapeHtml(rawTitle);
    const dateStr = article.publishedAt
      ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(article.publishedAt))
      : 'September 2026';

    document.title = `${rawTitle} | Hamasah International`;
    if (breadcrumbTitle) breadcrumbTitle.textContent = title;

    const wordsCount = (article.body || '').split(/\s+/).length;
    const readingMinutes = Math.max(1, Math.round(wordsCount / 180));

    const paragraphsHtml = (article.body || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');

    const html = `
      <div class="article-header">
        ${article.coverUrl ? `<img class="article-cover" src="${escapeHtml(article.coverUrl)}" alt="${escapeHtml(article.coverAltText || rawTitle)}" />` : `<div class="article-cover article-cover--empty" role="img" aria-label="Cover artikel tidak tersedia">Cover tidak tersedia</div>`}
        <div class="article-meta-tags">
          <span class="m3-category-chip">${category}</span>
          <span class="article-reading-time"><svg class="m3-icon m3-icon--sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${readingMinutes} Menit Baca</span>
        </div>
        <h1 class="article-headline">${title}</h1>
        <div class="article-byline">
          <div class="author-avatar" aria-hidden="true">H</div>
          <div class="author-info">
            <strong>Tim Redaksi Hamasah International</strong>
            <small>Kairo, Mesir · Diterbitkan pada ${dateStr}</small>
          </div>
        </div>
      </div>

      <div class="article-lead-box">
        <p class="article-lead-text">${escapeHtml(article.excerpt || '')}</p>
      </div>

      <div class="article-prose">
        ${paragraphsHtml}
      </div>

      <div class="article-signature">
        <p><strong>Pena Hamasah Kairo</strong>, media literasi, panduan studi, dan kabar berkah dari bumi para nabi.</p>
      </div>
    `;

    articleContent.innerHTML = html;
    const cover = articleContent.querySelector('.article-cover[src]');
    if (cover) cover.addEventListener('error', () => {
      const failed = document.createElement('div');
      failed.className = 'article-cover article-cover--empty';
      failed.setAttribute('role', 'img');
      failed.setAttribute('aria-label', 'Cover artikel tidak tersedia');
      failed.textContent = 'Cover tidak tersedia';
      cover.replaceWith(failed);
    }, { once: true });
  }

  // Setup Share Buttons
  if (btnShareWa) {
    btnShareWa.addEventListener('click', () => {
      const pageUrl = window.location.href;
      const text = encodeURIComponent(`Baca wawasan resmi Al-Azhar di Pena Hamasah: ${document.title}\n${pageUrl}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    });
  }

  if (btnCopyUrl) {
    btnCopyUrl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const originalText = btnCopyUrl.innerHTML;
        btnCopyUrl.innerHTML = '<span>Tautan Disalin!</span> <span aria-hidden="true"><svg class="m3-icon m3-icon--sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>';
        setTimeout(() => { btnCopyUrl.innerHTML = originalText; }, 2500);
      } catch {
        alert('Tautan artikel: ' + window.location.href);
      }
    });
  }

  // Load article
  if (!slug) {
    articleContent.innerHTML = `
      <div class="article-error-state">
        <p class="eyebrow">Pena Hamasah</p>
        <h1>Artikel Tidak Ditemukan</h1>
        <p>Silakan kembali ke daftar artikel untuk memilih bacaan lainnya.</p>
        <a class="button button--primary" href="articles.html">Lihat Semua Artikel</a>
      </div>
    `;
    if (breadcrumbTitle) breadcrumbTitle.textContent = 'Tidak Ditemukan';
    return;
  }

  fetch(`/api/articles/${encodeURIComponent(slug)}`)
    .then((res) => res.ok ? res.json() : Promise.reject(new Error('Artikel tidak ditemukan di server.')))
    .then((data) => {
      if (data && data.item) {
        renderArticle(data.item);
      } else {
        throw new Error('Data artikel kosong.');
      }
    })
    .catch((err) => {
      {
        articleContent.innerHTML = `
          <div class="article-error-state">
            <p class="eyebrow">Pena Hamasah</p>
            <h1>Artikel Belum Tersedia</h1>
            <p>${err.message}</p>
            <a class="button button--secondary" href="articles.html">Kembali ke Katalog Artikel</a>
          </div>
        `;
        if (breadcrumbTitle) breadcrumbTitle.textContent = 'Belum Tersedia';
      }
    });
});
