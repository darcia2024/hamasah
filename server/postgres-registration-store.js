const crypto = require('node:crypto');

function createPostgresRegistrationStore({ connectionString, pool } = {}) {
  const client = pool || new (require('pg').Pool)({ connectionString });

  async function get(registrationId) {
    const { rows } = await client.query('SELECT * FROM registrations WHERE registration_id = $1', [registrationId]);
    if (!rows[0]) return null;
    const registration = rows[0];
    const [documents, history] = await Promise.all([
      client.query('SELECT document_type, storage_key, status, uploaded_at, uploaded_by_role FROM registration_documents WHERE registration_id = $1 ORDER BY uploaded_at', [registration.id]),
      client.query('SELECT previous_status, next_status, changed_at, changed_by_role, note FROM registration_status_events WHERE registration_id = $1 ORDER BY changed_at', [registration.id])
    ]);
    return {
      id: registration.id, registrationId: registration.registration_id, status: registration.status, progress: registration.progress,
      applicant: { applicantName: registration.applicant_name, phone: registration.phone_e164, guardianName: registration.guardian_name, guardianPhone: registration.guardian_phone_e164, program: registration.program, educationLevel: registration.education_level, city: registration.city, consent: true },
      accessTokenHash: registration.access_token_hash, createdAt: registration.created_at.toISOString(), updatedAt: registration.updated_at.toISOString(),
      documents: documents.rows.map((row) => ({ type: row.document_type, storageKey: row.storage_key, status: row.status, uploadedAt: row.uploaded_at.toISOString(), uploadedBy: row.uploaded_by_role })),
      statusHistory: history.rows.map((row) => ({ from: row.previous_status, to: row.next_status, changedAt: row.changed_at.toISOString(), changedBy: row.changed_by_role, note: row.note || '' }))
    };
  }

  return {
    async count() { return Number((await client.query('SELECT count(*)::int AS count FROM registrations')).rows[0].count); },
    get,
    async list() {
      const { rows } = await client.query('SELECT registration_id FROM registrations ORDER BY updated_at DESC');
      return Promise.all(rows.map((row) => get(row.registration_id)));
    },
    async save(record) {
      const existing = record.id ? record : await get(record.registrationId);
      const id = existing ? existing.id : crypto.randomUUID();
      await client.query('BEGIN');
      try {
        await client.query(`INSERT INTO registrations (id, registration_id, applicant_name, phone_e164, guardian_name, guardian_phone_e164, program, education_level, city, consented_at, status, progress, access_token_hash, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (registration_id) DO UPDATE SET applicant_name=EXCLUDED.applicant_name, phone_e164=EXCLUDED.phone_e164, guardian_name=EXCLUDED.guardian_name, guardian_phone_e164=EXCLUDED.guardian_phone_e164, program=EXCLUDED.program, education_level=EXCLUDED.education_level, city=EXCLUDED.city, status=EXCLUDED.status, progress=EXCLUDED.progress, access_token_hash=EXCLUDED.access_token_hash, updated_at=EXCLUDED.updated_at`,
          [id, record.registrationId, record.applicant.applicantName, record.applicant.phone, record.applicant.guardianName || null, record.applicant.guardianPhone || null, record.applicant.program, record.applicant.educationLevel || null, record.applicant.city || null, record.createdAt, record.status, record.progress, record.accessTokenHash, record.createdAt, record.updatedAt]);
        await client.query('DELETE FROM registration_documents WHERE registration_id = $1', [id]);
        await client.query('DELETE FROM registration_status_events WHERE registration_id = $1', [id]);
        for (const entry of record.statusHistory) await client.query('INSERT INTO registration_status_events (id, registration_id, previous_status, next_status, changed_by_role, note, changed_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [crypto.randomUUID(), id, entry.from, entry.to, entry.changedBy, entry.note || null, entry.changedAt]);
        for (const document of record.documents) await client.query('INSERT INTO registration_documents (id, registration_id, document_type, storage_key, status, uploaded_by_role, uploaded_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [crypto.randomUUID(), id, document.type, document.storageKey, document.status, document.uploadedBy, document.uploadedAt]);
        await client.query('COMMIT'); return { ...record, id };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  };
}
module.exports = { createPostgresRegistrationStore };
