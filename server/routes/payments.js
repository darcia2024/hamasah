const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Integrasi pembayaran, tahap persiapan (payment-integration-service.js). Tidak menghubungi Xendit. Penerapan transaksi ke tagihan
// memakai jalur pelunasan resmi, termasuk efek sampingnya (audit, pembukaan kelas, notifikasi).
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  { method: 'GET', pattern: pola('\\/api\\/pembayaran\\/tautan'), permission: 'payment-link.read', async handler({ response, services, auth }) { balas(response, await services.paymentIntegrationService.getLink(await auth.actor())); } },
  { method: 'GET', pattern: pola('\\/api\\/pembayaran\\/pengaturan'), permission: 'payments.manage', async handler({ response, services, auth }) { balas(response, await services.paymentIntegrationService.getSettings(await auth.actor())); } },
  {
    method: 'PUT',
    pattern: pola('\\/api\\/pembayaran\\/pengaturan'),
    permission: 'payments.admin',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.paymentIntegrationService.updateSettings(body, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.PAYMENT_INTEGRATION_CHANGED, actor, ip, entityType: 'payment-integration', entityId: '1', metadata: { fields: Object.keys(body || {}).join(', '), mode: hasil.value.config.mode, decision: hasil.value.config.decision } });
      balas(response, hasil);
    }
  },
  {
    method: 'PUT',
    pattern: pola(`\\/api\\/pembayaran\\/audit\\/${ID}`),
    permission: 'payments.admin',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.paymentIntegrationService.updateAudit(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.PAYMENT_AUDIT_CHANGED, actor, ip, entityType: 'payment-audit', entityId: params[0], metadata: { status: hasil.value.status } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola('\\/api\\/pembayaran\\/transaksi'), permission: 'payments.manage', async handler({ response, services, auth, url }) { balas(response, await services.paymentIntegrationService.list(await auth.actor(), url.searchParams.get('status') || undefined)); } },
  {
    method: 'POST',
    pattern: pola('\\/api\\/pembayaran\\/transaksi'),
    permission: 'payments.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.paymentIntegrationService.record(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.EXTERNAL_PAYMENT_RECORDED, actor, ip, entityType: 'external-payment', entityId: hasil.value.id, metadata: { source: hasil.value.source } });
      balas(response, hasil, 201);
    }
  },
  {
    method: 'POST',
    pattern: pola('\\/api\\/pembayaran\\/impor'),
    permission: 'payments.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.paymentIntegrationService.importRows(await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.EXTERNAL_PAYMENT_RECORDED, actor, ip, entityType: 'external-payment', entityId: 'impor', metadata: { imported: hasil.value.imported, failed: hasil.value.failed } });
      balas(response, hasil);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/pembayaran\\/transaksi\\/${ID}\\/tagihan`),
    permission: 'payments.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.paymentIntegrationService.matchInvoice(params[0], await readBody(), await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pembayaran\\/transaksi\\/${ID}\\/terapkan`),
    permission: 'payments.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.paymentIntegrationService.apply(params[0], await readBody(), actor);
      if (hasil.ok) {
        const paid = hasil.paid;
        await services.auditService.record({ action: ACTIONS.EXTERNAL_PAYMENT_APPLIED, actor, ip, entityType: 'external-payment', entityId: params[0], metadata: { invoice: hasil.value.matchedInvoiceNumber } });
        if (paid && paid.ok && paid.value) {
          await services.auditService.record({ action: ACTIONS.INVOICE_PAID, actor, ip, entityType: 'invoice', entityId: paid.value.id, metadata: { number: paid.value.number, receiptNumber: paid.value.receiptNumber, amount: paid.value.amount, metode: paid.value.payment ? paid.value.payment.method : null } });
          const kelasDibuka = await services.courseShop.onInvoicePaid(paid.value.id);
          if (kelasDibuka) await services.auditService.record({ action: ACTIONS.COURSE_UNLOCKED, actor, ip, entityType: 'course', entityId: kelasDibuka, metadata: { number: paid.value.number } });
          if (paid.changed) await services.eventNotifier.invoicePaid(paid.value);
        }
      }
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pembayaran\\/transaksi\\/${ID}\\/tolak`),
    permission: 'payments.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.paymentIntegrationService.reject(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.EXTERNAL_PAYMENT_REJECTED, actor, ip, entityType: 'external-payment', entityId: params[0], metadata: {} });
      balas(response, hasil);
    }
  }
];
