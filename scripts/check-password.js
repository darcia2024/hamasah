// Memeriksa apakah sebuah kata sandi cocok dengan hash yang tersimpan di database,
// dengan cara yang sama persis seperti login. Berjalan di laptop; tidak ada yang dikirim.
//
//   node scripts/check-password.js            ketikan kata sandi disembunyikan
//   node scripts/check-password.js --tampil   ketikan kata sandi terlihat
//
// Hash diambil dari Supabase:
//   SELECT password_hash FROM accounts WHERE email = 'email-akun';
const readline = require('node:readline');
const { verifyPassword } = require('../server/identity-service.js');

const TAMPIL = process.argv.includes('--tampil');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let muted = false;
rl._writeToOutput = function writeToOutput(text) {
  if (!muted) rl.output.write(text);
};
const lines = rl[Symbol.asyncIterator]();

async function ask(question, hidden) {
  process.stdout.write(question);
  muted = hidden;
  const { value } = await lines.next();
  muted = false;
  if (hidden && process.stdin.isTTY) process.stdout.write('\n');
  return value === undefined ? '' : value;
}

async function main() {
  const hash = (await ask('Tempel hash dari database: ', false)).trim().replace(/^'+|'+$/g, '');
  if (!hash.startsWith('scrypt$')) throw new Error('Itu bukan hash kata sandi aplikasi (harus diawali scrypt$).');
  console.log(`Hash terbaca ${hash.length} karakter.`);
  const password = await ask('Kata sandi yang dipakai login: ', !TAMPIL);
  console.log(`Kata sandi terbaca ${password.length} karakter.`);
  if (await verifyPassword(password, hash)) {
    console.log('\nCOCOK. Kata sandi ini benar untuk hash tersebut.');
    console.log('Bila login tetap gagal: periksa email, isian otomatis browser, atau tunggu 15 menit bila sempat terkunci.');
  } else {
    console.log('\nTIDAK COCOK. Hash di database dibuat dari kata sandi lain.');
    console.log('Buat hash baru dengan: node scripts/hash-password.js --tampil, lalu UPDATE ke database.');
  }
}

main().catch((error) => {
  console.error(`Gagal: ${error.message}`);
  process.exitCode = 1;
}).finally(() => rl.close());
