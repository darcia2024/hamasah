const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const registrationDomain = require('../website/registration-domain.js');
const registrationServiceModule = require('../website/registration-service.js');
const { createDatabase } = require('./db.js');
const { createRegistrationFileStore } = require('./registration-file-store.js');
const { createPostgresRegistrationStore } = require('./postgres-registration-store.js');
const { createArticleStore } = require('./article-store.js');
const { createPostgresArticleStore } = require('./postgres-article-store.js');
const { answerQuestion } = require('./faq-service.js');
const identity = require('./identity-service.js');
const { createAccountFileStore } = require('./account-file-store.js');
const { createPostgresAccountStore } = require('./postgres-account-store.js');
const { createPostgresSessionStore } = require('./postgres-session-store.js');
const { createStudentPortalService } = require('./student-portal-service.js');
const { createStudentFileStore } = require('./student-file-store.js');
const { createLmsService } = require('./lms-service.js');
const { createLmsFileStore } = require('./lms-file-store.js');
const { createOperationsService } = require('./operations-service.js');
const { createOperationsFileStore } = require('./operations-file-store.js');

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
});

const READINESS_TIMEOUT_MS = 2000;
const MAX_REQUEST_BODY_BYTES = 100000;
const ABSOLUTE_REQUEST_BODY_LIMIT_BYTES = 5000000;

function createAccessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function csvCell(value) {
  return `"${String(value === undefined || value === null ? '' : value).replaceAll('"', '""')}"`;
}

function sendStudentReport(response, dashboard) {
  const rows = [
    ['Santri', dashboard.student.name],
    ['Program', dashboard.student.program],
    ['Kota', dashboard.student.city],
    ['Kehadiran', dashboard.attendance.rate === null ? '' : `${dashboard.attendance.rate}%`],
    [],
    ['Jenis', 'Tanggal', 'Judul atau catatan']
  ];
  dashboard.activities.forEach(function activity(entry) { rows.push(['Kegiatan', entry.occurredAt, entry.title]); });
  dashboard.achievements.forEach(function achievement(entry) { rows.push(['Achievement', entry.occurredAt, entry.title]); });
  dashboard.evaluations.forEach(function evaluation(entry) { rows.push(['Evaluasi', entry.occurredAt, entry.note]); });
  dashboard.discipline.forEach(function discipline(entry) { rows.push(['Disiplin', entry.occurredAt, entry.note]); });
  const content = `\uFEFF${rows.map(function line(row) { return row.map(csvCell).join(','); }).join('\r\n')}`;
  response.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="ringkasan-${dashboard.student.id}.csv"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(content);
}

function getBearerToken(request) {
  const header = String(request.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

// Error dengan status HTTP-nya sendiri, supaya status tidak perlu ditebak dari isi pesan.
class RequestBodyError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
  }
}

function readJsonBody(request) {
  return new Promise(function resolveBody(resolve, reject) {
    let body = '';
    let received = 0;
    let tooLarge = false;

    request.on('data', function receiveChunk(chunk) {
      received += chunk.length;
      if (!tooLarge && received > MAX_REQUEST_BODY_BYTES) {
        // Isi dibuang, tetapi pembacaan diteruskan sampai selesai supaya pengirim
        // menerima balasan 413. Kiriman yang sangat besar tetap diputus.
        tooLarge = true;
        body = '';
      }
      if (tooLarge) {
        if (received > ABSOLUTE_REQUEST_BODY_LIMIT_BYTES) {
          request.destroy();
          reject(new RequestBodyError('Ukuran permintaan terlalu besar.', 413));
        }
        return;
      }
      body += chunk;
    });

    request.on('end', function parseBody() {
      if (tooLarge) {
        reject(new RequestBodyError('Ukuran permintaan terlalu besar.', 413));
        return;
      }
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new RequestBodyError('Isi permintaan harus berupa JSON yang valid.', 400));
      }
    });

    request.on('error', reject);
  });
}

function publicError(result) {
  return {
    error: result.error || 'Permintaan tidak dapat diproses.',
    errors: result.errors || undefined
  };
}

function createHamasahApp(options) {
  const config = options || {};
  const rootDirectory = config.rootDirectory || path.resolve(__dirname, '..');
  const dataDirectory = config.dataDirectory || path.join(rootDirectory, 'data');
  const databaseUrl = config.databaseUrl || '';
  const bootstrapKey = config.bootstrapKey || process.env.HAMASAH_BOOTSTRAP_KEY || '';
  // Satu database (satu pool koneksi) dibagikan ke semua store PostgreSQL.
  const database = config.database || (databaseUrl ? createDatabase({ connectionString: databaseUrl }) : null);
  const ownsDatabase = Boolean(database) && !config.database;
  const registrationStore = config.registrationStore || (database
    ? createPostgresRegistrationStore({ database })
    : createRegistrationFileStore(path.join(dataDirectory, 'registrations.json')));
  const registrationService = config.registrationService || registrationServiceModule.createRegistrationService({
    store: registrationStore
  });
  const articleStore = config.articleStore || (database
    ? createPostgresArticleStore({ database })
    : createArticleStore(path.join(dataDirectory, 'articles.json')));
  const accountStore = config.accountStore || (database
    ? createPostgresAccountStore({ database })
    : createAccountFileStore(path.join(dataDirectory, 'accounts.json')));
  const sessionStore = config.sessionStore || (database ? createPostgresSessionStore({ database }) : undefined);
  const identityService = config.identityService || identity.createIdentityService({ accountStore, sessionStore });
  const studentStore = config.studentStore || createStudentFileStore(path.join(dataDirectory, 'students.json'));
  const studentPortalService = config.studentPortalService || createStudentPortalService({ store: studentStore });
  const lmsStore = config.lmsStore || createLmsFileStore(path.join(dataDirectory, 'lms.json'));
  const lmsService = config.lmsService || createLmsService({
    store: lmsStore,
    async canAccessStudent(studentId, actor) {
      if (!actor || actor.role !== identity.ROLES.STUDENT) {
        return false;
      }
      // Wajib di-await. Tanpa await, Promise selalu bernilai benar dan santri bisa membuka maddah santri lain.
      return (await studentPortalService.dashboard(studentId, actor)).ok;
    }
  });
  const operationsStore = config.operationsStore || createOperationsFileStore(path.join(dataDirectory, 'operations.json'));
  const operationsService = config.operationsService || createOperationsService({
    store: operationsStore,
    async studentExists(studentId) { return Boolean(await studentStore.getStudent(studentId)); }
  });

  // Mengembalikan akun petugas yang sedang login, atau null. Dipakai agar riwayat
  // perubahan bisa mencatat akun pelaku, bukan hanya perannya.
  async function staffActor(request) {
    const session = await identityService.authenticate(getBearerToken(request));
    if (!session.ok || ![identity.ROLES.ADMIN, identity.ROLES.REGISTRATION_OFFICER].includes(session.value.role)) {
      return null;
    }
    return session.value;
  }

  function registrationRoleOf(actor) {
    return actor.role === identity.ROLES.ADMIN
      ? registrationDomain.ROLES.ADMIN
      : registrationDomain.ROLES.REGISTRATION_OFFICER;
  }

  async function staffAuthorized(request) {
    return Boolean(await staffActor(request));
  }

  async function checkDatabaseReady() {
    if (!database) {
      return { ok: true, database: 'tidak dipakai' };
    }
    let timer;
    try {
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), READINESS_TIMEOUT_MS);
      });
      await Promise.race([database.query('SELECT 1'), timeout]);
      return { ok: true, database: 'siap' };
    } catch (error) {
      console.error(`[database] Pemeriksaan kesiapan gagal: ${error.message}`);
      return { ok: false, database: 'tidak siap' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function adminAuthorized(request) {
    const session = await identityService.authenticate(getBearerToken(request));
    return session.ok && session.value.role === identity.ROLES.ADMIN;
  }

  async function sessionActor(request) {
    const session = await identityService.authenticate(getBearerToken(request));
    return session.ok ? session.value : null;
  }

  async function candidateAuthorized(request, registrationId) {
    const record = await registrationService.store.get(registrationId);
    if (!record || !record.accessTokenHash) {
      return false;
    }
    return safeEqual(hashToken(getBearerToken(request)), record.accessTokenHash);
  }

  async function handleApi(request, response, url) {
    const pathname = url.pathname;

    // Liveness: hanya memastikan proses masih melayani permintaan. Tidak menyentuh database,
    // supaya gangguan database tidak membuat platform terus menghidupkan ulang container.
    if (request.method === 'GET' && pathname === '/api/health') {
      json(response, 200, { ok: true, service: 'hamasah-api' });
      return true;
    }

    // Readiness: memastikan database dapat dihubungi. Detail error tidak ditampilkan.
    if (request.method === 'GET' && pathname === '/api/ready') {
      const ready = await checkDatabaseReady();
      json(response, ready.ok ? 200 : 503, ready);
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/auth/bootstrap') {
      if (!bootstrapKey) {
        json(response, 503, { error: 'Bootstrap akun belum dikonfigurasi.' });
        return true;
      }
      if (!safeEqual(getBearerToken(request), bootstrapKey)) {
        json(response, 401, { error: 'Kunci bootstrap tidak tepat.' });
        return true;
      }
      if (await accountStore.count() > 0) {
        json(response, 409, { error: 'Akun awal sudah pernah dibuat.' });
        return true;
      }
      const body = await readJsonBody(request);
      const created = await identityService.createAccount({ ...body, role: identity.ROLES.ADMIN });
      json(response, created.ok ? 201 : 422, created.ok ? { account: created.value } : publicError(created));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody(request);
      const loggedIn = await identityService.login(body.email, body.password);
      json(response, loggedIn.ok ? 200 : 401, loggedIn.ok
        ? { accessToken: loggedIn.value.accessToken, account: loggedIn.value.account }
        : publicError(loggedIn));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/auth/logout') {
      await identityService.logout(getBearerToken(request));
      response.writeHead(204).end();
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/me') {
      const session = await identityService.authenticate(getBearerToken(request));
      json(response, session.ok ? 200 : 401, session.ok ? { account: session.value } : publicError(session));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/auth/password-reset-request') {
      const body = await readJsonBody(request);
      await identityService.issuePasswordReset(body.email);
      json(response, 202, { message: 'Jika akun tersedia, instruksi reset akan dikirim melalui kanal resmi.' });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/auth/password-reset') {
      const body = await readJsonBody(request);
      const reset = await identityService.resetPassword(body.email, body.token, body.password);
      json(response, reset.ok ? 204 : 422, reset.ok ? {} : publicError(reset));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/accounts') {
      if (!(await adminAuthorized(request))) {
        json(response, 401, { error: 'Akses admin diperlukan.' });
        return true;
      }
      const created = await identityService.createAccount(await readJsonBody(request));
      json(response, created.ok ? 201 : 422, created.ok ? { account: created.value } : publicError(created));
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/accounts') {
      if (!(await adminAuthorized(request))) {
        json(response, 401, { error: 'Akses admin diperlukan.' });
        return true;
      }
      json(response, 200, { items: await identityService.listAccounts() });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/my-students') {
      const actor = await sessionActor(request);
      if (!actor) {
        json(response, 401, { error: 'Sesi login diperlukan.' });
        return true;
      }
      json(response, 200, { items: await studentPortalService.listForActor(actor) });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/operations') {
      if (!(await adminAuthorized(request))) { json(response, 401, { error: 'Akses admin diperlukan.' }); return true; }
      json(response, 200, await operationsService.list());
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/operations/invoices') {
      const created = await operationsService.createInvoice(await readJsonBody(request), await sessionActor(request));
      json(response, created.ok ? 201 : 422, created.ok ? { invoice: created.value } : publicError(created));
      return true;
    }

    const paymentMatch = pathname.match(/^\/api\/operations\/invoices\/([\w-]+)\/paid$/);
    if (request.method === 'PATCH' && paymentMatch) {
      const paid = await operationsService.markInvoicePaid(paymentMatch[1], await sessionActor(request));
      json(response, paid.ok ? 200 : 422, paid.ok ? { invoice: paid.value } : publicError(paid));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/operations/visas') {
      const saved = await operationsService.saveVisa(await readJsonBody(request), await sessionActor(request));
      json(response, saved.ok ? 201 : 422, saved.ok ? { visa: saved.value } : publicError(saved));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/operations/inventory') {
      const saved = await operationsService.saveInventory(await readJsonBody(request), await sessionActor(request));
      json(response, saved.ok ? 201 : 422, saved.ok ? { item: saved.value } : publicError(saved));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/students') {
      const actor = await sessionActor(request);
      const created = await studentPortalService.createStudent(await readJsonBody(request), actor);
      json(response, created.ok ? 201 : 422, created.ok ? { student: created.value } : publicError(created));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/courses') {
      const created = await lmsService.createCourse(await readJsonBody(request), await sessionActor(request));
      json(response, created.ok ? 201 : 422, created.ok ? { course: created.value } : publicError(created));
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/courses') {
      const courses = await lmsService.listCourses(await sessionActor(request));
      json(response, courses.ok ? 200 : 403, courses.ok ? { items: courses.value } : publicError(courses));
      return true;
    }

    const materialMatch = pathname.match(/^\/api\/courses\/([\w-]+)\/materials$/);
    if (request.method === 'POST' && materialMatch) {
      const created = await lmsService.addMaterial(materialMatch[1], await readJsonBody(request), await sessionActor(request));
      json(response, created.ok ? 201 : 422, created.ok ? { material: created.value } : publicError(created));
      return true;
    }

    const enrollmentMatch = pathname.match(/^\/api\/students\/([\w-]+)\/courses\/([\w-]+)$/);
    if (request.method === 'POST' && enrollmentMatch) {
      const enrolled = await lmsService.enroll(enrollmentMatch[1], enrollmentMatch[2], await sessionActor(request));
      if (enrolled.ok) {
        response.writeHead(204).end();
      } else {
        json(response, 422, publicError(enrolled));
      }
      return true;
    }

    const courseListMatch = pathname.match(/^\/api\/students\/([\w-]+)\/courses$/);
    if (request.method === 'GET' && courseListMatch) {
      const courses = await lmsService.listStudentCourses(courseListMatch[1], await sessionActor(request));
      json(response, courses.ok ? 200 : 403, courses.ok ? { items: courses.value } : publicError(courses));
      return true;
    }
    if (request.method === 'GET' && enrollmentMatch) {
      const course = await lmsService.getStudentCourse(enrollmentMatch[1], enrollmentMatch[2], await sessionActor(request));
      json(response, course.ok ? 200 : 403, course.ok ? { course: course.value } : publicError(course));
      return true;
    }

    const completionMatch = pathname.match(/^\/api\/students\/([\w-]+)\/courses\/([\w-]+)\/materials\/([\w-]+)\/complete$/);
    if (request.method === 'POST' && completionMatch) {
      const completed = await lmsService.completeMaterial(completionMatch[1], completionMatch[2], completionMatch[3], await sessionActor(request));
      json(response, completed.ok ? 200 : 422, completed.ok ? { course: completed.value } : publicError(completed));
      return true;
    }

    const studyHelpMatch = pathname.match(/^\/api\/students\/([\w-]+)\/courses\/([\w-]+)\/materials\/([\w-]+)\/study-help$/);
    if (request.method === 'POST' && studyHelpMatch) {
      const body = await readJsonBody(request);
      const help = await lmsService.studyHelp(studyHelpMatch[1], studyHelpMatch[2], studyHelpMatch[3], body.question, await sessionActor(request));
      json(response, help.ok ? 200 : 422, help.ok ? { help: help.value } : publicError(help));
      return true;
    }

    const studentLinkMatch = pathname.match(/^\/api\/students\/([\w-]+)\/accounts$/);
    if (request.method === 'PATCH' && studentLinkMatch) {
      const actor = await sessionActor(request);
      const body = await readJsonBody(request);
      if (body.studentAccountId) {
        const studentAccount = await accountStore.getById(body.studentAccountId);
        if (!studentAccount || studentAccount.role !== identity.ROLES.STUDENT) {
          json(response, 422, { error: 'Akun santri tidak valid.' });
          return true;
        }
      }
      if (Array.isArray(body.parentAccountIds)) {
        const parentAccounts = await Promise.all(body.parentAccountIds.map((accountId) => accountStore.getById(accountId)));
        const parentsValid = parentAccounts.every((account) => account && account.role === identity.ROLES.PARENT);
        if (!parentsValid) {
          json(response, 422, { error: 'Relasi akun wali tidak valid.' });
          return true;
        }
      }
      const linked = await studentPortalService.linkAccounts(studentLinkMatch[1], body, actor);
      json(response, linked.ok ? 200 : 422, linked.ok ? { student: linked.value } : publicError(linked));
      return true;
    }

    const studentDashboardMatch = pathname.match(/^\/api\/students\/([\w-]+)\/dashboard$/);
    if (request.method === 'GET' && studentDashboardMatch) {
      const dashboard = await studentPortalService.dashboard(studentDashboardMatch[1], await sessionActor(request));
      json(response, dashboard.ok ? 200 : 403, dashboard.ok ? { dashboard: dashboard.value } : publicError(dashboard));
      return true;
    }

    const studentReportMatch = pathname.match(/^\/api\/students\/([\w-]+)\/report$/);
    if (request.method === 'GET' && studentReportMatch) {
      const report = await studentPortalService.dashboard(studentReportMatch[1], await sessionActor(request));
      if (!report.ok) {
        json(response, 403, publicError(report));
      } else {
        sendStudentReport(response, report.value);
      }
      return true;
    }

    const studentRecordMatch = pathname.match(/^\/api\/students\/([\w-]+)\/(activities|achievements|attendance|evaluations|violations)$/);
    if (request.method === 'POST' && studentRecordMatch) {
      const methods = {
        activities: 'addActivity',
        achievements: 'addAchievement',
        attendance: 'addAttendance',
        evaluations: 'addEvaluation',
        violations: 'addViolation'
      };
      const result = await studentPortalService[methods[studentRecordMatch[2]]](studentRecordMatch[1], await readJsonBody(request), await sessionActor(request));
      json(response, result.ok ? 201 : 422, result.ok ? { item: result.value } : publicError(result));
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/articles') {
      json(response, 200, { items: await articleStore.list() });
      return true;
    }

    const articleMatch = pathname.match(/^\/api\/articles\/([a-z0-9-]+)$/);
    if (request.method === 'GET' && articleMatch) {
      const article = await articleStore.get(articleMatch[1]);
      if (!article) {
        json(response, 404, { error: 'Artikel tidak ditemukan.' });
        return true;
      }
      json(response, 200, { item: article });
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/articles') {
      if (!(await staffAuthorized(request))) {
        json(response, 401, { error: 'Akses petugas diperlukan.' });
        return true;
      }
      const created = await articleStore.create(await readJsonBody(request), new Date().toISOString());
      json(response, created.ok ? 201 : 422, created.ok ? { item: created.value } : publicError(created));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/faq/ask') {
      const body = await readJsonBody(request);
      json(response, 200, answerQuestion(body.question));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/registrations') {
      const accessToken = createAccessToken();
      const created = await registrationService.create(await readJsonBody(request), {
        privateData: { accessTokenHash: hashToken(accessToken) }
      });
      json(response, created.ok ? 201 : 422, created.ok
        ? { registration: created.value, accessToken }
        : publicError(created));
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/registrations') {
      if (!(await staffAuthorized(request))) {
        json(response, 401, { error: 'Akses petugas diperlukan.' });
        return true;
      }
      json(response, 200, { items: await registrationService.listForStaff() });
      return true;
    }

    const registrationMatch = pathname.match(/^\/api\/registrations\/(HI-REG-\d{4}-\d{5})$/);
    if (request.method === 'GET' && registrationMatch) {
      const registrationId = registrationMatch[1];
      if (!(await candidateAuthorized(request, registrationId))) {
        json(response, 401, { error: 'Akses akun pendaftaran diperlukan.' });
        return true;
      }
      const registration = await registrationService.getPublic(registrationId);
      json(response, registration.ok ? 200 : 404, registration.ok ? { registration: registration.value } : publicError(registration));
      return true;
    }

    const documentMatch = pathname.match(/^\/api\/registrations\/(HI-REG-\d{4}-\d{5})\/documents$/);
    if (request.method === 'POST' && documentMatch) {
      const registrationId = documentMatch[1];
      const isCandidate = await candidateAuthorized(request, registrationId);
      const staff = isCandidate ? null : await staffActor(request);
      if (!isCandidate && !staff) {
        json(response, 401, { error: 'Akses akun pendaftaran atau petugas diperlukan.' });
        return true;
      }
      const result = await registrationService.addDocument(
        registrationId,
        await readJsonBody(request),
        staff
          ? { role: registrationRoleOf(staff), accountId: staff.id }
          : { role: registrationDomain.ROLES.APPLICANT }
      );
      json(response, result.ok ? 201 : 422, result.ok ? { registration: result.value } : publicError(result));
      return true;
    }

    const statusMatch = pathname.match(/^\/api\/registrations\/(HI-REG-\d{4}-\d{5})\/status$/);
    if (request.method === 'PATCH' && statusMatch) {
      const staff = await staffActor(request);
      if (!staff) {
        json(response, 401, { error: 'Akses petugas diperlukan.' });
        return true;
      }
      const body = await readJsonBody(request);
      // Peran diambil dari sesi. Nilai role pada isi request sengaja diabaikan.
      const result = await registrationService.changeStatus(statusMatch[1], body.status, {
        role: registrationRoleOf(staff),
        note: body.note,
        accountId: staff.id
      });
      json(response, result.ok ? 200 : 422, result.ok ? { registration: result.value } : publicError(result));
      return true;
    }

    return false;
  }

  async function requestListener(request, response) {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const handled = await handleApi(request, response, url);
        if (!handled) {
          json(response, 404, { error: 'Endpoint tidak ditemukan.' });
        }
        return;
      }

      const requestedPath = url.pathname === '/' ? '/website/' : url.pathname;
      const normalizedPath = path.posix.normalize(requestedPath).replace(/^\/+/, '');
      if (!normalizedPath.startsWith('website/') && !normalizedPath.startsWith('assets/')) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Halaman tidak ditemukan.');
        return;
      }
      const sourcePath = path.resolve(rootDirectory, normalizedPath);
      const rootPath = path.resolve(rootDirectory);
      if (!sourcePath.startsWith(rootPath)) {
        response.writeHead(403).end();
        return;
      }

      let filePath = sourcePath;
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Halaman tidak ditemukan.');
        return;
      }

      const extension = path.extname(filePath).toLocaleLowerCase('en-US');
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff'
      });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      if (error instanceof RequestBodyError) {
        json(response, error.status, { error: error.message });
        return;
      }
      console.error(`[server] Permintaan gagal diproses: ${error.message}`);
      json(response, 500, { error: 'Terjadi kendala pada layanan.' });
    }
  }

  return {
    createServer() {
      return http.createServer(requestListener);
    },
    // Menutup pool koneksi database yang dibuat app ini. Database dari luar (config.database) tidak ditutup.
    async close() {
      if (ownsDatabase) {
        await database.close();
      }
    },
    identityService,
    registrationService,
    studentPortalService,
    lmsService,
    operationsService
  };
}

module.exports = { MAX_REQUEST_BODY_BYTES, RequestBodyError, createHamasahApp, hashToken, safeEqual };
