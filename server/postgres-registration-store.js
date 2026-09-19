const crypto = require('node:crypto');
const { nextSequence } = require('./document-counters.js');

function createPostgresRegistrationStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresRegistrationStore membutuhkan database.');
  }

  async function get(registrationId) {
    const { rows } = await database.query('SELECT * FROM registrations WHERE registration_id = $1', [registrationId]);
    if (!rows[0]) return null;
    const registration = rows[0];
    const [documents, history, notes, nextSteps] = await Promise.all([
      database.query(
        `SELECT d.id, d.document_type, d.storage_key, d.status, d.uploaded_at, d.uploaded_by_role,
                d.uploaded_by_account_id, d.file_object_id, d.review_status, d.review_note, d.reviewed_at,
                d.reviewed_by_account_id, a.name AS uploaded_by_name, reviewer.name AS reviewed_by_name
         FROM registration_documents d
         LEFT JOIN accounts a ON a.id = d.uploaded_by_account_id
         LEFT JOIN accounts reviewer ON reviewer.id = d.reviewed_by_account_id
         WHERE d.registration_id = $1
         ORDER BY d.uploaded_at`,
        [registration.id]
      ),
      database.query(
        `SELECT e.previous_status, e.next_status, e.changed_at, e.changed_by_role,
                e.changed_by_account_id, a.name AS changed_by_name, e.note
         FROM registration_status_events e
         LEFT JOIN accounts a ON a.id = e.changed_by_account_id
         WHERE e.registration_id = $1
         ORDER BY e.changed_at`,
        [registration.id]
      ),
      database.query(
        `SELECT n.id, n.visibility, n.body, n.created_at, n.author_account_id, a.name AS author_name
         FROM registration_notes n LEFT JOIN accounts a ON a.id = n.author_account_id
         WHERE n.registration_id = $1 ORDER BY n.created_at`, [registration.id]
      ),
      database.query(
        `SELECT id, title, due_on, done_at, created_at FROM registration_next_steps
         WHERE registration_id = $1 ORDER BY done_at NULLS FIRST, due_on NULLS LAST, created_at`, [registration.id]
      )
    ]);
    return {
      id: registration.id,
      registrationId: registration.registration_id,
      status: registration.status,
      progress: registration.progress,
      applicant: {
        applicantName: registration.applicant_name,
        phone: registration.phone_e164,
        guardianName: registration.guardian_name,
        guardianPhone: registration.guardian_phone_e164,
        guardianEmail: registration.guardian_email || '',
        email: registration.email || '',
        birthDate: registration.birth_date ? registration.birth_date.toISOString().slice(0, 10) : '',
        gender: registration.gender || '',
        schoolOrigin: registration.school_origin || '',
        programDetails: registration.program_details || {},
        referralSource: registration.referral_source || '',
        privacyPolicyVersion: registration.privacy_policy_version || 'v1',
        guardianConsent: Boolean(registration.guardian_consent_at),
        program: registration.program,
        educationLevel: registration.education_level,
        city: registration.city,
        consent: true
      },
      accessTokenHash: registration.access_token_hash,
      accessCodeHash: registration.access_code_hash,
      createdAt: registration.created_at.toISOString(),
      updatedAt: registration.updated_at.toISOString(),
      version: Number(registration.row_version || 1),
      documents: documents.rows.map((row) => ({
        id: row.id,
        type: row.document_type,
        storageKey: row.storage_key,
        status: row.status,
        uploadedAt: row.uploaded_at.toISOString(),
        uploadedBy: row.uploaded_by_role,
        uploadedByAccountId: row.uploaded_by_account_id || null,
        uploadedByName: row.uploaded_by_name || null,
        fileObjectId: row.file_object_id || null,
        reviewStatus: row.review_status,
        reviewNote: row.review_note || '',
        reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
        reviewedByAccountId: row.reviewed_by_account_id || null,
        reviewedByName: row.reviewed_by_name || null
      })),
      statusHistory: history.rows.map((row) => ({
        from: row.previous_status,
        to: row.next_status,
        changedAt: row.changed_at.toISOString(),
        changedBy: row.changed_by_role,
        changedByAccountId: row.changed_by_account_id || null,
        changedByName: row.changed_by_name || null,
        note: row.note || ''
      })),
      notes: notes.rows.map((row) => ({ id: row.id, visibility: row.visibility, body: row.body, createdAt: row.created_at.toISOString(), authorAccountId: row.author_account_id || null, authorName: row.author_name || null })),
      nextSteps: nextSteps.rows.map((row) => ({ id: row.id, title: row.title, dueOn: row.due_on ? row.due_on.toISOString().slice(0, 10) : null, doneAt: row.done_at ? row.done_at.toISOString() : null, createdAt: row.created_at.toISOString() }))
    };
  }

  // Riwayat status dan berkas selalu ditulis ulang dari record, di dalam transaksi pemanggilnya.
  async function writeChildRows(tx, id, record) {
    for (const entry of record.statusHistory) {
      await tx.query(
        `INSERT INTO registration_status_events (id, registration_id, previous_status, next_status, changed_by_role, changed_by_account_id, note, changed_at)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8
         WHERE NOT EXISTS (
           SELECT 1 FROM registration_status_events
           WHERE registration_id = $2 AND previous_status = $3 AND next_status = $4
             AND changed_by_role = $5 AND changed_at = $8
         )`,
        [crypto.randomUUID(), id, entry.from, entry.to, entry.changedBy, entry.changedByAccountId || null, entry.note || null, entry.changedAt]
      );
    }
    for (const document of record.documents) {
      await tx.query(
        `INSERT INTO registration_documents (id, registration_id, document_type, storage_key, status, uploaded_by_role, uploaded_by_account_id, uploaded_at, file_object_id, review_status, review_note, reviewed_by_account_id, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           document_type = EXCLUDED.document_type,
           storage_key = EXCLUDED.storage_key,
           status = EXCLUDED.status,
           uploaded_by_role = EXCLUDED.uploaded_by_role,
           uploaded_by_account_id = EXCLUDED.uploaded_by_account_id,
           uploaded_at = EXCLUDED.uploaded_at,
           file_object_id = EXCLUDED.file_object_id`,
        [document.id || crypto.randomUUID(), id, document.type, document.storageKey, document.status, document.uploadedBy, document.uploadedByAccountId || null, document.uploadedAt, document.fileObjectId || null, document.reviewStatus || 'pending', document.reviewNote || null, document.reviewedByAccountId || null, document.reviewedAt || null]
      );
    }
  }

  return {
    async count() {
      const { rows } = await database.query('SELECT count(*)::int AS count FROM registrations');
      return Number(rows[0].count);
    },

    get,

    async addNote(registrationId, note) {
      const registration = await get(registrationId);
      if (!registration) return null;
      await database.query(
        'INSERT INTO registration_notes (id, registration_id, author_account_id, visibility, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [note.id, registration.id, note.authorAccountId, note.visibility, note.body, note.createdAt]
      );
      return get(registrationId);
    },

    async addNextStep(registrationId, step) {
      const registration = await get(registrationId);
      if (!registration) return null;
      await database.query(
        'INSERT INTO registration_next_steps (id, registration_id, title, due_on, done_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [step.id, registration.id, step.title, step.dueOn, step.doneAt, step.createdAt]
      );
      return get(registrationId);
    },

    async reviewDocument(registrationId, documentId, review) {
      const registration = await get(registrationId);
      if (!registration) return null;
      const result = await database.query(
        `UPDATE registration_documents SET review_status = $3, review_note = $4, reviewed_by_account_id = $5, reviewed_at = $6
         WHERE id = $1 AND registration_id = $2`,
        [documentId, registration.id, review.reviewStatus, review.reviewNote, review.reviewedByAccountId, review.reviewedAt]
      );
      return result.rowCount ? get(registrationId) : null;
    },

    async list() {
      const { rows } = await database.query('SELECT registration_id FROM registrations ORDER BY updated_at DESC');
      return Promise.all(rows.map((row) => get(row.registration_id)));
    },

    // Satu perintah atomik: dua permintaan bersamaan tidak mungkin mendapat nomor yang sama.
    nextSequence(scope, year) {
      return nextSequence(database, scope, year);
    },

    // INSERT biasa tanpa ON CONFLICT: nomor yang bentrok menghasilkan error,
    // sehingga data pendaftar lama tidak mungkin tertimpa.
    async insert(record) {
      const id = record.id || crypto.randomUUID();
      return database.withTransaction(async (tx) => {
        await tx.query(
          `INSERT INTO registrations (
             id, registration_id, applicant_name, phone_e164, guardian_name, guardian_phone_e164,
             program, education_level, city, consented_at, status, progress, access_token_hash,
             email, birth_date, gender, school_origin, program_details, referral_source, access_code_hash,
             privacy_policy_version, guardian_email, guardian_consent_at, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
          [
            id,
            record.registrationId,
            record.applicant.applicantName,
            record.applicant.phone,
            record.applicant.guardianName || null,
            record.applicant.guardianPhone || null,
            record.applicant.program,
            record.applicant.educationLevel || null,
            record.applicant.city || null,
            record.createdAt,
            record.status,
            record.progress,
            record.accessTokenHash,
            record.applicant.email || null,
            record.applicant.birthDate || null,
            record.applicant.gender || null,
            record.applicant.schoolOrigin || null,
            JSON.stringify(record.applicant.programDetails || {}),
            record.applicant.referralSource || null,
            record.accessCodeHash || null,
            record.applicant.privacyPolicyVersion || 'v1',
            record.applicant.guardianEmail || null,
            record.applicant.guardianConsent ? record.createdAt : null,
            record.createdAt,
            record.updatedAt
          ]
        );
        await writeChildRows(tx, id, record);
        return { ...record, id };
      });
    },

    async update(record) {
      return database.withTransaction(async (tx) => {
        // Kunci baris induk sebelum membaca/menulis snapshot. Child rows tidak lagi
        // dihapus dan dibangun ulang, sehingga review dokumen dari request lain
        // tidak ikut hilang.
        const locked = await tx.query('SELECT id FROM registrations WHERE registration_id = $1 FOR UPDATE', [record.registrationId]);
        if (!locked.rows[0]) {
          throw new Error(`Pendaftaran ${record.registrationId} tidak ditemukan.`);
        }
        const id = locked.rows[0].id;
        const updated = await tx.query(
          `UPDATE registrations SET
             applicant_name = $2,
             phone_e164 = $3,
             guardian_name = $4,
             guardian_phone_e164 = $5,
             program = $6,
             education_level = $7,
             city = $8,
             status = $9,
             progress = $10,
             access_token_hash = $11,
             email = $12,
             birth_date = $13,
             gender = $14,
             school_origin = $15,
             program_details = $16,
             referral_source = $17,
             access_code_hash = $18,
             privacy_policy_version = $19,
             guardian_email = $20,
             guardian_consent_at = $21,
             updated_at = $22,
             row_version = row_version + 1
           WHERE id = $1 AND row_version = $23
           RETURNING row_version`,
          [
            id,
            record.applicant.applicantName,
            record.applicant.phone,
            record.applicant.guardianName || null,
            record.applicant.guardianPhone || null,
            record.applicant.program,
            record.applicant.educationLevel || null,
            record.applicant.city || null,
            record.status,
            record.progress,
            record.accessTokenHash,
            record.applicant.email || null,
            record.applicant.birthDate || null,
            record.applicant.gender || null,
            record.applicant.schoolOrigin || null,
            JSON.stringify(record.applicant.programDetails || {}),
            record.applicant.referralSource || null,
            record.accessCodeHash || null,
            record.applicant.privacyPolicyVersion || 'v1',
            record.applicant.guardianEmail || null,
            record.applicant.guardianConsent ? record.updatedAt : null,
            record.updatedAt,
            Number(record.version || 1)
          ]
        );
        if (updated.rowCount === 0) {
          throw new Error(`Pendaftaran ${record.registrationId} tidak ditemukan atau sudah berubah. Muat ulang data terbaru.`);
        }
        await writeChildRows(tx, id, record);
        return { ...record, id, version: Number(updated.rows[0].row_version) };
      });
    }
  };
}

module.exports = { createPostgresRegistrationStore };
