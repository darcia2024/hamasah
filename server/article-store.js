const fs = require('node:fs');
const path = require('node:path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSlug(value) {
  return String(value || '')
    .toLocaleLowerCase('id-ID')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createArticleStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function readArticles() {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  }

  function writeArticles(articles) {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(articles, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  return {
    list() {
      return clone(readArticles()).sort(function newestFirst(left, right) {
        return right.publishedAt.localeCompare(left.publishedAt);
      });
    },
    get(slug) {
      const article = readArticles().find(function hasSlug(entry) {
        return entry.slug === slug;
      });
      return article ? clone(article) : null;
    },
    create(input, createdAt) {
      const title = String(input.title || '').trim();
      const excerpt = String(input.excerpt || '').trim();
      const body = String(input.body || '').trim();
      const category = String(input.category || 'Kegiatan').trim();
      const slug = normalizeSlug(input.slug || title);

      if (title.length < 8 || title.length > 140 || !excerpt || !body || !slug) {
        return { ok: false, error: 'Judul, ringkasan, dan isi artikel belum valid.' };
      }

      const articles = readArticles();
      if (articles.some(function duplicate(entry) { return entry.slug === slug; })) {
        return { ok: false, error: 'Slug artikel sudah digunakan.' };
      }

      const article = { slug, title, excerpt, body, category, publishedAt: createdAt };
      articles.push(article);
      writeArticles(articles);
      return { ok: true, value: clone(article) };
    }
  };
}

module.exports = { createArticleStore, normalizeSlug };
