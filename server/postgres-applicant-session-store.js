function createPostgresApplicantSessionStore({ database } = {}) {
  if (!database) throw new Error('createPostgresApplicantSessionStore membutuhkan database.');
  return {
    async save(session) {
      await database.query('INSERT INTO applicant_sessions (token_hash, registration_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [session.tokenHash, session.registrationId, session.expiresAt, session.createdAt]);
    },
    async get(tokenHash) {
      const { rows } = await database.query('SELECT token_hash, registration_id, expires_at, created_at FROM applicant_sessions WHERE token_hash = $1', [tokenHash]);
      if (!rows[0]) return null;
      return { tokenHash: rows[0].token_hash, registrationId: rows[0].registration_id, expiresAt: rows[0].expires_at.toISOString(), createdAt: rows[0].created_at.toISOString() };
    }
  };
}
module.exports = { createPostgresApplicantSessionStore };
