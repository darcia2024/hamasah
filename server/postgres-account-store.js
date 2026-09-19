const ACCOUNT_FIELDS = `id, email, name, role, active, password_hash, reset_token_hash, reset_expires_at,
  invitation_token_hash, invitation_expires_at, invited_at, created_at, updated_at`;

function toAccount(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    passwordHash: row.password_hash,
    resetTokenHash: row.reset_token_hash,
    resetExpiresAt: row.reset_expires_at && row.reset_expires_at.toISOString(),
    invitationTokenHash: row.invitation_token_hash,
    invitationExpiresAt: row.invitation_expires_at && row.invitation_expires_at.toISOString(),
    invitedAt: row.invited_at && row.invited_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function createPostgresAccountStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresAccountStore membutuhkan database.');
  }

  return {
    async count() {
      const { rows } = await database.query('SELECT count(*)::int AS count FROM accounts');
      return Number(rows[0].count);
    },

    async getByEmail(email) {
      const { rows } = await database.query(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE email = $1`, [email]);
      return rows[0] ? toAccount(rows[0]) : null;
    },

    async getById(id) {
      const { rows } = await database.query(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE id = $1`, [id]);
      return rows[0] ? toAccount(rows[0]) : null;
    },

    async getByInvitationTokenHash(tokenHash) {
      const { rows } = await database.query(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE invitation_token_hash = $1`, [tokenHash]);
      return rows[0] ? toAccount(rows[0]) : null;
    },

    async getByResetTokenHash(tokenHash) {
      const { rows } = await database.query(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE reset_token_hash = $1`, [tokenHash]);
      return rows[0] ? toAccount(rows[0]) : null;
    },

    async consumeResetToken(tokenHash, passwordHash, nowIso) {
      const { rows } = await database.query(
        `UPDATE accounts
         SET password_hash = $2, reset_token_hash = NULL, reset_expires_at = NULL, updated_at = $3
         WHERE reset_token_hash = $1 AND reset_expires_at > $3 AND active = TRUE
         RETURNING id`,
        [tokenHash, passwordHash, nowIso]
      );
      return rows[0] ? rows[0].id : null;
    },

    async consumeInvitationToken(tokenHash, passwordHash, nowIso) {
      const { rows } = await database.query(
        `UPDATE accounts
         SET active = TRUE, password_hash = $2, invitation_token_hash = NULL,
             invitation_expires_at = NULL, updated_at = $3
         WHERE invitation_token_hash = $1 AND invitation_expires_at > $3 AND active = FALSE
         RETURNING id`,
        [tokenHash, passwordHash, nowIso]
      );
      return rows[0] ? rows[0].id : null;
    },

    async list() {
      const { rows } = await database.query(`SELECT ${ACCOUNT_FIELDS} FROM accounts ORDER BY name`);
      return rows.map(toAccount);
    },

    async save(account) {
      const { rows } = await database.query(
        `INSERT INTO accounts (id, email, name, role, active, password_hash, reset_token_hash, reset_expires_at,
          invitation_token_hash, invitation_expires_at, invited_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           active = EXCLUDED.active,
           password_hash = EXCLUDED.password_hash,
           reset_token_hash = EXCLUDED.reset_token_hash,
           reset_expires_at = EXCLUDED.reset_expires_at,
           invitation_token_hash = EXCLUDED.invitation_token_hash,
           invitation_expires_at = EXCLUDED.invitation_expires_at,
           invited_at = EXCLUDED.invited_at,
           updated_at = EXCLUDED.updated_at
         RETURNING ${ACCOUNT_FIELDS}`,
        [
          account.id,
          account.email,
          account.name,
          account.role,
          account.active,
          account.passwordHash,
          account.resetTokenHash,
          account.resetExpiresAt,
          account.invitationTokenHash,
          account.invitationExpiresAt,
          account.invitedAt,
          account.createdAt,
          account.updatedAt
        ]
      );
      return toAccount(rows[0]);
    }
  };
}

module.exports = { createPostgresAccountStore, toAccount };
