const { csv, json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');
const { createReceiptPdf, receiptFileName } = require('../receipt-pdf.js');

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/operations\/report\.csv$/,
    permission: 'operations.read',
    async handler({ response, services }) {
      const data = await services.operationsService.list();
      const rows = [['jenis', 'id', 'status', 'nomor', 'studentId', 'jumlah', 'tanggal']];
      data.invoices.forEach((item) => rows.push(['invoice', item.id, item.status, item.number, item.studentId, item.amount, item.issuedAt]));
      data.visas.forEach((item) => rows.push(['visa', item.studentId, item.status, '', item.studentId, '', item.updatedAt]));
      data.inventory.forEach((item) => rows.push(['inventory', item.id, String(item.quantity), item.name, '', item.quantity, item.updatedAt]));
      csv(response, { filename: 'laporan-operasional-hamasah.csv', rows });
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/operations\/invoices\/([\w-]+)\/receipt\.pdf$/,
    permission: 'finance.manage',
    async handler({ response, services, params, auth }) {
      const invoice = await services.operationsService.getInvoice(params[0], await auth.actor());
      if (!invoice || invoice.status !== 'paid') { json(response, 404, { error: 'Kuitansi belum tersedia.' }); return; }
      const pdf = createReceiptPdf(invoice);
      response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${receiptFileName(invoice)}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(pdf);
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/operations$/,
    permission: 'operations.read',
    async handler({ response, services }) {
      json(response, 200, await services.operationsService.overview());
    }
  },

  // Daftar tagihan berpaginasi, dengan nama santri. Konsol keuangan tidak boleh membaca
  // daftar santri, jadi nama datang dari sini.
  {
    method: 'GET',
    pattern: /^\/api\/operations\/invoices$/,
    permission: 'operations.read',
    async handler({ response, services, url }) {
      const query = url.searchParams;
      json(response, 200, await services.operationsService.listInvoicesPage({
        status: query.get('status') || undefined,
        search: query.get('search') || undefined,
        limit: query.get('limit'),
        offset: query.get('offset')
      }));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/operations\/imports\/preview$/,
    permission: 'operations.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const result = await services.operationsImportService.preview(await readBody(), await auth.actor());
      if (result.ok) await services.auditService.record({ action: ACTIONS.OPERATION_IMPORT_PREVIEWED, actor: await auth.actor(), ip, entityType: 'operation-import', entityId: result.value.id, metadata: { entity: result.value.entity, rowCount: result.value.rowCount, validCount: result.value.validCount } });
      json(response, result.ok ? 201 : 422, result.ok ? { batch: result.value } : publicError(result));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/operations\/imports$/,
    permission: 'operations.read',
    async handler({ response, services, auth, url }) {
      const result = await services.operationsImportService.listBatches({ page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize'), entity: url.searchParams.get('entity'), status: url.searchParams.get('status') }, await auth.actor());
      json(response, result.ok ? 200 : 422, result.ok ? result.value : publicError(result));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/operations\/imports\/([\w-]+)\/commit$/,
    permission: 'operations.manage',
    async handler({ response, services, auth, params, ip }) {
      const result = await services.operationsImportService.commit(params[0], await auth.actor());
      if (result.ok) await services.auditService.record({ action: ACTIONS.OPERATION_IMPORT_COMMITTED, actor: await auth.actor(), ip, entityType: 'operation-import', entityId: params[0], metadata: { status: result.value.status } });
      json(response, result.ok ? 200 : 422, result.ok ? { batch: result.value } : publicError(result));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/operations\/imports\/([\w-]+)\/rollback$/,
    permission: 'operations.manage',
    async handler({ response, services, auth, params, ip }) {
      const result = await services.operationsImportService.rollback(params[0], await auth.actor());
      if (result.ok) await services.auditService.record({ action: ACTIONS.OPERATION_IMPORT_ROLLED_BACK, actor: await auth.actor(), ip, entityType: 'operation-import', entityId: params[0], metadata: { status: result.value.status } });
      json(response, result.ok ? 200 : 422, result.ok ? { batch: result.value } : publicError(result));
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
        if (paid.changed) await services.eventNotifier.invoicePaid(paid.value);
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
    method: 'GET',
    pattern: /^\/api\/operations\/invoices\/([\w-]+)\/corrections$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, params }) {
      const result = await services.operationsService.listInvoiceCorrections(params[0], await auth.actor());
      json(response, result.ok ? 200 : 403, result.ok ? { items: result.value } : publicError(result));
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
    method: 'GET',
    pattern: /^\/api\/operations\/visa-documents$/,
    permission: 'operations.read',
    async handler({ response, services, auth, url }) {
      const result = await services.operationsService.listVisaDocuments(url.searchParams.get('studentId'), await auth.actor());
      json(response, result.ok ? 200 : 403, result.ok ? { items: result.value } : publicError(result));
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
    method: 'GET',
    pattern: /^\/api\/operations\/inventory\/([\w-]+)\/movements$/,
    permission: 'operations.read',
    async handler({ response, services, auth, params }) {
      const result = await services.operationsService.listInventoryMovements(params[0], await auth.actor());
      json(response, result.ok ? 200 : 403, result.ok ? { items: result.value } : publicError(result));
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
