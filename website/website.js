// Jawaban tiap pertanyaan tertulis di halaman (#faq-sources), supaya bisa diubah admin dari
// halaman Konten Website tanpa mengubah skrip ini.
const questionButtons = document.querySelectorAll('.faq-question');
const answerPanel = document.querySelector('#faq-answer');
const answerSources = document.querySelector('#faq-sources');

function renderAnswer(topic, title, text) {
  const topicElement = document.createElement('p');
  topicElement.className = 'faq-answer__topic';
  topicElement.textContent = topic;
  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  const textElement = document.createElement('p');
  textElement.textContent = text;
  answerPanel.replaceChildren(topicElement, titleElement, textElement);
}

questionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const source = answerSources && answerSources.querySelector(`[data-answer="${button.dataset.answer}"]`);
    if (!source) return;
    questionButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    answerPanel.replaceChildren(...[...source.children].map((node) => node.cloneNode(true)));
    tautkanHalaman(answerPanel);
  });
});

// Jawaban disunting admin sebagai teks polos. Sebutan "halaman Biaya & fasilitas" dijadikan
// tautan di sini, supaya pembaca bisa langsung membuka rinciannya.
function tautkanHalaman(panel) {
  panel.querySelectorAll('p').forEach((paragraf) => {
    const frasa = 'Biaya & fasilitas';
    const node = [...paragraf.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.includes(`halaman ${frasa}`));
    if (!node) return;
    const awal = node.textContent.indexOf(`halaman ${frasa}`) + 'halaman '.length;
    const sisa = node.splitText(awal);
    sisa.splitText(frasa.length);
    const tautan = document.createElement('a');
    tautan.href = 'biaya.html';
    tautan.textContent = frasa;
    sisa.replaceWith(tautan);
  });
}

const faqForm = document.querySelector('#faq-form');
const faqInput = document.querySelector('#faq-question-input');
const faqFormStatus = document.querySelector('#faq-form-status');

faqForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  faqFormStatus.textContent = '';
  try {
    const response = await fetch('/api/faq/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: faqInput.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pertanyaan belum dapat diproses.');
    renderAnswer(result.label || 'Perlu konfirmasi', result.matched ? 'Jawaban otomatis' : 'Belum bisa dijawab otomatis', result.answer);
    // Jawaban kata kunci bisa meleset, jadi selalu ada jalan ke admin.
    const followUp = document.createElement('p');
    followUp.className = 'faq-answer__handoff';
    const link = document.createElement('a');
    const nomorWa = document.querySelector('meta[name="hamasah-whatsapp"]');
    link.href = `https://wa.me/${(nomorWa && nomorWa.content) || '6281288489997'}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Tanya admin lewat WhatsApp';
    followUp.append('Jawaban ini dipilih otomatis dari informasi umum. Kurang pas? ', link);
    answerPanel.append(followUp);
  } catch (error) {
    faqFormStatus.textContent = error.message || 'Layanan pertanyaan belum dapat dihubungi.';
  }
});

const journalList = document.querySelector('#journal-list');

// Pena Hamasah di beranda: artikel pertama tampil besar dengan sampul, tiga berikutnya
// sebagai daftar bersampul kecil. Tiap butir memuat kategori, tanggal, judul, dan ajakan
// "Baca artikel", supaya jelas bahwa ini tulisan yang bisa dibuka.
const tanggalArtikel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

function renderArticles(items) {
  const fragment = document.createDocumentFragment();
  items.slice(0, 4).forEach((article, index) => {
    const utama = index === 0;
    const item = document.createElement('a');
    item.className = utama ? 'pena-item pena-item--utama' : 'pena-item';
    item.href = `article.html?slug=${encodeURIComponent(article.slug)}`;

    if (article.coverUrl) {
      const cover = document.createElement('img');
      cover.className = 'pena-item__cover';
      cover.src = article.coverUrl;
      cover.alt = '';
      cover.loading = 'lazy';
      cover.decoding = 'async';
      cover.addEventListener('error', () => cover.remove());
      item.append(cover);
    }

    const body = document.createElement('span');
    body.className = 'pena-item__body';
    const meta = document.createElement('span');
    meta.className = 'pena-item__meta';
    const tanggal = article.publishedAt ? new Date(article.publishedAt) : null;
    const bagianMeta = [article.category];
    if (tanggal && !Number.isNaN(tanggal.getTime())) bagianMeta.push(tanggalArtikel.format(tanggal));
    meta.textContent = bagianMeta.filter(Boolean).join(' · ');
    const title = document.createElement('strong');
    title.className = 'pena-item__title';
    title.textContent = article.title;
    body.append(meta, title);
    if (utama && article.excerpt) {
      const excerpt = document.createElement('span');
      excerpt.className = 'pena-item__excerpt';
      excerpt.textContent = article.excerpt;
      body.append(excerpt);
    }
    const more = document.createElement('span');
    more.className = 'pena-item__more';
    more.textContent = 'Baca artikel';
    body.append(more);
    item.append(body);
    fragment.append(item);
  });
  journalList.replaceChildren(fragment);
}

fetch('/api/articles?limit=4')
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Artikel belum tersedia.')))
  .then((result) => {
    if (Array.isArray(result.items) && result.items.length) renderArticles(result.items);
  })
  .catch(() => {});

// Galeri dokumentasi: foto dibuka besar di <dialog>, bisa digeser dengan tombol atau panah
// keyboard. Keterangan diambil dari teks kartu foto itu sendiri.
(function galeri() {
  const items = [...document.querySelectorAll('.lp-photos__item')];
  const dialog = document.querySelector('#lp-lightbox');
  if (!items.length || !dialog || typeof dialog.showModal !== 'function') return;
  const gambar = dialog.querySelector('#lp-lightbox-img');
  const keterangan = dialog.querySelector('#lp-lightbox-caption');
  const hitungan = dialog.querySelector('#lp-lightbox-count');
  let aktif = 0;
  let pemicu = null;

  function tampilkan(indeks) {
    aktif = (indeks + items.length) % items.length;
    const foto = items[aktif].querySelector('img');
    gambar.src = foto.currentSrc || foto.src;
    gambar.alt = foto.alt;
    keterangan.textContent = items[aktif].querySelector('.lp-photos__caption').textContent;
    hitungan.textContent = `${aktif + 1} dari ${items.length}`;
  }

  items.forEach((item, indeks) => item.addEventListener('click', () => {
    pemicu = item;
    tampilkan(indeks);
    dialog.showModal();
  }));
  dialog.querySelector('#lp-lightbox-prev').addEventListener('click', () => tampilkan(aktif - 1));
  dialog.querySelector('#lp-lightbox-next').addEventListener('click', () => tampilkan(aktif + 1));
  dialog.querySelector('#lp-lightbox-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') tampilkan(aktif - 1);
    if (event.key === 'ArrowRight') tampilkan(aktif + 1);
  });
  // Klik di luar foto (latar gelap) menutup.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (pemicu) pemicu.focus();
  });
}());
