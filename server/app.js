// Perakitan aplikasi: menyiapkan store dan service, lalu mencocokkan permintaan
// dengan daftar route. Logika tiap endpoint ada di server/routes/.

const http = require('node:http');
const path = require('node:path');
const registrationServiceModule = require('../website/registration-service.js');
const { createDatabase } = require('./db.js');
const { createPostgresRegistrationStore } = require('./postgres-registration-store.js');
const { createPostgresArticleStore } = require('./postgres-article-store.js');
const identity = require('./identity-service.js');
const { createPostgresAccountStore } = require('./postgres-account-store.js');
const { createPostgresSessionStore } = require('./postgres-session-store.js');
const { createStudentPortalService } = require('./student-portal-service.js');
const { createPostgresStudentStore } = require('./postgres-student-store.js');
const { createLmsService } = require('./lms-service.js');
const { createPostgresLmsStore } = require('./postgres-lms-store.js');
const { createOperationsService } = require('./operations-service.js');
const { createPostgresOperationsStore } = require('./postgres-operations-store.js');
const { json, tooManyRequests } = require('./http/respond.js');
const { MAX_REQUEST_BODY_BYTES, RequestBodyError, readJsonBody } = require('./http/body.js');
const { serveStaticFile } = require('./http/static.js');
const { createRequestAuth, hashToken, safeEqual } = require('./http/auth.js');
const { NOT_ALLOWED, NOT_SIGNED_IN, roleHasPermission } = require('./access-policy.js');
const { TOO_MANY_REQUESTS, createRateLimiter } = require('./rate-limit.js');
const { clientIp } = require('./http/client-ip.js');
const { applyHeaders, createSecurityHeaders } = require('./http/security-headers.js');
const { readAppEnvironment } = require('./environment.js');

// Urutan berpengaruh: route pertama yang cocok yang dipakai.
const ROUTES = Object.freeze([
  ...require('./routes/health.js'),
  ...require('./routes/auth.js'),
  ...require('./routes/accounts.js'),
  ...require('./routes/operations.js'),
  ...require('./routes/students.js'),
  ...require('./routes/lms.js'),
  ...require('./routes/articles.js'),
  ...require('./routes/faq.js'),
  ...require('./routes/registrations.js')
]);

const READINESS_TIMEOUT_MS = 2000;

function createHamasahApp(options) {
  const config = options || {};
  const rootDirectory = config.rootDirectory || path.resolve(__dirname, '..');
  const databaseUrl = config.databaseUrl || '';
  const bootstrapKey = config.bootstrapKey || process.env.HAMASAH_BOOTSTRAP_KEY || '';
  // Satu database (satu pool koneksi) dibagikan ke semua store. Tidak ada lagi
  // penyimpanan berkas JSON: seluruh data aplikasi berada di PostgreSQL, sehingga
  // tidak mungkin ada dua sumber kebenaran yang berbeda isinya.
  const database = config.database || (databaseUrl ? createDatabase({ connectionString: databaseUrl }) : null);
  if (!database) {
    throw new Error('createHamasahApp membutuhkan database atau databaseUrl.');
  }
  const ownsDatabase = !config.database;
  const appEnvironment = config.appEnvironment || readAppEnvironment(process.env);
  // X-Forwarded-For hanya dipercaya kalau aplikasi memang di belakang proxy platform.
  const trustProxy = config.trustProxy === undefined ? process.env.TRUST_PROXY === 'true' : Boolean(config.trustProxy);
  const rateLimiter = config.rateLimiter || createRateLimiter();
  const securityHeaders = createSecurityHeaders({ appEnvironment });
  const registrationStore = config.registrationStore || createPostgresRegistrationStore({ database });
  const registrationService = config.registrationService || registrationServiceModule.createRegistrationService({
    store: registrationStore
  });
  const articleStore = config.articleStore || createPostgresArticleStore({ database });
  const accountStore = config.accountStore || createPostgresAccountStore({ database });
  const sessionStore = config.sessionStore || createPostgresSessionStore({ database });
  const identityService = config.identityService || identity.createIdentityService({ accountStore, sessionStore });
  const studentStore = config.studentStore || createPostgresStudentStore({ database });
  const studentPortalService = config.studentPortalService || createStudentPortalService({ store: studentStore });
  const lmsStore = config.lmsStore || createPostgresLmsStore({ database });
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
  const operationsStore = config.operationsStore || createPostgresOperationsStore({ database });
  const operationsService = config.operationsService || createOperationsService({
    store: operationsStore,
    async studentExists(studentId) { return Boolean(await studentStore.getStudent(studentId)); }
  });

  async function checkDatabaseReady() {
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

  const services = Object.freeze({
    accountStore,
    articleStore,
    checkDatabaseReady,
    identityService,
    lmsService,
    operationsService,
    registrationService,
    studentPortalService
  });

  async function handleApi(request, response, url) {
    const ip = clientIp(request, { trustProxy });

    // Jaring pengaman untuk seluruh API, termasuk permintaan ke endpoint yang tidak
    // ada, supaya penyisiran endpoint ikut terbatasi.
    const umum = rateLimiter.check('api-default', ip);
    if (!umum.allowed) {
      tooManyRequests(response, umum.retryAfterSeconds, TOO_MANY_REQUESTS);
      return true;
    }

    for (const route of ROUTES) {
      if (route.method !== request.method) {
        continue;
      }
      const match = url.pathname.match(route.pattern);
      if (!match) {
        continue;
      }

      const params = match.slice(1);

      // Pembatasan khusus route dijalankan sebelum pemeriksaan sesi, supaya penebak
      // kata sandi tetap terbatasi walau belum punya sesi sama sekali.
      if (route.rateLimit) {
        const identitas = route.rateLimit.identity({ ip, params });
        const hasil = rateLimiter.check(route.rateLimit.rule, identitas);
        if (!hasil.allowed) {
          tooManyRequests(response, hasil.retryAfterSeconds, TOO_MANY_REQUESTS);
          return true;
        }
      }

      const auth = createRequestAuth({ request, identityService, registrationService });
      // Penjagaan di lapisan route: belum masuk 401, role tidak berhak 403.
      // Route tanpa `permission` dan tanpa `session` memang terbuka untuk umum,
      // atau memakai token khusus seperti token pendaftaran.
      if (route.permission || route.session) {
        const actor = await auth.actor();
        if (!actor) {
          json(response, 401, { error: NOT_SIGNED_IN });
          return true;
        }
        if (route.permission && !roleHasPermission(actor.role, route.permission)) {
          json(response, 403, { error: NOT_ALLOWED });
          return true;
        }
      }

      await route.handler({
        request,
        response,
        url,
        params,
        services,
        config: { bootstrapKey, rootDirectory },
        ip,
        rateLimit: rateLimiter,
        auth,
        // Isi permintaan sengaja dibaca oleh handler, bukan oleh dispatcher, supaya
        // pemeriksaan akses tetap berjalan lebih dulu untuk route yang memang begitu.
        readBody: () => readJsonBody(request)
      });
      return true;
    }
    return false;
  }

  async function requestListener(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const isApi = url.pathname.startsWith('/api/');
    // Dipasang lebih dulu supaya berlaku juga untuk 404 dan 500.
    applyHeaders(response, isApi ? securityHeaders.forApi() : securityHeaders.forDocument());
    try {
      if (isApi) {
        const handled = await handleApi(request, response, url);
        if (!handled) {
          json(response, 404, { error: 'Endpoint tidak ditemukan.' });
        }
        return;
      }
      serveStaticFile(response, { pathname: url.pathname, rootDirectory });
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
      rateLimiter.stop();
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

module.exports = { MAX_REQUEST_BODY_BYTES, ROUTES, RequestBodyError, createHamasahApp, hashToken, safeEqual };
