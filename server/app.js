// Perakitan aplikasi: menyiapkan store dan service, lalu mencocokkan permintaan
// dengan daftar route. Logika tiap endpoint ada di server/routes/.

const http = require('node:http');
const path = require('node:path');
const registrationServiceModule = require('../website/registration-service.js');
const { createDatabase } = require('./db.js');
const { createPostgresRegistrationStore } = require('./postgres-registration-store.js');
const { createPostgresApplicantSessionStore } = require('./postgres-applicant-session-store.js');
const { createApplicantService } = require('./applicant-service.js');
const { createPostgresArticleStore } = require('./postgres-article-store.js');
const identity = require('./identity-service.js');
const { createPostgresAccountStore } = require('./postgres-account-store.js');
const { createPostgresNotificationStore } = require('./postgres-notification-store.js');
const { createEmailSender } = require('./email-service.js');
const { createNotificationService } = require('./notification-service.js');
const { createPostgresSessionStore } = require('./postgres-session-store.js');
const { createStudentPortalService } = require('./student-portal-service.js');
const { createPostgresStudentStore } = require('./postgres-student-store.js');
const { createLmsService } = require('./lms-service.js');
const { createPostgresLmsStore } = require('./postgres-lms-store.js');
const { createOperationsService } = require('./operations-service.js');
const { createPostgresOperationsStore } = require('./postgres-operations-store.js');
const { createDormitoryService } = require('./dormitory-service.js');
const { createPostgresDormitoryStore } = require('./postgres-dormitory-store.js');
const { createAuditService } = require('./audit-service.js');
const { createPostgresAuditStore } = require('./postgres-audit-store.js');
const { createFileService } = require('./file-service.js');
const { createPostgresFileStore } = require('./postgres-file-store.js');
const { createLocalStorage } = require('./storage/local.js');
const { createSupabaseStorage } = require('./storage/supabase.js');
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
  ...require('./routes/audit.js'),
  ...require('./routes/files.js'),
  ...require('./routes/operations.js'),
  ...require('./routes/dormitories.js'),
  ...require('./routes/students.js'),
  ...require('./routes/lms.js'),
  ...require('./routes/articles.js'),
  ...require('./routes/faq.js'),
  ...require('./routes/registrations.js')
]);

const READINESS_TIMEOUT_MS = 2000;
const AUDIT_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SESSION_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Kunci pengembangan. readProductionConfig menolak nilai ini di staging dan production.
const DEV_IP_HASH_SECRET = 'kunci-hash-ip-khusus-pengembangan';

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
  const applicantSessionStore = config.applicantSessionStore || createPostgresApplicantSessionStore({ database });
  const applicantService = config.applicantService || createApplicantService({ registrationStore, sessionStore: applicantSessionStore });
  const articleStore = config.articleStore || createPostgresArticleStore({ database });
  const accountStore = config.accountStore || createPostgresAccountStore({ database });
  const sessionStore = config.sessionStore || createPostgresSessionStore({ database });
  const identityService = config.identityService || identity.createIdentityService({ accountStore, sessionStore });
  const notificationStore = config.notificationStore || createPostgresNotificationStore({ database });
  const email = config.email || { driver: ['development', 'test'].includes(appEnvironment) ? 'console' : 'disabled' };
  const notificationService = config.notificationService || createNotificationService({
    store: notificationStore,
    sender: config.emailSender || createEmailSender({
      driver: email.driver,
      apiKey: email.resendApiKey,
      from: email.emailFrom,
      logger: config.logger || console
    })
  });
  const auditStore = config.auditStore || createPostgresAuditStore({ database });
  const auditService = config.auditService || createAuditService({
    store: auditStore,
    ipHashSecret: config.ipHashSecret || process.env.IP_HASH_SECRET || DEV_IP_HASH_SECRET
  });
  const auditRetentionDays = Number(config.auditRetentionDays || process.env.AUDIT_RETENTION_DAYS || 365);

  const fileStore = config.fileStore || createPostgresFileStore({ database });
  const storage = config.storage || (config.storageDriver === 'supabase'
    ? createSupabaseStorage({ url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey })
    : createLocalStorage({ rootDirectory: path.join(rootDirectory, 'data', 'dev-storage') }));

  const dormitoryStore = config.dormitoryStore || createPostgresDormitoryStore({ database });
  const dormitoryService = config.dormitoryService || createDormitoryService({
    store: dormitoryStore,
    getAccount: (accountId) => accountStore.getById(accountId)
  });
  const studentStore = config.studentStore || createPostgresStudentStore({ database });
  const studentPortalService = config.studentPortalService || createStudentPortalService({
    store: studentStore,
    // Musyrif hanya melihat santri di asrama yang ditugaskan kepadanya.
    supervisorDormitories: (accountId) => dormitoryService.dormitoriesForStaff(accountId),
    getDormitory: (dormitoryId) => dormitoryStore.getDormitory(dormitoryId)
  });
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

  const fileService = config.fileService || createFileService({
    store: fileStore,
    storage,
    buckets: {
      private: config.storageBucket || 'hamasah-private',
      public: config.storagePublicBucket || 'hamasah-public'
    },
    // Diisi setelah seluruh service siap, karena aturan unggah memerlukan
    // service santri, LMS, dan operasional untuk memeriksa kepemilikan.
    services: {
      get studentPortalService() { return studentPortalService; },
      get lmsService() { return lmsService; },
      get operationsStore() { return operationsStore; }
    }
  });

  const services = Object.freeze({
    accountStore,
    applicantService,
    articleStore,
    auditService,
    fileService,
    checkDatabaseReady,
    dormitoryService,
    identityService,
    lmsService,
    notificationService,
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
        config: { bootstrapKey, rootDirectory, appBaseUrl: email.appBaseUrl || '' },
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

  // Pembersihan catatan audit lama. Dijalankan di dalam proses aplikasi karena
  // belum ada penjadwal terpisah; timer di-unref supaya tidak menahan proses berhenti.
  let auditPurgeTimer = null;
  let sessionPurgeTimer = null;

  // Timer di-unref supaya tidak menahan proses berhenti saat shutdown.
  function jadwalkan(pekerjaan, jeda) {
    const timer = setInterval(pekerjaan, jeda);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    return timer;
  }

  function startAuditRetention() {
    async function bersihkan() {
      try {
        const dihapus = await auditService.purgeOlderThan(auditRetentionDays);
        if (dihapus > 0) {
          console.log(`[audit] ${dihapus} catatan lebih tua dari ${auditRetentionDays} hari dihapus.`);
        }
      } catch (error) {
        console.error(`[audit] Pembersihan catatan lama gagal: ${error.message}`);
      }
    }
    auditPurgeTimer = jadwalkan(bersihkan, AUDIT_PURGE_INTERVAL_MS);
    return bersihkan();
  }

  // Sesi kedaluwarsa memang sudah ditolak saat dipakai, tetapi barisnya tetap
  // menumpuk di database kalau tidak pernah dibuang.
  // Baris unggahan yang isinya tidak pernah dikirim hanya menumpuk.
  function startStaleUploadCleanup() {
    async function bersihkan() {
      try {
        const dihapus = await fileService.purgeStalePending();
        if (dihapus > 0) {
          console.log(`[berkas] ${dihapus} unggahan yang tidak pernah selesai dihapus.`);
        }
      } catch (error) {
        console.error(`[berkas] Pembersihan unggahan tertunda gagal: ${error.message}`);
      }
    }
    jadwalkan(bersihkan, SESSION_PURGE_INTERVAL_MS);
    return bersihkan();
  }

  function startSessionCleanup() {
    async function bersihkan() {
      try {
        const dihapus = await identityService.purgeExpiredSessions();
        if (dihapus > 0) {
          console.log(`[sesi] ${dihapus} sesi kedaluwarsa dihapus.`);
        }
      } catch (error) {
        console.error(`[sesi] Pembersihan sesi kedaluwarsa gagal: ${error.message}`);
      }
    }
    sessionPurgeTimer = jadwalkan(bersihkan, SESSION_PURGE_INTERVAL_MS);
    return bersihkan();
  }

  return {
    createServer() {
      // Pembersihan pertama berjalan saat server benar-benar dinyalakan, bukan saat
      // app dirakit, supaya test yang hanya merakit app tidak menyentuh database.
      if (config.auditRetention !== false && !auditPurgeTimer) {
        startAuditRetention();
        startSessionCleanup();
        startStaleUploadCleanup();
      }
      return http.createServer(requestListener);
    },
    // Menutup pool koneksi database yang dibuat app ini. Database dari luar (config.database) tidak ditutup.
    async close() {
      rateLimiter.stop();
      if (auditPurgeTimer) {
        clearInterval(auditPurgeTimer);
        auditPurgeTimer = null;
      }
      if (sessionPurgeTimer) {
        clearInterval(sessionPurgeTimer);
        sessionPurgeTimer = null;
      }
      if (ownsDatabase) {
        await database.close();
      }
    },
    identityService,
    registrationService,
    applicantService,
    studentPortalService,
    dormitoryService,
    auditService,
    fileService,
    lmsService,
    operationsService,
    notificationService
  };
}

module.exports = { MAX_REQUEST_BODY_BYTES, ROUTES, RequestBodyError, createHamasahApp, hashToken, safeEqual };
