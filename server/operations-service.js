const crypto = require('node:crypto');

const VISA_STATUSES = Object.freeze(['not-started', 'collecting-documents', 'legalization', 'submitted', 'approved', 'expired']);

function clean(value) { return String(value || '').trim(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function invoiceNumber(prefix, sequence, date) {
  const year = new Date(date).getUTCFullYear();
  return `${prefix}/HI/${year}/${String(sequence).padStart(5, '0')}`;
}

function createMemoryOperationsStore() {
  const database = { invoices: {}, inventory: {}, visas: {} };
  return {
    getInvoice(id) { return database.invoices[id] ? clone(database.invoices[id]) : null; },
    listInvoices() { return Object.values(database.invoices).map(clone); },
    saveInvoice(value) { database.invoices[value.id] = clone(value); return clone(value); },
    getVisa(studentId) { return database.visas[studentId] ? clone(database.visas[studentId]) : null; },
    listVisas() { return Object.values(database.visas).map(clone); },
    saveVisa(value) { database.visas[value.studentId] = clone(value); return clone(value); },
    listInventory() { return Object.values(database.inventory).map(clone); },
    saveInventory(value) { database.inventory[value.id] = clone(value); return clone(value); }
  };
}

function createOperationsService(options) {
  const config = options || {};
  const store = config.store || createMemoryOperationsStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };
  const studentExists = config.studentExists || function missingStudent() { return false; };

  function adminOnly(actor) { return actor && actor.role === 'admin'; }

  function createInvoice(input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {};
    const studentId = clean(source.studentId); const description = clean(source.description); const amount = Number(source.amount);
    if (!studentExists(studentId) || description.length < 3 || !Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'Data invoice belum valid.' };
    const issuedAt = now();
    const invoice = store.saveInvoice({ id: crypto.randomUUID(), number: invoiceNumber('INV', store.listInvoices().length + 1, issuedAt), studentId, description, amount, status: 'unpaid', issuedAt, paidAt: null, receiptNumber: null });
    return { ok: true, value: invoice };
  }

  function markInvoicePaid(invoiceId, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const invoice = store.getInvoice(invoiceId);
    if (!invoice) return { ok: false, error: 'Invoice tidak ditemukan.' };
    if (invoice.status === 'paid') return { ok: true, value: invoice };
    const paidAt = now();
    const saved = store.saveInvoice({ ...invoice, status: 'paid', paidAt, receiptNumber: invoiceNumber('KWT', store.listInvoices().filter((item) => item.status === 'paid').length + 1, paidAt) });
    return { ok: true, value: saved };
  }

  function saveVisa(input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {}; const studentId = clean(source.studentId); const status = clean(source.status);
    if (!studentExists(studentId) || !VISA_STATUSES.includes(status)) return { ok: false, error: 'Status visa atau santri tidak valid.' };
    const saved = store.saveVisa({ studentId, status, passportExpiresAt: clean(source.passportExpiresAt) || null, visaExpiresAt: clean(source.visaExpiresAt) || null, note: clean(source.note), updatedAt: now() });
    return { ok: true, value: saved };
  }

  function saveInventory(input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {}; const name = clean(source.name); const location = clean(source.location); const quantity = Number(source.quantity);
    if (name.length < 2 || location.length < 2 || !Number.isInteger(quantity) || quantity < 0) return { ok: false, error: 'Data inventaris belum valid.' };
    const saved = store.saveInventory({ id: clean(source.id) || crypto.randomUUID(), name, location, quantity, updatedAt: now() });
    return { ok: true, value: saved };
  }

  function list() {
    return { invoices: store.listInvoices().sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), visas: store.listVisas(), inventory: store.listInventory().sort((a, b) => a.name.localeCompare(b.name, 'id-ID')) };
  }

  return Object.freeze({ createInvoice, createMemoryOperationsStore, list, markInvoicePaid, saveInventory, saveVisa });
}

module.exports = { VISA_STATUSES, createMemoryOperationsStore, createOperationsService, invoiceNumber };
