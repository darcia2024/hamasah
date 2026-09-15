const fs = require('node:fs');
const path = require('node:path');

const COLLECTIONS = ['activities', 'achievements', 'attendance', 'evaluations', 'violations'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStudentFileStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function readDatabase() {
    if (!fs.existsSync(filePath)) {
      return { students: {}, activities: [], achievements: [], attendance: [], evaluations: [], violations: [] };
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const database = { students: data.students || {} };
    COLLECTIONS.forEach(function assignCollection(collection) {
      database[collection] = Array.isArray(data[collection]) ? data[collection] : [];
    });
    return database;
  }

  function writeDatabase(database) {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(database, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  return {
    append(collection, entry) {
      if (!COLLECTIONS.includes(collection)) {
        throw new Error('Koleksi catatan tidak dikenal.');
      }
      const database = readDatabase();
      database[collection].push(clone(entry));
      writeDatabase(database);
      return clone(entry);
    },
    byStudent(collection, studentId) {
      if (!COLLECTIONS.includes(collection)) {
        return [];
      }
      return clone(readDatabase()[collection].filter(function belongsToStudent(entry) { return entry.studentId === studentId; }));
    },
    getStudent(studentId) {
      const student = readDatabase().students[studentId];
      return student ? clone(student) : null;
    },
    listStudents() {
      return Object.values(readDatabase().students).map(clone);
    },
    saveStudent(student) {
      const database = readDatabase();
      database.students[student.id] = clone(student);
      writeDatabase(database);
      return clone(student);
    }
  };
}

module.exports = { createStudentFileStore };
