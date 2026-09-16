const { json, publicError } = require('../http/respond.js');

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/operations$/,
    permission: 'operations.read',
    async handler({ response, services }) {
      json(response, 200, await services.operationsService.list());
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/operations\/invoices$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, readBody }) {
      const created = await services.operationsService.createInvoice(await readBody(), await auth.actor());
      json(response, created.ok ? 201 : 422, created.ok ? { invoice: created.value } : publicError(created));
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/operations\/invoices\/([\w-]+)\/paid$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, params }) {
      const paid = await services.operationsService.markInvoicePaid(params[0], await auth.actor());
      json(response, paid.ok ? 200 : 422, paid.ok ? { invoice: paid.value } : publicError(paid));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/operations\/visas$/,
    permission: 'operations.manage',
    async handler({ response, services, auth, readBody }) {
      const saved = await services.operationsService.saveVisa(await readBody(), await auth.actor());
      json(response, saved.ok ? 201 : 422, saved.ok ? { visa: saved.value } : publicError(saved));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/operations\/inventory$/,
    permission: 'operations.manage',
    async handler({ response, services, auth, readBody }) {
      const saved = await services.operationsService.saveInventory(await readBody(), await auth.actor());
      json(response, saved.ok ? 201 : 422, saved.ok ? { item: saved.value } : publicError(saved));
    }
  }
];
