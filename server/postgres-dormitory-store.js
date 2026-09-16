// Asrama dan penugasan musyrif.

const crypto = require('node:crypto');

const GENDERS = Object.freeze(['putra', 'putri']);

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDormitory(row) {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    gender: row.gender,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

const SELECT_DORMITORY = 'SELECT id, name, area, gender, created_at, updated_at FROM dormitories';

function createPostgresDormitoryStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresDormitoryStore membutuhkan database.');
  }

  return {
    async listDormitories() {
      const { rows } = await database.query(`${SELECT_DORMITORY} ORDER BY name ASC`);
      return rows.map(toDormitory);
    },

    async getDormitory(id) {
      const { rows } = await database.query(`${SELECT_DORMITORY} WHERE id = $1`, [id]);
      return rows[0] ? toDormitory(rows[0]) : null;
    },

    async createDormitory(dormitory) {
      const { rows } = await database.query(
        `INSERT INTO dormitories (id, name, area, gender, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id, name, area, gender, created_at, updated_at`,
        [dormitory.id || crypto.randomUUID(), dormitory.name, dormitory.area, dormitory.gender, dormitory.createdAt]
      );
      return toDormitory(rows[0]);
    },

    // Id asrama yang ditugaskan kepada satu akun staf.
    async dormitoriesForStaff(accountId) {
      const { rows } = await database.query(
        'SELECT dormitory_id FROM staff_dormitory_assignments WHERE account_id = $1 ORDER BY assigned_at ASC',
        [accountId]
      );
      return rows.map((row) => row.dormitory_id);
    },

    // Seluruh penugasan, untuk ditampilkan di layar admin.
    async listAssignments() {
      const { rows } = await database.query(
        `SELECT a.account_id, a.dormitory_id, k.name AS account_name, k.email, d.name AS dormitory_name
           FROM staff_dormitory_assignments a
           JOIN accounts k ON k.id = a.account_id
           JOIN dormitories d ON d.id = a.dormitory_id
          ORDER BY d.name ASC, k.name ASC`
      );
      return rows.map((row) => ({
        accountId: row.account_id,
        accountName: row.account_name,
        email: row.email,
        dormitoryId: row.dormitory_id,
        dormitoryName: row.dormitory_name
      }));
    },

    async assignStaff(accountId, dormitoryId, assignedAt) {
      await database.query(
        `INSERT INTO staff_dormitory_assignments (account_id, dormitory_id, assigned_at)
         VALUES ($1, $2, COALESCE($3, now())) ON CONFLICT DO NOTHING`,
        [accountId, dormitoryId, assignedAt || null]
      );
    },

    async unassignStaff(accountId, dormitoryId) {
      const { rowCount } = await database.query(
        'DELETE FROM staff_dormitory_assignments WHERE account_id = $1 AND dormitory_id = $2',
        [accountId, dormitoryId]
      );
      return rowCount > 0;
    }
  };
}

module.exports = { GENDERS, createPostgresDormitoryStore, toDormitory };
