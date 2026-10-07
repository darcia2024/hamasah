// Kloter keberangkatan: dikelola petugas pendaftaran dan admin (izin departures.manage).
const { csv, json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

const REGISTRATION_ID = String.raw`HI-REG-\d{4}-\d{5}`;

const LABEL_PROGRAM = { 'kuliah-al-azhar': 'Kuliah S1 Al-Azhar', 'mahad-al-azhar': "Ma'had Al-Azhar", 'hamasah-courses': 'Hamasah Courses' };
const { dokumenWajib } = require('../templates.js');

// Ringkasan berkas: berapa yang sudah diterima dari jenis berkas wajib (diatur di halaman
// Template, bagian Dokumen pendaftar), dan status paspor.
function ringkasBerkas(documents, wajib) {
  const diterima = new Set(documents.filter((document) => document.reviewStatus === 'accepted').map((document) => document.type));
  const paspor = documents.filter((document) => document.type === 'passport');
  return {
    accepted: wajib.filter((jenis) => diterima.has(jenis)).length,
    required: wajib.length,
    passport: diterima.has('passport') ? 'diterima' : paspor.length ? 'menunggu review' : 'belum ada'
  };
}

async function anggotaKloter(services, groupId, actor) {
  const hasil = await services.departureService.members(groupId, actor);
  if (!hasil.ok) return hasil;
  const pendaftar = await services.registrationService.staffByRegistrationIds(hasil.value.registrationIds);
  const wajib = dokumenWajib(await services.templateService.ambil('dokumen'));
  return {
    ok: true,
    value: {
      group: hasil.value.group,
      items: pendaftar.map((item) => ({
        registrationId: item.registrationId,
        applicantName: item.applicant.applicantName,
        program: item.program,
        status: item.status,
        statusLabel: item.statusLabel,
        phone: item.applicant.phone,
        guardianName: item.applicant.guardianName || '',
        guardianPhone: item.applicant.guardianPhone || '',
        city: item.applicant.city || '',
        documents: ringkasBerkas(item.documents || [], wajib)
      }))
    }
  };
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/departures$/,
    permission: 'departures.manage',
    async handler({ response, services, auth }) {
      const result = await services.departureService.listGroups(await auth.actor());
      json(response, result.ok ? 200 : 403, result.ok ? { items: result.value } : publicError(result));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/departures$/,
    permission: 'departures.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const result = await services.departureService.createGroup(await readBody(), actor);
      if (result.ok) {
        await services.auditService.record({ action: ACTIONS.DEPARTURE_GROUP_SAVED, actor, ip, entityType: 'departure-group', entityId: result.value.id, metadata: { name: result.value.name, status: result.value.status } });
      }
      json(response, result.ok ? 201 : 422, result.ok ? { group: result.value } : publicError(result));
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/departures\/([\w-]+)$/,
    permission: 'departures.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const result = await services.departureService.updateGroup(params[0], await readBody(), actor);
      let notified = 0;
      if (result.ok && result.changes.length && result.members.length) {
        notified = await services.eventNotifier.departureUpdated(result.members, result.value, result.changes);
      }
      if (result.ok) {
        await services.auditService.record({ action: ACTIONS.DEPARTURE_GROUP_SAVED, actor, ip, entityType: 'departure-group', entityId: result.value.id, metadata: { name: result.value.name, status: result.value.status } });
      }
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { group: result.value, notified } : publicError(result));
    }
  },

  // Anggota kloter untuk konsol petugas.
  {
    method: 'GET',
    pattern: /^\/api\/departures\/([\w-]+)\/anggota$/,
    permission: 'departures.manage',
    async handler({ response, services, auth, params }) {
      const result = await anggotaKloter(services, params[0], await auth.actor());
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? result.value : publicError(result));
    }
  },

  // Manifest CSV untuk tiket dan visa. Unduhan dicatat di jejak audit (tanpa nama).
  {
    method: 'GET',
    pattern: /^\/api\/departures\/([\w-]+)\/manifest\.csv$/,
    permission: 'departures.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const result = await anggotaKloter(services, params[0], actor);
      if (!result.ok) { json(response, result.status || 422, publicError(result)); return; }
      const lengkap = await services.registrationService.staffByRegistrationIds(result.value.items.map((item) => item.registrationId));
      const profil = new Map(lengkap.map((item) => [item.registrationId, item]));
      const rows = [['no', 'nomor_pendaftaran', 'nama', 'jenis_kelamin', 'tanggal_lahir', 'program', 'status', 'whatsapp', 'email', 'nama_wali', 'whatsapp_wali', 'kota', 'paspor', 'berkas_diterima']];
      result.value.items.forEach((item, index) => {
        const data = profil.get(item.registrationId);
        const applicant = (data && data.applicantProfile) || {};
        rows.push([
          index + 1, item.registrationId, item.applicantName, applicant.gender || '', applicant.birthDate || '',
          LABEL_PROGRAM[item.program] || item.program, item.statusLabel || item.status, item.phone, applicant.email || '',
          item.guardianName, item.guardianPhone, item.city, item.documents.passport, `${item.documents.accepted}/${item.documents.required}`
        ]);
      });
      await services.auditService.record({
        action: ACTIONS.DEPARTURE_MANIFEST_EXPORTED, actor, ip,
        entityType: 'departure-group', entityId: result.value.group.id,
        metadata: { jumlah: result.value.items.length }
      });
      const nama = result.value.group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kloter';
      csv(response, { filename: `manifest-${nama}.csv`, rows });
    }
  },

  // Menugaskan pendaftar ke kloter; departureGroupId null melepasnya.
  {
    method: 'PUT',
    pattern: new RegExp(`^/api/registrations/(${REGISTRATION_ID})/departure$`),
    permission: 'departures.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const result = await services.departureService.assign(params[0], body.departureGroupId || null, actor);
      if (result.ok && result.changed && result.value) {
        await services.eventNotifier.departureAssigned(params[0], await services.departureService.forApplicant(params[0]));
      }
      if (result.ok) {
        await services.auditService.record({ action: ACTIONS.REGISTRATION_DEPARTURE_ASSIGNED, actor, ip, entityType: 'registration', entityId: params[0], metadata: { departureGroupId: body.departureGroupId || null } });
      }
      json(response, result.ok ? 200 : (result.status || 422), result.ok ? { departure: result.value } : publicError(result));
    }
  }
];
