// Penyimpanan maddah, materi, pendaftaran kelas, dan penyelesaian materi di PostgreSQL.
// Menggantikan penyimpanan berkas JSON yang lama.

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toJson(value) {
  // PGlite mengembalikan jsonb sebagai objek, pg juga. Kalau ternyata string, tetap dibaca.
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  return value || [];
}

function toMaterial(row) {
  return {
    id: row.id,
    type: row.material_type,
    title: row.title,
    content: row.content,
    summary: row.summary,
    keyPoints: toJson(row.key_points),
    studyGuide: toJson(row.study_guide),
    version: Number(row.version || 1),
    createdAt: toIso(row.created_at)
  };
}

function toCourse(row, materials) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ownerAccountId: row.owner_account_id || null,
    materials,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

const SELECT_MATERIAL = `SELECT id, course_id, material_type, title, content, summary, key_points, study_guide, created_at, version
                           FROM course_materials`;

function createPostgresLmsStore({ database } = {}) {
  if (!database) {
    throw new Error('createPostgresLmsStore membutuhkan database.');
  }

  async function materialsOf(courseIds) {
    if (courseIds.length === 0) {
      return new Map();
    }
    const { rows } = await database.query(
      `${SELECT_MATERIAL} WHERE course_id = ANY($1::uuid[]) ORDER BY position ASC, created_at ASC, id ASC`,
      [courseIds]
    );
    const grouped = new Map(courseIds.map((courseId) => [courseId, []]));
    for (const row of rows) {
      grouped.get(row.course_id).push(toMaterial(row));
    }
    return grouped;
  }

  return {
    async createCourse(course) {
      const { rows } = await database.query(
        `INSERT INTO courses (id, title, description, owner_account_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, description, owner_account_id, created_at, updated_at`,
        [course.id, course.title, course.description, course.ownerAccountId || null, course.createdAt, course.updatedAt]
      );
      return toCourse(rows[0], []);
    },

    async getCourse(courseId) {
      const { rows } = await database.query(
        'SELECT id, title, description, owner_account_id, created_at, updated_at FROM courses WHERE id = $1',
        [courseId]
      );
      if (!rows[0]) {
        return null;
      }
      const materials = await materialsOf([courseId]);
      return toCourse(rows[0], materials.get(courseId) || []);
    },

    async listCourses() {
      const { rows } = await database.query(
        'SELECT id, title, description, owner_account_id, created_at, updated_at FROM courses ORDER BY title ASC'
      );
      const materials = await materialsOf(rows.map((row) => row.id));
      return rows.map((row) => toCourse(row, materials.get(row.id) || []));
    },

    async addMaterial(courseId, material) {
      // position diambil dari materi terakhir dalam satu perintah yang sama,
      // supaya tidak ada jeda baca-lalu-tulis yang bisa disela permintaan lain.
      const { rows } = await database.query(
        `INSERT INTO course_materials
           (id, course_id, material_type, title, content, summary, key_points, study_guide, position, created_at, version)
         SELECT $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb,
                COALESCE((SELECT MAX(position) + 1 FROM course_materials WHERE course_id = $2), 0), $9, 1
         RETURNING id, course_id, material_type, title, content, summary, key_points, study_guide, created_at, version`,
        [
          material.id,
          courseId,
          material.type,
          material.title,
          material.content,
          material.summary,
          JSON.stringify(material.keyPoints || []),
          JSON.stringify(material.studyGuide || []),
          material.createdAt
        ]
      );
      await database.query('UPDATE courses SET updated_at = $2 WHERE id = $1', [courseId, material.createdAt]);
      return toMaterial(rows[0]);
    },

    async updateMaterial(courseId, materialId, value) {
      const { rows } = await database.query(
        `UPDATE course_materials SET title = $3, content = $4, summary = $5, key_points = COALESCE($6::jsonb, key_points), study_guide = COALESCE($7::jsonb, study_guide), version = version + 1
          WHERE course_id = $1 AND id = $2
        RETURNING id, course_id, material_type, title, content, summary, key_points, study_guide, created_at, version`,
        [courseId, materialId, value.title, value.content, value.summary, value.keyPoints ? JSON.stringify(value.keyPoints) : null, value.studyGuide ? JSON.stringify(value.studyGuide) : null]
      );
      return rows[0] ? toMaterial(rows[0]) : null;
    },

    async getEnrollments(studentId) {
      const { rows } = await database.query(
        'SELECT course_id FROM course_enrollments WHERE student_id = $1 ORDER BY enrolled_at ASC',
        [studentId]
      );
      return rows.map((row) => row.course_id);
    },

    async addEnrollment(studentId, courseId, enrolledAt) {
      await database.query(
        `INSERT INTO course_enrollments (student_id, course_id, enrolled_at)
         VALUES ($1, $2, COALESCE($3, now())) ON CONFLICT DO NOTHING`,
        [studentId, courseId, enrolledAt || null]
      );
    },

    async listCompletions(studentId) {
      const { rows } = await database.query(
        `SELECT id, student_id, course_id, material_id, completed_at
           FROM course_completions WHERE student_id = $1 ORDER BY completed_at ASC`,
        [studentId]
      );
      return rows.map((row) => ({
        id: row.id,
        studentId: row.student_id,
        courseId: row.course_id,
        materialId: row.material_id,
        completedAt: toIso(row.completed_at)
      }));
    },

    async addCompletion(record) {
      // Dua klik "selesai" bersamaan hanya menghasilkan satu baris.
      await database.query(
        `INSERT INTO course_completions (id, student_id, course_id, material_id, completed_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (student_id, material_id) DO NOTHING`,
        [record.id, record.studentId, record.courseId, record.materialId, record.completedAt]
      );
    },

    async listAttempts(studentId, materialId) {
      const { rows } = await database.query(
        `SELECT id, student_id, course_id, material_id, attempt_number, answers, score, passed, submitted_at
           FROM lms_attempts WHERE student_id = $1 AND material_id = $2 ORDER BY attempt_number ASC`,
        [studentId, materialId]
      );
      return rows.map((row) => ({ id: row.id, studentId: row.student_id, courseId: row.course_id, materialId: row.material_id, attemptNumber: row.attempt_number, answers: toJson(row.answers), score: row.score, passed: row.passed, submittedAt: toIso(row.submitted_at) }));
    },

    async addAttempt(record) {
      const { rows } = await database.query(
        `INSERT INTO lms_attempts (id, student_id, course_id, material_id, attempt_number, answers, score, passed, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
         RETURNING id, student_id, course_id, material_id, attempt_number, answers, score, passed, submitted_at`,
        [record.id, record.studentId, record.courseId, record.materialId, record.attemptNumber, JSON.stringify(record.answers || {}), record.score, record.passed, record.submittedAt]
      );
      const row = rows[0];
      return { id: row.id, studentId: row.student_id, courseId: row.course_id, materialId: row.material_id, attemptNumber: row.attempt_number, answers: toJson(row.answers), score: row.score, passed: row.passed, submittedAt: toIso(row.submitted_at) };
    },

    async getSubmission(studentId, materialId) {
      const { rows } = await database.query(`SELECT id, student_id, course_id, material_id, body, file_object_id, status, score, reviewer_note, submitted_at, reviewed_at, reviewer_account_id FROM lms_submissions WHERE student_id = $1 AND material_id = $2 AND status <> 'returned'`, [studentId, materialId]);
      return rows[0] ? toSubmission(rows[0]) : null;
    },

    async addSubmission(record) {
      const { rows } = await database.query(`INSERT INTO lms_submissions (id, student_id, course_id, material_id, body, file_object_id, status, score, reviewer_note, submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, student_id, course_id, material_id, body, file_object_id, status, score, reviewer_note, submitted_at, reviewed_at, reviewer_account_id`, [record.id, record.studentId, record.courseId, record.materialId, record.body, record.fileObjectId || null, record.status, record.score, record.reviewerNote || null, record.submittedAt]);
      return toSubmission(rows[0]);
    },

    async reviewSubmission(id, review) {
      const { rows } = await database.query(`UPDATE lms_submissions SET status = $2, score = $3, reviewer_note = $4, reviewed_at = $5, reviewer_account_id = $6 WHERE id = $1 RETURNING id, student_id, course_id, material_id, body, file_object_id, status, score, reviewer_note, submitted_at, reviewed_at, reviewer_account_id`, [id, review.status, review.score, review.reviewerNote, review.reviewedAt, review.reviewerAccountId || null]);
      return rows[0] ? toSubmission(rows[0]) : null;
    }
  };
}

function toSubmission(row) {
  return { id: row.id, studentId: row.student_id, courseId: row.course_id, materialId: row.material_id, body: row.body, fileObjectId: row.file_object_id || null, status: row.status, score: row.score === null ? null : Number(row.score), reviewerNote: row.reviewer_note || '', submittedAt: toIso(row.submitted_at), reviewedAt: toIso(row.reviewed_at), reviewerAccountId: row.reviewer_account_id || null };
}

module.exports = { createPostgresLmsStore, toCourse, toMaterial, toSubmission };
