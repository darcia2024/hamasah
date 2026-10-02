const crypto = require('node:crypto');
const { normalizePage } = require('./pagination.js');
const { kelompokProgram } = require('./admin-overview-service.js');

const FINANCE_ROLES = Object.freeze(['admin', 'finance']);
const VISA_STATUSES = Object.freeze(['not-started', 'collecting-documents', 'legalization', 'submitted', 'approved', 'expired']);
const FINANCE_TIME_ZONE = 'Asia/Jakarta';
const MAX_INVOICE_AMOUNT = 1000000000;
// Batas satu kali tagihan massal, supaya satu klik tidak menerbitkan ribuan tagihan.
const MAX_BULK_INVOICES = 500;
const BULK_SKIP_REASON = 'Sudah punya tagihan dengan keterangan yang sama.';

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
  const database = { invoices: {}, inventory: {}, visas: {}, visaDocuments: {}, visaHistory: {}, inventoryMovements: {}, corrections: {}, importBatches: {}, counters: {} };
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
    async studentIdsWithInvoiceDescription(description) {
      const kunci = String(description || '').trim().toLocaleLowerCase('id-ID');
      return [...new Set(Object.values(database.invoices)
        .filter((invoice) => invoice.status !== 'voided' && String(invoice.description).trim().toLocaleLowerCase('id-ID') === kunci)
        .map((invoice) => invoice.studentId))];
    },
    // Setara dengan listInvoicesPage milik store PostgreSQL, untuk test dan pengembangan.
    async listInvoicesPage({ status, search, studentId, limit, offset } = {}) {
      const kata = String(search || '').trim().toLocaleLowerCase('id-ID');
      const page = normalizePage({ limit, offset });
      const cocok = Object.values(database.invoices)
        .filter((invoice) => (!status || invoice.status === status) && (!studentId || invoice.studentId === studentId)
          && (!kata || `${invoice.number} ${invoice.description}`.toLocaleLowerCase('id-ID').includes(kata)))
        .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt) || left.id.localeCompare(right.id));
      return { items: cocok.slice(page.offset, page.offset + page.limit).map(clone), total: cocok.length };
    },
    async saveInvoice(value) { database.invoices[value.id] = { version: 1, ...clone(value) }; return clone(database.invoices[value.id]); },
    async correctInvoice(id, correction) {
      const invoice = database.invoices[id];
      if (!invoice || invoice.status !== 'unpaid') return null;
      const previous = clone(invoice);
      database.invoices[id] = { ...invoice, description: correction.description, amount: correction.amount, version: (invoice.version || 1) + 1 };
      database.corrections[correction.id] = { ...correction, invoiceId: id, previousDescription: previous.description, previousAmount: previous.amount };
      return clone(database.invoices[id]);
    },
    async listInvoiceCorrections(invoiceId) {
      return Object.values(database.corrections)
        .filter((item) => item.invoiceId === invoiceId)
        .map((item) => clone({
          id: item.id,
          reason: item.reason,
          previousDescription: item.previousDescription,
          previousAmount: item.previousAmount,
          correctedDescription: item.description,
          correctedAmount: item.amount,
          createdAt: item.createdAt,
          actorAccountId: item.actorAccountId || null,
          actorName: null
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    async listInventoryMovements(itemId) {
      return Object.values(database.inventoryMovements)
        .filter((item) => item.inventoryItemId === itemId)
        .map((item) => clone({
          id: item.id,
          direction: item.direction,
          quantity: item.quantity,
          reason: item.reason,
          createdAt: item.createdAt,
          actorAccountId: item.actorAccountId || null,
          actorName: null
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async applyInventoryMovement(id, movement) {
      const item = database.inventory[id]; if (!item) return null;
      const delta = movement.direction === 'in' ? movement.quantity : movement.direction === 'out' ? -movement.quantity : movement.delta;
      const quantity = item.quantity + delta; if (quantity < 0) return { error: 'Stok tidak boleh negatif.' };
      database.inventory[id] = { ...item, quantity, version: (item.version || 1) + 1, updatedAt: movement.createdAt };
      database.inventoryMovements[movement.id] = { ...movement, inventoryItemId: id, delta };
      return { item: clone(database.inventory[id]), movement: clone(database.inventoryMovements[movement.id]) };
    },
    async saveImportBatch(batch) { database.importBatches[batch.id] = clone(batch); return clone(batch); },
    async getImportBatch(id) { return database.importBatches[id] ? clone(database.importBatches[id]) : null; },
    async updateImportBatch(id, patch) { if (!database.importBatches[id]) return null; database.importBatches[id] = { ...database.importBatches[id], ...clone(patch) }; return clone(database.importBatches[id]); }
    ,async listImportBatches() { return Object.values(database.importBatches).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone); }
  };
}

function createOperationsService(options) {
  const config = options || {};
  const store = config.store || createMemoryOperationsStore();
  const now = config.now || function currentTime() { return new Date().toISOString(); };
  const studentExists = config.studentExists || async function missingStudent() { return false; };
  // Semua santri { id, name, program, status }, untuk tagihan massal. Diisi app.js.
  const listStudents = config.listStudents || async function noStudents() { return []; };
  // Satu tagihan massal pada satu waktu per instance; pengaman dobel tagih yang utama
  // tetap pemeriksaan keterangan yang sama di database.
  let massalBerjalan = false;
  // Wali melihat tagihan dan kuitansi santri yang terhubung dengannya (diinjeksi app: sama
  // dengan hak melihat dashboard santri itu). Tanpa injeksi, tidak ada wali yang boleh.
  // Wali dan santri: boleh melihat tagihan santri yang memang boleh mereka lihat
  // (wali: anaknya, santri: dirinya sendiri). Diisi app.js.
  const familyCanViewStudent = config.familyCanViewStudent || async function noFamilyAccess() { return false; };

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
    return { ok: true, value: await terbitkanInvoice(studentId, description, amount) };
  }

  // Nomor dan penyimpanan satu tagihan, sama untuk tagihan satuan dan massal.
  async function terbitkanInvoice(studentId, description, amount) {
    const issuedAt = now();
    const year = yearInJakarta(issuedAt);
    const sequence = await store.nextSequence('invoice', year);
    return store.saveInvoice({
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
  }

  // Pilihan program untuk formulir tagihan massal: kelompok program lebih dulu, lalu
  // program lengkap bila berbeda dari kelompoknya, masing-masing dengan jumlah santri aktif.
  async function bulkInvoiceOptions(actor) {
    if (!adminOnly(actor)) return { ok: false, status: 403, error: 'Akses admin atau keuangan diperlukan.' };
    const aktif = (await listStudents()).filter((student) => student.status === 'active');
    const hitung = (daftar) => [...daftar.reduce((peta, nilai) => peta.set(nilai, (peta.get(nilai) || 0) + 1), new Map())]
      .map(([nilai, jumlah]) => ({ value: nilai, count: jumlah }))
      .sort((kiri, kanan) => kiri.value.localeCompare(kanan.value, 'id-ID'));
    const kelompok = hitung(aktif.map((student) => kelompokProgram(student.program)));
    const lengkap = hitung(aktif.map((student) => student.program))
      .filter((item) => !kelompok.some((grup) => grup.value === item.value));
    return { ok: true, value: { activeStudents: aktif.length, groups: kelompok, programs: lengkap } };
  }

  // Tagihan massal untuk santri aktif, misalnya SPP bulanan. Tanpa `terbitkan` hanya
  // pratinjau: siapa yang akan ditagih, siapa yang dilewati, dan totalnya. Santri yang
  // sudah punya tagihan dengan keterangan yang sama (selain yang dibatalkan) dilewati,
  // jadi klik ganda atau mengulang setelah gagal di tengah jalan tidak menagih dua kali.
  async function bulkInvoices(input, actor) {
    if (!adminOnly(actor)) return { ok: false, status: 403, error: 'Akses admin atau keuangan diperlukan.' };
    const source = input || {};
    const description = clean(source.description).replace(/\s+/g, ' ');
    const amount = Number(source.amount);
    const program = clean(source.program);
    const terbitkan = source.terbitkan === true;
    if (description.length < 3 || description.length > 200) {
      return { ok: false, error: 'Keterangan tagihan 3 sampai 200 karakter.' };
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_INVOICE_AMOUNT) {
      return { ok: false, error: 'Nominal tagihan harus bilangan bulat lebih dari nol.' };
    }

    // Program boleh nama lengkap ("Kuliah S1 Al-Azhar (Syariah wal Qanun)") atau
    // kelompoknya ("Kuliah S1 Al-Azhar"), seperti pengelompokan di dashboard admin.
    const cocokProgram = (student) => !program || student.program === program || kelompokProgram(student.program) === program;
    const aktif = (await listStudents())
      .filter((student) => student.status === 'active' && cocokProgram(student))
      .sort((kiri, kanan) => String(kiri.name).localeCompare(String(kanan.name), 'id-ID'));
    const sudahDitagih = new Set(await store.studentIdsWithInvoiceDescription(description));
    const ringkas = (student) => ({ studentId: student.id, name: student.name, program: student.program });
    const sasaran = aktif.filter((student) => !sudahDitagih.has(student.id)).map(ringkas);
    const dilewati = aktif.filter((student) => sudahDitagih.has(student.id))
      .map((student) => ({ ...ringkas(student), alasan: BULK_SKIP_REASON }));
    if (sasaran.length > MAX_BULK_INVOICES) {
      return { ok: false, error: `Paling banyak ${MAX_BULK_INVOICES} tagihan sekali terbit. Saring per program.` };
    }
    const ringkasan = { description, amount, program: program || null, sasaran, dilewati, total: amount * sasaran.length };
    if (!terbitkan) return { ok: true, value: ringkasan };

    if (!sasaran.length) return { ok: false, error: 'Tidak ada santri yang perlu ditagih.' };
    if (massalBerjalan) return { ok: false, status: 409, error: 'Tagihan massal lain sedang diproses. Tunggu sebentar lalu muat ulang.' };
    massalBerjalan = true;
    const dibuat = [];
    try {
      for (const santri of sasaran) {
        dibuat.push(await terbitkanInvoice(santri.studentId, description, amount));
      }
    } catch (error) {
      // Yang sudah terbit tetap tersimpan; mengulang akan melewati santri itu.
      return { ok: false, status: 500, error: `${dibuat.length} dari ${sasaran.length} tagihan sudah terbit sebelum terjadi galat. Ulangi tagihan massal yang sama untuk melanjutkan.`, invoices: dibuat };
    } finally {
      massalBerjalan = false;
    }
    return { ok: true, value: { ...ringkasan, invoices: dibuat } };
  }

  async function markInvoicePaid(invoiceId, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const invoice = await store.getInvoice(invoiceId);
    if (!invoice) return { ok: false, error: 'Invoice tidak ditemukan.' };
    // changed: false bila sudah lunas sebelumnya, supaya pemanggil tidak memicu notifikasi
    // pembayaran kedua untuk peristiwa yang sama (Task R8.3).
    if (invoice.status === 'paid') return { ok: true, value: invoice, changed: false };

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
      return terkini ? { ok: true, value: terkini, changed: false } : { ok: false, error: 'Invoice tidak ditemukan.' };
    }
    return { ok: true, value: paid, changed: true };
  }

  async function getInvoice(invoiceId, actor) {
    if (!adminOnly(actor)) return null;
    return store.getInvoice(invoiceId);
  }

  // Tagihan satu santri untuk wali (hanya santri yang terhubung) dan staf keuangan. Wali tidak
  // menerima alasan pembatalan dan versi internal.
  async function canViewStudentBilling(studentId, actor) {
    if (adminOnly(actor)) return true;
    return Boolean(actor && ['parent', 'student'].includes(actor.role) && (await familyCanViewStudent(studentId, actor)));
  }

  function forBillingViewer(invoice, actor) {
    if (adminOnly(actor)) return invoice;
    const { voidReason, version, ...selebihnya } = invoice;
    return selebihnya;
  }

  async function listStudentInvoices(studentId, actor) {
    if (!(await canViewStudentBilling(studentId, actor))) return { ok: false, error: 'Akses tagihan santri tidak diizinkan.' };
    const result = typeof store.listInvoicesPage === 'function'
      ? await store.listInvoicesPage({ studentId, limit: 100, offset: 0 })
      : { items: [] };
    return { ok: true, value: result.items.map((invoice) => forBillingViewer(invoice, actor)) };
  }

  // Kuitansi satu tagihan milik santri itu; hanya bila sudah lunas.
  async function studentReceiptInvoice(studentId, invoiceId, actor) {
    if (!(await canViewStudentBilling(studentId, actor))) return { ok: false, status: 403, error: 'Akses tagihan santri tidak diizinkan.' };
    const invoice = await store.getInvoice(invoiceId);
    if (!invoice || invoice.studentId !== studentId || invoice.status !== 'paid') return { ok: false, status: 404, error: 'Kuitansi belum tersedia.' };
    return { ok: true, value: invoice };
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

  // Jejak koreksi tidak ada gunanya kalau hanya tersimpan dan tidak pernah bisa
  // dilihat. Ini jalur bacanya.
  async function listInvoiceCorrections(invoiceId, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    if (typeof store.listInvoiceCorrections !== 'function') return { ok: true, value: [] };
    return { ok: true, value: await store.listInvoiceCorrections(invoiceId) };
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

  async function listVisaDocuments(studentId, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    if (typeof store.listVisaDocuments !== 'function') return { ok: true, value: [] };
    return { ok: true, value: await store.listVisaDocuments(clean(studentId) || null) };
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

  async function listInventoryMovements(itemId, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    if (typeof store.listInventoryMovements !== 'function') return { ok: true, value: [] };
    return { ok: true, value: await store.listInventoryMovements(itemId) };
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

  // Satu halaman tagihan untuk konsol; dipotong di store (SQL pada PostgreSQL).
  async function listInvoicesPage(options = {}) {
    const page = normalizePage(options);
    const result = typeof store.listInvoicesPage === 'function'
      ? await store.listInvoicesPage({ status: options.status, search: options.search, ...page })
      : { items: [], total: 0 };
    return { items: result.items, total: result.total, limit: page.limit, offset: page.offset };
  }

  // Ringkasan untuk layar konsol: halaman pertama tagihan beserta totalnya, ditambah visa
  // dan inventaris. Daftar tagihan selanjutnya diminta lewat listInvoicesPage.
  async function overview() {
    const [invoices, visas, inventory] = await Promise.all([listInvoicesPage({ limit: 20 }), store.listVisas(), store.listInventory()]);
    return {
      invoices: invoices.items,
      invoicesTotal: invoices.total,
      visas,
      inventory: inventory.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'))
    };
  }

  // Seluruh data, tanpa pagination. HANYA untuk ekspor laporan (report.csv), yang memang
  // harus memuat semuanya. Layar konsol memakai listInvoicesPage.
  async function list() {
    const [invoices, visas, inventory] = await Promise.all([store.listInvoices(), store.listVisas(), store.listInventory()]);
    return {
      invoices: invoices.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
      visas,
      inventory: inventory.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'))
    };
  }

  async function visaReminders(input, actor) {
    if (!adminOnly(actor)) return { ok: false, error: 'Akses admin diperlukan.' };
    const days = Number(input && input.days);
    const windowDays = Number.isInteger(days) && days >= 0 && days <= 365 ? days : 30;
    const batas = new Date(new Date(now()).getTime() + windowDays * 24 * 60 * 60 * 1000);
    const visas = await store.listVisas();
    const items = [];
    for (const visa of visas) {
      for (const jenis of ['passportExpiresAt', 'visaExpiresAt']) {
        if (!visa[jenis]) continue;
        const tanggal = new Date(`${visa[jenis]}T00:00:00Z`);
        if (Number.isNaN(tanggal.getTime()) || tanggal > batas) continue;
        items.push({ studentId: visa.studentId, status: visa.status, document: jenis === 'passportExpiresAt' ? 'passport' : 'visa', expiresAt: visa[jenis], overdue: tanggal < new Date(now()) });
      }
    }
    return { ok: true, value: items.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)) };
  }

  return Object.freeze({ bulkInvoiceOptions, bulkInvoices, createInvoice, createMemoryOperationsStore, correctInvoice, getInvoice, list, listInvoicesPage, listStudentInvoices, studentReceiptInvoice, overview, listInventoryMovements, listInvoiceCorrections, listVisaDocuments, markInvoicePaid, moveInventory, saveInventory, saveVisa, saveVisaDocument, visaReminders, voidInvoice });
}

module.exports = { MAX_BULK_INVOICES, MAX_INVOICE_AMOUNT, VISA_STATUSES, createMemoryOperationsStore, createOperationsService, documentNumber, yearInJakarta };
