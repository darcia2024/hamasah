const crypto = require('node:crypto');
const { hashPassword, ROLES } = require('./identity-service.js');
const { encryptNotificationPayload } = require('./notification-payload.js');

const CONVERSION_STATUSES = Object.freeze(['ready-for-departure', 'completed']);
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function createRegistrationConversionService({ database, notificationPayloadKey = 'development-only-key', now = () => new Date() } = {}) {
  if (!database) throw new Error('createRegistrationConversionService membutuhkan database.');

  async function conversionSummary(tx, studentId, studentAccountId, parentAccountId) {
    const studentResult = await tx.query(
      'SELECT id, name, program, city, status, student_account_id, registration_id FROM students WHERE id = $1',
      [studentId]
    );
    const accounts = [];
    for (const accountId of [studentAccountId, parentAccountId]) {
      const accountResult = await tx.query(
        `SELECT a.id, a.email, a.role, a.active,
                CASE WHEN a.active THEN 'active'
                     WHEN EXISTS (SELECT 1 FROM notification_outbox n WHERE n.account_id = a.id AND n.status IN ('pending', 'processing')) THEN 'invitation-pending'
                     WHEN EXISTS (SELECT 1 FROM notification_outbox n WHERE n.account_id = a.id AND n.status = 'sent') THEN 'invitation-sent'
                     ELSE 'invitation-not-queued' END AS onboarding_status
         FROM accounts a WHERE a.id = $1`,
        [accountId]
      );
      if (accountResult.rows[0]) {
        const row = accountResult.rows[0];
        accounts.push({ id: row.id, email: row.email, role: row.role, active: Boolean(row.active), onboardingStatus: row.onboarding_status });
      }
    }
    const student = studentResult.rows[0];
    return {
      student: student ? { id: student.id, name: student.name, program: student.program, city: student.city, status: student.status } : null,
      accounts
    };
  }

  async function convert(registrationId, actor) {
    if (!actor || ![ROLES.ADMIN, ROLES.REGISTRATION_OFFICER].includes(actor.role)) {
      return { ok: false, status: 403, error: 'Akses petugas pendaftaran diperlukan.' };
    }

    try {
      return await database.withTransaction(async (tx) => {
        const locked = await tx.query(
          `SELECT id, registration_id, applicant_name, program, city, status, email, birth_date, gender,
                  guardian_name, guardian_email, row_version
           FROM registrations WHERE registration_id = $1 FOR UPDATE`,
          [registrationId]
        );
        const registration = locked.rows[0];
        if (!registration) return { ok: false, error: 'Pendaftaran tidak ditemukan.' };

        const existing = await tx.query(
          'SELECT id, student_account_id FROM students WHERE registration_id = $1 FOR UPDATE',
          [registration.id]
        );
        if (existing.rows[0]) {
          const parent = await tx.query('SELECT parent_account_id FROM student_parent_accounts WHERE student_id = $1 LIMIT 1', [existing.rows[0].id]);
          const summary = await conversionSummary(tx, existing.rows[0].id, existing.rows[0].student_account_id, parent.rows[0] && parent.rows[0].parent_account_id);
          return { ok: true, value: { studentId: existing.rows[0].id, alreadyConverted: true, ...summary } };
        }
        if (!CONVERSION_STATUSES.includes(registration.status)) {
          return { ok: false, error: 'Pendaftaran belum memenuhi syarat untuk dikonversi menjadi santri.' };
        }

        const studentEmail = normalizeEmail(registration.email);
        const parentEmail = normalizeEmail(registration.guardian_email);
        if (!/^\S+@\S+\.\S+$/.test(studentEmail) || !/^\S+@\S+\.\S+$/.test(parentEmail)) {
          return { ok: false, error: 'Email santri dan email wali wajib lengkap sebelum konversi.' };
        }
        if (studentEmail === parentEmail) {
          return { ok: false, error: 'Email santri dan wali harus berbeda.' };
        }

        const createdAt = now();
        const createdAtIso = createdAt.toISOString();
        const invitationExpiresAt = new Date(createdAt.getTime() + INVITATION_TTL_MS).toISOString();
        const accountsToInvite = [];

        async function findOrCreateAccount(email, name, role) {
          const found = await tx.query('SELECT id, role, active FROM accounts WHERE email = $1 FOR UPDATE', [email]);
          if (found.rows[0]) {
            if (found.rows[0].role !== role) {
              throw new Error(`Email ${email} sudah dipakai akun dengan peran lain.`);
            }
            return found.rows[0].id;
          }
          const accountId = crypto.randomUUID();
          const invitationToken = crypto.randomBytes(32).toString('base64url');
          const invitationTokenHash = crypto.createHash('sha256').update(invitationToken).digest('hex');
          await tx.query(
            `INSERT INTO accounts (id, email, name, role, active, password_hash, invitation_token_hash,
              invitation_expires_at, invited_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7, $8, $8, $8)`,
            [accountId, email, String(name || email), role, await hashPassword(crypto.randomBytes(48).toString('base64url')),
              invitationTokenHash, invitationExpiresAt, createdAtIso]
          );
          accountsToInvite.push({ id: accountId, email, role, invitationToken });
          return accountId;
        }

        const studentAccountId = await findOrCreateAccount(studentEmail, registration.applicant_name, ROLES.STUDENT);
        const parentAccountId = await findOrCreateAccount(parentEmail, registration.guardian_name || 'Wali Santri', ROLES.PARENT);
        const studentId = crypto.randomUUID();
        await tx.query(
          `INSERT INTO students (id, name, program, city, join_date, status, gender, student_account_id,
             registration_id, birth_date, media_consent, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, FALSE, $10, $10)`,
          [studentId, registration.applicant_name, registration.program, registration.city || 'Kairo', createdAtIso.slice(0, 10),
            registration.gender || null, studentAccountId, registration.id, registration.birth_date || null, createdAtIso]
        );
        await tx.query(
          'INSERT INTO student_parent_accounts (student_id, parent_account_id) VALUES ($1, $2)',
          [studentId, parentAccountId]
        );
        for (const account of accountsToInvite) {
          const encrypted = encryptNotificationPayload(
            { accountId: account.id, email: account.email, invitationToken: account.invitationToken },
            notificationPayloadKey
          );
          await tx.query(
            `INSERT INTO notification_outbox (id, notification_type, recipient_email, provider, status, attempts, created_at, updated_at, account_id, payload_ciphertext, payload_nonce, payload_tag)
             VALUES ($1, 'account-invitation', $2, 'pending', 'pending', 0, $3, $3, $4, $5, $6, $7)`,
            [crypto.randomUUID(), account.email, createdAtIso, account.id, encrypted.ciphertext, encrypted.nonce, encrypted.tag]
          );
        }
        const summary = await conversionSummary(tx, studentId, studentAccountId, parentAccountId);
        return { ok: true, value: { studentId, studentAccountId, parentAccountId, invitationsQueued: accountsToInvite.length, alreadyConverted: false, ...summary } };
      });
    } catch (error) {
      if (error && error.code === '23505') return { ok: false, error: 'Data konversi bentrok dengan akun atau santri yang sudah ada.' };
      if (error && error.message && error.message.startsWith('Email ')) return { ok: false, error: error.message };
      throw error;
    }
  }

  return Object.freeze({ convert });
}

module.exports = { CONVERSION_STATUSES, createRegistrationConversionService };
