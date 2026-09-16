const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createPostgresLmsStore } = require('./postgres-lms-store.js');
const { createLmsService } = require('./lms-service.js');

const CREATED_AT = '2026-09-15T00:00:00.000Z';

async function insertStudent(database, name) {
  const id = crypto.randomUUID();
  await database.query(
    `INSERT INTO students (id, name, program, city, join_date, status) VALUES ($1, $2, 'Kuliah Al-Azhar', 'Kairo', '2026-08-20', 'active')`,
    [id, name]
  );
  return id;
}

function materialInput(title) {
  return {
    id: crypto.randomUUID(),
    type: 'video',
    title,
    content: `Video ${title}.`,
    summary: `Rangkuman ${title} yang cukup panjang.`,
    keyPoints: [`Poin utama ${title}.`],
    studyGuide: [{ question: `Apa inti ${title}?`, answer: `Inti ${title} ada pada rangkuman.` }],
    createdAt: CREATED_AT
  };
}

async function run() {
  const database = await createTestDatabase();
  try {
    const store = createPostgresLmsStore({ database });
    const studentId = await insertStudent(database, 'Abdullah Fikri');
    const studentLain = await insertStudent(database, 'Santri Lain');

    assert.deepEqual(await store.listCourses(), []);
    assert.equal(await store.getCourse(crypto.randomUUID()), null);

    const course = await store.createCourse({
      id: crypto.randomUUID(), title: 'Nahwu Dasar', description: 'Pengantar susunan kalimat bahasa Arab.',
      createdAt: CREATED_AT, updatedAt: CREATED_AT
    });
    assert.deepEqual(course.materials, []);

    // Urutan materi mengikuti position, bukan abjad atau kebetulan urutan baris.
    const pertama = await store.addMaterial(course.id, materialInput('Jumlah Ismiyyah'));
    const kedua = await store.addMaterial(course.id, materialInput('Jumlah Filiyyah'));
    const ketiga = await store.addMaterial(course.id, materialInput('Alamat Ir’ab'));
    assert.deepEqual(
      (await store.getCourse(course.id)).materials.map((material) => material.id),
      [pertama.id, kedua.id, ketiga.id],
      'Materi harus urut sesuai urutan pembuatan, walau judulnya tidak urut abjad.'
    );

    // key_points dan study_guide kembali sebagai array dan objek, bukan teks JSON.
    const dibaca = (await store.getCourse(course.id)).materials[0];
    assert.deepEqual(dibaca.keyPoints, ['Poin utama Jumlah Ismiyyah.']);
    assert.equal(dibaca.studyGuide[0].answer, 'Inti Jumlah Ismiyyah ada pada rangkuman.');
    assert.equal(dibaca.type, 'video');

    // Pendaftaran kelas ganda tidak menghasilkan baris kedua.
    await store.addEnrollment(studentId, course.id, CREATED_AT);
    await store.addEnrollment(studentId, course.id, CREATED_AT);
    assert.deepEqual(await store.getEnrollments(studentId), [course.id]);
    assert.deepEqual(await store.getEnrollments(studentLain), []);

    // Penyelesaian materi ganda juga hanya satu baris.
    const completion = { id: crypto.randomUUID(), studentId, courseId: course.id, materialId: pertama.id, completedAt: CREATED_AT };
    await store.addCompletion(completion);
    await store.addCompletion({ ...completion, id: crypto.randomUUID() });
    const completions = await store.listCompletions(studentId);
    assert.equal(completions.length, 1);
    assert.equal(completions[0].materialId, pertama.id);
    assert.deepEqual(await store.listCompletions(studentLain), []);

    const kursusKedua = await store.createCourse({
      id: crypto.randomUUID(), title: 'Balaghah', description: 'Pengantar ilmu balaghah.',
      createdAt: CREATED_AT, updatedAt: CREATED_AT
    });
    assert.deepEqual((await store.listCourses()).map((item) => item.title), ['Balaghah', 'Nahwu Dasar']);
    assert.equal((await store.listCourses())[1].materials.length, 3, 'listCourses ikut membawa materi tiap maddah.');
    assert.equal((await store.getCourse(kursusKedua.id)).materials.length, 0);

    // Service memakai store ini apa adanya.
    const service = createLmsService({
      store,
      now: () => '2026-09-16T08:00:00.000Z',
      canAccessStudent: async (id, actor) => id === studentId && actor.id === 'akun-santri'
    });
    const santri = { id: 'akun-santri', role: 'student' };
    const dilihat = await service.getStudentCourse(studentId, course.id, santri);
    assert.equal(dilihat.ok, true);
    assert.equal(dilihat.value.materials.length, 3);
    assert.equal(dilihat.value.progress, 33, 'Satu dari tiga materi selesai.');
    assert.equal(dilihat.value.materials[0].completed, true);
    assert.equal(dilihat.value.materials[1].completed, false);

    const selesai = await service.completeMaterial(studentId, course.id, kedua.id, santri);
    assert.equal(selesai.value.progress, 67);
    // Menyelesaikan materi yang sama dua kali tidak menaikkan progress dua kali.
    assert.equal((await service.completeMaterial(studentId, course.id, kedua.id, santri)).value.progress, 67);
    assert.equal((await store.listCompletions(studentId)).length, 2);

    // Santri lain tetap ditolak walau maddahnya ada.
    assert.equal((await service.getStudentCourse(studentLain, course.id, santri)).ok, false);

    console.log('postgres lms store tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
