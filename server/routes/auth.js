const identity = require('../identity-service.js');
const { json, noContent, publicError, tooManyRequests } = require('../http/respond.js');
const { TOO_MANY_REQUESTS } = require('../rate-limit.js');
const { ACTIONS } = require('../audit-service.js');
const { permissionsForRole } = require('../access-policy.js');
const { safeEqual } = require('../http/auth.js');

module.exports = [
  // Membuat admin pertama. Hanya bisa dipakai sekali, dan hanya jika kunci bootstrap diisi.
  {
    method: 'POST',
    pattern: /^\/api\/auth\/bootstrap$/,
    async handler({ response, services, config, auth, readBody, ip }) {
      if (!config.bootstrapKey) {
        json(response, 503, { error: 'Bootstrap akun belum dikonfigurasi.' });
        return;
      }
      if (!safeEqual(auth.token, config.bootstrapKey)) {
        json(response, 401, { error: 'Kunci bootstrap tidak tepat.' });
        return;
      }
      if (await services.accountStore.count() > 0) {
        json(response, 409, { error: 'Akun awal sudah pernah dibuat.' });
        return;
      }
      const body = await readBody();
      const created = await services.identityService.createAccount({ ...body, role: identity.ROLES.ADMIN });
      if (created.ok) {
        await services.auditService.record({
          action: ACTIONS.ACCOUNT_BOOTSTRAPPED, actor: created.value, ip,
          entityType: 'account', entityId: created.value.id, metadata: { email: created.value.email }
        });
      }
      json(response, created.ok ? 201 : 422, created.ok ? { account: created.value } : publicError(created));
    }
  },

  // Dibatasi per email dan per IP sekaligus. Kalau hanya per IP, satu jaringan
  // bersama (asrama, kantor) ikut terkunci gara-gara satu orang. Kalau hanya per
  // email, penyerang bisa sengaja salah memasukkan kata sandi untuk mengunci akun
  // orang lain.
  {
    method: 'POST',
    pattern: /^\/api\/auth\/login$/,
    async handler({ response, services, readBody, rateLimit, ip }) {
      const body = await readBody();
      const identitas = `${String(body.email || '').trim().toLocaleLowerCase('en-US')}|${ip}`;
      const jatah = rateLimit.check('login', identitas);
      if (!jatah.allowed) {
        // Dicatat karena inilah tanda paling awal adanya percobaan menebak kata sandi.
        await services.auditService.record({ action: ACTIONS.LOGIN_RATE_LIMITED, ip, metadata: { email: identitas.split('|')[0] } });
        tooManyRequests(response, jatah.retryAfterSeconds, TOO_MANY_REQUESTS);
        return;
      }
      const loggedIn = await services.identityService.login(body.email, body.password);
      await services.auditService.record({
        action: loggedIn.ok ? ACTIONS.LOGIN_SUCCESS : ACTIONS.LOGIN_FAILED,
        actor: loggedIn.ok ? loggedIn.value.account : null,
        ip,
        entityType: 'account',
        entityId: loggedIn.ok ? loggedIn.value.account.id : null,
        metadata: { email: identitas.split('|')[0] }
      });
      if (loggedIn.ok) {
        // Masuk dari beberapa perangkat dalam waktu dekat itu wajar, jadi hitungan
        // dikosongkan begitu kata sandi terbukti benar.
        rateLimit.reset('login', identitas);
      }
      json(response, loggedIn.ok ? 200 : 401, loggedIn.ok
        ? { accessToken: loggedIn.value.accessToken, account: loggedIn.value.account }
        : publicError(loggedIn));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/auth\/logout$/,
    async handler({ response, services, auth, ip }) {
      const actor = await auth.actor();
      await services.identityService.logout(auth.token);
      if (actor) {
        await services.auditService.record({ action: ACTIONS.LOGOUT, actor, ip, entityType: 'account', entityId: actor.id });
      }
      noContent(response);
    }
  },

  // Mencabut seluruh sesi akun sendiri. Dipakai kalau perangkat hilang atau
  // dipinjam orang lain, tanpa harus menunggu admin.
  {
    method: 'POST',
    pattern: /^\/api\/auth\/logout-all$/,
    session: true,
    async handler({ response, services, auth, ip }) {
      const actor = await auth.actor();
      const dicabut = await services.identityService.logoutAll(actor.id);
      await services.auditService.record({
        action: ACTIONS.LOGOUT_ALL, actor, ip,
        entityType: 'account', entityId: actor.id, metadata: { sesiDicabut: dicabut }
      });
      json(response, 200, { sessionsRevoked: dicabut });
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/me$/,
    async handler({ response, auth }) {
      const session = await auth.session();
      json(response, session.ok ? 200 : 401, session.ok
        ? { account: session.value, permissions: permissionsForRole(session.value.role) }
        : publicError(session));
    }
  },

  // Balasan sengaja sama untuk email yang terdaftar maupun tidak, supaya tidak
  // bisa dipakai memeriksa alamat email siapa saja yang punya akun.
  {
    method: 'POST',
    pattern: /^\/api\/auth\/password-reset-request$/,
    async handler({ response, services, readBody, rateLimit, ip }) {
      const body = await readBody();
      const email = String(body.email || '').trim().toLocaleLowerCase('en-US');
      // Dibatasi per email supaya tidak bisa dipakai membanjiri kotak masuk orang lain.
      const jatah = rateLimit.check('password-reset-request', email);
      if (!jatah.allowed) {
        tooManyRequests(response, jatah.retryAfterSeconds, TOO_MANY_REQUESTS);
        return;
      }
      await services.identityService.issuePasswordReset(body.email);
      await services.auditService.record({ action: ACTIONS.PASSWORD_RESET_REQUESTED, ip, metadata: { email } });
      json(response, 202, { message: 'Jika akun tersedia, instruksi reset akan dikirim melalui kanal resmi.' });
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/auth\/password-reset$/,
    async handler({ response, services, readBody, ip }) {
      const body = await readBody();
      const reset = await services.identityService.resetPassword(body.email, body.token, body.password);
      if (reset.ok) {
        await services.auditService.record({
          action: ACTIONS.PASSWORD_RESET_COMPLETED, ip,
          metadata: { email: String(body.email || '').trim().toLocaleLowerCase('en-US') }
        });
      }
      json(response, reset.ok ? 204 : 422, reset.ok ? {} : publicError(reset));
    }
  }
];
