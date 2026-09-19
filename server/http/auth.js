// Pengenalan pemanggil untuk satu permintaan.
//
// Hasil pemeriksaan sesi disimpan selama permintaan itu berlangsung, karena satu
// route bisa menanyakannya lebih dari sekali. Token tidak berubah di tengah
// permintaan, jadi menyimpannya aman dan menghemat satu query database.

const crypto = require('node:crypto');
const identity = require('../identity-service.js');
const registrationDomain = require('../../website/registration-domain.js');

function createAccessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Perbandingan dengan waktu tetap, supaya lamanya perbandingan tidak membocorkan
// berapa banyak karakter awal yang sudah tepat.
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getBearerToken(request) {
  const header = String(request.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

const STAFF_ROLES = Object.freeze([identity.ROLES.ADMIN, identity.ROLES.REGISTRATION_OFFICER]);

function registrationRoleOf(actor) {
  return actor.role === identity.ROLES.ADMIN
    ? registrationDomain.ROLES.ADMIN
    : registrationDomain.ROLES.REGISTRATION_OFFICER;
}

function createRequestAuth({ request, identityService, registrationService, applicantService }) {
  const token = getBearerToken(request);
  let sessionPromise = null;

  function session() {
    if (!sessionPromise) {
      sessionPromise = identityService.authenticate(token);
    }
    return sessionPromise;
  }

  return {
    token,
    // Akun yang sedang login, atau null.
    async actor() {
      const result = await session();
      return result.ok ? result.value : null;
    },
    // Hasil lengkap termasuk pesan error, dipakai route /api/me.
    session,
    async isAdmin() {
      const actor = await this.actor();
      return Boolean(actor && actor.role === identity.ROLES.ADMIN);
    },
    // Petugas pendaftaran atau admin. Dikembalikan utuh supaya riwayat bisa
    // mencatat akun pelaku, bukan hanya perannya.
    async staffActor() {
      const actor = await this.actor();
      return actor && STAFF_ROLES.includes(actor.role) ? actor : null;
    },
    // Pemilik satu pendaftaran, dikenali dari token akses pendaftaran itu sendiri.
    async isCandidate(registrationId) {
      if (applicantService && typeof applicantService.authenticate === 'function') {
        const applicantSession = await applicantService.authenticate(token, registrationId);
        if (applicantSession.ok) return true;
      }
      const record = await registrationService.store.get(registrationId);
      if (!record || !record.accessTokenHash) {
        return false;
      }
      return safeEqual(hashToken(token), record.accessTokenHash);
    }
  };
}

module.exports = {
  STAFF_ROLES,
  createAccessToken,
  createRequestAuth,
  getBearerToken,
  hashToken,
  registrationRoleOf,
  safeEqual
};
