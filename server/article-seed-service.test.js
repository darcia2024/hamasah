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

    // Sampul: semua artikel bawaan punya sampul di repo. Artikel lama yang belum bersampul
    // diisi (tanpa menyentuh judulnya), dan artikel baru langsung bersampul.
    assert.ok(bawaan.every((item) => /^\/assets\/artikel\/[a-z0-9-]+\.jpg$/.test(item.coverUrl) && item.coverAltText));
    for (const item of bawaan) assert.ok(fs.existsSync(path.join(__dirname, '..', item.coverUrl)), `Berkas sampul ${item.coverUrl} ada.`);
    assert.deepEqual(hasil.sampul, [pertama.slug]);
    const sampul = await database.query('SELECT slug, cover_url, cover_alt_text FROM articles ORDER BY slug');
    for (const row of sampul.rows) {
      const asal = bawaan.find((item) => item.slug === row.slug);
      assert.deepEqual([row.cover_url, row.cover_alt_text], [asal.coverUrl, asal.coverAltText]);
    }
    // Sampul yang dipasang admin tidak diganti.
    await database.query("UPDATE articles SET cover_url = '/media/galeri/pilihan-admin.jpg', cover_alt_text = 'Pilihan admin' WHERE slug = $1", [bawaan[1].slug]);
    assert.deepEqual((await layanan.tambahkan()).sampul, []);
    assert.equal((await database.query('SELECT cover_url FROM articles WHERE slug = $1', [bawaan[1].slug])).rows[0].cover_url, '/media/galeri/pilihan-admin.jpg');

    // Sampul bawaan versi lama (previousCoverUrls) diganti ke sampul bawaan terbaru.
    const berganti = bawaan.find((item) => item.previousCoverUrls.length);
    assert.ok(berganti, 'Ada artikel bawaan dengan sampul lama yang perlu diganti.');
    await database.query('UPDATE articles SET cover_url = $2 WHERE slug = $1', [berganti.slug, berganti.previousCoverUrls[0]]);
    assert.deepEqual((await layanan.tambahkan()).sampul, [berganti.slug]);
    assert.equal((await database.query('SELECT cover_url FROM articles WHERE slug = $1', [berganti.slug])).rows[0].cover_url, berganti.coverUrl);

    // Isi bawaan versi lama (previousBodyHashes) diperbarui ke versi terbaru; isi yang
    // disunting admin tidak tertimpa.
    const isiBaru = bawaan.find((item) => item.previousBodyHashes.length);
    assert.ok(isiBaru, 'Ada artikel bawaan dengan isi versi lama.');
    const isiLama = 'Hamasah International mendampingi santri sejak persiapan keberangkatan hingga penyesuaian awal di Kairo. Informasi kegiatan diperbarui oleh pengurus sesuai dokumentasi lapangan.';
    await database.query("UPDATE articles SET title = 'Judul lama', body = $2 WHERE slug = $1", [isiBaru.slug, isiLama]);
    assert.deepEqual((await layanan.tambahkan()).diperbarui, [isiBaru.slug]);
    const sesudah = await database.query('SELECT title, body FROM articles WHERE slug = $1', [isiBaru.slug]);
    assert.deepEqual(sesudah.rows[0], { title: isiBaru.title, body: isiBaru.body });
    await database.query("UPDATE articles SET body = 'Isi hasil suntingan admin.' WHERE slug = $1", [isiBaru.slug]);
    assert.deepEqual((await layanan.tambahkan()).diperbarui, []);
    assert.equal((await database.query('SELECT body FROM articles WHERE slug = $1', [isiBaru.slug])).rows[0].body, 'Isi hasil suntingan admin.');

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

    await otomatis(bawaan);

    console.log('article seed service tests passed');
  } finally {
    await database.close();
  }
}

// Mode otomatis: artikel bawaan masuk sendiri saat daftar artikel pertama kali diminta.
async function otomatis(bawaan) {
  const database = await createTestDatabase();
  const { createHamasahApp } = require('./app.js');
  try {
    // Tanpa otomatis (bawaan untuk development dan test): tidak melakukan apa-apa.
    assert.deepEqual(await createArticleSeedService({ database }).pastikan(), []);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM articles')).rows[0].n, 0);

    // Gagal membaca berkas tidak melempar galat; dicatat di log dan mengembalikan daftar kosong.
    const log = [];
    const rusak = createArticleSeedService({ database, otomatis: true, filePath: path.join(__dirname, 'tidak-ada.json'), logger: { error: (pesan) => log.push(pesan) } });
    assert.deepEqual(await rusak.pastikan(), []);
    assert.equal(log.length, 1);

    // Lewat HTTP, seperti di production: permintaan pertama ke daftar artikel mengisi semuanya,
    // sekali saja, dan tercatat di jejak audit sebagai penambahan otomatis.
    const app = createHamasahApp({ rootDirectory: path.resolve(__dirname, '..'), database, bootstrapKey: 'kunci-uji-artikel', autoSeedArticles: true });
    const server = app.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const pertama = await (await fetch(`${baseUrl}/api/articles?limit=50`)).json();
      assert.equal(pertama.total, bawaan.length);
      const kedua = await (await fetch(`${baseUrl}/api/articles?limit=50`)).json();
      assert.equal(kedua.total, bawaan.length);
      const audit = await database.query("SELECT metadata FROM audit_events WHERE action = 'article.defaults-added'");
      assert.equal(audit.rows.length, 1, 'Dicatat sekali, bukan setiap permintaan.');
      assert.equal(audit.rows[0].metadata.otomatis, true);
      assert.equal(audit.rows[0].metadata.jumlah, bawaan.length);
      const halaman = await fetch(`${baseUrl}/website/article.html?slug=${bawaan[1].slug}`);
      assert.equal(halaman.status, 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await app.close();
    }
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
