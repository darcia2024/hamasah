const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createTestDatabase } = require('./test-support/database.js');
const { createArticleSeedService } = require('./article-seed-service.js');
const { readSeedArticles } = require('../database/seed-articles.js');
const path = require('node:path');

async function run() {
  const database = await createTestDatabase();
  try {
    const berkas = path.join(__dirname, '..', 'data', 'articles.json');
    const bawaan = readSeedArticles(berkas);
    assert.ok(bawaan.length >= 2, 'data/articles.json memuat artikel bawaan.');

    // Database seperti production: satu artikel bawaan sudah ada dan sudah disunting admin.
    const pertama = bawaan[0];
    await database.query(
      `INSERT INTO articles (id, slug, title, excerpt, body, category, published_at, status, updated_at)
       VALUES (gen_random_uuid(), $1, 'Judul hasil suntingan admin', 'Ringkasan suntingan.', 'Isi suntingan admin.', 'Kegiatan', now(), 'published', now())`,
      [pertama.slug]
    );

    const layanan = createArticleSeedService({ database, now: () => '2026-10-03T08:00:00.000Z' });
    const sebelum = await layanan.status();
    assert.equal(sebelum.total, bawaan.length);
    assert.deepEqual(sebelum.belumAda.map((item) => item.slug), bawaan.slice(1).map((item) => item.slug));

    const hasil = await layanan.tambahkan();
    assert.deepEqual(hasil.ditambahkan, bawaan.slice(1).map((item) => item.slug));
    assert.deepEqual(hasil.status.belumAda, []);

    // Artikel yang sudah ada tidak ditimpa.
    const tersimpan = await database.query('SELECT title, body FROM articles WHERE slug = $1', [pertama.slug]);
    assert.equal(tersimpan.rows[0].title, 'Judul hasil suntingan admin');
    // Yang baru langsung terbit dengan isi dari berkas.
    const baru = await database.query("SELECT status, title FROM articles WHERE slug = $1", [bawaan[1].slug]);
    assert.deepEqual(baru.rows[0], { status: 'published', title: bawaan[1].title });

    // Menjalankan lagi tidak menambah apa pun.
    assert.deepEqual((await layanan.tambahkan()).ditambahkan, []);
    const jumlah = await database.query('SELECT count(*)::int AS n FROM articles');
    assert.equal(jumlah.rows[0].n, bawaan.length);

    // Berkas rusak menghasilkan galat, bukan penambahan setengah jalan.
    const rusak = path.join(require('node:os').tmpdir(), `artikel-rusak-${process.pid}.json`);
    fs.writeFileSync(rusak, JSON.stringify([{ slug: 'Slug Tidak Valid', title: 'x', excerpt: '', body: '' }]));
    try {
      await assert.rejects(() => createArticleSeedService({ database, filePath: rusak }).tambahkan(), /tidak valid/);
    } finally {
      fs.unlinkSync(rusak);
    }

    console.log('article seed service tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
