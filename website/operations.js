const guard = document.querySelector('#operations-guard');
const guardCopy = document.querySelector('#operations-guard-copy');
const consoleSection = document.querySelector('#operations-console');
const operationsList = document.querySelector('#operations-list');
const invoiceList = document.querySelector('#invoice-list');
const downloadReportButton = document.querySelector('#download-report');
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

// Nama santri dipetakan sekali supaya baris invoice tidak menampilkan UUID mentah.
// Peran finance tidak punya izin students.read, jadi untuknya peta ini kosong dan
// baris invoice jatuh kembali ke id. Melebarkan izin itu keputusan akses, bukan
// pekerjaan task ini.
const studentNames = new Map();

async function loadStudents() {
  const result = await jsonRequest('/api/my-students', { headers: headers() });
  studentNames.clear();
  result.items.forEach((student) => studentNames.set(student.id, student.name));
  ['#invoice-student', '#visa-student'].forEach((selector) => {
    const select = document.querySelector(selector);
    if (!select) return;
    select.replaceChildren();
    result.items.forEach((student) => select.add(new Option(`${student.name} · ${student.program}`, student.id)));
  });
}

function studentLabel(studentId) {
  return studentNames.get(studentId) || studentId;
}

// Unduhan memakai header Authorization, yang tidak ikut terkirim oleh <a download>
// biasa. Karena itu berkas diambil lewat fetch, dibungkus object URL, lalu URL-nya
// dibebaskan setelah dipakai.
async function unduhBerkas(url, namaBerkas, tombol) {
  const labelAsli = tombol ? tombol.textContent : '';
  if (tombol) {
    tombol.disabled = true;
    tombol.textContent = 'Menyiapkan...';
  }
  try {
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) {
      // Kegagalan harus muncul sebagai pesan, bukan berkas kosong yang terlanjur terunduh.
      let pesan = 'Berkas belum dapat diunduh.';
      try {
        pesan = (await response.json()).error || pesan;
      } catch {
        // Respons gagal tidak selalu JSON; pesan bawaan dipakai apa adanya.
      }
      throw new Error(pesan);
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const tautan = document.createElement('a');
    tautan.href = objectUrl;
    tautan.download = namaBerkas;
    document.body.append(tautan);
    tautan.click();
    tautan.remove();
    // Dibebaskan pada tugas berikutnya, bukan seketika: sebagian browser membatalkan
    // unduhan yang object URL-nya sudah dicabut sebelum unduhan itu sempat dimulai.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } finally {
    if (tombol) {
      tombol.disabled = false;
      tombol.textContent = labelAsli;
    }
  }
}

const INVOICE_STATUS_LABELS = Object.freeze({
  unpaid: 'Belum dibayar',
  paid: 'Lunas',
  voided: 'Dibatalkan'
});

async function tandaiLunas(invoice, tombol) {
  // Menandai lunas menerbitkan nomor kuitansi resmi yang tidak bisa ditarik kembali,
  // jadi nomor invoice dan nominalnya disebutkan sebelum aksi dijalankan.
  const setuju = window.confirm(
    `Tandai invoice ${invoice.number} senilai Rp${invoice.amount.toLocaleString('id-ID')} sebagai lunas?`
    + '\n\nNomor kuitansi resmi akan diterbitkan dan tidak dapat ditarik kembali. Aksi ini tercatat di jejak audit.'
  );
  if (!setuju) return;

  const labelAsli = tombol.textContent;
  tombol.disabled = true;
  tombol.textContent = 'Menyimpan...';
  try {
    const hasil = await jsonRequest(`/api/operations/invoices/${encodeURIComponent(invoice.id)}/paid`, {
      method: 'PATCH',
      headers: headers()
    });
    feedback('#invoice-list-status', `Invoice ${invoice.number} lunas. Nomor kuitansi ${hasil.invoice.receiptNumber}.`);
    await loadOperations();
  } catch (error) {
    tombol.disabled = false;
    tombol.textContent = labelAsli;
    feedback('#invoice-list-status', error.message, true);
  }
}

async function unduhKuitansi(invoice, tombol) {
  try {
    // Nama berkas memakai nomor kuitansi resmi, supaya berkas yang tersimpan di
    // komputer petugas dapat dicocokkan dengan pembukuan tanpa dibuka lebih dulu.
    // Garis miring pada nomor resmi diganti karena bukan karakter nama berkas yang sah.
    const namaBerkas = `${(invoice.receiptNumber || invoice.number).replaceAll('/', '-')}.pdf`;
    await unduhBerkas(`/api/operations/invoices/${encodeURIComponent(invoice.id)}/receipt.pdf`, namaBerkas, tombol);
    feedback('#invoice-list-status', `Kuitansi ${invoice.receiptNumber} diunduh.`);
  } catch (error) {
    feedback('#invoice-list-status', error.message, true);
  }
}

function invoiceRow(invoice) {
  const baris = document.createElement('div');
  baris.className = 'op-row';

  const utama = document.createElement('div');
  utama.className = 'op-row__main';
  const judul = document.createElement('strong');
  judul.textContent = `${invoice.number} · Rp${invoice.amount.toLocaleString('id-ID')}`;
  const rinci = document.createElement('span');
  rinci.textContent = `${studentLabel(invoice.studentId)} · ${invoice.description}`;
  utama.append(judul, rinci);

  const status = document.createElement('span');
  status.className = `op-status op-status--${invoice.status}`;
  status.textContent = invoice.status === 'paid' && invoice.receiptNumber
    ? `Lunas · ${invoice.receiptNumber}`
    : INVOICE_STATUS_LABELS[invoice.status] || invoice.status;

  const aksi = document.createElement('div');
  aksi.className = 'op-row__actions';

  if (invoice.status === 'unpaid') {
    const bayar = document.createElement('button');
    bayar.type = 'button';
    bayar.className = 'button button--secondary op-action';
    bayar.textContent = 'Tandai Lunas';
    bayar.addEventListener('click', () => tandaiLunas(invoice, bayar));
    aksi.append(bayar);
  }

  // Kuitansi hanya ada untuk invoice lunas. Endpoint menolak selain itu dengan 404,
  // jadi tombolnya tidak ditampilkan daripada menjanjikan sesuatu yang pasti gagal.
  if (invoice.status === 'paid') {
    const kuitansi = document.createElement('button');
    kuitansi.type = 'button';
    kuitansi.className = 'button button--secondary op-action';
    kuitansi.textContent = 'Unduh Kuitansi';
    kuitansi.addEventListener('click', () => unduhKuitansi(invoice, kuitansi));
    aksi.append(kuitansi);
  }

  baris.append(utama, status, aksi);
  return baris;
}

function renderInvoices(invoices) {
  if (!invoices.length) {
    const kosong = document.createElement('p');
    kosong.className = 'form-status';
    kosong.textContent = 'Belum ada invoice. Terbitkan tagihan lewat formulir di atas.';
    invoiceList.replaceChildren(kosong);
    return;
  }
  invoiceList.replaceChildren(...invoices.map(invoiceRow));
}

async function unduhLaporan() {
  try {
    // Endpoint laporan tidak menerima parameter periode, jadi tanggal unduhan yang
    // membedakan berkas, bukan rentang data di dalamnya.
    const tanggal = new Date().toISOString().slice(0, 10);
    await unduhBerkas('/api/operations/report.csv', `laporan-operasional-hamasah-${tanggal}.csv`, downloadReportButton);
    feedback('#invoice-list-status', 'Laporan operasional diunduh.');
  } catch (error) {
    feedback('#invoice-list-status', error.message, true);
  }
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
  renderInvoices(result.invoices);
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

if (downloadReportButton) downloadReportButton.addEventListener('click', () => unduhLaporan());

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
