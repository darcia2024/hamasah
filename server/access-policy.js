// Peta izin: satu tempat untuk menjawab "role mana boleh melakukan apa".
//
// Route memakai peta ini untuk menolak lebih awal (401 kalau belum masuk, 403 kalau
// rolenya memang tidak berhak). Service tetap memeriksa izinnya sendiri. Dua lapis
// ini sengaja: route menjaga agar pesan dan status konsisten, service menjaga agar
// pemanggil lain (skrip seed, test, job) tidak bisa melewati aturan.

const ROLES = Object.freeze({
  ADMIN: 'admin',
  REGISTRATION_OFFICER: 'registration-officer',
  SUPERVISOR: 'supervisor',
  TEACHER: 'teacher',
  FINANCE: 'finance',
  PARENT: 'parent',
  STUDENT: 'student'
});

const PERMISSIONS = Object.freeze({
  'accounts.manage': Object.freeze([ROLES.ADMIN]),
  // Daftar asrama dan penugasan musyrif. Hanya admin, karena ini menentukan
  // siapa boleh melihat santri yang mana.
  'dormitories.manage': Object.freeze([ROLES.ADMIN]),
  // Catatan audit memuat siapa melakukan apa di seluruh sistem, jadi hanya admin.
  'audit.read': Object.freeze([ROLES.ADMIN]),

  'registrations.read': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),
  'registrations.update-status': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),
  'registrations.convert': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),

  'articles.write': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),

  // Mencatat dan mengubah data santri. Wali dan santri tidak pernah menulis.
  'students.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Membaca data santri. Siapa yang boleh melihat santri yang mana tetap ditentukan
  // service: wali hanya anaknya, santri hanya dirinya sendiri.
  'students.read': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.PARENT, ROLES.STUDENT]),

  // Membuat maddah, menambah materi, dan mendaftarkan santri ke maddah.
  'courses.manage': Object.freeze([ROLES.ADMIN, ROLES.TEACHER]),
  // Membuka isi maddah. Santri hanya maddah yang diikutinya sendiri.
  'courses.read': Object.freeze([ROLES.ADMIN, ROLES.TEACHER, ROLES.SUPERVISOR, ROLES.STUDENT]),

  // Tagihan dan kuitansi.
  'finance.manage': Object.freeze([ROLES.ADMIN, ROLES.FINANCE]),
  // Visa dan inventaris berada di konsol yang sama dengan keuangan.
  'operations.read': Object.freeze([ROLES.ADMIN, ROLES.FINANCE]),
  'operations.manage': Object.freeze([ROLES.ADMIN, ROLES.FINANCE])
});

const NOT_SIGNED_IN = 'Silakan masuk terlebih dahulu.';
const NOT_ALLOWED = 'Anda tidak memiliki akses ke fitur ini.';

function rolesFor(permission) {
  if (!Object.prototype.hasOwnProperty.call(PERMISSIONS, permission)) {
    // Salah ketik nama izin tidak boleh berakhir menjadi "semua boleh".
    throw new Error(`Izin tidak dikenal: ${permission}`);
  }
  return PERMISSIONS[permission];
}

function roleHasPermission(role, permission) {
  return rolesFor(permission).includes(role);
}

// Semua izin yang dimiliki satu role. Dipakai /api/me agar menu di layar hanya
// menampilkan yang memang bisa dibuka.
function permissionsForRole(role) {
  return Object.keys(PERMISSIONS).filter((permission) => PERMISSIONS[permission].includes(role)).sort();
}

module.exports = { NOT_ALLOWED, NOT_SIGNED_IN, PERMISSIONS, ROLES, permissionsForRole, roleHasPermission, rolesFor };
