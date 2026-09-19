const crypto = require('node:crypto');

function deriveNotificationPayloadKey(secret) {
  return crypto.createHash('sha256').update(`hamasah:notification:${String(secret || '')}`).digest();
}

function encryptNotificationPayload(payload, secret) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveNotificationPayloadKey(secret), nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    nonce: nonce.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url')
  };
}

function decryptNotificationPayload(record, secret) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveNotificationPayloadKey(secret),
    Buffer.from(record.nonce, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(record.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

module.exports = { deriveNotificationPayloadKey, encryptNotificationPayload, decryptNotificationPayload };
