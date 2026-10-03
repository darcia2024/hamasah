const { csv, json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');
const { createReceiptPdf, receiptFileName } = require('../receipt-pdf.js');

module.exports = [
  {
    method: 'GET',
    pattern: /^\/api\/operations\/report\.csv$/,
    permission: 'operations.read',
    // ?dari=YYYY-MM&sampai=YYYY-MM membatasi tagihan menurut bulan terbit (WIB). Tanpa
    // keduanya, semua tagihan beserta visa dan inventaris (perilaku lama).
    async handler({ response, services, url }) {
      const dari = /^\d{4}-\d{2}$/.test(url.searchParams.get('dari') || '') ? url.searchParams.get('dari') : null;
      const sampai = /^\d{4}-\d{2}$/.test(url.searchParams.get('sampai') || '') ? url.searchParams.get('sampai') : null;
      const invoices = await services.operationsService.invoiceReport({ fromMonth: dari, toMonth: sampai });
      const rows = [['jenis', 'id', 'status', 'nomor', 'studentId', 'jumlah', 'tanggal', 'santri', 'keterangan', 'tanggal_lunas', 'nomor_kuitansi', 'tanggal_bayar', 'metode_bayar']];
      invoices.forEach((item) => rows.push([
        'invoice', item.id, item.status, item.number, item.studentId, item.amount, item.issuedAt,
        item.studentName || '', item.description, item.paidAt || '', item.receiptNumber || '',
        item.payment ? item.payment.paidOn : '', item.payment ? item.payment.method : ''
      ]));
      if (!dari && !sampai) {
        const data = await services.operationsService.list();
        data.visas.forEach((item) => rows.push(['visa', item.studentId, item.status, '', item.studentId, '', item.updatedAt]));
        data.inventory.forEach((item) => rows.push(['inventory', item.id, String(item.quantity), item.name, '', item.quantity, item.updatedAt]));
      }
      const akhiran = dari || sampai ? `-${dari || 'awal'}-sd-${sampai || 'kini'}` : '';
      csv(response, { filename: `laporan-operasional-hamasah${akhiran}.csv`, rows });
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
        studentId: query.get('studentId') || undefined,
        month: query.get('month') || undefined,
        sort: query.get('sort') || undefined,
        limit: query.get('limit'),
        offset: query.get('offset')
      }));
    }
  },

  // Pilihan santri aktif (id, nama, program) untuk formulir tagihan satuan dan visa.
  {
    method: 'GET',
    pattern: /^\/api\/operations\/pilihan-santri$/,
    permission: 'operations.read',
    async handler({ response, services, auth }) {
      const result = await services.operationsService.studentOptions(await auth.actor());
      json(response, result.ok ? 200 : (result.status || 403), result.ok ? { items: result.value } : publicError(result));
    }
  },
  // Angka utama keuangan untuk beranda, lonceng, dan kepala halaman keuangan.
  {
    method: 'GET',
    pattern: /^\/api\/operations\/ringkasan$/,
    permission: 'operations.read',
    async handler({ response, services, auth }) {
      const result = await services.operationsService.financeSummary(await auth.actor());
      json(response, result.ok ? 200 : (result.status || 403), result.ok ? result.value : publicError(result));
    }
  },
  {
    method: 'GET',
    pattern: /^\/api\/operations\/tunggakan$/,
    permission: 'operations.read',
    async handler({ response, services, auth }) {
      const result = await services.operationsService.arrears(await auth.actor());
      json(response, result.ok ? 200 : (result.status || 403), result.ok ? { items: result.value } : publicError(result));
    }
  },
  // Riwayat kejadian tagihan dari jejak audit.
  {
    method: 'GET',
    pattern: /^\/api\/operations\/riwayat$/,
    permission: 'operations.read',
    async handler({ response, services, auth, url }) {
      const result = await services.auditService.listFinance({ limit: url.searchParams.get('limit'), offset: url.searchParams.get('offset') }, await auth.actor());
      json(response, result.ok ? 200 : 403, result.ok ? result.value : publicError(result));
    }
  },
  // Pengingat tagihan ke wali lewat email, paling sering sekali per 24 jam per tagihan.
  {
    method: 'POST',
    pattern: /^\/api\/operations\/invoices\/([\w-]+)\/pengingat$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const siap = await services.operationsService.prepareReminder(params[0], actor);
      if (!siap.ok) { json(response, siap.status || 422, publicError(siap)); return; }
      if (!services.eventNotifier.tersedia || !services.eventNotifier.tersedia()) {
        json(response, 503, { error: 'Email belum aktif di server ini, jadi pengingat tidak dapat dikirim. Hubungi admin untuk memasang penyedia email.' });
        return;
      }
      const penerima = await services.eventNotifier.invoiceReminder(siap.value);
      if (!penerima) {
        json(response, 422, { error: 'Santri ini belum punya akun wali aktif yang terhubung, jadi pengingat tidak dapat dikirim.' });
        return;
      }
      const catatan = await services.operationsService.recordReminder(siap.value.id, actor, penerima);
      await services.auditService.record({
        action: ACTIONS.INVOICE_REMINDER_SENT, actor, ip,
        entityType: 'invoice', entityId: siap.value.id,
        metadata: { number: siap.value.number, penerima }
      });
      json(response, 201, { reminder: catatan, recipients: penerima });
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
      const body = await readBody();
      const created = await services.operationsService.createInvoice(body, await auth.actor());
      if (created.ok) {
        await services.auditService.record({
          action: ACTIONS.INVOICE_CREATED, actor: await auth.actor(), ip,
          entityType: 'invoice', entityId: created.value.id,
          metadata: { number: created.value.number, amount: created.value.amount, studentId: created.value.studentId }
        });
        if (!body || body.kirimEmail !== false) await services.eventNotifier.invoiceIssued([created.value]);
      }
      json(response, created.ok ? 201 : 422, created.ok ? { invoice: created.value } : publicError(created));
    }
  },

  // Pilihan program dan jumlah santri aktif untuk formulir tagihan massal.
  {
    method: 'GET',
    pattern: /^\/api\/operations\/invoices\/massal$/,
    permission: 'finance.manage',
    async handler({ response, services, auth }) {
      const hasil = await services.operationsService.bulkInvoiceOptions(await auth.actor());
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  // Tagihan massal untuk santri aktif. { terbitkan: false } hanya pratinjau.
  // Setiap tagihan tetap punya catatan INVOICE_CREATED sendiri (seperti tagihan satuan),
  // ditambah satu ringkasan INVOICE_BULK_CREATED.
  {
    method: 'POST',
    pattern: /^\/api\/operations\/invoices\/massal$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.operationsService.bulkInvoices(body, actor);
      const terbit = hasil.ok ? (hasil.value.invoices || []) : (hasil.invoices || []);
      for (const invoice of terbit) {
        await services.auditService.record({
          action: ACTIONS.INVOICE_CREATED, actor, ip,
          entityType: 'invoice', entityId: invoice.id,
          metadata: { number: invoice.number, amount: invoice.amount, studentId: invoice.studentId, massal: true }
        });
      }
      if (terbit.length) {
        await services.auditService.record({
          action: ACTIONS.INVOICE_BULK_CREATED, actor, ip,
          entityType: 'invoice', entityId: terbit[0].id,
          metadata: {
            jumlah: terbit.length,
            keterangan: terbit[0].description,
            nominal: terbit[0].amount,
            nomorAwal: terbit[0].number,
            nomorAkhir: terbit[terbit.length - 1].number
          }
        });
      }
      if (terbit.length && (!body || body.kirimEmail !== false)) await services.eventNotifier.invoiceIssued(terbit);
      if (!hasil.ok) {
        json(response, hasil.status || 422, publicError(hasil));
        return;
      }
      json(response, hasil.value.invoices ? 201 : 200, hasil.value);
    }
  },

  {
    method: 'PATCH',
    pattern: /^\/api\/operations\/invoices\/([\w-]+)\/paid$/,
    permission: 'finance.manage',
    async handler({ response, services, auth, params, ip, readBody }) {
      const paid = await services.operationsService.markInvoicePaid(params[0], await auth.actor(), await readBody());
      if (paid.ok) {
        await services.auditService.record({
          action: ACTIONS.INVOICE_PAID, actor: await auth.actor(), ip,
          entityType: 'invoice', entityId: paid.value.id,
          metadata: { number: paid.value.number, receiptNumber: paid.value.receiptNumber, amount: paid.value.amount, metode: paid.value.payment ? paid.value.payment.method : null }
        });
        if (paid.changed) await services.eventNotifier.invoicePaid(paid.value);
      }
      json(response, paid.ok ? 200 : 422, paid.ok ? { invoice: paid.value, paymentDetailSaved: paid.paymentDetailSaved } : publicError(paid));
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
