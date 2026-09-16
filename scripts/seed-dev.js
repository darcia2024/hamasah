// Data contoh untuk pengembangan lokal. Tidak pernah dijalankan di staging atau production.
// Semua nama, nomor, dan catatan di sini fiktif.
const fs = require('node:fs');
const path = require('node:path');
const identity = require('../server/identity-service.js');
const { createPostgresAccountStore } = require('../server/postgres-account-store.js');
const { createPostgresArticleStore } = require('../server/postgres-article-store.js');
const { createPostgresStudentStore } = require('../server/postgres-student-store.js');
const { createPostgresLmsStore } = require('../server/postgres-lms-store.js');
const { createStudentPortalService } = require('../server/student-portal-service.js');
const { createLmsService } = require('../server/lms-service.js');
const { createPostgresDormitoryStore } = require('../server/postgres-dormitory-store.js');
const { createDormitoryService } = require('../server/dormitory-service.js');

const DEV_PASSWORD = 'kata-sandi-dev-hamasah';

const DEV_ACCOUNTS = Object.freeze([
  { name: 'Admin Dev', email: 'admin@hamasah.test', role: identity.ROLES.ADMIN },
  { name: 'Petugas Pendaftaran Dev', email: 'petugas@hamasah.test', role: identity.ROLES.REGISTRATION_OFFICER },
  { name: 'Musyrif Dev', email: 'musyrif@hamasah.test', role: identity.ROLES.SUPERVISOR },
  { name: 'Guru Dev', email: 'guru@hamasah.test', role: identity.ROLES.TEACHER },
  { name: 'Keuangan Dev', email: 'keuangan@hamasah.test', role: identity.ROLES.FINANCE },
  { name: 'Wali Dev', email: 'wali@hamasah.test', role: identity.ROLES.PARENT },
  { name: 'Santri Dev', email: 'santri@hamasah.test', role: identity.ROLES.STUDENT }
]);

// Nama asrama di sini fiktif dan hanya untuk pengembangan. Di staging dan
// production, daftar asrama diisi admin lewat halaman monitoring.
const DEV_DORMITORIES = Object.freeze([
  { name: 'Asrama Contoh Putra', area: 'Hay Asyir', gender: 'putra' },
  { name: 'Asrama Contoh Putri', area: 'Hay Sabi', gender: 'putri' }
]);

const DEV_STUDENTS = Object.freeze([
  { name: 'Santri Contoh Pertama', program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20', pakaiAkunSantri: true, gender: 'putra' },
  { name: 'Santri Contoh Kedua', program: 'Mahad Al-Azhar', city: 'Kairo', joinDate: '2026-08-21', pakaiAkunSantri: false, gender: 'putri' }
]);

const DEV_COURSE = Object.freeze({
  title: 'Nahwu Dasar',
  description: 'Pengantar susunan kalimat bahasa Arab untuk santri baru.',
  materials: Object.freeze([
    {
      type: 'video', title: 'Jumlah Ismiyyah', content: 'Video pembahasan mubtada dan khabar.',
      summary: 'Jumlah ismiyyah tersusun dari mubtada dan khabar.',
      keyPoints: ['Mubtada adalah pokok kalimat.', 'Khabar menyempurnakan makna mubtada.'],
      studyGuide: [{ question: 'Apa fungsi khabar?', answer: 'Khabar menyempurnakan makna mubtada.' }]
    },
    {
      type: 'text', title: 'Jumlah Filiyyah', content: 'Ringkasan tertulis tentang fiil, fail, dan maful.',
      summary: 'Jumlah filiyyah dimulai dengan fiil lalu diikuti fail.',
      keyPoints: ['Fiil menempati posisi pertama.', 'Fail adalah pelaku pekerjaan.'],
      studyGuide: [{ question: 'Apa itu fail?', answer: 'Fail adalah pelaku pekerjaan dalam jumlah filiyyah.' }]
    }
  ])
});

function readSeedArticles() {
  const filePath = path.join(__dirname, '..', 'data', 'articles.json');
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function assertOk(result, pesan) {
  if (!result.ok) {
    throw new Error(`${pesan}: ${result.error}`);
  }
  return result.value;
}

// Idempoten: dijalankan berulang kali tidak membuat data ganda.
async function seedDevelopmentData({ database, logger = console }) {
  const accountStore = createPostgresAccountStore({ database });
  const identityService = identity.createIdentityService({ accountStore });
  const createdAccounts = [];

  for (const account of DEV_ACCOUNTS) {
    if (await accountStore.getByEmail(account.email)) continue;
    const created = await identityService.createAccount({ ...account, password: DEV_PASSWORD });
    if (!created.ok) {
      throw new Error(`Gagal membuat akun ${account.email}: ${created.error}`);
    }
    createdAccounts.push(account.email);
  }

  const articleStore = createPostgresArticleStore({ database });
  const createdArticles = [];
  for (const article of readSeedArticles()) {
    if (await articleStore.get(article.slug)) continue;
    const created = await articleStore.create(article, article.publishedAt || new Date().toISOString());
    if (created.ok) createdArticles.push(created.value.slug);
  }

  // Asrama dibuat lebih dulu, karena santri contoh langsung ditempatkan.
  const dormitoryStore = createPostgresDormitoryStore({ database });
  const dormitoryService = createDormitoryService({
    store: dormitoryStore,
    getAccount: (accountId) => accountStore.getById(accountId)
  });
  const musyrif = await accountStore.getByEmail('musyrif@hamasah.test');
  const adminAwal = await accountStore.getByEmail('admin@hamasah.test');
  const createdDormitories = [];
  const asramaTerpakai = new Set((await dormitoryStore.listDormitories()).map((asrama) => asrama.name));
  for (const contoh of DEV_DORMITORIES) {
    if (asramaTerpakai.has(contoh.name)) continue;
    const dibuat = assertOk(
      await dormitoryService.create(contoh, { id: adminAwal.id, role: adminAwal.role }),
      `Gagal membuat asrama ${contoh.name}`
    );
    createdDormitories.push(dibuat.name);
  }
  const asramaPerJenis = new Map((await dormitoryStore.listDormitories()).map((asrama) => [asrama.gender, asrama.id]));
  // Musyrif dev ditugaskan ke asrama putra saja, supaya pembatasan per asrama
  // langsung terlihat saat mencoba aplikasi.
  await dormitoryStore.assignStaff(musyrif.id, asramaPerJenis.get('putra'));

  const studentStore = createPostgresStudentStore({ database });
  const studentService = createStudentPortalService({
    store: studentStore,
    supervisorDormitories: (accountId) => dormitoryService.dormitoriesForStaff(accountId),
    getDormitory: (dormitoryId) => dormitoryStore.getDormitory(dormitoryId)
  });
  const admin = await accountStore.getByEmail('admin@hamasah.test');
  const wali = await accountStore.getByEmail('wali@hamasah.test');
  const akunSantri = await accountStore.getByEmail('santri@hamasah.test');
  const adminActor = { id: admin.id, role: admin.role };

  // Nama santri dipakai sebagai penanda supaya seed kedua tidak membuat santri kembar.
  const namaTerpakai = new Set((await studentStore.listStudents()).map((student) => student.name));
  const createdStudents = [];
  for (const contoh of DEV_STUDENTS) {
    if (namaTerpakai.has(contoh.name)) continue;
    const student = assertOk(await studentService.createStudent({
      name: contoh.name,
      program: contoh.program,
      city: contoh.city,
      joinDate: contoh.joinDate,
      gender: contoh.gender,
      dormitoryId: asramaPerJenis.get(contoh.gender) || null,
      studentAccountId: contoh.pakaiAkunSantri ? akunSantri.id : null,
      parentAccountIds: [wali.id]
    }, adminActor), `Gagal membuat santri ${contoh.name}`);
    createdStudents.push(student.name);

    assertOk(await studentService.addAttendance(student.id, { status: 'present', category: 'Subuh berjamaah' }, adminActor), 'Gagal mencatat presensi');
    assertOk(await studentService.addAttendance(student.id, { status: 'late', category: 'Mudzakarah malam' }, adminActor), 'Gagal mencatat presensi');
    assertOk(await studentService.addActivity(student.id, {
      title: 'Talaqqi pagi', description: 'Membaca kitab bersama pembina.'
    }, adminActor), 'Gagal mencatat kegiatan');
    assertOk(await studentService.addEvaluation(student.id, {
      area: 'Akademik', note: 'Perkembangan bahasa Arab terlihat konsisten.'
    }, adminActor), 'Gagal mencatat evaluasi');
  }

  const lmsStore = createPostgresLmsStore({ database });
  const lmsService = createLmsService({ store: lmsStore, canAccessStudent: async () => false });
  const createdCourses = [];
  const maddahAda = (await lmsStore.listCourses()).some((course) => course.title === DEV_COURSE.title);
  if (!maddahAda) {
    const course = assertOk(await lmsService.createCourse({ title: DEV_COURSE.title, description: DEV_COURSE.description }, adminActor), 'Gagal membuat maddah');
    for (const material of DEV_COURSE.materials) {
      assertOk(await lmsService.addMaterial(course.id, material, adminActor), `Gagal menambah materi ${material.title}`);
    }
    createdCourses.push(course.title);
  }
  // Semua santri contoh didaftarkan ke maddah contoh (aman diulang).
  const maddah = (await lmsStore.listCourses()).find((course) => course.title === DEV_COURSE.title);
  for (const student of await studentStore.listStudents()) {
    assertOk(await lmsService.enroll(student.id, maddah.id, adminActor), 'Gagal mendaftarkan santri ke maddah');
  }

  if (createdAccounts.length || createdArticles.length || createdStudents.length || createdCourses.length || createdDormitories.length) {
    logger.log(`[dev] Data contoh ditambahkan: ${createdAccounts.length} akun, ${createdArticles.length} artikel, ${createdDormitories.length} asrama, ${createdStudents.length} santri, ${createdCourses.length} maddah.`);
  }
  return {
    accounts: createdAccounts,
    articles: createdArticles,
    dormitories: createdDormitories,
    students: createdStudents,
    courses: createdCourses,
    password: DEV_PASSWORD
  };
}

module.exports = { DEV_ACCOUNTS, DEV_COURSE, DEV_DORMITORIES, DEV_PASSWORD, DEV_STUDENTS, seedDevelopmentData };
