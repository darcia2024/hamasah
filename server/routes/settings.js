const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');
const { DEFINISI } = require('../settings-service.js');

// Isi jejak audit: kunci yang diubah, dan nilai barunya untuk saklar serta angka.
// Teks (misalnya pesan saat pendaftaran ditutup) cukup kuncinya saja.
function ringkasPerubahan(berubah, nilai) {
  return berubah.map((kunci) => (DEFINISI[kunci].jenis === 'teks' ? kunci : `${kunci}: ${nilai[kunci]}`));
}

// Halaman Pengaturan super admin. Lihat server/settings-service.js dan
// server/database-update-service.js.
module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/admin\/settings$/,
    permission: 'settings.manage',
    async handler({ response, services }) {
      const [pengaturan, database] = await Promise.all([
        services.settingsService.semua(),
        services.databaseUpdateService.status()
      ]);
      json(response, 200, { ...pengaturan, database });
    }
  },

  {
    method: 'PUT',
    pattern: /^\/api\/admin\/settings$/,
    permission: 'settings.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.settingsService.simpan(body && body.nilai, actor);
      if (hasil.ok && hasil.value.berubah.length) {
        await services.auditService.record({
          action: ACTIONS.SETTINGS_UPDATED, actor, ip,
          entityType: 'settings', entityId: 'app',
          metadata: { pengaturan: ringkasPerubahan(hasil.value.berubah, hasil.value.nilai) }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/admin\/settings\/database$/,
    permission: 'settings.manage',
    async handler({ response, services, auth, ip }) {
      const hasil = await services.databaseUpdateService.terapkan();
      const diterapkan = hasil.ok ? hasil.value.diterapkan : (hasil.diterapkan || []);
      if (diterapkan.length) {
        services.settingsService.lupakanCache();
        await services.auditService.record({
          action: ACTIONS.DATABASE_UPDATED, actor: await auth.actor(), ip,
          entityType: 'database', entityId: 'schema',
          metadata: { berkas: diterapkan }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  // Untuk halaman publik: apakah pendaftaran dibuka dan asisten website aktif. Tanpa login.
  {
    method: 'GET',
    pattern: /^\/api\/settings\/public$/,
    async handler({ response, services }) {
      json(response, 200, await services.settingsService.publik());
    }
  }
];
