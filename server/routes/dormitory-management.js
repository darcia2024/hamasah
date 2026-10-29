const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Kelola Asrama (dormitory-management-service.js): jadwal kegiatan, agenda, piket, uang kas
// dan iuran, inventaris. Pengelola: musyrif asramanya dan admin. Keluarga: GET /api/asrama-saya.

function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
function pola(teks) {
  return new RegExp(`^${teks}$`);
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/galeri-publik$/,
    async handler({ response, services }) {
      response.setHeader('Cache-Control', 'public, max-age=300');
      json(response, 200, { items: await services.dormitoryManagementService.publicGallery() });
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/asrama$/,
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth }) {
      balas(response, await services.dormitoryManagementService.list(await auth.actor()));
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/asrama-saya$/,
    permission: 'dormitory-schedule.read',
    async handler({ response, services, auth }) {
      balas(response, await services.dormitoryManagementService.forFamily(await auth.actor()));
    }
  },
  {
    method: 'GET',
    pattern: pola(`\\/api\\/asrama\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, url }) {
      balas(response, await services.dormitoryManagementService.overview(params[0], await auth.actor(), { month: url.searchParams.get('bulan') }));
    }
  },

  // Jadwal kegiatan rutin dan agenda acara.
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/jadwal`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.addSchedule(params[0], await readBody(), await auth.actor()), 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/jadwal\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.updateSchedule(params[0], params[1], await readBody(), await auth.actor()));
    }
  },
  {
    method: 'DELETE',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/jadwal\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.dormitoryManagementService.deleteSchedule(params[0], params[1], await auth.actor()));
    }
  },

  // Piket.
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/piket\\/tugas`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.addDuty(params[0], await readBody(), await auth.actor()), 201);
    }
  },
  {
    method: 'DELETE',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/piket\\/tugas\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.dormitoryManagementService.deleteDuty(params[0], params[1], await auth.actor()));
    }
  },
  {
    method: 'PUT',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/piket`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.setDutyAssignments(params[0], await readBody(), await auth.actor()));
    }
  },

  // Uang kas dan iuran.
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/kas`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.addCash(params[0], await readBody(), await auth.actor()), 201);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/kas\\/${ID}\\/batal`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.voidCash(params[0], params[1], await readBody(), await auth.actor()));
    }
  },
  {
    method: 'PUT',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/iuran`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.setDues(params[0], await readBody(), await auth.actor()));
    }
  },

  // Inventaris.
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/inventaris`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.addInventory(params[0], await readBody(), await auth.actor()), 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/inventaris\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.updateInventory(params[0], params[1], await readBody(), await auth.actor()));
    }
  },
  {
    method: 'DELETE',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/inventaris\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.dormitoryManagementService.archiveInventory(params[0], params[1], await auth.actor()));
    }
  },

  // Galeri asrama: { fileId, mediaType, caption, takenOn, category, thumbFileId, audience, studentIds, publicConsentNote } dari unggahan 'dormitory-photo' atau 'dormitory-video'.
  // Daftar publik hanya memuat foto yang sudah disetujui (tanpa sesi, tanpa nama asrama atau santri).
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/galeri`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.dormitoryManagementService.addPhoto(params[0], await readBody(), await auth.actor()), 201);
    }
  },
  // Publikasi foto ke website: diajukan pengelola asrama dengan catatan persetujuan, diputuskan admin, bisa dicabut kapan saja.
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/galeri\\/${ID}\\/publikasi`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryManagementService.requestPublic(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.GALLERY_PUBLIC_REQUESTED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { galleryId: params[1] } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/galeri\\/${ID}\\/keputusan`),
    permission: 'gallery.publish',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryManagementService.decidePublic(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.GALLERY_PUBLIC_DECIDED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { galleryId: params[1], status: hasil.value.publicStatus } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/galeri\\/${ID}\\/cabut`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryManagementService.revokePublic(params[0], params[1], actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.GALLERY_PUBLIC_REVOKED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { galleryId: params[1] } });
      balas(response, hasil);
    }
  },
  {
    method: 'DELETE',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/galeri\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.dormitoryManagementService.archivePhoto(params[0], params[1], await auth.actor()));
    }
  }
];
