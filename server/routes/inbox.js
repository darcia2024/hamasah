const { json, publicError } = require('../http/respond.js');

// Kotak pesan satu pintu untuk santri dan wali (inbox-service.js): pengumuman, pesan pembinaan, dan balasan masukan.
function balas(response, hasil) {
  json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/kotak-pesan$/,
    permission: 'inbox.read',
    async handler({ response, services, auth, url }) {
      balas(response, await services.inboxService.inboxFor(await auth.actor(), { limit: url.searchParams.get('limit') }));
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/kotak-pesan\/dibaca-semua$/,
    permission: 'inbox.read',
    async handler({ response, services, auth }) {
      balas(response, await services.inboxService.markAllRead(await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: /^\/api\/kotak-pesan\/(umum|pembinaan|masukan)\/([\w-]+)\/dibaca$/,
    permission: 'inbox.read',
    async handler({ response, services, auth, params }) {
      balas(response, await services.inboxService.markRead(params[0], params[1], await auth.actor()));
    }
  }
];
