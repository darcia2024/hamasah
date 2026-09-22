// Parameter scrypt yang diperkuat dan kompatibilitas hash lama (Task R8.4).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { hashPassword, verifyPassword } = require('./identity-service.js');

async function run() {
  // Hash baru memuat parameternya.
  const mulai = process.hrtime.bigint();
  const baru = await hashPassword('kata-sandi-uji-kuat');
  const msHash = Number(process.hrtime.bigint() - mulai) / 1e6;
  assert.match(baru, /^scrypt\$N=65536,r=8,p=2\$[\w-]{22}\$[\w-]{86}$/);
  assert.equal(await verifyPassword('kata-sandi-uji-kuat', baru), true);
  assert.equal(await verifyPassword('kata-sandi-salah', baru), false);

  // Hash format lama (tanpa parameter, default Node N=2^14) tetap dapat diverifikasi.
  const salt = crypto.randomBytes(16);
  const lama = `scrypt$${salt.toString('base64url')}$${crypto.scryptSync('sandi-lama-uji', salt, 64).toString('base64url')}`;
  assert.equal(await verifyPassword('sandi-lama-uji', lama), true);
  assert.equal(await verifyPassword('sandi-lain', lama), false);

  // Hash rusak atau parameter berlebihan ditolak tanpa mencoba menghitung.
  for (const rusak of ['', 'bcrypt$x$y', 'scrypt$x', 'scrypt$N=3,r=8,p=1$a$b', 'scrypt$N=4194304,r=8,p=1$a$b', 'scrypt$N=65536,r=8$a$b', 'scrypt$a$b$c$d']) {
    assert.equal(await verifyPassword('apa-saja', rusak), false, rusak);
  }

  console.log(`password hash tests passed (hash baru ${msHash.toFixed(0)} ms)`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
