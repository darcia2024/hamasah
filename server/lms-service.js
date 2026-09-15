const crypto = require('node:crypto');

const MATERIAL_TYPES = Object.freeze(['video', 'pdf', 'text', 'assignment', 'quiz']);
const STAFF_ROLES = Object.freeze(['admin', 'supervisor']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return String(value || '').trim();
}

function createMemoryLmsStore() {
  const database = { courses: {}, enrollments: {}, completions: [] };
  return {
    addCompletion(record) {
      database.completions.push(clone(record));
      return clone(record);
    },
    byStudent(studentId) {
      return clone(database.completions.filter(function belongsToStudent(entry) { return entry.studentId === studentId; }));
    },
    getCourse(courseId) {
      return database.courses[courseId] ? clone(database.courses[courseId]) : null;
    },
    listCourses() {
      return Object.values(database.courses).map(clone);
    },
    getEnrollments(studentId) {
      return clone(database.enrollments[studentId] || []);
    },
    saveCourse(course) {
      database.courses[course.id] = clone(course);
      return clone(course);
    },
    saveEnrollments(studentId, courseIds) {
      database.enrollments[studentId] = clone(courseIds);
      return clone(courseIds);
    }
  };
}

function createLmsService(options) {
  const config = options || {};
  const store = config.store || createMemoryLmsStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };
  const canAccessStudent = config.canAccessStudent || function noStudentAccess() { return false; };

  function isStaff(actor) {
    return actor && STAFF_ROLES.includes(actor.role);
  }

  function canStudy(studentId, actor) {
    return isStaff(actor) || Boolean(actor && actor.role === 'student' && canAccessStudent(studentId, actor));
  }

  function createCourse(input, actor) {
    if (!isStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const title = clean(input && input.title);
    const description = clean(input && input.description);
    if (title.length < 3 || description.length < 8) {
      return { ok: false, error: 'Judul dan deskripsi maddah belum valid.' };
    }
    const course = store.saveCourse({
      id: crypto.randomUUID(), title, description, materials: [], createdAt: now(), updatedAt: now()
    });
    return { ok: true, value: course };
  }

  function addMaterial(courseId, input, actor) {
    if (!isStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const course = store.getCourse(courseId);
    if (!course) {
      return { ok: false, error: 'Maddah tidak ditemukan.' };
    }
    const source = input || {};
    const type = clean(source.type);
    const title = clean(source.title);
    const content = clean(source.content);
    const summary = clean(source.summary);
    const keyPoints = Array.isArray(source.keyPoints) ? source.keyPoints.map(clean).filter(Boolean).slice(0, 8) : [];
    const studyGuide = Array.isArray(source.studyGuide)
      ? source.studyGuide.map(function normalizeGuide(entry) {
        return { question: clean(entry.question), answer: clean(entry.answer) };
      }).filter(function completeGuide(entry) { return entry.question && entry.answer; }).slice(0, 10)
      : [];
    if (!MATERIAL_TYPES.includes(type) || title.length < 3 || content.length < 3 || summary.length < 8 || keyPoints.length === 0) {
      return { ok: false, error: 'Materi belum lengkap atau jenis materi tidak valid.' };
    }

    const material = { id: crypto.randomUUID(), type, title, content, summary, keyPoints, studyGuide, createdAt: now() };
    const saved = store.saveCourse({ ...course, materials: course.materials.concat(material), updatedAt: now() });
    return { ok: true, value: saved.materials.at(-1) };
  }

  function enroll(studentId, courseId, actor) {
    if (!isStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    if (!store.getCourse(courseId)) {
      return { ok: false, error: 'Maddah tidak ditemukan.' };
    }
    const enrolled = store.getEnrollments(studentId);
    if (!enrolled.includes(courseId)) {
      store.saveEnrollments(studentId, enrolled.concat(courseId));
    }
    return { ok: true };
  }

  function getStudentCourse(studentId, courseId, actor) {
    if (!canStudy(studentId, actor)) {
      return { ok: false, error: 'Akses pembelajaran tidak diizinkan.' };
    }
    if (!store.getEnrollments(studentId).includes(courseId)) {
      return { ok: false, error: 'Santri belum terdaftar pada maddah ini.' };
    }
    const course = store.getCourse(courseId);
    if (!course) {
      return { ok: false, error: 'Maddah tidak ditemukan.' };
    }
    const completions = store.byStudent(studentId);
    const completedMaterialIds = completions
      .filter(function currentCourse(entry) { return entry.courseId === courseId; })
      .map(function materialId(entry) { return entry.materialId; });
    const materials = course.materials.map(function learnerMaterial(material) {
      return {
        id: material.id, type: material.type, title: material.title, content: material.content,
        summary: material.summary, keyPoints: material.keyPoints, completed: completedMaterialIds.includes(material.id)
      };
    });
    return {
      ok: true,
      value: {
        id: course.id,
        title: course.title,
        description: course.description,
        materials,
        progress: course.materials.length ? Math.round((completedMaterialIds.length / course.materials.length) * 100) : 0
      }
    };
  }

  function listStudentCourses(studentId, actor) {
    if (!canStudy(studentId, actor)) {
      return { ok: false, error: 'Akses pembelajaran tidak diizinkan.' };
    }
    const courses = store.getEnrollments(studentId)
      .map(function courseById(courseId) { return getStudentCourse(studentId, courseId, actor); })
      .filter(function successful(result) { return result.ok; })
      .map(function course(result) { return result.value; });
    return { ok: true, value: courses };
  }

  function listCourses(actor) {
    if (!isStaff(actor) || typeof store.listCourses !== 'function') {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    return {
      ok: true,
      value: store.listCourses().sort(function byTitle(left, right) { return left.title.localeCompare(right.title, 'id-ID'); })
    };
  }

  function completeMaterial(studentId, courseId, materialId, actor) {
    if (!canStudy(studentId, actor)) {
      return { ok: false, error: 'Akses pembelajaran tidak diizinkan.' };
    }
    if (!store.getEnrollments(studentId).includes(courseId)) {
      return { ok: false, error: 'Santri belum terdaftar pada maddah ini.' };
    }
    const course = store.getCourse(courseId);
    const material = course && course.materials.find(function matchingMaterial(entry) { return entry.id === materialId; });
    if (!material) {
      return { ok: false, error: 'Materi tidak ditemukan.' };
    }
    const completed = store.byStudent(studentId).some(function alreadyCompleted(entry) {
      return entry.courseId === courseId && entry.materialId === materialId;
    });
    if (!completed) {
      store.addCompletion({ id: crypto.randomUUID(), studentId, courseId, materialId, completedAt: now() });
    }
    return getStudentCourse(studentId, courseId, actor);
  }

  function studyHelp(studentId, courseId, materialId, question, actor) {
    const courseResult = getStudentCourse(studentId, courseId, actor);
    if (!courseResult.ok) {
      return courseResult;
    }
    const course = store.getCourse(courseId);
    const material = course.materials.find(function matchingMaterial(entry) { return entry.id === materialId; });
    if (!material) {
      return { ok: false, error: 'Materi tidak ditemukan.' };
    }
    const normalizedQuestion = clean(question).toLocaleLowerCase('id-ID');
    const guide = material.studyGuide.find(function bestGuide(entry) {
      return entry.question.toLocaleLowerCase('id-ID').split(/\s+/).some(function matchingWord(word) {
        return word.length > 3 && normalizedQuestion.includes(word);
      });
    });
    return {
      ok: true,
      value: {
        materialId: material.id,
        summary: material.summary,
        keyPoints: material.keyPoints,
        answer: guide ? guide.answer : 'Pelajari rangkuman dan poin penting di atas. Jika pertanyaan belum terjawab, catat bagian yang membingungkan untuk didiskusikan bersama pembina.',
        source: guide ? 'panduan materi' : 'rangkuman materi'
      }
    };
  }

  return Object.freeze({
    addMaterial,
    completeMaterial,
    createCourse,
    createMemoryLmsStore,
    enroll,
    getStudentCourse,
    listStudentCourses,
    listCourses,
    studyHelp
  });
}

module.exports = { MATERIAL_TYPES, createLmsService, createMemoryLmsStore };
