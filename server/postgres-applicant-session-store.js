function createPostgresApplicantSessionStore({ database } = {}) {
  if (!database) throw new Error('createPostgresApplicantSessionStore membutuhkan database.');
  return {
    async saveForCredential(session, verifiedCodeHash) {
      return database.withTransaction(async tx => {
        const current = await tx.query('SELECT access_code_hash FROM registrations WHERE id=$1 FOR UPDATE', [session.registrationId]);
        if (!current.rows.length || (verifiedCodeHash && current.rows[0].access_code_hash !== verifiedCodeHash)) return false;
        await tx.query('INSERT INTO applicant_sessions (token_hash, registration_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [session.tokenHash, session.registrationId, session.expiresAt, session.createdAt]);
        return true;
      });
    },
    async save(session) {
      await database.query('INSERT INTO applicant_sessions (token_hash, registration_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [session.tokenHash, session.registrationId, session.expiresAt, session.createdAt]);
    },
    async get(tokenHash) {
      const { rows } = await database.query('SELECT token_hash, registration_id, expires_at, created_at FROM applicant_sessions WHERE token_hash = $1', [tokenHash]);
      if (!rows[0]) return null;
      return { tokenHash: rows[0].token_hash, registrationId: rows[0].registration_id, expiresAt: rows[0].expires_at.toISOString(), createdAt: rows[0].created_at.toISOString() };
    },
    async remove(tokenHash) {
      await database.query('DELETE FROM applicant_sessions WHERE token_hash = $1', [tokenHash]);
    },
    async removeExpired(isoTime) {
      const { rowCount } = await database.query('DELETE FROM applicant_sessions WHERE expires_at < $1', [isoTime]);
      return rowCount;
    }
  };
}
module.exports = { createPostgresApplicantSessionStore };
