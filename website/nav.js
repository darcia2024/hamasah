// Menu navigasi antar halaman staf/portal, ditampilkan sesuai role akun yang login.
//
// Daftar role di sini SENGAJA disamakan persis dengan pemeriksaan akses di masing-masing
// halaman tujuan (lihat guard di portal.js/staff.js/monitoring.js/lms.js/operations.js/
// audit.js). Kalau tidak disamakan, menu ini bisa menampilkan tautan yang begitu diklik
// langsung ditolak halaman tujuannya, lebih baik tautannya memang tidak muncul sama sekali.

const ROLE_NAV_LABELS = Object.freeze({
  student: {
    portal: 'Dashboard santri',
    lms: 'Ruang belajar (LMS)'
  },
  parent: {
    portal: 'Pantau Ananda'
  },
  supervisor: {
    portal: 'Portal Utama',
    monitoring: 'Monitoring Asrama',
    asrama: 'Kelola Asrama',
    pembinaan: 'Program & Batch',
    kegiatan: 'Kegiatan & Rapor',
    surat: 'Surat & Arsip',
    kpi: 'KPI Saya',
    inventaris: 'Inventaris & AC',
    'sesi-belajar': 'LMS: program & sesi',
    asisten: 'Asisten',
    lms: 'LMS: maddah'
  },
  'registration-officer': {
    portal: 'Portal Utama',
    staff: 'Pipeline Pendaftaran',
    surat: 'Surat & Arsip',
    pembinaan: 'Program & Batch'
  },
  teacher: {
    portal: 'Portal Utama',
    'sesi-belajar': 'Program LMS',
    lms: 'Kelola Maddah (LMS)'
  },
  finance: {
    portal: 'Portal Utama',
    operations: 'Keuangan & SPP',
    pengingat: 'Pengingat Tagihan',
    pembayaran: 'Pembayaran',
    inventaris: 'AC & Refund'
  },
  admin: {
    portal: 'Portal Utama',
    staff: 'Pendaftaran',
    monitoring: 'Monitoring Asrama',
    asrama: 'Kelola Asrama',
    pembinaan: 'Program & Batch',
    impor: 'Impor Santri',
    kegiatan: 'Kegiatan & Rapor',
    surat: 'Surat & Arsip',
    kpi: 'KPI Musyrif',
    inventaris: 'Inventaris & AC',
    'sesi-belajar': 'Program LMS',
    asisten: 'Asisten Hamasah',
    lms: 'LMS Maddah',
    operations: 'Keuangan & SPP',
    pengingat: 'Pengingat Tagihan',
    pembayaran: 'Pembayaran',
    akun: 'Kelola Akun',
    audit: 'Jejak Audit',
    konten: 'Konten Website',
    template: 'Template',
    pengaturan: 'Pengaturan'
  }
});

// Satu-satunya daftar nama peran yang tampil ke pengguna: chip peran, daftar akun,
// pilihan peran di formulir, dan filter Jejak Audit memakai nama dari sini.
const ROLE_DISPLAY_NAMES = Object.freeze({
  student: 'Santri',
  parent: 'Wali Santri',
  supervisor: 'Musyrif Asrama',
  'registration-officer': 'Petugas Pendaftaran',
  teacher: 'Guru / Asatidz',
  finance: 'Keuangan',
  admin: 'Super Admin'
});

// Urutan peran di pilihan formulir dan filter: staf dulu, lalu keluarga, admin terakhir.
const ROLE_ORDER = Object.freeze(['registration-officer', 'supervisor', 'teacher', 'finance', 'parent', 'student', 'admin']);

const STAFF_NAV_LINKS = Object.freeze([
  {
    href: 'portal',
    label: 'Portal',
    page: 'portal',
    roles: null,
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
  },
  {
    href: 'staff',
    label: 'Pendaftaran',
    page: 'staff',
    roles: ['admin', 'registration-officer'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h6"/></svg>'
  },
  {
    href: 'monitoring',
    label: 'Monitoring',
    page: 'monitoring',
    roles: ['admin', 'supervisor'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/><circle cx="12" cy="12" r="3"/></svg>'
  },
  // Kelola Asrama: jadwal, agenda, piket, uang kas, dan inventaris (asrama.js).
  {
    href: 'asrama',
    label: 'Kelola Asrama',
    page: 'asrama',
    roles: ['admin', 'supervisor'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h3M8 17h6"/></svg>'
  },
  // Program dan Batch: lokasi Mesir dan Indonesia, program pembinaan, dan batch (pembinaan.js).
  {
    href: 'pembinaan',
    label: 'Program & Batch',
    page: 'pembinaan',
    roles: ['admin', 'supervisor', 'registration-officer'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>'
  },
  // Absensi kegiatan, setoran tahfidz, dan rapor bulanan (kegiatan.js). Admin dan musyrif.
  {
    href: 'kegiatan',
    label: 'Kegiatan & Rapor',
    page: 'kegiatan',
    roles: ['admin', 'supervisor'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
  },
  // Surat masuk, surat keluar, dan arsip (surat.js). Admin, petugas pendaftaran, dan musyrif.
  {
    href: 'surat',
    label: 'Surat & Arsip',
    page: 'surat',
    roles: ['admin', 'registration-officer', 'supervisor'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'
  },
  // KPI musyrif dan musyrifah (kpi.js). Admin menilai; musyrif melihat KPI dirinya sendiri.
  {
    href: 'kpi',
    label: 'KPI Musyrif',
    page: 'kpi',
    roles: ['admin', 'supervisor'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  },
  // Program LMS dan sesi belajar bersama (sesi-belajar.js). Admin, pengajar, dan musyrif.
  {
    href: 'sesi-belajar',
    label: 'Sesi Belajar',
    page: 'sesi-belajar',
    roles: ['admin', 'teacher', 'supervisor'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  },
  // Asisten Hamasah: ringkasan dan draf dibantu AI untuk admin dan musyrif (asisten.js).
  {
    href: 'asisten',
    label: 'Asisten',
    page: 'asisten',
    roles: ['admin', 'supervisor'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z"/><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20l-.8-1.9-1.9-.8 1.9-.8z"/></svg>'
  },
  // Inventaris asrama dan AC patungan (inventaris.js). Admin dan musyrif mengelola aset; keuangan hanya bagian AC.
  {
    href: 'inventaris',
    label: 'Inventaris & AC',
    page: 'inventaris',
    roles: ['admin', 'supervisor', 'finance'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>'
  },
  // Pengingat tagihan lewat WhatsApp klik-untuk-chat (pengingat.js). Admin dan keuangan.
  {
    href: 'pengingat',
    label: 'Pengingat Tagihan',
    page: 'pengingat',
    roles: ['admin', 'finance'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  },
  // Integrasi dan rekonsiliasi pembayaran (pembayaran.js). Admin dan keuangan.
  {
    href: 'pembayaran',
    label: 'Pembayaran',
    page: 'pembayaran',
    roles: ['admin', 'finance'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>'
  },
  // Impor santri massal dari Excel atau Google Sheets (impor.js). Hanya admin.
  {
    href: 'impor',
    label: 'Impor Santri',
    page: 'impor',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  },
  {
    href: 'lms',
    label: 'LMS',
    page: 'lms',
    roles: ['admin', 'teacher', 'supervisor', 'student'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
  },
  {
    href: 'operations',
    label: 'Keuangan',
    page: 'operations',
    roles: ['admin', 'finance'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/><path d="M5 15h4M13 15h2"/></svg>'
  },
  // Visa dan inventaris berada di halaman Keuangan, tetapi diberi menu sendiri supaya tidak
  // tersembunyi di balik tab. Kunci page dibedakan agar tidak ikut tersorot di halaman Keuangan.
  {
    href: 'operations#visa',
    label: 'Visa & Paspor',
    page: 'operations-visa',
    roles: ['admin', 'finance'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/></svg>'
  },
  {
    href: 'operations#inventaris',
    label: 'Stok Kantor',
    page: 'operations-inventaris',
    roles: ['admin', 'finance'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>'
  },
  {
    href: 'akun',
    label: 'Kelola Akun',
    page: 'akun',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  },
  {
    href: 'audit',
    label: 'Audit',
    page: 'audit',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
  },
  {
    href: 'konten',
    label: 'Konten Website',
    page: 'konten',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>'
  },
  {
    href: 'template',
    label: 'Template',
    page: 'template',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h5"/></svg>'
  },
  {
    href: 'pengaturan',
    label: 'Pengaturan',
    page: 'pengaturan',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  }
]);

// Pengelompokan menu menurut fungsi, supaya akun dengan banyak menu (admin) tidak melihat daftar datar yang panjang.
const NAV_GRUP = Object.freeze({
  portal: 'Utama',
  staff: 'Santri dan asrama', monitoring: 'Santri dan asrama', asrama: 'Santri dan asrama', pembinaan: 'Santri dan asrama', kegiatan: 'Santri dan asrama', surat: 'Santri dan asrama', impor: 'Santri dan asrama', inventaris: 'Santri dan asrama', kpi: 'Santri dan asrama',
  lms: 'Pembelajaran', 'sesi-belajar': 'Pembelajaran', asisten: 'Utama',
  operations: 'Keuangan dan administrasi', pengingat: 'Keuangan dan administrasi', pembayaran: 'Keuangan dan administrasi', 'operations-visa': 'Keuangan dan administrasi', 'operations-inventaris': 'Keuangan dan administrasi',
  akun: 'Sistem dan konten', audit: 'Sistem dan konten', konten: 'Sistem dan konten', template: 'Sistem dan konten', pengaturan: 'Sistem dan konten'
});
// Pengecualian per peran: bagi keuangan, AC patungan dan refund adalah urusan keuangan.
const NAV_GRUP_PERAN = Object.freeze({ finance: Object.freeze({ inventaris: 'Keuangan dan administrasi' }) });
const NAV_URUTAN_GRUP = Object.freeze(['Utama', 'Santri dan asrama', 'Pembelajaran', 'Keuangan dan administrasi', 'Sistem dan konten']);
const NAV_MINIMAL_UNTUK_GRUP = 6;

function getInitials(name) {
  if (!name) return 'H';
  // Gelar di depan (Ust., Ustzh., H., Dr., dst.) tidak ikut jadi inisial:
  // "Ust. Ridwan Fathoni" menjadi RF, bukan UF.
  const GELAR = /^(ust|ustz|ustzh|ustadz|ustadzah|ustaz|ustazah|kh|h|hj|dr|drs|prof|ir)\.?$/i;
  // Gelar di belakang koma (", Lc", ", S.Pd") juga tidak ikut: "Ust Aji Nugeroho, Lc" menjadi AN.
  const semua = name.split(',')[0].trim().split(/\s+/).filter(Boolean);
  const parts = semua.length > 1 && GELAR.test(semua[0]) ? semua.slice(1) : semua;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// container: elemen <nav> kosong di header atau sidebar. role: role akun yang sedang login.
// currentPage: kunci "page" pada daftar di atas, supaya tautan halaman ini ditandai
// aria-current (dipakai CSS untuk menonjolkannya).
// account: objek akun dari /api/me (opsional) untuk update badge & avatar profil CRM.
function renderStaffNav(container, role, currentPage, account) {
  if (!container) return;
  const roleLabels = ROLE_NAV_LABELS[role] || {};
  const tautan = STAFF_NAV_LINKS.filter((link) => !link.roles || link.roles.includes(role));
  const kelompokkan = tautan.length >= NAV_MINIMAL_UNTUK_GRUP;
  const grupDari = (link) => ((NAV_GRUP_PERAN[role] || {})[link.page]) || NAV_GRUP[link.page] || 'Utama';
  const urut = kelompokkan ? [...tautan].sort((x, y) => NAV_URUTAN_GRUP.indexOf(grupDari(x)) - NAV_URUTAN_GRUP.indexOf(grupDari(y))) : tautan;
  let grupSekarang = null;
  container.replaceChildren(...urut.flatMap((link) => {
    const hasil = [];
    const grup = grupDari(link);
    if (kelompokkan && grup !== grupSekarang) {
      grupSekarang = grup;
      const judul = document.createElement('p');
      judul.className = 'crm-nav-subtitle';
      judul.textContent = grup;
      hasil.push(judul);
    }
    const a = document.createElement('a');
    a.href = link.href;
    const label = roleLabels[link.page] || link.label;
    const badgeHtml = link.badge ? `<span class="crm-badge-counter crm-badge-counter--${link.badgeType}">${link.badge}</span>` : '';
    a.innerHTML = `<div class="crm-nav-link-main">${link.icon} <span>${label}</span></div>${badgeHtml}`;
    if (link.page === currentPage) {
      a.setAttribute('aria-current', 'page');
      a.classList.add('is-active');
    }
    hasil.push(a);
    return hasil;
  }));
  container.hidden = tautan.length === 0;
  // Wali dan santri hanya punya satu menu: di desktop sidebar disembunyikan supaya konten memakai lebar penuh.
  document.documentElement.classList.toggle('is-nav-tunggal', tautan.length <= 1);

  // Update CRM User Profile Card if elements exist on page
  if (account) {
    updateCrmUserBadges(account);
  }
}

function updateCrmUserBadges(account) {
  const avatarEl = document.querySelector('#crm-user-avatar');
  const nameEl = document.querySelector('#crm-user-name');
  const rolePillEl = document.querySelector('#crm-user-role-pill');
  const headerRoleEl = document.querySelector('#crm-header-role');
  const topAvatarEl = document.querySelector('#crm-topbar-avatar');
  const topNameEl = document.querySelector('#crm-topbar-name');

  if (avatarEl) avatarEl.textContent = getInitials(account.name);
  if (nameEl) nameEl.textContent = account.name;
  if (topAvatarEl) topAvatarEl.textContent = getInitials(account.name);
  if (topNameEl) topNameEl.textContent = account.name;
  const displayRole = ROLE_DISPLAY_NAMES[account.role] || account.role;
  if (rolePillEl) {
    rolePillEl.textContent = displayRole;
    rolePillEl.className = `crm-user-role-pill crm-user-role-pill--${account.role}`;
  }
  if (headerRoleEl) {
    headerRoleEl.textContent = displayRole;
    headerRoleEl.className = `crm-role-chip crm-role-chip--${account.role}`;
  }
}

// Perpindahan antarhalaman konsol tidak lagi ditahan JavaScript. Dulu setiap klik
// tautan dicegat, halaman dipudarkan sampai kosong, lalu baru pindah 180 ms kemudian,
// sehingga setiap pindah menu terasa memuat. Transisinya kini ditangani browser lewat
// View Transitions di portal.css, dan halaman tujuan disiapkan lebih dulu lewat
// Speculation Rules (server/http/speculation-rules.js).
