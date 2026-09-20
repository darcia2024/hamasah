'use strict';

function reminderKey(item) { return `${item.studentId}:${item.document}:${item.expiresAt}`; }

function createVisaReminderWorker({ operationsService, notify = async () => ({ ok: true }), now = () => new Date(), days = 30 } = {}) {
  if (!operationsService || typeof operationsService.visaReminders !== 'function') throw new Error('createVisaReminderWorker membutuhkan operationsService.');
  const sent = new Set();
  async function runOnce(actor) {
    const result = await operationsService.visaReminders({ days }, actor);
    if (!result.ok) return result;
    const due = [];
    for (const item of result.value) {
      const key = reminderKey(item);
      if (sent.has(key)) continue;
      const notification = await notify({ ...item, key, generatedAt: now().toISOString() });
      if (notification && notification.ok !== false) { sent.add(key); due.push(item); }
    }
    return { ok: true, value: { scanned: result.value.length, notified: due } };
  }
  return Object.freeze({ runOnce, reminderKey });
}

module.exports = { createVisaReminderWorker, reminderKey };
