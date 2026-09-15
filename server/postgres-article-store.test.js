const assert = require('node:assert/strict');
const { createPostgresArticleStore } = require('./postgres-article-store.js');

async function run() {
  const queries = [];
  const pool = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      if (sql.startsWith('SELECT') && sql.includes('WHERE slug')) return { rows: [] };
      if (sql.startsWith('SELECT')) return { rows: [{ slug: 'kegiatan-santri', title: 'Kegiatan Santri', excerpt: 'Ringkasan.', body: 'Isi.', category: 'Kegiatan', published_at: '2026-09-15T00:00:00.000Z' }] };
      return { rows: [{ slug: 'kegiatan-santri', title: 'Kegiatan Santri Hamasah', excerpt: 'Ringkasan kegiatan.', body: 'Isi kegiatan lengkap.', category: 'Kegiatan', published_at: '2026-09-15T00:00:00.000Z' }] };
    }
  };
  const store = createPostgresArticleStore({ pool });
  assert.equal((await store.list()).length, 1);
  assert.equal(await store.get('tidak-ada'), null);
  const created = await store.create({ title: 'Kegiatan Santri Hamasah', excerpt: 'Ringkasan kegiatan.', body: 'Isi kegiatan lengkap.' }, '2026-09-15T00:00:00.000Z');
  assert.equal(created.ok, true);
  assert.match(queries[2].sql, /INSERT INTO articles/);
  console.log('postgres article store tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
