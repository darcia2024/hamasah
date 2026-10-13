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
  });
});

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
    link.href = `https://wa.me/${(nomorWa && nomorWa.content) || '6287897591978'}`;
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

function renderArticles(items) {
  const fragment = document.createDocumentFragment();
  items.slice(0, 6).forEach((article, index) => {
    const item = document.createElement('a');
    item.className = 'journal-item';
    item.href = `article.html?slug=${encodeURIComponent(article.slug)}`;
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('div');
    const category = document.createElement('p');
    category.className = 'card-label';
    category.textContent = article.category;
    const title = document.createElement('h3');
    title.textContent = article.title;
    const excerpt = document.createElement('p');
    excerpt.textContent = article.excerpt;
    copy.append(category, title, excerpt);
    const arrow = document.createElement('b');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '';
    arrow.classList.add('btn-arrow');
    item.append(number, copy, arrow);
    fragment.append(item);
  });
  journalList.replaceChildren(fragment);
}

fetch('/api/articles?limit=6')
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
