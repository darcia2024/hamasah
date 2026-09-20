const crypto = require('node:crypto');

const FINANCE_ROLES = Object.freeze(['admin', 'finance']);
const VISA_STATUSES = Object.freeze(['not-started', 'collecting-documents', 'legalization', 'submitted', 'approved', 'expired']);
const FINANCE_TIME_ZONE = 'Asia/Jakarta';
const MAX_INVOICE_AMOUNT = 1000000000;

function clean(value) { return String(value || '').trim(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

// Tahun pada nomor dokumen mengikuti tanggal di Indonesia, bukan UTC.
function yearInJakarta(date) {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: FINANCE_TIME_ZONE, year: 'numeric' }).format(new Date(date)));
}

function documentNumber(prefix, sequence, year) {
  return `${prefix}/HI/${year}/${String(sequence).padStart(5, '0')}`;
}

// Antarmuka store operasional sama persis dengan postgres-operations-store.js.
function createMemoryOperationsStore() {
  const database = { invoices: {}, inventory: {}, visas: {}, visaDocuments: {}, visaHistory: {}, inventoryMovements: {}, corrections: {}, counters: {} };
  async function nextSequence(scope, year) {
    const key = `${scope}:${year}`;
    const next = (database.counters[key] || 0) + 1;
    database.counters[key] = next;
    return next;
  }
  return {
    nextSequence,
    async getInvoice(id) { return database.invoices[id] ? clone(database.invoices[id]) : null; },
    async listInvoices() { return Object.values(database.invoices).map(clone); },
    async saveInvoice(value) { database.invoices[value.id] = { version: 1, ...clone(value) }; return clone(database.invoices[value.id]); },
    async correctInvoice(id, correction) {
      const invoice = database.invoices[id];
      if (!invoice || invoice.status !== 'unpaid') return null;
      const previous = clone(invoice);
      database.invoices[id] = { ...invoice, description: correction.description, amount: correction.amount, version: (invoice.version || 1) + 1 };
      database.corrections[correction.id] = { ...correction, invoiceId: id, previousDescription: previous.description, previousAmount: previous.amount };
      return clone(database.invoices[id]);
    },
    async voidInvoice(id, value) {
      const invoice = database.invoices[id];
      if (!invoice || invoice.status !== 'unpaid') return null;
      database.invoices[id] = { ...invoice, status: 'voided', voidedAt: value.voidedAt, voidReason: value.reason, version: (invoice.version || 1) + 1 };
      return clone(database.invoices[id]);
    },
    async markInvoicePaid(id, payment) {
      const invoice = database.invoices[id];
      if (!invoice || invoice.status !== 'unpaid') return null;
      // Status diubah lebih dulu tanpa await, meniru UPDATE ... WHERE status = 'unpaid'
      // di PostgreSQL. Kalau nomor diambil lebih dulu, permintaan kedua sempat menyela
      // di titik await dan invoice yang sama mendapat dua nomor kuitansi.
      database.invoices[id] = { ...clone(invoice), status: 'paid', paidAt: payment.paidAt, receiptNumber: null };
      const sequence = await nextSequence('receipt', payment.year);
      database.invoices[id].receiptNumber = payment.receiptNumberFor(sequence);
      return clone(database.invoices[id]);
    },
    async getVisa(studentId) { return database.visas[studentId] ? clone(database.visas[studentId]) : null; },
    async listVisas() { return Object.values(database.visas).map(clone); },
    async saveVisa(value) { database.visas[value.studentId] = clone(value); (database.visaHistory[value.studentId] ||= []).push(clone(value)); return clone(value); },
    async saveVisaDocument(value) { database.visaDocuments[value.id] = clone(value); return clone(value); },
    async listVisaDocuments(studentId) { return Object.values(database.visaDocuments).filter((item) => !studentId || item.studentId === studentId).map(clone); },
    async listVisaHistory(studentId) { return (database.visaHistory[studentId] || []).map(clone).reverse(); },
    async listInventory() { return Object.values(database.inventory).map(clone); },
    async saveInventory(value) { database.inventory[value.id] = { version: 1, ...clone(value) }; return clone(database.inventory[value.id]); },
    async applyInventoryMovement(id, movement) {
      const item = database.inventory[id]; if (!item) return null;
      const delta = movement.direction === 'in' ? movement.quantity : movement.direction === 'out' ? -movement.quantity : movement.delta;
      const quantity = item.quantity + delta; if (quantity < 0) return { error: 'Stok tidak boleh negatif.' };
      database.inventory[id] = { ...item, quantity, version: (item.version || 1) + 1, updatedAt: movement.createdAt };
      database.inventoryMovements[movement.id] = { ...movement, inventoryItemId: id, delta };
      return { item: clone(database.inventory[id]), movement: clone(database.inventoryMovements[movement.id]) };
    }
  };
}

function createOperationsService(options) {
  const config = options || {};
  const store = config.store || createMemoryOperationsStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };
  const studentExists = config.studentExists || async function missingStudent() { return false; };

  // Harus sepadan dengan izin finance.manage dan operations.manage di server/access-policy.js.
  function adminOnly(actor) { return Boolean(actor && FINANCE_ROLES.includes(actor.role)); }

  async function createInvoice(input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {};
    const studentId = clean(source.studentId);
    const description = clean(source.description);
    const amount = Number(source.amount);
    // Wajib di-await. Tanpa await, Promise selalu bernilai benar dan invoice bisa dibuat
    // untuk santri yang tidak ada.
    const santriAda = Boolean(await studentExists(studentId));
    if (!santriAda || description.length < 3 || !Number.isInteger(amount) || amount <= 0 || amount > MAX_INVOICE_AMOUNT) {
      return { ok: false, error: 'Data invoice belum valid.' };
    }

    const issuedAt = now();
    const year = yearInJakarta(issuedAt);
    const sequence = await store.nextSequence('invoice', year);
    const invoice = await store.saveInvoice({
      id: crypto.randomUUID(),
      number: documentNumber('INV', sequence, year),
      studentId,
      description,
      amount,
      status: 'unpaid',
      issuedAt,
      paidAt: null,
      receiptNumber: null
    });
    return { ok: true, value: invoice };
  }

  async function markInvoicePaid(invoiceId, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const invoice = await store.getInvoice(invoiceId);
    if (!invoice) return { ok: false, error: 'Invoice tidak ditemukan.' };
    if (invoice.status === 'paid') return { ok: true, value: invoice };

    const paidAt = now();
    const year = yearInJakarta(paidAt);
    // markInvoicePaid hanya berhasil jika invoice masih berstatus unpaid, sehingga dua
    // permintaan bersamaan tidak menghasilkan dua nomor kuitansi untuk invoice yang sama.
    // Nomor diambil di dalam store, dalam perubahan status yang sama, supaya nomor
    // kuitansi tidak terpakai sia-sia dan penomoran resmi tidak berlubang.
    const paid = await store.markInvoicePaid(invoiceId, {
      paidAt,
      year,
      receiptNumberFor: (sequence) => documentNumber('KWT', sequence, year)
    });
    if (!paid) {
      const terkini = await store.getInvoice(invoiceId);
      return terkini ? { ok: true, value: terkini } : { ok: false, error: 'Invoice tidak ditemukan.' };
    }
    return { ok: true, value: paid };
  }

  async function correctInvoice(invoiceId, input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {};
    const description = clean(source.description);
    const amount = Number(source.amount);
    const reason = clean(source.reason);
    if (description.length < 3 || !Number.isInteger(amount) || amount <= 0 || amount > MAX_INVOICE_AMOUNT || reason.length < 5) {
      return { ok: false, error: 'Koreksi invoice belum valid.' };
    }
    const updated = await store.correctInvoice(invoiceId, { id: crypto.randomUUID(), description, amount, reason, actorAccountId: actor.id || null, createdAt: now() });
    return updated ? { ok: true, value: updated } : { ok: false, error: 'Invoice tidak ditemukan atau sudah tidak dapat dikoreksi.' };
  }

  async function voidInvoice(invoiceId, input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const reason = clean(input && input.reason);
    if (reason.length < 5) return { ok: false, error: 'Alasan pembatalan wajib diisi.' };
    const updated = await store.voidInvoice(invoiceId, { reason, voidedAt: now(), actorAccountId: actor.id || null });
    return updated ? { ok: true, value: updated } : { ok: false, error: 'Invoice tidak ditemukan atau sudah tidak dapat dibatalkan.' };
  }

  async function saveVisa(input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {};
    const studentId = clean(source.studentId);
    const status = clean(source.status);
    if (!(await studentExists(studentId)) || !VISA_STATUSES.includes(status)) {
      return { ok: false, error: 'Status visa atau santri tidak valid.' };
    }
    const saved = await store.saveVisa({
      studentId,
      status,
      passportExpiresAt: clean(source.passportExpiresAt) || null,
      visaExpiresAt: clean(source.visaExpiresAt) || null,
      note: clean(source.note),
      actorAccountId: actor.id || null,
      updatedAt: now()
    });
    return { ok: true, value: saved };
  }

  async function saveVisaDocument(input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {};
    const studentId = clean(source.studentId);
    const documentType = clean(source.documentType);
    if (!(await studentExists(studentId)) || !['passport', 'visa', 'residence', 'other'].includes(documentType) || !clean(source.fileObjectId)) {
      return { ok: false, error: 'Dokumen visa belum valid.' };
    }
    const value = { id: crypto.randomUUID(), studentId, fileObjectId: clean(source.fileObjectId), documentType, expiresAt: clean(source.expiresAt) || null, note: clean(source.note), uploadedAt: now() };
    return { ok: true, value: await store.saveVisaDocument(value) };
  }

  async function saveInventory(input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {};
    const name = clean(source.name);
    const location = clean(source.location);
    const quantity = Number(source.quantity);
    if (name.length < 2 || location.length < 2 || !Number.isInteger(quantity) || quantity < 0) {
      return { ok: false, error: 'Data inventaris belum valid.' };
    }
    const saved = await store.saveInventory({
      id: clean(source.id) || crypto.randomUUID(),
      name,
      location,
      quantity,
      updatedAt: now()
    });
    return { ok: true, value: saved };
  }

  async function moveInventory(itemId, input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const source = input || {};
    const direction = clean(source.direction);
    const quantity = Number(source.quantity);
    const reason = clean(source.reason);
    if (!['in', 'out', 'correction'].includes(direction) || !Number.isInteger(quantity) || quantity <= 0 || reason.length < 3) {
      return { ok: false, error: 'Mutasi inventaris belum valid.' };
    }
    const delta = direction === 'in' ? quantity : direction === 'out' ? -quantity : Number(source.delta);
    if (direction === 'correction' && (!Number.isInteger(delta) || delta === 0)) return { ok: false, error: 'Koreksi stok harus memiliki delta.' };
    const result = await store.applyInventoryMovement(itemId, { id: crypto.randomUUID(), direction, quantity, delta, reason, actorAccountId: actor.id || null, createdAt: now() });
    if (!result) return { ok: false, error: 'Barang inventaris tidak ditemukan.' };
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, value: result };
  }

  async function list() {
    const [invoices, visas, inventory] = await Promise.all([store.listInvoices(), store.listVisas(), store.listInventory()]);
    return {
      invoices: invoices.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
      visas,
      inventory: inventory.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'))
    };
  }

  return Object.freeze({ createInvoice, createMemoryOperationsStore, correctInvoice, list, markInvoicePaid, moveInventory, saveInventory, saveVisa, saveVisaDocument, voidInvoice });
}

module.exports = { MAX_INVOICE_AMOUNT, VISA_STATUSES, createMemoryOperationsStore, createOperationsService, documentNumber, yearInJakarta };
