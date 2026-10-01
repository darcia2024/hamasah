// Membuat hash kata sandi dengan algoritma aplikasi (scrypt, server/identity-service.js),
// untuk membuat akun langsung lewat SQL Supabase, misalnya admin pertama.
//
//   node scripts/hash-password.js
//
// Kata sandi diketik dua kali tanpa tampil di layar dan tidak tersimpan di riwayat
// terminal. Yang dicetak hanya hash-nya; tempel ke kolom password_hash.
const readline = require('node:readline');
const { hashPassword, validatePassword, verifyPassword } = require('../server/identity-service.js');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = function writeToOutput(text) {
      if (!muted) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const password = await askHidden('Kata sandi baru (12 sampai 128 karakter): ');
  const problem = validatePassword(password);
  if (problem) throw new Error(problem);
  const repeat = await askHidden('Ulangi kata sandi: ');
  if (repeat !== password) throw new Error('Kedua kata sandi tidak sama.');
  const hash = await hashPassword(password);
  if (!(await verifyPassword(password, hash))) throw new Error('Hash gagal diverifikasi.');
  console.log('\nHash kata sandi (tempel ke password_hash):\n');
  console.log(hash);
}

main().catch((error) => {
  console.error(`Gagal: ${error.message}`);
  process.exitCode = 1;
});
