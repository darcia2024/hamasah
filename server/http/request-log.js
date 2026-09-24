// Kode permintaan dan log satu baris JSON.
//
// Setiap respons membawa header X-Request-Id. Saat terjadi error 500, kode yang
// sama muncul di pesan untuk pengguna dan di log server, jadi wali atau petugas
// cukup menyebutkan kodenya dan baris log yang tepat bisa dicari di dashboard
// hosting (misalnya kolom pencarian log Vercel).
//
// Kodenya pendek dan mudah didiktekan lewat telepon: awalan HI- lalu delapan
// karakter tanpa huruf atau angka yang mirip (0/O, 1/I/L).

const crypto = require('node:crypto');

const ALFABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PANJANG_KODE = 8;

function createRequestId() {
  const acak = crypto.randomBytes(PANJANG_KODE);
  let kode = '';
  for (const byte of acak) {
    // 31 karakter tidak membagi 256 dengan pas; selisih peluangnya kecil sekali
    // dan tidak berarti apa-apa untuk kode pelacak, yang bukan rahasia.
    kode += ALFABET[byte % ALFABET.length];
  }
  return `HI-${kode}`;
}

// Satu kejadian = satu baris JSON, supaya bisa difilter per kolom di log hosting.
// Hanya path yang dicatat, bukan query string, karena query bisa memuat token.
function logEvent(level, event, fields = {}, sink = console) {
  const baris = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') {
    sink.error(baris);
  } else {
    sink.log(baris);
  }
}

function errorFields(error) {
  if (!(error instanceof Error)) {
    return { error: String(error) };
  }
  return { error: error.message, stack: error.stack };
}

module.exports = { createRequestId, errorFields, logEvent };
