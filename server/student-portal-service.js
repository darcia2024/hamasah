const crypto = require('node:crypto');

const STAFF_ROLES = Object.freeze(['admin', 'supervisor']);
const VIEWER_ROLES = Object.freeze(['admin', 'supervisor', 'parent', 'student']);
const ATTENDANCE_STATUSES = Object.freeze(['present', 'late', 'excused', 'absent']);
const GENDERS = Object.freeze(['putra', 'putri']);

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
    async append(collection, entry) {
      database[collection].push(clone(entry));
      return clone(entry);
    },
    async byStudent(collection, studentId) {
      return clone(database[collection].filter(function belongsToStudent(entry) { return entry.studentId === studentId; }));
    },
    async getStudent(studentId) {
      return database.students[studentId] ? clone(database.students[studentId]) : null;
    },
    async listStudents() {
      return Object.values(database.students).map(clone);
    },
    async saveStudent(student) {
      database.students[student.id] = clone(student);
      return clone(student);
    }
  };
}

function createStudentPortalService(options) {
  const config = options || {};
  const store = config.store || createMemoryStudentStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };
  // Id asrama yang ditugaskan kepada satu akun musyrif. Bawaannya daftar kosong,
  // artinya musyrif tidak melihat siapa pun sampai admin menugaskannya.
  const supervisorDormitories = config.supervisorDormitories || async function belumDitugaskan() { return []; };
  // Dipakai untuk memeriksa asrama tujuan saat menempatkan santri.
  const getDormitory = config.getDormitory || async function tanpaAsrama() { return null; };

  function assertStaff(actor) {
    return actor && STAFF_ROLES.includes(actor.role);
  }

  // Daftar id asrama yang boleh diakses satu musyrif. Mengembalikan null untuk role
  // yang memang tidak dibatasi asrama (admin, wali, santri).
  //
  // Musyrif yang belum ditugaskan ke asrama mana pun mendapat daftar kosong, artinya
  // tidak melihat santri sama sekali. Itu disengaja: pilihan lain adalah "belum
  // ditugaskan berarti melihat semua", dan itu membuat pembatasan ini tidak ada artinya
  // karena cukup dengan lupa menugaskan.
  async function dormitoryLimitFor(actor) {
    if (!actor || actor.role !== 'supervisor') {
      return null;
    }
    return new Set(await supervisorDormitories(actor.id));
  }

  function canView(student, actor, dormitoryLimit) {
    if (!student || !actor || !VIEWER_ROLES.includes(actor.role)) {
      return false;
    }
    if (actor.role === 'supervisor') {
      return Boolean(dormitoryLimit && student.dormitoryId && dormitoryLimit.has(student.dormitoryId));
    }
    if (STAFF_ROLES.includes(actor.role)) {
      return true;
    }
    if (actor.role === 'student') {
      return student.studentAccountId === actor.id;
    }
    return actor.role === 'parent' && student.parentAccountIds.includes(actor.id);
  }

  // Staf yang menulis catatan juga dibatasi asrama, bukan hanya yang membaca.
  // Tanpa ini, musyrif asrama lain tetap bisa mencatat pelanggaran untuk santri
  // yang bukan tanggung jawabnya.
  async function canWrite(student, actor) {
    if (!assertStaff(actor)) {
      return false;
    }
    if (actor.role !== 'supervisor') {
      return true;
    }
    return canView(student, actor, await dormitoryLimitFor(actor));
  }

  async function createStudent(input, actor) {
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

    const gender = clean(source.gender);
    if (gender && !GENDERS.includes(gender)) {
      return { ok: false, error: 'Jenis santri tidak valid.' };
    }

    const student = await store.saveStudent({
      id: crypto.randomUUID(),
      name,
      program,
      city,
      joinDate,
      status: 'active',
      gender: gender || null,
      dormitoryId: source.dormitoryId || null,
      studentAccountId: source.studentAccountId || null,
      registrationId: source.registrationId || null,
      birthDate: source.birthDate || null,
      mediaConsent: source.mediaConsent === true,
      parentAccountIds: Array.isArray(source.parentAccountIds) ? source.parentAccountIds.filter(Boolean) : [],
      createdAt: now(),
      updatedAt: now()
    });
    return { ok: true, value: student };
  }

  async function linkAccounts(studentId, input, actor) {
    if (!assertStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const student = await store.getStudent(studentId);
    if (!student) {
      return { ok: false, error: 'Santri tidak ditemukan.' };
    }
    if (!(await canWrite(student, actor))) {
      // Ini penolakan akses, bukan soal data, jadi statusnya 403 dan bukan 422.
      return { ok: false, status: 403, error: 'Santri ini berada di luar asrama yang Anda tangani.' };
    }
    const source = input || {};
    const parentAccountIds = Array.isArray(source.parentAccountIds)
      ? [...new Set(source.parentAccountIds.filter(Boolean))]
      : student.parentAccountIds;
    const saved = await store.saveStudent({
      ...student,
      studentAccountId: source.studentAccountId === undefined ? student.studentAccountId : source.studentAccountId || null,
      parentAccountIds,
      updatedAt: now()
    });
    return { ok: true, value: saved };
  }

  async function addRecord(collection, studentId, input, actor) {
    if (!assertStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const santri = await store.getStudent(studentId);
    if (!santri) {
      return { ok: false, error: 'Santri tidak ditemukan.' };
    }
    if (!(await canWrite(santri, actor))) {
      // Ini penolakan akses, bukan soal data, jadi statusnya 403 dan bukan 422.
      return { ok: false, status: 403, error: 'Santri ini berada di luar asrama yang Anda tangani.' };
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

    return { ok: true, value: await store.append(collection, record) };
  }

  // Menempatkan santri ke asrama. Dipisahkan dari linkAccounts karena ini soal
  // pembinaan, bukan soal akun.
  async function setPlacement(studentId, input, actor) {
    if (!assertStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const student = await store.getStudent(studentId);
    if (!student) {
      return { ok: false, error: 'Santri tidak ditemukan.' };
    }
    if (!(await canWrite(student, actor))) {
      // Ini penolakan akses, bukan soal data, jadi statusnya 403 dan bukan 422.
      return { ok: false, status: 403, error: 'Santri ini berada di luar asrama yang Anda tangani.' };
    }
    const source = input || {};
    const gender = source.gender === undefined ? student.gender : clean(source.gender) || null;
    if (gender && !GENDERS.includes(gender)) {
      return { ok: false, error: 'Jenis santri tidak valid.' };
    }
    const dormitoryId = source.dormitoryId === undefined ? student.dormitoryId : source.dormitoryId || null;

    if (dormitoryId) {
      const asrama = await getDormitory(dormitoryId);
      if (!asrama) {
        return { ok: false, error: 'Asrama tidak ditemukan.' };
      }
      // Santri putri tidak boleh ditempatkan di asrama putra, dan sebaliknya.
      if (gender && asrama.gender !== gender) {
        return { ok: false, error: 'Jenis santri tidak sesuai dengan jenis asrama.' };
      }
    }

    const saved = await store.saveStudent({ ...student, gender, dormitoryId, updatedAt: now() });
    return { ok: true, value: saved };
  }

  async function dashboard(studentId, actor) {
    const student = await store.getStudent(studentId);
    if (!student) {
      return { ok: false, error: 'Santri tidak ditemukan.' };
    }
    if (!canView(student, actor, await dormitoryLimitFor(actor))) {
      return { ok: false, error: 'Akses dashboard santri tidak diizinkan.' };
    }

    const latestFirst = function byLatest(left, right) { return right.occurredAt.localeCompare(left.occurredAt); };
    const attendance = (await store.byStudent('attendance', studentId)).sort(latestFirst);
    const presentCount = attendance.filter(function present(entry) { return entry.status === 'present' || entry.status === 'late'; }).length;
    const attendanceRate = attendance.length ? Math.round((presentCount / attendance.length) * 100) : null;
    const [activities, achievements, evaluations, discipline] = await Promise.all([
      store.byStudent('activities', studentId),
      store.byStudent('achievements', studentId),
      store.byStudent('evaluations', studentId),
      store.byStudent('violations', studentId)
    ]);

    return {
      ok: true,
      value: {
        student: {
          id: student.id,
          name: student.name,
          program: student.program,
          city: student.city,
          joinDate: student.joinDate,
          status: student.status,
          gender: student.gender || null,
          dormitoryId: student.dormitoryId || null
        },
        attendance: { total: attendance.length, present: presentCount, rate: attendanceRate, entries: attendance.slice(0, 30) },
        activities: activities.sort(latestFirst).slice(0, 20),
        achievements: achievements.sort(latestFirst),
        evaluations: evaluations.sort(latestFirst),
        discipline: discipline.sort(latestFirst)
      }
    };
  }

  async function listForActor(actor) {
    if (!actor || !VIEWER_ROLES.includes(actor.role) || typeof store.listStudents !== 'function') {
      return [];
    }
    // Batas asrama diambil sekali, bukan per santri, supaya daftar panjang tidak
    // menghasilkan satu query untuk setiap barisnya.
    const dormitoryLimit = await dormitoryLimitFor(actor);
    return (await store.listStudents())
      .filter(function readable(student) { return canView(student, actor, dormitoryLimit); })
      .map(function summary(student) {
        return {
          id: student.id,
          name: student.name,
          program: student.program,
          city: student.city,
          status: student.status,
          gender: student.gender || null,
          dormitoryId: student.dormitoryId || null
        };
      });
  }

  return Object.freeze({
    setPlacement,
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
