const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

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
    method: 'GET',
    pattern: /^\/api\/operations\/visa-reminders$/,
    permission: 'operations.read',
    async handler({ response, services, auth, url }) {
      const result = await services.operationsService.visaReminders({ days: url.searchParams.get('days') }, await auth.actor());
      json(response, result.ok ? 200 : 422, result.ok ? { items: result.value } : publicError(result));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/operations\/invoices$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const created = await services.operationsService.createInvoice(await readBody(), await auth.actor());
      if (created.ok) {
        await services.auditService.record({
          action: ACTIONS.INVOICE_CREATED, actor: await auth.actor(), ip,
          entityType: 'invoice', entityId: created.value.id,
          metadata: { number: created.value.number, amount: created.value.amount, studentId: created.value.studentId }
        });
      }
      json(response, created.ok ? 201 : 422, created.ok ? { invoice: created.value } : publicError(created));
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/operations\/invoices\/([\w-]+)\/paid$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, params, ip }) {
      const paid = await services.operationsService.markInvoicePaid(params[0], await auth.actor());
      if (paid.ok) {
        await services.auditService.record({
          action: ACTIONS.INVOICE_PAID, actor: await auth.actor(), ip,
          entityType: 'invoice', entityId: paid.value.id,
          metadata: { number: paid.value.number, receiptNumber: paid.value.receiptNumber, amount: paid.value.amount }
        });
      }
      json(response, paid.ok ? 200 : 422, paid.ok ? { invoice: paid.value } : publicError(paid));
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/operations\/invoices\/([\w-]+)\/correction$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const result = await services.operationsService.correctInvoice(params[0], await readBody(), await auth.actor());
      if (result.ok) await services.auditService.record({ action: ACTIONS.INVOICE_CORRECTED, actor: await auth.actor(), ip, entityType: 'invoice', entityId: result.value.id, metadata: { number: result.value.number, amount: result.value.amount } });
      json(response, result.ok ? 200 : 422, result.ok ? { invoice: result.value } : publicError(result));
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/operations\/invoices\/([\w-]+)\/void$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const result = await services.operationsService.voidInvoice(params[0], await readBody(), await auth.actor());
      if (result.ok) await services.auditService.record({ action: ACTIONS.INVOICE_VOIDED, actor: await auth.actor(), ip, entityType: 'invoice', entityId: result.value.id, metadata: { number: result.value.number } });
      json(response, result.ok ? 200 : 422, result.ok ? { invoice: result.value } : publicError(result));
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
    pattern: /^\/api\/operations\/visa-documents$/,
    permission: 'operations.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const result = await services.operationsService.saveVisaDocument(await readBody(), await auth.actor());
      if (result.ok) await services.auditService.record({ action: ACTIONS.VISA_DOCUMENT_ADDED, actor: await auth.actor(), ip, entityType: 'visa-document', entityId: result.value.id, metadata: { studentId: result.value.studentId, documentType: result.value.documentType } });
      json(response, result.ok ? 201 : 422, result.ok ? { document: result.value } : publicError(result));
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
  ,{
    method: 'POST',
    pattern: /^\/api\/operations\/inventory\/([\w-]+)\/movements$/,
    permission: 'operations.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const result = await services.operationsService.moveInventory(params[0], await readBody(), await auth.actor());
      if (result.ok) await services.auditService.record({ action: ACTIONS.INVENTORY_MOVED, actor: await auth.actor(), ip, entityType: 'inventory-item', entityId: params[0], metadata: { direction: result.value.movement.direction, quantity: result.value.movement.quantity } });
      json(response, result.ok ? 201 : 422, result.ok ? result.value : publicError(result));
    }
  }
];
