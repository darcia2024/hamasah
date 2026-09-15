const path = require('node:path');

// Satu pintu database untuk semua store.
// Antarmuka yang dipakai store:
//   query(sql, params)            -> { rows }
//   withTransaction(async (tx) => { ... tx.query(sql, params) ... })
//   exec(sql)                     -> multi-statement, khusus migrasi
//   close()
//
// Di dalam withTransaction, semua query WAJIB lewat tx.query. Memanggil database.query
// di dalam transaksi membuat PGlite macet dan di PostgreSQL berjalan di luar transaksi.

const DEFAULT_POOL_MAX = 5;
const MAX_POOL_MAX = 50;

function readPoolMax(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_POOL_MAX;
  }
  const poolMax = Number(value);
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > MAX_POOL_MAX) {
    throw new Error(`DATABASE_POOL_MAX harus bilangan bulat 1 sampai ${MAX_POOL_MAX}.`);
  }
  return poolMax;
}

function createPool(connectionString, poolMax) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, max: readPoolMax(poolMax) });
  // Tanpa handler ini, proses Node crash saat koneksi idle diputus server database.
  pool.on('error', (error) => {
    console.error(`[database] Koneksi idle bermasalah: ${error.message}`);
  });
  return pool;
}

function createPostgresDatabase(pool, { ownsPool }) {
  return Object.freeze({
    kind: 'postgres',

    query(sql, params) {
      return pool.query(sql, params);
    },

    async withTransaction(work) {
      // Satu koneksi untuk seluruh transaksi. pool.query() bisa memakai koneksi berbeda per query.
      const client = await pool.connect();
      let releaseError;
      try {
        await client.query('BEGIN');
        const result = await work({ query: (sql, params) => client.query(sql, params) });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          // Koneksi yang gagal ROLLBACK dibuang, tidak dikembalikan ke pool.
          releaseError = rollbackError;
        }
        throw error;
      } finally {
        client.release(releaseError);
      }
    },

    exec(sql) {
      return pool.query(sql);
    },

    async close() {
      if (ownsPool) {
        await pool.end();
      }
    }
  });
}

function createPgliteDatabase(target) {
  if (!target) {
    throw new Error('Target PGlite kosong. Gunakan pglite:memory atau pglite:<folder>.');
  }
  // Di-require di dalam fungsi: PGlite hanya devDependency, production tidak memerlukannya.
  const { PGlite } = require('@electric-sql/pglite');
  const db = target === 'memory' ? new PGlite() : new PGlite(path.resolve(target));

  return Object.freeze({
    kind: 'pglite',

    query(sql, params) {
      return db.query(sql, params);
    },

    withTransaction(work) {
      return db.transaction((tx) => work({ query: (sql, params) => tx.query(sql, params) }));
    },

    exec(sql) {
      return db.exec(sql);
    },

    close() {
      return db.close();
    }
  });
}

function createDatabase(options = {}) {
  if (options.pool) {
    return createPostgresDatabase(options.pool, { ownsPool: false });
  }

  const connectionString = String(options.connectionString || '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL belum diisi.');
  }
  if (connectionString.startsWith('pglite:')) {
    return createPgliteDatabase(connectionString.slice('pglite:'.length));
  }
  if (/^postgres(ql)?:\/\//.test(connectionString)) {
    const poolMax = options.poolMax === undefined ? process.env.DATABASE_POOL_MAX : options.poolMax;
    return createPostgresDatabase(createPool(connectionString, poolMax), { ownsPool: true });
  }
  // Jangan menampilkan connection string: bisa berisi password.
  throw new Error('DATABASE_URL harus diawali postgresql://, postgres://, atau pglite:.');
}

module.exports = { DEFAULT_POOL_MAX, createDatabase, createPool, readPoolMax };
