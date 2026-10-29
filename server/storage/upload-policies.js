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
  'video/mp4': 'mp4',
  'video/webm': 'webm',
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
  'course-cover': Object.freeze({ entityType: 'course', visibility: 'private', contentTypes: GAMBAR, maxBytes: 3 * MB,
    async canUpload({ actor, entityId, services }) { return Boolean(actor) && services.lmsService.canManageFiles(entityId, actor); },
    async canDownload(ctx) { return POLICIES['course-file'].canDownload(ctx); }
  }),
  'course-video': Object.freeze({
    entityType: 'course', visibility: 'private',
    contentTypes: Object.freeze(['video/mp4', 'video/webm']), maxBytes: 100 * MB,
    async canUpload({ actor, entityId, services }) {
      return Boolean(actor) && services.lmsService.canManageFiles(entityId, actor);
    },
    async canDownload(ctx) {
      if (!ctx.actor) return false;
      if (['admin', 'teacher', 'supervisor'].includes(ctx.actor.role)) return ctx.services.lmsService.canManageFiles(ctx.entityId, ctx.actor);
      return ctx.actor.role === 'student' && POLICIES['course-file'].canDownload(ctx);
    }
  }),
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

  // Foto galeri dokumentasi di beranda (halaman Konten Website). Publik: ditampilkan
  // lewat /media/galeri/<id> (app.js), dari domain situs sendiri sesuai CSP img-src.
  'gallery-photo': Object.freeze({
    entityType: 'gallery',
    visibility: 'public',
    contentTypes: GAMBAR,
    // Peramban sudah mengecilkan foto ke 1600 px (konten.js), hasilnya jauh di bawah 1 MB.
    maxBytes: 2 * MB,
    async canUpload({ actor }) {
      return Boolean(actor) && roleHasPermission(actor.role, 'content.manage');
    },
    async canDownload() {
      return true;
    }
  }),

  // Foto profil santri di kartu musyrif dan beranda keluarga. Foto yang berlaku adalah
  // unggahan siap terbaru (student-photo-service.js), jadi tidak butuh kolom baru.
  // Yang mengunggah: admin dan musyrif asrama santri itu.
  'student-photo': Object.freeze({
    entityType: 'student',
    visibility: 'private',
    contentTypes: GAMBAR,
    // Peramban sudah mengecilkan foto ke 800 px (beranda-musyrif.js).
    maxBytes: 1 * MB,
    async canUpload({ actor, entityId, services }) {
      if (!actor || !['admin', 'supervisor'].includes(actor.role)) return false;
      return (await services.studentPortalService.accessFor(entityId, actor)).write;
    },
    async canDownload({ actor, entityId, services }) {
      if (!actor) return false;
      return (await services.studentPortalService.accessFor(entityId, actor)).view;
    }
  }),

  // Dokumen pribadi santri (paspor, iqamah, identitas, ijazah, surat, kesehatan). Privat. Yang
  // mengunggah: admin dan musyrif yang berhak menulis data santri itu. Yang membuka mengikuti
  // visibilitas tiap dokumen (admin, staf, keluarga) lewat studentProfileService.bolehUnduh.
  'student-document': Object.freeze({
    entityType: 'student',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 5 * MB,
    async canUpload({ actor, entityId, services }) {
      if (!actor || !['admin', 'supervisor'].includes(actor.role)) return false;
      return (await services.studentPortalService.accessFor(entityId, actor)).write;
    },
    async canDownload({ actor, record, services }) {
      return Boolean(actor && record) && services.studentProfileService.bolehUnduh(record.id, actor);
    }
  }),
  // Bukti penyelesaian tiket tindak lanjut (paspor, iqamah, lapor diri, dan sebagainya). Privat: hanya admin dan
  // musyrif yang berhak atas santri itu yang mengunggah dan membukanya.
  'case-evidence': Object.freeze({
    entityType: 'student',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 5 * MB,
    async canUpload({ actor, entityId, services }) {
      if (!actor || !['admin', 'supervisor'].includes(actor.role)) return false;
      return (await services.studentPortalService.accessFor(entityId, actor)).write;
    },
    async canDownload({ actor, entityId, services }) {
      if (!actor || !['admin', 'supervisor'].includes(actor.role)) return false;
      return (await services.studentPortalService.accessFor(entityId, actor)).view;
    }
  }),  // Pindaian surat (formulir pendaftaran offline, pernyataan wali, permohonan pengunduran diri). Privat. Admin dan petugas
  // pendaftaran untuk santri mana pun; musyrif hanya untuk santri asramanya.
  'letter-scan': Object.freeze({
    entityType: 'student',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 8 * MB,
    async canUpload({ actor, entityId, services }) {
      if (!actor) return false;
      // Surat umum (tanpa santri) memakai entityId "umum": hanya admin dan petugas pendaftaran.
      if (entityId === 'umum') return ['admin', 'registration-officer'].includes(actor.role);
      const akses = await services.studentPortalService.accessFor(entityId, actor);
      if (!akses.exists) return false;
      if (['admin', 'registration-officer'].includes(actor.role)) return true;
      return actor.role === 'supervisor' && akses.write;
    },
    async canDownload({ actor, entityId, services }) {
      if (!actor) return false;
      if (entityId === 'umum') return ['admin', 'registration-officer'].includes(actor.role);
      const akses = await services.studentPortalService.accessFor(entityId, actor);
      if (!akses.exists) return false;
      if (['admin', 'registration-officer'].includes(actor.role)) return true;
      return actor.role === 'supervisor' && akses.view;
    }
  }),  // Bukti pelaksanaan KPI dan bukti pekerjaan tambahan musyrif. Privat. entityId = id akun musyrif pemilik. Hanya musyrif itu
  // sendiri dan admin yang mengunggah dan membukanya.
  'kpi-evidence': Object.freeze({
    entityType: 'account',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 5 * MB,
    async canUpload({ actor, entityId }) {
      return Boolean(actor && (actor.role === 'admin' || (actor.role === 'supervisor' && String(actor.id) === String(entityId))));
    },
    async canDownload({ actor, entityId }) {
      return Boolean(actor && (actor.role === 'admin' || (actor.role === 'supervisor' && String(actor.id) === String(entityId))));
    }
  }),  // Foto aset dan bukti pembelian inventaris asrama. Privat dan hanya untuk staf yang berhak atas asrama itu (admin, musyrif
  // yang memegang asrama). Berbeda dengan galeri asrama, wali dan santri tidak melihatnya.
  'inventory-file': Object.freeze({
    entityType: 'dormitory',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 5 * MB,
    async canUpload({ actor, entityId, services }) {
      return Boolean(actor) && services.dormitoryManagementService.bolehUnggahFoto(entityId, actor);
    },
    async canDownload({ actor, entityId, services }) {
      return Boolean(actor) && services.dormitoryManagementService.bolehUnggahFoto(entityId, actor);
    }
  }),
  // Bukti pembayaran kontribusi AC, bukti pembelian AC, dan bukti pencairan refund. Hanya admin dan keuangan.
  'ac-proof': Object.freeze({
    entityType: 'dormitory',
    visibility: 'private',
    contentTypes: DOKUMEN,
    maxBytes: 5 * MB,
    async canUpload({ actor }) {
      return Boolean(actor && ['admin', 'finance'].includes(actor.role));
    },
    async canDownload({ actor }) {
      return Boolean(actor && ['admin', 'finance'].includes(actor.role));
    }
  }),  // Foto kegiatan santri. Pembatasan asrama untuk musyrif ikut berlaku, karena
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

  // Galeri asrama (migrasi 051): foto kegiatan satu asrama, entityId = id asrama.
  // Yang mengunggah: musyrif asrama itu dan admin. Yang melihat: pengelola asrama itu,
  // serta santri dan wali yang ananda-nya tinggal di asrama itu.
  'dormitory-photo': Object.freeze({
    entityType: 'dormitory',
    visibility: 'private',
    contentTypes: GAMBAR,
    // Peramban sudah mengecilkan foto ke 1280 px (galeri-asrama.js).
    maxBytes: 2 * MB,
    async canUpload({ actor, entityId, services }) {
      return Boolean(actor) && services.dormitoryManagementService.bolehUnggahFoto(entityId, actor);
    },
    async canDownload({ actor, entityId, services, record }) {
      return Boolean(actor) && services.dormitoryManagementService.bolehLihatFoto(entityId, actor, record);
    }
  }),
  // Video kegiatan asrama (item 18): internal saja, tidak pernah dipublikasikan. Thumbnail (bingkai poster) memakai 'dormitory-photo'.
  'dormitory-video': Object.freeze({
    entityType: 'dormitory',
    visibility: 'private',
    contentTypes: Object.freeze(['video/mp4', 'video/webm']),
    maxBytes: 30 * MB,
    // Sejak migrasi 079 video kegiatan memakai tautan YouTube; tidak ada unggahan video baru ke storage.
    async canUpload() {
      return false;
    },
    async canDownload({ actor, entityId, services, record }) {
      return Boolean(actor) && services.dormitoryManagementService.bolehLihatFoto(entityId, actor, record);
    }
  }),

  // Lampiran materi maddah.
  'course-file': Object.freeze({
    entityType: 'course',
    visibility: 'private',
    contentTypes: Object.freeze(['application/pdf']),
    maxBytes: 20 * MB,
    async canUpload({ actor, entityId, services }) {
      return Boolean(actor) && services.lmsService.canManageFiles(entityId, actor);
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
  if (contentType === 'video/mp4') return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  if (contentType === 'video/webm') return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
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
