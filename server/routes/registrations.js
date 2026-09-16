const registrationDomain = require('../../website/registration-domain.js');
const { json, publicError } = require('../http/respond.js');
const { createAccessToken, hashToken, registrationRoleOf } = require('../http/auth.js');

const REGISTRATION_ID = String.raw`HI-REG-\d{4}-\d{5}`;

module.exports = [
  // Pendaftaran publik. Token akses dikembalikan sekali saja; yang disimpan hanya hash-nya.
  {
    method: 'POST',
    pattern: /^\/api\/registrations$/,
    async handler({ response, services, readBody }) {
      const accessToken = createAccessToken();
      const created = await services.registrationService.create(await readBody(), {
        privateData: { accessTokenHash: hashToken(accessToken) }
      });
      json(response, created.ok ? 201 : 422, created.ok
        ? { registration: created.value, accessToken }
        : publicError(created));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/registrations$/,
    permission: 'registrations.read',
    async handler({ response, services }) {
      json(response, 200, { items: await services.registrationService.listForStaff() });
    }
  },

  {
    method: 'GET',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})$`),
    async handler({ response, services, auth, params }) {
      const registrationId = params[0];
      if (!(await auth.isCandidate(registrationId))) {
        json(response, 401, { error: 'Akses akun pendaftaran diperlukan.' });
        return;
      }
      const registration = await services.registrationService.getPublic(registrationId);
      json(response, registration.ok ? 200 : 404, registration.ok ? { registration: registration.value } : publicError(registration));
    }
  },

  // Dokumen boleh diunggah pendaftar sendiri atau petugas.
  {
    method: 'POST',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/documents$`),
    async handler({ response, services, auth, params, readBody }) {
      const registrationId = params[0];
      const isCandidate = await auth.isCandidate(registrationId);
      const staff = isCandidate ? null : await auth.staffActor();
      if (!isCandidate && !staff) {
        json(response, 401, { error: 'Akses akun pendaftaran atau petugas diperlukan.' });
        return;
      }
      const result = await services.registrationService.addDocument(
        registrationId,
        await readBody(),
        staff
          ? { role: registrationRoleOf(staff), accountId: staff.id }
          : { role: registrationDomain.ROLES.APPLICANT }
      );
      json(response, result.ok ? 201 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  },

  {
    method: 'PATCH',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/status$`),
    permission: 'registrations.update-status',
    async handler({ response, services, auth, params, readBody }) {
      const staff = await auth.actor();
      const body = await readBody();
      // Peran diambil dari sesi. Nilai role pada isi request sengaja diabaikan.
      const result = await services.registrationService.changeStatus(params[0], body.status, {
        role: registrationRoleOf(staff),
        note: body.note,
        accountId: staff.id
      });
      json(response, result.ok ? 200 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  }
];
