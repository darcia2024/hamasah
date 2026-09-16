// Penyimpanan maddah, materi, pendaftaran kelas, dan penyelesaian materi di PostgreSQL.
// Menggantikan lms-file-store.js.

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
    createdAt: toIso(row.created_at)
  };
}

function toCourse(row, materials) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    materials,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

const SELECT_MATERIAL = `SELECT id, course_id, material_type, title, content, summary, key_points, study_guide, created_at
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
        `INSERT INTO courses (id, title, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, description, created_at, updated_at`,
        [course.id, course.title, course.description, course.createdAt, course.updatedAt]
      );
      return toCourse(rows[0], []);
    },

    async getCourse(courseId) {
      const { rows } = await database.query(
        'SELECT id, title, description, created_at, updated_at FROM courses WHERE id = $1',
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
        'SELECT id, title, description, created_at, updated_at FROM courses ORDER BY title ASC'
      );
      const materials = await materialsOf(rows.map((row) => row.id));
      return rows.map((row) => toCourse(row, materials.get(row.id) || []));
    },

    async addMaterial(courseId, material) {
      // position diambil dari materi terakhir dalam satu perintah yang sama,
      // supaya tidak ada jeda baca-lalu-tulis yang bisa disela permintaan lain.
      const { rows } = await database.query(
        `INSERT INTO course_materials
           (id, course_id, material_type, title, content, summary, key_points, study_guide, position, created_at)
         SELECT $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb,
                COALESCE((SELECT MAX(position) + 1 FROM course_materials WHERE course_id = $2), 0), $9
         RETURNING id, course_id, material_type, title, content, summary, key_points, study_guide, created_at`,
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
    }
  };
}

module.exports = { createPostgresLmsStore, toCourse, toMaterial };
