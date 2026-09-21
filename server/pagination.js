// Satu aturan pagination untuk semua daftar (Task R6.2). Bentuk respons mengikuti
// server/postgres-audit-store.js: { items, total, limit, offset }. Store tidak memercayai
// pemanggilnya, jadi batas atas diterapkan di sini dan dipanggil dari store.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizePage(input = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const limit = Math.min(Math.max(1, Math.floor(Number(input.limit)) || defaultLimit), maxLimit);
  const offset = Math.max(0, Math.floor(Number(input.offset)) || 0);
  return { limit, offset };
}

// Dari query string: ?limit=20&offset=40. Nilai kosong atau tidak valid memakai bawaan.
function pageFromQuery(searchParams, options) {
  return normalizePage({ limit: searchParams.get('limit'), offset: searchParams.get('offset') }, options);
}

// Karakter pola LIKE dari pengguna dianggap huruf biasa. Pola dipakai dengan ILIKE dan
// karakter escape bawaan PostgreSQL (backslash).
function likePattern(text) {
  return `%${String(text).trim().replace(/[\\%_]/g, '\\$&')}%`;
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, likePattern, normalizePage, pageFromQuery };
