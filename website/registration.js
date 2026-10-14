// Formulir konsultasi (daftar.html): validasi, pengiriman, dan tanda terima pendaftaran.
// Dipisah dari website.js sejak formulir pindah dari beranda ke halaman sendiri.

const form = document.querySelector('#registration-form');
const status = document.querySelector('#form-status');
const submitButton = form.querySelector('.submit-button');
const registrationTracker = document.querySelector('#registration-tracker');
const registrationTrackerCopy = document.querySelector('#registration-tracker-copy');
const checkRegistrationStatus = document.querySelector('#check-registration-status');
const registrationReceipt = document.querySelector('#registration-receipt');
const fields = {
  fullName: form.querySelector('#full-name'),
  phone: form.querySelector('#phone'),
  email: form.querySelector('#email'),
  birthDate: form.querySelector('#birth-date'),
  gender: form.querySelector('#gender'),
  schoolOrigin: form.querySelector('#school-origin'),
  // id dibedakan dari section #program di halaman yang sama, supaya label tetap menunjuk ke select ini.
  program: form.querySelector('#program-tujuan'),
  educationLevel: form.querySelector('#education-level'),
  city: form.querySelector('#city'),
  guardianName: form.querySelector('#guardian-name'),
  guardianPhone: form.querySelector('#guardian-phone'),
  guardianEmail: form.querySelector('#guardian-email'),
  guardianConsent: form.querySelector('#guardian-consent'),
  // Persetujuan pemrosesan data pribadi. Terpisah dari `consent`, yang hanya
  // persetujuan untuk dihubungi kembali, dan wajib untuk semua jalur program.
  dataProcessingConsent: form.querySelector('#data-processing-consent'),
  consent: form.querySelector('#consent')
};

function setFieldError(field, message) {
  const error = document.querySelector(`#${field.id}-error`);
  const group = field.closest('.field-group');
  if (group) group.classList.toggle('is-invalid', Boolean(message));
  field.setAttribute('aria-invalid', String(Boolean(message)));
  if (error) error.textContent = message;
}

// Aturan validasi dipakai bersama dengan server lewat registration-domain.js,
// supaya formulir tidak pernah mewajibkan sesuatu yang tidak diwajibkan server, atau sebaliknya.
const registrationDomain = globalThis.HamasahRegistrationDomain;

// Field yang hanya berlaku untuk jalur calon santri, bukan Hamasah Courses.
const guardianFields = [fields.educationLevel, fields.guardianName, fields.guardianPhone];

function readRegistrationForm() {
  return {
  applicantName: fields.fullName.value,
  phone: fields.phone.value,
    email: fields.email.value,
    birthDate: fields.birthDate.value,
    gender: fields.gender.value,
    schoolOrigin: fields.schoolOrigin.value,
    program: fields.program.value,
    educationLevel: fields.educationLevel.value,
    city: fields.city.value,
    guardianName: fields.guardianName.value,
    guardianPhone: fields.guardianPhone.value,
    guardianEmail: fields.guardianEmail.value,
    guardianConsent: fields.guardianConsent.checked,
    dataProcessingConsent: fields.dataProcessingConsent.checked,
    consent: fields.consent.checked
  };
}

function syncProgramFields() {
  const hanyaKursus = fields.program.value === registrationDomain.PROGRAMS.COURSES;
  const catatanKelas = document.querySelector('#program-courses-note');
  if (catatanKelas) catatanKelas.hidden = !hanyaKursus;
  const profileFields = [fields.birthDate, fields.gender, fields.schoolOrigin, fields.guardianEmail, fields.guardianConsent];
  guardianFields.concat(profileFields).forEach((field) => {
    const group = field.closest('.field-group') || field.closest('.field-consent-wrap');
    if (group) group.hidden = hanyaKursus;
    if (hanyaKursus && field !== fields.email) {
      if (field.type === 'checkbox') field.checked = false;
      else field.value = '';
      setFieldError(field, '');
    }
  });
}

function validateForm() {
  const result = registrationDomain.validateApplicant(readRegistrationForm());
  const errorByField = [
    [fields.fullName, result.errors.applicantName],
    [fields.phone, result.errors.phone],
    [fields.email, result.errors.email],
    [fields.birthDate, result.errors.birthDate],
    [fields.gender, result.errors.gender],
    [fields.schoolOrigin, result.errors.schoolOrigin],
    [fields.program, result.errors.program],
    [fields.educationLevel, result.errors.educationLevel],
    [fields.guardianName, result.errors.guardianName],
    [fields.guardianPhone, result.errors.guardianPhone],
    [fields.guardianEmail, result.errors.guardianEmail],
    [fields.guardianConsent, result.errors.guardianConsent],
    [fields.dataProcessingConsent, result.errors.dataProcessingConsent],
    [fields.consent, result.errors.consent]
  ];
  errorByField.forEach(([field, message]) => setFieldError(field, message || ''));
  return result.valid;
}

function readRegistrationSession() {
  try {
    const saved = sessionStorage.getItem('hamasahRegistration');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

async function refreshRegistrationStatus() {
  const saved = readRegistrationSession();
  if (!saved || !saved.registrationId || !saved.accessToken) return;
  registrationTracker.hidden = false;
  const openFullTracker = document.querySelector('#open-full-tracker');
  if (openFullTracker) {
    // Token sesi tidak ditaruh di URL (bisa bocor lewat riwayat browser, tangkapan layar,
    // atau tautan yang dibagikan). cek-status.js membacanya dari sessionStorage yang sama.
    openFullTracker.href = `cek-status.html?id=${encodeURIComponent(saved.registrationId)}`;
  }
  registrationTrackerCopy.textContent = `Memeriksa status ${saved.registrationId}...`;
  try {
    const response = await fetch(`/api/registrations/${encodeURIComponent(saved.registrationId)}`, {
      headers: { Authorization: `Bearer ${saved.accessToken}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Status belum tersedia.');
    registrationTrackerCopy.textContent = `${result.registration.registrationId}: ${result.registration.statusLabel}. Progres saat ini ${result.registration.progress}%.`;
  } catch (error) {
    registrationTrackerCopy.textContent = error.message || 'Status belum dapat diperbarui.';
  }
}

checkRegistrationStatus.addEventListener('click', refreshRegistrationStatus);
refreshRegistrationStatus();

Object.values(fields).forEach((field) => {
  field.addEventListener('input', () => {
    if (field.getAttribute('aria-invalid') === 'true') validateForm();
  });
  field.addEventListener('change', () => {
    if (field.getAttribute('aria-invalid') === 'true') validateForm();
  });
});

fields.program.addEventListener('change', syncProgramFields);
// Tombol daftar di halaman program membawa ?program=..., jadi pilihan program sudah terisi.
(function preselectProgram() {
  const requested = new URLSearchParams(window.location.search).get('program');
  if (requested && Object.values(registrationDomain.PROGRAMS).includes(requested)) {
    fields.program.value = requested;
  }
})();
syncProgramFields();

// Setelah data tersimpan, WhatsApp admin dibuka dengan pesan yang sudah terisi, supaya
// pendaftar langsung tersambung dengan admin. Nomor admin diisi server lewat
// <meta name="hamasah-whatsapp"> (bisa diubah dari Konten Website). Kode Akses tidak ikut
// dikirim ke admin karena itu rahasia pendaftar.
const NOMOR_ADMIN = String((document.querySelector('meta[name="hamasah-whatsapp"]') || {}).content || '6281288489997').replace(/\D/g, '');

function pesanUntukAdmin(isian, registrationId) {
  const opsi = fields.program.querySelector(`option[value="${isian.program}"]`);
  const baris = [
    "Assalamu'alaikum, admin Hamasah International.",
    '',
    'Saya baru mengisi formulir konsultasi di website.',
    `Nama: ${isian.applicantName.trim()}`,
    `Program: ${opsi ? opsi.textContent.trim() : isian.program}`
  ];
  if (isian.city.trim()) baris.push(`Kota: ${isian.city.trim()}`);
  baris.push(`Nomor registrasi: ${registrationId}`, '', 'Mohon info langkah selanjutnya. Terima kasih.');
  return `https://wa.me/${NOMOR_ADMIN}?text=${encodeURIComponent(baris.join('\n'))}`;
}

// Kode Akses hanya dikirim server sekali, saat pendaftaran dibuat (yang disimpan hanya
// hash-nya). Tanpa kode ini pendaftar tidak bisa membuka Cek status di perangkat lain atau
// setelah tab ditutup, jadi kode ditampilkan jelas dan bisa disalin atau dikirim ke WA sendiri.
function showRegistrationReceipt(registrationId, accessCode, urlAdmin) {
  if (!registrationReceipt || !accessCode) return;
  const tombolAdmin = registrationReceipt.querySelector('#receipt-admin');
  if (tombolAdmin && urlAdmin) {
    tombolAdmin.href = urlAdmin;
    tombolAdmin.hidden = false;
  }
  const lines = [
    'Pendaftaran Hamasah International',
    `Nomor registrasi: ${registrationId}`,
    `Kode Akses: ${accessCode}`,
    `Cek status: ${new URL('cek-status.html', window.location.href).href}`
  ].join('\n');
  registrationReceipt.querySelector('#receipt-registration-id').textContent = registrationId;
  registrationReceipt.querySelector('#receipt-access-code').textContent = accessCode;
  registrationReceipt.querySelector('#receipt-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(lines)}`;
  const copyButton = registrationReceipt.querySelector('#receipt-copy');
  const copyStatus = registrationReceipt.querySelector('#receipt-copy-status');
  copyStatus.textContent = '';
  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(lines);
      copyStatus.textContent = 'Tersalin. Tempel di catatan atau pesan untuk diri sendiri.';
    } catch {
      copyStatus.textContent = 'Tidak bisa menyalin otomatis. Catat nomor dan kode di atas secara manual.';
    }
  };
  registrationReceipt.hidden = false;
  registrationReceipt.scrollIntoView({ behavior: 'smooth', block: 'center' });
  registrationReceipt.focus({ preventScroll: true });
}

// Saklar "Pendaftaran online" dan periode penerimaan dari halaman Pengaturan. Bila gagal
// dibaca, formulir tetap tampil: server tetap menolak dengan pesan yang sama saat dikirim.
(async function terapkanPengaturanPendaftaran() {
  try {
    const response = await fetch('/api/settings/public');
    if (!response.ok) return;
    const { pendaftaran } = await response.json();
    const periode = document.querySelector('#registration-period');
    if (periode && pendaftaran.periode) periode.textContent = pendaftaran.periode;
    const tutup = document.querySelector('#registration-closed');
    if (!pendaftaran.dibuka && tutup) {
      tutup.querySelector('#registration-closed-message').textContent = pendaftaran.pesanTutup;
      tutup.hidden = false;
      form.hidden = true;
    }
  } catch {
    // Jaringan putus: biarkan formulir apa adanya.
  }
}());

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.classList.remove('is-error');
  if (!validateForm()) {
    status.textContent = 'Periksa kembali kolom yang masih perlu dilengkapi.';
    status.classList.add('is-error');
    form.querySelector('[aria-invalid="true"]').focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Mengirim data...';
  status.textContent = '';
  const isian = readRegistrationForm();
  // Tab WhatsApp dibuka sekarang, selagi masih dalam klik pengguna, lalu diarahkan setelah
  // server menjawab. Bila dibuka sesudah menunggu server, peramban memblokirnya.
  const tabWa = window.open('', '_blank');
  try {
    const response = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isian)
    });
    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('application/json') ? await response.json() : {};
    if (!response.ok) {
      const messages = Object.values(result.errors || {});
      throw new Error(messages[0] || result.error || 'Layanan formulir belum dapat dihubungi.');
    }
    sessionStorage.setItem('hamasahRegistration', JSON.stringify({
      registrationId: result.registration.registrationId,
      accessToken: result.accessToken
    }));
    const urlAdmin = pesanUntukAdmin(isian, result.registration.registrationId);
    if (tabWa && !tabWa.closed) {
      tabWa.opener = null;
      tabWa.location.href = urlAdmin;
      status.textContent = 'Data tersimpan. WhatsApp admin sudah terbuka di tab baru, tinggal tekan kirim.';
    } else {
      status.textContent = 'Data tersimpan. Tekan "Kirim pesan ke admin" untuk melanjutkan lewat WhatsApp.';
    }
    form.reset();
    showRegistrationReceipt(result.registration.registrationId, result.accessCode, urlAdmin);
    refreshRegistrationStatus();
  } catch (error) {
    if (tabWa && !tabWa.closed) tabWa.close();
    status.textContent = error.message || 'Layanan formulir belum dapat dihubungi.';
    status.classList.add('is-error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Kirim data konsultasi';
  }
});
