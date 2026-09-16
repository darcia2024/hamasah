const crypto = require('node:crypto');

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
  const database = { invoices: {}, inventory: {}, visas: {}, counters: {} };
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
    async saveInvoice(value) { database.invoices[value.id] = clone(value); return clone(value); },
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
    async saveVisa(value) { database.visas[value.studentId] = clone(value); return clone(value); },
    async listInventory() { return Object.values(database.inventory).map(clone); },
    async saveInventory(value) { database.inventory[value.id] = clone(value); return clone(value); }
  };
}

function createOperationsService(options) {
  const config = options || {};
  const store = config.store || createMemoryOperationsStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };
  const studentExists = config.studentExists || async function missingStudent() { return false; };

  function adminOnly(actor) { return Boolean(actor && actor.role === 'admin'); }

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
      updatedAt: now()
    });
    return { ok: true, value: saved };
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

  async function list() {
    const [invoices, visas, inventory] = await Promise.all([store.listInvoices(), store.listVisas(), store.listInventory()]);
    return {
      invoices: invoices.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
      visas,
      inventory: inventory.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'))
    };
  }

  return Object.freeze({ createInvoice, createMemoryOperationsStore, list, markInvoicePaid, saveInventory, saveVisa });
}

module.exports = { MAX_INVOICE_AMOUNT, VISA_STATUSES, createMemoryOperationsStore, createOperationsService, documentNumber, yearInJakarta };
