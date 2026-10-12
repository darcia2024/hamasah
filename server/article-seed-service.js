'use strict';

// Artikel bawaan dari data/articles.json, dimasukkan ke database lewat halaman Pengaturan.
//
// Sebelumnya artikel bawaan hanya masuk lewat `npm run seed:articles` dari terminal, sehingga
// database production bisa tertinggal dari repo (yang tampil di situs online hanya artikel
// lama). Berbeda dengan perintah terminal itu, di sini artikel yang slug-nya sudah ada TIDAK
// ditimpa: suntingan admin di Pena Hamasah tetap aman, yang ditambahkan hanya yang belum ada.

const crypto = require('node:crypto');
const path = require('node:path');
const { readSeedArticles, validateArticle } = require('../database/seed-articles.js');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'articles.json');

// otomatis: artikel bawaan yang belum ada ditambahkan sendiri saat daftar artikel pertama
// kali diminta pada instance ini (lihat pastikan). Diaktifkan app.js untuk staging dan
// production, supaya rilis yang membawa artikel baru tidak menunggu admin menekan tombol.
function createArticleSeedService({ database, filePath = DEFAULT_FILE, now = () => new Date().toISOString(), otomatis = false, saatDitambahkan = null, logger = console } = {}) {
  if (!database) throw new Error('createArticleSeedService membutuhkan database.');
  let sudahDipastikan = null;

  function bawaan() {
    const daftar = readSeedArticles(filePath);
    daftar.forEach(validateArticle);
    return daftar;
  }

  async function slugTersimpan(slugs) {
    const { rows } = await database.query('SELECT slug FROM articles WHERE slug = ANY($1::text[])', [slugs]);
    return new Set(rows.map((row) => row.slug));
  }

  async function status() {
    const daftar = bawaan();
    const ada = await slugTersimpan(daftar.map((article) => article.slug));
    return {
      total: daftar.length,
      belumAda: daftar.filter((article) => !ada.has(article.slug)).map((article) => ({ slug: article.slug, title: article.title }))
    };
  }

  async function tambahkan() {
    const daftar = bawaan();
    const ada = await slugTersimpan(daftar.map((article) => article.slug));
    const ditambahkan = [];
    for (const article of daftar.filter((item) => !ada.has(item.slug))) {
      // ON CONFLICT DO NOTHING: bila slug yang sama dibuat bersamaan dari tempat lain,
      // versi yang sudah tersimpan yang dipertahankan.
      const { rowCount } = await database.query(
        `INSERT INTO articles (id, slug, title, excerpt, body, category, published_at, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $8)
         ON CONFLICT (slug) DO NOTHING`,
        [crypto.randomUUID(), article.slug, article.title, article.excerpt, article.body, article.category, article.publishedAt, now()]
      );
      if (rowCount) ditambahkan.push(article.slug);
    }
    return { ditambahkan, status: await status() };
  }

  // Sekali per instance. Ditunggu oleh rute daftar artikel (di serverless, pekerjaan yang
  // tidak ditunggu bisa terhenti sebelum selesai). Gagal tidak menggagalkan permintaan:
  // dicatat di log, dan tombol di halaman Pengaturan tetap bisa dipakai.
  function pastikan() {
    if (!otomatis) return Promise.resolve([]);
    if (!sudahDipastikan) {
      sudahDipastikan = tambahkan()
        .then(async (hasil) => {
          if (hasil.ditambahkan.length && typeof saatDitambahkan === 'function') await saatDitambahkan(hasil.ditambahkan);
          return hasil.ditambahkan;
        })
        .catch((error) => {
          logger.error(`[artikel] Artikel bawaan gagal ditambahkan otomatis: ${error.message}`);
          return [];
        });
    }
    return sudahDipastikan;
  }

  return Object.freeze({ pastikan, status, tambahkan });
}

module.exports = { createArticleSeedService };
