// Pencatatan kejadian penting.
//
// Dua aturan yang tidak boleh dilanggar:
//
// 1. Metadata hanya berisi hal yang boleh dibaca ulang berbulan-bulan kemudian.
//    Kata sandi, token, isi dokumen, dan nomor telepon lengkap tidak pernah masuk.
//    Penyaringnya ada di bawah, jadi pemanggil yang lalai tetap tidak bisa bocor.
//
// 2. Kegagalan mencatat tidak boleh menggagalkan pekerjaan utama. Kalau penulisan
//    audit gagal, errornya dicetak ke stderr dan permintaan tetap dilanjutkan.
//    Alasannya: database yang bermasalah tidak boleh membuat wali gagal login.
//    Konsekuensinya harus disadari, yaitu catatan bisa berlubang saat database
//    bermasalah, dan itu sebabnya kegagalannya dicetak, bukan ditelan diam-diam.

const crypto = require('node:crypto');

const ACTIONS = Object.freeze({
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  LOGIN_RATE_LIMITED: 'auth.login.rate-limited',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout-all',
  ACCOUNT_ACTIVE_CHANGED: 'account.active-changed',
  PASSWORD_RESET_REQUESTED: 'auth.password-reset.requested',
  PASSWORD_RESET_COMPLETED: 'auth.password-reset.completed',
  ACCOUNT_CREATED: 'account.created',
  ACCOUNT_INVITED: 'account.invited',
  ACCOUNT_INVITATION_ACCEPTED: 'account.invitation-accepted',
  ACCOUNT_INVITATION_RENEWED: 'account.invitation-renewed',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',
  ACCOUNT_BOOTSTRAPPED: 'account.bootstrapped',
  REGISTRATION_CREATED: 'registration.created',
  REGISTRATION_STATUS_CHANGED: 'registration.status-changed',
  REGISTRATION_DOCUMENT_ADDED: 'registration.document-added',
  REGISTRATION_DOCUMENT_REVIEWED: 'registration.document-reviewed',
  REGISTRATION_DOCUMENT_DELETED: 'registration.document-deleted',
  REGISTRATION_CONVERTED: 'registration.converted',
  REGISTRATION_NOTE_ADDED: 'registration.note-added',
  STUDENT_CREATED: 'student.created',
  STUDENT_ACCOUNTS_LINKED: 'student.accounts-linked',
  STUDENT_PLACEMENT_CHANGED: 'student.placement-changed',
  STUDENT_REPORT_EXPORTED: 'student.report-exported',
  DORMITORY_CREATED: 'dormitory.created',
  DORMITORY_STAFF_ASSIGNED: 'dormitory.staff-assigned',
  DORMITORY_STAFF_UNASSIGNED: 'dormitory.staff-unassigned',
  FILE_UPLOADED: 'file.uploaded',
  FILE_DOWNLOADED: 'file.downloaded',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_PAID: 'invoice.paid'
  ,INVOICE_CORRECTED: 'invoice.corrected'
  ,INVOICE_VOIDED: 'invoice.voided'
  ,INVENTORY_MOVED: 'inventory.moved'
  ,VISA_DOCUMENT_ADDED: 'visa.document-added'
});

const ACTION_VALUES = Object.freeze(Object.values(ACTIONS));

// Kunci yang tidak boleh ada di metadata, apa pun alasannya.
const FORBIDDEN_KEYS = Object.freeze([
  'password', 'passwordhash', 'password_hash', 'katasandi', 'kata_sandi',
  'token', 'accesstoken', 'access_token', 'accesstokenhash', 'refreshtoken',
  'secret', 'apikey', 'api_key', 'authorization',
  'phone', 'phonee164', 'phone_e164', 'guardianphone', 'guardian_phone', 'nomor', 'telepon',
  'content', 'body', 'isi', 'storagekey', 'storage_key'
]);

const MAX_METADATA_VALUE_LENGTH = 200;
const DEFAULT_RETENTION_DAYS = 365;

function isForbidden(key) {
  const normal = String(key).toLocaleLowerCase('en-US').replace(/[^a-z0-9_]/g, '');
  return FORBIDDEN_KEYS.some((terlarang) => normal === terlarang.replace(/[^a-z0-9_]/g, ''));
}

// Menyaring metadata: hanya nilai sederhana, dipendekkan, tanpa kunci terlarang.
// Objek bersarang tidak diterima supaya tidak ada yang menyelipkan seluruh isi
// request ke dalam catatan.
function sanitizeMetadata(metadata) {
  const hasil = {};
  for (const [kunci, nilai] of Object.entries(metadata || {})) {
    if (isForbidden(kunci) || nilai === undefined || nilai === null) {
      continue;
    }
    if (typeof nilai === 'number' || typeof nilai === 'boolean') {
      hasil[kunci] = nilai;
      continue;
    }
    if (typeof nilai === 'string') {
      hasil[kunci] = nilai.length > MAX_METADATA_VALUE_LENGTH ? `${nilai.slice(0, MAX_METADATA_VALUE_LENGTH)}…` : nilai;
      continue;
    }
    if (Array.isArray(nilai) && nilai.every((isi) => typeof isi === 'string' || typeof isi === 'number')) {
      hasil[kunci] = nilai.slice(0, 20);
    }
    // Objek dan tipe lain sengaja dibuang.
  }
  return hasil;
}

function createAuditService(options = {}) {
  const store = options.store;
  if (!store) {
    throw new Error('createAuditService membutuhkan store.');
  }
  const now = options.now || function currentTime() { return new Date().toISOString(); };
  const logger = options.logger || console;
  // HMAC, bukan hash biasa: tanpa kunci, daftar alamat IP yang mungkin cukup pendek
  // untuk dicoba satu per satu sampai ketemu.
  const ipHashSecret = options.ipHashSecret || '';

  function hashIp(ip) {
    if (!ip || !ipHashSecret) {
      return null;
    }
    return crypto.createHmac('sha256', ipHashSecret).update(String(ip)).digest('hex');
  }

  async function record(event) {
    try {
      const action = String(event && event.action ? event.action : '');
      if (!ACTION_VALUES.includes(action)) {
        // Nama aksi karangan membuat penyaringan di layar audit tidak bisa dipercaya.
        throw new Error(`Aksi audit tidak dikenal: ${action}`);
      }
      await store.insert({
        id: crypto.randomUUID(),
        occurredAt: event.occurredAt || now(),
        actorAccountId: event.actor ? event.actor.id || null : null,
        actorRole: event.actor ? event.actor.role || null : null,
        action,
        entityType: event.entityType || null,
        entityId: event.entityId ? String(event.entityId) : null,
        ipHash: hashIp(event.ip),
        metadata: sanitizeMetadata(event.metadata)
      });
    } catch (error) {
      // Sengaja tidak dilempar ulang. Lihat catatan di atas berkas ini.
      logger.error(`[audit] Gagal mencatat kejadian: ${error.message}`);
    }
  }

  async function list(query, actor) {
    if (!actor || actor.role !== 'admin') {
      return { ok: false, error: 'Akses admin diperlukan.' };
    }
    return { ok: true, value: await store.list(query || {}) };
  }

  // Dipanggil job harian. Mengembalikan jumlah baris yang dihapus.
  async function purgeOlderThan(days) {
    const hari = Number.isInteger(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
    const batas = new Date(new Date(now()).getTime() - hari * 24 * 60 * 60 * 1000).toISOString();
    return store.deleteBefore(batas);
  }

  return Object.freeze({ list, purgeOlderThan, record, sanitizeMetadata });
}

module.exports = { ACTIONS, ACTION_VALUES, DEFAULT_RETENTION_DAYS, createAuditService, sanitizeMetadata };
