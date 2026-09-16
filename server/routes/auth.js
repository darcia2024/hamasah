const identity = require('../identity-service.js');
const { json, noContent, publicError } = require('../http/respond.js');
const { permissionsForRole } = require('../access-policy.js');
const { safeEqual } = require('../http/auth.js');

module.exports = [
  // Membuat admin pertama. Hanya bisa dipakai sekali, dan hanya jika kunci bootstrap diisi.
  {
    method: 'POST',
    pattern: /^\/api\/auth\/bootstrap$/,
    async handler({ response, services, config, auth, readBody }) {
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
      json(response, created.ok ? 201 : 422, created.ok ? { account: created.value } : publicError(created));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/auth\/login$/,
    async handler({ response, services, readBody }) {
      const body = await readBody();
      const loggedIn = await services.identityService.login(body.email, body.password);
      json(response, loggedIn.ok ? 200 : 401, loggedIn.ok
        ? { accessToken: loggedIn.value.accessToken, account: loggedIn.value.account }
        : publicError(loggedIn));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/auth\/logout$/,
    async handler({ response, services, auth }) {
      await services.identityService.logout(auth.token);
      noContent(response);
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
    async handler({ response, services, readBody }) {
      const body = await readBody();
      await services.identityService.issuePasswordReset(body.email);
      json(response, 202, { message: 'Jika akun tersedia, instruksi reset akan dikirim melalui kanal resmi.' });
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/auth\/password-reset$/,
    async handler({ response, services, readBody }) {
      const body = await readBody();
      const reset = await services.identityService.resetPassword(body.email, body.token, body.password);
      json(response, reset.ok ? 204 : 422, reset.ok ? {} : publicError(reset));
    }
  }
];
