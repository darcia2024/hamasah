const registrationDomain = require('../../website/registration-domain.js');
const { json, publicError, tooManyRequests } = require('../http/respond.js');
const { createAccessToken, hashToken, registrationRoleOf } = require('../http/auth.js');
const { ACTIONS } = require('../audit-service.js');
const { TOO_MANY_REQUESTS } = require('../rate-limit.js');

const REGISTRATION_ID = String.raw`HI-REG-\d{4}-\d{5}`;

// Kloter keberangkatan untuk tampilan pendaftar (bentuk aman, atau null bila belum ditetapkan).
async function withDeparture(services, registration) {
  return { ...registration, departure: await services.departureService.forApplicant(registration.registrationId) };
}

module.exports = [
  // Pendaftaran publik. Token akses dikembalikan sekali saja; yang disimpan hanya hash-nya.
  {
    method: 'POST',
    pattern: /^\/api\/registrations$/,
    rateLimit: { rule: 'registration-create', identity: ({ ip }) => ip },
    async handler({ response, services, readBody, ip }) {
      // Saklar "Pendaftaran online" di halaman Pengaturan.
      if (!(await services.settingsService.ambil('pendaftaran.dibuka'))) {
        json(response, 409, { error: await services.settingsService.ambil('pendaftaran.pesanTutup'), code: 'registration-closed' });
        return;
      }
      const accessCode = services.applicantService.createAccessCode();
      const accessToken = createAccessToken();
      const created = await services.registrationService.create(await readBody(), {
        privateData: { accessTokenHash: hashToken(accessToken), accessCodeHash: await services.applicantService.hashAccessCode(accessCode) }
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
        ? { registration: created.value, accessToken, accessCode }
        : publicError(created));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/applicant\/login$/,
    async handler({ response, services, readBody, rateLimit }) {
      const body = await readBody();
      const registrationId = String(body.registrationId || '').trim();
      const limit = await rateLimit.check('applicant-login', registrationId);
      if (!limit.allowed) {
        const { tooManyRequests } = require('../http/respond.js');
        const { TOO_MANY_REQUESTS } = require('../rate-limit.js');
        tooManyRequests(response, limit.retryAfterSeconds, TOO_MANY_REQUESTS);
        return;
      }
      const loggedIn = await services.applicantService.login(registrationId, body.accessCode);
      json(response, loggedIn.ok ? 200 : 401, loggedIn.ok ? loggedIn.value : publicError(loggedIn));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/applicant\/recovery$/,
    async handler({ response, services, readBody, rateLimit, ip }) {
      const body = await readBody();
      const registrationId = String(body.registrationId || '').trim().toUpperCase();
      const limit = await rateLimit.check('applicant-recovery', `${ip}:${registrationId}`);
      if (!limit.allowed) {
        tooManyRequests(response, limit.retryAfterSeconds, TOO_MANY_REQUESTS);
        return;
      }

      // Selalu balas 202 agar nomor pendaftaran dan email tidak dapat ditebak.
      const recovered = await services.applicantService.recoverAccessCode(registrationId, body.email);
      if (recovered.ok && services.notificationService.canSend()) {
        await services.notificationService.queueApplicantRecovery(recovered.value);
      }
      json(response, 202, { message: 'Jika data cocok, kode akses baru akan dikirim ke email terdaftar.' });
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/applicant\/logout$/,
    async handler({ request, response, services }) {
      const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
      await services.applicantService.logout(token);
      json(response, 204, {});
    }
  },

  {
    method: 'GET',
    pattern: new RegExp(`^/api/applicant/registrations/(${REGISTRATION_ID})$`),
    async handler({ request, response, services, params }) {
      const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const authenticated = await services.applicantService.authenticate(token, params[0]);
      if (!authenticated.ok) {
        json(response, 401, publicError(authenticated));
        return;
      }
      const registration = await services.registrationService.getPublic(params[0]);
      json(response, registration.ok ? 200 : 404, registration.ok ? { registration: await withDeparture(services, registration.value) } : publicError(registration));
    }
  },

  {
    method: 'POST',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/convert$`),
    permission: 'registrations.convert',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const result = await services.registrationConversionService.convert(params[0], actor);
      if (result.ok) {
        await services.auditService.record({
          action: ACTIONS.REGISTRATION_CONVERTED, actor, ip,
          entityType: 'registration', entityId: params[0], metadata: { alreadyConverted: result.value.alreadyConverted }
        });
      }
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { conversion: result.value } : publicError(result));
    }
  },

  // Ringkasan pipeline: jumlah per status, pendaftar baru belum disentuh, tindak lanjut lewat
  // tenggat, berkas menunggu review, dan pesan konsultasi baru.
  {
    method: 'GET',
    pattern: /^\/api\/registrations\/ringkasan$/,
    permission: 'registrations.read',
    async handler({ response, services }) {
      const ringkasan = await services.registrationService.pipelineSummary();
      let pesanBaru = 0;
      try {
        pesanBaru = (await services.inquiryStore.list({ status: 'new', page: 1, pageSize: 1 })).total;
      } catch { pesanBaru = 0; }
      json(response, 200, { ...(ringkasan || {}), newInquiries: pesanBaru });
    }
  },

  // Agenda tindak lanjut lintas pendaftar, urut tenggat.
  {
    method: 'GET',
    pattern: /^\/api\/registrations\/tindak-lanjut$/,
    permission: 'registrations.read',
    async handler({ response, services }) {
      json(response, 200, { items: await services.registrationService.openNextSteps() });
    }
  },

  // Pendaftaran manual oleh petugas (calon lewat WhatsApp, telepon, atau datang langsung,
  // atau dari pesan konsultasi). Data wajib sama dengan formulir publik; persetujuan
  // dikonfirmasi petugas dengan calon/wali. Kode akses cek status dikembalikan sekali.
  {
    method: 'POST',
    pattern: /^\/api\/registrations\/manual$/,
    permission: 'registrations.update-status',
    async handler({ response, services, auth, readBody, ip }) {
      const staff = await auth.actor();
      const body = await readBody();
      const SUMBER = { whatsapp: 'WhatsApp', telepon: 'telepon', 'datang-langsung': 'datang langsung', konsultasi: 'pesan konsultasi' };
      const sumber = SUMBER[body.sumber] ? body.sumber : '';
      if (!sumber) { json(response, 422, { error: 'Pilih dari mana calon mendaftar.' }); return; }
      if (body.konfirmasiPersetujuan !== true) {
        json(response, 422, { error: 'Konfirmasi bahwa calon (dan wali) sudah menyetujui pemrosesan data pribadi.', errors: { konfirmasiPersetujuan: 'Centang konfirmasi bahwa calon (dan wali) sudah menyetujui pemrosesan data pribadi.' } });
        return;
      }
      const accessCode = services.applicantService.createAccessCode();
      const accessToken = createAccessToken();
      const created = await services.registrationService.create({
        ...body,
        referralSource: body.referralSource || `Petugas (${SUMBER[sumber]})`,
        consent: true,
        dataProcessingConsent: true,
        guardianConsent: body.guardianConsent === true
      }, {
        privateData: { accessTokenHash: hashToken(accessToken), accessCodeHash: await services.applicantService.hashAccessCode(accessCode) }
      });
      if (!created.ok) { json(response, 422, publicError(created)); return; }
      const registrationId = created.value.registrationId;
      await services.registrationService.addNote(registrationId, {
        visibility: 'internal',
        body: `Didaftarkan manual oleh petugas lewat ${SUMBER[sumber]}. Persetujuan pemrosesan data dikonfirmasi petugas.`
      }, { role: registrationRoleOf(staff), accountId: staff.id });
      await services.auditService.record({
        action: ACTIONS.REGISTRATION_CREATED, actor: staff, ip,
        entityType: 'registration', entityId: registrationId,
        metadata: { program: created.value.program, manual: true, sumber }
      });
      // Pesan konsultasi asalnya otomatis ditandai sudah dihubungi.
      if (body.inquiryId) {
        try { await services.inquiryStore.updateStatus(String(body.inquiryId), 'contacted', staff.id); } catch { /* status pesan tidak menggagalkan pendaftaran */ }
      }
      json(response, 201, { registration: created.value, accessCode });
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/registrations$/,
    permission: 'registrations.read',
    async handler({ request, response, services }) {
      const query = new URL(request.url, 'http://localhost').searchParams;
      const page = await services.registrationService.listForStaff({
        search: query.get('search'), status: query.get('status'), page: query.get('page'), pageSize: query.get('pageSize'),
        program: query.get('program'), departure: query.get('departure'), sort: query.get('sort'),
        overdue: query.get('overdue') === '1', pendingDocuments: query.get('pendingDocuments') === '1', stale: query.get('stale') === '1'
      });
      // Kloter tiap pendaftaran pada halaman ini, satu query untuk seluruh halaman.
      const kloter = await services.departureService.forRegistrations((page.items || []).map((item) => item.registrationId));
      json(response, 200, { ...page, items: (page.items || []).map((item) => ({ ...item, departure: kloter[item.registrationId] || null })) });
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
      json(response, registration.ok ? 200 : 404, registration.ok ? { registration: await withDeparture(services, registration.value) } : publicError(registration));
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
        await services.eventNotifier.registrationStatusChanged(params[0]);
      }
      json(response, result.ok ? 200 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  },

  {
    method: 'DELETE',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/documents/([\\w-]+)$`),
    async handler({ response, services, auth, params, ip }) {
      const registrationId = params[0];
      const isCandidate = await auth.isCandidate(registrationId);
      const staff = isCandidate ? null : await auth.staffActor();
      if (!isCandidate && !staff) {
        json(response, 401, { error: 'Akses akun pendaftaran atau petugas diperlukan.' });
        return;
      }
      const result = await services.registrationService.deleteDocument(registrationId, params[1], staff
        ? { role: registrationRoleOf(staff), accountId: staff.id }
        : { role: registrationDomain.ROLES.APPLICANT });
      if (result.ok) await services.auditService.record({
        action: ACTIONS.REGISTRATION_DOCUMENT_DELETED, actor: staff, ip,
        entityType: 'registration', entityId: registrationId,
        metadata: { documentId: params[1], olehPendaftar: isCandidate }
      });
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { registration: result.value } : publicError(result));
    }
  },

  {
    method: 'PATCH',
    pattern: new RegExp(`^/api/applicant/registrations/(${REGISTRATION_ID})$`),
    async handler({ response, services, auth, params, readBody }) {
      if (!(await auth.isCandidate(params[0]))) {
        json(response, 401, { error: 'Akses akun pendaftaran diperlukan.' });
        return;
      }
      const result = await services.registrationService.updateApplicant(params[0], await readBody(), { role: registrationDomain.ROLES.APPLICANT });
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { registration: result.value } : publicError(result));
    }
  },

  {
    method: 'PATCH',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/documents/([\\w-]+)/review$`),
    permission: 'registrations.update-status',
    async handler({ response, services, auth, params, readBody, ip }) {
      const staff = await auth.actor();
      const result = await services.registrationService.reviewDocument(params[0], params[1], await readBody(), { role: registrationRoleOf(staff), accountId: staff.id });
      if (result.ok) {
        await services.auditService.record({ action: ACTIONS.REGISTRATION_DOCUMENT_REVIEWED, actor: staff, ip, entityType: 'registration', entityId: params[0] });
        await services.eventNotifier.documentRejected(params[0], params[1]);
      }
      json(response, result.ok ? 200 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  },

  {
    method: 'POST',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/notes$`),
    permission: 'registrations.update-status',
    async handler({ response, services, auth, params, readBody, ip }) {
      const staff = await auth.actor();
      const result = await services.registrationService.addNote(params[0], await readBody(), { role: registrationRoleOf(staff), accountId: staff.id });
      if (result.ok) await services.auditService.record({ action: ACTIONS.REGISTRATION_NOTE_ADDED, actor: staff, ip, entityType: 'registration', entityId: params[0] });
      json(response, result.ok ? 201 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  },
  {
    method: 'POST',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/next-steps$`),
    permission: 'registrations.update-status',
    async handler({ response, services, auth, params, readBody }) {
      const staff = await auth.actor();
      const result = await services.registrationService.addNextStep(params[0], await readBody(), { role: registrationRoleOf(staff), accountId: staff.id });
      json(response, result.ok ? 201 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  },
  // Tandai tindak lanjut selesai ({ done: true }) atau buka kembali ({ done: false }).
  {
    method: 'PATCH',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/next-steps/([\\w-]+)$`),
    permission: 'registrations.update-status',
    async handler({ response, services, auth, params, readBody }) {
      const staff = await auth.actor();
      const result = await services.registrationService.setNextStepDone(params[0], params[1], await readBody(), { role: registrationRoleOf(staff), accountId: staff.id });
      json(response, result.ok ? 200 : 422, result.ok ? { registration: result.value } : publicError(result));
    }
  }
];
