// Penyimpanan data santri di PostgreSQL. Menggantikan penyimpanan berkas JSON yang lama.
//
// Nama tabel untuk catatan (kegiatan, presensi, dan lain-lain) diambil dari peta
// konstanta di bawah, tidak pernah dari input, karena nama tabel tidak bisa
// dipasang sebagai parameter query.

const { likePattern, normalizePage } = require('./pagination.js');

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

function jakartaDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
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
    gender: row.gender || null,
    dormitoryId: row.dormitory_id || null,
    studentAccountId: row.student_account_id || null,
    registrationId: row.registration_id || null,
    birthDate: row.birth_date || null,
    mediaConsent: Boolean(row.media_consent),
    parentAccountIds: (row.parent_account_ids || []).filter(Boolean),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

const SELECT_STUDENT = `
  SELECT s.id, s.name, s.program, s.city, s.join_date::text AS join_date, s.status,
         s.gender, s.dormitory_id, s.student_account_id, s.registration_id, s.birth_date::text AS birth_date, s.media_consent, s.created_at, s.updated_at,
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

    async getByRegistrationId(registrationId) {
      const { rows } = await database.query(
        `${SELECT_STUDENT} WHERE s.registration_id = $1 GROUP BY s.id`,
        [registrationId]
      );
      return rows[0] ? toStudent(rows[0]) : null;
    },

    async listStudents() {
      const { rows } = await database.query(`${SELECT_STUDENT} GROUP BY s.id ORDER BY s.name ASC`);
      return rows.map(toStudent);
    },

    // Satu halaman santri dengan cakupan akses yang sudah diterjemahkan service:
    //   { type: 'all' } | { type: 'dormitories', ids } | { type: 'parent', accountId } | { type: 'student', accountId }
    // Cakupan diterapkan di SQL, dan service menguji kesetaraannya dengan canView() (Task R6.2).
    async listStudentsPage({ scope, search, limit, offset } = {}) {
      const kondisi = [];
      const nilai = [];
      const type = scope && scope.type;
      if (type === 'dormitories') {
        if (!scope.ids || !scope.ids.length) return { students: [], total: 0 };
        nilai.push(scope.ids);
        kondisi.push(`s.dormitory_id = ANY($${nilai.length}::uuid[])`);
      } else if (type === 'parent') {
        nilai.push(scope.accountId);
        kondisi.push(`EXISTS (SELECT 1 FROM student_parent_accounts pa WHERE pa.student_id = s.id AND pa.parent_account_id = $${nilai.length})`);
      } else if (type === 'student') {
        nilai.push(scope.accountId);
        kondisi.push(`s.student_account_id = $${nilai.length}`);
      } else if (type !== 'all') {
        return { students: [], total: 0 };
      }
      if (search && String(search).trim()) {
        nilai.push(likePattern(search));
        kondisi.push(`s.name ILIKE $${nilai.length}`);
      }
      const where = kondisi.length ? `WHERE ${kondisi.join(' AND ')}` : '';
      const page = normalizePage({ limit, offset });
      const total = await database.query(`SELECT count(*)::int AS jumlah FROM students s ${where}`, nilai);
      const { rows } = await database.query(
        `${SELECT_STUDENT} ${where} GROUP BY s.id ORDER BY s.name ASC, s.id
         LIMIT $${nilai.length + 1} OFFSET $${nilai.length + 2}`,
        [...nilai, page.limit, page.offset]
      );
      return { students: rows.map(toStudent), total: total.rows[0].jumlah };
    },

    async countInDormitory(dormitoryId) {
      const { rows } = await database.query('SELECT count(*)::int AS total FROM students WHERE dormitory_id = $1', [dormitoryId]);
      return rows[0] ? rows[0].total : 0;
    },

    async recordPlacement(entry) {
      await database.query(
        `INSERT INTO student_dormitory_history (id, student_id, dormitory_id, actor_account_id, changed_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [entry.id, entry.studentId, entry.dormitoryId || null, entry.actorAccountId || null, entry.changedAt]
      );
      return entry;
    },

    async correctRecord(collection, recordId, correction) {
      const definition = definitionOf(collection);
      return database.withTransaction(async (tx) => {
        // recorded_by_account_id ikut dibaca supaya hasil koreksi memuat pencatat
        // aslinya. Kolom itu tidak pernah masuk `allowed`, yang hanya dibentuk dari
        // definition.columns, jadi koreksi tidak bisa memindahkan jejak pelaku.
        const columns = ['id', 'student_id', 'occurred_at', ...definition.columns, 'created_at', 'recorded_by_account_id'];
        const currentQuery = await tx.query(`SELECT ${columns.join(', ')} FROM ${definition.table} WHERE id = $1`, [recordId]);
        if (!currentQuery.rows[0]) return null;
        const previous = toRecord(definition, currentQuery.rows[0]);
        const allowed = definition.columns.filter((column) => Object.prototype.hasOwnProperty.call(correction.value || {}, column));
        const values = [recordId];
        const sets = [];
        allowed.forEach((column) => { values.push(correction.value[column]); sets.push(`${column} = $${values.length}`); });
        if (correction.value.occurredAt) { values.push(correction.value.occurredAt); sets.push(`occurred_at = $${values.length}`); }
        let updated = previous;
        if (sets.length) {
          const result = await tx.query(`UPDATE ${definition.table} SET ${sets.join(', ')} WHERE id = $1 RETURNING ${columns.join(', ')}`, values);
          updated = toRecord(definition, result.rows[0]);
        }
        const pencatatId = updated.recordedByAccountId;
        if (pencatatId) {
          const pencatat = await tx.query('SELECT name FROM accounts WHERE id = $1', [pencatatId]);
          const nama = pencatat.rows[0] ? pencatat.rows[0].name : null;
          updated.recordedByName = nama;
          previous.recordedByName = nama;
        }

        await tx.query(`INSERT INTO student_record_corrections (id, record_type, record_id, student_id, actor_account_id, reason, previous_value, corrected_value, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`, [require('node:crypto').randomUUID(), collection, recordId, previous.studentId, correction.actorAccountId || null, correction.reason, JSON.stringify(previous), JSON.stringify(updated), correction.createdAt]);
        return { record: updated, previous };
      });
    },

    async saveStudent(student) {
      // Satu transaksi: data santri dan daftar wali harus berubah bersama.
      return database.withTransaction(async (tx) => {
        await tx.query(
          `INSERT INTO students (id, name, program, city, join_date, status, gender, dormitory_id, student_account_id, registration_id, birth_date, media_consent, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name,
                 program = EXCLUDED.program,
                 city = EXCLUDED.city,
                 join_date = EXCLUDED.join_date,
                 status = EXCLUDED.status,
                 gender = EXCLUDED.gender,
                 dormitory_id = EXCLUDED.dormitory_id,
                 student_account_id = EXCLUDED.student_account_id,
                 registration_id = EXCLUDED.registration_id,
                 birth_date = EXCLUDED.birth_date,
                 media_consent = EXCLUDED.media_consent,
                 updated_at = EXCLUDED.updated_at`,
          [
            student.id,
            student.name,
            student.program,
            student.city,
            student.joinDate,
            student.status,
            student.gender || null,
            student.dormitoryId || null,
            student.studentAccountId || null,
            student.registrationId || null,
            student.birthDate || null,
            Boolean(student.mediaConsent),
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
      if (collection === 'attendance') {
        const { rows } = await database.query(
          `INSERT INTO student_attendance (id, student_id, occurred_at, status, category, note, created_at, session_date, recorded_by_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, student_id, occurred_at, status, category, note, created_at, recorded_by_account_id`,
          [entry.id, entry.studentId, entry.occurredAt, ...values, entry.createdAt, entry.sessionDate || jakartaDate(entry.occurredAt), entry.recordedByAccountId || null]
        );
        return toRecord(definition, rows[0]);
      }
      const placeholders = definition.columns.map((name, index) => `$${index + 4}`).join(', ');
      const { rows } = await database.query(
        `INSERT INTO ${definition.table} (id, student_id, occurred_at, ${definition.columns.join(', ')}, created_at, recorded_by_account_id)
         VALUES ($1, $2, $3, ${placeholders}, $${values.length + 4}, $${values.length + 5})
         RETURNING id, student_id, occurred_at, ${definition.columns.join(', ')}, created_at, recorded_by_account_id`,
        [entry.id, entry.studentId, entry.occurredAt, ...values, entry.createdAt, entry.recordedByAccountId || null]
      );
      return toRecord(definition, rows[0]);
    },

    async byStudent(collection, studentId) {
      const definition = definitionOf(collection);
      // Nama pencatat ikut diambil di sini supaya konsol monitoring tidak perlu
      // memanggil daftar akun terpisah hanya untuk menerjemahkan UUID.
      // LEFT JOIN, karena baris sebelum migrasi 033 tidak punya pencatat dan
      // akun yang dihapus menyisakan NULL.
      const { rows } = await database.query(
        `SELECT catatan.id, catatan.student_id, catatan.occurred_at,
                ${definition.columns.map((column) => `catatan.${column}`).join(', ')},
                catatan.created_at, catatan.recorded_by_account_id,
                pencatat.name AS recorded_by_name
           FROM ${definition.table} AS catatan
           LEFT JOIN accounts AS pencatat ON pencatat.id = catatan.recorded_by_account_id
          WHERE catatan.student_id = $1
          ORDER BY catatan.occurred_at DESC, catatan.created_at DESC`,
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
    createdAt: toIso(row.created_at),
    // null untuk baris sebelum migrasi 033 dan untuk akun staf yang sudah dihapus.
    recordedByAccountId: row.recorded_by_account_id || null,
    recordedByName: row.recorded_by_name || null
  };
}

module.exports = { COLLECTIONS, createPostgresStudentStore };
