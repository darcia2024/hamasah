const crypto = require('node:crypto');

function createPostgresRegistrationStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresRegistrationStore membutuhkan database.');
  }

  async function get(registrationId) {
    const { rows } = await database.query('SELECT * FROM registrations WHERE registration_id = $1', [registrationId]);
    if (!rows[0]) return null;
    const registration = rows[0];
    const [documents, history] = await Promise.all([
      database.query(
        'SELECT document_type, storage_key, status, uploaded_at, uploaded_by_role FROM registration_documents WHERE registration_id = $1 ORDER BY uploaded_at',
        [registration.id]
      ),
      database.query(
        'SELECT previous_status, next_status, changed_at, changed_by_role, note FROM registration_status_events WHERE registration_id = $1 ORDER BY changed_at',
        [registration.id]
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
        program: registration.program,
        educationLevel: registration.education_level,
        city: registration.city,
        consent: true
      },
      accessTokenHash: registration.access_token_hash,
      createdAt: registration.created_at.toISOString(),
      updatedAt: registration.updated_at.toISOString(),
      documents: documents.rows.map((row) => ({
        type: row.document_type,
        storageKey: row.storage_key,
        status: row.status,
        uploadedAt: row.uploaded_at.toISOString(),
        uploadedBy: row.uploaded_by_role
      })),
      statusHistory: history.rows.map((row) => ({
        from: row.previous_status,
        to: row.next_status,
        changedAt: row.changed_at.toISOString(),
        changedBy: row.changed_by_role,
        note: row.note || ''
      }))
    };
  }

  // Riwayat status dan berkas selalu ditulis ulang dari record, di dalam transaksi pemanggilnya.
  async function writeChildRows(tx, id, record) {
    for (const entry of record.statusHistory) {
      await tx.query(
        `INSERT INTO registration_status_events (id, registration_id, previous_status, next_status, changed_by_role, note, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), id, entry.from, entry.to, entry.changedBy, entry.note || null, entry.changedAt]
      );
    }
    for (const document of record.documents) {
      await tx.query(
        `INSERT INTO registration_documents (id, registration_id, document_type, storage_key, status, uploaded_by_role, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), id, document.type, document.storageKey, document.status, document.uploadedBy, document.uploadedAt]
      );
    }
  }

  return {
    async count() {
      const { rows } = await database.query('SELECT count(*)::int AS count FROM registrations');
      return Number(rows[0].count);
    },

    get,

    async list() {
      const { rows } = await database.query('SELECT registration_id FROM registrations ORDER BY updated_at DESC');
      return Promise.all(rows.map((row) => get(row.registration_id)));
    },

    // Satu perintah atomik: dua permintaan bersamaan tidak mungkin mendapat nomor yang sama.
    async nextSequence(scope, year) {
      const { rows } = await database.query(
        `INSERT INTO document_counters (scope, year, last_value) VALUES ($1, $2, 1)
         ON CONFLICT (scope, year) DO UPDATE SET
           last_value = document_counters.last_value + 1,
           updated_at = now()
         RETURNING last_value`,
        [scope, year]
      );
      return Number(rows[0].last_value);
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
             created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
            record.createdAt,
            record.updatedAt
          ]
        );
        await writeChildRows(tx, id, record);
        return { ...record, id };
      });
    },

    async update(record) {
      // Pencarian id dilakukan sebelum transaksi dimulai (di luar withTransaction).
      const existing = record.id ? record : await get(record.registrationId);
      if (!existing) {
        throw new Error(`Pendaftaran ${record.registrationId} tidak ditemukan.`);
      }
      const id = existing.id;

      // Semua penulisan di bawah berjalan dalam satu transaksi pada satu koneksi,
      // dan wajib memakai tx.query. Jika satu query gagal, semuanya dibatalkan.
      return database.withTransaction(async (tx) => {
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
             updated_at = $12
           WHERE id = $1`,
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
            record.updatedAt
          ]
        );
        if (updated.rowCount === 0) {
          throw new Error(`Pendaftaran ${record.registrationId} tidak ditemukan.`);
        }
        await tx.query('DELETE FROM registration_documents WHERE registration_id = $1', [id]);
        await tx.query('DELETE FROM registration_status_events WHERE registration_id = $1', [id]);
        await writeChildRows(tx, id, record);
        return { ...record, id };
      });
    }
  };
}

module.exports = { createPostgresRegistrationStore };
