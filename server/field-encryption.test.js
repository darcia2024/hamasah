// Enkripsi kolom sensitif: nilai tidak terbaca tanpa kunci, tiap enkripsi berbeda, dan data lama
// berupa teks biasa tetap terbaca.
const assert = require('node:assert/strict');
const { enkripsi, dekripsi, terenkripsi, AWALAN } = require('./field-encryption.js');

const kunci = 'kunci-uji-yang-cukup-panjang-untuk-enkripsi';
const nilai = 'A1234567';
const a = enkripsi(nilai, kunci);
const b = enkripsi(nilai, kunci);
assert.ok(a.startsWith(AWALAN) && terenkripsi(a));
assert.notEqual(a, b, 'Nonce acak membuat hasilnya berbeda tiap kali.');
assert.ok(!a.includes(nilai));
assert.equal(dekripsi(a, kunci), nilai);
assert.equal(dekripsi(b, kunci), nilai);
assert.equal(dekripsi(a, 'kunci-lain'), '', 'Kunci salah tidak membocorkan apa pun.');
assert.equal(dekripsi(`${a}x`, kunci), '', 'Isi yang diubah ditolak.');
assert.equal(dekripsi('enc1.rusak', kunci), '');
assert.equal(dekripsi('IQ998877', kunci), 'IQ998877', 'Teks biasa dari sebelum enkripsi tetap terbaca.');
assert.equal(enkripsi('', kunci), '');
assert.equal(dekripsi('', kunci), '');
assert.equal(dekripsi(null, kunci), '');
assert.equal(dekripsi(enkripsi('Ünïcödé 日本', kunci), kunci), 'Ünïcödé 日本');
console.log('field encryption tests passed');
