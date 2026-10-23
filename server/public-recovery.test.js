const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'website', name), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('status lookup retains saved credentials on network/500 and clears on 401', async () => {
  const source = between(read('cek-status.js'), '  async function fetchRegistration(', "  form.addEventListener('submit'");
  for (const status of [0, 500, 401]) {
    let cleared = false;
    let state;
    const context = {
      fetch: async () => { if (!status) throw new TypeError('Network failed'); return { ok: false, status, json: async () => ({}) }; },
      setLookupState: (value) => { state = value; },
      submitBtn: {}, resultArea: {}, heroSection: {},
      hapusSesi: () => { cleared = true; },
      classifyLookupError: (error) => error.status === 401 ? 'invalid' : 'error'
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    await context.fetchRegistration('REG-1', 'secret');
    assert.equal(cleared, status === 401);
    assert.equal(state, status === 401 ? 'invalid' : 'error');
    assert.equal(context.submitBtn.disabled, false);
  }
});

test('successful registration still shows its access-code receipt when storage and popups are blocked', async () => {
  const source = between(read('registration.js'), "form.addEventListener('submit',", '\n});') + '\n});';
  let submit;
  let receipt;
  const context = {
    form: { addEventListener: (_, fn) => { submit = fn; }, reset() {} },
    status: { classList: { remove() {}, add() {} } }, submitButton: {},
    validateForm: () => true,
    readRegistrationForm: () => ({}),
    window: { open() { throw new Error('Blocked'); } },
    fetch: async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ registration: { registrationId: 'REG-1' }, accessToken: 'token', accessCode: 'one-time-code' }) }),
    sessionStorage: { setItem() { throw new Error('Storage blocked'); } },
    pesanUntukAdmin: () => 'https://wa.me/123',
    showRegistrationReceipt: (...args) => { receipt = args; },
    syncProgramFields() {}, refreshRegistrationStatus() {}
  };
  vm.runInNewContext(source, context);
  await submit({ preventDefault() {} });
  assert.equal(receipt[0], 'REG-1');
  assert.equal(receipt[1], 'one-time-code');
  assert.match(context.status.textContent, /Data tersimpan/);
  assert.equal(context.submitButton.disabled, false);
});

test('operations loads independent panels when the aggregate endpoint fails', async () => {
  const calls = [];
  const source = between(read('operations.js'), 'async function loadOperations()', '\nasync function loadPanel');
  const context = { loadPanel: async (selector, load) => { try { await load(); } catch { calls.push('error:' + selector); } }, jsonRequest: async () => { throw new Error('offline'); }, headers: () => ({}), renderInventory() {} };
  for (const name of ['loadInvoices', 'loadRingkasan', 'loadTunggakan', 'loadRiwayat']) context[name] = async () => { calls.push(name); };
  vm.createContext(context); vm.runInContext(source, context);
  await context.loadOperations();
  assert.deepEqual(calls.sort(), ['loadInvoices', 'loadRingkasan', 'loadTunggakan', 'loadRiwayat', 'error:#inventory-list'].sort());
});

test('article retry preserves pagination offset and distinguishes failures from empty results', async () => {
  function element() {
    return { hidden: false, disabled: false, textContent: '', innerHTML: '', children: [], listeners: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, append(child) { this.children.push(child); }, after() {}, replaceChildren() { this.innerHTML = ''; }, querySelectorAll: () => [], addEventListener(name, fn) { this.listeners[name] = fn; } };
  }
  const grid = element(), search = element(), created = [];
  let ready;
  const requests = [];
  const responses = [new Error('offline'), { items: [{ slug: 'first', title: 'First' }], total: 2 }, new Error('offline'), { items: [{ slug: 'second', title: 'Second' }], total: 2 }];
  const context = { URLSearchParams, Intl, Date, setTimeout, clearTimeout,
    document: { querySelector: (selector) => selector === '#articles-grid' ? grid : search, querySelectorAll: () => [], createElement: () => { const e = element(); created.push(e); return e; }, addEventListener: (_, fn) => { ready = fn; } },
    fetch: async (url) => { requests.push(url); const value = responses.shift(); if (value instanceof Error) throw value; return { ok: true, json: async () => value }; }
  };
  vm.runInNewContext(read('articles.js'), context); ready();
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  const status = created[0], wrap = created[1], button = created[2];
  assert.match(status.textContent, /belum dapat dimuat/);
  assert.ok(!grid.innerHTML.includes('Tidak Ada Artikel'));
  await button.listeners.click();
  assert.match(requests[1], /offset=0/);
  assert.match(grid.innerHTML, /First/);
  await button.listeners.click();
  assert.match(grid.innerHTML, /First/);
  assert.equal(wrap.hidden, false);
  await button.listeners.click();
  assert.match(requests[2], /offset=1/);
  assert.match(requests[3], /offset=1/);
  assert.match(grid.innerHTML, /Second/);
  assert.equal(wrap.hidden, true);
});

test('inventory ledger renders signed delta and actual balances including negative corrections and zero', () => {
  const source = between(read('operations.js'), 'function mutasiItemRow(', '\nasync function muatRiwayatMutasi');
  const context = { Intl, Date, MOVEMENT_LABELS: { in: 'Masuk', out: 'Keluar', correction: 'Koreksi' }, document: { createElement: () => ({ children: [], classList: { add() {} }, append(...items) { this.children.push(...items); } }) } };
  vm.createContext(context); vm.runInContext(source, context);
  for (const [direction, delta, expected] of [['correction', -3, 'Koreksi −3 unit'], ['correction', 4, 'Koreksi +4 unit'], ['out', -2, 'Keluar −2 unit'], ['in', 0, 'Masuk 0 unit']]) {
    const row = context.mutasiItemRow({ direction, delta, quantity: 999, beforeQuantity: 10, afterQuantity: 10 + delta, createdAt: '2026-10-23T00:00:00Z', reason: 'Audit' });
    assert.equal(row.children[1].textContent, expected);
    assert.equal(row.children[2].textContent, `Saldo sebelum: 10 unit. Saldo sesudah: ${10 + delta} unit.`);
  }
  const legacy = context.mutasiItemRow({ direction: 'correction', quantity: 3, delta: null, beforeQuantity: null, afterQuantity: null, createdAt: '2026-10-23T00:00:00Z' });
  assert.match(legacy.children[1].textContent, /tidak tercatat/);
  assert.ok(!legacy.children[1].textContent.includes('+3'));
});

test('class access check reports complete, partial, empty and network outcomes with retry', async () => {
  const source = between(read('operations.js'), 'async function checkCourseAccess()', "\ncheckCourseAccessButton.addEventListener");
  for (const result of [{ checked: 0, reconciled: [], failed: [] }, { checked: 2, reconciled: [{ invoiceId: 'a', courseId: 'c' }], failed: ['b'] }, { checked: 1, reconciled: [{ invoiceId: 'a', courseId: 'c' }], failed: [] }, null]) {
    let text;
    let request;
    const context = { checkCourseAccessButton: { disabled: false }, retryCourseAccessButton: {}, headers: () => ({ Authorization: 'Bearer test' }), feedback: (_, message) => { text = message; }, jsonRequest: async (...args) => { request = args; if (!result) throw new Error('offline'); return result; } };
    vm.createContext(context); vm.runInContext(source, context);
    await context.checkCourseAccess();
    assert.equal(request[0], '/api/operations/invoices/reconcile-paid');
    assert.equal(request[1].method, 'POST');
    assert.equal(request[1].headers.Authorization, 'Bearer test');
    assert.equal(context.checkCourseAccessButton.disabled, false);
    assert.equal(context.retryCourseAccessButton.hidden, Boolean(result && !result.failed.length));
    assert.match(text, !result ? /belum dapat diperiksa/ : result.checked === 0 ? /sudah sesuai/ : result.failed.length ? /Masih ada 1 pembayaran/ : /1 pembayaran berhasil dipulihkan/);
  }
});

test('article category selection keeps aria-pressed aligned with the active filter', () => {
  const element = (category) => ({ dataset: { category }, attributes: {}, listeners: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; }, append() {}, after() {} });
  const chips = [element('all'), element('Kegiatan')];
  let ready;
  const context = { URLSearchParams, Intl, Date, setTimeout, clearTimeout, fetch: () => new Promise(() => {}), document: { addEventListener: (_, fn) => { ready = fn; }, querySelector: () => element(), querySelectorAll: () => chips, createElement: () => element() } };
  vm.runInNewContext(read('articles.js'), context); ready();
  assert.equal(chips[0].attributes['aria-pressed'], 'true');
  assert.equal(chips[1].attributes['aria-pressed'], 'false');
  chips[1].listeners.click();
  assert.equal(chips[0].attributes['aria-pressed'], 'false');
  assert.equal(chips[1].attributes['aria-pressed'], 'true');
});
