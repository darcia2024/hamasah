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
  // Petugas pendaftaran boleh mengirim ulang undangan onboarding, tanpa hak
  // membuat atau menonaktifkan akun secara umum.
  'accounts.invitation-send': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),
  // Daftar asrama dan penugasan musyrif. Hanya admin, karena ini menentukan
  // siapa boleh melihat santri yang mana.
  'dormitories.manage': Object.freeze([ROLES.ADMIN]),
  // Catatan audit memuat siapa melakukan apa di seluruh sistem, jadi hanya admin.
  'audit.read': Object.freeze([ROLES.ADMIN]),
  // Ringkasan seluruh santri, asrama, dan musyrif di dashboard super admin.
  'overview.read': Object.freeze([ROLES.ADMIN]),
  // Monitoring pusat: daftar masalah santri dan perubahan statusnya.
  'monitoring.read': Object.freeze([ROLES.ADMIN]),
  'monitoring.manage': Object.freeze([ROLES.ADMIN]),
  // Urusan administrasi santri (lapor diri, lapor pendidikan, status pendidikan): diisi musyrif
  // untuk santri di asramanya, admin untuk semua.
  'urusan.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Impor santri massal dari Excel atau Google Sheets: hanya admin, karena membuat santri dan akun.
  'students.import': Object.freeze([ROLES.ADMIN]),
  // Program pembinaan dan batch per lokasi (Mesir, Indonesia). Petugas hanya menyentuh lokasi yang
  // ditugaskan kepadanya; menugaskan petugas ke lokasi hanya admin. Riwayat pembinaan satu santri
  // dilihat santri, walinya, musyrif yang berhak, dan admin.
  'programs.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.REGISTRATION_OFFICER]),
  'programs.admin': Object.freeze([ROLES.ADMIN]),
  'programs.history': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.PARENT, ROLES.STUDENT]),
  // Ringkasan perkembangan santri di asrama yang dipegang, untuk beranda musyrif.
  // Admin ikut memegang izin ini (semua asrama), sesuai aturan admin memegang semua izin.
  'overview.dormitory': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Kelola Asrama: jadwal, agenda, piket, kas, dan inventaris asrama yang dipegang.
  'dormitory-management.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Jadwal, agenda, dan piket asrama ananda untuk santri dan wali.
  'dormitory-schedule.read': Object.freeze([ROLES.ADMIN, ROLES.PARENT, ROLES.STUDENT]),
  // Mengisi, mengganti kata sandi, dan menghapus data demo dari dashboard.
  'demo.manage': Object.freeze([ROLES.ADMIN]),
  // Halaman Pengaturan: saklar fitur dan pembaruan database.
  'settings.manage': Object.freeze([ROLES.ADMIN]),
  // Halaman Konten Website: biaya, program, kontak, testimoni, FAQ, pengumuman.
  'content.manage': Object.freeze([ROLES.ADMIN]),
  // Halaman Template: pesan WhatsApp, email, kop dan rekening PDF, dokumen pendaftar.
  'templates.manage': Object.freeze([ROLES.ADMIN]),
  // Memilih santri teladan bulanan dan mengatur fase roadmap studi.
  'honors.manage': Object.freeze([ROLES.ADMIN]),
  // Pengumuman ke santri dan wali: admin ke semua, musyrif ke asrama yang dipegang.
  'announcements.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Pengajuan izin dibuat santri, diputuskan musyrif asramanya atau admin.
  'leave.request': Object.freeze([ROLES.STUDENT]),
  'leave.decide': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Santri yang pulang ke Indonesia memengaruhi pembayarannya, jadi keuangan ikut melihat daftarnya.
  'leave.payment-read': Object.freeze([ROLES.ADMIN, ROLES.FINANCE]),
  // "Kirim doa untuk ananda": wali menulis, musyrif asramanya dan admin membaca.
  'family-messages.send': Object.freeze([ROLES.PARENT]),
  'family-messages.read': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Kritik, saran, apresiasi, dan keluhan wali. Keluhan privat hanya sampai ke admin; selebihnya admin dan musyrif asramanya.
  // Pesan personal musyrif ke santri. Privat: wali hanya melihat yang sengaja dibagikan staf (lihat student-message-service.js).
  'personal-messages.read': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.PARENT, ROLES.STUDENT]),
  'personal-messages.send': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  'personal-messages.ack': Object.freeze([ROLES.STUDENT]),
  // Absensi kegiatan: musyrif mengisi untuk santri di asramanya, admin semua; jenis kegiatan hanya admin.
  // Buku setoran tahfidz: dicatat musyrif dan admin; santri dan wali melihat perkembangan anaknya.
  'tahfidz.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  'tahfidz.read': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.PARENT, ROLES.STUDENT]),
  // Rapor bulanan: musyrif menyusun dan mengajukan; siapa yang menerbitkan diatur di pengaturan rapor (hanya admin yang mengubahnya).
  'reports.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  'reports.config': Object.freeze([ROLES.ADMIN]),
  'reports.read': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.PARENT, ROLES.STUDENT]),
  'attendance.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  'activities.admin': Object.freeze([ROLES.ADMIN]),
  'feedback.send': Object.freeze([ROLES.PARENT]),
  // Daftar kiriman wali sendiri. Admin memegang semua izin baca; layanannya tetap hanya melayani akun wali.
  'feedback.mine': Object.freeze([ROLES.ADMIN, ROLES.PARENT]),
  'feedback.read': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Iqamah: santri dan wali melihat sisa masa berlaku; santri melapor tanggal baru;
  // musyrif asramanya atau admin mengecek dan mengisi tanggal. Penanda "sedang diurus"
  // boleh dipasang santri sendiri maupun musyrif.
  'residence.read': Object.freeze([ROLES.ADMIN, ROLES.PARENT, ROLES.STUDENT]),
  'residence.report': Object.freeze([ROLES.STUDENT]),
  'residence.renewal': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.STUDENT]),
  'residence.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),

  'registrations.read': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),
  'registrations.update-status': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),
  'registrations.convert': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),
  // Kloter keberangkatan dan penugasan pendaftar ke kloter.
  'departures.manage': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),

  'articles.write': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),

  // Pesan konsultasi dari formulir publik. Ditangani petugas pendaftaran karena
  // isinya calon pendaftar, sama seperti daftar pendaftaran.
  'inquiries.read': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),
  'inquiries.manage': Object.freeze([ROLES.ADMIN, ROLES.REGISTRATION_OFFICER]),

  // Mencatat dan mengubah data santri. Wali dan santri tidak pernah menulis.
  'students.manage': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR]),
  // Hanya admin: mengubah data inti santri (nama, program, status lulus atau keluar),
  // membuat santri, memindahkan asrama, dan menghubungkan akun santri/wali. Musyrif
  // tetap mencatat pembinaan lewat students.manage.
  'students.edit': Object.freeze([ROLES.ADMIN]),
  // Membaca data santri. Siapa yang boleh melihat santri yang mana tetap ditentukan
  // service: wali hanya anaknya, santri hanya dirinya sendiri.
  'students.read': Object.freeze([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.PARENT, ROLES.STUDENT]),

  // Membuat maddah, menambah materi, dan mendaftarkan santri ke maddah.
  'courses.manage': Object.freeze([ROLES.ADMIN, ROLES.TEACHER, ROLES.SUPERVISOR]),
  // Membuka isi maddah. Santri hanya maddah yang diikutinya sendiri.
  'courses.read': Object.freeze([ROLES.ADMIN, ROLES.TEACHER, ROLES.SUPERVISOR, ROLES.STUDENT]),

  // Toko kelas daring (kelas.html): pembeli melihat pesanannya dan membeli kelas; admin
  // mengatur harga dan kelas mana yang dijual. Admin ikut memegang shop.buy karena admin
  // memegang semua izin baca; layanannya tetap hanya melayani akun santri/pembeli.
  'shop.buy': Object.freeze([ROLES.ADMIN, ROLES.STUDENT]),
  'shop.manage': Object.freeze([ROLES.ADMIN]),

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
