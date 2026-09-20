// Aturan validasi pendaftaran yang dipakai browser DAN server, sengaja satu berkas.
//
// Berkas ini tetap di website/ meski Task R2.1 memindahkan modul server lain ke
// server/. Alasannya: index.html memuatnya lewat <script src="registration-domain.js">
// dan proyek ini tidak punya langkah build, jadi satu-satunya cara browser
// mendapatkannya adalah dari folder yang disajikan statis. Menaruh kanonisnya di
// server/ berarti menambah rute penyajian khusus, dan menyalinnya ke dua tempat
// berarti dua sumber kebenaran untuk aturan yang sama. Keduanya lebih buruk.
//
// Karena itu isinya harus tetap aman dibaca publik: hanya aturan validasi dan
// bentuk data. Jangan menambahkan rahasia, kunci, atau logika otorisasi di sini.
(function registrationDomainModule(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.HamasahRegistrationDomain = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function registrationDomainFactory() {
  const REGISTRATION_TIME_ZONE = 'Asia/Jakarta';

  const PROGRAMS = Object.freeze({
    KULIAH: 'kuliah-al-azhar',
    MAHAD: 'mahad-al-azhar',
    COURSES: 'hamasah-courses'
  });
  const GENDERS = Object.freeze(['putra', 'putri']);

  // Kontrak profil yang dipakai saat pendaftaran baru dan saat calon menyimpan perubahan.
  // Data lama tetap bisa dibaca, tetapi tidak boleh membuat record baru dengan profil setengah.
  const PROFILE_REQUIREMENTS = Object.freeze({
    [PROGRAMS.KULIAH]: Object.freeze({ email: true, birthDate: true, gender: true, schoolOrigin: true }),
    [PROGRAMS.MAHAD]: Object.freeze({ email: true, birthDate: true, gender: true, schoolOrigin: true }),
    [PROGRAMS.COURSES]: Object.freeze({ email: true, birthDate: false, gender: false, schoolOrigin: false })
  });

  const ROLES = Object.freeze({
    APPLICANT: 'applicant',
    REGISTRATION_OFFICER: 'registration-officer',
    ADMIN: 'admin'
  });

  const STATUSES = Object.freeze({
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    DOCUMENT_REVIEW: 'document-review',
    NEEDS_REVISION: 'needs-revision',
    ACADEMIC_PREPARATION: 'academic-preparation',
    READY_FOR_DEPARTURE: 'ready-for-departure',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  });

  const STATUS_LABELS = Object.freeze({
    [STATUSES.DRAFT]: 'Draf',
    [STATUSES.SUBMITTED]: 'Data awal dikirim',
    [STATUSES.DOCUMENT_REVIEW]: 'Pemeriksaan berkas',
    [STATUSES.NEEDS_REVISION]: 'Perlu perbaikan berkas',
    [STATUSES.ACADEMIC_PREPARATION]: 'Persiapan akademik',
    [STATUSES.READY_FOR_DEPARTURE]: 'Siap keberangkatan',
    [STATUSES.COMPLETED]: 'Proses selesai',
    [STATUSES.CANCELLED]: 'Dibatalkan'
  });

  const FORWARD_FLOW = Object.freeze({
    [STATUSES.DRAFT]: [STATUSES.SUBMITTED, STATUSES.CANCELLED],
    [STATUSES.SUBMITTED]: [STATUSES.DOCUMENT_REVIEW, STATUSES.CANCELLED],
    [STATUSES.DOCUMENT_REVIEW]: [STATUSES.NEEDS_REVISION, STATUSES.ACADEMIC_PREPARATION, STATUSES.CANCELLED],
    [STATUSES.NEEDS_REVISION]: [STATUSES.DOCUMENT_REVIEW, STATUSES.CANCELLED],
    [STATUSES.ACADEMIC_PREPARATION]: [STATUSES.READY_FOR_DEPARTURE, STATUSES.CANCELLED],
    [STATUSES.READY_FOR_DEPARTURE]: [STATUSES.COMPLETED, STATUSES.CANCELLED],
    [STATUSES.COMPLETED]: [],
    [STATUSES.CANCELLED]: []
  });

  const PROGRESS = Object.freeze({
    [STATUSES.DRAFT]: 0,
    [STATUSES.SUBMITTED]: 15,
    [STATUSES.DOCUMENT_REVIEW]: 35,
    [STATUSES.NEEDS_REVISION]: 35,
    [STATUSES.ACADEMIC_PREPARATION]: 60,
    [STATUSES.READY_FOR_DEPARTURE]: 85,
    [STATUSES.COMPLETED]: 100,
    [STATUSES.CANCELLED]: 0
  });

  function cleanString(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function normalizePhone(value) {
    const compact = cleanString(value).replace(/[\s().-]/g, '');
    if (!compact) return '';
    if (compact.startsWith('+62')) return compact;
    if (compact.startsWith('62')) return `+${compact}`;
    if (compact.startsWith('0')) return `+62${compact.slice(1)}`;
    return compact;
  }

  function isPhoneValid(value) {
    return /^\+?[1-9]\d{7,14}$/.test(value);
  }

  function normalizeEmail(value) {
    return cleanString(value).toLocaleLowerCase('en-US');
  }

  function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }

  function isAdult(birthDate, today = new Date()) {
    const date = new Date(`${birthDate}T00:00:00Z`);
    const threshold = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
    return date <= threshold;
  }

  function normalizeApplicant(input) {
    const raw = input || {};
    return {
      applicantName: cleanString(raw.applicantName),
      phone: normalizePhone(raw.phone),
      guardianName: cleanString(raw.guardianName),
      guardianPhone: normalizePhone(raw.guardianPhone),
      guardianEmail: normalizeEmail(raw.guardianEmail),
      guardianConsent: raw.guardianConsent === true,
      email: normalizeEmail(raw.email),
      birthDate: cleanString(raw.birthDate),
      gender: cleanString(raw.gender),
      schoolOrigin: cleanString(raw.schoolOrigin),
      programDetails: raw.programDetails && typeof raw.programDetails === 'object' && !Array.isArray(raw.programDetails) ? raw.programDetails : {},
      referralSource: cleanString(raw.referralSource),
      privacyPolicyVersion: cleanString(raw.privacyPolicyVersion) || 'v1',
      program: cleanString(raw.program),
      educationLevel: cleanString(raw.educationLevel),
      city: cleanString(raw.city),
      consent: raw.consent === true
    };
  }

  function validateApplicant(input, options) {
    const applicant = normalizeApplicant(input);
    const config = options || {};
    const requireProfile = config.requireProfile === true;
    const errors = {};

    if (applicant.applicantName.length < 3) {
      errors.applicantName = 'Nama lengkap minimal terdiri dari 3 karakter.';
    }
    if (!isPhoneValid(applicant.phone)) {
      errors.phone = 'Nomor WhatsApp tidak valid.';
    }
    if (!Object.values(PROGRAMS).includes(applicant.program)) {
      errors.program = 'Pilih program pendaftaran yang tersedia.';
    }
    if (applicant.program !== PROGRAMS.COURSES && applicant.guardianName.length < 3) {
      errors.guardianName = 'Nama wali diperlukan untuk jalur calon santri.';
    }
    if (applicant.program !== PROGRAMS.COURSES && !isPhoneValid(applicant.guardianPhone)) {
      errors.guardianPhone = 'Nomor WhatsApp wali tidak valid.';
    }
    if (applicant.program !== PROGRAMS.COURSES && !applicant.educationLevel) {
      errors.educationLevel = 'Jenjang pendidikan terakhir perlu diisi.';
    }
    if (!applicant.consent) {
      errors.consent = 'Persetujuan diperlukan sebelum data pendaftaran dikirim.';
    }
    const requirement = PROFILE_REQUIREMENTS[applicant.program];
    const memakaiProfil = requireProfile || Boolean(applicant.email || applicant.birthDate || applicant.gender || applicant.guardianEmail);
    if (memakaiProfil) {
      if (requireProfile || applicant.email) {
        if (!/^\S+@\S+\.\S+$/.test(applicant.email)) errors.email = 'Email calon santri tidak valid.';
      }
      if ((requireProfile && requirement && requirement.birthDate) || applicant.birthDate) {
        if (!isIsoDate(applicant.birthDate)) errors.birthDate = 'Tanggal lahir harus memakai format YYYY-MM-DD.';
      }
      if ((requireProfile && requirement && requirement.gender) || applicant.gender) {
        if (!GENDERS.includes(applicant.gender)) errors.gender = 'Jenis kelamin belum valid.';
      }
      if ((requireProfile && requirement && requirement.schoolOrigin) || applicant.schoolOrigin) {
        if (!applicant.schoolOrigin) errors.schoolOrigin = 'Sekolah asal perlu diisi.';
      }
      if (isIsoDate(applicant.birthDate) && new Date(`${applicant.birthDate}T00:00:00Z`) > new Date()) {
        errors.birthDate = 'Tanggal lahir tidak boleh berada di masa depan.';
      }
      if (isIsoDate(applicant.birthDate) && !isAdult(applicant.birthDate)) {
        if (applicant.guardianName.length < 3) errors.guardianName = 'Nama wali diperlukan untuk calon di bawah 18 tahun.';
        if (!isPhoneValid(applicant.guardianPhone)) errors.guardianPhone = 'Nomor WhatsApp wali diperlukan untuk calon di bawah 18 tahun.';
        if (!/^\S+@\S+\.\S+$/.test(applicant.guardianEmail)) errors.guardianEmail = 'Email wali diperlukan untuk calon di bawah 18 tahun.';
        if (!applicant.guardianConsent) errors.guardianConsent = 'Persetujuan wali diperlukan untuk calon di bawah 18 tahun.';
      }
    }

    if (requireProfile && requirement && requirement.birthDate && !isIsoDate(applicant.birthDate)) {
      errors.birthDate = 'Tanggal lahir wajib diisi dengan format YYYY-MM-DD.';
    }
    if (requireProfile && requirement && requirement.gender && !GENDERS.includes(applicant.gender)) {
      errors.gender = 'Jenis kelamin wajib dipilih.';
    }
    if (requireProfile && requirement && requirement.schoolOrigin && !applicant.schoolOrigin) {
      errors.schoolOrigin = 'Sekolah asal wajib diisi.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      value: applicant
    };
  }

  // Tahun pada nomor registrasi mengikuti tanggal di Indonesia, bukan UTC.
  // Pendaftaran pukul 07.30 malam 31 Desember WIB sudah masuk tahun berikutnya menurut UTC.
  function yearInTimeZone(date, timeZone) {
    const sourceDate = date instanceof Date ? date : new Date(date || Date.now());
    if (Number.isNaN(sourceDate.getTime())) {
      throw new Error('Tanggal pendaftaran tidak valid.');
    }
    return Number(new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || REGISTRATION_TIME_ZONE, year: 'numeric' }).format(sourceDate));
  }

  function formatRegistrationId(sequence, date, options) {
    const config = options || {};
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw new Error('Nomor urut pendaftaran harus berupa bilangan bulat positif.');
    }

    const year = Number.isInteger(config.year) ? config.year : yearInTimeZone(date, config.timeZone);
    return `HI-REG-${year}-${String(sequence).padStart(5, '0')}`;
  }

  function canTransition(from, to, role) {
    if (!Object.values(STATUSES).includes(from) || !Object.values(STATUSES).includes(to)) {
      return false;
    }

    if (role === ROLES.APPLICANT) {
      return from === STATUSES.DRAFT && to === STATUSES.SUBMITTED;
    }

    if (role === ROLES.REGISTRATION_OFFICER || role === ROLES.ADMIN) {
      return FORWARD_FLOW[from].includes(to);
    }

    return false;
  }

  function createApplication(input, options) {
    const config = options || {};
    const validation = validateApplicant(input, { requireProfile: true });
    if (!validation.valid) {
      return { ok: false, errors: validation.errors };
    }

    const createdAt = config.createdAt || new Date().toISOString();
    const registrationId = config.registrationId || formatRegistrationId(config.sequence || 1, createdAt, { year: config.year });
    const application = {
      registrationId,
      status: STATUSES.SUBMITTED,
      progress: PROGRESS[STATUSES.SUBMITTED],
      applicant: validation.value,
      createdAt,
      updatedAt: createdAt,
      statusHistory: [{
        from: STATUSES.DRAFT,
        to: STATUSES.SUBMITTED,
        changedAt: createdAt,
        changedBy: ROLES.APPLICANT,
        changedByAccountId: null,
        note: 'Data pendaftaran awal dikirim.'
      }]
    };

    return { ok: true, value: application };
  }

  function transitionApplication(application, nextStatus, actor, options) {
    const config = options || {};
    if (!application || !application.status) {
      return { ok: false, error: 'Data pendaftaran tidak tersedia.' };
    }
    if (!canTransition(application.status, nextStatus, actor)) {
      return { ok: false, error: 'Perubahan status tidak diizinkan untuk peran atau status saat ini.' };
    }

    const changedAt = config.changedAt || new Date().toISOString();
    const note = cleanString(config.note);
    const nextHistory = Array.isArray(application.statusHistory) ? application.statusHistory.slice() : [];
    nextHistory.push({
      from: application.status,
      to: nextStatus,
      changedAt,
      changedBy: actor,
      changedByAccountId: config.accountId || null,
      note
    });

    return {
      ok: true,
      value: {
        ...application,
        status: nextStatus,
        progress: PROGRESS[nextStatus],
        updatedAt: changedAt,
        statusHistory: nextHistory
      }
    };
  }

  return Object.freeze({
    PROGRAMS,
    GENDERS,
    REGISTRATION_TIME_ZONE,
    ROLES,
    STATUSES,
    STATUS_LABELS,
    PROGRESS,
    PROFILE_REQUIREMENTS,
    yearInTimeZone,
    normalizePhone,
    normalizeEmail,
    isAdult,
    normalizeApplicant,
    validateApplicant,
    formatRegistrationId,
    canTransition,
    createApplication,
    transitionApplication
  });
});
