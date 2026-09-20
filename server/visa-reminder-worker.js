'use strict';

function reminderKey(item) { return `${item.studentId}:${item.document}:${item.expiresAt}`; }

function createVisaReminderWorker({ operationsService, notify = async () => ({ ok: true }), now = () => new Date(), days = 30, stateStore = null } = {}) {
  if (!operationsService || typeof operationsService.visaReminders !== 'function') throw new Error('createVisaReminderWorker membutuhkan operationsService.');
  const sent = new Set();
  let loaded = false;
  async function loadState() {
    if (loaded) return;
    loaded = true;
    if (!stateStore || typeof stateStore.load !== 'function') return;
    const keys = await stateStore.load();
    if (Array.isArray(keys)) keys.forEach((key) => sent.add(key));
  }
  async function saveState() {
    if (stateStore && typeof stateStore.save === 'function') await stateStore.save([...sent]);
  }
  async function runOnce(actor) {
    await loadState();
    const result = await operationsService.visaReminders({ days }, actor);
    if (!result.ok) return result;
    const due = [];
    for (const item of result.value) {
      const key = reminderKey(item);
      if (sent.has(key)) continue;
      const notification = await notify({ ...item, key, generatedAt: now().toISOString() });
      if (notification && notification.ok !== false) { sent.add(key); due.push(item); await saveState(); }
    }
    return { ok: true, value: { scanned: result.value.length, notified: due } };
  }
  return Object.freeze({ runOnce, reminderKey });
}

module.exports = { createVisaReminderWorker, reminderKey };
