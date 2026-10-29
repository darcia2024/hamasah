const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Pengingat tagihan WhatsApp (whatsapp-reminder-service.js). Audit mencatat bahwa chat dibuka dan jumlah tagihannya,
// tidak pernah isi pesan atau nomor telepon.
function balas(response, hasil, sukses = 200) {
  json(response, hasil.ok ? sukses : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
}

const ID = '([\\w-]+)';
const pola = (teks) => new RegExp(`^${teks}$`);

module.exports = [
  { method: 'GET', pattern: pola('\\/api\\/pengingat-tagihan\\/pengaturan'), permission: 'reminders.manage', async handler({ response, services, auth }) { balas(response, await services.whatsappReminderService.getSettings(await auth.actor())); } },
  {
    method: 'PUT',
    pattern: pola('\\/api\\/pengingat-tagihan\\/pengaturan'),
    permission: 'reminders.manage',
    async handler({ response, services, auth, readBody, ip }) {
      const actor = await auth.actor();
      const body = await readBody();
      const hasil = await services.whatsappReminderService.updateSettings(body, actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.WA_REMINDER_SETTINGS_CHANGED, actor, ip, entityType: 'wa-reminder-settings', entityId: '1', metadata: { fields: Object.keys(body || {}).join(', ') } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola('\\/api\\/pengingat-tagihan\\/riwayat'), permission: 'reminders.manage', async handler({ response, services, auth, url }) { balas(response, await services.whatsappReminderService.history(await auth.actor(), { parentId: url.searchParams.get('parentId') || undefined })); } },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pengingat-tagihan\\/riwayat\\/${ID}\\/terkirim`),
    permission: 'reminders.manage',
    async handler({ response, services, auth, params, ip }) {
      const actor = await auth.actor();
      const hasil = await services.whatsappReminderService.confirmSent(params[0], actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.WA_REMINDER_CONFIRMED, actor, ip, entityType: 'wa-reminder', entityId: params[0], metadata: {} });
      balas(response, hasil);
    }
  },
  {
    method: 'PATCH',
    pattern: pola(`\\/api\\/pengingat-tagihan\\/tagihan\\/${ID}\\/jatuh-tempo`),
    permission: 'reminders.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.whatsappReminderService.setDueDate(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.INVOICE_DUE_DATE_SET, actor, ip, entityType: 'invoice', entityId: params[0], metadata: { dueOn: hasil.value.dueOn } });
      balas(response, hasil);
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pengingat-tagihan\\/wali\\/${ID}\\/pratinjau`),
    permission: 'reminders.manage',
    async handler({ response, services, auth, params, readBody }) {
      balas(response, await services.whatsappReminderService.preview(params[0], await readBody(), await auth.actor()));
    }
  },
  {
    method: 'POST',
    pattern: pola(`\\/api\\/pengingat-tagihan\\/wali\\/${ID}\\/buka`),
    permission: 'reminders.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.whatsappReminderService.open(params[0], await readBody(), actor);
      if (hasil.ok) await services.auditService.record({ action: ACTIONS.WA_REMINDER_OPENED, actor, ip, entityType: 'parent-account', entityId: params[0], metadata: { invoices: hasil.value.invoiceCount, forced: hasil.value.forced } });
      balas(response, hasil);
    }
  },
  { method: 'GET', pattern: pola('\\/api\\/pengingat-tagihan'), permission: 'reminders.manage', async handler({ response, services, auth, url }) {
    const q = url.searchParams;
    balas(response, await services.whatsappReminderService.listDebtors(await auth.actor(), { period: q.get('period') || undefined, due: q.get('due') || undefined, q: q.get('q') || undefined }));
  } }
];
