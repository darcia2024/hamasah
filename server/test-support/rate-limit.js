// Pembatas laju dengan batas yang dilonggarkan, untuk test yang menguji hal LAIN
// dan kebetulan mengirim banyak permintaan dari satu alamat (127.0.0.1).
//
// Jangan dipakai untuk menguji pembatasnya sendiri. Perilaku batas yang sebenarnya
// diuji di server/rate-limit.test.js dan lewat satu skenario nyata di
// server/app.test.js.

const { RULES, createRateLimiter } = require('../rate-limit.js');

function createRelaxedRateLimiter(overrides = {}) {
  const rules = {};
  for (const [nama, aturan] of Object.entries(RULES)) {
    rules[nama] = { limit: 1000000, windowMs: aturan.windowMs };
  }
  for (const [nama, aturan] of Object.entries(overrides)) {
    rules[nama] = aturan;
  }
  // cleanup dimatikan supaya tidak ada timer yang menggantung di proses test.
  return createRateLimiter({ rules, cleanup: false });
}

module.exports = { createRelaxedRateLimiter };
