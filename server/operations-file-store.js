const fs = require('node:fs');
const path = require('node:path');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function createOperationsFileStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function read() {
    if (!fs.existsSync(filePath)) return { invoices: {}, inventory: {}, visas: {}, counters: {} };
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      invoices: data.invoices || {},
      inventory: data.inventory || {},
      visas: data.visas || {},
      counters: data.counters || {}
    };
  }

  function write(data) {
    const temporary = `${filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temporary, filePath);
  }

  function collection(name, keyOf) {
    return {
      async get(id) {
        const record = read()[name][id];
        return record ? clone(record) : null;
      },
      async list() {
        return Object.values(read()[name]).map(clone);
      },
      async save(value) {
        const data = read();
        data[name][keyOf(value)] = clone(value);
        write(data);
        return clone(value);
      }
    };
  }

  const invoices = collection('invoices', (value) => value.id);
  const visas = collection('visas', (value) => value.studentId);
  const inventory = collection('inventory', (value) => value.id);

  // Baca dan tulis berjalan tanpa await, jadi tidak ada permintaan lain yang menyela.
  async function nextSequence(scope, year) {
    const data = read();
    const key = `${scope}:${year}`;
    const next = (data.counters[key] || 0) + 1;
    data.counters[key] = next;
    write(data);
    return next;
  }

  return {
    nextSequence,
    getInvoice: invoices.get,
    listInvoices: invoices.list,
    saveInvoice: invoices.save,
    async markInvoicePaid(id, payment) {
      const data = read();
      const invoice = data.invoices[id];
      if (!invoice || invoice.status !== 'unpaid') return null;
      // Klaim dulu (baca, cek, tulis tanpa await di antaranya), baru ambil nomor kuitansi,
      // supaya permintaan kedua atas invoice yang sama langsung ditolak.
      data.invoices[id] = { ...clone(invoice), status: 'paid', paidAt: payment.paidAt, receiptNumber: null };
      write(data);
      const receiptNumber = payment.receiptNumberFor(await nextSequence('receipt', payment.year));
      const terbaru = read();
      terbaru.invoices[id].receiptNumber = receiptNumber;
      write(terbaru);
      return clone(terbaru.invoices[id]);
    },
    getVisa: visas.get,
    listVisas: visas.list,
    saveVisa: visas.save,
    listInventory: inventory.list,
    saveInventory: inventory.save
  };
}

module.exports = { createOperationsFileStore };
