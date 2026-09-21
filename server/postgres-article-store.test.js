const assert = require('node:assert/strict');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresArticleStore } = require('./postgres-article-store.js');

const PUBLISHED_AT = '2026-09-15T00:00:00.000Z';

async function run() {
  const database = await createTestDatabase();
  try {
    const store = createPostgresArticleStore({ database });
    assert.deepEqual(await store.list(), { items: [], total: 0, limit: 12, offset: 0 });
    assert.equal(await store.get('tidak-ada'), null);

    const input = { title: 'Kegiatan Santri Hamasah', excerpt: 'Ringkasan kegiatan.', body: 'Isi kegiatan lengkap.' };
    const created = await store.create(input, PUBLISHED_AT);
    assert.equal(created.ok, true);
    assert.deepEqual(created.value, {
      slug: 'kegiatan-santri-hamasah',
      title: 'Kegiatan Santri Hamasah',
      excerpt: 'Ringkasan kegiatan.',
      body: 'Isi kegiatan lengkap.',
      category: 'Kegiatan',
      publishedAt: PUBLISHED_AT,
      status: 'published',
      archivedAt: null,
      coverUrl: null,
      coverAltText: null,
      updatedAt: PUBLISHED_AT
    });

    const katalog = await store.list();
    assert.equal(katalog.items.length, 1);
    assert.equal('body' in katalog.items[0], false, 'Katalog tidak boleh membawa isi artikel.');
    assert.equal(katalog.items[0].excerpt, 'Ringkasan kegiatan.');
    assert.equal((await store.get('kegiatan-santri-hamasah')).body, 'Isi kegiatan lengkap.', 'Detail tetap membawa isi.');
    assert.equal((await store.get('kegiatan-santri-hamasah')).title, 'Kegiatan Santri Hamasah');

    const draft = await store.create({ title: 'Rencana Kegiatan Santri', excerpt: 'Draft internal.', body: 'Isi yang belum diterbitkan.', status: 'draft' }, PUBLISHED_AT);
    assert.equal(draft.ok, true);
    assert.equal((await store.list()).items.length, 1, 'Draft tidak boleh tampil di katalog publik.');
    assert.equal((await store.list({ publicOnly: false })).items.length, 2);
    assert.equal((await store.get(draft.value.slug)), null);
    const published = await store.update(draft.value.slug, { status: 'published' }, '2026-09-16T00:00:00.000Z');
    assert.equal(published.ok, true);
    assert.equal((await store.get(draft.value.slug)).status, 'published');
    const archived = await store.update(draft.value.slug, { status: 'archived' }, '2026-09-17T00:00:00.000Z');
    assert.equal(archived.value.status, 'archived');
    assert.equal((await store.get(draft.value.slug)), null);

    // Slug ganda dikembalikan sebagai pesan yang ramah, bukan error mentah database.
    assert.deepEqual(await store.create(input, PUBLISHED_AT), { ok: false, error: 'Slug artikel sudah digunakan.' });

    const invalid = await store.create({ title: 'Pendek', excerpt: '', body: '' }, PUBLISHED_AT);
    assert.equal(invalid.ok, false);
    assert.equal((await store.create({ title: 'Artikel Dengan Cover', excerpt: 'Ringkasan.', body: 'Isi.', coverUrl: 'http://example.test/image.jpg', coverAltText: 'Cover' }, PUBLISHED_AT)).ok, false);
    assert.equal((await store.create({ title: 'Artikel Tanpa Alt', excerpt: 'Ringkasan.', body: 'Isi.', coverUrl: 'https://example.test/image.jpg' }, PUBLISHED_AT)).ok, false);
    assert.equal((await store.list()).items.length, 1);

    // Pagination, kategori, dan pencarian berjalan di SQL.
    for (let n = 1; n <= 25; n += 1) {
      const dibuat = await store.create({ title: `Artikel Massal Nomor ${String(n).padStart(2, '0')}`, excerpt: n === 5 ? 'Berisi 100% semangat.' : 'Ringkasan massal.', body: 'Isi.', category: n % 2 ? 'Keilmuan Islam' : 'Panduan Hidup' }, `2026-10-${String(n).padStart(2, '0')}T00:00:00.000Z`);
      assert.equal(dibuat.ok, true);
    }
    const satu = await store.list({ limit: 10 });
    assert.deepEqual([satu.items.length, satu.total, satu.limit, satu.offset], [10, 26, 10, 0]);
    assert.equal(satu.items[0].slug, 'artikel-massal-nomor-25', 'Terbaru lebih dulu.');
    const dua = await store.list({ limit: 10, offset: 10 });
    assert.equal(dua.items[0].slug, 'artikel-massal-nomor-15');
    assert.equal((await store.list({ limit: 10, offset: 20 })).items.length, 6);
    assert.equal((await store.list({ limit: 100000 })).limit, 100, 'Batas atas limit.');
    assert.equal((await store.list({ category: 'panduan hidup', limit: 100 })).total, 12);
    assert.equal((await store.list({ search: 'nomor 07' })).total, 1);
    assert.equal((await store.list({ search: '100%' })).total, 1);
    assert.equal((await store.list({ search: '%' })).total, 1, '% dari pengguna adalah huruf biasa.');

    console.log('postgres article store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
