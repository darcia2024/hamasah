const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Presensi per asrama (server/dormitory-roll-service.js). Musyrif hanya asrama yang
// dipegang, admin semua. Audit mencatat satu ringkasan per penyimpanan, tanpa nama santri.
async function catat(services, actor, ip, jenis, input, hasil) {
  if (!hasil.ok || !hasil.value.tersimpan) return;
  await services.auditService.record({
    action: ACTIONS.DORMITORY_ROLL_RECORDED, actor, ip,
    entityType: 'dormitory', entityId: String((input && input.dormitoryId) || 'tanpa-asrama'),
    metadata: {
      jenis,
      tanggal: String(input.date || ''),
      sesi: String(jenis === 'sholat' ? input.prayer || '' : input.category || '').slice(0, 80),
      tersimpan: hasil.value.tersimpan,
      gagal: hasil.value.gagal.length
    }
  });
}

module.exports = [
  // Ringkasan "Tugas hari ini" untuk beranda musyrif dan admin.
  {
    method: 'GET',
    pattern: /^\/api\/presensi-asrama\/hari-ini$/,
    permission: 'students.manage',
    async handler({ response, services, auth }) {
      const hasil = await services.dormitoryRollService.todaySummary(await auth.actor());
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  // ?mode=sholat|kegiatan&date=YYYY-MM-DD&prayer=subuh&category=...&dormitoryId=...
  {
    method: 'GET',
    pattern: /^\/api\/presensi-asrama$/,
    permission: 'students.manage',
    async handler({ response, services, auth, url }) {
      const q = url.searchParams;
      const hasil = await services.dormitoryRollService.roster(await auth.actor(), {
        mode: q.get('mode'), date: q.get('date'), prayer: q.get('prayer'), category: q.get('category'), dormitoryId: q.get('dormitoryId')
      });
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/presensi-asrama\/(sholat|kegiatan)$/,
    permission: 'students.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const input = await readBody();
      const hasil = params[0] === 'sholat'
        ? await services.dormitoryRollService.saveSholat(actor, input)
        : await services.dormitoryRollService.saveKegiatan(actor, input);
      await catat(services, actor, ip, params[0], input, hasil);
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  }
];
