const crypto = require('node:crypto');
const { findAnswer } = require('./study-retriever.js');

const MATERIAL_TYPES = Object.freeze(['video', 'pdf', 'text', 'assignment', 'quiz']);
// Dipakai submitQuiz dan ditampilkan ke santri supaya aturannya tidak tersembunyi.
const QUIZ_ATTEMPT_LIMIT = 3;
const QUIZ_PASSING_SCORE = 70;
const ASSIGNMENT_PASSING_SCORE = 70;
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
    async updateCourse(course) {
      if (!database.courses[course.id]) return null;
      Object.assign(database.courses[course.id], { title: course.title, description: course.description, ownerAccountId: course.ownerAccountId, updatedAt: course.updatedAt });
      return clone(database.courses[course.id]);
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
    async listEnrolledStudentIds(courseId) {
      return Object.keys(database.enrollments).filter((studentId) => database.enrollments[studentId].includes(courseId));
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
    ,async listSubmissionsByCourse(courseId) { return clone(database.submissions.filter((item) => item.courseId === courseId)); }
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
  // Wali hanya boleh melihat RINGKASAN progres santri yang terhubung dengannya, bukan isi materi.
  const canViewProgress = config.canViewProgress || async function noProgressAccess() { return false; };
  const aiService = config.aiService || null;
  // Saklar "Asisten belajar LMS" di halaman Pengaturan. Tanpa saklar, asisten selalu aktif.
  const studyHelpEnabled = config.studyHelpEnabled || async function alwaysOn() { return true; };
  // Guru tidak punya izin students.read, jadi nama santri pada daftar kiriman tugas
  // diambil di server lewat pencari ini, bukan dengan memanggil API santri dari peramban.
  const studentNameOf = config.studentNameOf || async function noName() { return null; };
  // Daftar santri untuk formulir enrollment guru (hanya id, nama, program).
  const listStudents = config.listStudents || async function tanpaSantri() { return []; };
  // Dipakai saat admin memindahkan maddah ke guru lain.
  const getAccount = config.getAccount || async function tanpaAkun() { return null; };

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

  // Ubah judul dan deskripsi maddah (admin atau guru pemiliknya). Hanya admin yang boleh
  // memindahkan maddah ke guru lain, dan tujuannya harus akun guru aktif.
  async function updateCourse(courseId, input, actor) {
    if (!isStaff(actor)) {
      return { ok: false, status: 403, error: 'Akses guru atau admin diperlukan.' };
    }
    const course = await store.getCourse(courseId);
    if (!course || !canManageCourse(course, actor)) {
      return { ok: false, status: 404, error: 'Maddah tidak ditemukan.' };
    }
    const source = input || {};
    const title = clean(source.title === undefined ? course.title : source.title);
    const description = clean(source.description === undefined ? course.description : source.description);
    if (title.length < 3 || description.length < 8) {
      return { ok: false, error: 'Judul dan deskripsi maddah belum valid.' };
    }
    let ownerAccountId = course.ownerAccountId || null;
    if (source.ownerAccountId !== undefined && (source.ownerAccountId || null) !== ownerAccountId) {
      if (actor.role !== 'admin') {
        return { ok: false, status: 403, error: 'Hanya admin yang dapat memindahkan maddah ke guru lain.' };
      }
      ownerAccountId = source.ownerAccountId || null;
      if (ownerAccountId) {
        const guru = await getAccount(ownerAccountId);
        if (!guru || guru.role !== 'teacher' || !guru.active) {
          return { ok: false, error: 'Pemilik maddah harus akun guru yang aktif.' };
        }
      }
    }
    const saved = await store.updateCourse({ ...course, title, description, ownerAccountId, updatedAt: now() });
    const changed = ['title', 'description', 'ownerAccountId'].filter((key) => (course[key] || null) !== (saved[key] || null));
    return { ok: true, value: saved, changed };
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
    return buildStudentCourse(studentId, courseId);
  }

  // Isi maddah beserta progres santri; pemeriksaan akses ada di pemanggil.
  async function buildStudentCourse(studentId, courseId) {
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
    const attempts = typeof store.listAttempts === 'function' ? await store.listAttempts(studentId, null) : [];
    const materials = await Promise.all(activeMaterials.map(async function learnerMaterial(material) {
      const dasar = {
        id: material.id, type: material.type, title: material.title, content: material.content,
        summary: material.summary, keyPoints: material.keyPoints, completed: completedMaterialIds.includes(material.id)
      };
      if (material.type === 'quiz') {
        // Kunci jawaban tidak pernah dikirim ke peramban santri: yang dikirim hanya
        // pertanyaannya. Penilaian tetap dikerjakan server di submitQuiz.
        let questions = [];
        try { questions = JSON.parse(material.content).questions || []; } catch { questions = []; }
        dasar.content = '';
        dasar.quiz = {
          questions: questions.map((question, index) => ({ index, prompt: question.prompt })),
          attemptLimit: QUIZ_ATTEMPT_LIMIT,
          passingScore: QUIZ_PASSING_SCORE
        };
        dasar.attempts = attempts
          .filter((attempt) => attempt.materialId === material.id)
          .map((attempt) => ({ attemptNumber: attempt.attemptNumber, score: attempt.score, passed: attempt.passed, createdAt: attempt.createdAt }));
      }
      if (material.type === 'assignment' && typeof store.getSubmission === 'function') {
        const submission = await store.getSubmission(studentId, material.id);
        dasar.submission = submission
          ? { id: submission.id, status: submission.status, score: submission.score, reviewerNote: submission.reviewerNote, submittedAt: submission.submittedAt || submission.createdAt || null }
          : null;
      }
      return dasar;
    }));
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

  // Ringkasan progres per maddah: judul dan hitungan saja, tanpa isi, ringkasan, atau poin
  // materi. Terbuka untuk yang boleh belajar/memantau (canStudy) dan untuk wali santri itu.
  async function progressSummary(studentId, actor) {
    const boleh = (await canStudy(studentId, actor)) || Boolean(actor && actor.role === 'parent' && (await canViewProgress(studentId, actor)));
    if (!boleh) return { ok: false, error: 'Akses progres maddah tidak diizinkan.' };
    const items = [];
    for (const courseId of await store.getEnrollments(studentId)) {
      const result = await buildStudentCourse(studentId, courseId);
      if (!result.ok) continue;
      const course = result.value;
      items.push({
        id: course.id,
        title: course.title,
        totalMaterials: course.materials.length,
        completedMaterials: course.materials.filter((material) => material.completed).length,
        progress: course.progress,
        completionStatus: course.completionStatus
      });
    }
    return { ok: true, value: items };
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
    // Kuis selesai saat lulus (submitQuiz) dan tugas saat dinilai lulus oleh pengajar
    // (reviewSubmission). Menandai keduanya selesai secara manual membuat progres yang
    // dilihat wali palsu.
    if (material.type === 'quiz') {
      return { ok: false, error: 'Kuis tercatat selesai otomatis setelah Anda lulus.' };
    }
    if (material.type === 'assignment') {
      return { ok: false, error: 'Tugas tercatat selesai otomatis setelah dinilai lulus oleh pengajar.' };
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
    if (previous.length >= QUIZ_ATTEMPT_LIMIT) return { ok: false, error: 'Batas percobaan kuis sudah tercapai.' };
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

  // Guru perlu tahu kiriman mana yang menunggu dinilai. Tanpa ini, review hanya
  // bisa dipanggil kalau id kirimannya sudah diketahui dari tempat lain.
  async function listSubmissions(courseId, actor) {
    if (!isStaff(actor)) return { ok: false, error: 'Akses guru atau admin diperlukan.' };
    const course = await store.getCourse(courseId);
    if (!course || !canManageCourse(course, actor)) return { ok: false, error: 'Maddah tidak ditemukan.' };
    if (typeof store.listSubmissionsByCourse !== 'function') return { ok: true, value: [] };
    const judul = new Map(course.materials.map((material) => [material.id, material.title]));
    const items = await store.listSubmissionsByCourse(courseId);
    const nama = new Map();
    for (const item of items) {
      if (!nama.has(item.studentId)) nama.set(item.studentId, await studentNameOf(item.studentId));
    }
    return {
      ok: true,
      value: items
        .map((item) => ({
          ...item,
          materialTitle: judul.get(item.materialId) || 'Materi tidak ditemukan',
          studentName: nama.get(item.studentId) || item.studentId
        }))
        .sort((left, right) => String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')))
    };
  }

  // Beranda guru: per maddah yang diampu, jumlah materi aktif, santri terdaftar, dan
  // kiriman tugas yang menunggu dinilai. Admin melihat semua maddah.
  async function teacherSummary(actor) {
    const daftar = await listCourses(actor);
    if (!daftar.ok) return daftar;
    const courses = [];
    for (const course of daftar.value) {
      const santri = typeof store.listEnrolledStudentIds === 'function' ? await store.listEnrolledStudentIds(course.id) : [];
      const kiriman = typeof store.listSubmissionsByCourse === 'function' ? await store.listSubmissionsByCourse(course.id) : [];
      courses.push({
        id: course.id,
        title: course.title,
        materials: course.materials.filter((material) => !material.archivedAt).length,
        students: santri.length,
        pending: kiriman.filter((item) => item.status === 'submitted').length
      });
    }
    return {
      ok: true,
      value: {
        courses,
        totals: {
          courses: courses.length,
          students: courses.reduce((sum, item) => sum + item.students, 0),
          pending: courses.reduce((sum, item) => sum + item.pending, 0)
        }
      }
    };
  }

  // Pilihan santri untuk enrollment. Guru tidak punya students.read, jadi yang dikirim
  // hanya santri aktif dengan id, nama, dan program, tanpa data pribadi lain.
  async function studentOptions(actor) {
    if (!isStaff(actor)) return { ok: false, error: 'Akses guru atau admin diperlukan.' };
    const semua = await listStudents();
    return {
      ok: true,
      value: semua
        .filter((student) => student.status === 'active')
        .map((student) => ({ id: student.id, name: student.name, program: student.program || '' }))
    };
  }

  // Rekap progres per maddah: semua santri terdaftar beserta persentase materi selesai,
  // nilai kuis terbaik, dan status tugas. Hanya guru pengampu dan admin.
  async function courseProgress(courseId, actor) {
    if (!isStaff(actor)) return { ok: false, error: 'Akses guru atau admin diperlukan.' };
    const course = await store.getCourse(courseId);
    if (!course || !canManageCourse(course, actor)) return { ok: false, error: 'Maddah tidak ditemukan.' };
    const ids = typeof store.listEnrolledStudentIds === 'function' ? await store.listEnrolledStudentIds(courseId) : [];
    const items = [];
    for (const studentId of ids) {
      const hasil = await buildStudentCourse(studentId, courseId);
      if (!hasil.ok) continue;
      const materi = hasil.value.materials;
      const nilaiKuis = materi.flatMap((material) => (material.attempts || []).map((attempt) => attempt.score));
      const tugas = materi.filter((material) => material.type === 'assignment');
      items.push({
        studentId,
        studentName: (await studentNameOf(studentId)) || studentId,
        progress: hasil.value.progress,
        completed: materi.filter((material) => material.completed).length,
        total: materi.length,
        bestQuizScore: nilaiKuis.length ? Math.max(...nilaiKuis) : null,
        assignments: {
          total: tugas.length,
          pending: tugas.filter((material) => material.submission && material.submission.status === 'submitted').length,
          reviewed: tugas.filter((material) => material.submission && material.submission.status === 'reviewed').length
        }
      });
    }
    items.sort((left, right) => left.studentName.localeCompare(right.studentName, 'id-ID'));
    return { ok: true, value: { course: { id: course.id, title: course.title }, items } };
  }

  async function reviewSubmission(submissionId, input, actor) {
    if (!isStaff(actor)) return { ok: false, error: 'Akses guru atau admin diperlukan.' };
    const score = Number(input && input.score); const note = clean(input && input.note);
    if (!Number.isInteger(score) || score < 0 || score > 100 || note.length < 3) return { ok: false, error: 'Nilai dan catatan review belum valid.' };
    const saved = await store.reviewSubmission(submissionId, { status: 'reviewed', score, reviewerNote: note, reviewedAt: now(), reviewerAccountId: actor.id || null });
    if (saved && score >= ASSIGNMENT_PASSING_SCORE) await store.addCompletion({ id: crypto.randomUUID(), studentId: saved.studentId, courseId: saved.courseId, materialId: saved.materialId, completedAt: now() });
    return saved ? { ok: true, value: saved } : { ok: false, error: 'Submission tidak ditemukan.' };
  }

  async function studyHelp(studentId, courseId, materialId, question, actor) {
    if (!(await studyHelpEnabled())) {
      return { ok: false, error: 'Asisten belajar sedang dinonaktifkan admin. Tanyakan bagian yang belum jelas langsung ke pengajar.' };
    }
    const courseResult = await getStudentCourse(studentId, courseId, actor);
    if (!courseResult.ok) {
      return courseResult;
    }
    const course = await store.getCourse(courseId);
    const material = course.materials.find(function matchingMaterial(entry) { return entry.id === materialId; });
    if (!material) {
      return { ok: false, error: 'Materi tidak ditemukan.' };
    }
    // Jawaban lokal dari materi pengajar (study-retriever.js). Materi lain yang masih aktif di
    // maddah yang sama ikut dicari bila materi yang dibuka tidak membahasnya.
    const otherMaterials = course.materials.filter(function activeMaterial(entry) { return entry.id !== material.id && !entry.archivedAt; });
    const local = findAnswer({ question: clean(question), material, otherMaterials });
    const fallbackAnswer = local.answer;
    if (aiService && typeof aiService.answer === 'function') {
      const aiResult = await aiService.answer({
        actor,
        question: clean(question),
        fallbackAnswer,
        fallbackSource: local.source,
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
        source: local.source
      }
    };
  }

  return Object.freeze({ progressSummary,
    addMaterial,
    updateCourse,
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
    listSubmissions,
    reviewSubmission,
    teacherSummary,
    studentOptions,
    courseProgress
    ,submitQuiz
  });
}

module.exports = { MATERIAL_TYPES, createLmsService, createMemoryLmsStore };
