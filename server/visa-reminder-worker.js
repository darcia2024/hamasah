'use strict';
// Pengingat dokumen visa dan paspor yang mendekati atau melewati kedaluwarsa (Task R8.2).
//
// Satu putaran mengumpulkan pengingat yang belum pernah dikirim lalu menyerahkannya ke
// `notify(items)` sekaligus. Item baru ditandai terkirim hanya bila notify berhasil. Tanpa
// notify, putaran dilaporkan gagal: sebelumnya default-nya fungsi kosong yang mengembalikan
// { ok: true }, sehingga item ditandai terkirim padahal tidak ada yang dikirim.

function reminderKey(item) { return `${item.studentId}:${item.document}:${item.expiresAt}`; }

function createVisaReminderWorker({ operationsService, notify = null, now = () => new Date(), days = 30, stateStore = null } = {}) {
  if (!operationsService || typeof operationsService.visaReminders !== 'function') throw new Error('createVisaReminderWorker membutuhkan operationsService.');
  const sent = new Set();
  let loaded = false;
  async function loadState() {
    if (loaded) return;
    if (stateStore && typeof stateStore.load === 'function') {
      const keys = await stateStore.load();
      if (Array.isArray(keys)) keys.forEach((key) => sent.add(key));
    }
    loaded = true;
  }
  async function runOnce(actor) {
    await loadState();
    const result = await operationsService.visaReminders({ days }, actor);
    if (!result.ok) return result;
    const fresh = result.value.filter((item) => !sent.has(reminderKey(item)));
    const scanned = result.value.length;
    if (fresh.length === 0) return { ok: true, value: { scanned, notified: [] } };
    if (typeof notify !== 'function') {
      return { ok: false, error: 'Pengirim notifikasi belum dikonfigurasi; tidak ada pengingat yang dikirim.', value: { scanned, pending: fresh.length } };
    }
    const generatedAt = now().toISOString();
    let outcome;
    try {
      outcome = await notify(fresh.map((item) => ({ ...item, key: reminderKey(item), generatedAt })));
    } catch (error) {
      outcome = { ok: false, error: error.message };
    }
    if (!outcome || outcome.ok === false) {
      return { ok: false, error: (outcome && outcome.error) || 'Pengingat gagal dikirim.', value: { scanned, pending: fresh.length } };
    }
    const keys = fresh.map(reminderKey);
    keys.forEach((key) => sent.add(key));
    if (stateStore && typeof stateStore.save === 'function') await stateStore.save(keys);
    return { ok: true, value: { scanned, notified: fresh } };
  }
  return Object.freeze({ runOnce, reminderKey });
}

module.exports = { createVisaReminderWorker, reminderKey };
