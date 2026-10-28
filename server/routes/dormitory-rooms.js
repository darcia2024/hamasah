const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Struktur kamar dan penempatan santri (dormitory-room-service.js). Musyrif hanya menyentuh asrama
// yang dipegangnya; admin semuanya. Audit mencatat id dan hasil pemindahan, bukan alasannya.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  {
    method: 'GET',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/kamar`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.dormitoryRoomService.overview(params[0], await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/kamar`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryRoomService.createRoom(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.DORMITORY_ROOM_SAVED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { roomId: hasil.value.id, change: 'dibuat' } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/kamar\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryRoomService.updateRoom(params[0], params[1], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.DORMITORY_ROOM_SAVED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { roomId: params[1], change: 'diubah' } });
      balas(response, hasil);
    }
  },
  {
    method: 'DELETE',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/kamar\\/${ID}`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryRoomService.deleteRoom(params[0], params[1], actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.DORMITORY_ROOM_SAVED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { roomId: params[1], change: 'dihapus' } });
      balas(response, hasil);
    }
  },

  // Urusan administrasi penghuni asrama ini saja.
  {
    method: 'GET',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/masalah`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params }) {
      balas(response, await services.centralMonitoringService.dormitoryCases(params[0], await auth.actor()));
    }
  },

  // Tempatkan atau pindahkan santri: { dormitoryId, roomId, reason }.
  {
    method: 'POST',
    pattern: pola(`\\/api\\/students\\/${ID}\\/kamar`),
    permission: 'dormitory-management.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryRoomService.placeStudent(params[0], await readBody(), actor);
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.STUDENT_PLACEMENT_CHANGED, actor, ip, entityType: 'student', entityId: params[0],
          metadata: { crossDormitory: hasil.value.crossDormitory }
        });
      }
      balas(response, hasil);
    }
  },

  // Lokasi (admin): daftar, buat, dan tempel asrama ke lokasi.
  {
    method: 'GET',
    pattern: /^\/api\/lokasi$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth }) {
      balas(response, await services.dormitoryRoomService.listLocations(await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/lokasi$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryRoomService.createLocation(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.DORMITORY_ROOM_SAVED, actor, ip, entityType: 'location', entityId: hasil.value.id, metadata: { change: 'lokasi-dibuat' } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'PUT',
    pattern: pola(`\\/api\\/asrama\\/${ID}\\/lokasi`),
    permission: 'dormitories.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.dormitoryRoomService.setDormitoryLocation(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.DORMITORY_ROOM_SAVED, actor, ip, entityType: 'dormitory', entityId: params[0], metadata: { change: 'lokasi-diubah' } });
      balas(response, hasil);
    }
  }
];
