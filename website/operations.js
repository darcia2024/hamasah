const guard = document.querySelector('#operations-guard');
const guardCopy = document.querySelector('#operations-guard-copy');
const consoleSection = document.querySelector('#operations-console');
const operationsList = document.querySelector('#operations-list');
const staffNav = document.querySelector('#staff-nav');
const logoutButton = document.querySelector('#logout-button');

const OPERATIONS_ROLES = ['admin', 'finance'];

function session() {
  try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; }
}

function headers() {
  const current = session();
  return current ? { Authorization: `Bearer ${current.accessToken}` } : {};
}

function feedback(id, message, error) {
  const target = document.querySelector(id);
  if (!target) return;
  target.textContent = message;
  target.classList.toggle('is-error', Boolean(error));
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Permintaan belum dapat diproses.');
  return body;
}

async function loadStudents() {
  const result = await jsonRequest('/api/my-students', { headers: headers() });
  ['#invoice-student', '#visa-student'].forEach((selector) => {
    const select = document.querySelector(selector);
    if (!select) return;
    select.replaceChildren();
    result.items.forEach((student) => select.add(new Option(`${student.name} · ${student.program}`, student.id)));
  });
}

function renderOperations(data) {
  operationsList.replaceChildren();
  const rows = [
    ...data.invoices.map((item) => `${item.number} · ${item.status === 'paid' ? item.receiptNumber : 'Belum dibayar'} · Rp${item.amount.toLocaleString('id-ID')}`),
    ...data.visas.map((item) => `Visa ${item.studentId} · ${item.status}`),
    ...data.inventory.map((item) => `${item.name} · ${item.location} · ${item.quantity} unit`)
  ];
  if (!rows.length) rows.push('Belum ada data operasional.');
  rows.forEach((text) => {
    const item = document.createElement('div');
    item.className = 'portal-account';
    item.textContent = text;
    operationsList.append(item);
  });
}

async function loadOperations() {
  const result = await jsonRequest('/api/operations', { headers: headers() });
  renderOperations(result);
}

// Subtab switcher
const opTabs = [
  { btn: document.querySelector('#tab-btn-invoices'), panel: document.querySelector('#panel-invoices') },
  { btn: document.querySelector('#tab-btn-visa'), panel: document.querySelector('#panel-visa') },
  { btn: document.querySelector('#tab-btn-inventory'), panel: document.querySelector('#panel-inventory') },
  { btn: document.querySelector('#tab-btn-history'), panel: document.querySelector('#panel-history') }
];

function switchOpTab(clickedBtn) {
  opTabs.forEach(({ btn, panel }) => {
    if (btn && panel) {
      const active = btn === clickedBtn;
      btn.classList.toggle('is-active', active);
      panel.hidden = !active;
    }
  });
}

opTabs.forEach(({ btn }) => {
  if (btn) btn.addEventListener('click', () => switchOpTab(btn));
});

document.querySelector('#invoice-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await jsonRequest('/api/operations/invoices', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: document.querySelector('#invoice-student').value,
        description: document.querySelector('#invoice-description').value,
        amount: Number(document.querySelector('#invoice-amount').value)
      })
    });
    event.target.reset();
    feedback('#invoice-status', `Invoice ${result.invoice.number} berhasil dibuat.`);
    await loadOperations();
  } catch (error) {
    feedback('#invoice-status', error.message, true);
  }
});

document.querySelector('#visa-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await jsonRequest('/api/operations/visas', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: document.querySelector('#visa-student').value,
        status: document.querySelector('#visa-state').value,
        note: document.querySelector('#visa-note').value
      })
    });
    feedback('#visa-status', 'Status visa berhasil disimpan.');
    await loadOperations();
  } catch (error) {
    feedback('#visa-status', error.message, true);
  }
});

document.querySelector('#inventory-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await jsonRequest('/api/operations/inventory', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.querySelector('#inventory-name').value,
        location: document.querySelector('#inventory-location').value,
        quantity: Number(document.querySelector('#inventory-quantity').value)
      })
    });
    event.target.reset();
    feedback('#inventory-status', 'Inventaris berhasil disimpan.');
    await loadOperations();
  } catch (error) {
    feedback('#inventory-status', error.message, true);
  }
});

document.querySelector('#reload-operations').addEventListener('click', () => loadOperations().catch((error) => {
  guardCopy.textContent = error.message;
}));

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: headers() }).catch(() => {});
    sessionStorage.removeItem('hamasahPortalSession');
    window.location.reload();
  });
}

(async function initialize() {
  if (session()) document.body.classList.add('in-crm');
  try {
    const result = await jsonRequest('/api/me', { headers: headers() });
    if (!OPERATIONS_ROLES.includes(result.account.role)) throw new Error('Halaman ini hanya dapat dibuka oleh admin atau keuangan.');
    guard.hidden = true;
    consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, result.account.role, 'operations', result.account);
    const tugas = [loadOperations()];
    if (result.account.role === 'admin') tugas.push(loadStudents());
    await Promise.all(tugas);
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
  }
}());
