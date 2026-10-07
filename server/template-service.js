'use strict';

// Penyimpanan template (lihat server/templates.js). Kunci berawalan "template." di tabel
// app_settings, jadi tidak butuh migrasi baru. Template yang belum pernah disimpan memakai
// BAWAAN, yang sama dengan teks sebelum halaman Template ada.

const { BAWAAN, BLOK, periksaBlok } = require('./templates.js');
const { createStoredBlocksService } = require('./stored-blocks-service.js');

function createTemplateService({ database, cacheMs, now } = {}) {
  const blok = createStoredBlocksService({
    database, cacheMs, now,
    awalan: 'template.',
    blok: BLOK,
    bawaan: BAWAAN,
    periksa: periksaBlok,
    namaAkses: 'template'
  });
  return Object.freeze({
    kembalikan: blok.kembalikan,
    semua: blok.semua,
    simpan: blok.simpan,
    // Nilai satu template untuk dipakai (email, PDF, pesan); bawaan bila database bermasalah.
    ambil: blok.nilaiBlok
  });
}

module.exports = { createTemplateService };
