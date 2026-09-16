// Nomor dokumen resmi (pendaftaran, invoice, kuitansi) diambil dari tabel
// document_counters dengan satu perintah atomik. Dipakai bersama oleh semua store
// PostgreSQL supaya hanya ada satu cara mengambil nomor.
//
// Jangan pernah menghitung nomor dari jumlah baris: dua permintaan bersamaan akan
// membaca jumlah yang sama dan mendapat nomor kembar, dan nomor bisa mundur kalau
// ada baris yang dihapus.

async function nextSequence(runner, scope, year) {
  const { rows } = await runner.query(
    `INSERT INTO document_counters (scope, year, last_value) VALUES ($1, $2, 1)
     ON CONFLICT (scope, year) DO UPDATE SET
       last_value = document_counters.last_value + 1,
       updated_at = now()
     RETURNING last_value`,
    [scope, year]
  );
  // BIGINT dibaca sebagai string oleh pg dan sebagai number oleh PGlite.
  return Number(rows[0].last_value);
}

module.exports = { nextSequence };
