document.addEventListener('DOMContentLoaded', () => {
  const articleContent = document.querySelector('#article-content');
  const breadcrumbTitle = document.querySelector('#breadcrumb-current-title');
  const btnShareWa = document.querySelector('#btn-share-wa');
  const btnCopyUrl = document.querySelector('#btn-copy-url');

  const slug = new URLSearchParams(window.location.search).get('slug');

  const FALLBACK_ARTICLES = {
    'pendampingan-santri-di-kairo': {
      slug: 'pendampingan-santri-di-kairo',
      title: 'Pendampingan Santri Indonesia di Kairo',
      category: 'Kegiatan Santri',
      publishedAt: '2026-09-01T08:00:00.000Z',
      excerpt: 'Catatan kegiatan dan pendampingan awal santri dalam menyesuaikan ritme belajar, halaqah talaqqi, dan kehidupan asrama di Mesir.',
      body: `Hamasah International mendampingi santri sejak persiapan keberangkatan di tanah air hingga penyesuaian awal di Kairo, Mesir.

Menuntut ilmu di Universitas Al-Azhar menuntut kesiapan akademik dan mental yang matang. Di Kairo, santri dibimbing langsung oleh para musyrif mukim dalam halaqah talaqqi harian di Rawaq Al-Azhar, evaluasi bacaan Al-Qur'an (tahfidz), dan pembiasaan bahasa Arab fusha.

Asrama Hamasah yang berlokasi di Hay Asyir dirancang sebagai lingkungan yang aman, bersih, dan berfasilitas lengkap seperti kamar tidur ber-AC, katering menu khas Indonesia 3 kali sehari, serta koneksi internet untuk mudzakarah.

Orang tua dan wali santri di Indonesia dapat memantau kehadiran sholat Subuh berjamaah, nilai ujian talaqqi, serta catatan adab ananda secara real-time melalui Portal Keluarga Hamasah.`
    },
    'sekilas-tentang-universitas-al-azhar': {
      slug: 'sekilas-tentang-universitas-al-azhar',
      title: 'Sekilas Tentang Universitas Al-Azhar Kairo & Tradisi Keilmuannya',
      category: 'Keilmuan Islam',
      publishedAt: '2026-08-25T08:00:00.000Z',
      excerpt: 'Mengenal kampus tertua di dunia yang menjaga sanad keilmuan Islam wasathiyyah serta menjadi rujukan para ulama mancanegara.',
      body: `Didirikan lebih dari seribu tahun yang lalu, Universitas Al-Azhar di Kairo, Mesir, adalah mercusuar peradaban Islam yang tidak pernah padam.

Metode pembelajaran di Al-Azhar menggabungkan dua pilar utama: sistem perkuliahan formal di fakultas dan tradisi talaqqi bersanad di masjid agung Al-Azhar bersama para kibar masyayikh.

Karakteristik keilmuan Al-Azhar berakar kuat pada manhaj wasathiyyah (moderasi Islam): mengedepankan akidah Ahlussunnah wal Jama'ah (Asy'ariyyah & Maturidiyyah), mendalami empat mazhab fiqih mu'tabar, serta menghidupkan tasawuf yang lurus.

Hamasah International hadir memastikan setiap calon penuntut ilmu dari nusantara mendapatkan arahan kurikulum yang tepat, pendampingan bahasa, serta pembinaan adab thalabul ilmi sejak dini.`
    },
    'persiapan-bahasa-arab-tahdid-mustawa': {
      slug: 'persiapan-bahasa-arab-tahdid-mustawa',
      title: 'Kunci Sukses Ujian Bahasa Arab (Tahdid Mustawa) di Markaz Syaikh Zaid',
      category: 'Panduan Hidup',
      publishedAt: '2026-08-18T08:00:00.000Z',
      excerpt: 'Panduan menyeluruh menghadapi tes penempatan bahasa, jenjang mustawa, serta tips latihan mendengar dan percakapan fusha.',
      body: `Ujian Tahdid Mustawa adalah tes penempatan tingkat kemahiran bahasa Arab resmi yang wajib diikuti oleh calon mahasiswa asing sebelum memulai kuliah sarjana di Universitas Al-Azhar.

Ujian ini diselenggarakan oleh Markaz Syaikh Zaid li Ta'limil Lughah Al-Arabiyyah dan mencakup empat kemahiran: istima' (mendengar), qira'ah (membaca), kitabah (menulis), dan qawa'id (nahwu-sharaf).

Terdapat enam tingkatan mustawa utama: Mubtadi (Awal), Mutawasith (Menengah), hingga Mutaqaddim (Mahir).

Program pembekalan intensif bahasa di Hamasah melatih santri mengerjakan model-model soal resmi, membiasakan percakapan fusha sehari-hari, dan memperkuat hafalan mufradat turats agar santri siap meraih level tertinggi.`
    }
  };

  function renderArticle(article) {
    const category = article.category || 'Pena Hamasah';
    const title = article.title;
    const dateStr = article.publishedAt
      ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(article.publishedAt))
      : 'September 2026';

    document.title = `${title} | Hamasah International`;
    if (breadcrumbTitle) breadcrumbTitle.textContent = title;

    const wordsCount = (article.body || '').split(/\s+/).length;
    const readingMinutes = Math.max(1, Math.round(wordsCount / 180));

    const paragraphsHtml = (article.body || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${p.trim()}</p>`)
      .join('');

    const html = `
      <div class="article-header">
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
        <p class="article-lead-text">${article.excerpt || ''}</p>
      </div>

      <div class="article-prose">
        ${paragraphsHtml}
      </div>

      <div class="article-signature">
        <p><strong>Pena Hamasah Kairo</strong> — Media literasi, panduan studi, dan kabar berkah dari bumi para nabi.</p>
      </div>
    `;

    articleContent.innerHTML = html;
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
        <a class="button button--primary" href="articles.html">Lihat Semua Artikel ↗</a>
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
      // Fallback check
      if (FALLBACK_ARTICLES[slug]) {
        renderArticle(FALLBACK_ARTICLES[slug]);
      } else {
        articleContent.innerHTML = `
          <div class="article-error-state">
            <p class="eyebrow">Pena Hamasah</p>
            <h1>Artikel Belum Tersedia</h1>
            <p>${err.message}</p>
            <a class="button button--secondary" href="articles.html">← Kembali ke Katalog Artikel</a>
          </div>
        `;
        if (breadcrumbTitle) breadcrumbTitle.textContent = 'Belum Tersedia';
      }
    });
});
