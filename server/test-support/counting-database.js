// Membungkus database supaya setiap query terhitung, termasuk yang di dalam transaksi.
// Dipakai test yang membuktikan jumlah query tidak tumbuh mengikuti jumlah data, dan
// oleh scripts/scale-check.js. Bukan berkas test: jangan diberi pola *.test.js.
function createCountingDatabase(inner) {
  const counter = { queries: 0 };
  return {
    counter,
    query(sql, params) { counter.queries += 1; return inner.query(sql, params); },
    exec: inner.exec ? (sql) => { counter.queries += 1; return inner.exec(sql); } : undefined,
    withTransaction(work) {
      return inner.withTransaction((tx) => work({
        query(sql, params) { counter.queries += 1; return tx.query(sql, params); },
        exec: tx.exec ? (sql) => { counter.queries += 1; return tx.exec(sql); } : undefined
      }));
    },
    close: () => inner.close()
  };
}

module.exports = { createCountingDatabase };
