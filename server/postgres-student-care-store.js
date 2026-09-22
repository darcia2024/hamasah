// Penyimpanan ibadah (sholat, hafalan) dan kesehatan santri (migrasi 040).
function tanggal(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function createPostgresStudentCareStore({ database } = {}) {
  if (!database) throw new Error('createPostgresStudentCareStore membutuhkan database.');
  return Object.freeze({
    async upsertPrayers(studentId, date, entries, { accountId, at }) {
      for (const entry of entries) {
        await database.query(
          `INSERT INTO student_prayer_logs (id, student_id, prayer_date, prayer, status, note, recorded_by_account_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (student_id, prayer_date, prayer) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note,
             recorded_by_account_id = EXCLUDED.recorded_by_account_id, updated_at = EXCLUDED.updated_at`,
          [entry.id, studentId, date, entry.prayer, entry.status, entry.note, accountId, at]
        );
      }
    },
    async listPrayers(studentId, { from, to }) {
      const { rows } = await database.query(
        `SELECT prayer_date::text AS prayer_date, prayer, status, note FROM student_prayer_logs
         WHERE student_id = $1 AND prayer_date BETWEEN $2 AND $3 ORDER BY prayer_date DESC`,
        [studentId, from, to]
      );
      return rows.map((row) => ({ date: tanggal(row.prayer_date), prayer: row.prayer, status: row.status, note: row.note || null }));
    },
    async addMemorization(record) {
      await database.query(
        `INSERT INTO student_memorization_logs (id, student_id, occurred_on, kind, portion, grade, note, recorded_by_account_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [record.id, record.studentId, record.occurredOn, record.kind, record.portion, record.grade, record.note, record.accountId, record.createdAt]
      );
      return record;
    },
    async listMemorization(studentId, { from, to, limit = 50 }) {
      const { rows } = await database.query(
        `SELECT id, occurred_on::text AS occurred_on, kind, portion, grade, note FROM student_memorization_logs
         WHERE student_id = $1 AND occurred_on BETWEEN $2 AND $3 ORDER BY occurred_on DESC, created_at DESC LIMIT $4`,
        [studentId, from, to, limit]
      );
      return rows.map((row) => ({ id: row.id, occurredOn: tanggal(row.occurred_on), kind: row.kind, portion: row.portion, grade: row.grade, note: row.note || null }));
    },
    async addHealth(record) {
      await database.query(
        `INSERT INTO student_health_logs (id, student_id, occurred_on, condition, complaint, action_taken, parent_note, recorded_by_account_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [record.id, record.studentId, record.occurredOn, record.condition, record.complaint, record.actionTaken, record.parentNote, record.accountId, record.createdAt]
      );
      return record;
    },
    async listHealth(studentId, { from, to, limit = 50 }) {
      const { rows } = await database.query(
        `SELECT id, occurred_on::text AS occurred_on, condition, complaint, action_taken, parent_note FROM student_health_logs
         WHERE student_id = $1 AND occurred_on BETWEEN $2 AND $3 ORDER BY occurred_on DESC, created_at DESC LIMIT $4`,
        [studentId, from, to, limit]
      );
      return rows.map((row) => ({ id: row.id, occurredOn: tanggal(row.occurred_on), condition: row.condition, complaint: row.complaint || null, actionTaken: row.action_taken || null, parentNote: row.parent_note || null }));
    }
  });
}

module.exports = { createPostgresStudentCareStore };
