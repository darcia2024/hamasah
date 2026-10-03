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

// Nama santri dipetakan sekali supaya baris invoice dan visa tidak menampilkan UUID mentah.
const studentNames = new Map();

// Pilihan santri dari GET /api/operations/pilihan-santri (santri aktif: id, nama,
// program). Dulu memakai daftar santri umum yang tertutup untuk peran keuangan, sehingga
// keuangan tidak bisa menerbitkan tagihan satuan maupun memperbarui visa.
async function loadStudents() {
  const hasil = await jsonRequest('/api/operations/pilihan-santri', { headers: headers() });
  hasil.items.forEach((student) => studentNames.set(student.id, student.name));
  ['#invoice-student', '#visa-student'].forEach((selector) => {
    const select = document.querySelector(selector);
    if (!select) return;
    const terpilih = select.value;
    select.replaceChildren(new Option('Pilih santri', ''));
    hasil.items.forEach((student) => select.add(new Option(student.program ? `${student.name} · ${student.program}` : student.name, student.id)));
    if (terpilih && hasil.items.some((student) => student.id === terpilih)) select.value = terpilih;
  });
}

// Nama datang dari peta santri yang sudah dimuat, lalu dari nama yang dibawa barisnya
// sendiri (server menggabungkan tabel santri), dan baru terakhir id.
function studentLabel(studentId, namaDariBaris) {
  return studentNames.get(studentId) || namaDariBaris || studentId;
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
  catat.textContent = 'Catat pergerakan';
  catat.addEventListener('click', () => bukaDialogMutasi(item));

  const riwayatTombol = document.createElement('button');
  riwayatTombol.type = 'button';
  riwayatTombol.className = 'button button--secondary op-action';
  const riwayatWadah = document.createElement('div');
  riwayatWadah.className = 'op-history';

  function setRiwayat(terbuka) {
    riwayatWadah.hidden = !terbuka;
    riwayatTombol.setAttribute('aria-expanded', String(terbuka));
    riwayatTombol.textContent = terbuka ? 'Sembunyikan riwayat' : 'Riwayat mutasi';
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
  residence: 'Izin tinggal',
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

// Label status visa mengikuti pilihan di formulir visa, bukan kode internalnya.
function labelStatusVisa(status) {
  const opsi = [...document.querySelectorAll('#visa-state option')].find((option) => option.value === status);
  return opsi ? opsi.textContent.trim().toLowerCase() : status;
}

function visaReminderRow(item) {
  const baris = document.createElement('div');
  baris.className = 'op-row';

  const utama = document.createElement('div');
  utama.className = 'op-row__main';
  const judul = document.createElement('strong');
  judul.textContent = `${VISA_DOCUMENT_LABELS[item.document] || item.document} \u00b7 ${studentLabel(item.studentId, item.studentName)}`;
  const rinci = document.createElement('span');
  rinci.textContent = `Berlaku sampai ${tanggalIndonesia(item.expiresAt)} \u00b7 status ${labelStatusVisa(item.status)}`;
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
  const uploadId = encodeURIComponent(minta.upload.id);
  if (minta.directUpload) {
    // Isi berkas dikirim peramban langsung ke penyimpanan; server hanya memberi
    // tautan dan memeriksa hasilnya. Lihat catatan di website/cek-status.js.
    const tautan = await jsonRequest(`/api/uploads/${uploadId}/direct`, { method: 'POST', headers: headers() });
    const kirim = await fetch(tautan.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!kirim.ok) throw new Error('Berkas gagal dikirim ke penyimpanan.');
    await jsonRequest(`/api/uploads/${uploadId}/confirm`, { method: 'POST', headers: headers() });
  } else {
    await jsonRequest(`/api/uploads/${uploadId}/content`, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
  }
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

  invoiceActionTitle.textContent = koreksi ? 'Koreksi invoice' : 'Batalkan invoice';
  // Konfirmasi menyebut invoice yang terdampak beserta nominalnya, dan menyatakan
  // bahwa aksinya tercatat, supaya tidak ada yang menekan tombol ini tanpa tahu
  // invoice mana yang berubah.
  invoiceActionSummary.textContent = koreksi
    ? `${invoice.number} untuk ${studentLabel(invoice.studentId, invoice.studentName)}, saat ini ${nominal}. Perubahan tersimpan sebagai koreksi berjejak dan tercatat di jejak audit.`
    : `${invoice.number} untuk ${studentLabel(invoice.studentId, invoice.studentName)} senilai ${nominal} akan dibatalkan. Pembatalan tidak dapat ditarik kembali dan tercatat di jejak audit.`;

  invoiceActionFields.hidden = !koreksi;
  invoiceActionDescription.value = koreksi ? invoice.description : '';
  invoiceActionAmount.value = koreksi ? String(invoice.amount) : '';
  invoiceActionReason.value = '';
  invoiceActionError.textContent = '';
  invoiceActionSubmit.textContent = koreksi ? 'Simpan koreksi' : 'Batalkan invoice';
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

// Tanggal hari ini (YYYY-MM-DD) di Indonesia, untuk nilai awal tanggal bayar.
function hariIniWib() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const METODE_BAYAR = { transfer: 'Transfer bank', tunai: 'Tunai', lainnya: 'Lainnya' };

async function tandaiLunas(invoice) {
  // Menandai lunas menerbitkan nomor kuitansi resmi yang tidak bisa ditarik kembali,
  // jadi nomor invoice dan nominalnya disebutkan di dialog sebelum aksi dijalankan.
  const hasil = await window.HamasahDialog.formulir({
    judul: `Tandai lunas ${invoice.number}`,
    keterangan: `${studentLabel(invoice.studentId, invoice.studentName)} · ${invoice.description} · Rp${invoice.amount.toLocaleString('id-ID')}. Nomor kuitansi resmi akan diterbitkan dan tidak dapat ditarik kembali.`,
    labelSimpan: 'Tandai lunas',
    bidang: [
      { nama: 'paidOn', label: 'Tanggal dibayar', jenis: 'date', nilai: hariIniWib(), wajib: true, petunjuk: 'Tanggal uang diterima, boleh berbeda dari hari ini.' },
      { nama: 'method', label: 'Metode pembayaran', jenis: 'select', nilai: 'transfer', wajib: true, pilihan: Object.entries(METODE_BAYAR) },
      { nama: 'note', label: 'Catatan (opsional)', jenis: 'textarea', nilai: '', petunjuk: 'Contoh: transfer BSI a.n. wali, bukti di WhatsApp keuangan.' }
    ],
    async kirim(nilai) {
      return jsonRequest(`/api/operations/invoices/${encodeURIComponent(invoice.id)}/paid`, {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidOn: nilai.paidOn, method: nilai.method, note: nilai.note })
      });
    }
  });
  if (!hasil) return;
  const catatan = hasil.paymentDetailSaved === false
    ? ' Rincian pembayaran belum tersimpan karena pembaruan database (migrasi 047) belum diterapkan.'
    : '';
  feedback('#invoice-list-status', `Invoice ${invoice.number} lunas. Nomor kuitansi ${hasil.invoice.receiptNumber}.${catatan}`, Boolean(catatan));
  await loadOperations();
}

async function kirimPengingat(invoice, tombol) {
  if (!window.confirm(`Kirim email pengingat tagihan ${invoice.number} ke wali ${studentLabel(invoice.studentId, invoice.studentName)}?`)) return;
  tombol.disabled = true;
  try {
    const hasil = await jsonRequest(`/api/operations/invoices/${encodeURIComponent(invoice.id)}/pengingat`, { method: 'POST', headers: headers() });
    feedback('#invoice-list-status', `Pengingat ${invoice.number} dikirim ke ${hasil.recipients} wali.`);
    await loadInvoices();
  } catch (error) {
    tombol.disabled = false;
    feedback('#invoice-list-status', error.message, true);
  }
}

function tanggalPendek(iso) {
  if (!iso) return '';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00+07:00` : iso);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}

function umurHari(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

// Baris tanggal: terbit, umur tunggakan, pelunasan, dan pengingat terakhir.
function teksTanggalInvoice(invoice) {
  const bagian = [`Terbit ${tanggalPendek(invoice.issuedAt)}`];
  if (invoice.status === 'unpaid') {
    const hari = umurHari(invoice.issuedAt);
    bagian.push(hari ? `belum dibayar ${hari} hari` : 'terbit hari ini');
  }
  if (invoice.status === 'paid') {
    bagian.push(invoice.payment
      ? `dibayar ${tanggalPendek(invoice.payment.paidOn)} (${METODE_BAYAR[invoice.payment.method] || invoice.payment.method})`
      : `lunas ${tanggalPendek(invoice.paidAt)}`);
  }
  if (invoice.status === 'voided' && invoice.voidedAt) bagian.push(`dibatalkan ${tanggalPendek(invoice.voidedAt)}`);
  if (invoice.lastReminder) bagian.push(`pengingat terakhir ${tanggalPendek(invoice.lastReminder.sentAt)}`);
  return bagian.join(' · ');
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
  rinci.textContent = `${studentLabel(invoice.studentId, invoice.studentName)} · ${invoice.description}`;
  const waktu = document.createElement('span');
  waktu.className = invoice.status === 'unpaid' && umurHari(invoice.issuedAt) > TUNGGAKAN_HARI ? 'op-row__date is-late' : 'op-row__date';
  waktu.textContent = teksTanggalInvoice(invoice);
  utama.append(judul, rinci, waktu);

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
    bayar.textContent = 'Tandai lunas';
    bayar.addEventListener('click', () => tandaiLunas(invoice).catch((error) => feedback('#invoice-list-status', error.message, true)));
    const ingat = document.createElement('button');
    ingat.type = 'button';
    ingat.className = 'button button--secondary op-action';
    ingat.textContent = 'Kirim pengingat';
    ingat.addEventListener('click', () => kirimPengingat(invoice, ingat));
    aksi.append(bayar, ingat);
  }

  // Kuitansi hanya ada untuk invoice lunas. Endpoint menolak selain itu dengan 404,
  // jadi tombolnya tidak ditampilkan daripada menjanjikan sesuatu yang pasti gagal.
  if (invoice.status === 'paid') {
    const kuitansi = document.createElement('button');
    kuitansi.type = 'button';
    kuitansi.className = 'button button--secondary op-action';
    kuitansi.textContent = 'Unduh kuitansi';
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
    riwayatTombol.textContent = terbuka ? 'Sembunyikan riwayat' : 'Riwayat koreksi';
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

// Daftar tagihan dimuat per halaman dari /api/operations/invoices (Task R6.2); pencarian
// dan "Muat lebih banyak" berjalan di server.
const INVOICE_PAGE_SIZE = 20;
let invoiceShown = 0;
let invoiceSearchText = '';
let invoiceStatusFilter = '';
let invoiceMonthFilter = '';
let invoiceSortOrder = 'newest';
let invoiceStudentFilter = null;
const TUNGGAKAN_HARI = 30;
let invoiceRequest = 0;
const invoiceTools = document.createElement('div');
invoiceTools.className = 'portal-student-tools';
const invoiceSearch = document.createElement('input');
invoiceSearch.type = 'search';
invoiceSearch.className = 'portal-student-search';
invoiceSearch.placeholder = 'Cari nomor, keterangan, atau nama santri...';
invoiceSearch.setAttribute('aria-label', 'Cari invoice');
invoiceSearch.id = 'invoice-search';
// Saring menurut status: belum dibayar, lunas, atau dibatalkan (difilter di server).
const invoiceStatus = document.createElement('select');
invoiceStatus.id = 'invoice-status-filter';
invoiceStatus.className = 'monitoring-select';
invoiceStatus.setAttribute('aria-label', 'Saring invoice menurut status');
invoiceStatus.add(new Option('Semua status', ''));
Object.entries(INVOICE_STATUS_LABELS).forEach(([nilai, teks]) => invoiceStatus.add(new Option(teks, nilai)));
// Bulan terbit (WIB) dan urutan; "terlama dulu" untuk menagih tunggakan paling lama.
const invoiceMonth = document.createElement('input');
invoiceMonth.type = 'month';
invoiceMonth.id = 'invoice-month-filter';
invoiceMonth.className = 'monitoring-select';
invoiceMonth.setAttribute('aria-label', 'Saring invoice menurut bulan terbit');
const invoiceSort = document.createElement('select');
invoiceSort.id = 'invoice-sort';
invoiceSort.className = 'monitoring-select';
invoiceSort.setAttribute('aria-label', 'Urutan invoice');
invoiceSort.add(new Option('Terbaru dulu', 'newest'));
invoiceSort.add(new Option('Terlama dulu', 'oldest'));
const invoiceFilterRow = document.createElement('div');
invoiceFilterRow.className = 'invoice-filter-row';
invoiceFilterRow.append(invoiceSearch, invoiceStatus, invoiceMonth, invoiceSort);
// Penanda santri terpilih dari tabel tunggakan, dengan tombol untuk melepasnya.
const invoiceStudentChip = document.createElement('p');
invoiceStudentChip.className = 'invoice-student-chip';
invoiceStudentChip.hidden = true;
// Laporan CSV per rentang bulan.
const reportRow = document.createElement('div');
reportRow.className = 'invoice-report-row';
const reportFrom = document.createElement('input');
reportFrom.type = 'month';
reportFrom.id = 'report-from';
reportFrom.className = 'monitoring-select';
reportFrom.setAttribute('aria-label', 'Laporan dari bulan');
const reportTo = document.createElement('input');
reportTo.type = 'month';
reportTo.id = 'report-to';
reportTo.className = 'monitoring-select';
reportTo.setAttribute('aria-label', 'Laporan sampai bulan');
const reportButton = document.createElement('button');
reportButton.type = 'button';
reportButton.className = 'button button--secondary op-action';
reportButton.id = 'download-report-range';
reportButton.textContent = 'Unduh laporan CSV';
const reportLabel = document.createElement('span');
reportLabel.textContent = 'Laporan tagihan:';
const reportSd = document.createElement('span');
reportSd.textContent = 's.d.';
reportRow.append(reportLabel, reportFrom, reportSd, reportTo, reportButton);
const invoiceHint = document.createElement('p');
invoiceHint.className = 'portal-student-hint';
invoiceHint.setAttribute('role', 'status');
invoiceTools.append(invoiceFilterRow, invoiceStudentChip, invoiceHint, reportRow);
invoiceList.before(invoiceTools);
const invoiceMore = document.createElement('button');
invoiceMore.type = 'button';
invoiceMore.className = 'button button--secondary';
invoiceMore.textContent = 'Muat lebih banyak';
invoiceMore.hidden = true;
invoiceList.after(invoiceMore);

function renderInvoices(invoices, append) {
  if (!append) invoiceList.replaceChildren();
  if (!invoices.length && !append) {
    const kosong = document.createElement('p');
    kosong.className = 'form-status';
    kosong.textContent = invoiceSearchText || invoiceStatusFilter || invoiceMonthFilter || invoiceStudentFilter
      ? 'Tidak ada invoice yang cocok dengan pencarian atau filter ini.'
      : 'Belum ada invoice. Terbitkan tagihan lewat formulir di atas.';
    invoiceList.append(kosong);
    return;
  }
  invoiceList.append(...invoices.map(invoiceRow));
}

// append: tambahkan halaman berikutnya. Tanpa append, muat ulang dari awal sebanyak yang
// sudah tampil (paling banyak 100), supaya posisi pengguna tidak hilang setelah mengubah tagihan.
async function loadInvoices({ append = false } = {}) {
  const token = ++invoiceRequest;
  const params = new URLSearchParams();
  const offset = append ? invoiceShown : 0;
  params.set('limit', String(append ? INVOICE_PAGE_SIZE : Math.min(100, Math.max(INVOICE_PAGE_SIZE, invoiceShown))));
  params.set('offset', String(offset));
  if (invoiceSearchText) params.set('search', invoiceSearchText);
  if (invoiceStatusFilter) params.set('status', invoiceStatusFilter);
  if (invoiceMonthFilter) params.set('month', invoiceMonthFilter);
  if (invoiceSortOrder === 'oldest') params.set('sort', 'oldest');
  if (invoiceStudentFilter) params.set('studentId', invoiceStudentFilter.id);
  invoiceStudentChip.hidden = !invoiceStudentFilter;
  if (invoiceStudentFilter) {
    const lepas = document.createElement('button');
    lepas.type = 'button';
    lepas.className = 'button button--secondary op-action';
    lepas.textContent = 'Tampilkan semua santri';
    lepas.addEventListener('click', () => { invoiceStudentFilter = null; invoiceShown = 0; loadInvoices().catch((error) => { invoiceHint.textContent = error.message; }); });
    invoiceStudentChip.replaceChildren(document.createTextNode(`Tagihan ${invoiceStudentFilter.name} `), lepas);
  }
  invoiceMore.disabled = true;
  try {
    const result = await jsonRequest(`/api/operations/invoices?${params}`, { headers: headers() });
    if (token !== invoiceRequest) return;
    renderInvoices(result.items, append);
    invoiceShown = offset + result.items.length;
    invoiceMore.hidden = invoiceShown >= result.total;
    invoiceHint.textContent = result.total > invoiceShown || invoiceSearchText || invoiceStatusFilter || invoiceMonthFilter || invoiceStudentFilter
      ? `Menampilkan ${invoiceShown} dari ${result.total} invoice.`
      : '';
  } finally {
    invoiceMore.disabled = false;
  }
}

let invoiceSearchTimer = null;
invoiceSearch.addEventListener('input', () => {
  clearTimeout(invoiceSearchTimer);
  invoiceSearchTimer = setTimeout(() => {
    invoiceSearchText = invoiceSearch.value.trim();
    invoiceShown = 0;
    loadInvoices().catch((error) => { invoiceHint.textContent = error.message; });
  }, 250);
});
invoiceStatus.addEventListener('change', () => {
  invoiceStatusFilter = invoiceStatus.value;
  invoiceShown = 0;
  loadInvoices().catch((error) => { invoiceHint.textContent = error.message; });
});
invoiceMonth.addEventListener('change', () => {
  invoiceMonthFilter = invoiceMonth.value;
  invoiceShown = 0;
  loadInvoices().catch((error) => { invoiceHint.textContent = error.message; });
});
invoiceSort.addEventListener('change', () => {
  invoiceSortOrder = invoiceSort.value;
  invoiceShown = 0;
  loadInvoices().catch((error) => { invoiceHint.textContent = error.message; });
});
reportButton.addEventListener('click', () => unduhLaporan({ dari: reportFrom.value, sampai: reportTo.value, tombol: reportButton }));

// Saringan dari kartu ringkasan dan tautan beranda: status, urutan, bulan, santri.
function terapkanSaringan({ status = '', sort = 'newest', month = '', student = null } = {}) {
  invoiceStatusFilter = status;
  invoiceStatus.value = status;
  invoiceSortOrder = sort;
  invoiceSort.value = sort;
  invoiceMonthFilter = month;
  invoiceMonth.value = month;
  invoiceSearchText = '';
  invoiceSearch.value = '';
  invoiceStudentFilter = student;
  invoiceShown = 0;
  const tab = document.querySelector('#tab-btn-invoices');
  if (tab) switchOpTab(tab);
  invoiceTools.scrollIntoView({ block: 'start' });
  return loadInvoices().catch((error) => { invoiceHint.textContent = error.message; });
}

invoiceMore.addEventListener('click', () => loadInvoices({ append: true }).catch((error) => { invoiceHint.textContent = error.message; }));

// Tanpa rentang: semua tagihan, visa, dan inventaris (tombol di topbar). Dengan rentang
// bulan: hanya tagihan yang terbit pada bulan-bulan itu.
async function unduhLaporan({ dari = '', sampai = '', tombol = downloadReportButton } = {}) {
  try {
    if (dari && sampai && dari > sampai) throw new Error('Bulan awal laporan tidak boleh setelah bulan akhir.');
    const params = new URLSearchParams();
    if (dari) params.set('dari', dari);
    if (sampai) params.set('sampai', sampai);
    const tanggal = new Date().toISOString().slice(0, 10);
    const nama = dari || sampai ? `laporan-tagihan-hamasah-${dari || 'awal'}-sd-${sampai || 'kini'}.csv` : `laporan-operasional-hamasah-${tanggal}.csv`;
    await unduhBerkas(`/api/operations/report.csv${params.toString() ? `?${params}` : ''}`, nama, tombol);
    feedback('#invoice-list-status', dari || sampai ? 'Laporan tagihan diunduh.' : 'Laporan operasional diunduh.');
  } catch (error) {
    feedback('#invoice-list-status', error.message, true);
  }
}

// Riwayat keuangan: GET /api/operations/riwayat (jejak audit tagihan), terbaru dulu.
const LABEL_RIWAYAT = {
  'invoice.created': 'menerbitkan tagihan',
  'invoice.bulk-created': 'menerbitkan tagihan massal',
  'invoice.paid': 'menandai lunas',
  'invoice.corrected': 'mengoreksi tagihan',
  'invoice.voided': 'membatalkan tagihan',
  'invoice.receipt-downloaded': 'mengunduh kuitansi',
  'invoice.reminder-sent': 'mengirim pengingat ke wali'
};
const historyMore = document.querySelector('#history-more');
let riwayatTampil = 0;

function riwayatRow(item) {
  const baris = document.createElement('div');
  baris.className = 'op-row';
  const utama = document.createElement('div');
  utama.className = 'op-row__main';
  const judul = document.createElement('strong');
  const m = item.metadata || {};
  const sasaran = item.action === 'invoice.bulk-created'
    ? `${m.jumlah} tagihan "${m.keterangan}" (${m.nomorAwal} sampai ${m.nomorAkhir})`
    : [m.number, m.receiptNumber, m.amount ? `Rp${Number(m.amount).toLocaleString('id-ID')}` : ''].filter(Boolean).join(' · ');
  judul.textContent = `${item.actorName || 'Sistem'} ${LABEL_RIWAYAT[item.action] || item.action}`;
  const rinci = document.createElement('span');
  rinci.textContent = [sasaran, item.action === 'invoice.reminder-sent' && m.penerima ? `${m.penerima} wali` : ''].filter(Boolean).join(' · ');
  const waktu = document.createElement('span');
  waktu.className = 'op-row__date';
  waktu.textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(item.occurredAt));
  utama.append(judul, rinci, waktu);
  baris.append(utama);
  return baris;
}

async function loadRiwayat({ append = false } = {}) {
  const offset = append ? riwayatTampil : 0;
  const hasil = await jsonRequest(`/api/operations/riwayat?limit=30&offset=${offset}`, { headers: headers() });
  if (!append) operationsList.replaceChildren();
  operationsList.append(...hasil.items.map(riwayatRow));
  riwayatTampil = offset + hasil.items.length;
  historyMore.hidden = riwayatTampil >= hasil.total;
  feedback('#history-status', hasil.total ? '' : 'Belum ada kejadian keuangan yang tercatat.');
}

if (historyMore) historyMore.addEventListener('click', () => loadRiwayat({ append: true }).catch((error) => feedback('#history-status', error.message, true)));

// Kartu angka di atas halaman. Setiap kartu menyaring daftar invoice atau membuka tab visa.
const RUPIAH_RINGKAS = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const financeSummary = document.querySelector('#finance-summary');

function kartuRingkasan(label, nilai, catatan, nada, aksi) {
  const kartu = document.createElement('button');
  kartu.type = 'button';
  kartu.className = `admin-kpi finance-kpi${nada ? ` admin-kpi--${nada}` : ''}`;
  const a = document.createElement('p');
  a.className = 'admin-kpi__label';
  a.textContent = label;
  const b = document.createElement('p');
  b.className = 'admin-kpi__value';
  b.textContent = nilai;
  const c = document.createElement('p');
  c.className = 'admin-kpi__note';
  c.textContent = catatan;
  kartu.append(a, b, c);
  kartu.addEventListener('click', aksi);
  return kartu;
}

async function loadRingkasan() {
  const r = await jsonRequest('/api/operations/ringkasan', { headers: headers() });
  const rp = (n) => `Rp${RUPIAH_RINGKAS.format(n)}`;
  const namaBulan = new Intl.DateTimeFormat('id-ID', { month: 'long', timeZone: 'UTC' }).format(new Date(`${r.month}-01T00:00:00Z`));
  financeSummary.replaceChildren(
    kartuRingkasan('Tunggakan', rp(r.outstanding.total), r.outstanding.count ? `${r.outstanding.count} tagihan belum dibayar` : 'Semua tagihan lunas', r.outstanding.count ? 'warn' : '', () => terapkanSaringan({ status: 'unpaid' })),
    kartuRingkasan(`Menunggak > ${r.overdueDays} hari`, rp(r.overdue.total), r.overdue.count ? `${r.overdue.count} tagihan, tagih yang terlama dulu` : 'Tidak ada', r.overdue.count ? 'danger' : '', () => terapkanSaringan({ status: 'unpaid', sort: 'oldest' })),
    kartuRingkasan(`Terkumpul ${namaBulan}`, rp(r.collectedThisMonth.total), `${r.collectedThisMonth.count} pembayaran`, '', () => terapkanSaringan({ status: 'paid' })),
    kartuRingkasan(`Terbit ${namaBulan}`, rp(r.issuedThisMonth.total), `${r.issuedThisMonth.count} tagihan`, '', () => terapkanSaringan({ month: r.month })),
    kartuRingkasan('Visa dan paspor', String(r.visa.expiring + r.visa.expired), r.visa.expired ? `${r.visa.expired} sudah lewat, ${r.visa.expiring} habis dalam 30 hari` : r.visa.expiring ? `${r.visa.expiring} habis dalam 30 hari` : 'Tidak ada yang segera habis', r.visa.expired ? 'danger' : r.visa.expiring ? 'warn' : '', () => switchOpTab(document.querySelector('#tab-btn-visa')))
  );
  financeSummary.hidden = false;
}

// Tunggakan per santri: GET /api/operations/tunggakan.
async function loadTunggakan() {
  const wadah = document.querySelector('#arrears-list');
  const hasil = await jsonRequest('/api/operations/tunggakan', { headers: headers() });
  wadah.replaceChildren();
  feedback('#arrears-status', hasil.items.length ? '' : 'Tidak ada tunggakan. Semua tagihan sudah lunas atau dibatalkan.');
  if (!hasil.items.length) return;
  const tabel = document.createElement('table');
  tabel.className = 'lms-progress-table arrears-table';
  tabel.innerHTML = '<caption class="sr-only">Tunggakan per santri</caption><thead><tr><th scope="col">Santri</th><th scope="col">Tagihan</th><th scope="col">Total</th><th scope="col">Tertua</th><th scope="col"><span class="sr-only">Aksi</span></th></tr></thead>';
  const isi = document.createElement('tbody');
  hasil.items.forEach((item) => {
    const baris = document.createElement('tr');
    const nama = document.createElement('th');
    nama.scope = 'row';
    nama.textContent = studentLabel(item.studentId, item.studentName);
    const jumlah = document.createElement('td');
    jumlah.textContent = String(item.count);
    const total = document.createElement('td');
    total.textContent = `Rp${item.total.toLocaleString('id-ID')}`;
    const tertua = document.createElement('td');
    const hari = umurHari(item.oldestIssuedAt);
    tertua.textContent = `${tanggalPendek(item.oldestIssuedAt)} (${hari} hari)`;
    if (hari > TUNGGAKAN_HARI) tertua.className = 'is-pending';
    const aksi = document.createElement('td');
    const lihat = document.createElement('button');
    lihat.type = 'button';
    lihat.className = 'button button--secondary op-action';
    lihat.textContent = 'Lihat tagihan';
    lihat.addEventListener('click', () => terapkanSaringan({ status: 'unpaid', sort: 'oldest', student: { id: item.studentId, name: nama.textContent } }));
    aksi.append(lihat);
    baris.append(nama, jumlah, total, tertua, aksi);
    isi.append(baris);
  });
  tabel.append(isi);
  wadah.append(tabel);
}

async function loadOperations() {
  const result = await jsonRequest('/api/operations', { headers: headers() });
  await Promise.all([
    loadInvoices(),
    loadRingkasan().catch(() => { financeSummary.hidden = true; }),
    loadTunggakan().catch((error) => feedback('#arrears-status', error.message, true)),
    loadRiwayat().catch((error) => feedback('#history-status', error.message, true))
  ]);
  renderInventory(result.inventory);
}

// Tautan dari beranda Portal: #belum-dibayar, #menunggak, #tunggakan, #visa.
function bukaDariAlamat() {
  const alamat = window.location.hash.slice(1);
  if (!alamat) return;
  if (alamat === 'belum-dibayar') terapkanSaringan({ status: 'unpaid' });
  if (alamat === 'menunggak') terapkanSaringan({ status: 'unpaid', sort: 'oldest' });
  if (alamat === 'tunggakan') {
    switchOpTab(document.querySelector('#tab-btn-invoices'));
    const bagian = document.querySelector('#tunggakan');
    if (bagian) { bagian.focus({ preventScroll: true }); bagian.scrollIntoView({ block: 'start' }); }
  }
  if (alamat === 'visa') switchOpTab(document.querySelector('#tab-btn-visa'));
  try { history.replaceState(null, '', window.location.pathname); } catch {}
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
  if (!document.querySelector('#invoice-student').value) {
    feedback('#invoice-status', 'Pilih santri yang akan ditagih.', true);
    return;
  }
  const kirimEmail = document.querySelector('#invoice-email').checked;
  try {
    const result = await jsonRequest('/api/operations/invoices', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: document.querySelector('#invoice-student').value,
        description: document.querySelector('#invoice-description').value,
        amount: Number(document.querySelector('#invoice-amount').value),
        kirimEmail
      })
    });
    event.target.reset();
    feedback('#invoice-status', `Invoice ${result.invoice.number} berhasil dibuat.${kirimEmail ? ' Email tagihan dikirim ke wali yang terhubung (bila email aktif).' : ''}`);
    await loadOperations();
  } catch (error) {
    feedback('#invoice-status', error.message, true);
  }
});

// Tagihan massal: satu keterangan dan nominal untuk banyak santri aktif sekaligus.
// Pratinjau dulu (POST tanpa terbitkan), lalu terbitkan isian yang sama persis. Mengubah
// isian setelah pratinjau membatalkan pratinjaunya.
const invoiceForm = document.querySelector('#invoice-form');
const bulkForm = document.querySelector('#bulk-invoice-form');
const bulkProgram = document.querySelector('#bulk-program');
const bulkPreview = document.querySelector('#bulk-preview');
const bulkIssue = document.querySelector('#bulk-issue');
let bulkPratinjau = null;
let bulkPilihanDimuat = false;

function rupiahTeks(nilai) {
  return `Rp${Number(nilai).toLocaleString('id-ID')}`;
}

function isianMassal() {
  return {
    program: bulkProgram.value,
    description: document.querySelector('#bulk-description').value.trim(),
    amount: Number(document.querySelector('#bulk-amount').value)
  };
}

async function muatPilihanMassal() {
  if (bulkPilihanDimuat) return;
  const pilihan = await jsonRequest('/api/operations/invoices/massal', { headers: headers() });
  bulkProgram.replaceChildren(new Option(`Semua santri aktif (${pilihan.activeStudents})`, ''));
  pilihan.groups.forEach((item) => bulkProgram.add(new Option(`${item.value} (${item.count})`, item.value)));
  pilihan.programs.forEach((item) => bulkProgram.add(new Option(`  ${item.value} (${item.count})`, item.value)));
  bulkPilihanDimuat = true;
}

function batalkanPratinjau() {
  bulkPratinjau = null;
  bulkPreview.hidden = true;
}

function isiDaftar(selector, items, teks) {
  document.querySelector(selector).replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.textContent = teks(item);
    return li;
  }));
}

function tampilkanPratinjau(hasil) {
  const jumlah = hasil.sasaran.length;
  document.querySelector('#bulk-summary').textContent = jumlah
    ? `${jumlah} tagihan × ${rupiahTeks(hasil.amount)} = ${rupiahTeks(hasil.total)} untuk "${hasil.description}".`
    : `Tidak ada santri yang perlu ditagih untuk "${hasil.description}".`;
  document.querySelector('#bulk-targets').hidden = !jumlah;
  document.querySelector('#bulk-targets-summary').textContent = `Santri yang akan ditagih (${jumlah})`;
  isiDaftar('#bulk-target-list', hasil.sasaran, (item) => `${item.name} · ${item.program}`);
  const dilewati = document.querySelector('#bulk-skipped');
  dilewati.hidden = !hasil.dilewati.length;
  document.querySelector('#bulk-skipped-summary').textContent = `Dilewati karena sudah ditagih (${hasil.dilewati.length})`;
  isiDaftar('#bulk-skipped-list', hasil.dilewati, (item) => `${item.name} · ${item.alasan}`);
  bulkIssue.hidden = !jumlah;
  bulkIssue.textContent = `Terbitkan ${jumlah} tagihan`;
  bulkPreview.hidden = false;
}

document.querySelectorAll('input[name="invoice-mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const massal = radio.value === 'massal' && radio.checked;
    if (!radio.checked) return;
    invoiceForm.hidden = massal;
    bulkForm.hidden = !massal;
    if (massal) muatPilihanMassal().catch((error) => feedback('#bulk-status', error.message, true));
  });
});

bulkForm.addEventListener('input', batalkanPratinjau);
bulkForm.addEventListener('change', batalkanPratinjau);

bulkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const isian = isianMassal();
  if (isian.description.length < 3 || !Number.isInteger(isian.amount) || isian.amount <= 0) {
    feedback('#bulk-status', 'Isi keterangan (minimal 3 karakter) dan nominal bilangan bulat lebih dari nol.', true);
    return;
  }
  feedback('#bulk-status', 'Menyiapkan pratinjau...');
  try {
    const hasil = await jsonRequest('/api/operations/invoices/massal', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(isian)
    });
    bulkPratinjau = isian;
    tampilkanPratinjau(hasil);
    feedback('#bulk-status', '');
  } catch (error) {
    batalkanPratinjau();
    feedback('#bulk-status', error.message, true);
  }
});

bulkIssue.addEventListener('click', async () => {
  if (!bulkPratinjau) return;
  const isian = bulkPratinjau;
  const jumlah = document.querySelectorAll('#bulk-target-list li').length;
  if (!window.confirm(`Terbitkan ${jumlah} tagihan "${isian.description}" sebesar ${rupiahTeks(isian.amount)} per santri?`)) return;
  bulkIssue.disabled = true;
  feedback('#bulk-status', 'Menerbitkan tagihan...');
  try {
    const hasil = await jsonRequest('/api/operations/invoices/massal', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...isian, terbitkan: true, kirimEmail: document.querySelector('#bulk-email').checked })
    });
    const nomor = hasil.invoices.map((invoice) => invoice.number);
    bulkForm.reset();
    batalkanPratinjau();
    feedback('#bulk-status', `${nomor.length} tagihan terbit (${nomor[0]} sampai ${nomor[nomor.length - 1]}).${hasil.dilewati.length ? ` ${hasil.dilewati.length} santri dilewati karena sudah ditagih.` : ''}`);
    await loadOperations();
  } catch (error) {
    batalkanPratinjau();
    feedback('#bulk-status', error.message, true);
    await loadOperations().catch(() => {});
  } finally {
    bulkIssue.disabled = false;
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
    const me = await window.hamasahMintaAkun(headers());
    if (!me.ok) throw new Error(me.body.error || 'Permintaan belum dapat diproses.');
    const result = me.body;
    if (!OPERATIONS_ROLES.includes(result.account.role)) throw new Error('Halaman ini hanya dapat dibuka oleh admin atau keuangan.');
    guard.hidden = true;
    consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, result.account.role, 'operations', result.account);
    const muatData = async () => {
      // Daftar santri dimuat lebih dulu supaya panel visa menampilkan nama, bukan UUID.
      await loadStudents().catch(() => {});
      await Promise.all([loadOperations(), loadVisaReminders(), loadVisaDocuments()]);
    };
    window.hamasahSaatDataSegar(muatData);
    await muatData();
    bukaDariAlamat();
    window.addEventListener('hashchange', bukaDariAlamat);
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
    const judul = guard.querySelector('h1');
    if (judul) judul.textContent = 'Akses operasional belum tersedia';
  }
}());
