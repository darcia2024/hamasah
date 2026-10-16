const { json, publicError } = require('../http/respond.js');

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
  }
];
