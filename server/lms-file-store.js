// Penyimpanan LMS sementara di berkas JSON. Dipakai hanya sampai app diwajibkan
// memakai database (Task 7.8), lalu berkas ini dihapus.
// Antarmukanya sengaja sama dengan postgres-lms-store.js.

const fs = require('node:fs');
const path = require('node:path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLmsFileStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function readDatabase() {
    if (!fs.existsSync(filePath)) {
      return { courses: {}, enrollments: {}, completions: [] };
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      courses: data.courses || {},
      enrollments: data.enrollments || {},
      completions: Array.isArray(data.completions) ? data.completions : []
    };
  }

  function writeDatabase(database) {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(database, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  return {
    async createCourse(course) {
      const database = readDatabase();
      database.courses[course.id] = clone({ ...course, materials: [] });
      writeDatabase(database);
      return clone(database.courses[course.id]);
    },
    async getCourse(courseId) {
      const course = readDatabase().courses[courseId];
      return course ? clone(course) : null;
    },
    async listCourses() {
      return Object.values(readDatabase().courses).map(clone).sort(function byTitle(left, right) {
        return left.title.localeCompare(right.title, 'id-ID');
      });
    },
    async addMaterial(courseId, material) {
      const database = readDatabase();
      const course = database.courses[courseId];
      course.materials.push(clone(material));
      course.updatedAt = material.createdAt;
      writeDatabase(database);
      return clone(material);
    },
    async getEnrollments(studentId) {
      return clone(readDatabase().enrollments[studentId] || []);
    },
    async addEnrollment(studentId, courseId) {
      const database = readDatabase();
      const enrolled = database.enrollments[studentId] || [];
      if (!enrolled.includes(courseId)) {
        database.enrollments[studentId] = enrolled.concat(courseId);
        writeDatabase(database);
      }
    },
    async listCompletions(studentId) {
      return clone(readDatabase().completions.filter(function belongsToStudent(entry) { return entry.studentId === studentId; }));
    },
    async addCompletion(record) {
      const database = readDatabase();
      const sudahAda = database.completions.some(function sama(entry) {
        return entry.studentId === record.studentId && entry.materialId === record.materialId;
      });
      if (!sudahAda) {
        database.completions.push(clone(record));
        writeDatabase(database);
      }
    }
  };
}

module.exports = { createLmsFileStore };
