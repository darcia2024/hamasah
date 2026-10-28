'use strict';
// Enkripsi kolom sensitif (nomor paspor dan iqamah) sebelum disimpan ke database.
//
// AES-256-GCM dengan nonce acak per nilai. Format simpanan: "enc1.<nonce>.<tag>.<isi>" (base64url).
// Kunci diturunkan dari rahasia server, bukan disimpan di database, jadi salinan database saja
// tidak cukup untuk membaca nomornya. Nilai tanpa awalan "enc1." dianggap teks biasa dari sebelum
// enkripsi dipakai dan tetap terbaca; nilai itu terenkripsi saat berikutnya disimpan.
//
// Kunci: IDENTITY_FIELD_KEY bila ada, kalau tidak NOTIFICATION_PAYLOAD_KEY, lalu IP_HASH_SECRET
// (wajib di produksi). Mengganti kunci membuat nomor lama tidak terbaca; simpan kunci dengan aman
// dan pakai IDENTITY_FIELD_KEY tersendiri supaya tidak ikut berubah saat rahasia lain diputar.

const crypto = require('node:crypto');

const AWALAN = 'enc1.';

function turunkanKunci(rahasia) {
  return crypto.createHash('sha256').update(`hamasah:identity-field:${String(rahasia || '')}`).digest();
}

function enkripsi(nilai, rahasia) {
  const teks = String(nilai == null ? '' : nilai);
  if (!teks) return '';
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', turunkanKunci(rahasia), nonce);
  const isi = Buffer.concat([cipher.update(teks, 'utf8'), cipher.final()]);
  return `${AWALAN}${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${isi.toString('base64url')}`;
}

// Mengembalikan teks asli, atau '' bila kuncinya salah atau isinya rusak (jangan melempar galat ke layar).
function dekripsi(tersimpan, rahasia) {
  const teks = String(tersimpan == null ? '' : tersimpan);
  if (!teks) return '';
  if (!teks.startsWith(AWALAN)) return teks;
  const [nonce, tag, isi] = teks.slice(AWALAN.length).split('.');
  if (!nonce || !tag || !isi) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', turunkanKunci(rahasia), Buffer.from(nonce, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(isi, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function terenkripsi(tersimpan) {
  return String(tersimpan || '').startsWith(AWALAN);
}

module.exports = { enkripsi, dekripsi, terenkripsi, AWALAN };
