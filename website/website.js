const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');
const navLinks = navigation.querySelectorAll('a');

function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  navigation.classList.remove('is-open');
  document.body.classList.remove('menu-open');
}

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  navigation.classList.toggle('is-open', !isOpen);
  document.body.classList.toggle('menu-open', !isOpen);
});

navLinks.forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});

const answers = {
  program: {
    topic: 'Tentang Hamasah',
    title: 'Pendamping pendidikan bagi pelajar Indonesia menuju Al-Azhar, Mesir.',
    text: 'Hamasah International membantu proses dari awal pendaftaran hingga pelajar tiba dan terdaftar sebagai mahasiswa di Kairo.'
  },
  registration: {
    topic: 'Tentang persiapan bahasa',
    title: 'Calon mahasiswa tidak harus sudah mahir bahasa Arab untuk memulai proses.',
    text: 'Peserta mengikuti Ujian Tahdid Mustawa untuk mengetahui level bahasa Arab, lalu menjalani tahapan persiapan yang sesuai sebelum seleksi.'
  },
  mahad: {
    topic: 'Tentang Program Ma\'had',
    title: 'Ma\'had Al-Azhar memadukan ilmu keislaman, bahasa Arab, dan pelajaran umum.',
    text: 'Jalur pendidikan formal ini mencakup jenjang Ibtidai, I\'dadi, dan Tsanawi. Tahap registrasi, orientasi, penempatan bahasa, serta evaluasi mengikuti ketentuan dan kesiapan masing-masing peserta.'
  },
  parent: {
    topic: 'Tentang pendaftaran',
    title: 'Pendaftaran dimulai dengan formulir dan verifikasi berkas.',
    text: 'Tahap berikutnya dapat mencakup Tahdid Mustawa, Dauroh Ta’hili, ujian muadalah, pemberkasan, dan persiapan keberangkatan sesuai ketentuan yang berlaku.'
  },
  documents: {
    topic: 'Tentang dokumen awal',
    title: 'Mulai dengan paspor, dokumen pendidikan, dan bukti pendukung yang diminta.',
    text: 'Untuk pendaftaran dari luar Mesir, Al-Azhar mencantumkan paspor berlaku, sertifikat kesehatan, dokumen pendidikan, serta bukti pendaftaran elektronik atau nomor registrasi. Periksa kembali daftar aktif sebelum mengirim berkas.'
  }
};

const questionButtons = document.querySelectorAll('.faq-question');
const answerPanel = document.querySelector('#faq-answer');

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
    const answer = answers[button.dataset.answer];
    questionButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderAnswer(answer.topic, answer.title, answer.text);
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
    renderAnswer(result.topic || 'Perlu konfirmasi', 'Jawaban informasi awal', result.answer);
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
    arrow.textContent = '→';
    item.append(number, copy, arrow);
    fragment.append(item);
  });
  journalList.replaceChildren(fragment);
}

fetch('/api/articles')
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
const fields = {
  fullName: form.querySelector('#full-name'),
  phone: form.querySelector('#phone'),
  program: form.querySelector('#program'),
  educationLevel: form.querySelector('#education-level'),
  city: form.querySelector('#city'),
  guardianName: form.querySelector('#guardian-name'),
  guardianPhone: form.querySelector('#guardian-phone'),
  consent: form.querySelector('#consent')
};

function setFieldError(field, message) {
  const error = document.querySelector(`#${field.id}-error`);
  const group = field.closest('.field-group');
  if (group) group.classList.toggle('is-invalid', Boolean(message));
  field.setAttribute('aria-invalid', String(Boolean(message)));
  if (error) error.textContent = message;
}

function validateForm() {
  let valid = true;
  setFieldError(fields.fullName, fields.fullName.value.trim() ? '' : 'Masukkan nama lengkap terlebih dahulu.');
  setFieldError(fields.phone, fields.phone.value.trim().length >= 8 ? '' : 'Masukkan nomor WhatsApp yang dapat dihubungi.');
  setFieldError(fields.program, fields.program.value ? '' : 'Pilih program tujuan.');
  setFieldError(fields.educationLevel, fields.educationLevel.value.trim() ? '' : 'Masukkan pendidikan terakhir.');
  setFieldError(fields.city, fields.city.value.trim() ? '' : 'Masukkan kota domisili.');
  setFieldError(fields.guardianName, fields.guardianName.value.trim() ? '' : 'Masukkan nama wali.');
  setFieldError(fields.guardianPhone, fields.guardianPhone.value.trim().length >= 8 ? '' : 'Masukkan nomor WhatsApp wali.');
  setFieldError(fields.consent, fields.consent.checked ? '' : 'Persetujuan diperlukan sebelum melanjutkan.');
  Object.values(fields).forEach((field) => {
    if (field.getAttribute('aria-invalid') === 'true') valid = false;
  });
  return valid;
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
      body: JSON.stringify({
        applicantName: fields.fullName.value,
        phone: fields.phone.value,
        program: fields.program.value,
        educationLevel: fields.educationLevel.value,
        city: fields.city.value,
        guardianName: fields.guardianName.value,
        guardianPhone: fields.guardianPhone.value,
        consent: fields.consent.checked
      })
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
    status.textContent = `Pendaftaran awal berhasil dibuat. Nomor registrasi Anda: ${result.registration.registrationId}. Simpan nomor ini untuk tindak lanjut bersama tim Hamasah.`;
    form.reset();
    refreshRegistrationStatus();
  } catch (error) {
    status.textContent = error.message || 'Layanan formulir belum dapat dihubungi.';
    status.classList.add('is-error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Kirim data awal';
  }
});
