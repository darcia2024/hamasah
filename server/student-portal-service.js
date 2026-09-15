const crypto = require('node:crypto');

const STAFF_ROLES = Object.freeze(['admin', 'supervisor']);
const VIEWER_ROLES = Object.freeze(['admin', 'supervisor', 'parent', 'student']);
const ATTENDANCE_STATUSES = Object.freeze(['present', 'late', 'excused', 'absent']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return String(value || '').trim();
}

function isDate(value) {
  return !Number.isNaN(Date.parse(value));
}

function createMemoryStudentStore() {
  const database = {
    activities: [],
    achievements: [],
    attendance: [],
    evaluations: [],
    students: {},
    violations: []
  };

  return {
    append(collection, entry) {
      database[collection].push(clone(entry));
      return clone(entry);
    },
    byStudent(collection, studentId) {
      return clone(database[collection].filter(function belongsToStudent(entry) { return entry.studentId === studentId; }));
    },
    getStudent(studentId) {
      return database.students[studentId] ? clone(database.students[studentId]) : null;
    },
    listStudents() {
      return Object.values(database.students).map(clone);
    },
    saveStudent(student) {
      database.students[student.id] = clone(student);
      return clone(student);
    }
  };
}

function createStudentPortalService(options) {
  const config = options || {};
  const store = config.store || createMemoryStudentStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };

  function assertStaff(actor) {
    return actor && STAFF_ROLES.includes(actor.role);
  }

  function canView(student, actor) {
    if (!student || !actor || !VIEWER_ROLES.includes(actor.role)) {
      return false;
    }
    if (STAFF_ROLES.includes(actor.role)) {
      return true;
    }
    if (actor.role === 'student') {
      return student.studentAccountId === actor.id;
    }
    return actor.role === 'parent' && student.parentAccountIds.includes(actor.id);
  }

  function createStudent(input, actor) {
    if (!assertStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const source = input || {};
    const name = clean(source.name);
    const program = clean(source.program);
    const city = clean(source.city);
    const joinDate = clean(source.joinDate);
    if (name.length < 2 || program.length < 2 || city.length < 2 || !isDate(joinDate)) {
      return { ok: false, error: 'Data santri belum lengkap atau belum valid.' };
    }

    const student = store.saveStudent({
      id: crypto.randomUUID(),
      name,
      program,
      city,
      joinDate,
      status: 'active',
      studentAccountId: source.studentAccountId || null,
      parentAccountIds: Array.isArray(source.parentAccountIds) ? source.parentAccountIds.filter(Boolean) : [],
      createdAt: now(),
      updatedAt: now()
    });
    return { ok: true, value: student };
  }

  function linkAccounts(studentId, input, actor) {
    if (!assertStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const student = store.getStudent(studentId);
    if (!student) {
      return { ok: false, error: 'Santri tidak ditemukan.' };
    }
    const source = input || {};
    const parentAccountIds = Array.isArray(source.parentAccountIds)
      ? [...new Set(source.parentAccountIds.filter(Boolean))]
      : student.parentAccountIds;
    const saved = store.saveStudent({
      ...student,
      studentAccountId: source.studentAccountId === undefined ? student.studentAccountId : source.studentAccountId || null,
      parentAccountIds,
      updatedAt: now()
    });
    return { ok: true, value: saved };
  }

  function addRecord(collection, studentId, input, actor) {
    if (!assertStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    if (!store.getStudent(studentId)) {
      return { ok: false, error: 'Santri tidak ditemukan.' };
    }
    const source = input || {};
    const occurredAt = clean(source.occurredAt) || now();
    if (!isDate(occurredAt)) {
      return { ok: false, error: 'Waktu catatan tidak valid.' };
    }

    let record;
    if (collection === 'attendance') {
      const status = clean(source.status);
      if (!ATTENDANCE_STATUSES.includes(status)) {
        return { ok: false, error: 'Status kehadiran tidak valid.' };
      }
      record = { id: crypto.randomUUID(), studentId, status, category: clean(source.category) || 'Kegiatan harian', occurredAt, note: clean(source.note), createdAt: now() };
    } else if (collection === 'achievements') {
      const title = clean(source.title);
      if (title.length < 3) {
        return { ok: false, error: 'Judul capaian diperlukan.' };
      }
      record = { id: crypto.randomUUID(), studentId, title, description: clean(source.description), occurredAt, createdAt: now() };
    } else if (collection === 'activities') {
      const title = clean(source.title);
      if (title.length < 3) {
        return { ok: false, error: 'Judul kegiatan diperlukan.' };
      }
      record = { id: crypto.randomUUID(), studentId, title, description: clean(source.description), occurredAt, createdAt: now() };
    } else if (collection === 'evaluations') {
      const note = clean(source.note);
      if (note.length < 8) {
        return { ok: false, error: 'Catatan evaluasi perlu lebih lengkap.' };
      }
      record = { id: crypto.randomUUID(), studentId, note, area: clean(source.area) || 'Pembinaan', occurredAt, createdAt: now() };
    } else {
      const note = clean(source.note);
      if (note.length < 8) {
        return { ok: false, error: 'Catatan pelanggaran perlu lebih lengkap.' };
      }
      record = { id: crypto.randomUUID(), studentId, note, level: clean(source.level) || 'ringan', occurredAt, createdAt: now() };
    }

    return { ok: true, value: store.append(collection, record) };
  }

  function dashboard(studentId, actor) {
    const student = store.getStudent(studentId);
    if (!student) {
      return { ok: false, error: 'Santri tidak ditemukan.' };
    }
    if (!canView(student, actor)) {
      return { ok: false, error: 'Akses dashboard santri tidak diizinkan.' };
    }

    const attendance = store.byStudent('attendance', studentId).sort(function latestFirst(left, right) { return right.occurredAt.localeCompare(left.occurredAt); });
    const presentCount = attendance.filter(function present(entry) { return entry.status === 'present' || entry.status === 'late'; }).length;
    const attendanceRate = attendance.length ? Math.round((presentCount / attendance.length) * 100) : null;
    const latestFirst = function byLatest(left, right) { return right.occurredAt.localeCompare(left.occurredAt); };

    return {
      ok: true,
      value: {
        student: {
          id: student.id,
          name: student.name,
          program: student.program,
          city: student.city,
          joinDate: student.joinDate,
          status: student.status
        },
        attendance: { total: attendance.length, present: presentCount, rate: attendanceRate, entries: attendance.slice(0, 30) },
        activities: store.byStudent('activities', studentId).sort(latestFirst).slice(0, 20),
        achievements: store.byStudent('achievements', studentId).sort(latestFirst),
        evaluations: store.byStudent('evaluations', studentId).sort(latestFirst),
        discipline: store.byStudent('violations', studentId).sort(latestFirst)
      }
    };
  }

  function listForActor(actor) {
    if (!actor || !VIEWER_ROLES.includes(actor.role) || typeof store.listStudents !== 'function') {
      return [];
    }
    return store.listStudents()
      .filter(function readable(student) { return canView(student, actor); })
      .map(function summary(student) {
        return { id: student.id, name: student.name, program: student.program, city: student.city, status: student.status };
      });
  }

  return Object.freeze({
    addActivity(studentId, input, actor) { return addRecord('activities', studentId, input, actor); },
    addAchievement(studentId, input, actor) { return addRecord('achievements', studentId, input, actor); },
    addAttendance(studentId, input, actor) { return addRecord('attendance', studentId, input, actor); },
    addEvaluation(studentId, input, actor) { return addRecord('evaluations', studentId, input, actor); },
    addViolation(studentId, input, actor) { return addRecord('violations', studentId, input, actor); },
    createMemoryStudentStore,
    createStudent,
    dashboard,
    listForActor,
    linkAccounts
  });
}

module.exports = { ATTENDANCE_STATUSES, createMemoryStudentStore, createStudentPortalService };
