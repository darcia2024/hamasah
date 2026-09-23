// Penyimpanan percobaan untuk pembatas laju (migrasi 041).
//
// Hitungannya harus bertahan walau prosesnya berganti, karena di platform
// serverless setiap permintaan bisa dilayani instance berbeda. Semua pemeriksaan
// dikerjakan dalam satu transaksi dengan advisory lock per bucket, supaya dua
// permintaan yang datang bersamaan tidak sama-sama lolos melewati batas.

const crypto = require('node:crypto');

// Kunci advisory 64 bit dari nama bucket. Kunci yang sama berarti antrean yang
// sama, jadi pemeriksaan untuk satu bucket berjalan bergantian.
function lockKey(bucket) {
  const digest = crypto.createHash('sha1').update(bucket).digest();
  return digest.readBigInt64BE(0).toString();
}

function createPostgresRateLimitStore({ database } = {}) {
  if (!database) throw new Error('createPostgresRateLimitStore membutuhkan database.');

  return Object.freeze({
    // Mencatat satu percobaan bila masih ada jatah. Mengembalikan bentuk yang sama
    // dengan pembatas berbasis memori, supaya pemanggilnya tidak perlu tahu bedanya.
    async hit(bucket, { limit, windowMs }) {
      return database.withTransaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock($1)', [lockKey(bucket)]);
        const batas = new Date(Date.now() - windowMs).toISOString();
        await tx.query('DELETE FROM rate_limit_hits WHERE bucket = $1 AND occurred_at <= $2', [bucket, batas]);
        const { rows } = await tx.query(
          'SELECT count(*)::int AS jumlah, min(occurred_at) AS paling_awal FROM rate_limit_hits WHERE bucket = $1',
          [bucket]
        );
        const jumlah = rows[0] ? rows[0].jumlah : 0;
        if (jumlah >= limit) {
          const palingAwal = rows[0].paling_awal ? new Date(rows[0].paling_awal).getTime() : Date.now();
          const bebasPada = palingAwal + windowMs;
          return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((bebasPada - Date.now()) / 1000))
          };
        }
        await tx.query('INSERT INTO rate_limit_hits (bucket) VALUES ($1)', [bucket]);
        return { allowed: true, remaining: limit - (jumlah + 1), retryAfterSeconds: 0 };
      });
    },

    // Dipanggil setelah percobaan yang berhasil, misalnya login yang benar.
    async clear(bucket) {
      await database.query('DELETE FROM rate_limit_hits WHERE bucket = $1', [bucket]);
    },

    // Membuang baris yang jendelanya sudah lewat untuk seluruh bucket. Dipanggil
    // pekerjaan perawatan, bukan per permintaan.
    async sweep(maxWindowMs) {
      const batas = new Date(Date.now() - maxWindowMs).toISOString();
      const { rowCount } = await database.query('DELETE FROM rate_limit_hits WHERE occurred_at <= $1', [batas]);
      return rowCount || 0;
    }
  });
}

module.exports = { createPostgresRateLimitStore };
