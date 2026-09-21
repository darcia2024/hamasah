const crypto = require('node:crypto');
const { normalizePage } = require('./pagination.js');

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

function jakartaDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function createMemoryStudentStore() {
  const database = {
    activities: [],
    achievements: [],
    attendance: [],
    evaluations: [],
    students: {},
    violations: []
    ,placementHistory: []
  };

  return {
    async append(collection, entry) {
      if (collection === 'attendance' && database.attendance.some((item) => item.studentId === entry.studentId && item.sessionDate === entry.sessionDate && item.category === entry.category)) {
        throw new Error('Presensi untuk sesi dan tanggal tersebut sudah tercatat.');
      }
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
    // Setara dengan listStudentsPage milik store PostgreSQL, untuk test dan pengembangan.
    async listStudentsPage({ scope, search, limit, offset } = {}) {
      const type = scope && scope.type;
      const kata = String(search || '').trim().toLocaleLowerCase('id-ID');
      const cocok = Object.values(database.students)
        .filter(function inScope(student) {
          if (type === 'all') return true;
          if (type === 'dormitories') return Boolean(student.dormitoryId) && (scope.ids || []).includes(student.dormitoryId);
          if (type === 'parent') return (student.parentAccountIds || []).includes(scope.accountId);
          if (type === 'student') return student.studentAccountId === scope.accountId;
          return false;
        })
        .filter(function matchesSearch(student) { return !kata || student.name.toLocaleLowerCase('id-ID').includes(kata); })
        .sort(function byName(left, right) { return left.name.localeCompare(right.name) || left.id.localeCompare(right.id); });
      const page = normalizePage({ limit, offset });
      return { students: cocok.slice(page.offset, page.offset + page.limit).map(clone), total: cocok.length };
    },
    async saveStudent(student) {
      database.students[student.id] = clone(student);
      return clone(student);
    },
    async countInDormitory(dormitoryId) {
      return Object.values(database.students).filter((student) => student.dormitoryId === dormitoryId).length;
    },
    async correctRecord(collection, recordId, correction) {
      const record = database[collection].find((item) => item.id === recordId);
      if (!record) return null;
      const previous = clone(record);
      database[collection] = database[collection].map((item) => item.id === recordId ? { ...item, ...clone(correction.value) } : item);
      return { record: clone(database[collection].find((item) => item.id === recordId)), previous };
    },
    async recordPlacement(entry) {
      database.placementHistory.push(clone(entry));
      return clone(entry);
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
  const countInDormitory = config.countInDormitory || (async function tanpaHitungan() { return 0; });

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
      record = { id: crypto.randomUUID(), studentId, status, category: clean(source.category) || 'Kegiatan harian', sessionDate: jakartaDate(occurredAt), occurredAt, note: clean(source.note), createdAt: now() };
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

    // Pencatat diambil dari sesi yang sedang login, tidak pernah dari isi request.
    // Ditulis setelah record selesai dibentuk, sehingga field recordedByAccountId
    // yang dititipkan di body tidak punya kesempatan menggantikannya. Ini pola yang
    // sama dengan registration_status_events.changed_by_account_id.
    record.recordedByAccountId = actor.id || null;

    try {
      return { ok: true, value: await store.append(collection, record) };
    } catch (error) {
      if (collection === 'attendance' && /sesi|session|unique/i.test(error.message)) return { ok: false, error: error.message };
      throw error;
    }
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
      if (asrama.capacity > 0 && dormitoryId !== student.dormitoryId && (await countInDormitory(dormitoryId)) >= asrama.capacity) {
        return { ok: false, error: 'Kapasitas asrama sudah penuh.' };
      }
    }

    const saved = await store.saveStudent({ ...student, gender, dormitoryId, updatedAt: now() });
    if (typeof store.recordPlacement === 'function' && dormitoryId !== student.dormitoryId) {
      await store.recordPlacement({ id: crypto.randomUUID(), studentId, dormitoryId, actorAccountId: actor.id || null, changedAt: now() });
    }
    return { ok: true, value: saved };
  }

  async function correctRecord(studentId, collection, recordId, input, actor) {
    if (!assertStaff(actor)) return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    if (!['activities', 'achievements', 'attendance', 'evaluations', 'violations'].includes(collection)) return { ok: false, error: 'Jenis catatan tidak valid.' };
    const student = await store.getStudent(studentId);
    if (!student) return { ok: false, error: 'Santri tidak ditemukan.' };
    if (!(await canWrite(student, actor))) return { ok: false, status: 403, error: 'Santri ini berada di luar asrama yang Anda tangani.' };
    const reason = clean(input && input.reason);
    if (reason.length < 5) return { ok: false, error: 'Alasan koreksi wajib diisi.' };
    const sourceValue = input && input.value && typeof input.value === 'object' ? input.value : {};
    const value = {};
    const fields = collection === 'attendance' ? ['status', 'category', 'note'] : collection === 'evaluations' ? ['area', 'note'] : collection === 'violations' ? ['level', 'note'] : ['title', 'description'];
    fields.forEach((field) => { if (sourceValue[field] !== undefined) value[field] = clean(sourceValue[field]); });
    if (sourceValue.occurredAt !== undefined) value.occurredAt = clean(sourceValue.occurredAt);
    const corrected = await store.correctRecord(collection, recordId, { value, reason, actorAccountId: actor.id || null, createdAt: now() });
    return corrected ? { ok: true, value: corrected.record } : { ok: false, error: 'Catatan tidak ditemukan.' };
  }

  async function dashboard(studentId, actor, options) {
    const student = await store.getStudent(studentId);
    if (!student) {
      return { ok: false, error: 'Santri tidak ditemukan.' };
    }
    if (!canView(student, actor, await dormitoryLimitFor(actor))) {
      return { ok: false, error: 'Akses dashboard santri tidak diizinkan.' };
    }

    // Pencatat (siapa yang menulis catatan) adalah informasi internal staf. Wali dan
    // santri hanya perlu isi catatannya; nama musyrif dan id akunnya tidak.
    const forViewer = assertStaff(actor)
      ? function apaAdanya(items) { return items; }
      : function tanpaPencatat(items) {
        return items.map(function bersih(item) {
          const { recordedByAccountId, recordedByName, ...selebihnya } = item;
          return selebihnya;
        });
      };
    // Nama asrama ikut dibawa supaya keluarga melihat asrama anaknya sendiri. Endpoint
    // asrama hanya untuk pengelola, sehingga tanpa ini portal tidak punya nama untuk
    // ditampilkan dan sebelumnya mengarangnya.
    const asrama = student.dormitoryId ? await getDormitory(student.dormitoryId) : null;

    const latestFirst = function byLatest(left, right) { return right.occurredAt.localeCompare(left.occurredAt); };
    const range = options || {};
    const from = range.from ? new Date(range.from) : null;
    const to = range.to ? new Date(`${range.to}T23:59:59.999Z`) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) return { ok: false, error: 'Rentang tanggal tidak valid.' };
    const withinRange = (entry) => (!from || new Date(entry.occurredAt) >= from) && (!to || new Date(entry.occurredAt) <= to);
    const attendance = (await store.byStudent('attendance', studentId)).filter(withinRange).sort(latestFirst);
    const presentCount = attendance.filter(function present(entry) { return entry.status === 'present' || entry.status === 'late'; }).length;
    const attendanceRate = attendance.length ? Math.round((presentCount / attendance.length) * 100) : null;
    const [activities, achievements, evaluations, discipline] = await Promise.all([
      store.byStudent('activities', studentId).then((items) => items.filter(withinRange)),
      store.byStudent('achievements', studentId).then((items) => items.filter(withinRange)),
      store.byStudent('evaluations', studentId).then((items) => items.filter(withinRange)),
      store.byStudent('violations', studentId).then((items) => items.filter(withinRange))
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
          dormitoryId: student.dormitoryId || null,
          dormitory: asrama ? { name: asrama.name, area: asrama.area || null } : null
        },
        period: { from: range.from || null, to: range.to || null },
        attendance: { total: attendance.length, present: presentCount, rate: attendanceRate, entries: forViewer(attendance.slice(0, 30)) },
        activities: forViewer(activities.sort(latestFirst).slice(0, 20)),
        achievements: forViewer(achievements.sort(latestFirst)),
        evaluations: forViewer(evaluations.sort(latestFirst)),
        discipline: forViewer(discipline.sort(latestFirst))
      }
    };
  }

  // Cakupan akses pemanggil sebagai data, untuk diterapkan store di SQL. Harus setara
  // dengan canView(); kesetaraannya diuji di student-portal-service.test.js.
  async function scopeFor(actor) {
    if (!actor || !VIEWER_ROLES.includes(actor.role)) return { type: 'none' };
    if (actor.role === 'supervisor') return { type: 'dormitories', ids: [...(await dormitoryLimitFor(actor))] };
    if (STAFF_ROLES.includes(actor.role)) return { type: 'all' };
    if (actor.role === 'student') return { type: 'student', accountId: actor.id };
    return { type: 'parent', accountId: actor.id };
  }

  // Satu halaman santri yang boleh dilihat pemanggil, disaring dan dipotong di store
  // (Task R6.2). listForActor di bawah tetap ada untuk pemeriksaan kepemilikan di dalam
  // proses; endpoint daftar memakai yang ini.
  async function listPageForActor(actor, options = {}) {
    const page = normalizePage(options);
    const empty = { items: [], total: 0, limit: page.limit, offset: page.offset };
    if (typeof store.listStudentsPage !== 'function') return empty;
    const scope = await scopeFor(actor);
    if (scope.type === 'none') return empty;
    const { students, total } = await store.listStudentsPage({ scope, search: options.search, limit: page.limit, offset: page.offset });
    const namaAsrama = new Map();
    async function namaUntuk(dormitoryId) {
      if (!dormitoryId) return null;
      if (!namaAsrama.has(dormitoryId)) {
        const asrama = await getDormitory(dormitoryId);
        namaAsrama.set(dormitoryId, asrama ? asrama.name : null);
      }
      return namaAsrama.get(dormitoryId);
    }
    const items = await Promise.all(students.map(async function summary(student) {
      return {
        id: student.id,
        name: student.name,
        program: student.program,
        city: student.city,
        status: student.status,
        gender: student.gender || null,
        dormitoryId: student.dormitoryId || null,
        dormitoryName: await namaUntuk(student.dormitoryId)
      };
    }));
    return { items, total, limit: page.limit, offset: page.offset };
  }

  async function listForActor(actor) {
    if (!actor || !VIEWER_ROLES.includes(actor.role) || typeof store.listStudents !== 'function') {
      return [];
    }
    // Batas asrama diambil sekali, bukan per santri, supaya daftar panjang tidak
    // menghasilkan satu query untuk setiap barisnya.
    const dormitoryLimit = await dormitoryLimitFor(actor);
    // Satu pencarian per asrama, bukan per santri.
    const namaAsrama = new Map();
    async function namaUntuk(dormitoryId) {
      if (!dormitoryId) return null;
      if (!namaAsrama.has(dormitoryId)) {
        const asrama = await getDormitory(dormitoryId);
        namaAsrama.set(dormitoryId, asrama ? asrama.name : null);
      }
      return namaAsrama.get(dormitoryId);
    }
    const terbaca = (await store.listStudents())
      .filter(function readable(student) { return canView(student, actor, dormitoryLimit); });
    return Promise.all(terbaca.map(async function summary(student) {
      return {
        id: student.id,
        name: student.name,
        program: student.program,
        city: student.city,
        status: student.status,
        gender: student.gender || null,
        dormitoryId: student.dormitoryId || null,
        dormitoryName: await namaUntuk(student.dormitoryId)
      };
    }));
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
    correctRecord,
    listForActor,
    listPageForActor,
    linkAccounts
  });
}

module.exports = { ATTENDANCE_STATUSES, createMemoryStudentStore, createStudentPortalService };
