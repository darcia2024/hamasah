function createPostgresSessionStore({ connectionString, pool } = {}) {
  const client = pool || new (require('pg').Pool)({ connectionString });

  return {
    async get(tokenHash) {
      const { rows } = await client.query(
        'SELECT token_hash, account_id, expires_at FROM account_sessions WHERE token_hash = $1',
        [tokenHash]
      );
      if (!rows[0]) return null;
      return {
        tokenHash: rows[0].token_hash,
        accountId: rows[0].account_id,
        expiresAt: rows[0].expires_at.toISOString()
      };
    },

    async save(session) {
      await client.query(
        `INSERT INTO account_sessions (token_hash, account_id, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (token_hash) DO UPDATE SET
           account_id = EXCLUDED.account_id,
           expires_at = EXCLUDED.expires_at`,
        [session.tokenHash, session.accountId, session.expiresAt]
      );
    },

    async remove(tokenHash) {
      await client.query('DELETE FROM account_sessions WHERE token_hash = $1', [tokenHash]);
    }
  };
}

module.exports = { createPostgresSessionStore };
