const { json, noContent, publicError } = require('../http/respond.js');

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/dormitories$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth }) {
      const hasil = await services.dormitoryService.list(await auth.actor());
      json(response, hasil.ok ? 200 : 403, hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/dormitories$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth, readBody }) {
      const dibuat = await services.dormitoryService.create(await readBody(), await auth.actor());
      json(response, dibuat.ok ? 201 : 422, dibuat.ok ? { dormitory: dibuat.value } : publicError(dibuat));
    }
  },

  // Menugaskan musyrif ke satu asrama.
  {
    method: 'POST',
    pattern: /^\/api\/dormitories\/([\w-]+)\/staff\/([\w-]+)$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth, params }) {
      const hasil = await services.dormitoryService.assign(params[0], params[1], await auth.actor());
      json(response, hasil.ok ? 201 : 422, hasil.ok ? { assignment: hasil.value } : publicError(hasil));
    }
  },

  {
    method: 'DELETE',
    pattern: /^\/api\/dormitories\/([\w-]+)\/staff\/([\w-]+)$/,
    permission: 'dormitories.manage',
    async handler({ response, services, auth, params }) {
      const hasil = await services.dormitoryService.unassign(params[0], params[1], await auth.actor());
      if (hasil.ok) {
        noContent(response);
        return;
      }
      json(response, 422, publicError(hasil));
    }
  }
];
