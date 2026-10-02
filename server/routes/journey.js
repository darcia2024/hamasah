const { json, noContent, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Roadmap studi dan santri teladan bulanan. Lihat server/student-journey-service.js.
module.exports = [
  // Roadmap satu santri: santri itu sendiri, walinya, musyrifnya, dan admin.
  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/roadmap$/,
    permission: 'students.read',
    async handler({ response, services, auth, params }) {
      const hasil = await services.studentJourneyService.roadmap(params[0], await auth.actor());
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? { roadmap: hasil.value } : publicError(hasil));
    }
  },

  // Fase studi santri saat ini (null untuk mengosongkan).
  {
    method: 'PUT',
    pattern: /^\/api\/students\/([\w-]+)\/roadmap$/,
    permission: 'honors.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.studentJourneyService.setPhase(params[0], body ? body.phase : undefined, actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.STUDENT_PHASE_UPDATED, actor, ip,
          entityType: 'student', entityId: params[0],
          metadata: { fase: hasil.value.phase || 'kosong' }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  // Santri teladan bulan terakhir, untuk dashboard santri dan wali (dan staf yang
  // boleh membaca data santri). Tanpa id santri.
  {
    method: 'GET',
    pattern: /^\/api\/honors$/,
    permission: 'students.read',
    async handler({ response, services }) {
      json(response, 200, (await services.studentJourneyService.honorsForViewers()).value);
    }
  },

  // Admin: santri teladan dan kandidat satu bulan (?month=YYYY-MM).
  {
    method: 'GET',
    pattern: /^\/api\/admin\/honors$/,
    permission: 'honors.manage',
    async handler({ response, services, auth, url }) {
      const actor = await auth.actor();
      const bulan = url.searchParams.get('month');
      const [terpilih, kandidat] = await Promise.all([
        services.studentJourneyService.honorsForMonth(bulan, actor),
        services.studentJourneyService.candidates(bulan, actor)
      ]);
      if (!terpilih.ok) {
        json(response, terpilih.status || 422, publicError(terpilih));
        return;
      }
      json(response, 200, { ...terpilih.value, candidates: kandidat.ok ? kandidat.value.items : [] });
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/admin\/honors$/,
    permission: 'honors.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentJourneyService.addHonor(await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.HONOR_ADDED, actor, ip,
          entityType: 'student', entityId: hasil.value.studentId,
          metadata: { bulan: hasil.value.month, gelar: hasil.value.title }
        });
      }
      json(response, hasil.ok ? 201 : (hasil.status || 422), hasil.ok ? { honor: hasil.value } : publicError(hasil));
    }
  },

  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/honors\/([\w-]+)$/,
    permission: 'honors.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.studentJourneyService.removeHonor(params[0], actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.HONOR_REMOVED, actor, ip,
          entityType: 'honor', entityId: hasil.value.id,
          metadata: { bulan: hasil.value.month }
        });
        noContent(response);
        return;
      }
      json(response, hasil.status || 422, publicError(hasil));
    }
  }
];
