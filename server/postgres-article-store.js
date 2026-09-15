const crypto = require('node:crypto');
const { normalizeSlug } = require('./article-store.js');

function toArticle(row) {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category: row.category,
    publishedAt: new Date(row.published_at).toISOString()
  };
}

function createPostgresArticleStore({ connectionString, pool } = {}) {
  const client = pool || new (require('pg').Pool)({ connectionString });

  return {
    async list() {
      const { rows } = await client.query(
        'SELECT slug, title, excerpt, body, category, published_at FROM articles ORDER BY published_at DESC'
      );
      return rows.map(toArticle);
    },
    async get(slug) {
      const { rows } = await client.query(
        'SELECT slug, title, excerpt, body, category, published_at FROM articles WHERE slug = $1',
        [slug]
      );
      return rows[0] ? toArticle(rows[0]) : null;
    },
    async create(input, createdAt) {
      const title = String(input.title || '').trim();
      const excerpt = String(input.excerpt || '').trim();
      const body = String(input.body || '').trim();
      const category = String(input.category || 'Kegiatan').trim();
      const slug = normalizeSlug(input.slug || title);
      if (title.length < 8 || title.length > 140 || !excerpt || !body || !slug) {
        return { ok: false, error: 'Judul, ringkasan, dan isi artikel belum valid.' };
      }
      try {
        const { rows } = await client.query(
          `INSERT INTO articles (id, slug, title, excerpt, body, category, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING slug, title, excerpt, body, category, published_at`,
          [crypto.randomUUID(), slug, title, excerpt, body, category, createdAt]
        );
        return { ok: true, value: toArticle(rows[0]) };
      } catch (error) {
        if (error && error.code === '23505') {
          return { ok: false, error: 'Slug artikel sudah digunakan.' };
        }
        throw error;
      }
    }
  };
}

module.exports = { createPostgresArticleStore, toArticle };
