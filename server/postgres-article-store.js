const crypto = require('node:crypto');
const { normalizeSlug } = require('./text-utils.js');

function toArticle(row) {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category: row.category,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    status: row.status || 'published',
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    ,coverUrl: row.cover_url || null
  };
}

function createPostgresArticleStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresArticleStore membutuhkan database.');
  }

  return {
    async list({ publicOnly = true } = {}) {
      const filter = publicOnly ? "WHERE status = 'published'" : '';
      const { rows } = await database.query(
        `SELECT slug, title, excerpt, body, category, published_at, status, archived_at, updated_at, cover_url
         FROM articles ${filter} ORDER BY published_at DESC NULLS LAST, updated_at DESC`
      );
      return rows.map(toArticle);
    },
    async get(slug, { publicOnly = true } = {}) {
      const filter = publicOnly ? "AND status = 'published'" : '';
      const { rows } = await database.query(
        `SELECT slug, title, excerpt, body, category, published_at, status, archived_at, updated_at, cover_url
         FROM articles WHERE slug = $1 ${filter}`,
        [slug]
      );
      return rows[0] ? toArticle(rows[0]) : null;
    },
    async create(input, createdAt) {
      const title = String(input.title || '').trim();
      const excerpt = String(input.excerpt || '').trim();
      const body = String(input.body || '').trim();
      const category = String(input.category || 'Kegiatan').trim();
      const status = String(input.status || 'published').trim().toLocaleLowerCase('en-US');
      const slug = normalizeSlug(input.slug || title);
      const coverUrl = String(input.coverUrl || '').trim().slice(0, 500) || null;
      if (coverUrl && !/^https:\/\//i.test(coverUrl)) return { ok: false, error: 'Cover media harus memakai URL HTTPS.' };
      if (title.length < 8 || title.length > 140 || !excerpt || !body || !slug || !['draft', 'published'].includes(status)) {
        return { ok: false, error: 'Judul, ringkasan, dan isi artikel belum valid.' };
      }
      try {
        const { rows } = await database.query(
          `INSERT INTO articles (id, slug, title, excerpt, body, category, published_at, status, updated_at, cover_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING slug, title, excerpt, body, category, published_at, status, archived_at, updated_at, cover_url`,
          [crypto.randomUUID(), slug, title, excerpt, body, category, status === 'published' ? createdAt : null, status, createdAt, coverUrl]
        );
        return { ok: true, value: toArticle(rows[0]) };
      } catch (error) {
        if (error && error.code === '23505') {
          return { ok: false, error: 'Slug artikel sudah digunakan.' };
        }
        throw error;
      }
    },

    async update(slug, input, updatedAt) {
      const current = await this.get(slug, { publicOnly: false });
      if (!current) return { ok: false, status: 404, error: 'Artikel tidak ditemukan.' };
      const source = input || {};
      const title = String(source.title === undefined ? current.title : source.title).trim();
      const excerpt = String(source.excerpt === undefined ? current.excerpt : source.excerpt).trim();
      const body = String(source.body === undefined ? current.body : source.body).trim();
      const category = String(source.category === undefined ? current.category : source.category).trim();
      const status = String(source.status === undefined ? current.status : source.status).trim().toLocaleLowerCase('en-US');
      const coverUrl = String(source.coverUrl === undefined ? (current.coverUrl || '') : source.coverUrl).trim().slice(0, 500) || null;
      if (coverUrl && !/^https:\/\//i.test(coverUrl)) return { ok: false, error: 'Cover media harus memakai URL HTTPS.' };
      if (title.length < 8 || title.length > 140 || !excerpt || !body || !category || !['draft', 'published', 'archived'].includes(status)) {
        return { ok: false, error: 'Judul, ringkasan, isi, kategori, atau status artikel belum valid.' };
      }
      const changedAt = updatedAt || new Date().toISOString();
      const publishedAt = status === 'published' ? (current.publishedAt || changedAt) : null;
      const archivedAt = status === 'archived' ? (current.archivedAt || changedAt) : null;
      const { rows } = await database.query(
        `UPDATE articles SET title = $2, excerpt = $3, body = $4, category = $5,
           status = $6, published_at = $7, archived_at = $8, updated_at = $9, cover_url = $10
         WHERE slug = $1
         RETURNING slug, title, excerpt, body, category, published_at, status, archived_at, updated_at`,
        [slug, title, excerpt, body, category, status, publishedAt, archivedAt, changedAt, coverUrl]
      );
      return { ok: true, value: toArticle(rows[0]) };
    }
  };
}

module.exports = { createPostgresArticleStore, toArticle };
