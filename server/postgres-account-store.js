const ACCOUNT_FIELDS = 'id, email, name, role, active, password_hash, reset_token_hash, reset_expires_at, created_at, updated_at';

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
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function createPostgresAccountStore({ connectionString, pool } = {}) {
  const client = pool || new (require('pg').Pool)({ connectionString });

  return {
    async count() {
      const { rows } = await client.query('SELECT count(*)::int AS count FROM accounts');
      return Number(rows[0].count);
    },

    async getByEmail(email) {
      const { rows } = await client.query(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE email = $1`, [email]);
      return rows[0] ? toAccount(rows[0]) : null;
    },

    async getById(id) {
      const { rows } = await client.query(`SELECT ${ACCOUNT_FIELDS} FROM accounts WHERE id = $1`, [id]);
      return rows[0] ? toAccount(rows[0]) : null;
    },

    async list() {
      const { rows } = await client.query(`SELECT ${ACCOUNT_FIELDS} FROM accounts ORDER BY name`);
      return rows.map(toAccount);
    },

    async save(account) {
      const { rows } = await client.query(
        `INSERT INTO accounts (id, email, name, role, active, password_hash, reset_token_hash, reset_expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           active = EXCLUDED.active,
           password_hash = EXCLUDED.password_hash,
           reset_token_hash = EXCLUDED.reset_token_hash,
           reset_expires_at = EXCLUDED.reset_expires_at,
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
          account.createdAt,
          account.updatedAt
        ]
      );
      return toAccount(rows[0]);
    }
  };
}

module.exports = { createPostgresAccountStore, toAccount };
