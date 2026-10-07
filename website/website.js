// Jawaban tiap pertanyaan tertulis di halaman (#faq-sources), supaya bisa diubah admin dari
// halaman Konten Website tanpa mengubah skrip ini.
const questionButtons = document.querySelectorAll('.faq-question');
const answerPanel = document.querySelector('#faq-answer');
const answerSources = document.querySelector('#faq-sources');

function renderAnswer(topic, title, text) {
  const topicElement = document.createElement('p');
  topicElement.className = 'faq-answer__topic';
  topicElement.textContent = topic;
  const titleElement = document.createElement('h3');
  titleElement.textContent = title;
  const textElement = document.createElement('p');
  textElement.textContent = text;
  answerPanel.replaceChildren(topicElement, titleElement, textElement);
}

questionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const source = answerSources && answerSources.querySelector(`[data-answer="${button.dataset.answer}"]`);
    if (!source) return;
    questionButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    answerPanel.replaceChildren(...[...source.children].map((node) => node.cloneNode(true)));
  });
});

const faqForm = document.querySelector('#faq-form');
const faqInput = document.querySelector('#faq-question-input');
const faqFormStatus = document.querySelector('#faq-form-status');

faqForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  faqFormStatus.textContent = '';
  try {
    const response = await fetch('/api/faq/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: faqInput.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pertanyaan belum dapat diproses.');
    renderAnswer(result.label || 'Perlu konfirmasi', result.matched ? 'Jawaban otomatis' : 'Belum bisa dijawab otomatis', result.answer);
    // Jawaban kata kunci bisa meleset, jadi selalu ada jalan ke admin.
    const followUp = document.createElement('p');
    followUp.className = 'faq-answer__handoff';
    const link = document.createElement('a');
    const nomorWa = document.querySelector('meta[name="hamasah-whatsapp"]');
    link.href = `https://wa.me/${(nomorWa && nomorWa.content) || '6287897591978'}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Tanya admin lewat WhatsApp';
    followUp.append('Jawaban ini dipilih otomatis dari informasi umum. Kurang pas? ', link);
    answerPanel.append(followUp);
  } catch (error) {
    faqFormStatus.textContent = error.message || 'Layanan pertanyaan belum dapat dihubungi.';
  }
});

const journalList = document.querySelector('#journal-list');

function renderArticles(items) {
  const fragment = document.createDocumentFragment();
  items.slice(0, 6).forEach((article, index) => {
    const item = document.createElement('a');
    item.className = 'journal-item';
    item.href = `article.html?slug=${encodeURIComponent(article.slug)}`;
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('div');
    const category = document.createElement('p');
    category.className = 'card-label';
    category.textContent = article.category;
    const title = document.createElement('h3');
    title.textContent = article.title;
    const excerpt = document.createElement('p');
    excerpt.textContent = article.excerpt;
    copy.append(category, title, excerpt);
    const arrow = document.createElement('b');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '';
    arrow.classList.add('btn-arrow');
    item.append(number, copy, arrow);
    fragment.append(item);
  });
  journalList.replaceChildren(fragment);
}

fetch('/api/articles?limit=6')
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Artikel belum tersedia.')))
  .then((result) => {
    if (Array.isArray(result.items) && result.items.length) renderArticles(result.items);
  })
  .catch(() => {});

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

// Kode Akses hanya dikirim server sekali, saat pendaftaran dibuat (yang disimpan hanya
// hash-nya). Tanpa kode ini pendaftar tidak bisa membuka Cek status di perangkat lain atau
// setelah tab ditutup, jadi kode ditampilkan jelas dan bisa disalin atau dikirim ke WA sendiri.
function showRegistrationReceipt(registrationId, accessCode) {
  if (!registrationReceipt || !accessCode) return;
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
  try {
    const response = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readRegistrationForm())
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
    status.textContent = 'Pendaftaran awal berhasil dibuat. Tim kami akan menghubungi Anda lewat WhatsApp.';
    form.reset();
    showRegistrationReceipt(result.registration.registrationId, result.accessCode);
    refreshRegistrationStatus();
  } catch (error) {
    status.textContent = error.message || 'Layanan formulir belum dapat dihubungi.';
    status.classList.add('is-error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Kirim data konsultasi';
  }
});

// Galeri dokumentasi: foto dibuka besar di <dialog>, bisa digeser dengan tombol atau panah
// keyboard. Keterangan diambil dari teks kartu foto itu sendiri.
(function galeri() {
  const items = [...document.querySelectorAll('.lp-photos__item')];
  const dialog = document.querySelector('#lp-lightbox');
  if (!items.length || !dialog || typeof dialog.showModal !== 'function') return;
  const gambar = dialog.querySelector('#lp-lightbox-img');
  const keterangan = dialog.querySelector('#lp-lightbox-caption');
  const hitungan = dialog.querySelector('#lp-lightbox-count');
  let aktif = 0;
  let pemicu = null;

  function tampilkan(indeks) {
    aktif = (indeks + items.length) % items.length;
    const foto = items[aktif].querySelector('img');
    gambar.src = foto.currentSrc || foto.src;
    gambar.alt = foto.alt;
    keterangan.textContent = items[aktif].querySelector('.lp-photos__caption').textContent;
    hitungan.textContent = `${aktif + 1} dari ${items.length}`;
  }

  items.forEach((item, indeks) => item.addEventListener('click', () => {
    pemicu = item;
    tampilkan(indeks);
    dialog.showModal();
  }));
  dialog.querySelector('#lp-lightbox-prev').addEventListener('click', () => tampilkan(aktif - 1));
  dialog.querySelector('#lp-lightbox-next').addEventListener('click', () => tampilkan(aktif + 1));
  dialog.querySelector('#lp-lightbox-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') tampilkan(aktif - 1);
    if (event.key === 'ArrowRight') tampilkan(aktif + 1);
  });
  // Klik di luar foto (latar gelap) menutup.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (pemicu) pemicu.focus();
  });
}());
