'use strict';

// Penyimpanan konten website publik (lihat server/site-content.js untuk bentuk dan render).
//
// Kunci berawalan "konten." di tabel app_settings (konten.biaya, konten.faq, ...), jadi tidak
// butuh migrasi baru. Blok yang belum pernah disimpan memakai BAWAAN, yang sama dengan isi
// HTML. Di Vercel, CDN juga menyimpan halaman sampai 5 menit, jadi perubahan bisa butuh
// beberapa menit sampai tampil di semua pengunjung.

const { BAWAAN, BLOK, periksaBlok } = require('./site-content.js');
const { createStoredBlocksService } = require('./stored-blocks-service.js');

function createSiteContentService({ database, cacheMs, now } = {}) {
  const blok = createStoredBlocksService({
    database, cacheMs, now,
    awalan: 'konten.',
    blok: BLOK,
    bawaan: BAWAAN,
    periksa: periksaBlok,
    namaAkses: 'konten website'
  });
  return Object.freeze({
    kembalikan: blok.kembalikan,
    semua: blok.semua,
    simpan: blok.simpan,
    // Untuk render halaman publik: null bila database bermasalah, halaman tetap tampil.
    untukHalaman: blok.untukPakai
  });
}

module.exports = { createSiteContentService };
