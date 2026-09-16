function createPostgresSessionStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresSessionStore membutuhkan database.');
  }

  return {
    async get(tokenHash) {
      const { rows } = await database.query(
        'SELECT token_hash, account_id, expires_at, last_seen_at FROM account_sessions WHERE token_hash = $1',
        [tokenHash]
      );
      if (!rows[0]) return null;
      return {
        tokenHash: rows[0].token_hash,
        accountId: rows[0].account_id,
        expiresAt: new Date(rows[0].expires_at).toISOString(),
        lastSeenAt: new Date(rows[0].last_seen_at).toISOString()
      };
    },

    async save(session) {
      await database.query(
        `INSERT INTO account_sessions (token_hash, account_id, expires_at, last_seen_at)
         VALUES ($1, $2, $3, COALESCE($4, now()))
         ON CONFLICT (token_hash) DO UPDATE SET
           account_id = EXCLUDED.account_id,
           expires_at = EXCLUDED.expires_at,
           last_seen_at = EXCLUDED.last_seen_at`,
        [session.tokenHash, session.accountId, session.expiresAt, session.lastSeenAt || null]
      );
    },

    // Memperpanjang satu sesi tanpa menulis ulang barisnya secara utuh.
    async touch(tokenHash, { expiresAt, lastSeenAt }) {
      await database.query(
        'UPDATE account_sessions SET expires_at = $2, last_seen_at = $3 WHERE token_hash = $1',
        [tokenHash, expiresAt, lastSeenAt]
      );
    },

    async remove(tokenHash) {
      await database.query('DELETE FROM account_sessions WHERE token_hash = $1', [tokenHash]);
    },

    // Dipakai saat akun dinonaktifkan dan saat pengguna menekan "keluar dari semua perangkat".
    async removeForAccount(accountId) {
      const { rowCount } = await database.query('DELETE FROM account_sessions WHERE account_id = $1', [accountId]);
      return rowCount;
    },

    async removeExpired(isoTime) {
      const { rowCount } = await database.query('DELETE FROM account_sessions WHERE expires_at < $1', [isoTime]);
      return rowCount;
    }
  };
}

module.exports = { createPostgresSessionStore };
