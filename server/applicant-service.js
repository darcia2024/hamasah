const crypto = require('node:crypto');
const { hashPassword, verifyPassword } = require('./identity-service.js');
const { hashToken } = require('./http/auth.js');

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createAccessCode() {
  return Array.from({ length: 10 }, () => ACCESS_CODE_ALPHABET[crypto.randomInt(ACCESS_CODE_ALPHABET.length)]).join('');
}

function createApplicantService({ registrationStore, sessionStore, now = () => new Date() } = {}) {
  if (!registrationStore || !sessionStore) throw new Error('createApplicantService membutuhkan registrationStore dan sessionStore.');
  async function login(registrationId, accessCode) {
    const registration = await registrationStore.get(registrationId);
    if (!registration || !registration.accessCodeHash || !(await verifyPassword(String(accessCode || ''), registration.accessCodeHash))) {
      return { ok: false, error: 'Nomor pendaftaran atau kode akses tidak tepat.' };
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const issuedAt = now();
    await sessionStore.save({ tokenHash: hashToken(token), registrationId: registration.id, expiresAt: new Date(issuedAt.getTime() + SESSION_TTL_MS).toISOString(), createdAt: issuedAt.toISOString() });
    return { ok: true, value: { accessToken: token, registrationId: registration.registrationId } };
  }
  async function authenticate(token, registrationId) {
    const session = await sessionStore.get(hashToken(token || ''));
    if (!session || new Date(session.expiresAt).getTime() <= now().getTime()) return { ok: false, error: 'Sesi pendaftar berakhir.' };
    const registration = await registrationStore.get(registrationId);
    if (!registration || registration.id !== session.registrationId) return { ok: false, error: 'Akses pendaftaran tidak diizinkan.' };
    return { ok: true, value: registration };
  }
  return Object.freeze({ authenticate, createAccessCode, hashAccessCode: hashPassword, login });
}

module.exports = { ACCESS_CODE_ALPHABET, SESSION_TTL_MS, createAccessCode, createApplicantService };
