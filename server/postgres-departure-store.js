// Penyimpanan kloter keberangkatan (migrasi 037).
function toGroup(row) {
  return {
    id: row.id,
    name: row.name,
    plannedDate: row.planned_date ? (row.planned_date instanceof Date ? row.planned_date.toISOString().slice(0, 10) : String(row.planned_date).slice(0, 10)) : null,
    origin: row.origin || null,
    status: row.status,
    applicantNote: row.applicant_note || null,
    memberCount: row.member_count === undefined ? undefined : Number(row.member_count),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

const COLUMNS = 'g.id, g.name, g.planned_date::text AS planned_date, g.origin, g.status, g.applicant_note, g.updated_at';

function createPostgresDepartureStore({ database } = {}) {
  if (!database) throw new Error('createPostgresDepartureStore membutuhkan database.');
  return Object.freeze({
    async listGroups() {
      const { rows } = await database.query(
        `SELECT ${COLUMNS}, (SELECT count(*) FROM registration_departures rd WHERE rd.departure_group_id = g.id) AS member_count
         FROM departure_groups g ORDER BY g.planned_date NULLS LAST, g.name`
      );
      return rows.map(toGroup);
    },
    async getGroup(id) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
      const { rows } = await database.query(`SELECT ${COLUMNS} FROM departure_groups g WHERE g.id = $1`, [id]);
      return rows[0] ? toGroup(rows[0]) : null;
    },
    async createGroup(group) {
      await database.query(
        `INSERT INTO departure_groups (id, name, planned_date, origin, status, applicant_note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [group.id, group.name, group.plannedDate, group.origin, group.status, group.applicantNote, group.createdAt, group.updatedAt]
      );
      return { ...(await this.getGroup(group.id)), memberCount: 0 };
    },
    async updateGroup(id, group) {
      await database.query(
        `UPDATE departure_groups SET name = $2, planned_date = $3, origin = $4, status = $5, applicant_note = $6, updated_at = $7 WHERE id = $1`,
        [id, group.name, group.plannedDate, group.origin, group.status, group.applicantNote, group.updatedAt]
      );
      return this.getGroup(id);
    },
    async assign(registrationId, groupId, { accountId, at }) {
      if (!groupId) {
        await database.query('DELETE FROM registration_departures WHERE registration_id = $1', [registrationId]);
        return;
      }
      await database.query(
        `INSERT INTO registration_departures (registration_id, departure_group_id, assigned_at, assigned_by_account_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (registration_id) DO UPDATE SET departure_group_id = EXCLUDED.departure_group_id,
           assigned_at = EXCLUDED.assigned_at, assigned_by_account_id = EXCLUDED.assigned_by_account_id`,
        [registrationId, groupId, at, accountId]
      );
    },
    async memberRegistrationIds(groupId) {
      const { rows } = await database.query('SELECT registration_id FROM registration_departures WHERE departure_group_id = $1 ORDER BY registration_id', [groupId]);
      return rows.map((row) => row.registration_id);
    },
    async forRegistrations(registrationIds) {
      const { rows } = await database.query(
        `SELECT rd.registration_id, ${COLUMNS} FROM registration_departures rd
         JOIN departure_groups g ON g.id = rd.departure_group_id
         WHERE rd.registration_id = ANY($1::text[])`,
        [registrationIds]
      );
      return Object.fromEntries(rows.map((row) => [row.registration_id, toGroup(row)]));
    }
  });
}

module.exports = { createPostgresDepartureStore };
