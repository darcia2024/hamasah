const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_ENV_FILE, loadEnvironmentFile } = require('./migrate');
const { assertDatabaseWriteAllowed } = require('../server/environment');
const { readProductionConfig } = require('../server/production-config');

function readSeedArticles(filePath) {
  const articles = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(articles)) {
    throw new Error('Seed artikel harus berupa daftar artikel.');
  }
  return articles.map((article) => ({
    slug: String(article.slug || '').trim(),
    title: String(article.title || '').trim(),
    excerpt: String(article.excerpt || '').trim(),
    body: String(article.body || '').trim(),
    category: String(article.category || 'Kegiatan').trim(),
    publishedAt: new Date(article.publishedAt || Date.now()).toISOString()
  }));
}

function validateArticle(article) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || article.title.length < 8 || !article.excerpt || !article.body) {
    throw new Error(`Artikel seed tidak valid: ${article.slug || '(tanpa slug)'}.`);
  }
}

async function seedArticles({ environment = { ...process.env }, Client, articles, envFilePath = DEFAULT_ENV_FILE } = {}) {
  loadEnvironmentFile(envFilePath, environment);
  assertDatabaseWriteAllowed(environment);
  const config = readProductionConfig(environment);
  const seedArticles = articles || readSeedArticles(path.join(__dirname, '..', 'data', 'articles.json'));
  seedArticles.forEach(validateArticle);
  const PgClient = Client || require('pg').Client;
  const client = new PgClient({ connectionString: config.databaseUrl });

  await client.connect();
  try {
    await client.query('BEGIN');
    for (const article of seedArticles) {
      await client.query(
        `INSERT INTO articles (id, slug, title, excerpt, body, category, published_at, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $7)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           excerpt = EXCLUDED.excerpt,
           body = EXCLUDED.body,
           category = EXCLUDED.category,
           published_at = EXCLUDED.published_at,
           status = 'published', updated_at = EXCLUDED.updated_at`,
        [crypto.randomUUID(), article.slug, article.title, article.excerpt, article.body, article.category, article.publishedAt]
      );
    }
    await client.query('COMMIT');
    return seedArticles.length;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seedArticles()
    .then((count) => console.log(`Seed artikel selesai: ${count} artikel disinkronkan.`))
    .catch((error) => {
      console.error(`Seed artikel gagal: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { readSeedArticles, seedArticles, validateArticle };
