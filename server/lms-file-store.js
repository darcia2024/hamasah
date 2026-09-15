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
    addCompletion(record) {
      const database = readDatabase();
      database.completions.push(clone(record));
      writeDatabase(database);
      return clone(record);
    },
    byStudent(studentId) {
      return clone(readDatabase().completions.filter(function belongsToStudent(entry) { return entry.studentId === studentId; }));
    },
    getCourse(courseId) {
      const course = readDatabase().courses[courseId];
      return course ? clone(course) : null;
    },
    listCourses() {
      return Object.values(readDatabase().courses).map(clone);
    },
    getEnrollments(studentId) {
      return clone(readDatabase().enrollments[studentId] || []);
    },
    saveCourse(course) {
      const database = readDatabase();
      database.courses[course.id] = clone(course);
      writeDatabase(database);
      return clone(course);
    },
    saveEnrollments(studentId, courseIds) {
      const database = readDatabase();
      database.enrollments[studentId] = clone(courseIds);
      writeDatabase(database);
      return clone(courseIds);
    }
  };
}

module.exports = { createLmsFileStore };
