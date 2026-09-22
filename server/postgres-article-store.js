const crypto = require('node:crypto');
const { normalizeSlug } = require('./text-utils.js');
const { likePattern, normalizePage } = require('./pagination.js');

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
    ,coverAltText: row.cover_alt_text || null
    // Nama penulis dari akun yang membuat artikel (Task R7.4). Null untuk artikel lama yang
    // dibuat sebelum penulis dicatat, atau bila akunnya sudah dihapus.
    ,authorName: row.author_name || null
  };
}

function createPostgresArticleStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresArticleStore membutuhkan database.');
  }

  return {
    // Katalog: tanpa isi artikel (body). Katalog hanya butuh judul dan ringkasan; isi
    // lengkap datang dari get(). Satu halaman disaring dan dipotong di SQL (Task R6.2).
    async list({ publicOnly = true, category, search, limit, offset } = {}) {
      const kondisi = [];
      const nilai = [];
      if (publicOnly) kondisi.push("status = 'published'");
      if (category) { nilai.push(String(category)); kondisi.push(`lower(category) = lower($${nilai.length})`); }
      if (search && String(search).trim()) {
        nilai.push(likePattern(search));
        kondisi.push(`(title ILIKE $${nilai.length} OR excerpt ILIKE $${nilai.length})`);
      }
      const where = kondisi.length ? `WHERE ${kondisi.join(' AND ')}` : '';
      const page = normalizePage({ limit, offset }, { defaultLimit: 12 });
      const total = await database.query(`SELECT count(*)::int AS jumlah FROM articles ${where}`, nilai);
      const { rows } = await database.query(
        `SELECT slug, title, excerpt, category, published_at, status, archived_at, updated_at, cover_url, cover_alt_text,
                (SELECT name FROM accounts WHERE accounts.id = articles.author_account_id) AS author_name
         FROM articles ${where} ORDER BY published_at DESC NULLS LAST, updated_at DESC, slug
         LIMIT $${nilai.length + 1} OFFSET $${nilai.length + 2}`,
        [...nilai, page.limit, page.offset]
      );
      return { items: rows.map((row) => { const { body, ...ringkas } = toArticle(row); return ringkas; }), total: total.rows[0].jumlah, limit: page.limit, offset: page.offset };
    },
    // Semua artikel terbit untuk sitemap (Task R7.2): hanya slug dan tanggal, tanpa isi.
    async listPublishedForSitemap({ limit = 50000 } = {}) {
      const { rows } = await database.query(
        `SELECT slug, published_at, updated_at FROM articles WHERE status = 'published'
         ORDER BY published_at DESC NULLS LAST, slug LIMIT $1`,
        [limit]
      );
      return rows.map((row) => ({
        slug: row.slug,
        publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
      }));
    },
    async get(slug, { publicOnly = true } = {}) {
      const filter = publicOnly ? "AND status = 'published'" : '';
      const { rows } = await database.query(
        `SELECT a.slug, a.title, a.excerpt, a.body, a.category, a.published_at, a.status, a.archived_at, a.updated_at,
                a.cover_url, a.cover_alt_text, penulis.name AS author_name
         FROM articles a LEFT JOIN accounts penulis ON penulis.id = a.author_account_id
         WHERE a.slug = $1 ${filter.replace('status', 'a.status')}`,
        [slug]
      );
      return rows[0] ? toArticle(rows[0]) : null;
    },
    // authorAccountId: akun yang sedang login saat artikel dibuat.
    async create(input, createdAt, { authorAccountId = null } = {}) {
      const title = String(input.title || '').trim();
      const excerpt = String(input.excerpt || '').trim();
      const body = String(input.body || '').trim();
      const category = String(input.category || 'Kegiatan').trim();
      const status = String(input.status || 'published').trim().toLocaleLowerCase('en-US');
      const slug = normalizeSlug(input.slug || title);
      const coverUrl = String(input.coverUrl || '').trim().slice(0, 500) || null;
      const coverAltText = String(input.coverAltText || '').trim().slice(0, 160) || null;
      if (coverUrl && !/^https:\/\//i.test(coverUrl)) return { ok: false, error: 'Cover media harus memakai URL HTTPS.' };
      if (coverUrl && !coverAltText) return { ok: false, error: 'Alt text wajib diisi saat artikel memakai cover media.' };
      if (title.length < 8 || title.length > 140 || !excerpt || !body || !slug || !['draft', 'published'].includes(status)) {
        return { ok: false, error: 'Judul, ringkasan, dan isi artikel belum valid.' };
      }
      try {
        await database.query(
          `INSERT INTO articles (id, slug, title, excerpt, body, category, published_at, status, updated_at, cover_url, cover_alt_text, author_account_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [crypto.randomUUID(), slug, title, excerpt, body, category, status === 'published' ? createdAt : null, status, createdAt, coverUrl, coverAltText, authorAccountId]
        );
        return { ok: true, value: await this.get(slug, { publicOnly: false }) };
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
      const coverAltText = String(source.coverAltText === undefined ? (current.coverAltText || '') : source.coverAltText).trim().slice(0, 160) || null;
      if (coverUrl && !/^https:\/\//i.test(coverUrl)) return { ok: false, error: 'Cover media harus memakai URL HTTPS.' };
      if (coverUrl && !coverAltText) return { ok: false, error: 'Alt text wajib diisi saat artikel memakai cover media.' };
      if (title.length < 8 || title.length > 140 || !excerpt || !body || !category || !['draft', 'published', 'archived'].includes(status)) {
        return { ok: false, error: 'Judul, ringkasan, isi, kategori, atau status artikel belum valid.' };
      }
      const changedAt = updatedAt || new Date().toISOString();
      const publishedAt = status === 'published' ? (current.publishedAt || changedAt) : null;
      const archivedAt = status === 'archived' ? (current.archivedAt || changedAt) : null;
      await database.query(
        `UPDATE articles SET title = $2, excerpt = $3, body = $4, category = $5,
           status = $6, published_at = $7, archived_at = $8, updated_at = $9, cover_url = $10, cover_alt_text = $11
         WHERE slug = $1`,
        [slug, title, excerpt, body, category, status, publishedAt, archivedAt, changedAt, coverUrl, coverAltText]
      );
      return { ok: true, value: await this.get(slug, { publicOnly: false }) };
    }
  };
}

module.exports = { createPostgresArticleStore, toArticle };
