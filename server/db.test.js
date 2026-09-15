const assert = require('node:assert/strict');
const { createDatabase, createPool } = require('./db.js');

const UNREACHABLE_URL = 'postgresql://uji:uji@127.0.0.1:1/uji';

function withTimeout(promise, milliseconds, label) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} melewati batas ${milliseconds}ms.`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Pool palsu untuk menguji protokol transaksi mode PostgreSQL tanpa server.
function createFakePool({ failRollback = false } = {}) {
  const log = [];
  const client = {
    async query(sql) {
      log.push(sql);
      if (sql === 'ROLLBACK' && failRollback) {
        throw new Error('koneksi putus');
      }
      return { rows: [] };
    },
    release(error) {
      log.push(error ? 'release(buang)' : 'release');
    }
  };
  const pool = {
    connects: 0,
    ended: false,
    async connect() {
      pool.connects += 1;
      log.push('connect');
      return client;
    },
    async query(sql) {
      log.push(`pool:${sql}`);
      return { rows: [] };
    },
    async end() {
      pool.ended = true;
    }
  };
  return { pool, log };
}

async function testConnectionStringValidation() {
  assert.throws(() => createDatabase({}), /DATABASE_URL/);
  assert.throws(() => createDatabase({ connectionString: 'pglite:' }), /pglite:memory/);

  let message = '';
  try {
    createDatabase({ connectionString: 'mysql://pengguna:rahasia-sekali@host/db' });
  } catch (error) {
    message = error.message;
  }
  assert.match(message, /postgresql:\/\//);
  assert.equal(message.includes('rahasia-sekali'), false, 'Pesan error tidak boleh memuat connection string.');
}

async function testPoolConfiguration() {
  assert.throws(() => createPool(UNREACHABLE_URL, '0'), /DATABASE_POOL_MAX/);
  assert.throws(() => createPool(UNREACHABLE_URL, 'banyak'), /DATABASE_POOL_MAX/);

  const defaultPool = createPool(UNREACHABLE_URL, undefined);
  assert.equal(defaultPool.options.max, 5);
  assert.equal(defaultPool.listenerCount('error'), 1, 'Pool wajib punya handler error agar proses tidak crash.');
  await defaultPool.end();

  const customPool = createPool(UNREACHABLE_URL, '12');
  assert.equal(customPool.options.max, 12);
  await customPool.end();

  const database = createDatabase({ connectionString: UNREACHABLE_URL });
  assert.equal(database.kind, 'postgres');
  await database.close();
}

async function testPostgresTransactionUsesOneClient() {
  const { pool, log } = createFakePool();
  const database = createDatabase({ pool });
  const result = await database.withTransaction(async (tx) => {
    await tx.query('INSERT satu');
    await tx.exec('CREATE TABLE satu (id INT); CREATE TABLE dua (id INT);');
    await tx.query('INSERT dua');
    return 'selesai';
  });
  assert.equal(result, 'selesai');
  assert.deepEqual(log, [
    'connect',
    'BEGIN',
    'INSERT satu',
    'CREATE TABLE satu (id INT); CREATE TABLE dua (id INT);',
    'INSERT dua',
    'COMMIT',
    'release'
  ]);
  assert.equal(pool.connects, 1);

  await database.close();
  assert.equal(pool.ended, false, 'Pool dari luar tidak boleh ditutup oleh database.');
}

async function testPostgresTransactionRollsBack() {
  const { pool, log } = createFakePool();
  const database = createDatabase({ pool });
  await assert.rejects(
    database.withTransaction(async (tx) => {
      await tx.query('INSERT satu');
      throw new Error('gagal di tengah');
    }),
    /gagal di tengah/
  );
  assert.deepEqual(log, ['connect', 'BEGIN', 'INSERT satu', 'ROLLBACK', 'release']);
}

async function testBrokenRollbackDiscardsClient() {
  const { pool, log } = createFakePool({ failRollback: true });
  const database = createDatabase({ pool });
  await assert.rejects(
    database.withTransaction(async () => {
      throw new Error('gagal awal');
    }),
    /gagal awal/
  );
  assert.deepEqual(log, ['connect', 'BEGIN', 'ROLLBACK', 'release(buang)']);
}

async function testPglite() {
  const database = createDatabase({ connectionString: 'pglite:memory' });
  try {
    assert.equal(database.kind, 'pglite');
    await database.exec(`
      CREATE TABLE catatan (id INTEGER PRIMARY KEY, isi TEXT NOT NULL);
      CREATE TABLE log_uji (pesan TEXT NOT NULL);
    `);
    await database.query('INSERT INTO catatan (id, isi) VALUES ($1, $2)', [1, 'awal']);

    // Commit: data dari transaksi tersimpan.
    const jumlah = await database.withTransaction(async (tx) => {
      await tx.query('INSERT INTO catatan (id, isi) VALUES ($1, $2)', [2, 'dari transaksi']);
      const { rows } = await tx.query('SELECT count(*)::int AS jumlah FROM catatan');
      return rows[0].jumlah;
    });
    assert.equal(jumlah, 2);

    // exec di dalam transaksi menerima SQL berisi banyak statement (dipakai migration runner).
    await database.withTransaction(async (tx) => {
      await tx.exec('CREATE TABLE satu (id INT); CREATE TABLE dua (id INT);');
    });
    const tabel = await database.query(
      "SELECT count(*)::int AS jumlah FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('satu', 'dua')"
    );
    assert.equal(tabel.rows[0].jumlah, 2);

    // SQL multi-statement yang gagal di tengah dibatalkan seluruhnya.
    await assert.rejects(
      database.withTransaction(async (tx) => {
        await tx.exec('CREATE TABLE harus_hilang (id INT); SELECT * FROM tabel_tidak_ada;');
      }),
      /tabel_tidak_ada/
    );
    const hilang = await database.query("SELECT to_regclass('public.harus_hilang') AS relasi");
    assert.equal(hilang.rows[0].relasi, null);

    // Rollback: perubahan sebelum error dibatalkan.
    await assert.rejects(
      database.withTransaction(async (tx) => {
        await tx.query("UPDATE catatan SET isi = 'diubah' WHERE id = 1");
        await tx.query('INSERT INTO catatan (id, isi) VALUES ($1, $2)', [1, 'duplikat']);
      }),
      /duplicate key/
    );
    const { rows } = await database.query('SELECT isi FROM catatan WHERE id = 1');
    assert.equal(rows[0].isi, 'awal');

    // Antrean: transaksi yang menunggu dan query biasa berjalan bersamaan tanpa macet.
    const order = [];
    await withTimeout(
      Promise.all([
        database.withTransaction(async (tx) => {
          order.push('transaksi mulai');
          await new Promise((resolve) => setTimeout(resolve, 50));
          await tx.query("INSERT INTO log_uji (pesan) VALUES ('dari transaksi')");
          order.push('transaksi selesai');
        }),
        database.query("INSERT INTO log_uji (pesan) VALUES ('dari luar')").then(() => order.push('query luar selesai'))
      ]),
      5000,
      'Transaksi dan query bersamaan'
    );
    const logCount = await database.query('SELECT count(*)::int AS jumlah FROM log_uji');
    assert.equal(logCount.rows[0].jumlah, 2);
    assert.equal(order.length, 3);
  } finally {
    await database.close();
  }
}

async function run() {
  await testConnectionStringValidation();
  await testPoolConfiguration();
  await testPostgresTransactionUsesOneClient();
  await testPostgresTransactionRollsBack();
  await testBrokenRollbackDiscardsClient();
  await testPglite();
  console.log('database layer tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
