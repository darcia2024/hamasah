const fs = require('node:fs'); const path = require('node:path');
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function createOperationsFileStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  function read() { if (!fs.existsSync(filePath)) return { invoices: {}, inventory: {}, visas: {} }; const data = JSON.parse(fs.readFileSync(filePath, 'utf8')); return { invoices: data.invoices || {}, inventory: data.inventory || {}, visas: data.visas || {} }; }
  function write(data) { const temporary = `${filePath}.tmp`; fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8'); fs.renameSync(temporary, filePath); }
  function collection(name) { return { get(id) { const record = read()[name][id]; return record ? clone(record) : null; }, list() { return Object.values(read()[name]).map(clone); }, save(value) { const data = read(); const key = name === 'visas' ? value.studentId : value.id; data[name][key] = clone(value); write(data); return clone(value); } }; }
  const invoices = collection('invoices'); const visas = collection('visas'); const inventory = collection('inventory');
  return { getInvoice: invoices.get, listInvoices: invoices.list, saveInvoice: invoices.save, getVisa: visas.get, listVisas: visas.list, saveVisa: visas.save, listInventory: inventory.list, saveInventory: inventory.save };
}
module.exports = { createOperationsFileStore };
