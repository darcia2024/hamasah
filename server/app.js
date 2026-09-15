const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const registrationDomain = require('../website/registration-domain.js');
const registrationServiceModule = require('../website/registration-service.js');
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

function readJsonBody(request) {
  return new Promise(function resolveBody(resolve, reject) {
    let body = '';
    request.on('data', function receiveChunk(chunk) {
      body += chunk;
      if (body.length > 100000) {
        reject(new Error('Ukuran permintaan terlalu besar.'));
        request.destroy();
      }
    });
    request.on('end', function parseBody() {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Isi permintaan harus berupa JSON yang valid.'));
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
  const staffApiKey = config.staffApiKey || process.env.HAMASAH_STAFF_API_KEY || '';
  const bootstrapKey = config.bootstrapKey || process.env.HAMASAH_BOOTSTRAP_KEY || '';
  const registrationStore = config.registrationStore || (databaseUrl
    ? createPostgresRegistrationStore({ connectionString: databaseUrl })
    : createRegistrationFileStore(path.join(dataDirectory, 'registrations.json')));
  const registrationService = config.registrationService || registrationServiceModule.createRegistrationService({
    store: registrationStore
  });
  const articleStore = config.articleStore || (databaseUrl
    ? createPostgresArticleStore({ connectionString: databaseUrl })
    : createArticleStore(path.join(dataDirectory, 'articles.json')));
  const accountStore = config.accountStore || (databaseUrl ? createPostgresAccountStore({ connectionString: databaseUrl }) : createAccountFileStore(path.join(dataDirectory, 'accounts.json')));
  const sessionStore = config.sessionStore || (databaseUrl ? createPostgresSessionStore({ connectionString: databaseUrl }) : undefined);
  const identityService = config.identityService || identity.createIdentityService({ accountStore, sessionStore });
  const studentStore = config.studentStore || createStudentFileStore(path.join(dataDirectory, 'students.json'));
  const studentPortalService = config.studentPortalService || createStudentPortalService({ store: studentStore });
  const lmsStore = config.lmsStore || createLmsFileStore(path.join(dataDirectory, 'lms.json'));
  const lmsService = config.lmsService || createLmsService({
    store: lmsStore,
    canAccessStudent(studentId, actor) {
      return actor && actor.role === identity.ROLES.STUDENT && studentPortalService.dashboard(studentId, actor).ok;
    }
  });
  const operationsStore = config.operationsStore || createOperationsFileStore(path.join(dataDirectory, 'operations.json'));
  const operationsService = config.operationsService || createOperationsService({
    store: operationsStore,
    studentExists(studentId) { return Boolean(studentStore.getStudent(studentId)); }
  });

  async function staffAuthorized(request) {
    const token = getBearerToken(request);
    if (Boolean(staffApiKey) && safeEqual(token, staffApiKey)) {
      return true;
    }
    const session = await identityService.authenticate(token);
    return session.ok && [identity.ROLES.ADMIN, identity.ROLES.REGISTRATION_OFFICER].includes(session.value.role);
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

    if (request.method === 'GET' && pathname === '/api/health') {
      json(response, 200, { ok: true, service: 'hamasah-api' });
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
      json(response, 200, { items: studentPortalService.listForActor(actor) });
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/operations') {
      if (!(await adminAuthorized(request))) { json(response, 401, { error: 'Akses admin diperlukan.' }); return true; }
      json(response, 200, operationsService.list());
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/operations/invoices') {
      const created = operationsService.createInvoice(await readJsonBody(request), await sessionActor(request));
      json(response, created.ok ? 201 : 422, created.ok ? { invoice: created.value } : publicError(created));
      return true;
    }

    const paymentMatch = pathname.match(/^\/api\/operations\/invoices\/([\w-]+)\/paid$/);
    if (request.method === 'PATCH' && paymentMatch) {
      const paid = operationsService.markInvoicePaid(paymentMatch[1], await sessionActor(request));
      json(response, paid.ok ? 200 : 422, paid.ok ? { invoice: paid.value } : publicError(paid));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/operations/visas') {
      const saved = operationsService.saveVisa(await readJsonBody(request), await sessionActor(request));
      json(response, saved.ok ? 201 : 422, saved.ok ? { visa: saved.value } : publicError(saved));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/operations/inventory') {
      const saved = operationsService.saveInventory(await readJsonBody(request), await sessionActor(request));
      json(response, saved.ok ? 201 : 422, saved.ok ? { item: saved.value } : publicError(saved));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/students') {
      const actor = await sessionActor(request);
      const created = studentPortalService.createStudent(await readJsonBody(request), actor);
      json(response, created.ok ? 201 : 422, created.ok ? { student: created.value } : publicError(created));
      return true;
    }

    if (request.method === 'POST' && pathname === '/api/courses') {
      const created = lmsService.createCourse(await readJsonBody(request), await sessionActor(request));
      json(response, created.ok ? 201 : 422, created.ok ? { course: created.value } : publicError(created));
      return true;
    }

    if (request.method === 'GET' && pathname === '/api/courses') {
      const courses = lmsService.listCourses(await sessionActor(request));
      json(response, courses.ok ? 200 : 403, courses.ok ? { items: courses.value } : publicError(courses));
      return true;
    }

    const materialMatch = pathname.match(/^\/api\/courses\/([\w-]+)\/materials$/);
    if (request.method === 'POST' && materialMatch) {
      const created = lmsService.addMaterial(materialMatch[1], await readJsonBody(request), await sessionActor(request));
      json(response, created.ok ? 201 : 422, created.ok ? { material: created.value } : publicError(created));
      return true;
    }

    const enrollmentMatch = pathname.match(/^\/api\/students\/([\w-]+)\/courses\/([\w-]+)$/);
    if (request.method === 'POST' && enrollmentMatch) {
      const enrolled = lmsService.enroll(enrollmentMatch[1], enrollmentMatch[2], await sessionActor(request));
      if (enrolled.ok) {
        response.writeHead(204).end();
      } else {
        json(response, 422, publicError(enrolled));
      }
      return true;
    }

    const courseListMatch = pathname.match(/^\/api\/students\/([\w-]+)\/courses$/);
    if (request.method === 'GET' && courseListMatch) {
      const courses = lmsService.listStudentCourses(courseListMatch[1], await sessionActor(request));
      json(response, courses.ok ? 200 : 403, courses.ok ? { items: courses.value } : publicError(courses));
      return true;
    }
    if (request.method === 'GET' && enrollmentMatch) {
      const course = lmsService.getStudentCourse(enrollmentMatch[1], enrollmentMatch[2], await sessionActor(request));
      json(response, course.ok ? 200 : 403, course.ok ? { course: course.value } : publicError(course));
      return true;
    }

    const completionMatch = pathname.match(/^\/api\/students\/([\w-]+)\/courses\/([\w-]+)\/materials\/([\w-]+)\/complete$/);
    if (request.method === 'POST' && completionMatch) {
      const completed = lmsService.completeMaterial(completionMatch[1], completionMatch[2], completionMatch[3], await sessionActor(request));
      json(response, completed.ok ? 200 : 422, completed.ok ? { course: completed.value } : publicError(completed));
      return true;
    }

    const studyHelpMatch = pathname.match(/^\/api\/students\/([\w-]+)\/courses\/([\w-]+)\/materials\/([\w-]+)\/study-help$/);
    if (request.method === 'POST' && studyHelpMatch) {
      const body = await readJsonBody(request);
      const help = lmsService.studyHelp(studyHelpMatch[1], studyHelpMatch[2], studyHelpMatch[3], body.question, await sessionActor(request));
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
      const linked = studentPortalService.linkAccounts(studentLinkMatch[1], body, actor);
      json(response, linked.ok ? 200 : 422, linked.ok ? { student: linked.value } : publicError(linked));
      return true;
    }

    const studentDashboardMatch = pathname.match(/^\/api\/students\/([\w-]+)\/dashboard$/);
    if (request.method === 'GET' && studentDashboardMatch) {
      const dashboard = studentPortalService.dashboard(studentDashboardMatch[1], await sessionActor(request));
      json(response, dashboard.ok ? 200 : 403, dashboard.ok ? { dashboard: dashboard.value } : publicError(dashboard));
      return true;
    }

    const studentReportMatch = pathname.match(/^\/api\/students\/([\w-]+)\/report$/);
    if (request.method === 'GET' && studentReportMatch) {
      const report = studentPortalService.dashboard(studentReportMatch[1], await sessionActor(request));
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
      const result = studentPortalService[methods[studentRecordMatch[2]]](studentRecordMatch[1], await readJsonBody(request), await sessionActor(request));
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
      const isStaff = await staffAuthorized(request);
      if (!isCandidate && !isStaff) {
        json(response, 401, { error: 'Akses akun pendaftaran atau petugas diperlukan.' });
        return true;
      }
      const result = await registrationService.addDocument(
        registrationId,
        await readJsonBody(request),
        { role: isStaff ? registrationDomain.ROLES.REGISTRATION_OFFICER : registrationDomain.ROLES.APPLICANT }
      );
      json(response, result.ok ? 201 : 422, result.ok ? { registration: result.value } : publicError(result));
      return true;
    }

    const statusMatch = pathname.match(/^\/api\/registrations\/(HI-REG-\d{4}-\d{5})\/status$/);
    if (request.method === 'PATCH' && statusMatch) {
      if (!(await staffAuthorized(request))) {
        json(response, 401, { error: 'Akses petugas diperlukan.' });
        return true;
      }
      const body = await readJsonBody(request);
      const result = await registrationService.changeStatus(statusMatch[1], body.status, {
        role: body.role === registrationDomain.ROLES.ADMIN ? registrationDomain.ROLES.ADMIN : registrationDomain.ROLES.REGISTRATION_OFFICER,
        note: body.note
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
      const status = error.message.includes('JSON') || error.message.includes('Ukuran') ? 400 : 500;
      json(response, status, { error: status === 400 ? error.message : 'Terjadi kendala pada layanan.' });
    }
  }

  return {
    createServer() {
      return http.createServer(requestListener);
    },
    identityService,
    registrationService,
    studentPortalService,
    lmsService,
    operationsService
  };
}

module.exports = { createHamasahApp, hashToken, safeEqual };
