const registrationDomain = require('../../website/registration-domain.js');
const { json, publicError } = require('../http/respond.js');
const { createAccessToken, hashToken, registrationRoleOf } = require('../http/auth.js');
const { ACTIONS } = require('../audit-service.js');

const REGISTRATION_ID = String.raw`HI-REG-\d{4}-\d{5}`;

module.exports = [
  // Pendaftaran publik. Token akses dikembalikan sekali saja; yang disimpan hanya hash-nya.
  {
    method: 'POST',
    pattern: /^\/api\/registrations$/,
    rateLimit: { rule: 'registration-create', identity: ({ ip }) => ip },
    async handler({ response, services, readBody, ip }) {
      const accessToken = createAccessToken();
      const created = await services.registrationService.create(await readBody(), {
        privateData: { accessTokenHash: hashToken(accessToken) }
      });
      if (created.ok) {
        // Nomor registrasi saja. Nama dan nomor telepon pendaftar tidak ikut dicatat.
        await services.auditService.record({
          action: ACTIONS.REGISTRATION_CREATED, ip,
          entityType: 'registration', entityId: created.value.registrationId,
          metadata: { program: created.value.program }
        });
      }
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
    // Dibatasi per nomor pendaftaran, karena yang mungkin ditebak adalah tokennya.
    rateLimit: { rule: 'applicant-login', identity: ({ params }) => params[0] },
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
    async handler({ response, services, auth, params, readBody, ip }) {
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
      if (result.ok) {
        await services.auditService.record({
          action: ACTIONS.REGISTRATION_DOCUMENT_ADDED, actor: staff, ip,
          entityType: 'registration', entityId: registrationId,
          metadata: { olehPendaftar: isCandidate }
        });
      }
      json(response, result.ok ? 201 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  },

  {
    method: 'PATCH',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/status$`),
    permission: 'registrations.update-status',
    async handler({ response, services, auth, params, readBody, ip }) {
      const staff = await auth.actor();
      const body = await readBody();
      // Peran diambil dari sesi. Nilai role pada isi request sengaja diabaikan.
      const result = await services.registrationService.changeStatus(params[0], body.status, {
        role: registrationRoleOf(staff),
        note: body.note,
        accountId: staff.id
      });
      if (result.ok) {
        await services.auditService.record({
          action: ACTIONS.REGISTRATION_STATUS_CHANGED, actor: staff, ip,
          entityType: 'registration', entityId: params[0],
          metadata: { status: result.value.status }
        });
      }
      json(response, result.ok ? 200 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  }
];
