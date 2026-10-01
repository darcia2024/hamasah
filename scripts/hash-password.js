// Membuat hash kata sandi dengan algoritma aplikasi (scrypt, server/identity-service.js),
// untuk membuat akun atau mengganti kata sandi langsung lewat SQL Supabase.
//
//   node scripts/hash-password.js            ketikan disembunyikan
//   node scripts/hash-password.js --tampil   ketikan terlihat (pastikan tidak ada yang melihat layar)
//
// Kata sandi tidak tersimpan di riwayat terminal. Yang dicetak hanya hash-nya, plus
// jumlah karakter yang terbaca supaya salah ketik yang tidak terlihat bisa ketahuan.
const readline = require('node:readline');
const { hashPassword, validatePassword, verifyPassword } = require('../server/identity-service.js');

const TAMPIL = process.argv.includes('--tampil');

// Satu pembaca untuk semua pertanyaan: membuka pembaca baru per pertanyaan membuat
// input yang sudah terbaca (mis. ditempel sekaligus) hilang.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let muted = false;
if (!TAMPIL) {
  rl._writeToOutput = function writeToOutput(text) {
    if (!muted) rl.output.write(text);
  };
}

// Baris dibaca lewat antrean, supaya ketikan yang datang sebelum pertanyaan berikutnya
// muncul (mis. ditempel sekaligus) tidak hilang.
const lines = rl[Symbol.asyncIterator]();

async function ask(question) {
  process.stdout.write(question);
  muted = true;
  const { value } = await lines.next();
  muted = false;
  if (!TAMPIL && process.stdin.isTTY) process.stdout.write('\n');
  return value === undefined ? '' : value;
}

async function main() {
  const password = await ask('Kata sandi baru (12 sampai 128 karakter): ');
  console.log(`Terbaca ${password.length} karakter.`);
  if (password !== password.trim()) {
    throw new Error('Ada spasi di awal atau akhir kata sandi. Ulangi tanpa spasi.');
  }
  const problem = validatePassword(password);
  if (problem) throw new Error(problem);
  const repeat = await ask('Ulangi kata sandi: ');
  if (repeat !== password) throw new Error('Kedua kata sandi tidak sama.');
  const hash = await hashPassword(password);
  if (!(await verifyPassword(password, hash))) throw new Error('Hash gagal diverifikasi.');
  console.log(`\nHash kata sandi (${hash.length} karakter, tempel UTUH ke password_hash):\n`);
  console.log(hash);
}

main().catch((error) => {
  console.error(`Gagal: ${error.message}`);
  process.exitCode = 1;
}).finally(() => rl.close());
