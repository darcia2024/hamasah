const crypto = require('node:crypto');
const { hashPassword, verifyPassword } = require('./identity-service.js');
const { hashToken } = require('./http/auth.js');

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createAccessCode() {
  return Array.from({ length: 10 }, () => ACCESS_CODE_ALPHABET[crypto.randomInt(ACCESS_CODE_ALPHABET.length)]).join('');
}

function createApplicantService({ registrationStore, sessionStore, prepareRecovery = null, canRecover = () => false, now = () => new Date() } = {}) {
  if (!registrationStore || !sessionStore) throw new Error('createApplicantService membutuhkan registrationStore dan sessionStore.');
  async function login(registrationId, accessCode) {
    const registration = await registrationStore.get(registrationId);
    if (!registration || !registration.accessCodeHash || !(await verifyPassword(String(accessCode || ''), registration.accessCodeHash))) {
      return { ok: false, error: 'Nomor pendaftaran atau kode akses tidak tepat.' };
    }
    return startSession(registration.registrationId, registration.accessCodeHash);
  }
  async function startSession(registrationId, verifiedCodeHash = null) {
    const registration = await registrationStore.get(registrationId);
    if (!registration) return { ok: false, error: 'Pendaftaran tidak ditemukan.' };
    const token = crypto.randomBytes(32).toString('base64url');
    const issuedAt = now();
    const session = { tokenHash: hashToken(token), registrationId: registration.id, expiresAt: new Date(issuedAt.getTime() + SESSION_TTL_MS).toISOString(), createdAt: issuedAt.toISOString() };
    if (typeof sessionStore.saveForCredential === 'function') {
      if (!(await sessionStore.saveForCredential(session, verifiedCodeHash))) return { ok: false, error: 'Kode akses berubah. Masuk dengan kode terbaru.' };
    } else {
      await sessionStore.save(session);
      // Memory/custom adapters also remove sessions if recovery overtook verification.
      if (verifiedCodeHash && (await registrationStore.get(registrationId))?.accessCodeHash !== verifiedCodeHash) {
        await sessionStore.remove(session.tokenHash);
        return { ok: false, error: 'Kode akses berubah. Masuk dengan kode terbaru.' };
      }
    }
    return { ok: true, value: { accessToken: token, registrationId: registration.registrationId } };
  }
  async function recoverAccessCode(registrationId, email) {
    // Do not rotate a credential unless its encrypted delivery can be committed too.
    if (!canRecover() || !prepareRecovery || typeof registrationStore.recoverAccessCode !== 'function') {
      return { ok: false, error: 'Pemulihan email belum tersedia.' };
    }
    const registration = await registrationStore.get(registrationId);
    const requestedEmail = String(email || '').trim().toLocaleLowerCase('id-ID');
    const registeredEmail = String(registration?.applicant?.email || '').trim().toLocaleLowerCase('id-ID');
    if (!registration || !requestedEmail || !registeredEmail || requestedEmail !== registeredEmail) {
      return { ok: false, error: 'Data pemulihan tidak cocok.' };
    }
    const accessCode = createAccessCode();
    const updatedAt = now().toISOString();
    const value = { registrationId: registration.registrationId, email: registration.applicant.email, name: registration.applicant.applicantName, accessCode };
    const notification = await prepareRecovery(value);
    await registrationStore.recoverAccessCode(registration, await hashPassword(accessCode), notification, updatedAt);
    return {
      ok: true,
      value: {
        registrationId: registration.registrationId,
        email: registration.applicant.email,
        name: registration.applicant.applicantName,
        accessCode
      }
    };
  }
  async function authenticate(token, registrationId) {
    const session = await sessionStore.get(hashToken(token || ''));
    if (!session || new Date(session.expiresAt).getTime() <= now().getTime()) return { ok: false, error: 'Sesi pendaftar berakhir.' };
    const registration = await registrationStore.get(registrationId);
    if (!registration || registration.id !== session.registrationId) return { ok: false, error: 'Akses pendaftaran tidak diizinkan.' };
    return { ok: true, value: registration };
  }
  async function recoverForStaff(registrationId, actor) {
    if (!actor || !['admin', 'registration-officer'].includes(actor.role)) return { ok: false, status: 403, error: 'Akses petugas diperlukan.' };
    const registration = await registrationStore.get(registrationId);
    if (!registration) return { ok: false, status: 404, error: 'Pendaftaran tidak ditemukan.' };
    const accessCode = createAccessCode();
    await registrationStore.recoverAccessCode(registration, await hashPassword(accessCode), null, now().toISOString(), 'manual');
    return { ok: true, value: { registrationId: registration.registrationId, name: registration.applicant.applicantName,
      phone: registration.applicant.phone, accessCode } };
  }
  async function logout(token) {
    if (typeof sessionStore.remove === 'function') await sessionStore.remove(hashToken(token || ''));
    return { ok: true };
  }
  async function purgeExpiredSessions() {
    if (typeof sessionStore.removeExpired !== 'function') return 0;
    return sessionStore.removeExpired(now().toISOString());
  }
  return Object.freeze({ authenticate, createAccessCode, hashAccessCode: hashPassword, login, logout, purgeExpiredSessions, recoverAccessCode, recoverForStaff, startSession });
}

module.exports = { ACCESS_CODE_ALPHABET, SESSION_TTL_MS, createAccessCode, createApplicantService };
