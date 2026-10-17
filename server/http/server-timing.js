'use strict';
// Header Server-Timing untuk setiap jawaban (17 Oktober 2026): berapa query database yang
// dijalankan, total waktunya, berapa koneksi database baru dibuka, dan lama permintaan di
// server. Tampil di tab Network DevTools dan `curl -I`, tanpa isi query atau data apa pun.
// Tujuannya memisahkan lambat karena database, karena koneksi baru, atau karena hal lain.
//
// Penghitungnya disimpan per permintaan lewat AsyncLocalStorage, jadi query yang berjalan
// bersamaan dari permintaan lain tidak ikut terhitung.

const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');

const penyimpan = new AsyncLocalStorage();

function bulat(ms) {
  return Math.round(ms * 10) / 10;
}

// Dipanggil lapisan database setiap query selesai.
function catatQuery(durasiMs) {
  const s = penyimpan.getStore();
  if (!s) return;
  s.query += 1;
  s.dbMs += durasiMs;
}

// Dipanggil saat pool membuka koneksi fisik baru ke database.
function catatKoneksiBaru() {
  const s = penyimpan.getStore();
  if (s) s.koneksiBaru += 1;
}

async function ukurQuery(kerja) {
  const mulai = performance.now();
  try {
    return await kerja();
  } finally {
    catatQuery(performance.now() - mulai);
  }
}

function nilaiHeader(s) {
  return [
    `db;dur=${bulat(s.dbMs)};desc="${s.query} query"`,
    `conn;desc="${s.koneksiBaru} koneksi baru"`,
    `app;dur=${bulat(performance.now() - s.mulai)}`
  ].join(', ');
}

// Menjalankan penangan permintaan dengan penghitung sendiri, dan memasang header tepat
// sebelum kepala jawaban dikirim.
function jalankan(response, kerja) {
  const s = { mulai: performance.now(), query: 0, dbMs: 0, koneksiBaru: 0 };
  const writeHead = response.writeHead;
  response.writeHead = function writeHeadDenganTiming(...args) {
    if (!response.headersSent) {
      try { response.setHeader('Server-Timing', nilaiHeader(s)); } catch { /* header sudah terkunci */ }
    }
    return writeHead.apply(this, args);
  };
  return penyimpan.run(s, kerja);
}

module.exports = { catatKoneksiBaru, catatQuery, jalankan, ukurQuery };
