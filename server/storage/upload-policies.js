// Aturan per tujuan unggahan: siapa boleh mengunggah, siapa boleh mengunduh,
// tipe apa yang diterima, dan sebesar apa.
//
// Semua di satu berkas supaya pertanyaan "siapa bisa membuka paspor santri" punya
// satu tempat jawaban, bukan tersebar di beberapa handler.

const { roleHasPermission } = require('../access-policy.js');

const KB = 1024;
const MB = 1024 * KB;

// Tanda tangan byte di awal berkas. Diperiksa karena Content-Type dan akhiran nama
// berkas keduanya berasal dari pengirim dan bisa dikarang: berkas .exe cukup diganti
// namanya menjadi .pdf untuk lolos kalau hanya nama yang diperiksa.
const SIGNATURES = Object.freeze({
  'application/pdf': [Object.freeze([0x25, 0x50, 0x44, 0x46, 0x2d])], // %PDF-
  'image/png': [Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  'image/jpeg': [Object.freeze([0xff, 0xd8, 0xff])],
  // WebP: "RIFF" di byte 0-3, lalu "WEBP" di byte 8-11.
  'image/webp': [Object.freeze([0x52, 0x49, 0x46, 0x46])]
});

const EXTENSIONS = Object.freeze({
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
});

const DOKUMEN = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);
const GAMBAR = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

function isStaff(actor) {
  return Boolean(actor) && ['admin', 'registration-officer'].includes(actor.role);
}

// Mencari id santri milik satu akun wali atau santri. Dipakai untuk memeriksa
// apakah sebuah tagihan memang milik anaknya.
async function studentsVisibleTo(services, actor) {
  if (!actor) return [];
  return services.studentPortalService.listForActor(actor);
}

const POLICIES = Object.freeze({
  // Paspor, ijazah, transkrip, surat kesehatan calon santri.
  'registration-document': Object.freeze({
    entityType: 'registration',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 5 * MB,
    async canUpload({ auth, entityId }) {
      return (await auth.isCandidate(entityId)) || Boolean(await auth.staffActor());
    },
    async canDownload({ auth, entityId }) {
      // Pendaftar hanya berkasnya sendiri, dikenali dari token pendaftarannya.
      return (await auth.isCandidate(entityId)) || Boolean(await auth.staffActor());
    }
  }),

  // Bukti transfer dari wali. Dipakai penuh mulai Phase 10.
  'payment-proof': Object.freeze({
    entityType: 'invoice',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 5 * MB,
    async canUpload(ctx) {
      return POLICIES['payment-proof'].canDownload(ctx);
    },
    async canDownload({ actor, entityId, services }) {
      if (!actor) return false;
      if (roleHasPermission(actor.role, 'finance.manage')) {
        return true;
      }
      if (actor.role !== 'parent') {
        return false;
      }
      const invoice = await services.operationsStore.getInvoice(entityId);
      if (!invoice) return false;
      const daftar = await studentsVisibleTo(services, actor);
      return daftar.some((santri) => santri.id === invoice.studentId);
    }
  }),

  // Gambar sampul artikel. Satu-satunya yang boleh berada di bucket publik.
  'article-cover': Object.freeze({
    entityType: 'article',
    visibility: 'public',
    contentTypes: GAMBAR,
    maxBytes: 2 * MB,
    async canUpload({ actor }) {
      return Boolean(actor) && roleHasPermission(actor.role, 'articles.write');
    },
    async canDownload() {
      return true;
    }
  }),

  // Foto kegiatan santri. Pembatasan asrama untuk musyrif ikut berlaku, karena
  // pemeriksaannya memakai dashboard santri yang sudah dibatasi.
  'student-media': Object.freeze({
    entityType: 'student',
    visibility: 'private',
    contentTypes: GAMBAR,
    maxBytes: 5 * MB,
    async canUpload({ actor, entityId, services }) {
      if (!actor || !['admin', 'supervisor'].includes(actor.role)) {
        return false;
      }
      return (await services.studentPortalService.dashboard(entityId, actor)).ok;
    },
    async canDownload({ actor, entityId, services }) {
      if (!actor) return false;
      // Wali dan santri boleh melihat fotonya sendiri. Penyaringannya sudah ada di
      // dashboard: wali lain dan santri lain ditolak di sana.
      return (await services.studentPortalService.dashboard(entityId, actor)).ok;
    }
  }),

  // Lampiran materi maddah.
  'course-file': Object.freeze({
    entityType: 'course',
    visibility: 'private',
    contentTypes: Object.freeze(['application/pdf']),
    maxBytes: 20 * MB,
    async canUpload({ actor }) {
      return Boolean(actor) && roleHasPermission(actor.role, 'courses.manage');
    },
    async canDownload({ actor, entityId, services }) {
      if (!actor) return false;
      if (roleHasPermission(actor.role, 'courses.manage')) {
        return true;
      }
      if (!roleHasPermission(actor.role, 'courses.read')) {
        return false;
      }
      if (actor.role !== 'student') {
        return true;
      }
      // Santri hanya boleh mengunduh lampiran maddah yang memang diikutinya.
      const daftar = await studentsVisibleTo(services, actor);
      for (const santri of daftar) {
        const maddah = await services.lmsService.listStudentCourses(santri.id, actor);
        if (maddah.ok && maddah.value.some((course) => course.id === entityId)) {
          return true;
        }
      }
      return false;
    }
  }),

  // Paspor, visa, dan izin tinggal santri yang sudah berangkat. Dipisahkan dari
  // registration-document karena pemiliknya sudah menjadi santri, bukan pendaftar,
  // dan yang mengurusnya bagian operasional, bukan petugas pendaftaran.
  //
  // Hanya peran operasional yang boleh membuka. Wali dan santri sengaja belum
  // diberi akses: memperlihatkan berkas keimigrasian kepada mereka adalah keputusan
  // yang perlu diambil pihak Hamasah, bukan efek samping dari task ini.
  'visa-document': Object.freeze({
    entityType: 'student',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 5 * MB,
    async canUpload({ actor }) {
      return Boolean(actor) && roleHasPermission(actor.role, 'operations.manage');
    },
    async canDownload({ actor }) {
      return Boolean(actor) && roleHasPermission(actor.role, 'operations.read');
    }
  }),

  // Tanda tangan dan stempel untuk dokumen resmi.
  'signature-asset': Object.freeze({
    entityType: 'organization',
    visibility: 'private',
    contentTypes: Object.freeze(['image/png']),
    maxBytes: 1 * MB,
    async canUpload({ actor }) {
      return Boolean(actor) && actor.role === 'admin';
    },
    async canDownload({ actor }) {
      return Boolean(actor) && actor.role === 'admin';
    }
  })
});

const PURPOSES = Object.freeze(Object.keys(POLICIES));

function policyFor(purpose) {
  if (!Object.prototype.hasOwnProperty.call(POLICIES, purpose)) {
    return null;
  }
  return POLICIES[purpose];
}

function extensionFor(contentType) {
  return EXTENSIONS[contentType] || 'bin';
}

// Memeriksa byte awal berkas terhadap tipe yang diakui pengirim.
function matchesSignature(contentType, buffer) {
  const daftar = SIGNATURES[contentType];
  if (!daftar) {
    return false;
  }
  const cocok = daftar.some((signature) => {
    if (buffer.length < signature.length) return false;
    return signature.every((byte, index) => buffer[index] === byte);
  });
  if (!cocok) {
    return false;
  }
  if (contentType === 'image/webp') {
    // RIFF saja belum cukup: format lain juga memakai RIFF di awal.
    return buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return true;
}

module.exports = { EXTENSIONS, POLICIES, PURPOSES, SIGNATURES, extensionFor, isStaff, matchesSignature, policyFor };
