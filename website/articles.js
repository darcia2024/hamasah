document.addEventListener('DOMContentLoaded', () => {
  const articlesGrid = document.querySelector('#articles-grid');
  const searchInput = document.querySelector('#article-search-input');
  const filterChips = document.querySelectorAll('#category-filter-chips .faq-question');

  let allArticles = [];
  let currentCategory = 'all';
  let currentSearchQuery = '';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }


  function renderCards(articles) {
    if (!articles || articles.length === 0) {
      articlesGrid.innerHTML = `
        <div class="empty-search-state">
          <div class="empty-icon" aria-hidden="true"><svg class="m3-icon" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></div>
          <h3>Tidak Ada Artikel yang Cocok</h3>
          <p>Coba gunakan kata kunci lain atau pilih kategori yang berbeda.</p>
          <button class="button button--secondary" type="button" id="btn-reset-filter">Tampilkan Semua Artikel</button>
        </div>
      `;
      const resetBtn = document.querySelector('#btn-reset-filter');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          currentCategory = 'all';
          currentSearchQuery = '';
          searchInput.value = '';
          filterChips.forEach((c) => {
            const active = c.dataset.category === 'all';
            c.classList.toggle('is-active', active);
          });
          filterAndRender();
        });
      }
      return;
    }

    const html = articles.map((a) => {
      const dateStr = a.publishedAt
        ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(a.publishedAt))
        : 'Tanggal belum tercatat';
      const category = a.category || 'Wawasan';

      return `
        <article class="article-catalog-card">
          <div class="card-top-row">
            <span class="m3-category-chip">${escapeHtml(category)}</span>
            <time class="article-card-date" datetime="${a.publishedAt || ''}">${dateStr}</time>
          </div>
          <h2 class="article-card-title">
            <a href="article.html?slug=${encodeURIComponent(a.slug)}">${escapeHtml(a.title)}</a>
          </h2>
          ${a.coverUrl ? `<img class="article-card-cover" src="${escapeHtml(a.coverUrl)}" alt="${escapeHtml(a.coverAltText || a.title || 'Cover artikel') }" loading="lazy" />` : `<div class="article-card-cover article-card-cover--empty" role="img" aria-label="Cover artikel tidak tersedia">Cover tidak tersedia</div>`}
          <p class="article-card-excerpt">${escapeHtml(a.excerpt || '')}</p>
          <div class="card-bottom-row">
            <div class="author-micro-badge">
              <span class="author-dot"></span>
              <span>${escapeHtml(a.authorName || 'Tim Redaksi Hamasah International')}</span>
            </div>
            <a class="article-read-link" href="article.html?slug=${encodeURIComponent(a.slug)}" aria-label="Baca artikel ${escapeHtml(a.title)}">
              <span>Baca Artikel</span>
              <span aria-hidden="true" class="btn-arrow"></span>
            </a>
          </div>
        </article>
      `;
    }).join('');

    articlesGrid.innerHTML = html;
    articlesGrid.querySelectorAll('.article-card-cover[src]').forEach((image) => {
      image.addEventListener('error', () => {
        const failed = document.createElement('div');
        failed.className = 'article-card-cover article-card-cover--empty';
        failed.setAttribute('role', 'img');
        failed.setAttribute('aria-label', 'Cover artikel tidak tersedia');
        failed.textContent = 'Cover tidak tersedia';
        image.replaceWith(failed);
      }, { once: true });
    });
  }

  // Pemilihan kategori dan pencarian dijalankan server; halaman dimuat 12 artikel sekali
  // jalan, dan "Muat lebih banyak" menambah halaman berikutnya (Task R6.2).
  const PAGE_SIZE = 12;
  let requestToken = 0;
  const moreWrap = document.createElement('div');
  moreWrap.className = 'articles-more';
  moreWrap.hidden = true;
  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'button button--secondary';
  moreButton.textContent = 'Muat lebih banyak';
  moreWrap.append(moreButton);
  articlesGrid.after(moreWrap);

  async function loadArticles({ append }) {
    const token = ++requestToken;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(append ? allArticles.length : 0) });
    if (currentCategory !== 'all') params.set('category', currentCategory);
    if (currentSearchQuery) params.set('search', currentSearchQuery);
    moreButton.disabled = true;
    try {
      const response = await fetch('/api/articles?' + params);
      if (!response.ok) throw new Error('Gagal memuat artikel.');
      const data = await response.json();
      // Permintaan yang sudah tertinggal oleh filter baru tidak boleh menimpa hasilnya.
      if (token !== requestToken) return;
      const items = Array.isArray(data.items) ? data.items : [];
      allArticles = append ? allArticles.concat(items) : items;
      renderCards(allArticles);
      moreWrap.hidden = allArticles.length >= (data.total || 0);
    } catch {
      if (token !== requestToken) return;
      if (!append) allArticles = [];
      renderCards(allArticles);
      moreWrap.hidden = true;
    } finally {
      moreButton.disabled = false;
    }
  }

  function filterAndRender() {
    return loadArticles({ append: false });
  }

  moreButton.addEventListener('click', () => loadArticles({ append: true }));
  filterAndRender();

  // Filter chips click
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentCategory = chip.dataset.category || 'all';
      filterAndRender();
    });
  });

  // Live search
  let searchTimer = null;
  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterAndRender, 250);
  });
});
