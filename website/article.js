const articleContent = document.querySelector('#article-content');
const slug = new URLSearchParams(window.location.search).get('slug');

function renderArticle(article) {
  const category = document.createElement('p');
  category.className = 'eyebrow';
  category.textContent = article.category;
  const title = document.createElement('h1');
  title.textContent = article.title;
  const publishedAt = document.createElement('p');
  publishedAt.className = 'article-date';
  publishedAt.textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(article.publishedAt));
  const excerpt = document.createElement('p');
  excerpt.className = 'article-excerpt';
  excerpt.textContent = article.excerpt;
  const body = document.createElement('div');
  body.className = 'article-body';
  article.body.split(/\n{2,}/).forEach((paragraph) => {
    const node = document.createElement('p');
    node.textContent = paragraph;
    body.append(node);
  });
  articleContent.replaceChildren(category, title, publishedAt, excerpt, body);
  document.title = `${article.title} | Hamasah International`;
}

if (!slug) {
  articleContent.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Artikel tidak ditemukan.' }));
} else {
  fetch(`/api/articles/${encodeURIComponent(slug)}`)
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Artikel tidak ditemukan.')))
    .then((result) => renderArticle(result.item))
    .catch((error) => {
      const title = document.createElement('h1');
      title.textContent = 'Artikel belum tersedia';
      const message = document.createElement('p');
      message.textContent = error.message;
      articleContent.replaceChildren(title, message);
    });
}
