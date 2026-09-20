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

  const FALLBACK_ARTICLES = [
    {
      slug: 'pendampingan-santri-di-kairo',
      title: 'Pendampingan Santri Indonesia di Kairo',
      excerpt: 'Catatan kegiatan dan pendampingan awal santri dalam menyesuaikan ritme belajar, halaqah talaqqi, dan kehidupan asrama di Mesir.',
      category: 'Kegiatan',
      publishedAt: '2026-09-01T08:00:00.000Z'
    },
    {
      slug: 'sekilas-tentang-universitas-al-azhar',
      title: 'Sekilas Tentang Universitas Al-Azhar Kairo & Tradisi Keilmuannya',
      excerpt: 'Mengenal kampus tertua di dunia yang menjaga sanad keilmuan Islam wasathiyyah serta menjadi rujukan para ulama mancanegara.',
      category: 'Keilmuan Islam',
      publishedAt: '2026-08-25T08:00:00.000Z'
    },
    {
      slug: 'persiapan-bahasa-arab-tahdid-mustawa',
      title: 'Kunci Sukses Ujian Bahasa Arab (Tahdid Mustawa) di Markaz Syaikh Zaid',
      excerpt: 'Panduan menyeluruh menghadapi tes penempatan bahasa, jenjang mustawa, serta tips latihan mendengar dan percakapan fusha.',
      category: 'Panduan Hidup',
      publishedAt: '2026-08-18T08:00:00.000Z'
    },
    {
      slug: 'kehidupan-asrama-hay-asyir-kairo',
      title: 'Mengenal Asrama Hamasah di Hay Asyir, Kairo: Aman, Kondusif & Berkah',
      excerpt: 'Menengok fasilitas kamar ber-AC, katering menu nusantara, jadwal sholat berjamaah, dan pendampingan musyrif 24 jam.',
      category: 'Kegiatan',
      publishedAt: '2026-08-10T08:00:00.000Z'
    },
    {
      slug: 'alur-lengkap-legalisasi-berkas-ke-mesir',
      title: 'Alur Lengkap Legalisasi Berkas & Visa Pelajar Mesir 2026',
      excerpt: 'Langkah pengurusan ijazah di Kemenag, Kemenkumham, Kemlu, serta Kedutaan Besar Republik Arab Mesir di Jakarta.',
      category: 'Keberangkatan',
      publishedAt: '2026-08-02T08:00:00.000Z'
    }
  ];

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
        : 'September 2026';
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
          <p class="article-card-excerpt">${escapeHtml(a.excerpt || '')}</p>
          <div class="card-bottom-row">
            <div class="author-micro-badge">
              <span class="author-dot"></span>
              <span>Tim Hamasah Kairo</span>
            </div>
            <a class="article-read-link" href="article.html?slug=${encodeURIComponent(a.slug)}" aria-label="Baca artikel ${escapeHtml(a.title)}">
              <span>Baca Artikel</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </article>
      `;
    }).join('');

    articlesGrid.innerHTML = html;
  }

  function filterAndRender() {
    let filtered = allArticles.slice();

    if (currentCategory !== 'all') {
      filtered = filtered.filter((a) => (a.category || '').toLowerCase() === currentCategory.toLowerCase());
    }

    if (currentSearchQuery) {
      const q = currentSearchQuery.toLowerCase();
      filtered = filtered.filter((a) => {
        const titleMatch = (a.title || '').toLowerCase().includes(q);
        const excerptMatch = (a.excerpt || '').toLowerCase().includes(q);
        return titleMatch || excerptMatch;
      });
    }

    renderCards(filtered);
  }

  // Fetch articles from API
  fetch('/api/articles')
    .then((res) => res.ok ? res.json() : Promise.reject(new Error('Gagal memuat artikel.')))
    .then((data) => {
      if (Array.isArray(data.items) && data.items.length > 0) {
        // Merge API articles with fallback to ensure rich catalog
        const slugs = new Set(data.items.map((i) => i.slug));
        const extra = FALLBACK_ARTICLES.filter((f) => !slugs.has(f.slug));
        allArticles = [...data.items, ...extra];
      } else {
        allArticles = FALLBACK_ARTICLES;
      }
      filterAndRender();
    })
    .catch(() => {
      allArticles = FALLBACK_ARTICLES;
      filterAndRender();
    });

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
  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    filterAndRender();
  });
});
