const assert = require('node:assert/strict');
const { seedArticles, validateArticle } = require('./seed-articles');

const TEST_ENVIRONMENT = Object.freeze({
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/hamasah',
  STORAGE_BUCKET: 'hamasah-private-documents',
  HAMASAH_BOOTSTRAP_KEY: 'this-is-a-safe-test-key-with-more-than-32-characters'
});

const SAMPLE_ARTICLES = Object.freeze([{
  slug: 'kegiatan-santri',
  title: 'Kegiatan Santri Hamasah',
  excerpt: 'Catatan kegiatan belajar.',
  body: 'Catatan lengkap kegiatan belajar dan pembinaan santri.',
  category: 'Kegiatan',
  publishedAt: '2026-09-15T00:00:00.000Z'
}]);

async function run() {
  assert.throws(() => validateArticle({ slug: '', title: '', excerpt: '', body: '' }), /tidak valid/);
  const queries = [];
  let ended = false;
  class MockClient {
    async connect() {}
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      return { rows: [] };
    }
    async end() { ended = true; }
  }
  const count = await seedArticles({
    environment: { ...TEST_ENVIRONMENT },
    Client: MockClient,
    articles: SAMPLE_ARTICLES,
    envFilePath: null
  });
  assert.equal(count, 1);
  assert.equal(queries[0].sql, 'BEGIN');
  assert.match(queries[1].sql, /INSERT INTO articles/);
  assert.equal(queries[1].parameters[1], 'kegiatan-santri');
  assert.equal(queries[2].sql, 'COMMIT');
  assert.equal(ended, true);

  // Production tanpa konfirmasi: berhenti sebelum client dibuat.
  let constructed = 0;
  class BlockedClient {
    constructor() { constructed += 1; }
    async connect() {}
    async query() { return { rows: [] }; }
    async end() {}
  }
  await assert.rejects(
    seedArticles({
      environment: { ...TEST_ENVIRONMENT, APP_ENV: 'production' },
      Client: BlockedClient,
      articles: SAMPLE_ARTICLES,
      envFilePath: null
    }),
    /ALLOW_PRODUCTION_WRITE/
  );
  assert.equal(constructed, 0);

  console.log('article seed tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
