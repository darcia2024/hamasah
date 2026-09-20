const crypto = require('node:crypto');

const MATERIAL_TYPES = Object.freeze(['video', 'pdf', 'text', 'assignment', 'quiz']);
// Harus sepadan dengan izin courses.manage dan courses.read di server/access-policy.js.
const MANAGE_ROLES = Object.freeze(['admin', 'teacher']);
const VIEW_ROLES = Object.freeze(['admin', 'teacher', 'supervisor']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return String(value || '').trim();
}

// Antarmuka store LMS sama persis dengan postgres-lms-store.js, supaya service
// tidak perlu tahu data disimpan di mana.
function createMemoryLmsStore() {
  const database = { courses: {}, enrollments: {}, completions: [], attempts: [], submissions: [] };
  return {
    async createCourse(course) {
      database.courses[course.id] = clone({ ...course, materials: [] });
      return clone(database.courses[course.id]);
    },
    async getCourse(courseId) {
      return database.courses[courseId] ? clone(database.courses[courseId]) : null;
    },
    async listCourses() {
      return Object.values(database.courses).map(clone).sort(function byTitle(left, right) {
        return left.title.localeCompare(right.title, 'id-ID');
      });
    },
    async addMaterial(courseId, material) {
      const course = database.courses[courseId];
      const saved = { ...material, version: 1, position: course.materials.length, archivedAt: null };
      course.materials.push(clone(saved));
      course.updatedAt = material.createdAt;
      return clone(saved);
    },
    async getEnrollments(studentId) {
      return clone(database.enrollments[studentId] || []);
    },
    async addEnrollment(studentId, courseId) {
      const enrolled = database.enrollments[studentId] || [];
      if (!enrolled.includes(courseId)) {
        database.enrollments[studentId] = enrolled.concat(courseId);
      }
    },
    async listCompletions(studentId) {
      return clone(database.completions.filter(function belongsToStudent(entry) { return entry.studentId === studentId; }));
    },
    async addCompletion(record) {
      const sudahAda = database.completions.some(function sama(entry) {
        return entry.studentId === record.studentId && entry.materialId === record.materialId;
      });
      if (!sudahAda) {
        database.completions.push(clone(record));
      }
    },
    async listAttempts(studentId, materialId) { return clone(database.attempts.filter((entry) => entry.studentId === studentId && (!materialId || entry.materialId === materialId))); },
    async addAttempt(record) { database.attempts.push(clone(record)); return clone(record); }
    ,async getSubmission(studentId, materialId) { return clone(database.submissions.find((item) => item.studentId === studentId && item.materialId === materialId && item.status !== 'returned') || null); }
    ,async addSubmission(record) { database.submissions.push(clone(record)); return clone(record); }
    ,async reviewSubmission(id, review) { const item = database.submissions.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, review); return clone(item); }
    ,async updateMaterial(courseId, materialId, value) { const course = database.courses[courseId]; const item = course && course.materials.find((entry) => entry.id === materialId); if (!item) return null; Object.assign(item, value, { version: (item.version || 1) + 1 }); return clone(item); }
    ,async archiveMaterial(courseId, materialId, archivedAt) { const course = database.courses[courseId]; const item = course && course.materials.find((entry) => entry.id === materialId); if (!item) return null; item.archivedAt = archivedAt; item.version = (item.version || 1) + 1; return clone(item); }
  };
}

function createLmsService(options) {
  const config = options || {};
  const store = config.store || createMemoryLmsStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };
  const canAccessStudent = config.canAccessStudent || async function noStudentAccess() { return false; };
  const aiService = config.aiService || null;

  function isStaff(actor) {
    return Boolean(actor && MANAGE_ROLES.includes(actor.role));
  }

  function canManageCourse(course, actor) {
    return Boolean(actor && (actor.role === 'admin' || (actor.role === 'teacher' && course && course.ownerAccountId === actor.id)));
  }

  // Wajib di-await. Tanpa await, Promise selalu bernilai benar dan akses santri lain terbuka.
  async function canStudy(studentId, actor) {
    // Musyrif boleh melihat pembelajaran santri walau tidak boleh mengelola maddah.
    if (actor && VIEW_ROLES.includes(actor.role)) {
      return true;
    }
    if (!actor || actor.role !== 'student') {
      return false;
    }
    return Boolean(await canAccessStudent(studentId, actor));
  }

  async function createCourse(input, actor) {
    if (!isStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const title = clean(input && input.title);
    const description = clean(input && input.description);
    if (title.length < 3 || description.length < 8) {
      return { ok: false, error: 'Judul dan deskripsi maddah belum valid.' };
    }
    const course = await store.createCourse({
      id: crypto.randomUUID(), title, description, ownerAccountId: actor.role === 'teacher' ? actor.id : null, createdAt: now(), updatedAt: now()
    });
    return { ok: true, value: course };
  }

  async function addMaterial(courseId, input, actor) {
    if (!isStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const course = await store.getCourse(courseId);
    if (!course || !canManageCourse(course, actor)) {
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

    const saved = await store.addMaterial(courseId, {
      id: crypto.randomUUID(), type, title, content, summary, keyPoints, studyGuide, createdAt: now()
    });
    return { ok: true, value: saved };
  }

  async function updateMaterial(courseId, materialId, input, actor) {
    if (!isStaff(actor)) return { ok: false, error: 'Akses guru atau admin diperlukan.' };
    const course = await store.getCourse(courseId); if (!course || !course.materials.some((item) => item.id === materialId)) return { ok: false, error: 'Materi tidak ditemukan.' };
    if (!canManageCourse(course, actor)) return { ok: false, error: 'Guru hanya dapat mengubah course miliknya.' };
    const source = input || {}; const title = clean(source.title); const content = clean(source.content); const summary = clean(source.summary);
    if (title.length < 3 || content.length < 3 || summary.length < 8) return { ok: false, error: 'Materi belum lengkap.' };
    const value = await store.updateMaterial(courseId, materialId, { title, content, summary, keyPoints: Array.isArray(source.keyPoints) ? source.keyPoints.map(clean).filter(Boolean).slice(0, 8) : undefined, studyGuide: Array.isArray(source.studyGuide) ? source.studyGuide : undefined, updatedAt: now() });
    return value ? { ok: true, value } : { ok: false, error: 'Materi tidak ditemukan.' };
  }

  async function archiveMaterial(courseId, materialId, actor) {
    if (!isStaff(actor)) return { ok: false, error: 'Akses guru atau admin diperlukan.' };
    const course = await store.getCourse(courseId);
    if (!course || !canManageCourse(course, actor)) return { ok: false, error: 'Maddah tidak ditemukan.' };
    if (!course.materials.some((item) => item.id === materialId) || typeof store.archiveMaterial !== 'function') return { ok: false, error: 'Materi tidak ditemukan.' };
    const saved = await store.archiveMaterial(courseId, materialId, now());
    return saved ? { ok: true, value: saved } : { ok: false, error: 'Materi tidak ditemukan.' };
  }

  async function enroll(studentId, courseId, actor) {
    if (!isStaff(actor)) {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const course = await store.getCourse(courseId);
    if (!course) {
      return { ok: false, error: 'Maddah tidak ditemukan.' };
    }
    if (!canManageCourse(course, actor)) return { ok: false, error: 'Guru hanya dapat mengelola enrollment course miliknya.' };
    await store.addEnrollment(studentId, courseId, now());
    return { ok: true };
  }

  async function getStudentCourse(studentId, courseId, actor) {
    if (!(await canStudy(studentId, actor))) {
      return { ok: false, error: 'Akses pembelajaran tidak diizinkan.' };
    }
    if (!(await store.getEnrollments(studentId)).includes(courseId)) {
      return { ok: false, error: 'Santri belum terdaftar pada maddah ini.' };
    }
    const course = await store.getCourse(courseId);
    if (!course) {
      return { ok: false, error: 'Maddah tidak ditemukan.' };
    }
    const completions = await store.listCompletions(studentId);
    const completedMaterialIds = completions
      .filter(function currentCourse(entry) { return entry.courseId === courseId; })
      .map(function materialId(entry) { return entry.materialId; });
    const activeMaterials = course.materials.filter((material) => !material.archivedAt);
    const materials = activeMaterials.map(function learnerMaterial(material) {
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
        progress: activeMaterials.length ? Math.round((completedMaterialIds.filter((id) => activeMaterials.some((material) => material.id === id)).length / activeMaterials.length) * 100) : 0,
        completionStatus: activeMaterials.length && completedMaterialIds.filter((id) => activeMaterials.some((material) => material.id === id)).length === activeMaterials.length ? 'completed' : 'in-progress'
      }
    };
  }

  async function listStudentCourses(studentId, actor) {
    if (!(await canStudy(studentId, actor))) {
      return { ok: false, error: 'Akses pembelajaran tidak diizinkan.' };
    }
    const courseIds = await store.getEnrollments(studentId);
    const courses = [];
    for (const courseId of courseIds) {
      const result = await getStudentCourse(studentId, courseId, actor);
      if (result.ok) {
        courses.push(result.value);
      }
    }
    return { ok: true, value: courses };
  }

  async function listCourses(actor) {
    if (!isStaff(actor) || typeof store.listCourses !== 'function') {
      return { ok: false, error: 'Akses pengawas atau admin diperlukan.' };
    }
    const courses = await store.listCourses();
    return { ok: true, value: actor.role === 'admin' ? courses : courses.filter((course) => course.ownerAccountId === actor.id) };
  }

  async function completeMaterial(studentId, courseId, materialId, actor) {
    if (!(await canStudy(studentId, actor))) {
      return { ok: false, error: 'Akses pembelajaran tidak diizinkan.' };
    }
    if (!(await store.getEnrollments(studentId)).includes(courseId)) {
      return { ok: false, error: 'Santri belum terdaftar pada maddah ini.' };
    }
    const course = await store.getCourse(courseId);
    const material = course && course.materials.find(function matchingMaterial(entry) { return entry.id === materialId; });
    if (!material) {
      return { ok: false, error: 'Materi tidak ditemukan.' };
    }
    // Store menolak duplikat sendiri, jadi klik ganda tidak membuat baris kedua.
    await store.addCompletion({ id: crypto.randomUUID(), studentId, courseId, materialId, completedAt: now() });
    return getStudentCourse(studentId, courseId, actor);
  }

  async function submitQuiz(studentId, courseId, materialId, answers, actor) {
    if (!(await canStudy(studentId, actor))) return { ok: false, error: 'Akses pembelajaran tidak diizinkan.' };
    if (!(await store.getEnrollments(studentId)).includes(courseId)) return { ok: false, error: 'Santri belum terdaftar pada maddah ini.' };
    const course = await store.getCourse(courseId);
    const material = course && course.materials.find((entry) => entry.id === materialId);
    if (!material || material.type !== 'quiz') return { ok: false, error: 'Kuis tidak ditemukan.' };
    let questions;
    try { questions = JSON.parse(material.content).questions; } catch { questions = null; }
    if (!Array.isArray(questions) || !questions.length) return { ok: false, error: 'Konfigurasi kuis belum valid.' };
    const previous = await store.listAttempts(studentId, materialId);
    if (previous.length >= 3) return { ok: false, error: 'Batas percobaan kuis sudah tercapai.' };
    const submitted = answers && typeof answers === 'object' ? answers : {};
    const benar = questions.reduce((total, question, index) => total + (String(submitted[index] ?? '') === String(question.answer) ? 1 : 0), 0);
    const score = Math.round((benar / questions.length) * 100);
    const attempt = await store.addAttempt({ id: crypto.randomUUID(), studentId, courseId, materialId, attemptNumber: previous.length + 1, answers: submitted, score, passed: score >= 70, submittedAt: now() });
    if (attempt.passed) await store.addCompletion({ id: crypto.randomUUID(), studentId, courseId, materialId, completedAt: now() });
    return { ok: true, value: { attempt, course: await getStudentCourse(studentId, courseId, actor) } };
  }

  async function submitAssignment(studentId, courseId, materialId, input, actor) {
    if (!(await canStudy(studentId, actor))) return { ok: false, error: 'Akses pembelajaran tidak diizinkan.' };
    if (!(await store.getEnrollments(studentId)).includes(courseId)) return { ok: false, error: 'Santri belum terdaftar pada maddah ini.' };
    const course = await store.getCourse(courseId); const material = course && course.materials.find((entry) => entry.id === materialId);
    if (!material || material.type !== 'assignment') return { ok: false, error: 'Tugas tidak ditemukan.' };
    if (await store.getSubmission(studentId, materialId)) return { ok: false, error: 'Tugas ini sudah dikirim dan menunggu review.' };
    const body = clean(input && input.body); if (body.length < 3) return { ok: false, error: 'Jawaban tugas terlalu singkat.' };
    return { ok: true, value: await store.addSubmission({ id: crypto.randomUUID(), studentId, courseId, materialId, body, fileObjectId: clean(input && input.fileObjectId) || null, status: 'submitted', score: null, reviewerNote: '', submittedAt: now(), reviewedAt: null, reviewerAccountId: null }) };
  }

  async function reviewSubmission(submissionId, input, actor) {
    if (!isStaff(actor)) return { ok: false, error: 'Akses guru atau admin diperlukan.' };
    const score = Number(input && input.score); const note = clean(input && input.note);
    if (!Number.isInteger(score) || score < 0 || score > 100 || note.length < 3) return { ok: false, error: 'Nilai dan catatan review belum valid.' };
    const saved = await store.reviewSubmission(submissionId, { status: 'reviewed', score, reviewerNote: note, reviewedAt: now(), reviewerAccountId: actor.id || null });
    if (saved && score >= 70) await store.addCompletion({ id: crypto.randomUUID(), studentId: saved.studentId, courseId: saved.courseId, materialId: saved.materialId, completedAt: now() });
    return saved ? { ok: true, value: saved } : { ok: false, error: 'Submission tidak ditemukan.' };
  }

  async function studyHelp(studentId, courseId, materialId, question, actor) {
    const courseResult = await getStudentCourse(studentId, courseId, actor);
    if (!courseResult.ok) {
      return courseResult;
    }
    const course = await store.getCourse(courseId);
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
    const fallbackAnswer = guide ? guide.answer : 'Pelajari rangkuman dan poin penting di atas. Jika pertanyaan belum terjawab, catat bagian yang membingungkan untuk didiskusikan bersama pembina.';
    if (aiService && typeof aiService.answer === 'function') {
      const aiResult = await aiService.answer({
        actor,
        question: clean(question),
        fallbackAnswer,
        fallbackSource: guide ? 'panduan materi' : 'rangkuman materi',
        context: { title: material.title, summary: material.summary, keyPoints: material.keyPoints, studyGuide: material.studyGuide }
      });
      if (!aiResult.ok) return aiResult;
      return { ok: true, value: { materialId: material.id, summary: material.summary, keyPoints: material.keyPoints, ...aiResult.value } };
    }
    return {
      ok: true,
      value: {
        materialId: material.id,
        summary: material.summary,
        keyPoints: material.keyPoints,
        answer: fallbackAnswer,
        source: guide ? 'panduan materi' : 'rangkuman materi'
      }
    };
  }

  return Object.freeze({
    addMaterial,
    archiveMaterial,
    completeMaterial,
    createCourse,
    createMemoryLmsStore,
    enroll,
    getStudentCourse,
    listCourses,
    listStudentCourses,
    studyHelp,
    updateMaterial,
    submitAssignment,
    reviewSubmission
    ,submitQuiz
  });
}

module.exports = { MATERIAL_TYPES, createLmsService, createMemoryLmsStore };
