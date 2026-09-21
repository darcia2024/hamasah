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

const studentPickers = [];
async function loadStudents() {
  if (!studentPickers.length) {
    ['#invoice-student', '#visa-student'].forEach((selector) => {
      const select = document.querySelector(selector);
      if (!select) return;
      studentPickers.push(window.HamasahStudentPicker.attach(select, {
        headers,
        placeholder: null,
        onLoaded: ({ items }) => items.forEach((student) => studentNames.set(student.id, student.name))
      }));
    });
  }
  await Promise.all(studentPickers.map((picker) => picker.reload()));
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


// ---- Task R3.4: ledger inventaris ----

const inventoryList = document.querySelector('#inventory-list');
const movementDialog = document.querySelector('#movement-dialog');
const movementForm = document.querySelector('#movement-form');
const movementSummary = document.querySelector('#movement-summary');
const movementDirection = document.querySelector('#movement-direction');
const movementQuantity = document.querySelector('#movement-quantity');
const movementReason = document.querySelector('#movement-reason');
const movementError = document.querySelector('#movement-error');
const movementSubmit = document.querySelector('#movement-submit');

const MOVEMENT_LABELS = Object.freeze({ in: 'Masuk', out: 'Keluar', correction: 'Koreksi' });

// Barang yang riwayat mutasinya sedang dibuka, supaya pemuatan ulang daftar tidak
// menutup kembali riwayat yang baru saja ditampilkan.
const mutasiTerbuka = new Set();

let mutasiItem = null;

function tutupDialogMutasi() {
  mutasiItem = null;
  movementError.textContent = '';
  if (movementDialog.open) movementDialog.close();
}

function bukaDialogMutasi(item) {
  mutasiItem = item;
  movementSummary.textContent = `${item.name} di ${item.location}. Stok saat ini ${item.quantity} unit.`;
  movementDirection.value = 'in';
  movementQuantity.value = '';
  movementReason.value = '';
  movementError.textContent = '';
  movementSubmit.disabled = false;
  movementDialog.showModal();
  movementQuantity.focus();
}

async function kirimMutasi(event) {
  event.preventDefault();
  if (!mutasiItem) return;

  const direction = movementDirection.value;
  const quantity = Number(movementQuantity.value);
  const reason = movementReason.value.trim();

  if (!Number.isInteger(quantity) || quantity <= 0) {
    movementError.textContent = 'Jumlah harus bilangan bulat lebih dari nol.';
    movementQuantity.focus();
    return;
  }
  if (reason.length < 3) {
    movementError.textContent = 'Catatan wajib diisi, minimal 3 karakter.';
    movementReason.focus();
    return;
  }
  // Stok negatif ditolak lebih dulu di sini supaya pesannya menyebut angka yang
  // sebenarnya. Store tetap menjadi penentu akhir: ia memeriksa ulang di dalam
  // transaksi, sehingga dua mutasi bersamaan tidak bisa menembus batas.
  if (direction === 'out' && quantity > mutasiItem.quantity) {
    movementError.textContent = `Stok ${mutasiItem.name} hanya ${mutasiItem.quantity} unit, tidak cukup untuk mengeluarkan ${quantity} unit.`;
    movementQuantity.focus();
    return;
  }

  movementSubmit.disabled = true;
  try {
    await jsonRequest(`/api/operations/inventory/${encodeURIComponent(mutasiItem.id)}/movements`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, quantity, reason })
    });
    mutasiTerbuka.add(mutasiItem.id);
    const nama = mutasiItem.name;
    tutupDialogMutasi();
    feedback('#inventory-list-status', `Mutasi ${nama} tercatat.`);
    await loadOperations();
  } catch (error) {
    movementSubmit.disabled = false;
    movementError.textContent = error.message;
  }
}

function mutasiItemRow(mutasi) {
  const item = document.createElement('div');
  item.className = 'op-history__item';

  const kepala = document.createElement('div');
  kepala.className = 'op-history__head';
  const waktu = document.createElement('span');
  waktu.textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(mutasi.createdAt));
  const pelaku = document.createElement('span');
  pelaku.textContent = mutasi.actorName ? `oleh ${mutasi.actorName}` : 'pelaku tidak tersimpan';
  if (!mutasi.actorName) pelaku.classList.add('op-history__actor--kosong');
  kepala.append(waktu, pelaku);

  const perubahan = document.createElement('p');
  perubahan.className = 'op-history__change';
  const tanda = mutasi.direction === 'out' ? '\u2212' : '+';
  perubahan.textContent = `${MOVEMENT_LABELS[mutasi.direction] || mutasi.direction} ${tanda}${mutasi.quantity} unit`;

  const alasan = document.createElement('p');
  alasan.className = 'op-history__reason';
  alasan.textContent = `Catatan: ${mutasi.reason}`;

  item.append(kepala, perubahan, alasan);
  return item;
}

async function muatRiwayatMutasi(itemId, wadah) {
  wadah.replaceChildren();
  const memuat = kosong('Memuat riwayat mutasi...');
  wadah.append(memuat);
  try {
    const hasil = await jsonRequest(`/api/operations/inventory/${encodeURIComponent(itemId)}/movements`, { headers: headers() });
    if (!hasil.items.length) {
      memuat.textContent = 'Belum ada mutasi. Jumlah saat ini berasal dari jumlah awal saat aset dibuat.';
      return;
    }
    wadah.replaceChildren(...hasil.items.map(mutasiItemRow));
  } catch (error) {
    memuat.textContent = error.message;
    memuat.classList.add('is-error');
  }
}

function inventoryRow(item) {
  const baris = document.createElement('div');
  baris.className = 'op-row';

  const utama = document.createElement('div');
  utama.className = 'op-row__main';
  const judul = document.createElement('strong');
  judul.textContent = `${item.name} \u00b7 ${item.quantity} unit`;
  const rinci = document.createElement('span');
  rinci.textContent = item.location;
  utama.append(judul, rinci);

  const aksi = document.createElement('div');
  aksi.className = 'op-row__actions';

  const catat = document.createElement('button');
  catat.type = 'button';
  catat.className = 'button button--secondary op-action';
  catat.textContent = 'Catat Pergerakan';
  catat.addEventListener('click', () => bukaDialogMutasi(item));

  const riwayatTombol = document.createElement('button');
  riwayatTombol.type = 'button';
  riwayatTombol.className = 'button button--secondary op-action';
  const riwayatWadah = document.createElement('div');
  riwayatWadah.className = 'op-history';

  function setRiwayat(terbuka) {
    riwayatWadah.hidden = !terbuka;
    riwayatTombol.setAttribute('aria-expanded', String(terbuka));
    riwayatTombol.textContent = terbuka ? 'Sembunyikan Riwayat' : 'Riwayat Mutasi';
    if (terbuka) muatRiwayatMutasi(item.id, riwayatWadah);
  }

  riwayatTombol.addEventListener('click', () => {
    const terbuka = riwayatWadah.hidden;
    if (terbuka) mutasiTerbuka.add(item.id);
    else mutasiTerbuka.delete(item.id);
    setRiwayat(terbuka);
  });

  aksi.append(catat, riwayatTombol);
  setRiwayat(mutasiTerbuka.has(item.id));

  baris.append(utama, aksi, riwayatWadah);
  return baris;
}

function renderInventory(items) {
  if (!items.length) {
    inventoryList.replaceChildren(kosong('Belum ada aset inventaris. Tambahkan lewat formulir di atas.'));
    return;
  }
  inventoryList.replaceChildren(...items.map(inventoryRow));
}

// ---- Task R3.3: panel visa dan berkas visa ----

const visaReminderList = document.querySelector('#visa-reminder-list');
const visaDocumentList = document.querySelector('#visa-document-list');
const visaDocumentForm = document.querySelector('#visa-document-form');
const visaStudentSelect = document.querySelector('#visa-student');

const VISA_DOCUMENT_LABELS = Object.freeze({
  passport: 'Paspor',
  visa: 'Visa',
  residence: 'Izin Tinggal',
  other: 'Lainnya'
});

const SEHARI_MS = 24 * 60 * 60 * 1000;

function tanggalIndonesia(iso) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(`${iso}T00:00:00Z`));
}

// Selisih hari dihitung dari tengah malam UTC ke tengah malam UTC, supaya jam
// pemuatan halaman tidak mengubah hasilnya.
function selisihHari(iso) {
  const hariIni = new Date();
  const nolkan = Date.UTC(hariIni.getUTCFullYear(), hariIni.getUTCMonth(), hariIni.getUTCDate());
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - nolkan) / SEHARI_MS);
}

function kosong(pesan) {
  const p = document.createElement('p');
  p.className = 'form-status';
  p.textContent = pesan;
  return p;
}

function visaReminderRow(item) {
  const baris = document.createElement('div');
  baris.className = 'op-row';

  const utama = document.createElement('div');
  utama.className = 'op-row__main';
  const judul = document.createElement('strong');
  judul.textContent = `${VISA_DOCUMENT_LABELS[item.document] || item.document} \u00b7 ${studentLabel(item.studentId)}`;
  const rinci = document.createElement('span');
  rinci.textContent = `Berlaku sampai ${tanggalIndonesia(item.expiresAt)} \u00b7 status ${item.status}`;
  utama.append(judul, rinci);

  // Perbedaan sudah lewat dan akan lewat dinyatakan lewat kata, bukan hanya warna.
  const hari = selisihHari(item.expiresAt);
  const tanda = document.createElement('span');
  tanda.className = item.overdue ? 'op-status op-status--overdue' : 'op-status op-status--unpaid';
  if (item.overdue) {
    const lewat = Math.abs(hari);
    tanda.textContent = lewat === 0 ? 'Kedaluwarsa hari ini' : `Sudah lewat ${lewat} hari`;
  } else {
    tanda.textContent = hari === 0 ? 'Kedaluwarsa hari ini' : `${hari} hari lagi`;
  }

  baris.append(utama, tanda);
  return baris;
}

async function loadVisaReminders() {
  try {
    const hasil = await jsonRequest('/api/operations/visa-reminders?days=30', { headers: headers() });
    if (!hasil.items.length) {
      visaReminderList.replaceChildren(kosong('Tidak ada paspor atau visa yang kedaluwarsa dalam 30 hari ke depan. Daftar ini terisi setelah tanggal berlaku dicatat pada formulir di bawah.'));
      return;
    }
    visaReminderList.replaceChildren(...hasil.items.map(visaReminderRow));
  } catch (error) {
    visaReminderList.replaceChildren(kosong(error.message));
  }
}

function visaDocumentRow(document_) {
  const baris = document.createElement('div');
  baris.className = 'op-row';

  const utama = document.createElement('div');
  utama.className = 'op-row__main';
  const judul = document.createElement('strong');
  judul.textContent = `${VISA_DOCUMENT_LABELS[document_.documentType] || document_.documentType} \u00b7 ${studentLabel(document_.studentId)}`;
  const rinci = document.createElement('span');
  const berlaku = document_.expiresAt ? `berlaku sampai ${tanggalIndonesia(document_.expiresAt)}` : 'tanpa tanggal berlaku';
  const diunggah = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(document_.uploadedAt));
  rinci.textContent = document_.note ? `${berlaku} \u00b7 diunggah ${diunggah} \u00b7 ${document_.note}` : `${berlaku} \u00b7 diunggah ${diunggah}`;
  utama.append(judul, rinci);

  baris.append(utama);
  return baris;
}

async function loadVisaDocuments() {
  const studentId = visaStudentSelect ? visaStudentSelect.value : '';
  try {
    const jalur = studentId ? `/api/operations/visa-documents?studentId=${encodeURIComponent(studentId)}` : '/api/operations/visa-documents';
    const hasil = await jsonRequest(jalur, { headers: headers() });
    if (!hasil.items.length) {
      visaDocumentList.replaceChildren(kosong('Belum ada berkas visa untuk santri ini. Unggah pindaian lewat formulir di atas.'));
      return;
    }
    visaDocumentList.replaceChildren(...hasil.items.map(visaDocumentRow));
  } catch (error) {
    visaDocumentList.replaceChildren(kosong(error.message));
  }
}

// Alur unggah dua langkah yang sudah dipakai halaman cek status: minta tempat
// unggah lebih dulu supaya izin dan ukuran diperiksa sebelum satu byte pun
// dikirim, baru isinya menyusul.
async function unggahBerkasVisa(file, studentId) {
  const minta = await jsonRequest('/api/uploads', {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purpose: 'visa-document',
      entityId: studentId,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size
    })
  });
  await jsonRequest(`/api/uploads/${encodeURIComponent(minta.upload.id)}/content`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });
  return minta.upload.id;
}

// ---- Task R3.2: koreksi dan pembatalan invoice ----

const invoiceActionDialog = document.querySelector('#invoice-action-dialog');
const invoiceActionForm = document.querySelector('#invoice-action-form');
const invoiceActionTitle = document.querySelector('#invoice-action-title');
const invoiceActionSummary = document.querySelector('#invoice-action-summary');
const invoiceActionFields = document.querySelector('#invoice-action-fields');
const invoiceActionDescription = document.querySelector('#invoice-action-description');
const invoiceActionAmount = document.querySelector('#invoice-action-amount');
const invoiceActionReason = document.querySelector('#invoice-action-reason');
const invoiceActionError = document.querySelector('#invoice-action-error');
const invoiceActionSubmit = document.querySelector('#invoice-action-submit');

// Invoice yang riwayat koreksinya sedang dibuka. Disimpan supaya pemuatan ulang
// daftar tidak menutup kembali riwayat yang baru saja ditampilkan.
const riwayatTerbuka = new Set();

let aksiInvoice = null;

// Database menuntut minimal 5 karakter lewat CHECK (char_length(reason) >= 5).
// Angka yang sama dipakai di sini supaya penolakan terjadi sebelum permintaan
// dikirim, bukan datang kembali sebagai error database.
const ALASAN_MINIMAL = 5;

function tutupDialogInvoice() {
  aksiInvoice = null;
  invoiceActionError.textContent = '';
  if (invoiceActionDialog.open) invoiceActionDialog.close();
}

function bukaDialogInvoice(invoice, mode) {
  aksiInvoice = { invoice, mode };
  const nominal = `Rp${invoice.amount.toLocaleString('id-ID')}`;
  const koreksi = mode === 'koreksi';

  invoiceActionTitle.textContent = koreksi ? 'Koreksi Invoice' : 'Batalkan Invoice';
  // Konfirmasi menyebut invoice yang terdampak beserta nominalnya, dan menyatakan
  // bahwa aksinya tercatat, supaya tidak ada yang menekan tombol ini tanpa tahu
  // invoice mana yang berubah.
  invoiceActionSummary.textContent = koreksi
    ? `${invoice.number} untuk ${studentLabel(invoice.studentId)}, saat ini ${nominal}. Perubahan tersimpan sebagai koreksi berjejak dan tercatat di jejak audit.`
    : `${invoice.number} untuk ${studentLabel(invoice.studentId)} senilai ${nominal} akan dibatalkan. Pembatalan tidak dapat ditarik kembali dan tercatat di jejak audit.`;

  invoiceActionFields.hidden = !koreksi;
  invoiceActionDescription.value = koreksi ? invoice.description : '';
  invoiceActionAmount.value = koreksi ? String(invoice.amount) : '';
  invoiceActionReason.value = '';
  invoiceActionError.textContent = '';
  invoiceActionSubmit.textContent = koreksi ? 'Simpan Koreksi' : 'Batalkan Invoice';
  invoiceActionSubmit.disabled = false;

  invoiceActionDialog.showModal();
  invoiceActionReason.focus();
}

function periksaIsianAksi(mode) {
  const alasan = invoiceActionReason.value.trim();
  if (alasan.length < ALASAN_MINIMAL) {
    return { valid: false, pesan: `Alasan wajib diisi, minimal ${ALASAN_MINIMAL} karakter.` };
  }
  if (mode !== 'koreksi') return { valid: true, payload: { reason: alasan } };

  const description = invoiceActionDescription.value.trim();
  if (description.length < 3) return { valid: false, pesan: 'Keterangan tagihan minimal 3 karakter.' };

  const amount = Number(invoiceActionAmount.value);
  if (!Number.isInteger(amount) || amount <= 0) {
    return { valid: false, pesan: 'Nominal harus bilangan bulat lebih dari nol.' };
  }
  return { valid: true, payload: { description, amount, reason: alasan } };
}

async function kirimAksiInvoice(event) {
  event.preventDefault();
  if (!aksiInvoice) return;
  const { invoice, mode } = aksiInvoice;

  const periksa = periksaIsianAksi(mode);
  if (!periksa.valid) {
    invoiceActionError.textContent = periksa.pesan;
    invoiceActionReason.focus();
    return;
  }

  invoiceActionSubmit.disabled = true;
  try {
    const jalur = mode === 'koreksi' ? 'correction' : 'void';
    await jsonRequest(`/api/operations/invoices/${encodeURIComponent(invoice.id)}/${jalur}`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(periksa.payload)
    });
    // Jejaknya harus terlihat, bukan hanya tersimpan: riwayat invoice ini dibuka
    // begitu koreksi berhasil.
    if (mode === 'koreksi') riwayatTerbuka.add(invoice.id);
    tutupDialogInvoice();
    feedback('#invoice-list-status', mode === 'koreksi'
      ? `Invoice ${invoice.number} dikoreksi.`
      : `Invoice ${invoice.number} dibatalkan.`);
    await loadOperations();
  } catch (error) {
    invoiceActionSubmit.disabled = false;
    invoiceActionError.textContent = error.message;
  }
}

function koreksiItem(koreksi) {
  const item = document.createElement('div');
  item.className = 'op-history__item';

  const kepala = document.createElement('div');
  kepala.className = 'op-history__head';
  const waktu = document.createElement('span');
  waktu.textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(koreksi.createdAt));
  const pelaku = document.createElement('span');
  // Akun staf yang sudah dihapus menyisakan NULL; dinyatakan apa adanya.
  pelaku.textContent = koreksi.actorName ? `oleh ${koreksi.actorName}` : 'pelaku tidak tersimpan';
  if (!koreksi.actorName) pelaku.classList.add('op-history__actor--kosong');
  kepala.append(waktu, pelaku);

  const perubahan = document.createElement('p');
  perubahan.className = 'op-history__change';
  perubahan.textContent = `${koreksi.previousDescription} Rp${koreksi.previousAmount.toLocaleString('id-ID')}`
    + ` \u2192 ${koreksi.correctedDescription} Rp${koreksi.correctedAmount.toLocaleString('id-ID')}`;

  const alasan = document.createElement('p');
  alasan.className = 'op-history__reason';
  alasan.textContent = `Alasan: ${koreksi.reason}`;

  item.append(kepala, perubahan, alasan);
  return item;
}

async function muatRiwayatKoreksi(invoiceId, wadah) {
  wadah.replaceChildren();
  const memuat = document.createElement('p');
  memuat.className = 'form-status';
  memuat.textContent = 'Memuat riwayat koreksi...';
  wadah.append(memuat);
  try {
    const hasil = await jsonRequest(`/api/operations/invoices/${encodeURIComponent(invoiceId)}/corrections`, { headers: headers() });
    if (!hasil.items.length) {
      memuat.textContent = 'Belum ada koreksi pada invoice ini.';
      return;
    }
    wadah.replaceChildren(...hasil.items.map(koreksiItem));
  } catch (error) {
    memuat.textContent = error.message;
    memuat.classList.add('is-error');
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


  if (invoice.status === 'unpaid') {
    const koreksi = document.createElement('button');
    koreksi.type = 'button';
    koreksi.className = 'button button--secondary op-action';
    koreksi.textContent = 'Koreksi';
    koreksi.addEventListener('click', () => bukaDialogInvoice(invoice, 'koreksi'));

    const batal = document.createElement('button');
    batal.type = 'button';
    batal.className = 'button button--secondary op-action';
    batal.textContent = 'Batalkan';
    batal.addEventListener('click', () => bukaDialogInvoice(invoice, 'batal'));

    aksi.append(koreksi, batal);
  }

  const riwayatTombol = document.createElement('button');
  riwayatTombol.type = 'button';
  riwayatTombol.className = 'button button--secondary op-action';
  const riwayatWadah = document.createElement('div');
  riwayatWadah.className = 'op-history';

  function setRiwayat(terbuka) {
    riwayatWadah.hidden = !terbuka;
    riwayatTombol.setAttribute('aria-expanded', String(terbuka));
    riwayatTombol.textContent = terbuka ? 'Sembunyikan Riwayat' : 'Riwayat Koreksi';
    if (terbuka) muatRiwayatKoreksi(invoice.id, riwayatWadah);
  }

  riwayatTombol.addEventListener('click', () => {
    const terbuka = riwayatWadah.hidden;
    if (terbuka) riwayatTerbuka.add(invoice.id);
    else riwayatTerbuka.delete(invoice.id);
    setRiwayat(terbuka);
  });
  aksi.append(riwayatTombol);
  setRiwayat(riwayatTerbuka.has(invoice.id));

  baris.append(utama, status, aksi, riwayatWadah);
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
  renderInventory(result.inventory);
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
        // Tanpa kedua tanggal ini panel peringatan tidak akan pernah terisi:
        // visaReminders membacanya dari baris visa, dan sebelum Task R3.3 formulir
        // ini tidak punya isiannya sama sekali.
        passportExpiresAt: document.querySelector('#visa-passport-expires').value || null,
        visaExpiresAt: document.querySelector('#visa-visa-expires').value || null,
        note: document.querySelector('#visa-note').value
      })
    });
    feedback('#visa-status', 'Status visa berhasil disimpan.');
    await Promise.all([loadOperations(), loadVisaReminders()]);
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

if (visaStudentSelect) visaStudentSelect.addEventListener('change', () => loadVisaDocuments());

movementForm.addEventListener('submit', kirimMutasi);
document.querySelector('#movement-cancel').addEventListener('click', tutupDialogMutasi);
movementDialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') tutupDialogMutasi(); });
movementDialog.addEventListener('close', () => { mutasiItem = null; });

if (visaDocumentForm) {
  visaDocumentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const studentId = visaStudentSelect ? visaStudentSelect.value : '';
    const file = document.querySelector('#visa-document-file').files[0];
    if (!studentId) {
      feedback('#visa-document-status', 'Pilih santri terlebih dahulu pada formulir status visa di atas.', true);
      return;
    }
    if (!file) {
      feedback('#visa-document-status', 'Pilih berkas yang akan diunggah.', true);
      return;
    }
    const tombol = visaDocumentForm.querySelector('button[type="submit"] span');
    const labelAsli = tombol ? tombol.textContent : '';
    if (tombol) tombol.textContent = 'Mengunggah...';
    try {
      feedback('#visa-document-status', 'Mengunggah berkas...');
      const fileObjectId = await unggahBerkasVisa(file, studentId);
      await jsonRequest('/api/operations/visa-documents', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          fileObjectId,
          documentType: document.querySelector('#visa-document-type').value,
          expiresAt: document.querySelector('#visa-document-expires').value || null,
          note: document.querySelector('#visa-document-note').value
        })
      });
      visaDocumentForm.reset();
      feedback('#visa-document-status', 'Berkas visa tersimpan.');
      await loadVisaDocuments();
    } catch (error) {
      feedback('#visa-document-status', error.message, true);
    } finally {
      if (tombol) tombol.textContent = labelAsli;
    }
  });
}

invoiceActionForm.addEventListener('submit', kirimAksiInvoice);
document.querySelector('#invoice-action-cancel').addEventListener('click', tutupDialogInvoice);
// Escape menutup <dialog> sendiri; state internal ikut dibersihkan agar pembukaan
// berikutnya tidak mewarisi invoice sebelumnya.
// Escape menutup dialog tanpa melewati tombol Tutup. Event 'close' tidak selalu
// terkirim, jadi keydown dipakai sebagai jalur yang pasti ada.
invoiceActionDialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') tutupDialogInvoice(); });
invoiceActionDialog.addEventListener('close', () => { aksiInvoice = null; });

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
    // Daftar santri dimuat lebih dulu supaya panel visa menampilkan nama, bukan UUID.
    if (result.account.role === 'admin') await loadStudents();
    await Promise.all([loadOperations(), loadVisaReminders(), loadVisaDocuments()]);
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
  }
}());
