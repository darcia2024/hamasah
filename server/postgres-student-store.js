// Penyimpanan data santri di PostgreSQL. Menggantikan penyimpanan berkas JSON yang lama.
//
// Nama tabel untuk catatan (kegiatan, presensi, dan lain-lain) diambil dari peta
// konstanta di bawah, tidak pernah dari input, karena nama tabel tidak bisa
// dipasang sebagai parameter query.

const COLLECTIONS = Object.freeze({
  activities: Object.freeze({
    table: 'student_activities',
    columns: ['title', 'description'],
    toRow: (entry) => [entry.title, entry.description || null],
    toEntry: (row) => ({ title: row.title, description: row.description || '' })
  }),
  achievements: Object.freeze({
    table: 'student_achievements',
    columns: ['title', 'description'],
    toRow: (entry) => [entry.title, entry.description || null],
    toEntry: (row) => ({ title: row.title, description: row.description || '' })
  }),
  attendance: Object.freeze({
    table: 'student_attendance',
    columns: ['status', 'category', 'note'],
    toRow: (entry) => [entry.status, entry.category, entry.note || null],
    toEntry: (row) => ({ status: row.status, category: row.category, note: row.note || '' })
  }),
  evaluations: Object.freeze({
    table: 'student_evaluations',
    columns: ['area', 'note'],
    toRow: (entry) => [entry.area, entry.note],
    toEntry: (row) => ({ area: row.area, note: row.note })
  }),
  violations: Object.freeze({
    table: 'student_violations',
    columns: ['level', 'note'],
    toRow: (entry) => [entry.level, entry.note],
    toEntry: (row) => ({ level: row.level, note: row.note })
  })
});

function definitionOf(collection) {
  // hasOwnProperty supaya nama seperti "constructor" tidak lolos.
  if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, collection)) {
    throw new Error('Koleksi catatan tidak dikenal.');
  }
  return COLLECTIONS[collection];
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toStudent(row) {
  return {
    id: row.id,
    name: row.name,
    program: row.program,
    city: row.city,
    // join_date dibaca sebagai ::text supaya tidak bergeser sehari karena zona waktu.
    joinDate: row.join_date,
    status: row.status,
    studentAccountId: row.student_account_id || null,
    parentAccountIds: (row.parent_account_ids || []).filter(Boolean),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

const SELECT_STUDENT = `
  SELECT s.id, s.name, s.program, s.city, s.join_date::text AS join_date, s.status,
         s.student_account_id, s.created_at, s.updated_at,
         COALESCE(array_agg(p.parent_account_id) FILTER (WHERE p.parent_account_id IS NOT NULL), '{}') AS parent_account_ids
    FROM students s
    LEFT JOIN student_parent_accounts p ON p.student_id = s.id`;

function createPostgresStudentStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresStudentStore membutuhkan database.');
  }

  return {
    async getStudent(studentId) {
      const { rows } = await database.query(
        `${SELECT_STUDENT} WHERE s.id = $1 GROUP BY s.id`,
        [studentId]
      );
      return rows[0] ? toStudent(rows[0]) : null;
    },

    async listStudents() {
      const { rows } = await database.query(`${SELECT_STUDENT} GROUP BY s.id ORDER BY s.name ASC`);
      return rows.map(toStudent);
    },

    async saveStudent(student) {
      // Satu transaksi: data santri dan daftar wali harus berubah bersama.
      return database.withTransaction(async (tx) => {
        await tx.query(
          `INSERT INTO students (id, name, program, city, join_date, status, student_account_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name,
                 program = EXCLUDED.program,
                 city = EXCLUDED.city,
                 join_date = EXCLUDED.join_date,
                 status = EXCLUDED.status,
                 student_account_id = EXCLUDED.student_account_id,
                 updated_at = EXCLUDED.updated_at`,
          [
            student.id,
            student.name,
            student.program,
            student.city,
            student.joinDate,
            student.status,
            student.studentAccountId || null,
            student.createdAt,
            student.updatedAt
          ]
        );

        const parentAccountIds = [...new Set((student.parentAccountIds || []).filter(Boolean))];
        // Wali yang dicabut hilang dari tabel relasi, bukan sekadar tidak ditambah.
        await tx.query(
          'DELETE FROM student_parent_accounts WHERE student_id = $1 AND parent_account_id <> ALL($2::uuid[])',
          [student.id, parentAccountIds]
        );
        for (const parentAccountId of parentAccountIds) {
          await tx.query(
            `INSERT INTO student_parent_accounts (student_id, parent_account_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [student.id, parentAccountId]
          );
        }

        const { rows } = await tx.query(`${SELECT_STUDENT} WHERE s.id = $1 GROUP BY s.id`, [student.id]);
        return toStudent(rows[0]);
      });
    },

    async append(collection, entry) {
      const definition = definitionOf(collection);
      const values = definition.toRow(entry);
      const placeholders = definition.columns.map((name, index) => `$${index + 4}`).join(', ');
      const { rows } = await database.query(
        `INSERT INTO ${definition.table} (id, student_id, occurred_at, ${definition.columns.join(', ')}, created_at)
         VALUES ($1, $2, $3, ${placeholders}, $${values.length + 4})
         RETURNING id, student_id, occurred_at, ${definition.columns.join(', ')}, created_at`,
        [entry.id, entry.studentId, entry.occurredAt, ...values, entry.createdAt]
      );
      return toRecord(definition, rows[0]);
    },

    async byStudent(collection, studentId) {
      const definition = definitionOf(collection);
      const { rows } = await database.query(
        `SELECT id, student_id, occurred_at, ${definition.columns.join(', ')}, created_at
           FROM ${definition.table}
          WHERE student_id = $1
          ORDER BY occurred_at DESC, created_at DESC`,
        [studentId]
      );
      return rows.map((row) => toRecord(definition, row));
    }
  };
}

function toRecord(definition, row) {
  return {
    id: row.id,
    studentId: row.student_id,
    ...definition.toEntry(row),
    occurredAt: toIso(row.occurred_at),
    createdAt: toIso(row.created_at)
  };
}

module.exports = { COLLECTIONS, createPostgresStudentStore };
